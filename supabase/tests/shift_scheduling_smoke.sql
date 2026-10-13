-- All test users, companies, shifts and audit records are rolled back.
-- Existing company and worker data are never modified.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid();
 setup jsonb; invitation jsonb; payload jsonb; response jsonb; previous jsonb;
 company uuid; shift uuid; day date; changed jsonb;
begin
 insert into auth.users(id) values(manager),(worker);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','Scheduling rollback test','name','Test manager','site','Test yard','timezone','Africa/Windhoek'));
 company:=(setup->'snapshot'->'company'->>'id')::uuid;
 day:=(setup->'snapshot'->>'today')::date;
 invitation:=public.sl_command('create_employee',jsonb_build_object('name','Test worker','no','SCHED-1','siteId',setup->'snapshot'->'sites'->0->>'id'));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','SCHED-1','code',invitation->>'activationCode'));
 payload:=jsonb_build_object('employeeId',invitation->>'employeeId','siteId',setup->'snapshot'->'sites'->0->>'id','date',day,'start','00:00','end','23:59','lunch','12:00','lunchMinutes',60,'regularMinutes',480);
 begin
  perform public.sl_command('assign_shift',payload);
  raise exception 'FAIL: worker assigned shift';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 response:=public.sl_command('assign_shift',payload);
 shift:=(response->>'shiftId')::uuid;
 response:=public.sl_command('assign_shift',payload);
 if (response->>'shiftId')::uuid<>shift or response->>'duplicate'<>'true' then raise exception 'FAIL: duplicate shift replay'; end if;
 if (select count(*) from public.sl_shifts where company_id=company)<>1
  or (select count(*) from public.sl_timesheets where company_id=company)<>1
  or (select count(*) from public.sl_audit where company_id=company and action='assign_shift')<>1 then raise exception 'FAIL: duplicated schedule records'; end if;
 begin
  perform public.sl_command('assign_shift',payload||jsonb_build_object('regularMinutes',450));
  raise exception 'FAIL: implicit schedule overwrite';
 exception when raise_exception then
  if sqlerrm not like '%already has a shift%Open it in Calendar%' then raise; end if;
 end;
 changed:=payload||jsonb_build_object('regularMinutes',450);
 response:=public.sl_command('update_shift',changed||jsonb_build_object('shiftId',shift,'expected',payload));
 if (response->>'shiftId')::uuid<>shift then raise exception 'FAIL: shift identity changed'; end if;
 response:=public.sl_command('update_shift',changed||jsonb_build_object('shiftId',shift,'expected',payload));
 if response->>'duplicate'<>'true' then raise exception 'FAIL: edit replay'; end if;
 begin
  perform public.sl_command('update_shift',payload||jsonb_build_object('regularMinutes',420,'shiftId',shift,'expected',payload));
  raise exception 'FAIL: stale schedule accepted';
 exception when raise_exception then
  if sqlerrm not like 'This shift changed since%' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 response:=public.sl_snapshot();
 if response->'shifts'->0->>'regularMinutes'<>'450' or (response->'shifts'->0->>'id')::uuid<>shift then raise exception 'FAIL: worker did not receive edited shift'; end if;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','clock_in'));
 perform set_config('request.jwt.claim.sub',manager::text,true);
 begin
  perform public.sl_command('update_shift',payload||jsonb_build_object('regularMinutes',420,'shiftId',shift,'expected',changed));
  raise exception 'FAIL: recorded attendance schedule edited';
 exception when raise_exception then
  if sqlerrm not like 'This shift has attendance%' then raise; end if;
 end;
 if not exists(select 1 from public.sl_audit where company_id=company and action='update_shift' and detail->'before'->>'regularMinutes'='480' and detail->'after'->>'regularMinutes'='450') then raise exception 'FAIL: missing edit audit'; end if;
 if has_function_privilege('anon','public.sl_command(text,jsonb)','EXECUTE')
  or has_table_privilege('authenticated','public.sl_shifts','INSERT')
  or has_table_privilege('authenticated','public.sl_shifts','UPDATE') then raise exception 'FAIL: default-deny scheduling boundary'; end if;
end $$;
rollback;
