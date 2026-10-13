-- Signup details become company records only after a manager-issued code proves membership.
-- Passwords remain in Supabase Auth and never enter employee snapshots or audit details.
alter table public.sl_employees
 add column email text not null default '' check(length(email)<=320),
 add column phone text not null default '' check(length(phone)<=40);

alter function shiftline_private.snapshot() rename to snapshot_before_worker_join;
create function shiftline_private.snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb;
begin
 base:=shiftline_private.snapshot_before_worker_join();
 if base->>'onboarding'='true' then return base; end if;
 return base||jsonb_build_object('employees',coalesce((
   select jsonb_agg(item||jsonb_build_object('email',e.email,'phone',e.phone) order by e.name,e.id)
   from jsonb_array_elements(base->'employees') item
   join public.sl_employees e on e.id=(item->>'id')::uuid
 ),'[]'::jsonb));
end $$;
revoke all on function shiftline_private.snapshot_before_worker_join(),shiftline_private.snapshot() from public,anon,authenticated;
grant execute on function shiftline_private.snapshot() to authenticated;

-- Internal operation: an authenticated user supplies a code, never a company or employee ID.
create function shiftline_private.join_workplace(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.sl_employees; account auth.users; access_code text; full_name text; phone_number text; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384
   or jsonb_typeof(p_data->'code') is distinct from 'string' then raise exception 'Invalid access code'; end if;
 access_code:=lower(trim(p_data->>'code'));
 if access_code !~ '^[0-9a-f]{32}$' then raise exception 'Invalid or expired access code'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.sl_employees where user_id=auth.uid()) then
   raise exception 'Account already belongs to a workplace';
 end if;
 select * into account from auth.users where id=auth.uid();
 if account.id is null or account.email_confirmed_at is null or nullif(trim(account.email),'') is null then
   raise exception 'Confirm your email before joining your workplace';
 end if;
 select * into target from public.sl_employees
   where activation_hash=encode(sha256(convert_to(access_code,'UTF8')),'hex') and role='employee';
 if target.id is null then raise exception 'Invalid or expired access code'; end if;
 -- Match the existing company-first mutation lock order before consuming the employee code.
 perform 1 from public.sl_companies where id=target.company_id for update;
 select * into target from public.sl_employees where id=target.id
   and activation_hash=encode(sha256(convert_to(access_code,'UTF8')),'hex') for update;
 if target.id is null or target.user_id is not null or target.activation_expires is null or target.activation_expires<=now() then
   raise exception 'Invalid or expired access code';
 end if;
 -- Metadata supplies display/contact fields only; it can never grant a role or tenant.
 full_name:=coalesce(nullif(trim(account.raw_user_meta_data->>'fullName'),''),target.name);
 phone_number:=coalesce(trim(account.raw_user_meta_data->>'phone'),'');
 if length(full_name) not between 1 and 100 or length(phone_number)>40 or length(account.email)>320 then
   raise exception 'Check your name and contact details before joining';
 end if;
 result:=shiftline_private.command_before_live_sync('activate',jsonb_build_object('employeeNo',target.no,'code',access_code));
 update public.sl_employees set name=full_name,email=lower(trim(account.email)),phone=phone_number where id=target.id;
 insert into public.sl_audit(company_id,actor,action,detail)
   values(target.company_id,target.id,'join_workplace',jsonb_build_object('employeeId',target.id));
 return result||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.join_workplace(jsonb) from public,anon,authenticated;

-- Keep private invalidation and durable writes owned by the current command entry point.
create or replace function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; company text;
begin
 if p_action='join_workplace' then
   result:=shiftline_private.join_workplace(p_data);
 else
   result:=shiftline_private.command_before_live_sync(p_action,p_data);
 end if;
 company:=result->'snapshot'->'company'->>'id';
 if company is not null and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   begin
     perform realtime.send('{}'::jsonb,'refresh','shiftline:'||company,true);
   exception when others then
     raise log 'Shiftline live update unavailable: %',sqlstate;
   end;
 end if;
 return result;
end $$;
