-- Replies stay in the manager-initiated message thread and retain tenant isolation.
alter table public.sl_messages add column thread_id uuid references public.sl_messages(id);
create index sl_messages_thread on public.sl_messages(thread_id,sent_at);

alter function shiftline_private.snapshot() rename to snapshot_v5;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_v5();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'threadId',coalesce(m.thread_id,m.id),'senderId',m.sender_id,
  'recipientId',m.recipient_id,'senderName',s.name,'title',m.title,'body',m.body,
  'sentAt',m.sent_at,'readAt',m.read_at) order by m.sent_at desc,m.id desc)
  from public.sl_messages m join public.sl_employees s on s.id=m.sender_id
  where m.company_id=me.company_id and (m.sender_id=me.id or m.recipient_id=me.id)),'[]'::jsonb));
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_v7;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; root public.sl_messages; target public.sl_employees;
begin
 if p_action<>'reply_message' then return shiftline_private.command_v7(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 select * into root from public.sl_messages where id=(p_data->>'threadId')::uuid
  and thread_id is null and company_id=me.company_id for share;
 if root.id is null or not (
  (me.role='manager' and root.sender_id=me.id) or
  (me.role='employee' and root.recipient_id=me.id)) then
  raise exception 'Conversation unavailable';
 end if;
 if me.role='manager' then select * into target from public.sl_employees where id=root.recipient_id;
 else select * into target from public.sl_employees where id=root.sender_id and role='manager'; end if;
 if target.id is null or target.company_id<>me.company_id then raise exception 'Conversation unavailable'; end if;
 if nullif(trim(coalesce(p_data->>'body','')),'') is null or length(trim(p_data->>'body'))>2000 then
  raise exception 'Message must be 1 to 2000 characters'; end if;
 insert into public.sl_messages(company_id,recipient_id,sender_id,title,body,thread_id)
  values(me.company_id,target.id,me.id,root.title,trim(p_data->>'body'),root.id);
 insert into public.sl_audit(company_id,actor,action,detail)
  values(me.company_id,me.id,p_action,jsonb_build_object('threadId',root.id));
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
