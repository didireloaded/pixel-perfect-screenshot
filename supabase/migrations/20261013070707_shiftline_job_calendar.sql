-- Date-based job plans are independent of attendance shifts and timed field assignments.
create table public.sl_calendar_jobs (
 id uuid primary key, company_id uuid not null references public.sl_companies,
 date date not null, title text not null check(length(title) between 1 and 100),
 details text not null check(length(details) between 1 and 4000),
 employee_ids uuid[] not null default '{}', created_by uuid not null references public.sl_employees,
 created_at timestamptz not null default now()
);
create index sl_calendar_jobs_company_date on public.sl_calendar_jobs(company_id,date);
alter table public.sl_calendar_jobs enable row level security;
revoke all on public.sl_calendar_jobs from anon,authenticated;
alter function shiftline_private.snapshot() rename to snapshot_before_job_calendar;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; me public.sl_employees;
begin
 base:=shiftline_private.snapshot_before_job_calendar();
 if coalesce((base->>'onboarding')::boolean,false) then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then return base; end if;
 return base||jsonb_build_object('calendarJobs',coalesce((select jsonb_agg(jsonb_build_object(
  'id',j.id,'date',j.date,'title',j.title,'details',j.details,'employeeIds',j.employee_ids,
  'assignedNames',coalesce((select jsonb_agg(e.name order by e.name) from public.sl_employees e where e.company_id=me.company_id and e.id=any(j.employee_ids)),'[]'::jsonb)
 ) order by j.date,j.created_at,j.id) from public.sl_calendar_jobs j where j.company_id=me.company_id),'[]'::jsonb));
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_job_calendar;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; ids uuid[]; job_id uuid; day date; heading text; body text; previous public.sl_calendar_jobs;
begin
 if p_action is distinct from 'create_calendar_job' then return shiftline_private.command_before_job_calendar(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','date','title','details','employeeIds')) then raise exception 'Invalid job payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Manager access required' using errcode='42501'; end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.role<>'manager' or me.access_status<>'active' then raise exception 'Manager access required' using errcode='42501'; end if;
 if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(p_data->'employeeIds') is distinct from 'array' then raise exception 'Choose a date and valid employees'; end if;
 job_id:=(p_data->>'id')::uuid; day:=(p_data->>'date')::date;
 heading:=trim(p_data->>'title'); body:=trim(p_data->>'details');
 if job_id is null or heading is null or length(heading) not between 1 and 100 or body is null or length(body) not between 1 and 4000 then raise exception 'Enter a job title and details'; end if;
 select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into ids from jsonb_array_elements_text(p_data->'employeeIds');
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.sl_employees e where e.id=id and e.company_id=me.company_id and e.role='employee' and e.access_status='active')) then raise exception 'Choose active employees from your company'; end if;
 select * into previous from public.sl_calendar_jobs where id=job_id;
 if previous.id is not null then
  if previous.company_id<>me.company_id or previous.date<>day or previous.title<>heading or previous.details<>body or previous.employee_ids<>ids then raise exception 'Job ID conflict'; end if;
 else
  insert into public.sl_calendar_jobs(id,company_id,date,title,details,employee_ids,created_by) values(job_id,me.company_id,day,heading,body,ids,me.id);
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'calendar_job_created',jsonb_build_object('jobId',job_id));
 end if;
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot(),'duplicate',previous.id is not null);
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_job_calendar(),shiftline_private.command(text,jsonb),shiftline_private.command_before_job_calendar(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
