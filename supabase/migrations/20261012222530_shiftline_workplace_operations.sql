-- Workplace directory, job briefs and short-lived on-duty positions.
alter table public.sl_employees add column job_title text not null default '' check(length(job_title)<=100),
 add column bio text not null default '' check(length(bio)<=1000),
 add column photo_url text not null default '' check(photo_url='' or (photo_url like 'https://%' and length(photo_url)<=2000));
alter table public.sl_jobs add column latitude double precision check(latitude between -90 and 90),
 add column longitude double precision check(longitude between -180 and 180),
 add column radius_m integer not null default 150 check(radius_m between 100 and 5000),
 add column lunch_option text not null default 'scheduled' check(lunch_option in ('scheduled','none')),
 add column overtime boolean not null default false,
 add constraint sl_jobs_coordinates_pair check((latitude is null)=(longitude is null));
alter table public.sl_site_presence add column latitude double precision check(latitude between -90 and 90),
 add column longitude double precision check(longitude between -180 and 180),
 add column accuracy_m double precision check(accuracy_m between 0 and 1000),
 add column job_id uuid,
 add constraint sl_presence_job_shift_fk foreign key(job_id,shift_id,company_id) references public.sl_jobs(id,shift_id,company_id);
alter table public.sl_site_alerts add column job_id uuid,
 add constraint sl_alert_job_shift_fk foreign key(job_id,shift_id,company_id) references public.sl_jobs(id,shift_id,company_id);
create index sl_alert_job_shift on public.sl_site_alerts(job_id,shift_id,company_id);
create index sl_presence_job_shift on public.sl_site_presence(job_id,shift_id,company_id);

create function shiftline_private.active_job(p_shift uuid) returns uuid language sql stable set search_path='' as $$
 select case when type='start_job' then job_id end from shiftline_private.effective_events(p_shift)
 where type in ('start_job','end_job','clock_out') order by captured_at desc,seq desc,id desc limit 1;
$$;
create or replace function shiftline_private.state(p_shift uuid) returns text language sql stable set search_path='' as $$
 select case when e.type is null then 'not_clocked_in' when e.type='start_lunch' then 'on_lunch'
 when e.type='start_personal' then 'on_personal' when e.type='clock_out' then 'clocked_out'
 when shiftline_private.active_job(p_shift) is not null then 'on_job' else 'working' end
 from (select 1) seed left join lateral(select type from shiftline_private.effective_events(p_shift)
 order by captured_at desc,seq desc,id desc limit 1)e on true;
$$;
create or replace function shiftline_private.allowed(p_state text,p_type text) returns boolean language sql immutable set search_path='' as $$
 select coalesce((p_type='clock_in' and p_state='not_clocked_in')
 or (p_type='start_lunch' and p_state in ('working','on_job'))
 or (p_type in ('start_job','start_personal') and p_state='working')
 or (p_type='end_lunch' and p_state='on_lunch') or (p_type='end_job' and p_state='on_job')
 or (p_type='end_personal' and p_state='on_personal') or (p_type='clock_out' and p_state in ('working','on_job')),false);
$$;

alter function shiftline_private.snapshot() rename to snapshot_before_workplace;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; me public.sl_employees;
begin
 base:=shiftline_private.snapshot_before_workplace();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object(
  'employees',coalesce((select jsonb_agg(item||jsonb_build_object('jobTitle',e.job_title,'bio',e.bio,'photoUrl',e.photo_url))
   from jsonb_array_elements(base->'employees') item join public.sl_employees e on e.id=(item->>'id')::uuid and e.company_id=me.company_id),'[]'::jsonb),
  'jobs',coalesce((select jsonb_agg(item||jsonb_build_object('latitude',j.latitude,'longitude',j.longitude,
   'radiusM',j.radius_m,'lunchOption',j.lunch_option,'overtime',j.overtime)) from jsonb_array_elements(base->'jobs') item
   join public.sl_jobs j on j.id=(item->>'id')::uuid and j.company_id=me.company_id),'[]'::jsonb),
  'sitePresence',case when me.role='manager' then coalesce((select jsonb_agg(jsonb_build_object(
   'employeeId',p.employee_id,'siteId',p.site_id,'shiftId',p.shift_id,'inside',p.inside,'checkedAt',p.checked_at,
   'latitude',p.latitude,'longitude',p.longitude,'accuracyM',p.accuracy_m,'jobId',p.job_id) order by p.checked_at desc)
   from public.sl_site_presence p join public.sl_shifts sh on sh.id=p.shift_id join public.sl_companies co on co.id=p.company_id
   join public.sl_employees e on e.id=p.employee_id
   where p.company_id=me.company_id and e.access_status='active' and p.checked_at>clock_timestamp()-interval '3 minutes'
    and (clock_timestamp() at time zone co.timezone)::date=sh.date
    and (clock_timestamp() at time zone co.timezone)::time>=sh.start_time
    and (clock_timestamp() at time zone co.timezone)::time<sh.end_time
    and shiftline_private.state(sh.id) in ('working','on_job')),'[]'::jsonb) else '[]'::jsonb end);
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_workplace;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; target public.sl_employees; co public.sl_companies; sh public.sl_shifts;
 site public.sl_sites; job public.sl_jobs; result jsonb; job_id_current uuid; company text; state text;
 lat double precision; lon double precision; accuracy double precision; target_lat double precision; target_lon double precision;
 radius integer; meters double precision; last_kind text; alert_kind text; local_now timestamp;
begin
 if p_action not in ('report_position','clear_position','update_employee_profile','create_job','configure_job') then
  return shiftline_private.command_before_workplace(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid command payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
 if p_action='clear_position' then
  delete from public.sl_site_presence where employee_id=me.id;
  result:=jsonb_build_object('snapshot',shiftline_private.snapshot());
 elsif p_action='report_position' then
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id and employee_id=me.id for update;
  if sh.id is null then raise exception 'Unknown shift'; end if;
  local_now:=clock_timestamp() at time zone co.timezone;
  if local_now::date<>sh.date or local_now::time<sh.start_time or local_now::time>=sh.end_time then raise exception 'Location window is closed'; end if;
  state:=shiftline_private.state(sh.id);
  if state not in ('working','on_job') then raise exception 'Location check is paused'; end if;
  select * into site from public.sl_sites where id=sh.site_id;
  if state='on_job' then
   job_id_current:=shiftline_private.active_job(sh.id);
   select * into job from public.sl_jobs where id=job_id_current and company_id=co.id and employee_id=me.id;
   if job.latitude is null then raise exception 'The job location has not been configured by your manager'; end if;
   target_lat:=job.latitude; target_lon:=job.longitude; radius:=job.radius_m;
  else
   target_lat:=site.latitude; target_lon:=site.longitude; radius:=site.radius_m;
  end if;
  if target_lat is null then raise exception 'Site geofence is not configured'; end if;
  lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision; accuracy:=(p_data->>'accuracyM')::double precision;
  if lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180
   or accuracy<0 or accuracy>site.max_accuracy_m then raise exception 'Location accuracy is insufficient'; end if;
  meters:=shiftline_private.distance(target_lat,target_lon,lat,lon);
  select kind into last_kind from public.sl_site_alerts where shift_id=sh.id and job_id is not distinct from job_id_current order by observed_at desc limit 1;
  alert_kind:=case when meters>radius+accuracy and coalesce(last_kind,'return')='return' then 'exit'
   when meters+accuracy<radius and last_kind='exit' then 'return' else null end;
  if alert_kind is not null then
   insert into public.sl_site_alerts(company_id,employee_id,shift_id,kind,distance_m,accuracy_m,source,job_id)
    values(co.id,me.id,sh.id,alert_kind,round(meters)::integer,round(accuracy)::integer,case when p_data->>'source'='native' then 'native' else 'web' end,job_id_current);
  end if;
  -- One current point per worker; no route history. Expired points cannot be read.
  delete from public.sl_site_presence where company_id=co.id and checked_at<clock_timestamp()-interval '3 minutes';
  insert into public.sl_site_presence(employee_id,company_id,site_id,shift_id,inside,checked_at,latitude,longitude,accuracy_m,job_id)
   values(me.id,co.id,site.id,sh.id,meters<=radius+accuracy,clock_timestamp(),lat,lon,accuracy,job_id_current)
   on conflict(employee_id) do update set company_id=excluded.company_id,site_id=excluded.site_id,shift_id=excluded.shift_id,
    inside=excluded.inside,checked_at=excluded.checked_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,job_id=excluded.job_id;
  result:=jsonb_build_object('status',coalesce(alert_kind,'inside_or_unchanged'),'snapshot',shiftline_private.snapshot());
 else
  if me.role<>'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_action='update_employee_profile' then
   select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id for update;
   if target.id is null then raise exception 'Unknown employee'; end if;
   if length(trim(coalesce(p_data->>'name',''))) not between 1 and 100 then raise exception 'Enter the employee name'; end if;
   if length(coalesce(p_data->>'department',''))>100 or length(coalesce(p_data->>'jobTitle',''))>100
    or length(coalesce(p_data->>'bio',''))>1000 then raise exception 'Profile fields exceed their allowed length'; end if;
   if coalesce(p_data->>'photoUrl','')<>'' and (p_data->>'photoUrl' not like 'https://%' or length(p_data->>'photoUrl')>2000) then raise exception 'Use an HTTPS photo URL'; end if;
   update public.sl_employees set name=trim(p_data->>'name'),team=trim(coalesce(p_data->>'department','')),
    job_title=trim(coalesce(p_data->>'jobTitle','')),bio=coalesce(p_data->>'bio',''),photo_url=trim(coalesce(p_data->>'photoUrl','')) where id=target.id;
  else
   if p_action='create_job' then
    select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id for update;
    if sh.id is null then raise exception 'Assign a shift first'; end if;
    if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
    if coalesce(length(trim(p_data->>'title')),0) not between 1 and 100 or coalesce(length(trim(p_data->>'destination')),0) not between 1 and 200
     or length(coalesce(p_data->>'instructions',''))>1000 then raise exception 'Enter a job title, destination and instructions within the allowed length'; end if;
    if coalesce(p_data->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_data->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (p_data->>'end')::time <= (p_data->>'start')::time then raise exception 'Choose valid job start and end times'; end if;
    if (p_data->>'start')::time<sh.start_time or (p_data->>'end')::time>sh.end_time then raise exception 'Job must be inside its assigned shift'; end if;
    if p_data->>'id' is not null then
     select * into job from public.sl_jobs where id=(p_data->>'id')::uuid;
     if job.id is not null then
      if job.company_id<>co.id or job.shift_id<>sh.id or job.title<>trim(p_data->>'title') or job.destination<>trim(p_data->>'destination')
       or job.instructions<>coalesce(p_data->>'instructions','') or job.start_time<>(p_data->>'start')::time or job.end_time<>(p_data->>'end')::time
       or job.latitude is distinct from nullif(p_data->>'latitude','')::double precision or job.longitude is distinct from nullif(p_data->>'longitude','')::double precision
       or job.radius_m<>coalesce((p_data->>'radiusM')::integer,150) or job.lunch_option<>coalesce(p_data->>'lunchOption','scheduled') or job.overtime<>coalesce((p_data->>'overtime')::boolean,false)
       then raise exception 'Job ID conflict'; end if;
      return jsonb_build_object('duplicate',true,'jobId',job.id,'snapshot',shiftline_private.snapshot());
     end if;
    end if;
    insert into public.sl_jobs(id,company_id,employee_id,shift_id,title,instructions,destination,supervisor,start_time,end_time)
     values(coalesce((p_data->>'id')::uuid,gen_random_uuid()),co.id,sh.employee_id,sh.id,trim(p_data->>'title'),coalesce(p_data->>'instructions',''),trim(p_data->>'destination'),me.name,(p_data->>'start')::time,(p_data->>'end')::time) returning * into job;
   else
    select * into job from public.sl_jobs where id=(p_data->>'jobId')::uuid and company_id=co.id for update;
    if job.id is null then raise exception 'Unknown job'; end if;
    if job.status<>'assigned' then raise exception 'Job details can only change before the job starts'; end if;
    select * into sh from public.sl_shifts where id=job.shift_id;
    if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
   end if;
   update public.sl_jobs set latitude=nullif(p_data->>'latitude','')::double precision,longitude=nullif(p_data->>'longitude','')::double precision,
    radius_m=coalesce((p_data->>'radiusM')::integer,150),lunch_option=coalesce(p_data->>'lunchOption','scheduled'),overtime=coalesce((p_data->>'overtime')::boolean,false) where id=job.id;
  end if;
  insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,
   jsonb_build_object('employeeId',target.id,'jobId',job.id));
  result:=jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 company:=co.id::text;
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||company,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return result;
end $$;
revoke all on function shiftline_private.command_before_workplace(text,jsonb),shiftline_private.snapshot_before_workplace(),shiftline_private.active_job(uuid),shiftline_private.command(text,jsonb),shiftline_private.snapshot() from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb),shiftline_private.snapshot() to authenticated;

-- Lunch pauses an active job rather than completing it. Preserve original evidence checks.
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
 elsif state in ('on_job','on_lunch') then job:=shiftline_private.active_job(sh.id); end if;
 insert into public.sl_submissions(id,company_id,employee_id,shift_id,device_id,payload,captured_at,received_at,status,reason,warning)
 values(event_id,co.id,me.id,sh.id,device.id,payload,capture,received,case when problem is null then 'synced' else 'needs_review' end,problem,warning);
 if problem is not null then return jsonb_build_object('status','needs_review','conflictId',event_id,'reason',problem); end if;
 insert into public.sl_events(id,company_id,employee_id,shift_id,type,captured_at,received_at,job_id,note) values(event_id,co.id,me.id,sh.id,t,capture,received,job,coalesce(p_data->>'note',''));
 update public.sl_submissions set canonical_event_id=event_id where id=event_id;
 -- A state/target change invalidates the old position immediately, including lunch on a job.
 delete from public.sl_site_presence where employee_id=me.id;
 if t='start_job' then update public.sl_jobs set status='in_progress' where id=job;
 elsif t in ('end_job','clock_out') and job is not null then update public.sl_jobs set status='completed' where id=job; end if;
 if t='start_personal' then insert into public.sl_requests(company_id,employee_id,kind,summary,detail,expected_return,approval_required) values(co.id,me.id,case when p_data->>'reason'='emergency' then 'emergency' else 'personal_departure' end,case when p_data->>'reason'='emergency' then 'Emergency departure' else 'Personal departure' end,case when p_data->>'reason'='emergency' then '' else coalesce(p_data->>'note','') end,p_data->>'expectedReturn',policy.require_approval_for_departure and coalesce(p_data->>'reason','personal')<>'emergency'); end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,'attendance_accepted',jsonb_build_object('eventId',event_id,'type',t,'policyVersion',sh.policy_version));
 return jsonb_build_object('status','synced','eventId',event_id,'warning',warning);
end $$;

-- Correction replay must use the same contextual lunch/job state.
create or replace function shiftline_private.command_v2(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; p public.sl_policies; target public.sl_employees; sub public.sl_submissions; c public.sl_corrections;
 result jsonb; new_id uuid; v_version int; event_id uuid; capture timestamptz; original jsonb; current_capture timestamptz; current_state text; job_open boolean:=false; event record; lo date; hi date; rows jsonb; device public.sl_devices;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then
  result:=shiftline_private.command_v1(p_action,p_data);
  if p_action='setup' then
   select * into me from public.sl_employees where user_id=auth.uid();
   insert into public.sl_policies(company_id,version,created_by) values(me.company_id,1,me.id);
   update public.sl_employees set payroll_admin=true where id=me.id;
  end if;
  return result||jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into p from public.sl_policies where company_id=co.id and version=co.current_policy_version;
 if p_action in ('save_policy','set_geofence','set_payroll_role','review_correction','review_submission','verify_setup','revoke_device','lock_period') and me.role<>'manager' then raise exception 'Manager access required'; end if;
 if p_action='save_policy' then
  if coalesce((p_data->>'require_face_match')::boolean,false) then raise exception 'Biometrics are not supported'; end if;
  if coalesce((p_data->>'enforce_geofence')::boolean,false) and not coalesce((p_data->>'require_gps_stamp')::boolean,false) then raise exception 'Geofence validation requires GPS stamps'; end if;
  if coalesce((p_data->>'require_gps_stamp')::boolean,false) and exists(select 1 from public.sl_sites where company_id=co.id and latitude is null) then raise exception 'Configure all site coordinates first'; end if;
  v_version:=co.current_policy_version+1;
  insert into public.sl_policies(company_id,version,require_gps_stamp,enforce_geofence,allow_offline_clockin,require_approval_for_departure,require_two_level_correction_approval,lunch_paid,created_by)
  values(co.id,v_version,coalesce((p_data->>'require_gps_stamp')::boolean,false),coalesce((p_data->>'enforce_geofence')::boolean,false),coalesce((p_data->>'allow_offline_clockin')::boolean,false),coalesce((p_data->>'require_approval_for_departure')::boolean,true),coalesce((p_data->>'require_two_level_correction_approval')::boolean,true),coalesce((p_data->>'lunch_paid')::boolean,false),me.id);
  update public.sl_companies set current_policy_version=v_version where id=co.id;
 elsif p_action='set_geofence' then
  update public.sl_sites set geofence_mode=p_data->>'mode',latitude=(p_data->>'latitude')::double precision,longitude=(p_data->>'longitude')::double precision,radius_m=(p_data->>'radiusM')::int,max_accuracy_m=(p_data->>'maxAccuracyM')::int where id=(p_data->>'siteId')::uuid and company_id=co.id;
  if not found then raise exception 'Unknown site'; end if;
 elsif p_action='set_payroll_role' then
  if not me.payroll_admin then raise exception 'Payroll administrator required'; end if;
  select * into target from public.sl_employees where id=(p_data->>'employeeId')::uuid and company_id=co.id and user_id is not null;
  if target.id is null or target.id=me.id then raise exception 'Choose another activated employee'; end if;
  update public.sl_employees set role='manager',payroll_admin=true where id=target.id;
 elsif p_action='register_device' then
  select * into device from public.sl_devices where id=(p_data->>'id')::uuid;
  if device.id is not null then
   if device.employee_id<>me.id or device.revoked or device.client_type<>p_data->>'clientType' or device.platform<>p_data->>'platform' then raise exception 'Device registration conflict'; end if;
  else
   if (select count(*) from public.sl_devices where employee_id=me.id and not revoked)>=20 then raise exception 'Device limit reached'; end if;
   insert into public.sl_devices(id,company_id,employee_id,client_type,platform) values((p_data->>'id')::uuid,co.id,me.id,p_data->>'clientType',p_data->>'platform');
  end if;
 elsif p_action='revoke_device' then
  update public.sl_devices set revoked=true where id=(p_data->>'id')::uuid and company_id=co.id; if not found then raise exception 'Unknown device'; end if;
 elsif p_action in ('submit_attendance','transition') then
  if p_action='transition' then
   select * into sh from public.sl_shifts where employee_id=me.id and date=(now() at time zone co.timezone)::date;
   if sh.id is null then raise exception 'No shift assigned for today'; end if;
   -- Compatibility for the original connected web prototype; the employee native client supplies capture evidence.
   if exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid) then
    if not exists(select 1 from public.sl_events where id=(p_data->>'id')::uuid and employee_id=me.id and type=p_data->>'type' and (type<>'start_job' or job_id is not distinct from nullif(p_data->>'jobId','')::uuid)) then raise exception 'Event ID conflict'; end if;
    return jsonb_build_object('duplicate',true,'status','synced','snapshot',shiftline_private.snapshot());
   end if;
   result:=shiftline_private.submit(p_data||jsonb_build_object('shiftId',sh.id,'capturedAt',clock_timestamp(),'offline',false));
   if result->>'status'<>'synced' then raise exception 'Action is not allowed: %',result->>'reason'; end if;
  else result:=shiftline_private.submit(p_data); end if;
  return result||jsonb_build_object('snapshot',shiftline_private.snapshot());
 elsif p_action in ('request_correction','review_submission') then
  if p_action='review_submission' then
   select * into sub from public.sl_submissions where id=(p_data->>'id')::uuid and company_id=co.id and status='needs_review' for update;
   if sub.id is null or sub.employee_id=me.id then raise exception 'Cannot review this submission'; end if;
   if coalesce(length(trim(p_data->>'reason')),0)=0 then raise exception 'Decision reason required'; end if;
   if p_data->>'decision'='declined' then
    update public.sl_submissions set status='declined' where id=sub.id;
    insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,'submission_declined',jsonb_build_object('submissionId',sub.id,'reason',p_data->>'reason'));
    return jsonb_build_object('snapshot',shiftline_private.snapshot());
   end if;
   if p_data->>'decision'<>'approved' then raise exception 'Choose accept or decline'; end if;
   select * into sh from public.sl_shifts where id=sub.shift_id;
   event_id:=null;capture:=sub.captured_at;original:='null'::jsonb;
  else
   select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and employee_id=me.id and company_id=co.id;
   if sh.id is null then raise exception 'Unknown shift'; end if;
   event_id:=nullif(p_data->>'eventId','')::uuid;capture:=(p_data->>'replacementAt')::timestamptz;
   if event_id is not null then
    select e.captured_at,jsonb_build_object('capturedAt',e.captured_at,'type',e.type) into current_capture,original from shiftline_private.effective_events(sh.id)e where e.id=event_id;
    if original is null then raise exception 'Unknown attendance event'; end if;
   else original:='null'::jsonb; end if;
  end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  if capture is null or (capture at time zone co.timezone)::date<>sh.date or capture>now()+interval '5 minutes' then raise exception 'Choose a recorded time on the assigned shift date'; end if;
  select * into p from public.sl_policies where company_id=co.id and version=sh.policy_version;
  insert into public.sl_corrections(company_id,employee_id,shift_id,event_id,submission_id,event_type,original_value,replacement_value,reason,actor,two_level)
  values(co.id,sh.employee_id,sh.id,event_id,sub.id,case when sub.id is not null then sub.payload->>'type' when event_id is not null then original->>'type' else p_data->>'eventType' end,original,jsonb_build_object('capturedAt',capture),trim(p_data->>'reason'),me.id,p.require_two_level_correction_approval) returning id into new_id;
  if sub.id is not null then
   -- Accept is level 1. A different payroll administrator must give level 2 when required.
   result:=shiftline_private.command('review_correction',jsonb_build_object('id',new_id,'decision','approved','reason',p_data->>'reason'));
   return result;
  end if;
 elsif p_action='review_correction' then
  select * into c from public.sl_corrections where id=(p_data->>'id')::uuid and company_id=co.id for update;
  if c.id is null or c.status not in ('pending_manager','pending_payroll') or c.employee_id=me.id then raise exception 'Cannot review this correction'; end if;
  if c.status='pending_payroll' and (not me.payroll_admin or me.id=c.approved_by_level_1) then raise exception 'A different payroll administrator must approve level 2'; end if;
  if coalesce(length(trim(p_data->>'reason')),0)=0 then raise exception 'Decision reason required'; end if;
  select * into sh from public.sl_shifts where id=c.shift_id;
  if exists(select 1 from public.sl_periods where company_id=co.id and sh.date between start_date and end_date) then raise exception 'Payroll period is locked'; end if;
  if p_data->>'decision'='declined' then update public.sl_corrections set status='declined',decision_reason=p_data->>'reason' where id=c.id;
  elsif p_data->>'decision'='approved' then
   if c.status='pending_manager' then
    update public.sl_corrections set approved_by_level_1=me.id,level_1_at=now(),status=case when c.two_level then 'pending_payroll' else 'approved' end where id=c.id;
   else update public.sl_corrections set approved_by_level_2=me.id,status='approved' where id=c.id; end if;
   if not c.two_level or c.status='pending_payroll' then
    if exists(select 1 from public.sl_shifts other where other.employee_id=c.employee_id and other.id<>sh.id and shiftline_private.state(other.id) not in ('not_clocked_in','clocked_out')) then raise exception 'Another shift is open; resolve it before applying this correction'; end if;
    if c.event_id is not null then
     select captured_at into current_capture from shiftline_private.effective_events(sh.id) where id=c.event_id;
     if current_capture is distinct from (c.original_value->>'capturedAt')::timestamptz then raise exception 'Original attendance changed; request a new correction'; end if;
    end if;
    insert into public.sl_adjustments(company_id,employee_id,shift_id,correction_id,event_id,event_type,captured_at,actor,reason) values(co.id,c.employee_id,sh.id,c.id,c.event_id,c.event_type,(c.replacement_value->>'capturedAt')::timestamptz,me.id,c.reason);
    current_state:='not_clocked_in';
    for event in select * from shiftline_private.effective_events(sh.id) order by captured_at,seq,id loop
     if not shiftline_private.allowed(current_state,event.type) then raise exception 'Correction creates an invalid attendance sequence'; end if;
     if event.type='start_job' then job_open:=true; elsif event.type in ('end_job','clock_out') then job_open:=false; end if;
     current_state:=case when event.type='end_lunch' and job_open then 'on_job' when event.type='clock_in' or event.type in ('end_lunch','end_job','end_personal') then 'working' when event.type='start_lunch' then 'on_lunch' when event.type='start_job' then 'on_job' when event.type='start_personal' then 'on_personal' else 'clocked_out' end;
    end loop;
    update public.sl_corrections set approved_at=now(),decision_reason=p_data->>'reason' where id=c.id;
    update public.sl_timesheets set status='open',calculation_id=null,overtime_approved=0,overtime_requested=0,reviewed_by=null,reviewed_at=null where shift_id=sh.id;
    if c.submission_id is not null then update public.sl_submissions set status='synced' where id=c.submission_id; end if;
   end if;
  else raise exception 'Choose approve or decline'; end if;
 elsif p_action='verify_setup' then
  if p_data->>'step'='real_device_test' and not exists(select 1 from public.sl_submissions s join public.sl_devices d on d.id=s.device_id where s.company_id=co.id and s.status='synced' and d.platform in ('ios','android')) then raise exception 'A native device must sync an attendance event first'; end if;
  if p_data->>'step'='review_first_event' and not exists(select 1 from public.sl_events where company_id=co.id) then raise exception 'Record an attendance event first'; end if;
  insert into public.sl_setup_progress(company_id,step,completed_by,evidence) values(co.id,p_data->>'step',me.id,trim(p_data->>'evidence')) on conflict(company_id,step) do nothing;
 elsif p_action='lock_period' then
  lo:=(p_data->>'start')::date;hi:=(p_data->>'end')::date;
  if lo is null or hi is null or hi<lo or hi>(now() at time zone co.timezone)::date or hi-lo>366 then raise exception 'Choose a completed payroll period of at most one year'; end if;
  if exists(select 1 from public.sl_periods where company_id=co.id and start_date<=hi and end_date>=lo) then raise exception 'Period overlaps a locked period'; end if;
  if not exists(select 1 from public.sl_shifts where company_id=co.id and date between lo and hi) then raise exception 'No shifts in this period'; end if;
  if exists(select 1 from public.sl_shifts s join public.sl_timesheets t on t.shift_id=s.id where s.company_id=co.id and s.date between lo and hi and (t.status<>'approved' or t.calculation_id is null or not (shiftline_private.totals(s.id)->>'complete')::boolean)) then raise exception 'Every shift must be complete and approved before locking'; end if;
  if exists(select 1 from public.sl_corrections pending join public.sl_shifts s on s.id=pending.shift_id where pending.company_id=co.id and s.date between lo and hi and pending.status in ('pending_manager','pending_payroll')) or exists(select 1 from public.sl_submissions pending join public.sl_shifts s on s.id=pending.shift_id where pending.company_id=co.id and s.date between lo and hi and pending.status='needs_review') then raise exception 'Resolve outstanding attendance conflicts and corrections before locking'; end if;
  select jsonb_agg(jsonb_build_object('employee_number',e.no,'pay_period_start',lo,'pay_period_end',hi,'regular_seconds',(calc.calculation->>'regularSeconds')::bigint,'overtime_seconds_approved',(calc.calculation->>'overtimeSecondsApproved')::bigint,'overtime_seconds_pending',(calc.calculation->>'overtimeSecondsPending')::bigint,'paid_break_seconds',(calc.calculation->>'paidBreakSeconds')::bigint,'unpaid_break_seconds',(calc.calculation->>'unpaidBreakSeconds')::bigint,'payable_seconds',(calc.calculation->>'payableSeconds')::bigint,'policy_version',calc.policy_version,'approved_by',reviewer.name,'approved_at',calc.approved_at) order by e.no,s.date) into rows from public.sl_shifts s join public.sl_timesheets t on t.shift_id=s.id join public.sl_calculations calc on calc.id=t.calculation_id join public.sl_employees e on e.id=s.employee_id join public.sl_employees reviewer on reviewer.id=calc.approved_by where s.company_id=co.id and s.date between lo and hi;
  insert into public.sl_periods(company_id,start_date,end_date,locked_by,rows) values(co.id,lo,hi,me.id,rows);
 else
  result:=shiftline_private.command_v1(p_action,p_data);
  if p_action='assign_shift' then
   update public.sl_shifts set policy_version=co.current_policy_version where employee_id=(p_data->>'employeeId')::uuid and date=(p_data->>'date')::date and company_id=co.id;
  elsif p_action='approve_timesheet' then
   select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=co.id;
   select coalesce(max(version),0)+1 into v_version from public.sl_calculations where shift_id=sh.id;
   insert into public.sl_calculations(company_id,shift_id,version,policy_version,calculation,approved_by) values(co.id,sh.id,v_version,sh.policy_version,shiftline_private.raw_totals(sh.id),me.id) returning id into new_id;
   update public.sl_timesheets set calculation_id=new_id where shift_id=sh.id;
  end if;
  return result||jsonb_build_object('snapshot',shiftline_private.snapshot());
 end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(co.id,me.id,p_action,p_data-'location');
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;

-- Physically expire precise points even when every client closes. No location history is stored.
create function shiftline_private.prune_positions() returns void language sql security definer set search_path='' as $$
 delete from public.sl_site_presence p using public.sl_shifts sh, public.sl_companies co
 where sh.id=p.shift_id and co.id=p.company_id and (
 p.checked_at<=clock_timestamp()-interval '3 minutes'
 or (clock_timestamp() at time zone co.timezone)::date<>sh.date
 or (clock_timestamp() at time zone co.timezone)::time>=sh.end_time
 or shiftline_private.state(sh.id) not in ('working','on_job'));
$$;
revoke all on function shiftline_private.prune_positions() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('shiftline-expire-positions','* * * * *','select shiftline_private.prune_positions()');
 end if;
end $$;
