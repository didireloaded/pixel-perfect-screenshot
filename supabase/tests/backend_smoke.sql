-- Run against the dedicated Shiftline database after applying migrations.
-- All fixture users and business records are rolled back; no existing records are changed.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); teammate uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 setup jsonb; other_company jsonb; invitation jsonb; second_invitation jsonb; data jsonb; response jsonb;
 site uuid; shift uuid; job uuid; thread uuid; company uuid; employee uuid; step uuid; event uuid:=gen_random_uuid(); notice uuid;
begin
 insert into auth.users(id) values(manager),(worker),(teammate),(outsider);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','Backend smoke test','name','Test Manager','site','Test Yard','timezone','Africa/Windhoek'));
 company:=(setup->'snapshot'->'company'->>'id')::uuid;
 if not shiftline_private.can_receive_updates('shiftline:'||company::text) then raise exception 'FAIL: manager live topic scope'; end if;
 site:=(setup->'snapshot'->'sites'->0->>'id')::uuid;
 invitation:=public.sl_command('create_employee',jsonb_build_object('name','Test Worker','no','SMOKE-1','siteId',site));
 second_invitation:=public.sl_command('create_employee',jsonb_build_object('name','Test Teammate','no','SMOKE-2','siteId',site));
 employee:=(invitation->>'employeeId')::uuid;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','SMOKE-1','code',invitation->>'activationCode'));
 if not shiftline_private.can_receive_updates('shiftline:'||company::text) then raise exception 'FAIL: worker live topic scope'; end if;
 begin
  perform public.sl_command('create_employee',jsonb_build_object('name','Forbidden','no','NO','siteId',site));
  raise exception 'FAIL: worker gained manager permissions';
 exception when raise_exception then
  if sqlerrm<>'Manager access required' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',teammate::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','SMOKE-2','code',second_invitation->>'activationCode'));
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 if shiftline_private.can_receive_updates('shiftline:'||company::text) then raise exception 'FAIL: outsider joined live topic'; end if;
 other_company:=public.sl_command('setup',jsonb_build_object('company','Other smoke company','name','Other Manager','site','Other Yard','timezone','Africa/Windhoek'));
 begin
  insert into public.sl_employees(company_id,no,name,site_id,role) values(company,'BAD','Invalid',(other_company->'snapshot'->'sites'->0->>'id')::uuid,'employee');
  raise exception 'FAIL: database accepted cross-company site';
 exception when foreign_key_violation then null;
 end;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 data:=public.sl_command('assign_shift',jsonb_build_object('employeeId',employee,'siteId',site,'date',setup->'snapshot'->>'today','start','00:00','end','23:59','lunch','12:00','lunchMinutes',60,'regularMinutes',480));
 shift:=(data->'snapshot'->'shifts'->0->>'id')::uuid;
 data:=public.sl_command('create_job',jsonb_build_object('shiftId',shift,'title','Inspection','destination','Yard','start','00:00','end','23:59'));
 job:=(data->'snapshot'->'jobs'->0->>'id')::uuid;
 perform public.sl_command('add_job_member',jsonb_build_object('jobId',job,'employeeId',second_invitation->>'employeeId'));
 data:=public.sl_command('add_job_step',jsonb_build_object('jobId',job,'label','Check gate'));
 step:=(data->'snapshot'->'jobSteps'->0->>'id')::uuid;
 data:=public.sl_command('send_message',jsonb_build_object('recipientId',employee,'title','Briefing','body','Meet at gate'));
 thread:=(data->'snapshot'->'messages'->0->>'id')::uuid;
 perform public.sl_command('add_manager_note',jsonb_build_object('title','Private note','body','Check schedule'));
 perform set_config('request.jwt.claim.sub',teammate::text,true);
 data:=public.sl_snapshot();
 if jsonb_array_length(data->'jobs')<>1 or jsonb_array_length(data->'jobSteps')<>1 or jsonb_array_length(data->'messages')<>0 or jsonb_array_length(data->'managerNotes')<>0 then raise exception 'FAIL: team snapshot scope'; end if;
 perform public.sl_command('set_job_step_done',jsonb_build_object('stepId',step,'done',true));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 data:=public.sl_command('reply_message',jsonb_build_object('threadId',thread,'body','Understood'));
 if jsonb_array_length(data->'snapshot'->'messages')<>2 then raise exception 'FAIL: worker reply'; end if;
 response:=public.sl_command('transition',jsonb_build_object('id',event,'type','clock_in'));
 if response->>'status'<>'synced' then raise exception 'FAIL: clock-in'; end if;
 response:=public.sl_command('transition',jsonb_build_object('id',event,'type','clock_in'));
 if response->>'duplicate'<>'true' or (select count(*) from public.sl_events where id=event)<>1 then raise exception 'FAIL: idempotency'; end if;
 data:=public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','start_lunch','location',jsonb_build_object('latitude',-22.56,'longitude',17.08,'accuracyM',15)));
 if exists(select 1 from public.sl_submissions where employee_id=employee and payload->>'type'='start_lunch' and payload->'location'<>'null'::jsonb) then raise exception 'FAIL: lunch location retained'; end if;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','end_lunch'));
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','clock_out'));
 perform set_config('request.jwt.claim.sub',manager::text,true);
 data:=public.sl_snapshot();
 if data->>'schemaVersion'<>'11' or jsonb_array_length(data->'events')<>4 or jsonb_array_length(data->'messages')<>2 then raise exception 'FAIL: shared manager snapshot'; end if;
 if not exists(select 1 from realtime.messages rm where rm.topic='shiftline:'||company::text and rm.event='refresh' and rm.private and (rm.payload-'id')='{}'::jsonb) then raise exception 'FAIL: database live notifications'; end if;
 if exists(select 1 from realtime.messages rm where rm.topic='shiftline:'||company::text and (not rm.private or (rm.payload-'id')<>'{}'::jsonb)) then raise exception 'FAIL: notification contained business data'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 data:=public.sl_snapshot();
 if jsonb_array_length(data->'events')<>0 or jsonb_array_length(data->'jobs')<>0 or jsonb_array_length(data->'messages')<>0 then raise exception 'FAIL: company data isolation'; end if;
 if has_table_privilege('authenticated','public.sl_events','SELECT') or has_table_privilege('anon','public.sl_events','INSERT') or has_function_privilege('anon','public.sl_command(text,jsonb)','EXECUTE') then raise exception 'FAIL: exposed database permissions'; end if;
end $$;
rollback;
