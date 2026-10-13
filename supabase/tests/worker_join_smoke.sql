-- Hosted verification of code-only workplace joining. Every fixture is rolled back.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 setup jsonb; invitation jsonb; joined jsonb; view jsonb; employee uuid; company uuid;
begin
 insert into auth.users(id) values(manager),(worker),(other);
 update auth.users set email=worker::text||'@example.invalid',
   raw_user_meta_data=jsonb_build_object('fullName','Signup Worker','phone','+264 81 000 0000','role','manager') where id=worker;
 update auth.users set email=other::text||'@example.invalid',email_confirmed_at=now() where id=other;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','Join smoke fixture','name','Manager','site','Office','timezone','Africa/Windhoek'));
 company:=(setup->'snapshot'->'company'->>'id')::uuid;
 invitation:=public.sl_command('create_employee',jsonb_build_object('name','Invited name','no','JOIN-1','team','Operations','siteId',setup->'snapshot'->'sites'->0->>'id'));
 employee:=(invitation->>'employeeId')::uuid;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 begin
   perform public.sl_command('join_workplace',jsonb_build_object('code',invitation->>'activationCode'));
   raise exception 'FAIL: unconfirmed account joined';
 exception when raise_exception then
   if sqlerrm<>'Confirm your email before joining your workplace' then raise; end if;
 end;
 update auth.users set email_confirmed_at=now() where id=worker;
 joined:=public.sl_command('join_workplace',jsonb_build_object('code',invitation->>'activationCode','role','manager','companyId',gen_random_uuid()));
 if joined->'snapshot'->>'role'<>'employee' or joined->'snapshot'->'company'->>'id'<>company::text
   or joined->'snapshot'->'employees'->0->>'name'<>'Signup Worker'
   or joined->'snapshot'->'employees'->0->>'email'<>worker::text||'@example.invalid'
   or joined->'snapshot'->'employees'->0->>'phone'<>'+264 81 000 0000' then
   raise exception 'FAIL: signup details or membership mismatch';
 end if;
 if exists(select 1 from public.sl_employees where id=employee and (activation_hash is not null or activation_expires is not null)) then
   raise exception 'FAIL: code was not consumed';
 end if;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 view:=public.sl_snapshot();
 if not exists(select 1 from jsonb_array_elements(view->'employees') item where item->>'id'=employee::text and item->>'name'='Signup Worker' and item->>'email'=worker::text||'@example.invalid') then
   raise exception 'FAIL: manager did not receive worker profile';
 end if;
 if not exists(select 1 from realtime.messages where topic='shiftline:'||company::text and event='refresh' and private and (payload-'id')='{}'::jsonb) then
   raise exception 'FAIL: private live update missing';
 end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 begin
   perform public.sl_command('join_workplace',jsonb_build_object('code',invitation->>'activationCode'));
   raise exception 'FAIL: consumed code was reused';
 exception when raise_exception then
   if sqlerrm<>'Invalid or expired access code' then raise; end if;
 end;
 if exists(select 1 from public.sl_audit where company_id=company and detail::text like '%'||(invitation->>'activationCode')||'%') then
   raise exception 'FAIL: code leaked into audit';
 end if;
 if has_function_privilege('authenticated','shiftline_private.join_workplace(jsonb)','EXECUTE')
   or has_function_privilege('anon','public.sl_command(text,jsonb)','EXECUTE')
   or has_table_privilege('authenticated','public.sl_employees','SELECT') then
   raise exception 'FAIL: direct profile/join access exposed';
 end if;
end $$;
rollback;
