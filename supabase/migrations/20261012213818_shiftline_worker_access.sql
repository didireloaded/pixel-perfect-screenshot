-- Worker contact details are unverified. Only a manager can grant workplace access.
alter table public.sl_employees
 add column access_status text not null default 'active' check(access_status in ('active','pending','rejected')),
 add column login_method text not null default 'email' check(login_method in ('email','code'));
create unique index sl_employees_code_phone on public.sl_employees(company_id,phone) where login_method='code';
create sequence shiftline_private.worker_number start 100001;
create table shiftline_private.signup_limits(
 key text primary key, window_start timestamptz not null, attempts integer not null check(attempts>0)
);
alter table shiftline_private.signup_limits enable row level security;
revoke all on shiftline_private.signup_limits,shiftline_private.worker_number from public,anon,authenticated;

-- All limits are charged before provisioning Auth, including failed signup attempts.
-- Returning a denial instead of throwing preserves the counter on denied requests.
create function shiftline_private.worker_signup_start(p_ip_hash text,p_phone_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company uuid; bucket text; row shiftline_private.signup_limits; cap integer; duration interval;
begin
 if p_ip_hash is null or p_phone_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or p_phone_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid registration request';
 end if;
 -- One public workplace per deployment. Fail closed rather than guess a tenant.
 if (select count(*) from public.sl_companies)<>1 then
  return jsonb_build_object('error','Worker registration is not configured for this workplace. Contact your manager.');
 end if;
 select id into company from public.sl_companies;
 perform 1 from public.sl_companies where id=company for update;
 delete from shiftline_private.signup_limits where window_start<now()-interval '1 day';
 foreach bucket in array array['global','ip:'||p_ip_hash,'phone:'||p_phone_hash] loop
  cap:=case when bucket='global' then 50 when bucket like 'ip:%' then 5 else 2 end;
  duration:=case when bucket like 'phone:%' then interval '1 day' else interval '1 hour' end;
  select * into row from shiftline_private.signup_limits where key=bucket for update;
  if row.key is not null and row.window_start>now()-duration and row.attempts>=cap then
   return jsonb_build_object('error','Too many registration attempts. Please try again later or contact your manager.');
  end if;
  insert into shiftline_private.signup_limits(key,window_start,attempts) values(bucket,now(),1)
   on conflict(key) do update set
    attempts=case when signup_limits.window_start<=now()-duration then 1 else signup_limits.attempts+1 end,
    window_start=case when signup_limits.window_start<=now()-duration then now() else signup_limits.window_start end;
 end loop;
 return jsonb_build_object('companyId',company,'employeeNo','SL-'||nextval('shiftline_private.worker_number'));
end $$;
create function public.sl_worker_signup_start(p_ip_hash text,p_phone_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select shiftline_private.worker_signup_start(p_ip_hash,p_phone_hash); $$;

create function shiftline_private.worker_register(p_user_id uuid,p_company_id uuid,p_no text,p_profile jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare site uuid; employee uuid; full_name text; phone_number text;
begin
 full_name:=trim(p_profile->>'fullName'); phone_number:=p_profile->>'phone';
 if full_name is null or length(full_name) not between 1 and 100 or phone_number is null
  or phone_number !~ '^\+[1-9][0-9]{6,14}$' or p_no is null or p_no !~ '^SL-[0-9]{6,12}$' then
  raise exception 'Check your name and phone number';
 end if;
 perform 1 from public.sl_companies where id=p_company_id for update;
 if (select count(*) from public.sl_companies)<>1 or not exists(select 1 from public.sl_companies where id=p_company_id) then
  raise exception 'Worker registration is not configured for this workplace';
 end if;
 if not exists(select 1 from auth.users where id=p_user_id and email=lower(p_no)||'@workers.shiftline.invalid' and email_confirmed_at is not null) then
  raise exception 'Worker identity was not provisioned';
 end if;
 select site_id into site from public.sl_employees where company_id=p_company_id and role='manager' and access_status='active' order by id limit 1;
 if site is null then raise exception 'Contact your manager to finish workplace setup'; end if;
 if exists(select 1 from public.sl_employees where company_id=p_company_id and phone=phone_number and login_method='code') then
  raise exception 'An account already uses this phone number. Sign in or ask your manager for a replacement code.';
 end if;
 insert into public.sl_employees(company_id,user_id,no,name,phone,site_id,role,access_status,login_method)
  values(p_company_id,p_user_id,p_no,full_name,phone_number,site,'employee','pending','code') returning id into employee;
 insert into public.sl_audit(company_id,actor,action,detail) values(p_company_id,employee,'worker_registered',jsonb_build_object('employeeId',employee));
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||p_company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('employeeNo',p_no);
end $$;
create function public.sl_worker_register(p_user_id uuid,p_company_id uuid,p_no text,p_profile jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select shiftline_private.worker_register(p_user_id,p_company_id,p_no,p_profile); $$;
revoke all on function public.sl_worker_signup_start(text,text),shiftline_private.worker_signup_start(text,text),public.sl_worker_register(uuid,uuid,text,jsonb),shiftline_private.worker_register(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema shiftline_private to service_role;
grant execute on function public.sl_worker_signup_start(text,text),shiftline_private.worker_signup_start(text,text),public.sl_worker_register(uuid,uuid,text,jsonb),shiftline_private.worker_register(uuid,uuid,text,jsonb) to service_role;

alter function shiftline_private.snapshot() rename to snapshot_before_worker_access;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is not null and me.access_status<>'active' then
  return jsonb_build_object('onboarding',true,'workerAccess',jsonb_build_object('status',me.access_status,'name',me.name,'employeeNo',me.no,'phone',me.phone));
 end if;
 base:=shiftline_private.snapshot_before_worker_access();
 if base->>'onboarding'='true' then return base; end if;
 return base||jsonb_build_object('setup',(select jsonb_agg(case when item->>'id'='employees' then item||jsonb_build_object('label','Approve employee registrations','complete',exists(select 1 from public.sl_employees where company_id=me.company_id and role='employee' and access_status='active')) else item end order by ordinal) from jsonb_array_elements(base->'setup') with ordinality as entries(item,ordinal)),
 'employees',coalesce((
  select jsonb_agg(item||jsonb_build_object('accessStatus',e.access_status,'codeLogin',e.login_method='code') order by e.name,e.id)
  from jsonb_array_elements(base->'employees') item join public.sl_employees e on e.id=(item->>'id')::uuid
 ),'[]'::jsonb));
end $$;
revoke all on function shiftline_private.snapshot_before_worker_access(),shiftline_private.snapshot() from public,anon,authenticated;
grant execute on function shiftline_private.snapshot() to authenticated;

-- Gate EVERY command, including setup/legacy invitation paths, before existing handlers.
alter function shiftline_private.command(text,jsonb) rename to command_before_worker_access;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; result jsonb; company text; decision text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is not null then
  perform 1 from public.sl_companies where id=me.company_id for update;
  select * into me from public.sl_employees where id=me.id;
  if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 end if;
 if p_action='review_worker_access' then
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
revoke all on function shiftline_private.command_before_worker_access(text,jsonb),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
create or replace function shiftline_private.can_receive_updates(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.sl_employees e
  where e.user_id=auth.uid() and e.access_status='active' and p_topic='shiftline:'||e.company_id::text);
$$;

-- The Edge Function uses the manager's verified JWT to authorize code replacement.
create function shiftline_private.worker_access_target(p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees;
begin
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null or me.role<>'manager' or me.access_status<>'active' then raise exception 'Manager access required' using errcode='42501'; end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select * into target from public.sl_employees where id=p_employee_id and company_id=me.company_id and role='employee' and login_method='code' and access_status<>'rejected';
 if target.id is null then raise exception 'Worker account is unavailable' using errcode='42501'; end if;
 return jsonb_build_object('userId',target.user_id,'employeeNo',target.no);
end $$;
create function public.sl_worker_access_target(p_employee_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select shiftline_private.worker_access_target(p_employee_id); $$;
revoke all on function public.sl_worker_access_target(uuid),shiftline_private.worker_access_target(uuid) from public,anon,authenticated;
grant execute on function public.sl_worker_access_target(uuid),shiftline_private.worker_access_target(uuid) to authenticated;

create function shiftline_private.worker_code_replaced(p_manager_user_id uuid,p_employee_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees;
begin
 select * into me from public.sl_employees where user_id=p_manager_user_id and role='manager' and access_status='active';
 select * into target from public.sl_employees where id=p_employee_id and company_id=me.company_id and role='employee' and login_method='code';
 if target.id is null then raise exception 'Manager access required'; end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'worker_code_replaced',jsonb_build_object('employeeId',target.id));
end $$;
create function public.sl_worker_code_replaced(p_manager_user_id uuid,p_employee_id uuid) returns void
language sql security invoker set search_path='' as $$ select shiftline_private.worker_code_replaced(p_manager_user_id,p_employee_id); $$;
revoke all on function public.sl_worker_code_replaced(uuid,uuid),shiftline_private.worker_code_replaced(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sl_worker_code_replaced(uuid,uuid),shiftline_private.worker_code_replaced(uuid,uuid) to service_role;
