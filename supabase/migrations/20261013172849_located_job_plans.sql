-- A company job is a plan. Attendance is linked only when a worker starts it.
alter table public.sl_calendar_jobs add column address text not null default '' check(length(address)<=200),
 add column latitude double precision check(latitude between -90 and 90),
 add column longitude double precision check(longitude between -180 and 180),
 add column radius_m integer not null default 150 check(radius_m between 100 and 5000),
 add constraint sl_calendar_job_coordinate_pair check((latitude is null)=(longitude is null)),
 add constraint sl_calendar_job_tenant_key unique(id,company_id);
alter table public.sl_jobs add column calendar_job_id uuid,
 add constraint sl_job_plan_company foreign key(calendar_job_id,company_id) references public.sl_calendar_jobs(id,company_id),
 add constraint sl_job_plan_worker unique(calendar_job_id,employee_id);
create index sl_job_plan_reference on public.sl_jobs(calendar_job_id,company_id);
alter table public.sl_jobs drop constraint sl_jobs_instructions_check;
alter table public.sl_jobs add constraint sl_jobs_instructions_check check(length(instructions)<=4000);

alter function shiftline_private.snapshot() rename to snapshot_before_located_plans;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; me public.sl_employees;
begin
 base:=shiftline_private.snapshot_before_located_plans(); if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object('calendarJobs',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'date',p.date,'title',p.title,'details',p.details,'employeeIds',p.employee_ids,
 'assignedNames',coalesce((select jsonb_agg(e.name order by e.name) from public.sl_employees e where e.company_id=p.company_id and e.id=any(p.employee_ids)),'[]'),
 'address',p.address,'latitude',p.latitude,'longitude',p.longitude,'radiusM',p.radius_m
 ) order by p.date,p.created_at,p.id) from public.sl_calendar_jobs p where p.company_id=me.company_id),'[]'),
 'jobs',coalesce((select jsonb_agg(j||jsonb_build_object('calendarJobId',(select calendar_job_id from public.sl_jobs where id=(j->>'id')::uuid))) from jsonb_array_elements(base->'jobs') j),'[]'));
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_located_plans;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; plan public.sl_calendar_jobs; sh public.sl_shifts; job public.sl_jobs;
 result jsonb; lat double precision; lon double precision; radius integer; v_address text; existed boolean; rid uuid;
begin
 if p_action not in ('create_calendar_job','start_calendar_job') then return shiftline_private.command_before_located_plans(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid job payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your workplace first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Manager approval required' using errcode='42501'; end if;
 if p_action='create_calendar_job' then
  if me.role<>'manager' then raise exception 'Manager access required'; end if;
  lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision;
  radius:=coalesce((p_data->>'radiusM')::integer,150); v_address:=coalesce(trim(p_data->>'address'),'');
  if (lat is null)<>(lon is null) or (lat is not null and (v_address='' or not(lat between -90 and 90) or not(lon between -180 and 180))) or length(v_address)>200 or radius not between 100 and 5000 then raise exception 'Check job address and coordinates'; end if;
  select exists(select 1 from public.sl_calendar_jobs where id=(p_data->>'id')::uuid) into existed;
  result:=shiftline_private.command_before_located_plans(p_action,p_data-array['address','latitude','longitude','radiusM']);
  select * into plan from public.sl_calendar_jobs where id=(p_data->>'id')::uuid and company_id=me.company_id;
  if existed then
   if plan.address<>v_address or plan.latitude is distinct from lat or plan.longitude is distinct from lon or plan.radius_m<>radius then raise exception 'Job location ID conflict'; end if;
  else
   update public.sl_calendar_jobs set address=v_address,latitude=lat,longitude=lon,radius_m=radius where id=plan.id;
  end if;
 else
  if me.role<>'employee' then raise exception 'Worker access required'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','calendarJobId')) then raise exception 'Invalid job start payload'; end if;
  rid:=(p_data->>'id')::uuid; if rid is null then raise exception 'Event ID required'; end if;
  select * into plan from public.sl_calendar_jobs where id=(p_data->>'calendarJobId')::uuid and company_id=me.company_id;
  if plan.id is null or (cardinality(plan.employee_ids)>0 and not me.id=any(plan.employee_ids)) then raise exception 'This job is not available to you'; end if;
  select * into job from public.sl_jobs where calendar_job_id=plan.id and employee_id=me.id;
  if exists(select 1 from public.sl_events where id=rid) then
   if not exists(select 1 from public.sl_events where id=rid and employee_id=me.id and type='start_job' and job_id=job.id) then raise exception 'Event ID conflict'; end if;
   return jsonb_build_object('snapshot',shiftline_private.snapshot(),'duplicate',true);
  end if;
  if plan.date<>(clock_timestamp() at time zone co.timezone)::date then raise exception 'Start the job on its planned date'; end if;
  select * into sh from public.sl_shifts where employee_id=me.id and date=plan.date for update;
  if sh.id is null or shiftline_private.state(sh.id)<>'working' then raise exception 'Clock in and return from breaks before starting this job'; end if;
  if plan.latitude is null or plan.address='' then raise exception 'The manager must confirm this job location first'; end if;
  if job.id is null then
   insert into public.sl_jobs(id,company_id,employee_id,shift_id,title,instructions,destination,supervisor,start_time,end_time,latitude,longitude,radius_m,calendar_job_id)
    values(gen_random_uuid(),me.company_id,me.id,sh.id,plan.title,plan.details,plan.address,'',sh.start_time,sh.end_time,plan.latitude,plan.longitude,plan.radius_m,plan.id) returning * into job;
  end if;
  result:=shiftline_private.command_before_located_plans('transition',jsonb_build_object('id',rid,'type','start_job','jobId',job.id));
 end if;
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return coalesce(result,'{}')||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_located_plans(),shiftline_private.command(text,jsonb),shiftline_private.command_before_located_plans(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
