alter table public.sl_employees add column access_role text not null default 'worker'
 check(access_role in ('owner','hr','operations','worker'));
-- Existing managers already have full authority; preserve it rather than guessing an owner.
update public.sl_employees set access_role='owner' where role='manager';
alter table public.sl_requests add column leave_type text check(leave_type in ('annual','sick','personal','unpaid'));
create table public.sl_leave_settings(
 company_id uuid primary key references public.sl_companies,
 working_days integer[] not null,
 minutes_per_day integer not null check(minutes_per_day between 1 and 1440),
 revision integer not null default 1,
 check(cardinality(working_days) between 1 and 7 and working_days <@ array[1,2,3,4,5,6,7])
);
create table public.sl_leave_allowances(
 company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees,
 year integer not null check(year between 2000 and 2200),
 leave_type text not null check(leave_type in ('annual','sick','personal')),
 minutes integer not null check(minutes between 0 and 527040),
 primary key(employee_id,year,leave_type),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id)
);
create table public.sl_leave_charges(
 request_id uuid not null references public.sl_requests,
 company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees,
 year integer not null,
 leave_type text not null check(leave_type in ('annual','sick','personal')),
 minutes integer not null check(minutes>=0),
 calculation jsonb not null,
 primary key(request_id,year),
 foreign key(request_id,company_id) references public.sl_requests(id,company_id),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id)
);
alter table public.sl_leave_settings enable row level security;
create index sl_leave_allowances_company on public.sl_leave_allowances(company_id);
create index sl_leave_charges_balance on public.sl_leave_charges(employee_id,year,leave_type) include(minutes);
create index sl_leave_charges_company on public.sl_leave_charges(company_id);
alter table public.sl_leave_allowances enable row level security;
alter table public.sl_leave_charges enable row level security;
revoke all on public.sl_leave_settings,public.sl_leave_allowances,public.sl_leave_charges from public,anon,authenticated;

create function shiftline_private.role_allows(access_role text,action text) returns boolean
language sql immutable set search_path='' as $$
 select access_role='owner' or action=any(array[
 'start_workday','transition','submit_attendance','register_device','submit_timesheet','create_request','create_leave_request',
 'request_correction','ack_notice','read_message','reply_message','save_profile_photo','report_position','clear_position',
 'read_manager_notification','mark_request_read','send_message','add_manager_note','delete_manager_note'])
 or (access_role='hr' and action=any(array['create_employee','issue_activation','review_worker_access','update_employee_profile','configure_leave','set_leave_allowance','classify_leave_request','create_notice']))
 or (access_role='operations' and action=any(array['create_job','configure_job','create_calendar_job','update_job_plan_location',
 'set_job_status','add_job_step','set_job_step_done','add_job_member','remove_job_member','add_job_comment',
 'review_correction','review_submission','create_incident','review_incident_exception','reserve_report_document','finish_report_document',
 'create_notice','report_site','revoke_device']))
$$;

alter function shiftline_private.snapshot() rename to snapshot_before_company_roles;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; me public.sl_employees; settings public.sl_leave_settings;
begin
 result:=shiftline_private.snapshot_before_company_roles();
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null or result#>>'{company,id}' is null then return result; end if;
 result:=result||jsonb_build_object('accessRole',me.access_role);
 result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(item||jsonb_build_object('accessRole',e.access_role))
  from jsonb_array_elements(result->'employees') item join public.sl_employees e on e.id=(item->>'id')::uuid and e.company_id=me.company_id),'[]'));
 result:=jsonb_set(result,'{requests}',coalesce((select jsonb_agg(item||jsonb_build_object('leaveType',r.leave_type))
  from jsonb_array_elements(result->'requests') item join public.sl_requests r on r.id=(item->>'id')::uuid and r.company_id=me.company_id),'[]'));
 select * into settings from public.sl_leave_settings where company_id=me.company_id;
 result:=result||jsonb_build_object('leaveSettings',case when settings.company_id is not null then jsonb_build_object(
  'workingDays',settings.working_days,'minutesPerDay',settings.minutes_per_day,'revision',settings.revision) else null end,
  'leaveBalances',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'year',a.year,'leaveType',a.leave_type,
   'allowanceMinutes',a.minutes,'usedMinutes',coalesce(c.used,0),'remainingMinutes',a.minutes-coalesce(c.used,0)))
   from public.sl_leave_allowances a left join lateral(select sum(minutes)::integer as used from public.sl_leave_charges c
    where c.employee_id=a.employee_id and c.year=a.year and c.leave_type=a.leave_type) c on true
   where a.company_id=me.company_id and (me.access_role in ('owner','hr') or a.employee_id=me.id)),'[]'));
 if me.access_role in ('hr','operations') then
  result:=result||jsonb_build_object('audit','[]'::jsonb,'payRates','[]'::jsonb,'grossRuns','[]'::jsonb,'periods','[]'::jsonb,'payrollAdmin',false,'devices','[]'::jsonb);
 end if;
 if me.access_role='hr' then
  result:=result||jsonb_build_object('sitePresence','[]'::jsonb,'siteAlerts','[]'::jsonb,'submissions','[]'::jsonb,
   'corrections','[]'::jsonb,'incidents','[]'::jsonb,'incidentExceptions','[]'::jsonb,'reportDocuments','[]'::jsonb,
   'jobComments','[]'::jsonb,'workActivities','[]'::jsonb);
  result:=jsonb_set(result,'{requests}',coalesce((select jsonb_agg(item) from jsonb_array_elements(result->'requests') item
   where item->>'kind'='leave' or item->>'employeeId'=me.id::text),'[]'));
 elsif me.access_role='operations' then
  result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(item) from jsonb_array_elements(result->'employees') item
   where coalesce(item->>'accessStatus','active')='active'),'[]'));
  result:=jsonb_set(result,'{company}',(result->'company')-'registrationCode');
  result:=jsonb_set(result,'{requests}',coalesce((select jsonb_agg(case when item->>'kind'='leave' and item->>'employeeId'<>me.id::text
   then (item-array['detail','reason','leaveType','summary'])||jsonb_build_object('summary','Approved leave') else item end)
   from jsonb_array_elements(result->'requests') item where item->>'kind'<>'leave' or item->>'employeeId'=me.id::text or item->>'status'='approved'),'[]'));
 end if;
 return result;
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_company_roles;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; req public.sl_requests; settings public.sl_leave_settings;
 result jsonb; desired text; days integer[]; used integer; allowance integer; charge record;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid command payload'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then
  result:=shiftline_private.command_before_company_roles(p_action,p_data);
  if p_action='setup' then
   update public.sl_employees set access_role='owner' where user_id=auth.uid() and role='manager';
   result:=result||jsonb_build_object('snapshot',shiftline_private.snapshot());
  end if;
  return result;
 end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 if p_action in ('set_employee_access_role','set_payroll_role') then
  if me.access_role<>'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  desired:=case when p_action='set_payroll_role' then 'owner' else p_data->>'accessRole' end;
  if desired is null or desired not in ('owner','hr','operations','worker') then raise exception 'Choose a valid access role'; end if;
  select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=me.company_id and access_status='active' and user_id is not null for update;
  if target.id is null then raise exception 'Choose an active employee in your company'; end if;
  if p_data ? 'expectedAccessRole' and p_data->>'expectedAccessRole' is distinct from target.access_role then raise exception 'Access role changed. Refresh and try again'; end if;
  if target.access_role='owner' and desired<>'owner' and not exists(select 1 from public.sl_employees where company_id=me.company_id and id<>target.id and access_role='owner' and access_status='active' and user_id is not null) then
   raise exception 'The company must keep an active owner'; end if;
  update public.sl_employees set access_role=desired,role=case when desired='worker' then 'employee' else 'manager' end,payroll_admin=desired='owner' where id=target.id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'set_employee_access_role',jsonb_build_object('employeeId',target.id,'before',target.access_role,'after',desired));
 elsif p_action='review_request' then
  select * into req from public.sl_requests where id=(p_data->>'id')::uuid and company_id=me.company_id for update;
  if req.id is null then raise exception 'Unknown request'; end if;
  if not (me.access_role='owner' or (me.access_role='hr' and req.kind='leave') or (me.access_role='operations' and req.kind<>'leave')) then
   raise exception 'Your role cannot review this request' using errcode='42501'; end if;
  if req.kind='leave' and p_data->>'status'='approved' and req.leave_type is null and exists(select 1 from public.sl_leave_settings where company_id=me.company_id) then
   raise exception 'Classify this leave request before approving it'; end if;
  if req.kind='leave' and req.status='pending' and p_data->>'status'='approved' and exists(
   select 1 from public.sl_requests r where r.company_id=me.company_id and r.employee_id=req.employee_id
   and r.id<>req.id and r.kind='leave' and r.status='approved' and r.leave_start is not null
   and tsrange(r.leave_start+coalesce(r.leave_start_time,'00:00'::time),r.leave_end+coalesce(r.leave_end_time,'23:59:59'::time))
    && tsrange(req.leave_start+coalesce(req.leave_start_time,'00:00'::time),req.leave_end+coalesce(req.leave_end_time,'23:59:59'::time))) then
   raise exception 'This employee already has approved leave during this period'; end if;
  if req.kind='leave' and req.status='pending' and p_data->>'status'='approved' and req.leave_type is not null and req.leave_type<>'unpaid' then
   select * into settings from public.sl_leave_settings where company_id=me.company_id;
   if settings.company_id is null then raise exception 'Configure company working days before approving balanced leave'; end if;
   for charge in select extract(year from day)::integer as year,sum(case when req.leave_start_time is null then settings.minutes_per_day
    else (extract(epoch from req.leave_end_time-req.leave_start_time)/60)::integer end)::integer as minutes
    from generate_series(req.leave_start::timestamp,req.leave_end::timestamp,interval '1 day') day
    where extract(isodow from day)::integer=any(settings.working_days) group by 1 loop
    select minutes into allowance from public.sl_leave_allowances where employee_id=req.employee_id and year=charge.year and leave_type=req.leave_type for update;
    select coalesce(sum(minutes),0)::integer into used from public.sl_leave_charges where employee_id=req.employee_id and year=charge.year and leave_type=req.leave_type;
    if allowance is null or allowance-used<charge.minutes then raise exception 'Insufficient configured leave allowance for %',charge.year; end if;
    insert into public.sl_leave_charges(request_id,company_id,employee_id,year,leave_type,minutes,calculation)
     values(req.id,me.company_id,req.employee_id,charge.year,req.leave_type,charge.minutes,jsonb_build_object('policyRevision',settings.revision,'workingDays',settings.working_days,'minutesPerDay',settings.minutes_per_day));
   end loop;
  end if;
  return shiftline_private.command_before_company_roles(p_action,p_data);
 else
  if me.access_role in ('hr','operations') and not shiftline_private.role_allows(me.access_role,p_action) then raise exception 'Your role cannot perform this action' using errcode='42501'; end if;
  if p_action='configure_leave' then
   if me.access_role not in ('owner','hr') then raise exception 'HR access required' using errcode='42501'; end if;
   select array_agg(distinct value::integer order by value::integer) into days from jsonb_array_elements_text(p_data->'workingDays');
   if days is null or cardinality(days) not between 1 and 7 or not days <@ array[1,2,3,4,5,6,7] then raise exception 'Choose company working days'; end if;
   insert into public.sl_leave_settings(company_id,working_days,minutes_per_day) values(me.company_id,days,(p_data->>'minutesPerDay')::integer)
    on conflict(company_id) do update set working_days=excluded.working_days,minutes_per_day=excluded.minutes_per_day,revision=sl_leave_settings.revision+1;
  elsif p_action='set_leave_allowance' then
   if me.access_role not in ('owner','hr') then raise exception 'HR access required' using errcode='42501'; end if;
   select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=me.company_id and access_status='active';
   if target.id is null or length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Choose an active employee and give a reason'; end if;
   select coalesce(sum(minutes),0)::integer into used from public.sl_leave_charges where employee_id=target.id and year=(p_data->>'year')::integer and leave_type=p_data->>'leaveType';
   if (p_data->>'minutes')::integer<used then raise exception 'Allowance cannot be lower than approved leave already used'; end if;
   insert into public.sl_leave_allowances(company_id,employee_id,year,leave_type,minutes) values(me.company_id,target.id,(p_data->>'year')::integer,p_data->>'leaveType',(p_data->>'minutes')::integer)
    on conflict(employee_id,year,leave_type) do update set minutes=excluded.minutes;
  elsif p_action='classify_leave_request' then
   if me.access_role not in ('owner','hr') then raise exception 'HR access required' using errcode='42501'; end if;
   desired:=p_data->>'leaveType';
   if desired is null or desired not in ('annual','sick','personal','unpaid') then raise exception 'Choose a leave type'; end if;
   update public.sl_requests set leave_type=desired where id=(p_data->>'id')::uuid and company_id=me.company_id and kind='leave' and status='pending' and leave_type is null;
   if not found then raise exception 'Choose an unclassified pending leave request'; end if;
  elsif p_action='create_leave_request' then
   desired:=nullif(p_data->>'leaveType','');
   if desired is null and not exists(select 1 from public.sl_leave_settings where company_id=me.company_id) then
    return shiftline_private.command_before_company_roles(p_action,p_data);
   end if;
   if desired is null or desired not in ('annual','sick','personal','unpaid') then raise exception 'Choose a leave type'; end if;
   result:=shiftline_private.command_before_company_roles(p_action,p_data-'leaveType');
   select * into req from public.sl_requests where id=(p_data->>'id')::uuid and employee_id=me.id and company_id=me.company_id for update;
   if req.leave_type is not null and req.leave_type<>desired then raise exception 'Leave ID conflict'; end if;
   update public.sl_requests set leave_type=desired where id=req.id;
  else return shiftline_private.command_before_company_roles(p_action,p_data); end if;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,p_data-'detail');
 end if;
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return coalesce(result,'{}'::jsonb)||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;

-- The code-replacement and Storage paths bypass sl_command, so scope them too.
do $roles$
declare definition text;
begin
 definition:=pg_get_functiondef('shiftline_private.worker_access_target(uuid)'::regprocedure);
 if position('me.role<>''manager''' in definition)=0 then raise exception 'Access target source mismatch'; end if;
 execute replace(definition,'me.role<>''manager''','me.access_role not in (''owner'',''hr'')');
 definition:=pg_get_functiondef('shiftline_private.worker_access_target(uuid)'::regprocedure);
 execute replace(definition,'and role=''employee'' and login_method=''code''','and (me.access_role=''owner'' or access_role=''worker'') and login_method=''code''');
 definition:=pg_get_functiondef('shiftline_private.worker_code_replaced(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'and role=''manager'' and access_status=''active''','and access_role in (''owner'',''hr'') and access_status=''active''');
 execute replace(definition,'and role=''employee'' and login_method=''code''','and (me.access_role=''owner'' or access_role=''worker'') and login_method=''code''');
 definition:=pg_get_functiondef('shiftline_private.company_logo_access(text,boolean)'::regprocedure);
 if position('e.role=''manager''' in definition)=0 then raise exception 'Company logo authorization source mismatch'; end if;
 execute replace(definition,'e.role=''manager''','e.access_role=''owner''');
 definition:=pg_get_functiondef('shiftline_private.report_object_allowed(text,boolean)'::regprocedure);
 if position('e.role=''manager''' in definition)=0 then raise exception 'Report authorization source mismatch'; end if;
 execute replace(definition,'e.role=''manager''','e.access_role in (''owner'',''operations'')');
end $roles$;
-- Route new notifications to the management role responsible for the action.
do $notifications$
declare definition text;
begin
 definition:=pg_get_functiondef('shiftline_private.notify_changes()'::regprocedure);
 if position('select id,role from public.sl_employees' in definition)=0 then raise exception 'Notification role source mismatch'; end if;
 definition:=replace(definition,'select id,role from public.sl_employees','select id,role,access_role from public.sl_employees');
 definition:=replace(definition,'perform shiftline_private.notify_employee(person.id,origin,heading,target);',
 $routing$if tg_table_name='sl_requests' then
   if new.kind='leave' and person.access_role not in ('owner','hr') then continue; end if;
   if new.kind<>'leave' and person.access_role not in ('owner','operations') then continue; end if;
  elsif tg_table_name='sl_employees' and person.access_role not in ('owner','hr') then continue;
  elsif tg_table_name='sl_site_alerts' and person.access_role not in ('owner','operations') then continue;
  end if;
  perform shiftline_private.notify_employee(person.id,origin,heading,target);$routing$);
 execute definition;
end $notifications$;
revoke all on function shiftline_private.role_allows(text,text),shiftline_private.snapshot_before_company_roles(),shiftline_private.command_before_company_roles(text,jsonb),shiftline_private.snapshot(),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
