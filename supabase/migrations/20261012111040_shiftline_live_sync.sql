-- Private, payload-free invalidations. Application records remain RPC-only.
create function shiftline_private.can_receive_updates(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from public.sl_employees e
   where e.user_id=auth.uid() and p_topic='shiftline:'||e.company_id::text
 );
$$;
revoke all on function shiftline_private.can_receive_updates(text) from public,anon,authenticated;
grant execute on function shiftline_private.can_receive_updates(text) to authenticated;

-- Embedded SQL tests have no Realtime service. Hosted Supabase has this schema.
do $$ begin
 if to_regclass('realtime.messages') is not null then
  execute 'create policy shiftline_receive_updates on realtime.messages for select to authenticated
    using (extension = ''broadcast'' and topic = (select realtime.topic())
      and shiftline_private.can_receive_updates((select realtime.topic())))';
 end if;
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_live_sync;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; company text;
begin
 result:=shiftline_private.command_before_live_sync(p_action,p_data);
 company:=result->'snapshot'->'company'->>'id';
 if company is not null and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin
   perform realtime.send('{}'::jsonb,'refresh','shiftline:'||company,true);
  exception when others then
   -- Realtime delivery cannot prevent an otherwise valid attendance write.
   -- The clients periodically re-read the authoritative snapshot as a fallback.
   raise log 'Shiftline live update unavailable: %',sqlstate;
  end;
 end if;
 return result;
end $$;
revoke all on function shiftline_private.command_before_live_sync(text,jsonb),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
