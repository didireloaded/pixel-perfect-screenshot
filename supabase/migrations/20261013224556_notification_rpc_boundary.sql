-- Match the application's RPC-only boundary: public invoker, private validated owner logic.
alter function public.sl_notifications_api(text,jsonb) set schema shiftline_private;
create function public.sl_notifications_api(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select shiftline_private.sl_notifications_api(action,payload)
$$;
revoke all on function public.sl_notifications_api(text,jsonb),shiftline_private.sl_notifications_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_notifications_api(text,jsonb),shiftline_private.sl_notifications_api(text,jsonb) to authenticated;
do $$ begin
 if exists(select 1 from pg_namespace where nspname='net') then
  execute 'revoke usage on schema net from public,anon,authenticated';
  execute 'revoke all on all functions in schema net from public,anon,authenticated';
 end if;
end $$;
