create table public.sl_punctuality_policies (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null,
 starts_on date not null, enabled boolean not null, weekdays integer[] not null,
 start_time time not null, end_time time not null, employee_ids uuid[] not null,
 foreign key(created_by,company_id) references public.sl_employees(id,company_id),
 check(end_time>start_time),
 check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
 check(not enabled or cardinality(employee_ids)>0), unique(id,company_id)
);
create index sl_punctuality_policy_company on public.sl_punctuality_policies(company_id,starts_on,created_at);
create index sl_punctuality_policy_creator on public.sl_punctuality_policies(created_by,company_id);
create table public.sl_punctuality_records (
 id uuid primary key default gen_random_uuid(), company_id uuid not null,
 employee_id uuid not null, work_date date not null, policy_id uuid not null,
 timezone text not null, scheduled_at timestamptz not null, expected_at timestamptz not null, ends_at timestamptz not null,
 clock_in_at timestamptz, original_clock_in_at timestamptz, late_seconds integer,
 status text not null default 'expected' check(status in ('expected','no_checkin','on_time','late','excused')),
 exemption text, reminder_stage integer not null default 0 check(reminder_stage in (0,5,20)),
 unique(employee_id,work_date),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id),
 foreign key(policy_id,company_id) references public.sl_punctuality_policies(id,company_id),
 check(late_seconds is null or late_seconds>=0)
);
create index sl_punctuality_company_date on public.sl_punctuality_records(company_id,work_date);
create index sl_punctuality_record_employee on public.sl_punctuality_records(employee_id,company_id);
create index sl_punctuality_record_policy on public.sl_punctuality_records(policy_id,company_id);
alter table public.sl_punctuality_policies enable row level security;
alter table public.sl_punctuality_records enable row level security;
revoke all on public.sl_punctuality_policies,public.sl_punctuality_records from public,anon,authenticated;
create trigger sl_punctuality_policy_immutable before update or delete on public.sl_punctuality_policies
for each row execute function shiftline_private.immutable();

create function shiftline_private.refresh_punctuality(company uuid,day date,at_time timestamptz default clock_timestamp()) returns void
language plpgsql security definer set search_path='' as $$
declare policy public.sl_punctuality_policies; co public.sl_companies; r public.sl_punctuality_records;
 due timestamptz; leave_end timestamptz; arrival timestamptz; v_exemption text; stage integer;
begin
 select * into co from public.sl_companies where id=company for update;
 select * into policy from public.sl_punctuality_policies where company_id=company and starts_on<=day
 order by starts_on desc,created_at desc,id desc limit 1;
 if day=(at_time at time zone co.timezone)::date and policy.enabled and extract(isodow from day)::integer=any(policy.weekdays) then
  insert into public.sl_punctuality_records(company_id,employee_id,work_date,policy_id,timezone,scheduled_at,expected_at,ends_at)
  select company,e.id,day,policy.id,co.timezone,(day+policy.start_time) at time zone co.timezone,
   (day+policy.start_time) at time zone co.timezone,(day+policy.end_time) at time zone co.timezone
  from public.sl_employees e where e.company_id=company and e.id=any(policy.employee_ids)
   and e.access_status='active' and e.role='employee' and e.user_id is not null
  on conflict(employee_id,work_date) do nothing;
 end if;
 for r in select * from public.sl_punctuality_records where company_id=company and work_date=day for update loop
  due:=r.scheduled_at; v_exemption:=null; arrival:=null;
  if exists(select 1 from public.sl_requests q where q.company_id=company and q.employee_id=r.employee_id
   and q.kind='leave' and q.status='approved' and day between q.leave_start and q.leave_end and q.leave_start_time is null) then
   v_exemption:='Approved leave';
  end if;
  -- Approved hourly leave covering the start moves the expected arrival to its end.
  loop
   select max((q.leave_end+q.leave_end_time) at time zone r.timezone) into leave_end
   from public.sl_requests q where q.company_id=company and q.employee_id=r.employee_id and q.kind='leave'
    and q.status='approved' and q.leave_start_time is not null
    and (q.leave_start+q.leave_start_time) at time zone r.timezone<=due
    and (q.leave_end+q.leave_end_time) at time zone r.timezone>due;
   exit when leave_end is null;
   due:=leave_end;
  end loop;
  if due>=r.ends_at then v_exemption:='Approved leave'; end if;
  -- Prior-day evidence overlapping today's start is work, not a missing arrival.
  if exists(select 1 from public.sl_shifts s where s.employee_id=r.employee_id and s.company_id=company
   and s.date=day-1 and shiftline_private.workday_finish(s,r.timezone)>due
   and exists(select 1 from shiftline_private.effective_events(s.id) e where e.type='clock_in' and e.captured_at<=due)
   and not exists(select 1 from shiftline_private.effective_events(s.id) e where e.type='clock_out' and e.captured_at<=due)) then
   v_exemption:='Overlapping overnight work';
  end if;
  select min(e.captured_at) into arrival from public.sl_shifts s
  cross join lateral shiftline_private.effective_events(s.id) e
  where s.company_id=company and s.employee_id=r.employee_id and s.date=day and e.type='clock_in';
  update public.sl_punctuality_records set expected_at=due,clock_in_at=arrival,
   original_clock_in_at=coalesce(original_clock_in_at,(select min(e.captured_at) from public.sl_events e join public.sl_shifts s on s.id=e.shift_id where s.employee_id=r.employee_id and s.date=day and e.type='clock_in')),
   late_seconds=case when arrival is not null and v_exemption is null then greatest(0,floor(extract(epoch from arrival-due)))::integer end,
   reminder_stage=case when expected_at is distinct from due then 0 else reminder_stage end,
   status=case when v_exemption is not null then 'excused' when arrival>due then 'late' when arrival is not null then 'on_time'
    when at_time>due then 'no_checkin' else 'expected' end,exemption=v_exemption
   where id=r.id;
  -- Remind only while the expected day is still open; a delayed run sends one stage.
  if v_exemption is null and arrival is null and at_time>=due+interval '5 minutes' and at_time<r.ends_at
   and exists(select 1 from public.sl_employees where id=r.employee_id and access_status='active') then
   stage:=case when at_time>=due+interval '20 minutes' then 20 else 5 end;
   if stage>(case when r.expected_at is distinct from due then 0 else r.reminder_stage end) then
    perform shiftline_private.notify_employee(r.employee_id,'punctuality:'||r.id||':'||stage||':'||floor(extract(epoch from due)),
     case when stage=5 then 'Your expected start has passed. Please check in if you are working.'
      else 'No check-in recorded today. Please check in or contact your manager.' end,'hours');
    update public.sl_punctuality_records set reminder_stage=stage where id=r.id;
   end if;
  end if;
 end loop;
end $$;
revoke all on function shiftline_private.refresh_punctuality(uuid,date,timestamptz) from public,anon,authenticated;

create function shiftline_private.punctuality_tick() returns void language plpgsql security definer set search_path='' as $$
declare co record;
begin
 for co in select distinct c.id,c.timezone from public.sl_companies c join public.sl_punctuality_policies p on p.company_id=c.id loop
  perform shiftline_private.refresh_punctuality(co.id,(clock_timestamp() at time zone co.timezone)::date);
 end loop;
end $$;
revoke all on function shiftline_private.punctuality_tick() from public,anon,authenticated;

create function shiftline_private.punctuality_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; day date; days integer[]; employees uuid[]; output jsonb;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>16384 then raise exception 'Invalid punctuality payload'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 day:=coalesce((payload->>'date')::date,(clock_timestamp() at time zone co.timezone)::date);
 if action='configure' then
  if me.access_role<>'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  select array_agg(distinct value::integer) into days from jsonb_array_elements_text(payload->'weekdays');
  select coalesce(array_agg(distinct value::uuid),'{}') into employees from jsonb_array_elements_text(payload->'employeeIds');
  if days is null or (payload->>'enabled')::boolean is null or (payload->>'start')::time is null or (payload->>'end')::time is null
   or exists(select 1 from unnest(employees) id where not exists(select 1 from public.sl_employees e where e.id=id and e.company_id=me.company_id and e.role='employee' and e.access_status='active' and e.user_id is not null)) then
   raise exception 'Choose valid company days, hours and employees'; end if;
  insert into public.sl_punctuality_policies(company_id,created_by,starts_on,enabled,weekdays,start_time,end_time,employee_ids)
  values(me.company_id,me.id,(clock_timestamp() at time zone co.timezone)::date+1,(payload->>'enabled')::boolean,days,
   (payload->>'start')::time,(payload->>'end')::time,employees);
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'punctuality_policy_saved',jsonb_build_object('startsOn',(clock_timestamp() at time zone co.timezone)::date+1));
 elsif action<>'list' then raise exception 'Unknown punctuality action'; end if;
 if day>(clock_timestamp() at time zone co.timezone)::date then raise exception 'Choose today or a past date'; end if;
 -- Refresh recorded evidence, including approved corrections, before presenting history.
 -- Reads of historical days never generate overdue notifications (outside the window).
 perform shiftline_private.refresh_punctuality(me.company_id,day);
 select jsonb_build_object('policy',(select jsonb_build_object('enabled',enabled,'weekdays',weekdays,'start',to_char(start_time,'HH24:MI'),
  'end',to_char(end_time,'HH24:MI'),'employeeIds',employee_ids,'startsOn',starts_on) from public.sl_punctuality_policies
  where company_id=me.company_id order by starts_on desc,created_at desc,id desc limit 1),
  'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'employeeId',employee_id,'date',work_date,
   'scheduledAt',scheduled_at,'expectedAt',expected_at,'clockInAt',clock_in_at,'originalClockInAt',original_clock_in_at,
   'lateSeconds',late_seconds,'status',status,'exemption',case when exemption is not null then 'Not expected at normal start' end) order by expected_at)
   from public.sl_punctuality_records where company_id=me.company_id and work_date=day
   and (me.access_role in ('owner','hr','operations') or employee_id=me.id)),'[]')) into output;
 -- Workers do not receive a company's policy roster.
 if me.access_role='worker' then output:=output-'policy'; end if;
 return output;
end $$;
create function public.sl_punctuality(action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select shiftline_private.punctuality_api(action,payload) $$;
revoke all on function public.sl_punctuality(text,jsonb),shiftline_private.punctuality_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_punctuality(text,jsonb),shiftline_private.punctuality_api(text,jsonb) to authenticated;

-- Stop queued reminders becoming stale while waiting for push delivery.
create function shiftline_private.punctuality_notification_current(source text) returns boolean language sql stable set search_path='' as $$
 select case when source not like 'punctuality:%' then true else exists(
  select 1 from public.sl_punctuality_records r where r.id::text=split_part(source,':',2)
   and r.status='no_checkin' and clock_timestamp()<r.ends_at
   and split_part(source,':',4)=floor(extract(epoch from r.expected_at))::text
   and not exists(select 1 from public.sl_shifts s cross join lateral shiftline_private.effective_events(s.id) e
    where s.employee_id=r.employee_id and s.date=r.work_date and e.type='clock_in')
   and not exists(select 1 from public.sl_requests q where q.employee_id=r.employee_id and q.kind='leave'
    and q.status='approved' and r.work_date between q.leave_start and q.leave_end
    and (q.leave_start_time is null or (q.leave_start+q.leave_start_time) at time zone r.timezone<=r.expected_at
     and (q.leave_end+q.leave_end_time) at time zone r.timezone>r.expected_at))
   and not exists(select 1 from public.sl_shifts s where s.employee_id=r.employee_id and s.date=r.work_date-1
    and shiftline_private.workday_finish(s,r.timezone)>r.expected_at
    and exists(select 1 from shiftline_private.effective_events(s.id) e where e.type='clock_in' and e.captured_at<=r.expected_at)
    and not exists(select 1 from shiftline_private.effective_events(s.id) e where e.type='clock_out' and e.captured_at<=r.expected_at))
 ) end
$$;
revoke all on function shiftline_private.punctuality_notification_current(text) from public,anon,authenticated;
do $$ declare definition text; begin
 select pg_get_functiondef('public.sl_push_batch()'::regprocedure) into definition;
 if position('s.active and e.access_status=''active''' in definition)=0 then raise exception 'Push delivery definition changed'; end if;
 execute replace(definition,'s.active and e.access_status=''active''','s.active and e.access_status=''active'' and shiftline_private.punctuality_notification_current(n.source)');
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.schedule('shiftline-punctuality-reminders','* * * * *','select shiftline_private.punctuality_tick()');
 end if;
end $$;
