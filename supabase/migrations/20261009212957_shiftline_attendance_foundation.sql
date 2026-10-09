create schema if not exists shiftline_private;
revoke all on schema shiftline_private from public;
create table public.sl_companies(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),timezone text not null default 'Africa/Windhoek');
create table public.sl_sites(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,name text not null check(length(name) between 1 and 100),address text not null default '' check(length(address)<=200));
create table public.sl_employees(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,user_id uuid unique references auth.users(id),no text not null check(length(no) between 1 and 40),name text not null check(length(name) between 1 and 100),team text not null default '',site_id uuid not null references public.sl_sites,role text not null check(role in ('manager','employee')),activation_hash text,activation_expires timestamptz,unique(company_id,no));
create table public.sl_shifts(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,site_id uuid not null references public.sl_sites,date date not null,start_time time not null,end_time time not null,lunch_time time not null,lunch_minutes integer not null check(lunch_minutes between 0 and 120),regular_minutes integer not null default 480 check(regular_minutes between 1 and 1440),check(end_time>start_time),check(lunch_time>=start_time and lunch_time<end_time),unique(employee_id,date));
create table public.sl_jobs(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,shift_id uuid not null references public.sl_shifts,title text not null check(length(title) between 1 and 100),instructions text not null default '' check(length(instructions)<=1000),destination text not null check(length(destination) between 1 and 200),supervisor text not null,start_time time not null,end_time time not null check(end_time>start_time),status text not null default 'assigned' check(status in ('assigned','in_progress','completed')));
create table public.sl_events(seq bigint generated always as identity unique,id uuid primary key,company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,shift_id uuid not null references public.sl_shifts,type text not null check(type in ('clock_in','start_lunch','end_lunch','start_job','end_job','start_personal','end_personal','clock_out')),captured_at timestamptz not null default clock_timestamp(),received_at timestamptz not null default clock_timestamp(),job_id uuid references public.sl_jobs,note text not null default '' check(length(note)<=140));
create index sl_events_shift on public.sl_events(shift_id,seq);
create table public.sl_requests(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,kind text not null check(kind in ('leave','personal_departure','missing_clocking','correction','emergency')),summary text not null check(length(summary) between 1 and 200),detail text not null default '' check(length(detail)<=1000),submitted_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','approved','declined')),reviewer text,reason text,expected_return text,approval_required boolean not null default true);
create table public.sl_timesheets(shift_id uuid primary key references public.sl_shifts,company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,status text not null default 'open' check(status in ('open','submitted','approved')),overtime_requested integer not null default 0 check(overtime_requested>=0),overtime_approved integer not null default 0 check(overtime_approved>=0),reviewed_by uuid references public.sl_employees,reviewed_at timestamptz,check(overtime_approved<=overtime_requested));
create table public.sl_periods(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,start_date date not null,end_date date not null check(end_date>=start_date),locked_by uuid not null references public.sl_employees,locked_at timestamptz not null default now(),rows jsonb not null);
create table public.sl_audit(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,actor uuid not null references public.sl_employees,at timestamptz not null default now(),action text not null,detail jsonb not null);
do $$ declare t text; begin foreach t in array array['sl_companies','sl_sites','sl_employees','sl_shifts','sl_jobs','sl_events','sl_requests','sl_timesheets','sl_periods','sl_audit'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop; end $$;

create function shiftline_private.totals(p_shift uuid) returns jsonb language sql stable set search_path='' as $$
 with intervals as (select type,captured_at,lead(captured_at) over(order by seq) as next_at from public.sl_events where shift_id=p_shift), counts as (
 select coalesce(floor(sum(case when type in ('clock_in','end_lunch','start_job','end_job','end_personal') then extract(epoch from next_at-captured_at) else 0 end)/60),0)::int as work,
 coalesce(floor(sum(case when type='start_lunch' then extract(epoch from next_at-captured_at) else 0 end)/60),0)::int as lunch,
 coalesce(floor(sum(case when type='start_personal' then extract(epoch from next_at-captured_at) else 0 end)/60),0)::int as personal,
 coalesce(bool_or(type='clock_out'),false) as complete,coalesce(bool_or(type='clock_in'),false) as started from intervals)
 select jsonb_build_object('workedMinutes',least(work,s.regular_minutes)+coalesce(t.overtime_approved,0),'recordedMinutes',work,'regularMinutes',least(work,s.regular_minutes),'overtimeMinutes',coalesce(t.overtime_approved,0),'unapprovedOvertimeMinutes',greatest(0,work-s.regular_minutes)-coalesce(t.overtime_approved,0),'lunchMinutes',lunch,'personalMinutes',personal,'missingClockOut',started and not complete,'complete',complete)
 from counts cross join public.sl_shifts s left join public.sl_timesheets t on t.shift_id=s.id where s.id=p_shift;
$$;

create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; company public.sl_companies; day date; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then return jsonb_build_object('onboarding',true); end if;
 select * into company from public.sl_companies where id=me.company_id;
 day:=(now() at time zone company.timezone)::date;
 select jsonb_build_object('me',me.id,'role',me.role,'company',jsonb_build_object('id',company.id,'name',company.name,'timezone',company.timezone),'today',day,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'no',e.no,'name',e.name,'team',e.team,'siteId',e.site_id,'role',e.role,'activated',e.user_id is not null) order by e.name) from public.sl_employees e where e.company_id=company.id and (me.role='manager' or e.id=me.id)),'[]'::jsonb),
 'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address)) from public.sl_sites where company_id=company.id),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'employeeId',s.employee_id,'date',s.date,'start',to_char(s.start_time,'HH24:MI'),'end',to_char(s.end_time,'HH24:MI'),'lunch',to_char(s.lunch_time,'HH24:MI'),'lunchMinutes',s.lunch_minutes,'trackingStop',to_char(s.end_time,'HH24:MI'),'siteId',s.site_id,'regularMinutes',s.regular_minutes,'totals',shiftline_private.totals(s.id)) order by s.date desc) from public.sl_shifts s where s.company_id=company.id and (me.role='manager' or s.employee_id=me.id)),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'employeeId',e.employee_id,'shiftId',e.shift_id,'type',e.type,'capturedAt',floor(extract(epoch from e.captured_at)*1000),'receivedAt',floor(extract(epoch from e.received_at)*1000),'sync','synced','jobId',e.job_id,'note',e.note) order by e.seq) from public.sl_events e where e.company_id=company.id and (me.role='manager' or e.employee_id=me.id)),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'instructions',j.instructions,'date',s.date,'start',to_char(j.start_time,'HH24:MI'),'end',to_char(j.end_time,'HH24:MI'),'destination',j.destination,'supervisor',j.supervisor,'status',j.status,'assignee',j.employee_id,'shiftId',j.shift_id)) from public.sl_jobs j join public.sl_shifts s on s.id=j.shift_id where j.company_id=company.id and (me.role='manager' or j.employee_id=me.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'employeeId',employee_id,'kind',kind,'summary',summary,'detail',detail,'submittedAt',floor(extract(epoch from submitted_at)*1000),'status',status,'reviewer',reviewer,'reason',reason,'approvalRequired',approval_required,'expectedReturn',expected_return) order by submitted_at desc) from public.sl_requests where company_id=company.id and (me.role='manager' or employee_id=me.id)),'[]'::jsonb),
 'timesheets',coalesce((select jsonb_agg(jsonb_build_object('shiftId',t.shift_id,'employeeId',t.employee_id,'date',s.date,'status',t.status,'overtimeRequested',t.overtime_requested,'overtimeApproved',t.overtime_approved,'overtimeStatus',case when t.overtime_requested=0 then 'none' when t.status='approved' and t.overtime_approved>0 then 'approved' when t.status='approved' then 'declined' else 'pending' end)) from public.sl_timesheets t join public.sl_shifts s on s.id=t.shift_id where t.company_id=company.id and (me.role='manager' or t.employee_id=me.id)),'[]'::jsonb),
 'periods',coalesce((select jsonb_agg(jsonb_build_object('id',id,'start',start_date,'end',end_date,'lockedAt',locked_at)) from public.sl_periods where company_id=company.id),'[]'::jsonb),
 'audit',case when me.role='manager' then coalesce((select jsonb_agg(a) from (select a.id,floor(extract(epoch from a.at)*1000) as at,e.name as actor,a.action,a.detail::text as detail from public.sl_audit a join public.sl_employees e on e.id=a.actor where a.company_id=company.id order by a.at desc limit 100) a),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $$;

create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; target public.sl_employees; ev public.sl_events; req public.sl_requests; ts public.sl_timesheets; jb public.sl_jobs; code text; new_id uuid; site uuid; event_id uuid; day date; previous text; state text; event_type text; totals jsonb; rows jsonb; lo date; hi date; ot int; output jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 -- Per-user lock prevents concurrent company setup/activation for the same account.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if p_action='setup' then
  if me.id is not null then raise exception 'Account already belongs to a company'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'Choose a valid timezone'; end if;
  insert into public.sl_companies(name,timezone) values(trim(p_data->>'company'),p_data->>'timezone') returning * into co;
  insert into public.sl_sites(company_id,name,address) values(co.id,trim(p_data->>'site'),coalesce(p_data->>'address','')) returning id into site;
  insert into public.sl_employees(company_id,user_id,no,name,site_id,role) values(co.id,auth.uid(),'manager-1',trim(p_data->>'name'),site,'manager') returning * into me;
 elsif p_action='activate' then
  if me.id is not null then raise exception 'Account is already activated'; end if;
  select * into target from public.sl_employees where activation_hash=encode(sha256(convert_to(p_data->>'code','UTF8')),'hex') for update;
  if target.id is null or target.user_id is not null or target.activation_expires<now() or target.no<>p_data->>'employeeNo' then raise exception 'Invalid or expired activation code'; end if;
  update public.sl_employees set user_id=auth.uid(),activation_hash=null,activation_expires=null where id=target.id returning * into me;
 else
  if me.id is null then raise exception 'Activate your account first'; end if;
 end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 day:=(now() at time zone co.timezone)::date;
 if p_action in ('create_employee','issue_activation','assign_shift','create_job','review_request','approve_timesheet','lock_period','export_period','create_site') and me.role<>'manager' then raise exception 'Manager access required'; end if;
 if p_action='create_site' then
  insert into public.sl_sites(company_id,name,address) values(co.id,trim(p_data->>'name'),coalesce(p_data->>'address',''));
 elsif p_action in ('create_employee','issue_activation') then
  code:=replace(gen_random_uuid()::text,'-','');
  if p_action='create_employee' then
   site:=(p_data->>'siteId')::uuid;
   if not exists(select 1 from public.sl_sites where id=site and company_id=co.id) then raise exception 'Unknown site'; end if;
   insert into public.sl_employees(company_id,no,name,team,site_id,role,activation_hash,activation_expires) values(co.id,trim(p_data->>'no'),trim(p_data->>'name'),coalesce(p_data->>'team',''),site,'employee',encode(sha256(convert_to(code,'UTF8')),'hex'),now()+interval '48 hours') returning id into new_id;
  else
   select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id;
   if target.id is null or target.user_id is not null then raise exception 'Employee is already activated or does not exist'; end if;
   update public.sl_employees set activation_hash=encode(sha256(convert_to(code,'UTF8')),'hex'),activation_expires=now()+interval '48 hours' where id=target.id; new_id:=target.id;
  end if;
  output:=jsonb_build_object('activationCode',code,'employeeId',new_id);
 elsif p_action='assign_shift' then
  select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id; site:=(p_data->>'siteId')::uuid;
  if target.id is null or not exists(select 1 from public.sl_sites where id=site and company_id=co.id) then raise exception 'Unknown employee or site'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and (p_data->>'date')::date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  insert into public.sl_shifts(company_id,employee_id,site_id,date,start_time,end_time,lunch_time,lunch_minutes,regular_minutes) values(co.id,target.id,site,(p_data->>'date')::date,(p_data->>'start')::time,(p_data->>'end')::time,(p_data->>'lunch')::time,(p_data->>'lunchMinutes')::int,(p_data->>'regularMinutes')::int) returning id into new_id;
  insert into public.sl_timesheets(shift_id,company_id,employee_id) values(new_id,co.id,target.id);
 elsif p_action='create_job' then
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id;
  if sh.id is null then raise exception 'Assign a shift first'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  if (p_data->>'start')::time<sh.start_time or (p_data->>'end')::time>sh.end_time then raise exception 'Job must be inside its assigned shift'; end if;
  insert into public.sl_jobs(company_id,employee_id,shift_id,title,instructions,destination,supervisor,start_time,end_time) values(co.id,sh.employee_id,sh.id,trim(p_data->>'title'),coalesce(p_data->>'instructions',''),trim(p_data->>'destination'),me.name,(p_data->>'start')::time,(p_data->>'end')::time);
 elsif p_action='transition' then
  event_id:=(p_data->>'id')::uuid; event_type:=p_data->>'type';
  select * into ev from public.sl_events where id=event_id;
  if ev.id is not null then
   if ev.employee_id<>me.id or ev.type<>event_type or (event_type='start_job' and ev.job_id is distinct from nullif(p_data->>'jobId','')::uuid) then raise exception 'Event ID conflict'; end if;
   return jsonb_build_object('duplicate',true,'snapshot',shiftline_private.snapshot());
  end if;
  select * into sh from public.sl_shifts where employee_id=me.id and date=day for update;
  if sh.id is null then raise exception 'No shift assigned for today'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  select * into ts from public.sl_timesheets where shift_id=sh.id;
  if ts.status<>'open' then raise exception 'Timesheet has been submitted'; end if;
  select type into previous from public.sl_events where shift_id=sh.id order by seq desc limit 1;
  state:=case when previous is null then 'not_clocked_in' when previous='start_lunch' then 'on_lunch' when previous='start_job' then 'on_job' when previous='start_personal' then 'on_personal' when previous='clock_out' then 'clocked_out' else 'working' end;
  if not ((event_type='clock_in' and state='not_clocked_in') or (event_type in ('start_lunch','start_job','start_personal') and state='working') or (event_type='end_lunch' and state='on_lunch') or (event_type='end_job' and state='on_job') or (event_type='end_personal' and state='on_personal') or (event_type='clock_out' and state in ('working','on_job'))) then raise exception 'Action is not allowed in the current attendance state'; end if;
  new_id:=null;
  if event_type='start_job' then
   select * into jb from public.sl_jobs where id=(p_data->>'jobId')::uuid and shift_id=sh.id and employee_id=me.id and status='assigned';
   if jb.id is null then raise exception 'Choose an assigned job for this shift'; end if;
   new_id:=jb.id; update public.sl_jobs set status='in_progress' where id=jb.id;
  elsif state='on_job' then
   select job_id into new_id from public.sl_events where shift_id=sh.id and type='start_job' order by seq desc limit 1;
   update public.sl_jobs set status='completed' where id=new_id;
  end if;
  insert into public.sl_events(id,company_id,employee_id,shift_id,type,job_id,note) values(event_id,co.id,me.id,sh.id,event_type,new_id,coalesce(p_data->>'note',''));
  if event_type='start_personal' then
   insert into public.sl_requests(company_id,employee_id,kind,summary,detail,expected_return,approval_required) values(co.id,me.id,case when p_data->>'reason'='emergency' then 'emergency' else 'personal_departure' end,case when p_data->>'reason'='emergency' then 'Emergency departure' else 'Personal departure' end,case when p_data->>'reason'='emergency' then '' else coalesce(p_data->>'note','') end,p_data->>'expectedReturn',coalesce(p_data->>'reason','personal')<>'emergency');
  end if;
 elsif p_action='create_request' then
  insert into public.sl_requests(company_id,employee_id,kind,summary,detail) values(co.id,me.id,p_data->>'kind',trim(p_data->>'summary'),coalesce(p_data->>'detail',''));
 elsif p_action='review_request' then
  select * into req from public.sl_requests where id=(p_data->>'id')::uuid and company_id=co.id for update;
  if req.id is null or req.status<>'pending' or req.employee_id=me.id then raise exception 'This request cannot be reviewed'; end if;
  if coalesce(p_data->>'status','') not in ('approved','declined') or coalesce(length(trim(p_data->>'reason')),0)<1 then raise exception 'Choose a decision and give a reason'; end if;
  update public.sl_requests set status=p_data->>'status',reviewer=me.name,reason=p_data->>'reason' where id=req.id;
 elsif p_action in ('submit_timesheet','approve_timesheet') then
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id;
  if sh.id is null then raise exception 'Unknown shift'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  select * into ts from public.sl_timesheets where shift_id=sh.id for update; totals:=shiftline_private.totals(sh.id);
  if not (totals->>'complete')::boolean then raise exception 'Clock out before submitting or approving'; end if;
  ot:=coalesce((p_data->>'overtimeMinutes')::int,0);
  if ot<0 or ot>greatest(0,(totals->>'recordedMinutes')::int-sh.regular_minutes) then raise exception 'Overtime exceeds recorded extra minutes'; end if;
  if p_action='submit_timesheet' then
   if sh.employee_id<>me.id or ts.status<>'open' then raise exception 'Only the employee may submit their open timesheet'; end if;
   update public.sl_timesheets set status='submitted',overtime_requested=ot where shift_id=sh.id;
  else
   if sh.employee_id=me.id or ts.status<>'submitted' or ot>ts.overtime_requested then raise exception 'Cannot approve this timesheet'; end if;
   update public.sl_timesheets set status='approved',overtime_approved=ot,reviewed_by=me.id,reviewed_at=now() where shift_id=sh.id;
  end if;
 elsif p_action='lock_period' then
  lo:=(p_data->>'start')::date; hi:=(p_data->>'end')::date;
  if hi<lo or hi>day or hi-lo>366 then raise exception 'Choose a completed payroll period of at most one year'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and start_date<=hi and end_date>=lo) then raise exception 'Period overlaps a locked period'; end if;
  if not exists(select 1 from public.sl_shifts where company_id=co.id and date between lo and hi) then raise exception 'No shifts in this period'; end if;
  if exists(select 1 from public.sl_shifts s left join public.sl_timesheets t on t.shift_id=s.id where s.company_id=co.id and s.date between lo and hi and (t.status is distinct from 'approved' or not (shiftline_private.totals(s.id)->>'complete')::boolean)) then raise exception 'Every shift must be complete and approved before locking'; end if;
  select jsonb_agg(jsonb_build_object('employeeNo',e.no,'name',e.name,'date',s.date,'regularMinutes',(shiftline_private.totals(s.id)->>'regularMinutes')::int,'overtimeMinutes',t.overtime_approved,'lunchMinutes',(shiftline_private.totals(s.id)->>'lunchMinutes')::int,'personalMinutes',(shiftline_private.totals(s.id)->>'personalMinutes')::int,'status','approved') order by s.date,e.no) into rows from public.sl_shifts s join public.sl_employees e on e.id=s.employee_id join public.sl_timesheets t on t.shift_id=s.id where s.company_id=co.id and s.date between lo and hi;
  insert into public.sl_periods(company_id,start_date,end_date,locked_by,rows) values(co.id,lo,hi,me.id,rows);
 elsif p_action='export_period' then
  select p.rows into rows from public.sl_periods p where id=(p_data->>'id')::uuid and company_id=co.id;
  if rows is null then raise exception 'Choose a locked payroll period'; end if;
  output:=jsonb_build_object('rows',rows);
 elsif p_action not in ('setup','activate') then raise exception 'Unknown action'; end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,case when p_action='activate' then jsonb_build_object('employeeId',me.id) else p_data-'code' end);
 return output||jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;

create function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.snapshot(); $$;
create function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on function shiftline_private.totals(uuid),shiftline_private.snapshot(),shiftline_private.command(text,jsonb),public.sl_snapshot(),public.sl_command(text,jsonb) from public,anon,authenticated;
grant usage on schema shiftline_private to authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb),public.sl_snapshot(),public.sl_command(text,jsonb) to authenticated;
