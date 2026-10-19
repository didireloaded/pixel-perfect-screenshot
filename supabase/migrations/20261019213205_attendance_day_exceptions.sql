create table public.sl_attendance_day_exceptions (
 id uuid primary key, revision bigint generated always as identity unique,
 company_id uuid not null references public.sl_companies, employee_id uuid,
 work_date date not null, kind text not null check(kind in ('off','hours','normal')),
 starts_at timestamptz, ends_at timestamptz, reason text not null check(length(trim(reason)) between 1 and 1000),
 created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id),
 foreign key(created_by,company_id) references public.sl_employees(id,company_id),
 check((kind in ('off','normal') and starts_at is null and ends_at is null) or (kind='hours' and employee_id is not null and starts_at is not null and ends_at>starts_at))
);
create index sl_day_exception_lookup on public.sl_attendance_day_exceptions(company_id,work_date,employee_id,revision);
create index sl_day_exception_employee on public.sl_attendance_day_exceptions(employee_id,company_id);
create index sl_day_exception_creator on public.sl_attendance_day_exceptions(created_by,company_id);
alter table public.sl_attendance_day_exceptions enable row level security;
revoke all on public.sl_attendance_day_exceptions from public,anon,authenticated;
create trigger sl_day_exceptions_immutable before update or delete on public.sl_attendance_day_exceptions
for each row execute function shiftline_private.immutable();

alter table public.sl_punctuality_records add constraint sl_punctuality_record_owner unique(id,employee_id,company_id);
create table public.sl_attendance_explanations (
 id uuid primary key, company_id uuid not null, employee_id uuid not null,
 record_id uuid, shift_id uuid,
 description text not null check(length(trim(description)) between 1 and 1000),
 submitted_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in ('pending','accepted','dismissed')),
 reviewed_by uuid, reviewed_at timestamptz, review_reason text,
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id),
 foreign key(record_id,employee_id,company_id) references public.sl_punctuality_records(id,employee_id,company_id),
 foreign key(shift_id,employee_id,company_id) references public.sl_shifts(id,employee_id,company_id),
 foreign key(reviewed_by,company_id) references public.sl_employees(id,company_id),
 check((record_id is null)<>(shift_id is null)),
 check((status='pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
  or (status<>'pending' and reviewed_by is not null and reviewed_at is not null and length(trim(review_reason)) between 1 and 1000))
);
create index sl_explanation_company on public.sl_attendance_explanations(company_id,submitted_at);
create index sl_explanation_employee on public.sl_attendance_explanations(employee_id,company_id);
create index sl_explanation_shift on public.sl_attendance_explanations(shift_id,employee_id,company_id);
create index sl_explanation_reviewer on public.sl_attendance_explanations(reviewed_by,company_id);
create unique index sl_explanation_pending_record on public.sl_attendance_explanations(record_id) where status='pending';
create unique index sl_explanation_pending_shift on public.sl_attendance_explanations(shift_id) where status='pending';
alter table public.sl_attendance_explanations enable row level security;
revoke all on public.sl_attendance_explanations from public,anon,authenticated;
create function shiftline_private.preserve_explanation() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status<>'pending' or
  (to_jsonb(new)-array['status','reviewed_by','reviewed_at','review_reason']) is distinct from
  (to_jsonb(old)-array['status','reviewed_by','reviewed_at','review_reason']) then raise exception 'Explanation evidence is immutable'; end if;
 return new;
end $$;
revoke all on function shiftline_private.preserve_explanation() from public,anon,authenticated;
create trigger sl_explanation_evidence before update or delete on public.sl_attendance_explanations
for each row execute function shiftline_private.preserve_explanation();

create function shiftline_private.day_exception(company uuid,employee uuid,day date) returns public.sl_attendance_day_exceptions
language sql stable set search_path='' as $$
 select x from public.sl_attendance_day_exceptions x where x.company_id=company and x.work_date=day
 and (x.employee_id=employee or x.employee_id is null)
 order by x.revision desc limit 1
$$;
revoke all on function shiftline_private.day_exception(uuid,uuid,date) from public,anon,authenticated;
create function shiftline_private.materialize_day_exceptions(company uuid,day date,at_time timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare p public.sl_punctuality_policies; co public.sl_companies;
begin
 select * into co from public.sl_companies where id=company;
 if day<>(at_time at time zone co.timezone)::date then return; end if;
 select * into p from public.sl_punctuality_policies where company_id=company and starts_on<=day order by starts_on desc,revision desc limit 1;
 if p.enabled is distinct from true then return; end if;
 insert into public.sl_punctuality_records(company_id,employee_id,work_date,policy_id,timezone,scheduled_at,expected_at,ends_at)
 select company,e.id,day,p.id,co.timezone,(day+p.start_time) at time zone co.timezone,x.starts_at,x.ends_at
 from public.sl_employees e cross join lateral shiftline_private.day_exception(company,e.id,day) x
 where e.company_id=company and e.id=any(p.employee_ids) and e.role='employee' and e.access_status='active' and e.user_id is not null and x.kind='hours'
 on conflict(employee_id,work_date) do nothing;
end $$;
revoke all on function shiftline_private.materialize_day_exceptions(uuid,date,timestamptz) from public,anon,authenticated;
-- The latest applicable explicit rule wins; original policy/evidence stay stored.
do $$ declare definition text; begin
 select pg_get_functiondef('shiftline_private.refresh_punctuality(uuid,date,timestamptz)'::regprocedure) into definition;
 if position('due:=coalesce(shiftline_private.job_expected_start(company,r.employee_id,day),r.scheduled_at);' in definition)=0 then
  raise exception 'Job reporting-time seam changed'; end if;
 definition:=replace(definition,'v_exemption text; stage integer;','v_exemption text; stage integer; day_rule public.sl_attendance_day_exceptions;');
 definition:=replace(definition,'for r in select * from public.sl_punctuality_records',
  'perform shiftline_private.materialize_day_exceptions(company,day,at_time); for r in select * from public.sl_punctuality_records');
 definition:=replace(definition,'due:=coalesce(shiftline_private.job_expected_start(company,r.employee_id,day),r.scheduled_at);',
  'day_rule:=shiftline_private.day_exception(company,r.employee_id,day); select (day+p.end_time) at time zone r.timezone into r.ends_at from public.sl_punctuality_policies p where p.id=r.policy_id; if day_rule.kind=''hours'' then r.ends_at:=day_rule.ends_at; end if; due:=coalesce(day_rule.starts_at,shiftline_private.job_expected_start(company,r.employee_id,day),r.scheduled_at);');
 definition:=replace(definition,'set expected_at=due,clock_in_at=arrival,','set expected_at=due,ends_at=r.ends_at,clock_in_at=arrival,');
 definition:=replace(definition,'-- Prior-day evidence overlapping',
  'if day_rule.kind=''off'' then v_exemption:=''Authorized day off or company closure''; elsif day_rule.kind=''normal'' and not exists(select 1 from public.sl_punctuality_policies p where p.id=r.policy_id and extract(isodow from day)::integer=any(p.weekdays)) then v_exemption:=''Not expected under normal hours''; end if; -- Prior-day evidence overlapping');
 execute definition;
end $$;

create function shiftline_private.attendance_context(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; day date; target uuid; starts timestamptz; ending timestamptz;
 rid uuid; rec public.sl_punctuality_records; sh public.sl_shifts; explanation public.sl_attendance_explanations; result jsonb;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then raise exception 'Invalid attendance context'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 day:=coalesce((payload->>'date')::date,(clock_timestamp() at time zone co.timezone)::date);
 if action='set_exception' then
  if me.access_role not in ('owner','hr','operations') then raise exception 'Manager access required' using errcode='42501'; end if;
  if day<(clock_timestamp() at time zone co.timezone)::date then raise exception 'Past expectations cannot be rewritten; use explanations'; end if;
  target:=nullif(payload->>'employeeId','')::uuid;
  if target is not null and not exists(select 1 from public.sl_employees where id=target and company_id=me.company_id and role='employee' and access_status='active') then raise exception 'Unknown company employee'; end if;
  if payload->>'kind'='hours' then
   starts:=(day+(payload->>'start')::time) at time zone co.timezone;
   ending:=(day+(payload->>'end')::time) at time zone co.timezone;
   if target is null or starts is null or ending is null or ending<=starts or (starts at time zone co.timezone)::time>=co.checkin_close_time then raise exception 'Choose an employee and hours before company check-in closes'; end if;
   select * into rec from public.sl_punctuality_records where employee_id=target and work_date=day;
   if rec.id is null and not exists(select 1 from (select * from public.sl_punctuality_policies where company_id=me.company_id and starts_on<=day order by starts_on desc,revision desc limit 1) p where p.enabled and target=any(p.employee_ids)) then
    raise exception 'First include this employee in a company expected-hours rule'; end if;
  elsif payload->>'kind' not in ('off','normal') or payload->>'kind' is null then raise exception 'Choose day off, normal or different hours'; end if;
  rid:=(payload->>'id')::uuid;
  if exists(select 1 from public.sl_attendance_day_exceptions x where x.id=rid and
   (x.company_id<>me.company_id or x.employee_id is distinct from target or x.work_date<>day or x.kind<>payload->>'kind'
   or x.starts_at is distinct from starts or x.ends_at is distinct from ending or x.reason<>trim(payload->>'reason'))) then raise exception 'Date exception ID conflict'; end if;
  insert into public.sl_attendance_day_exceptions(id,company_id,employee_id,work_date,kind,starts_at,ends_at,reason,created_by)
  values(rid,me.company_id,target,day,payload->>'kind',starts,ending,trim(payload->>'reason'),me.id) on conflict(id) do nothing;
  if day=(clock_timestamp() at time zone co.timezone)::date then perform shiftline_private.refresh_punctuality(me.company_id,day); end if;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'attendance_day_exception',jsonb_build_object('id',rid));
 elsif action='explain' then
  rid:=(payload->>'id')::uuid;
  select * into explanation from public.sl_attendance_explanations where id=rid;
  if explanation.id is not null then
   if explanation.employee_id<>me.id or explanation.description<>trim(payload->>'description') or explanation.record_id is distinct from nullif(payload->>'recordId','')::uuid or explanation.shift_id is distinct from nullif(payload->>'shiftId','')::uuid then raise exception 'Explanation ID conflict'; end if;
  else
   if nullif(payload->>'recordId','') is not null then
    select * into rec from public.sl_punctuality_records where id=(payload->>'recordId')::uuid and employee_id=me.id and company_id=me.company_id;
    if rec.id is null or rec.status not in ('late','no_checkin') then raise exception 'Choose your own attendance issue'; end if;
   else
    select * into sh from public.sl_shifts where id=(payload->>'shiftId')::uuid and employee_id=me.id and company_id=me.company_id;
    if sh.id is null or shiftline_private.state(sh.id) in ('not_clocked_in','clocked_out') or shiftline_private.workday_finish(sh,co.timezone)>clock_timestamp() then raise exception 'Choose your unresolved workday'; end if;
   end if;
   insert into public.sl_attendance_explanations(id,company_id,employee_id,record_id,shift_id,description)
   values(rid,me.company_id,me.id,rec.id,sh.id,trim(payload->>'description'));
  end if;
 elsif action='review' then
  if me.access_role not in ('owner','hr','operations') then raise exception 'Manager access required' using errcode='42501'; end if;
  select * into explanation from public.sl_attendance_explanations where id=(payload->>'id')::uuid and company_id=me.company_id for update;
  if explanation.id is null or explanation.employee_id=me.id then raise exception 'Independent company review required'; end if;
  if explanation.status<>'pending' or payload->>'decision' not in ('accepted','dismissed') or payload->>'decision' is null then raise exception 'Choose a pending explanation and decision'; end if;
  update public.sl_attendance_explanations set status=payload->>'decision',reviewed_by=me.id,reviewed_at=clock_timestamp(),review_reason=trim(payload->>'reason') where id=explanation.id;
  perform shiftline_private.notify_employee(explanation.employee_id,'attendance-explanation:'||explanation.id,'Your attendance explanation was reviewed','requests');
 elsif action<>'list' then raise exception 'Unknown attendance context action'; end if;
 if day=(clock_timestamp() at time zone co.timezone)::date then perform shiftline_private.refresh_punctuality(me.company_id,day); end if;
 select jsonb_build_object('exceptions',coalesce((select jsonb_agg(to_jsonb(x) order by revision desc) from public.sl_attendance_day_exceptions x
  where company_id=me.company_id and work_date=day and (me.access_role in ('owner','hr','operations') or employee_id=me.id or employee_id is null)),'[]'),
  'explanations',coalesce((select jsonb_agg(to_jsonb(x) order by submitted_at desc) from public.sl_attendance_explanations x
   where company_id=me.company_id and (me.access_role in ('owner','hr','operations') or employee_id=me.id)
   and (exists(select 1 from public.sl_punctuality_records r where r.id=x.record_id and r.work_date=day) or exists(select 1 from public.sl_shifts s where s.id=x.shift_id and s.date=day))),'[]'),
  'issues',coalesce((select jsonb_agg(item) from (
   select jsonb_build_object('key',r.id,'recordId',r.id,'employeeId',r.employee_id,'kind',r.status) item from public.sl_punctuality_records r
    where r.company_id=me.company_id and r.work_date=day and r.status in ('late','no_checkin') and (me.access_role in ('owner','hr','operations') or r.employee_id=me.id)
   union all select jsonb_build_object('key',s.id,'shiftId',s.id,'employeeId',s.employee_id,'kind','missing_clockout') from public.sl_shifts s
    where s.company_id=me.company_id and s.date=day and shiftline_private.state(s.id) not in ('not_clocked_in','clocked_out')
    and shiftline_private.workday_finish(s,co.timezone)<clock_timestamp() and (me.access_role in ('owner','hr','operations') or s.employee_id=me.id)
  ) q),'[]')) into result;
 if action<>'list' and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Attendance context refresh unavailable: %',sqlstate; end;
 end if;
 return result;
end $$;
create function public.sl_attendance_context(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select shiftline_private.attendance_context(action,payload)
$$;
revoke all on function public.sl_attendance_context(text,jsonb),shiftline_private.attendance_context(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_attendance_context(text,jsonb),shiftline_private.attendance_context(text,jsonb) to authenticated;
