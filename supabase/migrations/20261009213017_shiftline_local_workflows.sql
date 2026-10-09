-- Local and hosted workflow additions. No location coordinates are retained for site alerts.
create table public.sl_notices (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 kind text not null check(kind in ('holiday','closure','early_release','announcement')),
 title text not null check(length(trim(title)) between 1 and 120), body text not null default '' check(length(body)<=1000),
 starts_on date not null, ends_on date not null, requires_ack boolean not null default false,
 created_by uuid not null references public.sl_employees, created_at timestamptz not null default now(),
 check(ends_on>=starts_on)
);
create index sl_notices_company_dates on public.sl_notices(company_id,starts_on,ends_on);
create table public.sl_notice_acks (
 notice_id uuid not null references public.sl_notices, employee_id uuid not null references public.sl_employees,
 acknowledged_at timestamptz not null default now(), primary key(notice_id,employee_id)
);
create table public.sl_site_alerts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees, shift_id uuid not null references public.sl_shifts,
 kind text not null check(kind in ('exit','return')), distance_m integer not null check(distance_m>=0),
 accuracy_m integer not null check(accuracy_m>=0), observed_at timestamptz not null default clock_timestamp(),
 source text not null check(source in ('web','native'))
);
create index sl_site_alerts_shift on public.sl_site_alerts(shift_id,observed_at desc);
create table public.sl_pay_rates (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 employee_id uuid not null references public.sl_employees, effective_on date not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'), hourly_minor integer not null check(hourly_minor between 1 and 100000000),
 overtime_multiplier_bp integer not null check(overtime_multiplier_bp between 10000 and 30000),
 created_by uuid not null references public.sl_employees, created_at timestamptz not null default now(),
 unique(employee_id,effective_on)
);
create table public.sl_gross_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 period_id uuid not null unique references public.sl_periods, rows jsonb not null,
 created_by uuid not null references public.sl_employees, created_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['sl_notices','sl_notice_acks','sl_site_alerts','sl_pay_rates','sl_gross_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop; end $$;
create trigger sl_notices_immutable before update or delete on public.sl_notices for each row execute function shiftline_private.immutable();
create trigger sl_notice_acks_immutable before update or delete on public.sl_notice_acks for each row execute function shiftline_private.immutable();
create trigger sl_site_alerts_immutable before update or delete on public.sl_site_alerts for each row execute function shiftline_private.immutable();
create trigger sl_pay_rates_immutable before update or delete on public.sl_pay_rates for each row execute function shiftline_private.immutable();
create trigger sl_gross_runs_immutable before update or delete on public.sl_gross_runs for each row execute function shiftline_private.immutable();

alter function shiftline_private.snapshot() rename to snapshot_v2;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_v2(); if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object(
 'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,'body',n.body,'startsOn',n.starts_on,'endsOn',n.ends_on,'requiresAck',n.requires_ack,'acknowledged',a.notice_id is not null,'createdAt',n.created_at) order by n.starts_on desc) from public.sl_notices n left join public.sl_notice_acks a on a.notice_id=n.id and a.employee_id=me.id where n.company_id=me.company_id and (me.role='manager' or n.ends_on>=current_date-30)),'[]'::jsonb),
 'siteAlerts',case when me.role='manager' then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'shiftId',a.shift_id,'kind',a.kind,'distanceM',a.distance_m,'accuracyM',a.accuracy_m,'observedAt',a.observed_at,'source',a.source) order by a.observed_at desc) from (select * from public.sl_site_alerts where company_id=me.company_id order by observed_at desc limit 100)a),'[]'::jsonb) else '[]'::jsonb end,
 'payRates',case when me.role='manager' and me.payroll_admin then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'effectiveOn',r.effective_on,'currency',r.currency,'hourlyMinor',r.hourly_minor,'overtimeMultiplierBp',r.overtime_multiplier_bp) order by r.effective_on desc) from public.sl_pay_rates r where r.company_id=me.company_id),'[]'::jsonb) else '[]'::jsonb end,
 'grossRuns',case when me.role='manager' and me.payroll_admin then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'periodId',r.period_id,'createdAt',r.created_at,'rows',r.rows) order by r.created_at desc) from public.sl_gross_runs r where r.company_id=me.company_id),'[]'::jsonb) else '[]'::jsonb end);
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_v2;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; site public.sl_sites; n public.sl_notices; period public.sl_periods;
 lat double precision; lon double precision; accuracy double precision; meters double precision; last_kind text; alert_kind text; now_local timestamp; out_rows jsonb; new_id uuid; rate_count integer;
begin
 if p_action not in ('create_notice','ack_notice','report_position','set_pay_rate','create_gross_run','export_gross_run') then
  return shiftline_private.command_v2(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 if p_action in ('create_notice','set_pay_rate','create_gross_run','export_gross_run') and me.role<>'manager' then raise exception 'Manager access required'; end if;
 if p_action in ('set_pay_rate','create_gross_run','export_gross_run') and not me.payroll_admin then raise exception 'Payroll administrator required'; end if;
 if p_action='create_notice' then
  if p_data->>'kind' not in ('holiday','closure','early_release','announcement') then raise exception 'Choose a notice type'; end if;
  insert into public.sl_notices(company_id,kind,title,body,starts_on,ends_on,requires_ack,created_by)
  values(co.id,p_data->>'kind',trim(p_data->>'title'),coalesce(p_data->>'body',''),(p_data->>'startsOn')::date,(p_data->>'endsOn')::date,coalesce((p_data->>'requiresAck')::boolean,false),me.id);
 elsif p_action='ack_notice' then
  select * into n from public.sl_notices where id=(p_data->>'id')::uuid and company_id=co.id;
  if n.id is null then raise exception 'Unknown notice'; end if;
  insert into public.sl_notice_acks(notice_id,employee_id) values(n.id,me.id) on conflict do nothing;
 elsif p_action='report_position' then
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id and employee_id=me.id;
  if sh.id is null then raise exception 'Unknown shift'; end if;
  select * into site from public.sl_sites where id=sh.site_id;
  now_local:=clock_timestamp() at time zone co.timezone;
  if now_local::date<>sh.date or now_local::time<sh.start_time or now_local::time>=sh.end_time then raise exception 'Location window is closed'; end if;
  if shiftline_private.state(sh.id)<>'working' then raise exception 'Location check is paused'; end if;
  if site.latitude is null then raise exception 'Site geofence is not configured'; end if;
  lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision; accuracy:=(p_data->>'accuracyM')::double precision;
  if lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy<0 or accuracy>site.max_accuracy_m or lat='NaN'::double precision or lon='NaN'::double precision or accuracy='NaN'::double precision then raise exception 'Location accuracy is insufficient'; end if;
  meters:=shiftline_private.distance(site.latitude,site.longitude,lat,lon);
  select kind into last_kind from public.sl_site_alerts where shift_id=sh.id order by observed_at desc limit 1;
  alert_kind:=case when meters>site.radius_m+accuracy and coalesce(last_kind,'return')='return' then 'exit' when meters+accuracy<site.radius_m and last_kind='exit' then 'return' else null end;
  if alert_kind is not null then
   insert into public.sl_site_alerts(company_id,employee_id,shift_id,kind,distance_m,accuracy_m,source)
   values(co.id,me.id,sh.id,alert_kind,round(meters)::integer,round(accuracy)::integer,case when p_data->>'source'='native' then 'native' else 'web' end);
  end if;
  return jsonb_build_object('status',case when alert_kind is null then 'inside_or_unchanged' else alert_kind end,'snapshot',shiftline_private.snapshot());
 elsif p_action='set_pay_rate' then
  if not exists(select 1 from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id) then raise exception 'Unknown employee'; end if;
  insert into public.sl_pay_rates(company_id,employee_id,effective_on,currency,hourly_minor,overtime_multiplier_bp,created_by)
  values(co.id,(p_data->>'employeeId')::uuid,(p_data->>'effectiveOn')::date,upper(p_data->>'currency'),(p_data->>'hourlyMinor')::integer,(p_data->>'overtimeMultiplierBp')::integer,me.id);
 elsif p_action in ('create_gross_run','export_gross_run') then
  select * into period from public.sl_periods where id=(p_data->>'periodId')::uuid and company_id=co.id;
  if period.id is null then raise exception 'Lock the payroll period first'; end if;
  select count(*) into rate_count from public.sl_shifts s where s.company_id=co.id and s.date between period.start_date and period.end_date and not exists(select 1 from public.sl_pay_rates r where r.employee_id=s.employee_id and r.effective_on<=s.date);
  if rate_count>0 then raise exception 'Set a pay rate for every employee in this period'; end if;
  select jsonb_agg(jsonb_build_object('employee_number',e.no,'shift_date',s.date,'regular_seconds',(c.calculation->>'regularSeconds')::bigint,'overtime_seconds_approved',(c.calculation->>'overtimeSecondsApproved')::bigint,'hourly_rate_minor',r.hourly_minor,'overtime_multiplier_bp',r.overtime_multiplier_bp,'currency',r.currency,'gross_minor',round(((c.calculation->>'regularSeconds')::numeric*r.hourly_minor + (c.calculation->>'overtimeSecondsApproved')::numeric*r.hourly_minor*r.overtime_multiplier_bp/10000)/3600)::bigint) order by e.no,s.date) into out_rows
  from public.sl_shifts s join public.sl_employees e on e.id=s.employee_id join public.sl_timesheets t on t.shift_id=s.id join public.sl_calculations c on c.id=t.calculation_id join lateral(select * from public.sl_pay_rates r where r.employee_id=s.employee_id and r.effective_on<=s.date order by effective_on desc limit 1)r on true where s.company_id=co.id and s.date between period.start_date and period.end_date;
  if p_action='create_gross_run' then
   insert into public.sl_gross_runs(company_id,period_id,rows,created_by) values(co.id,period.id,out_rows,me.id) on conflict(period_id) do nothing;
  end if;
  select id,rows into new_id,out_rows from public.sl_gross_runs where period_id=period.id;
  if new_id is null then raise exception 'Create the gross pay run first'; end if;
  insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,jsonb_build_object('periodId',period.id,'runId',new_id));
  return jsonb_build_object('rows',out_rows,'grossRunId',new_id,'snapshot',shiftline_private.snapshot());
 end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,p_data - 'latitude' - 'longitude');
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
