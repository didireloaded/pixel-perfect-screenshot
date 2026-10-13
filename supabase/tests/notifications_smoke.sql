begin;
set local statement_timeout='30s';
do $$
declare manager uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 setup jsonb; invite jsonb; feed jsonb; co uuid; denied boolean:=false;
begin
 insert into auth.users(id) values(manager),(worker),(outsider);
 perform set_config('request.jwt.claim.sub',manager::text,true);
 setup:=public.sl_command('setup',jsonb_build_object('company','Notification rollback','name','Manager','site','Office','timezone','Africa/Windhoek'));
 co:=(setup#>>'{snapshot,company,id}')::uuid;
 invite:=public.sl_command('create_employee',jsonb_build_object('name','Worker','no','PUSH-SMOKE','siteId',setup#>>'{snapshot,sites,0,id}'));
 perform public.sl_command('set_checkin_cutoff','{"time":"17:00"}');
 if shiftline_private.checkin_open(co,'2026-10-14T15:00Z') or not shiftline_private.checkin_open(co,'2026-10-14T14:59:59Z') then raise exception 'Cutoff boundary mismatch'; end if;
 perform public.sl_command('set_checkin_cutoff','{"time":"00:00"}');
 perform set_config('request.jwt.claim.sub',worker::text,true);
 perform public.sl_command('activate',jsonb_build_object('employeeNo','PUSH-SMOKE','code',invite->>'activationCode'));
 begin perform public.sl_command('start_workday',jsonb_build_object('id',gen_random_uuid(),'expectedEnd','23:59')); exception when others then if sqlerrm like 'CHECKIN_CLOSED:%' then denied:=true;else raise;end if;end;
 if not denied or exists(select 1 from public.sl_shifts where company_id=co) then raise exception 'Late check-in was accepted'; end if;
 insert into public.sl_messages(company_id,sender_id,recipient_id,title,body) values(co,(setup#>>'{snapshot,me}')::uuid,(invite->>'employeeId')::uuid,'Private fixture','Not for lock screens');
 feed:=public.sl_notifications_api('list');
 if jsonb_array_length(feed)<>1 or feed->0->>'title'<>'New work message' then raise exception 'Notification missing'; end if;
 perform public.sl_notifications_api('read',jsonb_build_object('id',feed->0->>'id'));
 if public.sl_notifications_api('list')->0->>'read_at' is null then raise exception 'Receipt missing'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;begin perform public.sl_notifications_api('list');exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'Notification access leaked';end if;
 raise notice 'Notifications and cutoff smoke passed; all fixtures rolled back';
end $$;
rollback;
