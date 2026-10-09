-- Additive upgrade. Existing events and frozen legacy exports are retained.
create table public.sl_policies (
 company_id uuid not null references public.sl_companies, version integer not null check(version>0),
 require_face_match boolean not null default false check(not require_face_match),
 require_gps_stamp boolean not null default false, enforce_geofence boolean not null default false,
 allow_offline_clockin boolean not null default false, require_approval_for_departure boolean not null default true,
 require_two_level_correction_approval boolean not null default true, lunch_paid boolean not null default false,
 created_at timestamptz not null default now(), created_by uuid references public.sl_employees,
 primary key(company_id,version), check(not enforce_geofence or require_gps_stamp)
);
insert into public.sl_policies(company_id,version) select id,1 from public.sl_companies;
alter table public.sl_companies add column current_policy_version integer not null default 1;
alter table public.sl_employees add column payroll_admin boolean not null default false;
-- The company founder administers payroll roles. A second person is still required for two-level review.
update public.sl_employees set payroll_admin=true where no='manager-1' and role='manager';
alter table public.sl_sites add column geofence_mode text not null default 'validate' check(geofence_mode in ('validate','notify','auto_suggest'));
alter table public.sl_sites add column latitude double precision check(latitude between -90 and 90);
alter table public.sl_sites add column longitude double precision check(longitude between -180 and 180);
alter table public.sl_sites add column radius_m integer not null default 150 check(radius_m between 100 and 5000);
alter table public.sl_sites add column max_accuracy_m integer not null default 100 check(max_accuracy_m between 10 and 1000);
alter table public.sl_sites add constraint sl_coordinates_pair check((latitude is null)=(longitude is null));
alter table public.sl_shifts add column policy_version integer not null default 1;
alter table public.sl_shifts add constraint sl_shift_policy foreign key(company_id,policy_version) references public.sl_policies;
create table public.sl_devices (
 id uuid primary key,company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,
 client_type text not null check(client_type in ('personal','kiosk')),platform text not null check(platform in ('ios','android','web')),
 revoked boolean not null default false,created_at timestamptz not null default now()
);
create table public.sl_submissions (
 id uuid primary key,company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,
 shift_id uuid not null references public.sl_shifts,device_id uuid references public.sl_devices,
 payload jsonb not null,captured_at timestamptz not null,received_at timestamptz not null default clock_timestamp(),
 status text not null check(status in ('synced','needs_review','declined')),reason text,warning text,canonical_event_id uuid references public.sl_events
);
create table public.sl_corrections (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,
 shift_id uuid not null references public.sl_shifts,event_id uuid references public.sl_events,submission_id uuid unique references public.sl_submissions,
 event_type text not null check(event_type in ('clock_in','start_lunch','end_lunch','start_job','end_job','start_personal','end_personal','clock_out')),
 original_value jsonb not null,replacement_value jsonb not null,reason text not null check(length(trim(reason)) between 1 and 1000),
 actor uuid not null references public.sl_employees,created_at timestamptz not null default now(),
 status text not null default 'pending_manager' check(status in ('pending_manager','pending_payroll','approved','declined')),
 two_level boolean not null,approved_by_level_1 uuid references public.sl_employees,approved_by_level_2 uuid references public.sl_employees,
 level_1_at timestamptz,approved_at timestamptz,decision_reason text,
 check(approved_by_level_1 is null or approved_by_level_1<>employee_id),
 check(approved_by_level_2 is null or (approved_by_level_2<>employee_id and approved_by_level_2<>approved_by_level_1))
);
create table public.sl_adjustments (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,employee_id uuid not null references public.sl_employees,
 shift_id uuid not null references public.sl_shifts,correction_id uuid not null unique references public.sl_corrections,
 event_id uuid references public.sl_events,event_type text not null,captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 actor uuid not null references public.sl_employees,reason text not null
);
create table public.sl_calculations (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,shift_id uuid not null references public.sl_shifts,
 version integer not null,policy_version integer not null,calculation jsonb not null,approved_by uuid not null references public.sl_employees,approved_at timestamptz not null default now(),unique(shift_id,version)
);
alter table public.sl_timesheets add column calculation_id uuid references public.sl_calculations;
create table public.sl_setup_progress (
 company_id uuid not null references public.sl_companies,step text not null check(step in ('real_device_test','review_first_event')),
 completed_by uuid not null references public.sl_employees,completed_at timestamptz not null default now(),evidence text not null check(length(trim(evidence)) between 1 and 500),primary key(company_id,step)
);
do $$ declare t text; begin foreach t in array array['sl_policies','sl_devices','sl_submissions','sl_corrections','sl_adjustments','sl_calculations','sl_setup_progress'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop; end $$;

create function shiftline_private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Append-only record: create an audited adjustment instead'; end $$;
create trigger sl_events_immutable before update or delete on public.sl_events for each row execute function shiftline_private.immutable();
create trigger sl_policies_immutable before update or delete on public.sl_policies for each row execute function shiftline_private.immutable();
create trigger sl_adjustments_immutable before update or delete on public.sl_adjustments for each row execute function shiftline_private.immutable();
create trigger sl_calculations_immutable before update or delete on public.sl_calculations for each row execute function shiftline_private.immutable();
create trigger sl_periods_immutable before update or delete on public.sl_periods for each row execute function shiftline_private.immutable();
create trigger sl_audit_immutable before update or delete on public.sl_audit for each row execute function shiftline_private.immutable();

create function shiftline_private.effective_events(p_shift uuid) returns table(id uuid,type text,captured_at timestamptz,seq bigint,job_id uuid,note text,source text) language sql stable set search_path='' as $$
 select e.id,e.type,coalesce(a.captured_at,e.captured_at),e.seq,e.job_id,e.note,case when a.id is null then 'employee' else 'manager_adjustment' end
 from public.sl_events e left join lateral (select * from public.sl_adjustments a where a.event_id=e.id order by created_at desc limit 1) a on true where e.shift_id=p_shift
 union all select a.id,a.event_type,a.captured_at,9223372036854775807::bigint,null::uuid,a.reason,'manager_adjustment' from public.sl_adjustments a where a.shift_id=p_shift and a.event_id is null;
$$;
create function shiftline_private.state(p_shift uuid) returns text language sql stable set search_path='' as $$
 select case when e.type is null then 'not_clocked_in' when e.type='start_lunch' then 'on_lunch' when e.type='start_job' then 'on_job' when e.type='start_personal' then 'on_personal' when e.type='clock_out' then 'clocked_out' else 'working' end from (select 1) seed left join lateral(select type from shiftline_private.effective_events(p_shift) order by captured_at desc,seq desc,id desc limit 1)e on true;
$$;
create function shiftline_private.allowed(p_state text,p_type text) returns boolean language sql immutable set search_path='' as $$
 select coalesce((p_type='clock_in' and p_state='not_clocked_in') or (p_type in ('start_lunch','start_job','start_personal') and p_state='working') or (p_type='end_lunch' and p_state='on_lunch') or (p_type='end_job' and p_state='on_job') or (p_type='end_personal' and p_state='on_personal') or (p_type='clock_out' and p_state in ('working','on_job')),false);
$$;
create function shiftline_private.distance(lat1 double precision,lon1 double precision,lat2 double precision,lon2 double precision) returns double precision language sql immutable set search_path='' as $$
 select 6371000*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)))));
$$;
create function shiftline_private.raw_totals(p_shift uuid) returns jsonb language sql stable set search_path='' as $$
 with intervals as(select type,captured_at,lead(captured_at) over(order by captured_at,seq,id) next_at from shiftline_private.effective_events(p_shift)),counts as(
 select coalesce(floor(sum(case when type in ('clock_in','end_lunch','start_job','end_job','end_personal') then extract(epoch from next_at-captured_at) else 0 end)),0)::bigint work,
 coalesce(floor(sum(case when type='start_lunch' then extract(epoch from next_at-captured_at) else 0 end)),0)::bigint lunch,
 coalesce(floor(sum(case when type='start_personal' then extract(epoch from next_at-captured_at) else 0 end)),0)::bigint personal,
 coalesce(bool_or(type='clock_out'),false) complete,coalesce(bool_or(type='clock_in'),false) started from intervals), values as(
 select c.*,s.policy_version,s.regular_minutes::bigint*60 cap,coalesce(t.overtime_approved,0)::bigint*60 ot,p.lunch_paid from counts c cross join public.sl_shifts s join public.sl_policies p on p.company_id=s.company_id and p.version=s.policy_version left join public.sl_timesheets t on t.shift_id=s.id where s.id=p_shift),calc as(select *,work+case when lunch_paid then lunch else 0 end payable_recorded from values)
 select jsonb_build_object('recordedSeconds',payable_recorded,'regularSeconds',least(payable_recorded,cap),'overtimeSecondsApproved',least(greatest(0,payable_recorded-cap),ot),'overtimeSecondsPending',greatest(0,payable_recorded-cap-ot),'paidBreakSeconds',case when lunch_paid then lunch else 0 end,'unpaidBreakSeconds',case when lunch_paid then 0 else lunch end,'personalSeconds',personal,'payableSeconds',least(payable_recorded,cap)+least(greatest(0,payable_recorded-cap),ot),'policyVersion',policy_version,
 'workedMinutes',(least(payable_recorded,cap)+least(greatest(0,payable_recorded-cap),ot))/60,'recordedMinutes',payable_recorded/60,'regularMinutes',least(payable_recorded,cap)/60,'overtimeMinutes',least(greatest(0,payable_recorded-cap),ot)/60,'unapprovedOvertimeMinutes',greatest(0,payable_recorded-cap-ot)/60,'lunchMinutes',lunch/60,'personalMinutes',personal/60,'missingClockOut',started and not complete,'complete',complete) from calc;
$$;
create or replace function shiftline_private.totals(p_shift uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select c.calculation from public.sl_timesheets t join public.sl_calculations c on c.id=t.calculation_id where t.shift_id=p_shift and t.status='approved'),shiftline_private.raw_totals(p_shift));
$$;

alter function shiftline_private.snapshot() rename to snapshot_v1;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb; day date;
begin
 base:=shiftline_private.snapshot_v1(); if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid(); day:=(base->>'today')::date;
 return base||jsonb_build_object('payrollAdmin',me.payroll_admin,
 'policy',(select to_jsonb(p) from public.sl_policies p join public.sl_companies c on c.id=p.company_id and c.current_policy_version=p.version where c.id=me.company_id),
 'policyHistory',(select jsonb_agg(to_jsonb(p) order by version desc) from public.sl_policies p where company_id=me.company_id),
 'sites',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'geofenceMode',geofence_mode,'latitude',latitude,'longitude',longitude,'radiusM',radius_m,'maxAccuracyM',max_accuracy_m)) from public.sl_sites where company_id=me.company_id),
 'employees',(select jsonb_agg(jsonb_build_object('id',id,'no',no,'name',name,'team',team,'siteId',site_id,'role',role,'activated',user_id is not null,'payrollAdmin',payroll_admin)) from public.sl_employees where company_id=me.company_id and (me.role='manager' or id=me.id)),
 'states',coalesce((select jsonb_agg(jsonb_build_object('shiftId',id,'employeeId',employee_id,'state',shiftline_private.state(id))) from public.sl_shifts where company_id=me.company_id and (me.role='manager' or employee_id=me.id)),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(to_jsonb(d)) from public.sl_devices d where company_id=me.company_id and (me.role='manager' or employee_id=me.id)),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(to_jsonb(s) order by received_at desc) from public.sl_submissions s where company_id=me.company_id and (me.role='manager' or employee_id=me.id)),'[]'::jsonb),
 'corrections',coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc) from public.sl_corrections c where company_id=me.company_id and (me.role='manager' or employee_id=me.id)),'[]'::jsonb),
 'setup',jsonb_build_array(
 jsonb_build_object('id','company_sites','label','Create company and sites','complete',true),
 jsonb_build_object('id','employees','label','Generate employee activation codes','complete',exists(select 1 from public.sl_employees where company_id=me.company_id and role='employee')),
 jsonb_build_object('id','shifts_jobs','label','Assign shifts and jobs','complete',exists(select 1 from public.sl_shifts where company_id=me.company_id) and exists(select 1 from public.sl_jobs where company_id=me.company_id)),
 jsonb_build_object('id','geofencing','label','Configure every site geofence','complete',not exists(select 1 from public.sl_sites where company_id=me.company_id and latitude is null)),
 jsonb_build_object('id','real_device_test','label','Clock in on a physical device','complete',exists(select 1 from public.sl_setup_progress where company_id=me.company_id and step='real_device_test')),
 jsonb_build_object('id','review_first_event','label','Review the first attendance event','complete',exists(select 1 from public.sl_setup_progress where company_id=me.company_id and step='review_first_event')),
 jsonb_build_object('id','approve_timesheet','label','Approve the first timesheet','complete',exists(select 1 from public.sl_timesheets where company_id=me.company_id and status='approved')),
 jsonb_build_object('id','export_csv','label','Download the first payroll CSV','complete',exists(select 1 from public.sl_audit where company_id=me.company_id and action='export_period'))));
end $$;

create function shiftline_private.submit(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; policy public.sl_policies; site public.sl_sites; device public.sl_devices; prior public.sl_submissions;
 event_id uuid; capture timestamptz; t text; last_at timestamptz; state text; problem text; warning text; loc jsonb; lat double precision; lon double precision; accuracy double precision; distance double precision; job uuid; payload jsonb; received timestamptz:=clock_timestamp();
begin
 select * into me from public.sl_employees where user_id=auth.uid(); if me.id is null then raise exception 'Activate your account first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 event_id:=(p_data->>'id')::uuid; t:=p_data->>'type'; capture:=(p_data->>'capturedAt')::timestamptz;
 if event_id is null or capture is null or t not in ('clock_in','start_lunch','end_lunch','start_job','end_job','start_personal','end_personal','clock_out') then raise exception 'Invalid attendance payload'; end if;
 select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and employee_id=me.id and company_id=co.id for update;
 if sh.id is null then raise exception 'Shift is not assigned to this employee'; end if;
 select * into policy from public.sl_policies where company_id=co.id and version=sh.policy_version;
 select * into site from public.sl_sites where id=sh.site_id;
 if p_data->>'deviceId' is not null then
  select * into device from public.sl_devices where id=(p_data->>'deviceId')::uuid and employee_id=me.id and company_id=co.id and not revoked;
  if device.id is null then raise exception 'Device is not registered to this employee'; end if;
 end if;
 -- Remove location beyond the tracking deadline; never retain off-duty coordinates.
 loc:=case when capture <= ((sh.date+sh.end_time) at time zone co.timezone) and capture>=((sh.date+sh.start_time-interval '30 minutes') at time zone co.timezone) then p_data->'location' else null end;
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
  select id into job from public.sl_jobs where id=nullif(p_data->>'jobId','')::uuid and employee_id=me.id and shift_id=sh.id and status='assigned';
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

alter function shiftline_private.command(text,jsonb) rename to command_v1;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; p public.sl_policies; target public.sl_employees; sub public.sl_submissions; c public.sl_corrections;
 result jsonb; new_id uuid; v_version int; event_id uuid; capture timestamptz; original jsonb; current_capture timestamptz; current_state text; event record; lo date; hi date; rows jsonb; device public.sl_devices;
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
     current_state:=case when event.type='clock_in' or event.type in ('end_lunch','end_job','end_personal') then 'working' when event.type='start_lunch' then 'on_lunch' when event.type='start_job' then 'on_job' when event.type='start_personal' then 'on_personal' else 'clocked_out' end;
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
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;

-- Preserve approved calculations from the first release; locked export rows remain untouched.
insert into public.sl_calculations(company_id,shift_id,version,policy_version,calculation,approved_by,approved_at)
select t.company_id,t.shift_id,1,s.policy_version,shiftline_private.raw_totals(t.shift_id),t.reviewed_by,coalesce(t.reviewed_at,now()) from public.sl_timesheets t join public.sl_shifts s on s.id=t.shift_id where t.status='approved' and t.calculation_id is null and t.reviewed_by is not null;
update public.sl_timesheets t set calculation_id=c.id from public.sl_calculations c where c.shift_id=t.shift_id and t.calculation_id is null and t.status='approved';
