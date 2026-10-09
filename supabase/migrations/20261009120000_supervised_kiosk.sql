-- Supervised kiosk: a signed-in manager's device, plus employee number and a private serial code.
create table public.sl_kiosk_codes (
 employee_id uuid primary key references public.sl_employees, company_id uuid not null references public.sl_companies,
 code_hash text not null, expires_at timestamptz not null, revoked boolean not null default false,
 failed_attempts integer not null default 0, locked_until timestamptz,
 issued_by uuid not null references public.sl_employees, issued_at timestamptz not null default now()
);
alter table public.sl_kiosk_codes enable row level security;
revoke all on public.sl_kiosk_codes from anon,authenticated;

alter function shiftline_private.command(text,jsonb) rename to command_v3;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; code public.sl_kiosk_codes; shift public.sl_shifts; secret text; old_uid text; result jsonb; kind text;
begin
 if p_action not in ('issue_kiosk_code','revoke_kiosk_code','kiosk_clock') then return shiftline_private.command_v3(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and role='manager';
 if me.id is null then raise exception 'Manager access required'; end if;
 if p_action='issue_kiosk_code' then
  select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=me.company_id and user_id is not null;
  if target.id is null then raise exception 'Activate this employee first'; end if;
  secret:=replace(gen_random_uuid()::text,'-','');
  insert into public.sl_kiosk_codes(employee_id,company_id,code_hash,expires_at,issued_by)
  values(target.id,me.company_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),now()+interval '30 days',me.id)
  on conflict(employee_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,revoked=false,failed_attempts=0,locked_until=null,issued_by=excluded.issued_by,issued_at=now();
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'issue_kiosk_code',jsonb_build_object('employeeId',target.id));
  return jsonb_build_object('kioskCode',secret,'employeeNumber',target.no,'snapshot',shiftline_private.snapshot());
 elsif p_action='revoke_kiosk_code' then
  update public.sl_kiosk_codes set revoked=true where employee_id=(p_data->>'employeeId')::uuid and company_id=me.company_id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'revoke_kiosk_code',jsonb_build_object('employeeId',p_data->>'employeeId'));
  return jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 -- Invalid codes return a status so failed-attempt counters commit instead of rolling back.
 select * into target from public.sl_employees where no=trim(p_data->>'employeeNo') and company_id=me.company_id and user_id is not null;
 if target.id is null then return jsonb_build_object('status','invalid_code','snapshot',shiftline_private.snapshot()); end if;
 select * into code from public.sl_kiosk_codes where employee_id=target.id and company_id=me.company_id for update;
 if code.employee_id is null or code.revoked or code.expires_at<=now() or (code.locked_until is not null and code.locked_until>now()) then
  return jsonb_build_object('status','invalid_code','snapshot',shiftline_private.snapshot());
 end if;
 if length(coalesce(p_data->>'code',''))<>32 or code.code_hash<>encode(sha256(convert_to(p_data->>'code','UTF8')),'hex') then
  update public.sl_kiosk_codes set failed_attempts=case when failed_attempts>=4 then 0 else failed_attempts+1 end,locked_until=case when failed_attempts>=4 then now()+interval '10 minutes' else null end where employee_id=target.id;
  return jsonb_build_object('status','invalid_code','snapshot',shiftline_private.snapshot());
 end if;
 kind:=p_data->>'type';
 if kind not in ('clock_in','start_lunch','end_lunch','start_job','end_job','start_personal','end_personal','clock_out') then raise exception 'Choose an attendance action'; end if;
 select * into shift from public.sl_shifts where employee_id=target.id and date=(now() at time zone (select timezone from public.sl_companies where id=me.company_id))::date;
 if shift.id is null then raise exception 'No assigned shift today'; end if;
 update public.sl_kiosk_codes set failed_attempts=0,locked_until=null where employee_id=target.id;
 old_uid:=auth.uid()::text;
 perform set_config('request.jwt.claim.sub',target.user_id::text,true);
 result:=shiftline_private.submit(jsonb_build_object('id',(p_data->>'id')::uuid,'type',kind,'shiftId',shift.id,'capturedAt',clock_timestamp(),'offline',false,'location',p_data->'location','jobId',p_data->>'jobId','reason',p_data->>'reason','note',p_data->>'note'));
 perform set_config('request.jwt.claim.sub',old_uid,true);
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'kiosk_attendance',jsonb_build_object('employeeId',target.id,'type',kind,'status',result->>'status'));
 return result||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
