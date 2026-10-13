create function shiftline_private.enqueue_finish_reminders() returns void language plpgsql security definer set search_path='' as $$
declare work record;
begin
 for work in select s.id,s.employee_id from public.sl_shifts s join public.sl_companies c on c.id=s.company_id
 where s.date=(clock_timestamp() at time zone c.timezone)::date and s.end_time<=(clock_timestamp() at time zone c.timezone)::time
 and shiftline_private.state(s.id) not in ('not_clocked_in','clocked_out') loop
  perform shiftline_private.notify_employee(work.employee_id,'finish:'||work.id,'Your expected workday finish has arrived','hours');
 end loop;
end $$;
revoke all on function shiftline_private.enqueue_finish_reminders() from public,anon,authenticated;
-- The isolated test runtime has no network extensions. Hosted cron uses Vault,
-- so no dispatch secret is embedded in migration history or scheduler text.
do $$
begin
 if exists(select 1 from pg_available_extensions where name='pg_net') and exists(select 1 from pg_namespace where nspname='cron') then
  execute 'create extension if not exists pg_net';
  perform cron.schedule('shiftline-push-delivery','* * * * *',$job$
    select shiftline_private.enqueue_finish_reminders();
    select net.http_post(
      url:='https://hfhiuxijpbujoahtnkjt.supabase.co/functions/v1/push-dispatch',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='shiftline_push_dispatch' limit 1)),
      body:='{}'::jsonb, timeout_milliseconds:=120000);
  $job$);
 end if;
end $$;
