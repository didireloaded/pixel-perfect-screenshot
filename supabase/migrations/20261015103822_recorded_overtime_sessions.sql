create table public.sl_overtime_sessions (
 id uuid primary key,
 company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees,
 shift_id uuid not null unique references public.sl_shifts,
 started_at timestamptz not null default clock_timestamp(),
 original_finish_at timestamptz not null,
 planned_finish_at timestamptz not null,
 ended_at timestamptz,
 requested_start_at timestamptz,
 request_reason text check(length(request_reason)<=1000),
 review_status text not null default 'none' check(review_status in ('none','pending','approved','declined')),
 reviewed_by uuid references public.sl_employees,
 reviewed_at timestamptz,
 check(planned_finish_at>started_at),
 check(ended_at is null or ended_at>=started_at),
 check(requested_start_at is null or requested_start_at<=started_at)
);
create index sl_overtime_company on public.sl_overtime_sessions(company_id);
create index sl_overtime_employee on public.sl_overtime_sessions(employee_id);
alter table public.sl_overtime_sessions enable row level security;
revoke all on public.sl_overtime_sessions from public,anon,authenticated;

create function shiftline_private.overtime_seconds(session public.sl_overtime_sessions) returns integer language sql stable set search_path='' as $$
 with intervals as (
  select type,captured_at,lead(captured_at,1,clock_timestamp()) over(order by captured_at,received_at,id) as until_at
  from public.sl_events where shift_id=session.shift_id
 ) select coalesce(floor(sum(greatest(0,extract(epoch from (
  least(until_at,coalesce(session.ended_at,clock_timestamp()),session.planned_finish_at)
  -greatest(captured_at,case when session.review_status='approved' then session.requested_start_at else session.started_at end)
 )))))::integer,0) from intervals where type in ('clock_in','end_lunch','start_job','end_job','end_personal')
$$;
revoke all on function shiftline_private.overtime_seconds(public.sl_overtime_sessions) from public,anon,authenticated;

create function shiftline_private.close_overtime() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.type='clock_out' then
  update public.sl_overtime_sessions set ended_at=greatest(started_at,new.captured_at)
   where shift_id=new.shift_id and ended_at is null;
 end if;
 return new;
end $$;
revoke all on function shiftline_private.close_overtime() from public,anon,authenticated;
create trigger sl_overtime_clockout after insert on public.sl_events for each row execute function shiftline_private.close_overtime();

alter function shiftline_private.snapshot() rename to snapshot_before_overtime_sessions;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; me public.sl_employees;
begin
 result:=shiftline_private.snapshot_before_overtime_sessions();
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then return result; end if;
 return result||jsonb_build_object(
 'messageContacts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'team',team,'jobTitle',job_title,'role',role) order by name)
  from public.sl_employees where company_id=me.company_id and id<>me.id and access_status='active' and
  (me.role='manager' or role='manager' or lower(team) in ('hr','human resources','finance'))),'[]'),
 'overtimeSessions',coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'employeeId',s.employee_id,'shiftId',s.shift_id,'startedAt',s.started_at,'originalFinishAt',s.original_finish_at,
  'plannedFinishAt',s.planned_finish_at,'endedAt',s.ended_at,'requestedStartAt',s.requested_start_at,
  'requestReason',s.request_reason,'reviewStatus',s.review_status,'reviewedBy',s.reviewed_by,'reviewedAt',s.reviewed_at,
  'recordedSeconds',shiftline_private.overtime_seconds(s)) order by s.started_at desc)
  from public.sl_overtime_sessions s where s.company_id=me.company_id and (me.role='manager' or s.employee_id=me.id)),'[]'));
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_overtime_sessions;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; session public.sl_overtime_sessions;
 finish timestamp; target_start timestamptz; ending time; offset_days integer; reviewer record; result jsonb;
begin
 if p_action not in ('start_overtime','finish_overtime','request_overtime_start','review_overtime_start','submit_timesheet') then
  return shiftline_private.command_before_overtime_sessions(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid overtime payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active workplace access required' using errcode='42501'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=me.company_id for update;
 if sh.id is null then raise exception 'Unknown workday'; end if;
 select * into session from public.sl_overtime_sessions where shift_id=sh.id for update;
 if p_action='review_overtime_start' then
  if me.access_role<>'owner' or not me.payroll_admin or sh.employee_id=me.id then raise exception 'Independent payroll owner review required' using errcode='42501'; end if;
 elsif sh.employee_id<>me.id then raise exception 'Only your own workday is available' using errcode='42501'; end if;
 if p_action='submit_timesheet' then
  if session.id is not null and (session.review_status='pending' or coalesce((p_data->>'overtimeMinutes')::integer,0)>shiftline_private.overtime_seconds(session)/60) then
   raise exception 'Resolve the overtime start review and request only recorded overtime minutes'; end if;
  return shiftline_private.command_before_overtime_sessions(p_action,p_data);
 end if;
 if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date)
  or exists(select 1 from public.sl_timesheets where shift_id=sh.id and status<>'open') then raise exception 'This workday is submitted or locked'; end if;
 if p_action='start_overtime' then
  if exists(select 1 from public.sl_submissions where shift_id=sh.id and status='needs_review') then raise exception 'Resolve the attendance conflict before starting overtime'; end if;
  if session.id is not null then
   if session.id<>(p_data->>'id')::uuid then raise exception 'Overtime already started'; end if;
   return jsonb_build_object('duplicate',true,'snapshot',shiftline_private.snapshot());
  end if;
  if (p_data->>'id')::uuid is null then raise exception 'Overtime ID required'; end if;
  if shiftline_private.state(sh.id) not in ('working','on_job') then raise exception 'Return to work before starting overtime'; end if;
  if clock_timestamp()<shiftline_private.workday_finish(sh,co.timezone) then raise exception 'Overtime starts after your planned finish'; end if;
  if coalesce(p_data->>'expectedEnd','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_data->>'finishDay','') not in ('today','tomorrow') then raise exception 'Choose an overtime finish today or tomorrow'; end if;
  ending:=(p_data->>'expectedEnd')::time;
  offset_days:=case when p_data->>'finishDay'='tomorrow' then 1 else 0 end;
  finish:=(clock_timestamp() at time zone co.timezone)::date+offset_days+ending;
  if (finish at time zone co.timezone)<=clock_timestamp() or (finish at time zone co.timezone)>shiftline_private.workday_start(sh,co.timezone)+interval '24 hours'
   or finish>sh.date+sh.start_time+interval '24 hours' then raise exception 'Overtime must finish within the 24-hour workday'; end if;
  insert into public.sl_overtime_sessions(id,company_id,employee_id,shift_id,original_finish_at,planned_finish_at)
   values((p_data->>'id')::uuid,co.id,me.id,sh.id,shiftline_private.workday_finish(sh,co.timezone),finish at time zone co.timezone);
  update public.sl_shifts set finish_date=finish::date,end_time=ending where id=sh.id;
 elsif session.id is null then raise exception 'Start overtime first';
 elsif p_action='finish_overtime' then
  if session.ended_at is not null then return jsonb_build_object('duplicate',true,'snapshot',shiftline_private.snapshot()); end if;
  result:=shiftline_private.command_before_overtime_sessions('transition',jsonb_build_object('id',(p_data->>'id')::uuid,'type','clock_out'));
 elsif p_action='request_overtime_start' then
  if session.review_status<>'none' then raise exception 'An earlier start has already been requested'; end if;
  target_start:=(p_data->>'startedAt')::timestamptz;
  if target_start is null or target_start<session.original_finish_at or target_start>=session.started_at
   or length(trim(coalesce(p_data->>'reason',''))) not between 1 and 1000 then raise exception 'Choose an earlier overtime start with a reason'; end if;
  update public.sl_overtime_sessions set requested_start_at=target_start,request_reason=trim(p_data->>'reason'),review_status='pending' where id=session.id;
  for reviewer in select id from public.sl_employees where company_id=co.id and access_role='owner' and payroll_admin and access_status='active' and id<>me.id loop
   perform shiftline_private.notify_employee(reviewer.id,'overtime-start:'||session.id,'Overtime start needs review','/manager?tab=Attendance');
  end loop;
 else
  if session.review_status<>'pending' or p_data->>'decision' not in ('approved','declined') then raise exception 'Choose approve or decline for the pending start request'; end if;
  update public.sl_overtime_sessions set review_status=p_data->>'decision',reviewed_by=me.id,reviewed_at=clock_timestamp() where id=session.id;
  perform shiftline_private.notify_employee(session.employee_id,'overtime-review:'||session.id,'Your overtime start was reviewed','/?view=hours');
 end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,jsonb_build_object('shiftId',sh.id));
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||co.id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return coalesce(result,'{}')||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_overtime_sessions(),shiftline_private.command(text,jsonb),shiftline_private.command_before_overtime_sessions(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
