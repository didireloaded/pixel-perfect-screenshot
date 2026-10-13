-- A worker starts their own attendance day. Planning is optional; evidence remains immutable.
alter function shiftline_private.command(text,jsonb) rename to command_before_employee_clockin;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts;
 local_now timestamp; ends time; starts time; lunch time; result jsonb;
begin
 if p_action is distinct from 'start_workday' then
  return shiftline_private.command_before_employee_clockin(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','expectedEnd','location')) then
  raise exception 'Invalid clock-in payload';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your workplace first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 if (p_data->>'id')::uuid is null then raise exception 'Clock-in ID is required'; end if;
 -- Retry the original event even after the clock or calendar changes.
 if exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid) then
  if not exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid and employee_id=me.id and type='clock_in') then raise exception 'Event ID conflict'; end if;
  return jsonb_build_object('duplicate',true,'status','synced','snapshot',shiftline_private.snapshot());
 end if;
 local_now:=clock_timestamp() at time zone co.timezone;
 if exists(select 1 from public.sl_periods where company_id=co.id and local_now::date between start_date and end_date) then raise exception 'This attendance period is locked'; end if;
 select * into sh from public.sl_shifts where employee_id=me.id and date=local_now::date for update;
 if coalesce(p_data->>'expectedEnd','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose when you expect to finish today'; end if;
  ends:=(p_data->>'expectedEnd')::time;
  starts:=date_trunc('minute',local_now)::time;
  if ends<=local_now::time then raise exception 'Expected finish must be later today'; end if;
 if sh.id is null then
  lunch:=greatest(starts,least('12:00'::time,(local_now::date+ends-interval '1 minute')::time));
  insert into public.sl_shifts(company_id,employee_id,site_id,date,start_time,end_time,lunch_time,lunch_minutes,regular_minutes,policy_version)
   values(co.id,me.id,me.site_id,local_now::date,starts,ends,lunch,60,480,co.current_policy_version) returning * into sh;
  insert into public.sl_timesheets(shift_id,company_id,employee_id) values(sh.id,co.id,me.id);
 else
  if shiftline_private.state(sh.id)<>'not_clocked_in' then raise exception 'INVALID_TRANSITION: already checked in for today'; end if;
  if exists(select 1 from public.sl_events where shift_id=sh.id)
   or exists(select 1 from public.sl_submissions where shift_id=sh.id)
   or exists(select 1 from public.sl_corrections where shift_id=sh.id)
   or exists(select 1 from public.sl_timesheets where shift_id=sh.id and status<>'open') then
   raise exception 'Recorded attendance must be reviewed before changing this workday';
  end if;
  if exists(select 1 from public.sl_jobs where shift_id=sh.id and end_time>ends) then
   raise exception 'Expected finish must include your assigned jobs';
  end if;
  update public.sl_shifts set start_time=least(start_time,starts),end_time=ends,
   lunch_time=greatest(least(start_time,starts),least(lunch_time,(local_now::date+ends-interval '1 minute')::time)) where id=sh.id;
 end if;
 result:=shiftline_private.command_before_employee_clockin('transition',
  (p_data-'expectedEnd')||jsonb_build_object('type','clock_in'));
 return result;
end $$;
revoke all on function shiftline_private.command(text,jsonb),shiftline_private.command_before_employee_clockin(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
