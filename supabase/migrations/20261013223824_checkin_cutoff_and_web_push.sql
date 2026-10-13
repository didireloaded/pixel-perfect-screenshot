alter table public.sl_companies add column checkin_close_time time not null default '17:00';
create function shiftline_private.checkin_open(company uuid, at_time timestamptz default clock_timestamp()) returns boolean
language sql stable set search_path='' as $$ select (at_time at time zone timezone)::time < checkin_close_time from public.sl_companies where id=company $$;
revoke all on function shiftline_private.checkin_open(uuid,timestamptz) from public,anon,authenticated;
alter function shiftline_private.snapshot() rename to snapshot_before_checkin_cutoff;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=shiftline_private.snapshot_before_checkin_cutoff();
 if result#>>'{company,id}' is null then return result; end if;
 return jsonb_set(result,'{company,checkinCloseTime}',to_jsonb((select to_char(checkin_close_time,'HH24:MI') from public.sl_companies where id=(result#>>'{company,id}')::uuid)));
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_checkin_cutoff;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees;
begin
 if p_action='set_checkin_cutoff' then
  select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
  if me.role is distinct from 'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  if coalesce(p_data->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a valid check-in cutoff'; end if;
  update public.sl_companies set checkin_close_time=(p_data->>'time')::time where id=me.company_id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'set_checkin_cutoff',jsonb_build_object('time',p_data->>'time'));
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
  end if;
  return jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 if p_action='start_workday' or (p_action='transition' and p_data->>'type'='clock_in') then
  select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
  if me.id is not null and not exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid and employee_id=me.id and type='clock_in')
   and not shiftline_private.checkin_open(me.company_id) then raise exception 'CHECKIN_CLOSED: check-in is closed after company knock-off time'; end if;
 end if;
 return shiftline_private.command_before_checkin_cutoff(p_action,p_data);
end $$;
revoke all on function shiftline_private.command_before_checkin_cutoff(text,jsonb),shiftline_private.snapshot_before_checkin_cutoff(),shiftline_private.snapshot(),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;

-- Notification contents deliberately exclude messages, medical details and locations.
create table public.sl_notifications (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees, source text not null,
 title text not null, destination text not null, created_at timestamptz not null default clock_timestamp(), read_at timestamptz,
 unique(employee_id,source)
);
create index sl_notifications_employee_time on public.sl_notifications(employee_id,created_at desc);
create index sl_notifications_company on public.sl_notifications(company_id);
create table shiftline_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.sl_employees,
 endpoint text not null unique, p256dh text not null, auth_key text not null, app text not null check(app in ('manager','worker')),
 active boolean not null default true, updated_at timestamptz not null default clock_timestamp()
);
create index push_subscriptions_employee on shiftline_private.push_subscriptions(employee_id);
create table shiftline_private.push_deliveries (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.sl_notifications,
 subscription_id uuid not null references shiftline_private.push_subscriptions,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, next_attempt timestamptz not null default clock_timestamp(), lease uuid, last_error text,
 unique(notification_id,subscription_id)
);
create index push_deliveries_pending on shiftline_private.push_deliveries(next_attempt) where status in ('pending','sending');
create index push_deliveries_subscription on shiftline_private.push_deliveries(subscription_id);
alter table public.sl_notifications enable row level security;
alter table shiftline_private.push_subscriptions enable row level security;
alter table shiftline_private.push_deliveries enable row level security;
revoke all on public.sl_notifications,shiftline_private.push_subscriptions,shiftline_private.push_deliveries from public,anon,authenticated;

create function shiftline_private.notify_employee(employee uuid, origin text, heading text, target text) returns void language plpgsql security definer set search_path='' as $$
declare nid uuid;
begin
 insert into public.sl_notifications(company_id,employee_id,source,title,destination)
 select company_id,id,origin,heading,target from public.sl_employees where id=employee and access_status='active'
 on conflict(employee_id,source) do nothing returning id into nid;
 if nid is not null then
  insert into shiftline_private.push_deliveries(notification_id,subscription_id)
  select nid,id from shiftline_private.push_subscriptions where employee_id=employee and active;
 end if;
end $$;
create function shiftline_private.notify_changes() returns trigger language plpgsql security definer set search_path='' as $$
declare person record; origin text; heading text; target text;
begin
 if tg_table_name='sl_timesheets' then
  if new.status='approved' and old.status is distinct from new.status then
   perform shiftline_private.notify_employee(new.employee_id,'timesheet:'||new.shift_id,'Your timesheet was approved','hours');
  end if;
  return new;
 end if;
 origin:=tg_table_name||':'||new.id;
 if tg_table_name='sl_messages' then
  perform shiftline_private.notify_employee(new.recipient_id,origin,'New work message','messages'); return new;
 elsif tg_table_name='sl_requests' then
  if tg_op='UPDATE' then
   if new.status=old.status then return new; end if;
   perform shiftline_private.notify_employee(new.employee_id,origin||':'||new.status,'Your request was reviewed','requests'); return new;
  end if;
  heading:='New employee request'; target:='requests';
 elsif tg_table_name='sl_site_alerts' then heading:='Work boundary alert'; target:='map';
 elsif tg_table_name='sl_employees' then
  if new.access_status<>'pending' then return new; end if;
  heading:='Employee access awaiting approval'; target:='team';
 elsif tg_table_name='sl_calendar_jobs' then heading:='New job on the calendar'; target:='jobs';
 else heading:='Company announcement'; target:='announcements'; end if;
 for person in select id,role from public.sl_employees where company_id=new.company_id and access_status='active' loop
  if tg_table_name in ('sl_requests','sl_site_alerts','sl_employees') and person.role<>'manager' then continue; end if;
  if tg_table_name='sl_calendar_jobs' then
   if person.role<>'manager' and cardinality(new.employee_ids)>0 and not(person.id=any(new.employee_ids)) then continue; end if;
  end if;
  perform shiftline_private.notify_employee(person.id,origin,heading,target);
 end loop;
 return new;
end $$;
create trigger sl_message_notification after insert on public.sl_messages for each row execute function shiftline_private.notify_changes();
create trigger sl_request_notification after insert or update of status on public.sl_requests for each row execute function shiftline_private.notify_changes();
create trigger sl_notice_notification after insert on public.sl_notices for each row execute function shiftline_private.notify_changes();
create trigger sl_job_notification after insert on public.sl_calendar_jobs for each row execute function shiftline_private.notify_changes();
create trigger sl_alert_notification after insert on public.sl_site_alerts for each row execute function shiftline_private.notify_changes();
create trigger sl_employee_notification after insert on public.sl_employees for each row execute function shiftline_private.notify_changes();
create trigger sl_timesheet_notification after update of status on public.sl_timesheets for each row execute function shiftline_private.notify_changes();

create function public.sl_notifications_api(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; v_endpoint text; output jsonb; changed integer;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active workplace access required' using errcode='42501'; end if;
 if octet_length(payload::text)>8192 then raise exception 'Notification payload too large'; end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]') into output from
   (select id,title,destination,created_at,read_at from public.sl_notifications where employee_id=me.id and company_id=me.company_id order by created_at desc limit 100) n;
  return output;
 elsif action='read' then
  update public.sl_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=(payload->>'id')::uuid and employee_id=me.id and company_id=me.company_id;
 elsif action='public_key' then
  return jsonb_build_object('key',(select decrypted_secret from vault.decrypted_secrets where name='shiftline_vapid_public' limit 1));
 elsif action in ('subscribe','unsubscribe') then
  v_endpoint:=payload->>'endpoint';
  if action='unsubscribe' then
   update shiftline_private.push_subscriptions set active=false where employee_id=me.id and endpoint=payload->>'endpoint';
  else
   if v_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|web.push.apple.com|[a-z0-9-]+\.notify.windows.com)/[^\s]+$' or length(v_endpoint)>2048
    or coalesce(payload->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}$' or coalesce(payload->>'auth','') !~ '^[A-Za-z0-9_-]{20,30}$'
    or payload->>'app' not in ('worker','manager') or (payload->>'app'='manager' and me.role<>'manager') then raise exception 'Invalid push subscription'; end if;
   if exists(select 1 from shiftline_private.push_subscriptions where endpoint=payload->>'endpoint' and employee_id<>me.id) then raise exception 'Subscription belongs to another account'; end if;
   insert into shiftline_private.push_subscriptions(employee_id,endpoint,p256dh,auth_key,app) values(me.id,v_endpoint,payload->>'p256dh',payload->>'auth',payload->>'app')
   on conflict(endpoint) do update set active=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,app=excluded.app,updated_at=clock_timestamp() where push_subscriptions.employee_id=me.id;
   get diagnostics changed=row_count;
   if changed=0 then raise exception 'Subscription belongs to another account'; end if;
  end if;
 else raise exception 'Unknown notification action'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.sl_notifications_api(text,jsonb),shiftline_private.notify_employee(uuid,text,text,text),shiftline_private.notify_changes() from public,anon,authenticated;
grant execute on function public.sl_notifications_api(text,jsonb) to authenticated;

-- Only the dispatch function's service identity can read server keys or deliveries.
create function public.sl_push_configuration(public_key text default null, private_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('shiftline-push-configuration',0));
 if not exists(select 1 from vault.decrypted_secrets where name='shiftline_vapid_public') then
  if public_key is null or private_key is null then raise exception 'Push is not configured'; end if;
  perform vault.create_secret(public_key,'shiftline_vapid_public');
  perform vault.create_secret(private_key,'shiftline_vapid_private');
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'shiftline_push_dispatch');
 end if;
 select jsonb_object_agg(name,decrypted_secret) into output from vault.decrypted_secrets where name in ('shiftline_vapid_public','shiftline_vapid_private','shiftline_push_dispatch');
 return output;
end $$;
create function public.sl_push_batch() returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 update shiftline_private.push_deliveries set status='failed',last_error='lease_expired' where status='sending' and attempts>=5 and next_attempt<=clock_timestamp();
 with picked as (select id from shiftline_private.push_deliveries where status in ('pending','sending') and next_attempt<=clock_timestamp() and attempts<5 order by next_attempt limit 50 for update skip locked),
 claimed as (update shiftline_private.push_deliveries d set status='sending',lease=gen_random_uuid(),attempts=attempts+1,next_attempt=clock_timestamp()+interval '5 minutes' from picked where d.id=picked.id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'attempts',d.attempts,'notificationId',n.id,'title',n.title,'app',s.app,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key,'active',s.active and e.access_status='active')),'[]') into output
 from claimed d join public.sl_notifications n on n.id=d.notification_id join shiftline_private.push_subscriptions s on s.id=d.subscription_id join public.sl_employees e on e.id=s.employee_id and e.company_id=n.company_id;
 return output;
end $$;
create function public.sl_push_result(delivery uuid, token uuid, outcome text) returns void language plpgsql security definer set search_path='' as $$
begin
 if outcome not in ('sent','retry','gone','failed') then raise exception 'Invalid delivery outcome'; end if;
 if outcome='gone' then update shiftline_private.push_subscriptions set active=false where id=(select subscription_id from shiftline_private.push_deliveries where id=delivery and lease=token); end if;
 update shiftline_private.push_deliveries set status=case when outcome='sent' then 'sent' when outcome='retry' and attempts<5 then 'pending' else 'failed' end,
  next_attempt=clock_timestamp()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),last_error=case when outcome='sent' then null else outcome end
 where id=delivery and lease=token and status='sending';
end $$;
revoke all on function public.sl_push_configuration(text,text),public.sl_push_batch(),public.sl_push_result(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sl_push_configuration(text,text),public.sl_push_batch(),public.sl_push_result(uuid,uuid,text) to service_role;
