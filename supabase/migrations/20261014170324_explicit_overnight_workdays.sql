-- A workday belongs to its start date. Existing rows keep their exact local window.
alter table public.sl_shifts add column finish_date date;
update public.sl_shifts set finish_date=date;
alter table public.sl_shifts alter column finish_date set not null;
alter table public.sl_shifts drop constraint sl_shifts_check, drop constraint sl_shifts_check1;
alter table public.sl_shifts add constraint sl_workday_window check (
 finish_date between date and date+1 and finish_date+end_time>date+start_time
 and finish_date+end_time<=date+start_time+interval '24 hours');
alter table public.sl_shifts add constraint sl_workday_lunch check (
 (finish_date=date and lunch_time>=start_time and lunch_time<end_time)
 or (finish_date=date+1 and (lunch_time>=start_time or lunch_time<end_time)));
create function shiftline_private.default_finish_date() returns trigger language plpgsql set search_path='' as $$
begin new.finish_date:=coalesce(new.finish_date,new.date); return new; end $$;
create trigger sl_workday_default_finish before insert on public.sl_shifts
for each row execute function shiftline_private.default_finish_date();

create function shiftline_private.workday_start(sh public.sl_shifts,tz text) returns timestamptz
language sql stable set search_path='' as $$ select (sh.date+sh.start_time) at time zone tz $$;
create function shiftline_private.workday_finish(sh public.sl_shifts,tz text) returns timestamptz
language sql stable set search_path='' as $$ select (sh.finish_date+sh.end_time) at time zone tz $$;
create function shiftline_private.workday_evidence_date(sh public.sl_shifts,capture timestamptz,tz text) returns boolean
language sql stable set search_path='' as $$
 select (capture at time zone tz)::date between sh.date and sh.finish_date
 and (sh.finish_date=sh.date or (capture>=shiftline_private.workday_start(sh,tz)-interval '30 minutes'
  and capture<=shiftline_private.workday_start(sh,tz)+interval '24 hours'))
$$;
create function shiftline_private.workday_tracking(sh public.sl_shifts,capture timestamptz,tz text) returns boolean
language sql stable set search_path='' as $$ select capture>=shiftline_private.workday_start(sh,tz)
 and capture<shiftline_private.workday_finish(sh,tz) $$;
create function shiftline_private.current_workday(employee uuid,day date) returns public.sl_shifts
language sql stable set search_path='' as $$
 select s from public.sl_shifts s where s.employee_id=employee and
 (shiftline_private.state(s.id) not in ('not_clocked_in','clocked_out') or s.date=day)
 order by (shiftline_private.state(s.id) not in ('not_clocked_in','clocked_out')) desc,s.date desc limit 1
$$;
create function shiftline_private.job_window_valid(sh public.sl_shifts,starts time,ends time) returns boolean
language sql immutable set search_path='' as $$
 select (sh.date+starts+case when starts<sh.start_time then interval '1 day' else interval '0' end)
  >=sh.date+sh.start_time and
 (sh.date+ends+case when starts<sh.start_time then interval '1 day' else interval '0' end
  +case when ends<=starts then interval '1 day' else interval '0' end)<=sh.finish_date+sh.end_time
$$;
alter table public.sl_jobs drop constraint sl_jobs_check;
create function shiftline_private.check_job_window() returns trigger language plpgsql set search_path='' as $$
declare sh public.sl_shifts;
begin
 select * into sh from public.sl_shifts where id=new.shift_id;
 if not shiftline_private.job_window_valid(sh,new.start_time,new.end_time) then raise exception 'Job must be inside its assigned workday'; end if;
 return new;
end $$;
create trigger sl_job_workday_window before insert or update of shift_id,start_time,end_time on public.sl_jobs
 for each row execute function shiftline_private.check_job_window();

-- Replace only the existing owners of time-window validation. Each source match
-- is required, so a diverged database fails the migration instead of silently
-- leaving one attendance or privacy path on the old calendar-day rule.
do $migration$
declare change record; definition text; signature regprocedure;
begin
 for change in select * from (values
 ('submit(jsonb)', '(sh.date+sh.end_time)', '(sh.finish_date+sh.end_time)'),
 ('submit(jsonb)', '(capture at time zone co.timezone)::date<>sh.date', 'not shiftline_private.workday_evidence_date(sh,capture,co.timezone)'),
 ('submit(jsonb)', 'elsif t=''clock_in'' and (capture<', 'elsif sh.finish_date>sh.date and capture>shiftline_private.workday_finish(sh,co.timezone) then problem:=''WORKDAY_FINISH_EXCEEDED''; elsif t=''clock_in'' and (capture<'),
 ('command_v2(text,jsonb)', 'select * into sh from public.sl_shifts where employee_id=me.id and date=(now() at time zone co.timezone)::date;', 'sh:=shiftline_private.current_workday(me.id,(clock_timestamp() at time zone co.timezone)::date);'),
 ('command_v2(text,jsonb)', '(capture at time zone co.timezone)::date<>sh.date', 'not shiftline_private.workday_evidence_date(sh,capture,co.timezone)'),
 ('command_before_employee_clockin(text,jsonb)', 'local_now::date<>sh.date or local_now::time<sh.start_time or local_now::time>=sh.end_time', 'not shiftline_private.workday_tracking(sh,clock_timestamp(),co.timezone)'),
 ('command_before_employee_clockin(text,jsonb)', '(p_data->>''start'')::time<sh.start_time or (p_data->>''end'')::time>sh.end_time', 'not shiftline_private.job_window_valid(sh,(p_data->>''start'')::time,(p_data->>''end'')::time)'),
 ('command_before_employee_clockin(text,jsonb)', 'or (p_data->>''end'')::time <= (p_data->>''start'')::time', 'or not shiftline_private.job_window_valid(sh,(p_data->>''start'')::time,(p_data->>''end'')::time)'),
 ('link_incidents(uuid)', '((s.date+1)::timestamp at time zone c.timezone)', 'shiftline_private.workday_finish(s,c.timezone)'),
 ('snapshot_before_job_calendar()', '(clock_timestamp() at time zone co.timezone)::date=sh.date
    and (clock_timestamp() at time zone co.timezone)::time>=sh.start_time
    and (clock_timestamp() at time zone co.timezone)::time<sh.end_time', 'shiftline_private.workday_tracking(sh,clock_timestamp(),co.timezone)'),
 ('prune_positions()', '(clock_timestamp() at time zone co.timezone)::date<>sh.date
 or (clock_timestamp() at time zone co.timezone)::time>=sh.end_time', 'not shiftline_private.workday_tracking(sh,clock_timestamp(),co.timezone)'),
 ('command_before_located_plans(text,jsonb)', '(clock_timestamp() at time zone co.timezone)::date<>sh.date', 'not shiftline_private.workday_tracking(sh,clock_timestamp(),co.timezone)'),
 ('command_before_plan_location_edits(text,jsonb)', 'select * into sh from public.sl_shifts where employee_id=me.id and date=plan.date for update;', 'sh:=shiftline_private.current_workday(me.id,(clock_timestamp() at time zone co.timezone)::date); perform 1 from public.sl_shifts where id=sh.id for update;'),
 ('command_before_plan_location_edits(text,jsonb)', 'if sh.id is null or shiftline_private.state(sh.id)<>''working'' then', 'if sh.id is null or not shiftline_private.workday_tracking(sh,clock_timestamp(),co.timezone) or shiftline_private.state(sh.id)<>''working'' then')
 ) as changes(owner,old_source,new_source)
 loop
  signature:=('shiftline_private.'||change.owner)::regprocedure;
  definition:=pg_get_functiondef(signature);
  if position(change.old_source in definition)=0 then raise exception 'Workday migration source mismatch: %',change.owner; end if;
  execute replace(definition,change.old_source,change.new_source);
 end loop;
end $migration$;

-- Keep the existing outer command wrappers (approval, cutoff and live updates).
create or replace function shiftline_private.command_before_job_calendar(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts;
 local_now timestamp; finish timestamp; starts time; ends time; lunch time; result jsonb; day_offset integer;
begin
 if p_action is distinct from 'start_workday' then return shiftline_private.command_before_employee_clockin(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','expectedEnd','finishDay','location')) then raise exception 'Invalid clock-in payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your workplace first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 if (p_data->>'id')::uuid is null then raise exception 'Clock-in ID is required'; end if;
 if exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid) then
  if not exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid and employee_id=me.id and type='clock_in') then raise exception 'Event ID conflict'; end if;
  return jsonb_build_object('duplicate',true,'status','synced','snapshot',shiftline_private.snapshot());
 end if;
 local_now:=clock_timestamp() at time zone co.timezone;
 if exists(select 1 from public.sl_periods where company_id=co.id and local_now::date between start_date and end_date) then raise exception 'This attendance period is locked'; end if;
 if coalesce(p_data->>'expectedEnd','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose when you expect to finish'; end if;
 if coalesce(p_data->>'finishDay','today') not in ('today','tomorrow') then raise exception 'Choose today or tomorrow'; end if;
 day_offset:=case when p_data->>'finishDay'='tomorrow' then 1 else 0 end;
 ends:=(p_data->>'expectedEnd')::time; starts:=date_trunc('minute',local_now)::time;
 finish:=local_now::date+day_offset+ends;
 if day_offset=0 and finish<=local_now then raise exception 'Expected finish must be later today'; end if;
 if finish<=local_now or finish>date_trunc('minute',local_now)+interval '24 hours'
  or (finish at time zone co.timezone)>((date_trunc('minute',local_now) at time zone co.timezone)+interval '24 hours') then
  raise exception 'Expected finish must be later and within 24 hours'; end if;
 if exists(select 1 from public.sl_shifts s where s.employee_id=me.id and shiftline_private.state(s.id) not in ('not_clocked_in','clocked_out')) then
  raise exception 'INVALID_TRANSITION: OTHER_SHIFT_OPEN: Your previous workday is still open. Clock out or ask your manager to review it first'; end if;
 select * into sh from public.sl_shifts where employee_id=me.id and date=local_now::date for update;
 lunch:=case when day_offset=1 then starts else greatest(starts,least('12:00'::time,(finish-interval '1 minute')::time)) end;
 if sh.id is null then
  insert into public.sl_shifts(company_id,employee_id,site_id,date,finish_date,start_time,end_time,lunch_time,lunch_minutes,regular_minutes,policy_version)
   values(co.id,me.id,me.site_id,local_now::date,finish::date,starts,ends,lunch,60,480,co.current_policy_version) returning * into sh;
  insert into public.sl_timesheets(shift_id,company_id,employee_id) values(sh.id,co.id,me.id);
 else
  if shiftline_private.state(sh.id)<>'not_clocked_in' then raise exception 'INVALID_TRANSITION: already checked in for today'; end if;
  if exists(select 1 from public.sl_events where shift_id=sh.id) or exists(select 1 from public.sl_submissions where shift_id=sh.id)
   or exists(select 1 from public.sl_corrections where shift_id=sh.id) or exists(select 1 from public.sl_timesheets where shift_id=sh.id and status<>'open') then
   raise exception 'Recorded attendance must be reviewed before changing this workday'; end if;
  if exists(select 1 from public.sl_jobs where shift_id=sh.id) then raise exception 'Review planned assignments before changing this workday'; end if;
  update public.sl_shifts set start_time=starts,end_time=ends,finish_date=finish::date,lunch_time=lunch where id=sh.id returning * into sh;
 end if;
 result:=shiftline_private.command_before_employee_clockin('transition',(p_data-array['expectedEnd','finishDay'])||jsonb_build_object('type','clock_in'));
 return result;
end $$;

alter function shiftline_private.snapshot() rename to snapshot_before_overnight;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; tz text;
begin
 result:=shiftline_private.snapshot_before_overnight();
 tz:=result#>>'{company,timezone}';
 if jsonb_typeof(result->'shifts')='array' then
  result:=jsonb_set(result,'{shifts}',coalesce((select jsonb_agg(item||jsonb_build_object(
   'finishDate',s.finish_date,'startsAt',shiftline_private.workday_start(s,tz),
   'finishesAt',shiftline_private.workday_finish(s,tz)))
   from jsonb_array_elements(result->'shifts') item join public.sl_shifts s on s.id=(item->>'id')::uuid
   and s.company_id=(result#>>'{company,id}')::uuid),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function shiftline_private.default_finish_date(),shiftline_private.workday_start(public.sl_shifts,text),shiftline_private.workday_finish(public.sl_shifts,text),shiftline_private.workday_evidence_date(public.sl_shifts,timestamptz,text),shiftline_private.workday_tracking(public.sl_shifts,timestamptz,text),shiftline_private.current_workday(uuid,date),shiftline_private.job_window_valid(public.sl_shifts,time,time),shiftline_private.check_job_window(),shiftline_private.snapshot_before_overnight(),shiftline_private.snapshot(),shiftline_private.command_before_job_calendar(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot() to authenticated;
