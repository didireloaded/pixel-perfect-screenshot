-- Hosted proof only. Every fixture and notification receipt is rolled back.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 setup jsonb; other jsonb; invite jsonb; payload jsonb; response jsonb; view jsonb;
 job_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); rejected boolean:=false;
begin
 insert into auth.users(id) values(manager),(worker),(outsider);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','HR calendar rollback smoke','name','Smoke manager','site','Smoke office','timezone','UTC'));
 invite:=public.sl_command('create_employee',jsonb_build_object('name','Smoke worker','no','SMOKE-W1','siteId',setup->'snapshot'->'sites'->0->>'id'));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','SMOKE-W1','code',invite->>'activationCode'));
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 other:=public.sl_command('setup',jsonb_build_object('company','Other rollback smoke','name','Other manager','site','Other office','timezone','UTC'));
 perform set_config('request.jwt.claim.sub',manager::text,true);
 payload:=jsonb_build_object('id',job_id,'date',setup->'snapshot'->>'today','title','Smoke inspection','details','Rollback test only','employeeIds','[]'::jsonb);
 response:=public.sl_command('create_calendar_job',payload);
 if jsonb_array_length(response->'snapshot'->'calendarJobs')<>1 then raise exception 'FAIL: calendar create'; end if;
 response:=public.sl_command('create_calendar_job',payload);
 if response->>'duplicate'<>'true' then raise exception 'FAIL: duplicate calendar job'; end if;
 begin
  perform public.sl_command('create_calendar_job',payload||jsonb_build_object('id',gen_random_uuid(),'employeeIds',jsonb_build_array(other->'snapshot'->>'me')));
 exception when others then
  if sqlerrm<>'Choose active employees from your company' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'FAIL: invalid employee accepted'; end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 view:=public.sl_snapshot();
 if jsonb_array_length(view->'calendarJobs')<>1 then raise exception 'FAIL: worker calendar sync'; end if;
 payload:=jsonb_build_object('id',request_id,'summary','Smoke time off','detail','Rollback test only','leaveStart',setup->'snapshot'->>'today','leaveEnd',setup->'snapshot'->>'today','leaveStartTime','09:00','leaveEndTime','10:00');
 perform public.sl_command('create_leave_request',payload);
 perform public.sl_command('create_leave_request',payload);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 view:=public.sl_snapshot();
 if jsonb_array_length(view->'requests')<>1 or view->'requests'->0->>'leaveStartTime'<>'09:00' then raise exception 'FAIL: leave details and retry'; end if;
 response:=public.sl_command('read_manager_notification',jsonb_build_object('id','request:'||request_id::text));
 if not (response->'snapshot'->'readNotificationIds') ? ('request:'||request_id::text) then raise exception 'FAIL: notification receipt'; end if;
 perform public.sl_command('review_request',jsonb_build_object('id',request_id,'status','approved','reason','Smoke decision'));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 view:=public.sl_snapshot();
 if view->'requests'->0->>'status'<>'approved' then raise exception 'FAIL: approval sync'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 view:=public.sl_snapshot();
 if jsonb_array_length(view->'calendarJobs')<>0 or jsonb_array_length(view->'requests')<>0 then raise exception 'FAIL: company isolation'; end if;
 if has_table_privilege('authenticated','public.sl_calendar_jobs','SELECT') or has_table_privilege('authenticated','public.sl_manager_notification_reads','SELECT') then raise exception 'FAIL: direct table access'; end if;
end $$;
rollback;
select 'HR calendar smoke passed; all fixtures rolled back' as result;
