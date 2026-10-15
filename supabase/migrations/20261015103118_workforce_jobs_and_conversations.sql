-- Job plans span dates; actual work remains attached to each recorded workday.
alter table public.sl_calendar_jobs add column end_date date,
 add column return_to_office boolean not null default true,
 add column lunch_guidance text not null default '' check(length(lunch_guidance)<=1000),
 add column completed_at timestamptz;
update public.sl_calendar_jobs set end_date=date;
create function shiftline_private.default_job_end_date() returns trigger language plpgsql set search_path='' as $$
begin new.end_date:=coalesce(new.end_date,new.date); return new; end $$;
revoke all on function shiftline_private.default_job_end_date() from public,anon,authenticated;
create trigger sl_job_end_date before insert on public.sl_calendar_jobs for each row execute function shiftline_private.default_job_end_date();
alter table public.sl_calendar_jobs alter column end_date set not null;
alter table public.sl_calendar_jobs add constraint sl_job_plan_dates check(end_date>=date);
alter table public.sl_jobs drop constraint sl_job_plan_worker;
alter table public.sl_jobs add constraint sl_job_plan_workday unique(calendar_job_id,employee_id,shift_id);

alter function shiftline_private.worker_register(uuid,uuid,text,jsonb) rename to worker_register_before_title;
create function shiftline_private.worker_register(p_user_id uuid,p_company_id uuid,p_no text,p_profile jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; title text:=trim(coalesce(p_profile->>'jobTitle',''));
begin
 if length(title)>100 then raise exception 'Job title must be at most 100 characters'; end if;
 result:=shiftline_private.worker_register_before_title(p_user_id,p_company_id,p_no,p_profile);
 update public.sl_employees set job_title=title where user_id=p_user_id and company_id=p_company_id;
 return result;
end $$;
revoke all on function shiftline_private.worker_register(uuid,uuid,text,jsonb),shiftline_private.worker_register_before_title(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.worker_register(uuid,uuid,text,jsonb) to service_role;

alter function shiftline_private.snapshot() rename to snapshot_before_workforce_jobs;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; me public.sl_employees;
begin
 result:=shiftline_private.snapshot_before_workforce_jobs();
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then return result; end if;
 result:=jsonb_set(result,'{calendarJobs}',coalesce((select jsonb_agg(item||jsonb_build_object(
  'endDate',p.end_date,'returnToOffice',p.return_to_office,'lunchGuidance',p.lunch_guidance,'completedAt',p.completed_at))
  from jsonb_array_elements(result->'calendarJobs') item join public.sl_calendar_jobs p
  on p.id=(item->>'id')::uuid and p.company_id=me.company_id),'[]'));
 return result;
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_workforce_jobs;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; root public.sl_messages; plan public.sl_calendar_jobs;
 co public.sl_companies; sh public.sl_shifts; job public.sl_jobs; result jsonb; rid uuid; day date;
 ending date; office_return boolean; guidance text; previous boolean; lat double precision; lon double precision;
 crew uuid[]; heading text; instructions text; destination text; radius integer;
begin
 if p_action not in ('setup','send_message','reply_message','create_calendar_job','start_calendar_job','complete_calendar_job') then
  return shiftline_private.command_before_workforce_jobs(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid command payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if p_action='setup' then
  lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision;
  if (lat is null)<>(lon is null) or (lat is not null and (not(lat between -29.5 and -16.5) or not(lon between 11 and 26))) then
   raise exception 'Confirm your workplace location in Namibia'; end if;
  result:=shiftline_private.command_before_workforce_jobs(p_action,p_data-array['latitude','longitude']);
  if lat is not null then
   update public.sl_sites set latitude=lat,longitude=lon where id=(select site_id from public.sl_employees where user_id=auth.uid())
    and company_id=(select company_id from public.sl_employees where user_id=auth.uid());
  end if;
 else
  if me.id is null or me.access_status<>'active' then raise exception 'Active workplace access required' using errcode='42501'; end if;
  select * into co from public.sl_companies where id=me.company_id for update;
  if p_action in ('send_message','reply_message') then
   if p_action='reply_message' then
    select * into root from public.sl_messages where id=(p_data->>'threadId')::uuid and company_id=me.company_id and thread_id is null;
    if root.id is null or me.id not in (root.sender_id,root.recipient_id) then raise exception 'Conversation unavailable'; end if;
    select * into target from public.sl_employees where id=case when me.id=root.sender_id then root.recipient_id else root.sender_id end and company_id=me.company_id and access_status='active';
   else
    select * into target from public.sl_employees where id=(p_data->>'recipientId')::uuid and company_id=me.company_id and access_status='active';
   end if;
   if target.id is null or target.id=me.id then raise exception 'Choose an active company contact'; end if;
   if p_action='send_message' and me.access_role='worker' and target.role<>'manager' and lower(target.team) not in ('hr','human resources','finance') then
    raise exception 'Choose a manager, HR or finance contact'; end if;
   if length(trim(coalesce(p_data->>'body',''))) not between 1 and 2000 then raise exception 'Message must be 1 to 2000 characters'; end if;
   if p_action='send_message' and length(trim(coalesce(p_data->>'title',''))) not between 1 and 100 then raise exception 'Enter a subject (up to 100 characters)'; end if;
   insert into public.sl_messages(company_id,sender_id,recipient_id,title,body,thread_id)
   values(me.company_id,me.id,target.id,case when p_action='reply_message' then root.title else trim(p_data->>'title') end,
    trim(p_data->>'body'),case when p_action='reply_message' then root.id else null end);
  elsif p_action='create_calendar_job' then
   if me.access_role not in ('owner','operations') then raise exception 'Manager access required' using errcode='42501'; end if;
   ending:=coalesce((p_data->>'endDate')::date,(p_data->>'date')::date);
   office_return:=coalesce((p_data->>'returnToOffice')::boolean,true); guidance:=trim(coalesce(p_data->>'lunchGuidance',''));
   if ending<(p_data->>'date')::date or length(guidance)>1000 then raise exception 'Check job dates and lunch guidance'; end if;
   rid:=(p_data->>'id')::uuid; day:=(p_data->>'date')::date;
   heading:=trim(coalesce(p_data->>'title','')); instructions:=trim(coalesce(p_data->>'details',''));
   destination:=trim(coalesce(p_data->>'address','')); radius:=coalesce((p_data->>'radiusM')::integer,150);
   lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision;
   if rid is null or day is null or ending is null or length(heading) not between 1 and 100 or length(instructions) not between 1 and 4000 then raise exception 'Enter job dates, title and details'; end if;
   if length(destination)>200 or radius not between 100 and 5000 or (lat is null)<>(lon is null)
    or (lat is not null and (destination='' or not(lat between -90 and 90) or not(lon between -180 and 180))) then raise exception 'Check job address and coordinates'; end if;
   if jsonb_typeof(p_data->'employeeIds')<>'array' then raise exception 'Choose assigned employees'; end if;
   select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into crew from jsonb_array_elements_text(p_data->'employeeIds');
   if exists(select 1 from unnest(crew) staff where not exists(select 1 from public.sl_employees where id=staff and company_id=me.company_id and access_status='active')) then raise exception 'Choose active employees from your company'; end if;
   select * into plan from public.sl_calendar_jobs where id=rid;
   if plan.id is not null then
    if plan.company_id<>me.company_id or plan.date<>day or plan.title<>heading or plan.details<>instructions or plan.employee_ids<>crew then raise exception 'Job ID conflict'; end if;
    if plan.address<>destination or plan.latitude is distinct from lat or plan.longitude is distinct from lon or plan.radius_m<>radius then raise exception 'Job location ID conflict'; end if;
    if plan.end_date<>ending or plan.return_to_office<>office_return or plan.lunch_guidance<>guidance then raise exception 'Job details ID conflict'; end if;
    result:=jsonb_build_object('duplicate',true);
   else
    insert into public.sl_calendar_jobs(id,company_id,date,end_date,title,details,employee_ids,created_by,address,latitude,longitude,radius_m,return_to_office,lunch_guidance)
    values(rid,me.company_id,day,ending,heading,instructions,crew,me.id,destination,lat,lon,radius,office_return,guidance);
   end if;
  elsif p_action='complete_calendar_job' then
   if me.access_role not in ('owner','operations') then raise exception 'Manager access required' using errcode='42501'; end if;
   update public.sl_calendar_jobs set completed_at=coalesce(completed_at,clock_timestamp()) where id=(p_data->>'id')::uuid and company_id=me.company_id;
   if not found then raise exception 'Unknown job'; end if;
  else
   rid:=(p_data->>'id')::uuid;
   if rid is null then raise exception 'Event ID required'; end if;
   select * into plan from public.sl_calendar_jobs where id=(p_data->>'calendarJobId')::uuid and company_id=me.company_id for share;
   if plan.id is null or (cardinality(plan.employee_ids)>0 and not me.id=any(plan.employee_ids)) then raise exception 'This job is not available to you'; end if;
   if exists(select 1 from public.sl_events where id=rid) then
    if not exists(select 1 from public.sl_events e join public.sl_jobs j on j.id=e.job_id where e.id=rid and e.employee_id=me.id and e.type='start_job' and j.calendar_job_id=plan.id) then raise exception 'Event ID conflict'; end if;
    return jsonb_build_object('snapshot',shiftline_private.snapshot(),'duplicate',true);
   end if;
   day:=(clock_timestamp() at time zone co.timezone)::date;
   if day not between plan.date and plan.end_date or plan.completed_at is not null then raise exception 'Start this job during its planned dates'; end if;
   select * into sh from public.sl_shifts where employee_id=me.id and shiftline_private.state(id)='working' order by date desc limit 1 for update;
   if sh.id is null then raise exception 'Clock in and return from breaks before starting this job'; end if;
   if plan.latitude is null or plan.address='' then raise exception 'The manager must confirm this job location first'; end if;
   select * into job from public.sl_jobs where calendar_job_id=plan.id and employee_id=me.id and shift_id=sh.id;
   if job.id is null then
    insert into public.sl_jobs(company_id,employee_id,shift_id,title,instructions,destination,supervisor,start_time,end_time,latitude,longitude,radius_m,calendar_job_id)
    values(me.company_id,me.id,sh.id,plan.title,plan.details,plan.address,'',sh.start_time,sh.end_time,plan.latitude,plan.longitude,plan.radius_m,plan.id) returning * into job;
   end if;
   result:=shiftline_private.command_before_workforce_jobs('transition',jsonb_build_object('id',rid,'type','start_job','jobId',job.id));
  end if;
 end if;
 if p_action<>'setup' then
 insert into public.sl_audit(company_id,actor,action,detail)
 select company_id,id,p_action,jsonb_build_object('source','workforce_workflow') from public.sl_employees where user_id=auth.uid();
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||(select company_id from public.sl_employees where user_id=auth.uid())::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 end if;
 return coalesce(result,'{}')||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_workforce_jobs(),shiftline_private.command(text,jsonb),shiftline_private.command_before_workforce_jobs(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
