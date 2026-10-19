-- Planning and employee responses are separate from attendance evidence.
create table public.sl_job_responses (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies(id),
 job_id uuid not null references public.sl_calendar_jobs(id), employee_id uuid not null references public.sl_employees(id),
 response text not null check(response in ('seen','available','conflict')), note text not null default '' check(length(note)<=1000),
 created_at timestamptz not null default clock_timestamp()
);
create index sl_job_responses_lookup on public.sl_job_responses(company_id,job_id,employee_id,created_at desc);
create index sl_job_responses_job on public.sl_job_responses(job_id);
create index sl_job_responses_employee on public.sl_job_responses(employee_id);
create table public.sl_job_reporting_times (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies(id),
 job_id uuid not null references public.sl_calendar_jobs(id), employee_id uuid not null references public.sl_employees(id),
 work_date date not null, expected_at timestamptz not null, created_by uuid not null references public.sl_employees(id),
 created_at timestamptz not null default clock_timestamp(), unique(employee_id,work_date)
);
create index sl_job_reporting_company on public.sl_job_reporting_times(company_id);
create index sl_job_reporting_job on public.sl_job_reporting_times(job_id);
create index sl_job_reporting_creator on public.sl_job_reporting_times(created_by);
alter table public.sl_job_responses enable row level security;
alter table public.sl_job_reporting_times enable row level security;
revoke all on public.sl_job_responses, public.sl_job_reporting_times from public,anon,authenticated;
create function shiftline_private.job_expected_start(company uuid,employee uuid,day date) returns timestamptz
language sql stable set search_path='' as $$
 -- Eligibility is validated when saved. Later job completion or crew changes must
 -- never reinterpret the employee's accepted attendance expectation.
 select t.expected_at from public.sl_job_reporting_times t
 where t.company_id=company and t.employee_id=employee and t.work_date=day
$$;
revoke all on function shiftline_private.job_expected_start(uuid,uuid,date) from public,anon,authenticated;
create function shiftline_private.job_acknowledgements_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; job public.sl_calendar_jobs; co public.sl_companies; eid uuid; day date; expected timestamptz; answer text;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then raise exception 'Invalid job response'; end if;
 select * into job from public.sl_calendar_jobs where id=(payload->>'jobId')::uuid and company_id=me.company_id for update;
 if job.id is null or (me.role='employee' and cardinality(job.employee_ids)>0 and not me.id=any(job.employee_ids)) then raise exception 'Job unavailable' using errcode='42501'; end if;
 select * into co from public.sl_companies where id=me.company_id;
 if action='respond' then
  answer:=payload->>'response';
  if answer is null or answer not in ('seen','available','conflict') or length(coalesce(payload->>'note',''))>1000 then raise exception 'Choose a valid response'; end if;
  if job.completed_at is not null or job.end_date<(clock_timestamp() at time zone co.timezone)::date then raise exception 'This job has ended'; end if;
  if answer='conflict' and length(trim(coalesce(payload->>'note','')))=0 then raise exception 'Explain the conflict'; end if;
  insert into public.sl_job_responses(company_id,job_id,employee_id,response,note) values(me.company_id,job.id,me.id,answer,trim(coalesce(payload->>'note','')));
 elsif action='set_reporting_time' then
  if me.access_role not in ('owner','operations') then raise exception 'Operations access required' using errcode='42501'; end if;
  eid:=(payload->>'employeeId')::uuid; day:=(payload->>'date')::date; expected:=case when payload ? 'expectedLocal' then (payload->>'expectedLocal')::timestamp at time zone co.timezone else (payload->>'expectedAt')::timestamptz end;
  if eid is null or not eid=any(job.employee_ids) or not exists(select 1 from public.sl_employees where id=eid and company_id=me.company_id and access_status='active' and role='employee') then raise exception 'Choose an assigned active employee'; end if;
  if day is null or expected is null or day<job.date or day>job.end_date or (expected at time zone co.timezone)::date<>day or expected<=clock_timestamp() or job.completed_at is not null then raise exception 'Choose a future reporting time within this job'; end if;
  if not exists(select 1 from public.sl_punctuality_policies p where p.company_id=me.company_id and p.starts_on<=day and p.id=(select p2.id from public.sl_punctuality_policies p2 where p2.company_id=me.company_id and p2.starts_on<=day order by p2.starts_on desc,p2.revision desc limit 1) and p.enabled and eid=any(p.employee_ids) and extract(isodow from day)::integer=any(p.weekdays) and expected<(day+p.end_time) at time zone co.timezone) or expected>=(day+co.checkin_close_time) at time zone co.timezone then raise exception 'Reporting time must fall within enabled company attendance hours and check-in cutoff'; end if;
  -- Lock accepted expectations once their reporting time has arrived.
  if exists(select 1 from public.sl_job_reporting_times t where t.employee_id=eid and t.work_date=day and t.expected_at<=clock_timestamp()) then raise exception 'Past reporting expectations cannot be revised'; end if;
  insert into public.sl_job_reporting_times(company_id,job_id,employee_id,work_date,expected_at,created_by) values(me.company_id,job.id,eid,day,expected,me.id)
  on conflict(employee_id,work_date) do update set job_id=excluded.job_id,expected_at=excluded.expected_at,created_by=excluded.created_by,created_at=clock_timestamp();
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'job_reporting_time_set',payload);
  if day=(clock_timestamp() at time zone co.timezone)::date then perform shiftline_private.refresh_punctuality(me.company_id,day); end if;
 elsif action<>'list' then raise exception 'Unknown job response action'; end if;
 if action<>'list' and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Job response refresh unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('timezone',co.timezone,'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'name',e.name,'response',r.response,'note',r.note,'createdAt',r.created_at) order by r.created_at desc) from public.sl_job_responses r join public.sl_employees e on e.id=r.employee_id where r.company_id=me.company_id and r.job_id=job.id and (me.role<>'employee' or r.employee_id=me.id)),'[]'::jsonb),
 'reportingTimes',coalesce((select jsonb_agg(jsonb_build_object('employeeId',t.employee_id,'date',t.work_date,'expectedAt',t.expected_at)) from public.sl_job_reporting_times t where t.company_id=me.company_id and t.job_id=job.id and (me.role<>'employee' or t.employee_id=me.id)),'[]'::jsonb));
end $$;
create function public.sl_job_acknowledgements(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.job_acknowledgements_api(action,payload) $$;
revoke all on function public.sl_job_acknowledgements(text,jsonb),shiftline_private.job_acknowledgements_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_job_acknowledgements(text,jsonb),shiftline_private.job_acknowledgements_api(text,jsonb) to authenticated;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('shiftline_private.refresh_punctuality(uuid,date,timestamptz)'::regprocedure);
 if position('due:=r.scheduled_at;' in definition)=0 then raise exception 'Punctuality reporting-time seam changed'; end if;
 execute replace(definition,'due:=r.scheduled_at;','due:=coalesce(shiftline_private.job_expected_start(company,r.employee_id,day),r.scheduled_at);');
end $$;
