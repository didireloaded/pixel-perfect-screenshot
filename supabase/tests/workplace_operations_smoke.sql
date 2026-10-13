-- Hosted verification uses only fixtures in a transaction. No test data is retained.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 setup jsonb; invite jsonb; data jsonb; snap jsonb; job_payload jsonb; site uuid; employee uuid; shift uuid; job uuid; company uuid;
begin
 insert into auth.users(id) values(manager),(worker),(outsider);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','Workplace rollback test','name','Test manager','site','Test office','timezone','UTC'));
 company:=(setup->'snapshot'->'company'->>'id')::uuid;
 site:=(setup->'snapshot'->'sites'->0->>'id')::uuid;
 invite:=public.sl_command('create_employee',jsonb_build_object('name','Test worker','no','WORK-1','siteId',site));
 employee:=(invite->>'employeeId')::uuid;
 perform public.sl_command('set_geofence',jsonb_build_object('siteId',site,'latitude',-22.62,'longitude',17.08,'radiusM',150,'maxAccuracyM',100,'mode','notify'));
 data:=public.sl_command('assign_shift',jsonb_build_object('employeeId',employee,'siteId',site,'date',setup->'snapshot'->>'today','start','00:00','end','23:59','lunch','12:00','lunchMinutes',60,'regularMinutes',480));
 shift:=(data->>'shiftId')::uuid;
 job_payload:=jsonb_build_object('id',gen_random_uuid(),'shiftId',shift,'title','Inspection','destination','Job site','instructions','Check equipment','start','00:00','end','23:59','latitude',-22.65,'longitude',17.12,'radiusM',150,'lunchOption','scheduled','overtime',true);
 data:=public.sl_command('create_job',job_payload); job:=(data->'snapshot'->'jobs'->0->>'id')::uuid;
 data:=public.sl_command('create_job',job_payload);
 if data->>'duplicate'<>'true' or jsonb_array_length(data->'snapshot'->'jobs')<>1 then raise exception 'FAIL: repeated job creation'; end if;
 perform public.sl_command('update_employee_profile',jsonb_build_object('employeeId',employee,'name','Test worker','department','Operations','jobTitle','Inspector','bio','Workplace test bio','photoUrl',''));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','WORK-1','code',invite->>'activationCode'));
 snap:=public.sl_snapshot();
 if snap->'employees'->0->>'jobTitle'<>'Inspector' or snap->'jobs'->0->>'lunchOption'<>'scheduled' then raise exception 'FAIL: shared profile and job brief'; end if;
 begin
  perform public.sl_command('update_employee_profile',jsonb_build_object('employeeId',employee,'name','Forbidden'));
  raise exception 'FAIL: worker edited company directory';
 exception when insufficient_privilege then null;
 end;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','clock_in'));
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','start_job','jobId',job));
 perform public.sl_command('report_position',jsonb_build_object('shiftId',shift,'latitude',-22.65,'longitude',17.12,'accuracyM',10));
 if jsonb_array_length(public.sl_snapshot()->'sitePresence')<>0 then raise exception 'FAIL: worker received precise map positions'; end if;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 snap:=public.sl_snapshot();
 if snap->'sitePresence'->0->>'jobId'<>job::text or snap->'sitePresence'->0->>'inside'<>'true' then raise exception 'FAIL: job site target'; end if;
 begin
  perform public.sl_command('set_job_status',jsonb_build_object('jobId',job,'status','completed'));
  raise exception 'FAIL: board ended active attendance job';
 exception when raise_exception then if sqlerrm not like '%still on the job%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','start_lunch'));
 if exists(select 1 from public.sl_site_presence where employee_id=employee) then raise exception 'FAIL: lunch point retained'; end if;
 if (select status from public.sl_jobs where id=job)<>'in_progress' then raise exception 'FAIL: lunch completed job'; end if;
 begin
  perform public.sl_command('report_position',jsonb_build_object('shiftId',shift,'latitude',-22.65,'longitude',17.12,'accuracyM',10));
  raise exception 'FAIL: lunch location accepted';
 exception when raise_exception then if sqlerrm<>'Location check is paused' then raise; end if; end;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','end_lunch'));
 if shiftline_private.state(shift)<>'on_job' then raise exception 'FAIL: lunch lost active job'; end if;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','end_job'));
 if shiftline_private.state(shift)<>'working' or (select status from public.sl_jobs where id=job)<>'completed' then raise exception 'FAIL: job return'; end if;
 perform public.sl_command('report_position',jsonb_build_object('shiftId',shift,'latitude',-22.62,'longitude',17.08,'accuracyM',10));
 perform public.sl_command('clear_position','{}');
 if exists(select 1 from public.sl_site_presence where employee_id=employee) then raise exception 'FAIL: paused position remains'; end if;
 perform public.sl_command('transition',jsonb_build_object('id',gen_random_uuid(),'type','clock_out'));
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform public.sl_command('setup',jsonb_build_object('company','Other workplace test','name','Other manager','site','Other office','timezone','UTC'));
 snap:=public.sl_snapshot(); if jsonb_array_length(snap->'sitePresence')<>0 or jsonb_array_length(snap->'jobs')<>0 then raise exception 'FAIL: cross company map/job access'; end if;
end $$;
rollback;
