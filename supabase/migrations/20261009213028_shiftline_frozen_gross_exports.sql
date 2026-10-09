-- Read frozen runs before consulting mutable rate history. Keep this additive for
-- local databases that already applied the earlier workflow migration.
alter function shiftline_private.command(text,jsonb) rename to command_v4;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; period public.sl_periods; frozen public.sl_gross_runs;
begin
 if p_action not in ('create_gross_run','export_gross_run') then
  return shiftline_private.command_v4(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null or me.role<>'manager' then raise exception 'Manager access required'; end if;
 if not me.payroll_admin then raise exception 'Payroll administrator required'; end if;
 select * into period from public.sl_periods
  where id=(p_data->>'periodId')::uuid and company_id=me.company_id;
 if period.id is null then raise exception 'Lock the payroll period first'; end if;
 select * into frozen from public.sl_gross_runs
  where period_id=period.id and company_id=me.company_id;
 if frozen.id is not null then
  insert into public.sl_audit(company_id,actor,action,detail)
   values(me.company_id,me.id,p_action,jsonb_build_object('periodId',period.id,'runId',frozen.id));
  return jsonb_build_object('rows',coalesce(frozen.rows,'[]'::jsonb),
   'grossRunId',frozen.id,'snapshot',shiftline_private.snapshot());
 end if;
 if p_action='export_gross_run' then raise exception 'Create the gross pay run first'; end if;
 if not exists (
  select 1 from public.sl_timesheets t join public.sl_shifts s on s.id=t.shift_id
  where s.company_id=me.company_id and s.date between period.start_date and period.end_date
   and t.calculation_id is not null
 ) then raise exception 'No approved timesheets in this period'; end if;
 return shiftline_private.command_v4(p_action,p_data);
end $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select shiftline_private.command(p_action,p_data);
$$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
