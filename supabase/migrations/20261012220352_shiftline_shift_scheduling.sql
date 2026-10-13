-- Keep one shift per employee/day. Replays are no-ops; edits are explicit,
-- concurrency-checked and cannot rewrite attendance or a frozen calculation.
-- Extend the current entry point so access approval and live updates stay intact.
create or replace function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; co public.sl_companies;
 sh public.sl_shifts; result jsonb; company text; decision text;
 desired jsonb; previous jsonb; day date; site uuid; starts time; ends time; lunch time;
 v_lunch_minutes integer; v_regular_minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_action is null or length(p_action) not between 1 and 64 or p_data is null
  or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then
  raise exception 'Invalid command payload';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is not null then
  select * into co from public.sl_companies where id=me.company_id for update;
  select * into me from public.sl_employees where id=me.id;
  if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 end if;
 if p_action in ('assign_shift','update_shift') then
  if me.id is null or me.role<>'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  -- Validate at the database boundary, including requests outside the web form.
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid shift date'; end if;
  if coalesce(p_data->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or coalesce(p_data->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or coalesce(p_data->>'lunch','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception 'Choose valid shift and lunch times';
  end if;
  if jsonb_typeof(p_data->'lunchMinutes') is distinct from 'number'
   or jsonb_typeof(p_data->'regularMinutes') is distinct from 'number'
   or coalesce(p_data->>'lunchMinutes','') !~ '^[0-9]+$'
   or coalesce(p_data->>'regularMinutes','') !~ '^[0-9]+$' then
   raise exception 'Lunch and regular work minutes must be whole numbers';
  end if;
  begin
   day:=(p_data->>'date')::date;
   site:=(p_data->>'siteId')::uuid;
   v_lunch_minutes:=(p_data->>'lunchMinutes')::integer;
   v_regular_minutes:=(p_data->>'regularMinutes')::integer;
   select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
   raise exception 'Choose a valid employee, site, date and work minutes';
  end;
  if target.id is null or not exists(select 1 from public.sl_sites where id=site and company_id=co.id) then
   raise exception 'Unknown employee or site';
  end if;
  if target.access_status<>'active' then raise exception 'Approve this employee before assigning a shift'; end if;
  starts:=(p_data->>'start')::time; ends:=(p_data->>'end')::time; lunch:=(p_data->>'lunch')::time;
  if ends<=starts then raise exception 'Shift end must be after shift start'; end if;
  if v_lunch_minutes not between 0 and 120 or v_regular_minutes not between 1 and 1440 then
   raise exception 'Lunch must be 0–120 minutes and regular work must be 1–1440 minutes';
  end if;
  if lunch<starts or lunch>=ends or day+lunch + make_interval(mins=>v_lunch_minutes)>day+ends then
   raise exception 'Lunch must fit inside the shift';
  end if;
  desired:=jsonb_build_object('employeeId',target.id,'siteId',site,'date',day,
   'start',p_data->>'start','end',p_data->>'end','lunch',p_data->>'lunch',
   'lunchMinutes',v_lunch_minutes,'regularMinutes',v_regular_minutes);
  if p_action='update_shift' then
   select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id for update;
   if sh.id is null then raise exception 'Shift is unavailable. Refresh the calendar.'; end if;
   if sh.employee_id<>target.id or sh.date<>day then raise exception 'A shift edit cannot change its employee or date'; end if;
  else
   select * into sh from public.sl_shifts where employee_id=target.id and date=day and company_id=co.id for update;
  end if;
  if sh.id is not null then
   previous:=jsonb_build_object('employeeId',sh.employee_id,'siteId',sh.site_id,'date',sh.date,
    'start',to_char(sh.start_time,'HH24:MI'),'end',to_char(sh.end_time,'HH24:MI'),
    'lunch',to_char(sh.lunch_time,'HH24:MI'),'lunchMinutes',sh.lunch_minutes,'regularMinutes',sh.regular_minutes);
   if previous=desired then
    result:=jsonb_build_object('shiftId',sh.id,'duplicate',true,'snapshot',shiftline_private.snapshot());
   elsif p_action='update_shift' and p_data->'expected' is distinct from previous then
    raise exception 'This shift changed since you opened it. Close and reopen it before saving.';
   end if;
  end if;
  if result is null then
   if exists(select 1 from public.sl_periods where company_id=co.id and day between start_date and end_date) then
    raise exception 'Payroll period is locked';
   end if;
   if sh.id is not null and p_action='assign_shift' then
    raise exception '% already has a shift on %. Open it in Calendar to edit the existing shift.',target.name,day;
   end if;
   if sh.id is not null then
    if exists(select 1 from public.sl_events where shift_id=sh.id)
     or exists(select 1 from public.sl_submissions where shift_id=sh.id)
     or exists(select 1 from public.sl_corrections where shift_id=sh.id)
     or exists(select 1 from public.sl_calculations where shift_id=sh.id)
     or exists(select 1 from public.sl_timesheets where shift_id=sh.id and status<>'open') then
     raise exception 'This shift has attendance or a submitted timesheet and cannot be edited. Use Corrections to review recorded time.';
    end if;
    if exists(select 1 from public.sl_jobs where shift_id=sh.id and (start_time<starts or end_time>ends)) then
     raise exception 'Assigned tasks must stay inside the shift. Adjust the task schedule first.';
    end if;
    update public.sl_shifts set site_id=site,start_time=starts,end_time=ends,lunch_time=lunch,
     lunch_minutes=v_lunch_minutes,regular_minutes=v_regular_minutes where id=sh.id;
   else
    insert into public.sl_shifts(company_id,employee_id,site_id,date,start_time,end_time,lunch_time,lunch_minutes,regular_minutes,policy_version)
     values(co.id,target.id,site,day,starts,ends,lunch,v_lunch_minutes,v_regular_minutes,co.current_policy_version) returning * into sh;
    insert into public.sl_timesheets(shift_id,company_id,employee_id) values(sh.id,co.id,target.id);
   end if;
   insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,
    jsonb_build_object('shiftId',sh.id,'before',previous,'after',desired,'policyVersion',sh.policy_version));
   result:=jsonb_build_object('shiftId',sh.id,'snapshot',shiftline_private.snapshot());
  end if;
 elsif p_action='review_worker_access' then
  if me.id is null or me.role<>'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  decision:=p_data->>'status';
  if decision is null or decision not in ('active','rejected') then raise exception 'Choose approve or reject'; end if;
  select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=me.company_id and role='employee' and login_method='code' for update;
  if target.id is null or target.access_status='active' then raise exception 'Registration is unavailable or already approved'; end if;
  if p_data->>'expectedStatus' is distinct from target.access_status then raise exception 'Registration changed. Refresh and try again.'; end if;
  update public.sl_employees set access_status=decision where id=target.id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('employeeId',target.id,'status',decision));
  result:=jsonb_build_object('snapshot',shiftline_private.snapshot());
 else return shiftline_private.command_before_worker_access(p_action,p_data); end if;
 company:=result->'snapshot'->'company'->>'id';
 if company is not null and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||company,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return result;
end $$;
revoke all on function shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
