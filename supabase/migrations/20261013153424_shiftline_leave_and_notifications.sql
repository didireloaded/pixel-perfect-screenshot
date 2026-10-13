alter table public.sl_requests add column leave_start date;
alter table public.sl_requests add column leave_end date;
alter table public.sl_requests add column leave_start_time time;
alter table public.sl_requests add column leave_end_time time;
alter table public.sl_requests add constraint sl_leave_range check (
 (leave_start is null and leave_end is null and leave_start_time is null and leave_end_time is null)
 or (kind='leave' and leave_start is not null and leave_end is not null and leave_end>=leave_start and (
 (leave_start_time is null and leave_end_time is null) or
 (leave_start=leave_end and leave_start_time is not null and leave_end_time is not null and leave_end_time>leave_start_time))));
create index sl_calendar_jobs_created_by on public.sl_calendar_jobs(created_by);
create table public.sl_manager_notification_reads (
 employee_id uuid not null references public.sl_employees,
 notification_id text not null, read_at timestamptz not null default clock_timestamp(),
 primary key(employee_id,notification_id)
);
alter table public.sl_manager_notification_reads enable row level security;
revoke all on public.sl_manager_notification_reads from anon,authenticated;
alter function shiftline_private.snapshot() rename to snapshot_before_leave_notifications;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; me public.sl_employees;
begin
 base:=shiftline_private.snapshot_before_leave_notifications();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then return base; end if;
 return base||jsonb_build_object('requests',coalesce((select jsonb_agg(item||jsonb_build_object(
  'leaveStart',r.leave_start,'leaveEnd',r.leave_end,'leaveStartTime',to_char(r.leave_start_time,'HH24:MI'),'leaveEndTime',to_char(r.leave_end_time,'HH24:MI')) order by r.submitted_at desc)
  from jsonb_array_elements(base->'requests') item join public.sl_requests r on r.id=(item->>'id')::uuid and r.company_id=me.company_id),'[]'::jsonb),
 'readNotificationIds',case when me.role='manager' then coalesce((select jsonb_agg(notification_id) from public.sl_manager_notification_reads where employee_id=me.id),'[]'::jsonb) else '[]'::jsonb end);
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_leave_notifications;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; first_day date; last_day date; starts time; ends time; rid uuid; nid text; category text; target uuid; previous public.sl_requests;
begin
 if p_action not in ('create_leave_request','read_manager_notification') then return shiftline_private.command_before_leave_notifications(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your company first'; end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Manager approval required' using errcode='42501'; end if;
 if p_action='create_leave_request' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','summary','detail','leaveStart','leaveEnd','leaveStartTime','leaveEndTime')) then raise exception 'Invalid leave payload'; end if;
  if coalesce(p_data->>'leaveStart','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'leaveEnd','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose leave dates'; end if;
  first_day:=(p_data->>'leaveStart')::date; last_day:=(p_data->>'leaveEnd')::date; rid:=(p_data->>'id')::uuid;
  if nullif(p_data->>'leaveStartTime','') is not null or nullif(p_data->>'leaveEndTime','') is not null then
   if coalesce(p_data->>'leaveStartTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_data->>'leaveEndTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose valid hourly leave times'; end if;
   starts:=(p_data->>'leaveStartTime')::time; ends:=(p_data->>'leaveEndTime')::time;
   if first_day<>last_day or ends<=starts then raise exception 'Hourly leave must end after it starts on the same day'; end if;
  end if;
  if rid is null or last_day<first_day or last_day-first_day>366 or coalesce(length(trim(p_data->>'summary')),0) not between 1 and 200 or coalesce(length(p_data->>'detail'),0)>1000 then raise exception 'Check leave dates and reason'; end if;
  select * into previous from public.sl_requests where id=rid;
  if previous.id is not null then
   if previous.employee_id<>me.id or previous.company_id<>me.company_id or previous.kind<>'leave' or previous.summary<>trim(p_data->>'summary') or previous.detail<>coalesce(p_data->>'detail','') or previous.leave_start is distinct from first_day or previous.leave_end is distinct from last_day or previous.leave_start_time is distinct from starts or previous.leave_end_time is distinct from ends then raise exception 'Leave ID conflict'; end if;
  else
   insert into public.sl_requests(id,company_id,employee_id,kind,summary,detail,leave_start,leave_end,leave_start_time,leave_end_time) values(rid,me.company_id,me.id,'leave',trim(p_data->>'summary'),coalesce(p_data->>'detail',''),first_day,last_day,starts,ends);
  end if;
 else
  if me.role<>'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k<>'id') then raise exception 'Invalid notification payload'; end if;
  nid:=p_data->>'id'; category:=split_part(nid,':',1); target:=split_part(nid,':',2)::uuid;
  if nid<>category||':'||target::text or not (
   (category='request' and exists(select 1 from public.sl_requests where id=target and company_id=me.company_id)) or
   (category='message' and exists(select 1 from public.sl_messages where id=target and company_id=me.company_id and recipient_id=me.id)) or
   (category='employee' and exists(select 1 from public.sl_employees where id=target and company_id=me.company_id and role='employee')) or
   (category='alert' and exists(select 1 from public.sl_site_alerts where id=target and company_id=me.company_id))) then raise exception 'Unknown notification'; end if;
  insert into public.sl_manager_notification_reads(employee_id,notification_id) values(me.id,nid) on conflict do nothing;
 end if;
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_leave_notifications(),shiftline_private.command(text,jsonb),shiftline_private.command_before_leave_notifications(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
