-- Hosted verification against the configured workplace. Fixtures and counters are rolled back.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); company uuid; site uuid;
 manager_employee uuid; employee uuid; reservation jsonb; result jsonb; view jsonb; phone text:='+264'||lpad((floor(random()*100000000)::bigint)::text,8,'0');
begin
 if (select count(*) from public.sl_companies)<>1 then raise exception 'Smoke requires one configured workplace'; end if;
 select e.company_id,e.site_id into company,site from public.sl_employees e where role='manager' and access_status='active' limit 1;
 insert into auth.users(id) values(manager);
 insert into public.sl_employees(company_id,user_id,no,name,site_id,role)
  values(company,manager,'SMOKE-'||replace(manager::text,'-',''),'Access smoke manager',site,'manager') returning id into manager_employee;
 reservation:=public.sl_worker_signup_start(encode(sha256(convert_to(manager::text,'UTF8')),'hex'),encode(sha256(convert_to(phone,'UTF8')),'hex'));
 if reservation->>'error' is not null then raise exception 'FAIL: signup denied: %',reservation->>'error'; end if;
 insert into auth.users(id,email,email_confirmed_at) values(worker,lower(reservation->>'employeeNo')||'@workers.shiftline.invalid',now());
 result:=public.sl_worker_register(worker,company,reservation->>'employeeNo',jsonb_build_object('fullName','Access smoke worker','phone',phone,'role','manager','companyId',gen_random_uuid()));
 select id into employee from public.sl_employees where user_id=worker;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 view:=public.sl_snapshot();
 if view->>'onboarding'<>'true' or view->'workerAccess'->>'status'<>'pending' or view?'company' or view?'events' then raise exception 'FAIL: pending snapshot exposed company data'; end if;
 if shiftline_private.can_receive_updates('shiftline:'||company::text) then raise exception 'FAIL: pending realtime allowed'; end if;
 begin
  perform public.sl_command('setup','{}');
  raise exception 'FAIL: pending worker executed company command';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 view:=public.sl_snapshot();
 if not exists(select 1 from jsonb_array_elements(view->'employees') e where e->>'id'=employee::text and e->>'phone'=phone and e->>'accessStatus'='pending' and e->>'codeLogin'='true') then raise exception 'FAIL: registration not visible to manager'; end if;
 perform public.sl_command('review_worker_access',jsonb_build_object('employeeId',employee,'status','active','expectedStatus','pending'));
 if public.sl_worker_access_target(employee)->>'userId'<>worker::text then raise exception 'FAIL: manager reset target mismatch'; end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 view:=public.sl_snapshot();
 if view->>'role'<>'employee' or view->'company'->>'id'<>company::text then raise exception 'FAIL: approved role/tenant mismatch'; end if;
 if not shiftline_private.can_receive_updates('shiftline:'||company::text) then raise exception 'FAIL: approved realtime denied'; end if;
 begin
  perform public.sl_worker_access_target(employee);
  raise exception 'FAIL: worker authorized code replacement';
 exception when insufficient_privilege then null;
 end;
 if has_function_privilege('anon','public.sl_worker_register(uuid,uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('authenticated','public.sl_worker_signup_start(text,text)','EXECUTE')
  or has_function_privilege('authenticated','shiftline_private.command_before_worker_access(text,jsonb)','EXECUTE')
  or has_table_privilege('authenticated','public.sl_employees','SELECT') then raise exception 'FAIL: privileged surface exposed'; end if;
end $$;
rollback;
select 'worker access smoke passed; fixtures rolled back' as result;
