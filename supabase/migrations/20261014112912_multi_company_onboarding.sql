-- Recruitment codes select a tenant. They never grant workplace access.
alter table public.sl_companies
 add column registration_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) unique,
 add column logo_path text;

-- Retire implicit, single-company selection, including old clients.
create or replace function shiftline_private.worker_signup_start(p_ip_hash text,p_phone_hash text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('error','Enter the company registration code from your manager.')
$$;
create function shiftline_private.worker_signup_start(p_ip_hash text,p_phone_hash text,p_company_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company uuid; bucket text; row shiftline_private.signup_limits; cap integer; duration interval;
begin
 if p_ip_hash is null or p_phone_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or p_phone_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid registration request';
 end if;
 -- Charge failed code attempts too. Serialize counters independently of tenant existence.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shiftline-worker-signup',0));
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
 select id into company from public.sl_companies where registration_code=upper(trim(p_company_code));
 if company is null then return jsonb_build_object('error','Invalid company registration code. Ask your manager.'); end if;
 return jsonb_build_object('companyId',company,'employeeNo','SL-'||nextval('shiftline_private.worker_number'));
end $$;
create function public.sl_worker_signup_start(p_ip_hash text,p_phone_hash text,p_company_code text) returns jsonb
language sql security invoker set search_path='' as $$ select shiftline_private.worker_signup_start(p_ip_hash,p_phone_hash,p_company_code) $$;
revoke all on function public.sl_worker_signup_start(text,text,text),shiftline_private.worker_signup_start(text,text,text) from public,anon,authenticated;
grant execute on function public.sl_worker_signup_start(text,text,text),shiftline_private.worker_signup_start(text,text,text) to service_role;

create or replace function shiftline_private.worker_register(p_user_id uuid,p_company_id uuid,p_no text,p_profile jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare site uuid; employee uuid; full_name text; phone_number text;
begin
 full_name:=trim(p_profile->>'fullName'); phone_number:=p_profile->>'phone';
 if full_name is null or length(full_name) not between 1 and 100 or phone_number is null
  or phone_number !~ '^\+[1-9][0-9]{6,14}$' or p_no is null or p_no !~ '^SL-[0-9]{6,12}$' then
  raise exception 'Check your name and phone number';
 end if;
 perform 1 from public.sl_companies where id=p_company_id for update;
 if not found then raise exception 'Workplace is unavailable'; end if;
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('company-logos','company-logos',false,1048576,array['image/png','image/jpeg','image/webp']);
create function shiftline_private.company_logo_access(object_name text,write_access boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sl_employees e where e.user_id=auth.uid() and e.access_status='active'
  and e.company_id::text=split_part(object_name,'/',1) and (not write_access or e.role='manager'))
$$;
revoke all on function shiftline_private.company_logo_access(text,boolean) from public,anon,authenticated;
grant execute on function shiftline_private.company_logo_access(text,boolean) to authenticated;
create policy company_logo_read on storage.objects for select to authenticated
 using(bucket_id='company-logos' and shiftline_private.company_logo_access(name,false));
create policy company_logo_insert on storage.objects for insert to authenticated
 with check(bucket_id='company-logos' and shiftline_private.company_logo_access(name,true));

alter function shiftline_private.snapshot() rename to snapshot_before_company_onboarding;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; co public.sl_companies;
begin
 result:=shiftline_private.snapshot_before_company_onboarding();
 if result#>>'{company,id}' is null then return result; end if;
 select * into co from public.sl_companies where id=(result#>>'{company,id}')::uuid;
 return jsonb_set(result,'{company}',(result->'company')||jsonb_build_object('logoPath',co.logo_path)
  ||case when result->>'role'='manager' then jsonb_build_object('registrationCode',co.registration_code) else '{}'::jsonb end);
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_company_onboarding;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; path text; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_action='setup' and not exists(select 1 from public.sl_employees where user_id=auth.uid()) then
  if length(trim(coalesce(p_data->>'company',''))) not between 1 and 100
   or length(trim(coalesce(p_data->>'name',''))) not between 1 and 100
   or length(trim(coalesce(p_data->>'site',''))) not between 1 and 100 then raise exception 'Enter your company, name and workplace'; end if;
 end if;
 if p_action='save_company_profile' then
  select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
  if me.id is null or me.role<>'manager' then raise exception 'Manager access required'; end if;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 100 then raise exception 'Enter a company name (up to 100 characters)'; end if;
  path:=nullif(p_data->>'logoPath','');
  if path is not null and (split_part(path,'/',1)<>me.company_id::text or not exists(select 1 from storage.objects where bucket_id='company-logos' and name=path)) then
   raise exception 'Upload a logo for your own company';
  end if;
  update public.sl_companies set name=trim(p_data->>'name'),logo_path=case when p_data ? 'logoPath' then path else logo_path end where id=me.company_id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('name',trim(p_data->>'name')));
 else
  result:=shiftline_private.command_before_company_onboarding(p_action,p_data);
  if p_action<>'setup' then return result; end if;
 end if;
 return coalesce(result,'{}'::jsonb)||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot_before_company_onboarding(),shiftline_private.command_before_company_onboarding(text,jsonb),shiftline_private.snapshot(),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
