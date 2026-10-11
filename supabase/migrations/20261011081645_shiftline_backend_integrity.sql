-- Preserve existing records. Every relationship below is validated before this migration commits.
-- Tenant ownership belongs in foreign keys as well as the authenticated RPCs.
do $$
declare t record; fk record;
begin
 for t in
  select c.oid,c.relname from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'sl_%'
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped)
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='id' and not a.attisdropped)
 loop
  execute format('alter table public.%I add constraint %I unique(id,company_id)',t.relname,t.relname||'_id_company_key');
 end loop;
 for fk in
  select child.relname child_name,parent.relname parent_name,ca.attname child_column,pa.attname parent_column
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class child on child.oid=c.conrelid
  join pg_catalog.pg_class parent on parent.oid=c.confrelid
  join pg_catalog.pg_namespace n on n.oid=child.relnamespace
  join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace
  join pg_catalog.pg_attribute ca on ca.attrelid=child.oid and ca.attnum=c.conkey[1]
  join pg_catalog.pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=c.confkey[1]
  where c.contype='f' and cardinality(c.conkey)=1 and n.nspname='public' and pn.nspname='public'
   and child.relname like 'sl_%' and pa.attname='id'
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=child.oid and a.attname='company_id' and not a.attisdropped)
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=parent.oid and a.attname='company_id' and not a.attisdropped)
 loop
  execute format('alter table public.%I add constraint %I foreign key(%I,company_id) references public.%I(id,company_id)',
   fk.child_name,fk.child_name||'_'||fk.child_column||'_tenant_fk',fk.child_column,fk.parent_name);
 end loop;
end $$;

-- Same-company IDs are not sufficient: each event/timesheet/job must belong to its employee's shift.
alter table public.sl_shifts add constraint sl_shifts_owner_key unique(id,employee_id,company_id);
alter table public.sl_jobs add constraint sl_jobs_shift_key unique(id,shift_id,company_id);
alter table public.sl_events add constraint sl_events_shift_key unique(id,shift_id,company_id);
alter table public.sl_calculations add constraint sl_calculations_shift_key unique(id,shift_id,company_id);
alter table public.sl_devices add constraint sl_devices_owner_key unique(id,employee_id,company_id);
alter table public.sl_corrections add constraint sl_corrections_owner_key unique(id,shift_id,employee_id,company_id);
alter table public.sl_submissions add constraint sl_submissions_owner_key unique(id,shift_id,employee_id,company_id);
do $$ declare t text; begin
 foreach t in array array['sl_jobs','sl_events','sl_timesheets','sl_submissions','sl_corrections','sl_adjustments','sl_site_alerts','sl_site_presence'] loop
  execute format('alter table public.%I add constraint %I foreign key(shift_id,employee_id,company_id) references public.sl_shifts(id,employee_id,company_id)',t,t||'_shift_owner_fk');
 end loop;
end $$;
alter table public.sl_events add constraint sl_events_job_shift_fk foreign key(job_id,shift_id,company_id) references public.sl_jobs(id,shift_id,company_id);
alter table public.sl_submissions add constraint sl_submissions_device_owner_fk foreign key(device_id,employee_id,company_id) references public.sl_devices(id,employee_id,company_id);
alter table public.sl_submissions add constraint sl_submissions_event_shift_fk foreign key(canonical_event_id,shift_id,company_id) references public.sl_events(id,shift_id,company_id);
alter table public.sl_corrections add constraint sl_corrections_event_shift_fk foreign key(event_id,shift_id,company_id) references public.sl_events(id,shift_id,company_id);
alter table public.sl_corrections add constraint sl_corrections_submission_owner_fk foreign key(submission_id,shift_id,employee_id,company_id) references public.sl_submissions(id,shift_id,employee_id,company_id);
alter table public.sl_adjustments add constraint sl_adjustments_correction_owner_fk foreign key(correction_id,shift_id,employee_id,company_id) references public.sl_corrections(id,shift_id,employee_id,company_id);
alter table public.sl_adjustments add constraint sl_adjustments_event_shift_fk foreign key(event_id,shift_id,company_id) references public.sl_events(id,shift_id,company_id);
alter table public.sl_timesheets add constraint sl_timesheets_calculation_shift_fk foreign key(calculation_id,shift_id,company_id) references public.sl_calculations(id,shift_id,company_id);
alter table public.sl_calculations add constraint sl_calculations_policy_fk foreign key(company_id,policy_version) references public.sl_policies(company_id,version);

-- Join tables intentionally have no redundant company column.
create function shiftline_private.validate_ack_owner() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='sl_notice_acks' then
  if not exists(select 1 from public.sl_notices n join public.sl_employees e on e.company_id=n.company_id where n.id=new.notice_id and e.id=new.employee_id) then
   raise exception 'Notice acknowledgement must belong to the same company' using errcode='23514';
  end if;
 else
  if not exists(select 1 from public.sl_requests r where r.id=new.request_id and r.employee_id=new.employee_id) then
   raise exception 'Request acknowledgement must belong to the request employee' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create trigger sl_notice_acks_owner before insert or update on public.sl_notice_acks for each row execute function shiftline_private.validate_ack_owner();
create trigger sl_request_decision_reads_owner before insert or update on public.sl_request_decision_reads for each row execute function shiftline_private.validate_ack_owner();

-- Preserve captured evidence while allowing audited review status/canonical-event changes.
create function shiftline_private.preserve_submission() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Attendance submissions cannot be deleted'; end if;
 if (to_jsonb(new)-array['status','reason','warning','canonical_event_id']) is distinct from
    (to_jsonb(old)-array['status','reason','warning','canonical_event_id']) then
  raise exception 'Captured attendance evidence is immutable';
 end if;
 return new;
end $$;
create trigger sl_submissions_evidence before update or delete on public.sl_submissions for each row execute function shiftline_private.preserve_submission();
create trigger sl_job_comments_immutable before update or delete on public.sl_job_comments for each row execute function shiftline_private.immutable();

-- Lock the owning shift and reject invalid inserts even from a privileged import.
create function shiftline_private.validate_event_insert() returns trigger
language plpgsql set search_path='' as $$
declare sh public.sl_shifts; last_at timestamptz;
begin
 select * into sh from public.sl_shifts where id=new.shift_id for update;
 if sh.id is null or sh.company_id<>new.company_id or sh.employee_id<>new.employee_id then
  raise exception 'Attendance employee and shift ownership mismatch' using errcode='23514';
 end if;
 if not shiftline_private.allowed(shiftline_private.state(sh.id),new.type) then
  raise exception 'Invalid attendance transition' using errcode='23514';
 end if;
 select max(captured_at) into last_at from shiftline_private.effective_events(sh.id);
 if last_at is not null and new.captured_at<last_at then
  raise exception 'Attendance events must be chronological' using errcode='23514';
 end if;
 return new;
end $$;
create trigger sl_events_validate_insert before insert on public.sl_events for each row execute function shiftline_private.validate_event_insert();

create index sl_shifts_company_date on public.sl_shifts(company_id,date desc);
create index sl_events_company_employee on public.sl_events(company_id,employee_id,captured_at desc);
create index sl_jobs_company_status on public.sl_jobs(company_id,status);
create index sl_requests_company_status on public.sl_requests(company_id,status,submitted_at desc);
create index sl_audit_company_time on public.sl_audit(company_id,at desc);
create index sl_submissions_company_status on public.sl_submissions(company_id,status,received_at desc);
create index sl_employees_activation_lookup on public.sl_employees(activation_hash) where activation_hash is not null;

-- Cover FK lookups without duplicating an existing index with the same leading columns.
do $$ declare fk record; cols text; begin
 for fk in select c.* from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and n.nspname='public' and t.relname like 'sl_%' order by cardinality(c.conkey) desc,c.conname
 loop
  if not exists(select 1 from pg_catalog.pg_index i where i.indrelid=fk.conrelid and i.indisvalid and i.indpred is null
   and array(select k.num from unnest(i.indkey::smallint[]) with ordinality k(num,ord) where k.ord<=cardinality(fk.conkey))=fk.conkey) then
   select string_agg(quote_ident(a.attname),',' order by k.ord) into cols
    from unnest(fk.conkey) with ordinality k(num,ord) join pg_catalog.pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.num;
   execute format('create index %I on %s(%s)','sl_fk_'||substr(md5(fk.conname),1,20),fk.conrelid::regclass,cols);
  end if;
 end loop;
end $$;

-- Validate requests once at the RPC entry point. Identity always comes from auth.uid().
alter function shiftline_private.command(text,jsonb) rename to command_before_integrity;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; result jsonb; step public.sl_job_steps;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_action is null or length(p_action) not between 1 and 64 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then
  raise exception 'Invalid command payload';
 end if;
 -- Serializes the user's activation and the company's mutations using the same lock order.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is not null then perform 1 from public.sl_companies where id=me.company_id for update; end if;
 if p_action='set_job_step_done' then
  select st.* into step from public.sl_job_steps st join public.sl_jobs j on j.id=st.job_id
   where st.id=(p_data->>'stepId')::uuid and st.company_id=me.company_id
    and (me.role='manager' or j.employee_id=me.id or exists(select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id)) for update of st;
  if step.id is null then raise exception 'Unknown job step'; end if;
  if jsonb_typeof(p_data->'done') is distinct from 'boolean' then raise exception 'Choose whether the step is complete'; end if;
  update public.sl_job_steps set completed_at=case when (p_data->>'done')::boolean then clock_timestamp() else null end,
   completed_by=case when (p_data->>'done')::boolean then me.id else null end where id=step.id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('stepId',step.id,'done',p_data->'done'));
  return jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 result:=shiftline_private.command_before_integrity(p_action,p_data);
 -- Browser, native, and supervised attendance all remove stale map presence immediately.
 if p_action in ('transition','submit_attendance','kiosk_clock') and result->>'status'='synced' then
  delete from public.sl_site_presence p using public.sl_shifts sh
   where p.shift_id=sh.id and sh.company_id=me.company_id and shiftline_private.state(sh.id)<>'working';
 end if;
 return result;
end $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;

-- Only a clock-in may retain its bounded location stamp. Breaks and clock-out retain no coordinates.
create or replace function shiftline_private.submit(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; policy public.sl_policies; site public.sl_sites; device public.sl_devices; prior public.sl_submissions;
 event_id uuid; capture timestamptz; t text; last_at timestamptz; state text; problem text; warning text; loc jsonb; lat double precision; lon double precision; accuracy double precision; distance double precision; job uuid; payload jsonb; received timestamptz:=clock_timestamp();
begin
 select * into me from public.sl_employees where user_id=auth.uid(); if me.id is null then raise exception 'Activate your account first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 event_id:=(p_data->>'id')::uuid; t:=p_data->>'type'; capture:=(p_data->>'capturedAt')::timestamptz;
 if event_id is null or capture is null or t is null or t not in ('clock_in','start_lunch','end_lunch','start_job','end_job','start_personal','end_personal','clock_out') then raise exception 'Invalid attendance payload'; end if;
 select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and employee_id=me.id and company_id=co.id for update;
 if sh.id is null then raise exception 'Shift is not assigned to this employee'; end if;
 select * into policy from public.sl_policies where company_id=co.id and version=sh.policy_version;
 select * into site from public.sl_sites where id=sh.site_id;
 if p_data->>'deviceId' is not null then
  select * into device from public.sl_devices where id=(p_data->>'deviceId')::uuid and employee_id=me.id and company_id=co.id and not revoked;
  if device.id is null then raise exception 'Device is not registered to this employee'; end if;
 end if;
 -- Remove location beyond the tracking deadline; never retain off-duty coordinates.
 loc:=case when t='clock_in' and capture <= ((sh.date+sh.end_time) at time zone co.timezone) and capture>=((sh.date+sh.start_time-interval '30 minutes') at time zone co.timezone) then p_data->'location' else null end;
 payload:=jsonb_build_object('type',t,'shiftId',sh.id,'capturedAt',capture,'deviceId',device.id,'location',loc,'jobId',nullif(p_data->>'jobId','')::uuid,'note',coalesce(p_data->>'note',''),'reason',p_data->>'reason','expectedReturn',p_data->>'expectedReturn','offline',coalesce((p_data->>'offline')::boolean,false));
 select * into prior from public.sl_submissions where id=event_id;
 if prior.id is not null then
  if prior.employee_id<>me.id or prior.payload<>payload then raise exception 'Event ID conflict'; end if;
  return jsonb_build_object('status',prior.status,'eventId',prior.canonical_event_id,'conflictId',case when prior.status<>'synced' then prior.id else null end,'reason',prior.reason,'warning',prior.warning,'duplicate',true);
 end if;
 if exists(select 1 from public.sl_events where id=event_id) then raise exception 'Event ID conflict'; end if;
 if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then problem:='PAYROLL_LOCKED';
 elsif exists(select 1 from public.sl_timesheets where shift_id=sh.id and status<>'open') then problem:='TIMESHEET_SUBMITTED';
 elsif capture>received+interval '5 minutes' or capture<received-interval '30 days' then problem:='CAPTURE_TIME_REQUIRES_REVIEW';
 elsif (capture at time zone co.timezone)::date<>sh.date then problem:='SHIFT_DATE_MISMATCH';
 elsif t='clock_in' and (capture<((sh.date+sh.start_time-interval '30 minutes') at time zone co.timezone) or capture>=((sh.date+sh.end_time) at time zone co.timezone)) then problem:='OUTSIDE_SHIFT_WINDOW';
 elsif t='clock_in' and (coalesce((p_data->>'offline')::boolean,false) or capture<received-interval '2 minutes') and not policy.allow_offline_clockin then problem:='OFFLINE_CLOCKIN_REQUIRES_REVIEW'; end if;
 state:=shiftline_private.state(sh.id);
 select max(captured_at) into last_at from shiftline_private.effective_events(sh.id);
 if problem is null and last_at is not null and capture<last_at then problem:='OUT_OF_ORDER'; end if;
 if problem is null and not shiftline_private.allowed(state,t) then problem:='INVALID_TRANSITION'; end if;
 if problem is null and t='clock_in' and exists(select 1 from public.sl_shifts where employee_id=me.id and id<>sh.id and shiftline_private.state(id) not in ('not_clocked_in','clocked_out')) then problem:='OTHER_SHIFT_OPEN'; end if;
 if problem is null and t='clock_in' and policy.require_gps_stamp then
  if loc is null or loc='null'::jsonb then problem:='LOCATION_UNAVAILABLE';
  else
   lat:=(loc->>'latitude')::double precision; lon:=(loc->>'longitude')::double precision; accuracy:=(loc->>'accuracyM')::double precision;
   if lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy<0 or accuracy>site.max_accuracy_m or accuracy='NaN'::double precision then problem:='LOCATION_UNCERTAIN';
   elsif site.latitude is null then problem:='SITE_NOT_CONFIGURED';
   else
    distance:=shiftline_private.distance(site.latitude,site.longitude,lat,lon);
    if distance>site.radius_m then
     if policy.enforce_geofence and site.geofence_mode='validate' then problem:='OUTSIDE_WORKSITE'; else warning:='OUTSIDE_WORKSITE'; end if;
    end if;
   end if;
  end if;
 end if;
 if t='start_job' then
  select id into job from public.sl_jobs where id=nullif(p_data->>'jobId','')::uuid and employee_id=me.id and shift_id=sh.id and status in ('assigned','in_progress');
  if job is null and problem is null then problem:='JOB_NOT_ASSIGNED'; end if;
 elsif state='on_job' then select job_id into job from shiftline_private.effective_events(sh.id) where type='start_job' order by captured_at desc,seq desc limit 1; end if;
 insert into public.sl_submissions(id,company_id,employee_id,shift_id,device_id,payload,captured_at,received_at,status,reason,warning)
 values(event_id,co.id,me.id,sh.id,device.id,payload,capture,received,case when problem is null then 'synced' else 'needs_review' end,problem,warning);
 if problem is not null then return jsonb_build_object('status','needs_review','conflictId',event_id,'reason',problem); end if;
 insert into public.sl_events(id,company_id,employee_id,shift_id,type,captured_at,received_at,job_id,note) values(event_id,co.id,me.id,sh.id,t,capture,received,job,coalesce(p_data->>'note',''));
 update public.sl_submissions set canonical_event_id=event_id where id=event_id;
 if t='start_job' then update public.sl_jobs set status='in_progress' where id=job;
 elsif state='on_job' then update public.sl_jobs set status='completed' where id=job; end if;
 if t='start_personal' then insert into public.sl_requests(company_id,employee_id,kind,summary,detail,expected_return,approval_required) values(co.id,me.id,case when p_data->>'reason'='emergency' then 'emergency' else 'personal_departure' end,case when p_data->>'reason'='emergency' then 'Emergency departure' else 'Personal departure' end,case when p_data->>'reason'='emergency' then '' else coalesce(p_data->>'note','') end,p_data->>'expectedReturn',policy.require_approval_for_departure and coalesce(p_data->>'reason','personal')<>'emergency'); end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,'attendance_accepted',jsonb_build_object('eventId',event_id,'type',t,'policyVersion',sh.policy_version));
 return jsonb_build_object('status','synced','eventId',event_id,'warning',warning);
end $$;

-- Workers assigned as team members can see the same task, checklist and job roster.
-- Their attendance remains attached to their own shift; membership grants no payroll or attendance access.
alter function shiftline_private.snapshot() rename to snapshot_before_integrity;
create function shiftline_private.snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_before_integrity();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object('schemaVersion',11,
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'instructions',j.instructions,'date',sh.date,
   'start',to_char(j.start_time,'HH24:MI'),'end',to_char(j.end_time,'HH24:MI'),'destination',j.destination,
   'supervisor',j.supervisor,'status',j.status,'assignee',j.employee_id,'shiftId',j.shift_id) order by sh.date desc,j.start_time,j.id)
   from public.sl_jobs j join public.sl_shifts sh on sh.id=j.shift_id
   where j.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id or exists(
    select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id))),'[]'::jsonb),
  'jobSteps',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'jobId',st.job_id,'label',st.label,
   'sortOrder',st.sort_order,'completedAt',st.completed_at) order by st.sort_order,st.created_at,st.id)
   from public.sl_job_steps st join public.sl_jobs j on j.id=st.job_id
   where st.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id or exists(
    select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id))),'[]'::jsonb),
  'jobTeam',coalesce((select jsonb_agg(jsonb_build_object('jobId',team.job_id,'employeeId',team.employee_id,'name',team.name,'team',team.team) order by team.name,team.employee_id)
   from (select j.id job_id,e.id employee_id,e.name,e.team from public.sl_jobs j join public.sl_employees e on e.id=j.employee_id
    where j.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id or exists(select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id))
    union
    select j.id,e.id,e.name,e.team from public.sl_job_members members join public.sl_jobs j on j.id=members.job_id join public.sl_employees e on e.id=members.employee_id
    where j.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id or exists(select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id))) team),'[]'::jsonb));
end $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
