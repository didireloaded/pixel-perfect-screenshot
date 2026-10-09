-- Employees can acknowledge request decisions without changing the decision record.
create table public.sl_request_decision_reads (
 request_id uuid primary key references public.sl_requests,
 employee_id uuid not null references public.sl_employees,
 read_at timestamptz not null default clock_timestamp()
);
alter table public.sl_request_decision_reads enable row level security;
revoke all on public.sl_request_decision_reads from anon,authenticated;

alter function shiftline_private.snapshot() rename to snapshot_v4;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_v4();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object('readRequestIds',coalesce((
  select jsonb_agg(r.request_id) from public.sl_request_decision_reads r
  where r.employee_id=me.id
 ),'[]'::jsonb));
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_v6;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; request public.sl_requests;
begin
 if p_action<>'mark_request_read' then return shiftline_private.command_v6(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 select * into request from public.sl_requests
  where id=(p_data->>'id')::uuid and employee_id=me.id and company_id=me.company_id
   and status<>'pending';
 if request.id is null then raise exception 'No decision to mark as read'; end if;
 insert into public.sl_request_decision_reads(request_id,employee_id)
  values(request.id,me.id) on conflict do nothing;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$
 select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
