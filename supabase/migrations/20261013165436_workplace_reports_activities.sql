-- Operational context is separate from immutable attendance and payable totals.
create table public.sl_work_activities(
 id uuid primary key, company_id uuid not null references public.sl_companies,
 employee_id uuid not null, shift_id uuid not null, job_id uuid,
 kind text not null check(kind in ('leaving_site','arrived_site','inspection','returning_office','other')),
 description text not null check(length(description) between 1 and 1000),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(id,company_id),
 foreign key(shift_id,employee_id,company_id) references public.sl_shifts(id,employee_id,company_id),
 foreign key(job_id,shift_id,company_id) references public.sl_jobs(id,shift_id,company_id)
);
create index sl_activities_shift on public.sl_work_activities(shift_id,employee_id,company_id);
create index sl_activities_job on public.sl_work_activities(job_id,shift_id,company_id);
create index sl_activities_company on public.sl_work_activities(company_id,recorded_at desc);
create table public.sl_incidents(
 id uuid primary key, company_id uuid not null references public.sl_companies,
 kind text not null check(kind in ('power_outage','disruption','early_release','emergency','other')),
 title text not null check(length(title) between 1 and 200),
 description text not null check(length(description) between 1 and 4000),
 starts_at timestamptz not null, ends_at timestamptz not null,
 created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 source_payload jsonb not null, unique(id,company_id),
 foreign key(created_by,company_id) references public.sl_employees(id,company_id),
 check(ends_at>starts_at and ends_at<=starts_at+interval '31 days')
);
create index sl_incidents_creator on public.sl_incidents(created_by,company_id);
create index sl_incidents_company_time on public.sl_incidents(company_id,starts_at,ends_at);
create table public.sl_incident_targets(
 incident_id uuid not null, employee_id uuid not null, company_id uuid not null,
 primary key(incident_id,employee_id),
 foreign key(incident_id,company_id) references public.sl_incidents(id,company_id),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id)
);
create index sl_incident_target_employee on public.sl_incident_targets(employee_id,company_id);
create index sl_incident_target_report on public.sl_incident_targets(incident_id,company_id);
create table public.sl_attendance_exceptions(
 id uuid primary key default gen_random_uuid(), incident_id uuid not null,
 shift_id uuid not null, employee_id uuid not null, company_id uuid not null,
 status text not null default 'pending' check(status in ('pending','explained','dismissed')),
 reviewed_by uuid, reviewed_at timestamptz, review_reason text,
 unique(incident_id,shift_id),
 foreign key(incident_id,company_id) references public.sl_incidents(id,company_id),
 foreign key(shift_id,employee_id,company_id) references public.sl_shifts(id,employee_id,company_id),
 foreign key(reviewed_by,company_id) references public.sl_employees(id,company_id),
 check((status='pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
 or (status<>'pending' and reviewed_by is not null and reviewed_at is not null and length(trim(review_reason)) between 1 and 1000))
);
create index sl_exception_shift on public.sl_attendance_exceptions(shift_id,employee_id,company_id);
create index sl_exception_reviewer on public.sl_attendance_exceptions(reviewed_by,company_id);
create index sl_exception_report on public.sl_attendance_exceptions(incident_id,company_id);
create table public.sl_report_documents(
 id uuid primary key, incident_id uuid not null, company_id uuid not null,
 uploaded_by uuid not null, filename text not null check(length(filename) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','text/plain')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 object_path text not null unique, status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default clock_timestamp(), unique(id,company_id),
 foreign key(incident_id,company_id) references public.sl_incidents(id,company_id),
 foreign key(uploaded_by,company_id) references public.sl_employees(id,company_id)
);
create index sl_document_incident on public.sl_report_documents(incident_id,company_id);
create index sl_document_uploader on public.sl_report_documents(uploaded_by,company_id);
do $$ declare t text; begin
 foreach t in array array['sl_work_activities','sl_incidents','sl_incident_targets','sl_attendance_exceptions','sl_report_documents'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

create trigger sl_activities_immutable before update or delete on public.sl_work_activities for each row execute function shiftline_private.immutable();
create trigger sl_incidents_immutable before update or delete on public.sl_incidents for each row execute function shiftline_private.immutable();
create trigger sl_incident_targets_immutable before update or delete on public.sl_incident_targets for each row execute function shiftline_private.immutable();
create function shiftline_private.preserve_report_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Report evidence is immutable'; end if;
 if tg_table_name='sl_report_documents' then
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or old.status='ready' or new.status<>'ready' then raise exception 'Report evidence is immutable'; end if;
 else
  if (to_jsonb(new)-array['status','reviewed_by','reviewed_at','review_reason']) is distinct from (to_jsonb(old)-array['status','reviewed_by','reviewed_at','review_reason']) or old.status<>'pending' or new.status='pending' then raise exception 'Reviewed explanation is immutable'; end if;
 end if;
 return new;
end $$;
create trigger sl_report_documents_evidence before update or delete on public.sl_report_documents for each row execute function shiftline_private.preserve_report_evidence();
create trigger sl_exception_review_evidence before update or delete on public.sl_attendance_exceptions for each row execute function shiftline_private.preserve_report_evidence();

create function shiftline_private.link_incidents(p_company uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.sl_attendance_exceptions(incident_id,shift_id,employee_id,company_id)
 select i.id,s.id,s.employee_id,s.company_id from public.sl_incidents i
 join public.sl_incident_targets t on t.incident_id=i.id and t.company_id=i.company_id
 join public.sl_shifts s on s.employee_id=t.employee_id and s.company_id=i.company_id
 join public.sl_companies c on c.id=s.company_id
 cross join lateral(select min(captured_at) filter(where type='clock_in') as first_in,
  max(captured_at) filter(where type='clock_out') as last_out from shiftline_private.effective_events(s.id)) e
 where i.company_id=p_company and e.first_in<i.ends_at
 and coalesce(e.last_out,((s.date+1)::timestamp at time zone c.timezone))>i.starts_at
 and e.first_in is not null
 on conflict(incident_id,shift_id) do nothing;
$$;

-- Policy helper returns only permission, never document content or metadata.
create function shiftline_private.report_object_allowed(p_path text,p_upload boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.sl_report_documents d
 join public.sl_employees e on e.company_id=d.company_id and e.user_id=auth.uid()
 where d.object_path=p_path and e.role='manager' and e.access_status='active'
 and (not p_upload or (d.uploaded_by=e.id and d.status='pending')));
$$;
revoke all on function shiftline_private.link_incidents(uuid),shiftline_private.report_object_allowed(text,boolean) from public,anon,authenticated;
grant execute on function shiftline_private.report_object_allowed(text,boolean) to authenticated;
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('shiftline-reports','shiftline-reports',false,5242880,array['application/pdf','text/plain']);
  execute 'create policy shiftline_report_upload on storage.objects for insert to authenticated with check(bucket_id=''shiftline-reports'' and shiftline_private.report_object_allowed(name,true))';
  execute 'create policy shiftline_report_read on storage.objects for select to authenticated using(bucket_id=''shiftline-reports'' and shiftline_private.report_object_allowed(name,false))';
 end if;
end $$;

alter function shiftline_private.snapshot() rename to snapshot_before_workplace_reports;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_before_workplace_reports();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object(
 'workActivities',coalesce((select jsonb_agg(to_jsonb(a) order by a.recorded_at desc) from public.sl_work_activities a where a.company_id=me.company_id and (me.role='manager' or a.employee_id=me.id)),'[]'),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i)-'source_payload' order by i.created_at desc) from public.sl_incidents i where i.company_id=me.company_id and (me.role='manager' or exists(select 1 from public.sl_incident_targets t where t.incident_id=i.id and t.employee_id=me.id))),'[]'),
 'incidentExceptions',coalesce((select jsonb_agg(to_jsonb(x)) from public.sl_attendance_exceptions x where x.company_id=me.company_id and (me.role='manager' or x.employee_id=me.id)),'[]'),
 'reportDocuments',case when me.role='manager' then coalesce((select jsonb_agg(to_jsonb(d) order by created_at) from public.sl_report_documents d where d.company_id=me.company_id),'[]') else '[]'::jsonb end);
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_before_workplace_reports;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; co public.sl_companies; sh public.sl_shifts; a public.sl_work_activities;
 i public.sl_incidents; d public.sl_report_documents; x public.sl_attendance_exceptions;
 rid uuid; jid uuid; targets uuid[]; scope text; starts timestamptz; ends timestamptz; transition_type text;
 result jsonb; obj jsonb;
begin
 if p_action not in ('record_work_activity','create_incident','review_incident_exception','reserve_report_document','finish_report_document') then
  result:=shiftline_private.command_before_workplace_reports(p_action,p_data);
  if p_action in ('start_workday','transition','submit_attendance','review_submission','approve_correction') then
   select * into me from public.sl_employees where user_id=auth.uid();
   perform shiftline_private.link_incidents(me.company_id);
   result:=result||jsonb_build_object('snapshot',shiftline_private.snapshot());
  end if;
  return result;
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid report payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your workplace first'; end if;
 select * into co from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.access_status<>'active' then raise exception 'Manager approval required' using errcode='42501'; end if;
 rid:=(p_data->>'id')::uuid;
 if rid is null then raise exception 'Record ID required'; end if;
 if p_action='record_work_activity' then
  if me.role<>'employee' then raise exception 'Worker access required'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','shiftId','kind','description','jobId')) then raise exception 'Invalid activity payload'; end if;
  if coalesce(p_data->>'kind','') not in ('leaving_site','arrived_site','inspection','returning_office','other') or coalesce(length(trim(p_data->>'description')),0) not between 1 and 1000 then raise exception 'Choose an activity and explanation'; end if;
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=me.company_id and employee_id=me.id for update;
  if sh.id is null then raise exception 'Unknown workday'; end if;
  jid:=nullif(p_data->>'jobId','')::uuid;
  select * into a from public.sl_work_activities where id=rid;
  if a.id is not null then
   if a.employee_id<>me.id or a.shift_id<>sh.id or a.kind<>p_data->>'kind' or a.description<>trim(p_data->>'description') or a.job_id is distinct from jid then raise exception 'Activity ID conflict'; end if;
   return jsonb_build_object('snapshot',shiftline_private.snapshot(),'duplicate',true);
  end if;
  if shiftline_private.state(sh.id) not in ('working','on_job') then raise exception 'Record work activities only while working'; end if;
  if (clock_timestamp() at time zone co.timezone)::date<>sh.date then raise exception 'Workday is not current'; end if;
  if jid is not null and not exists(select 1 from public.sl_jobs where id=jid and shift_id=sh.id and employee_id=me.id and company_id=me.company_id) then raise exception 'Job is not assigned to you'; end if;
  if p_data->>'kind' in ('leaving_site','inspection') and jid is null then raise exception 'Choose your assigned job'; end if;
  if p_data->>'kind' in ('arrived_site','returning_office') and (jid is null or jid is distinct from shiftline_private.active_job(sh.id)) then raise exception 'Choose your current active job'; end if;
  if p_data->>'kind' in ('leaving_site','inspection') and shiftline_private.state(sh.id)='working' then transition_type:='start_job';
  elsif p_data->>'kind'='returning_office' then transition_type:='end_job'; end if;
  if p_data->>'kind'='leaving_site' and transition_type is null then raise exception 'Already on a job'; end if;
  if transition_type is not null then
   perform shiftline_private.command_before_workplace_reports('transition',jsonb_build_object('id',rid,'type',transition_type,'jobId',jid));
  elsif jid is not null and jid is distinct from shiftline_private.active_job(sh.id) then raise exception 'Activity must match your active job'; end if;
  insert into public.sl_work_activities(id,company_id,employee_id,shift_id,job_id,kind,description)
   values(rid,me.company_id,me.id,sh.id,jid,p_data->>'kind',trim(p_data->>'description'));
 else
  if me.role<>'manager' then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_action='create_incident' then
   if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','kind','title','description','startsLocal','endsLocal','scope','target')) then raise exception 'Invalid incident payload'; end if;
   starts:=(p_data->>'startsLocal')::timestamp at time zone co.timezone; ends:=(p_data->>'endsLocal')::timestamp at time zone co.timezone;
   scope:=p_data->>'scope';
   if starts is null or ends is null or ends<=starts or ends>starts+interval '31 days' or coalesce(p_data->>'kind','') not in ('power_outage','disruption','early_release','emergency','other') or coalesce(length(trim(p_data->>'title')),0) not between 1 and 200 or coalesce(length(trim(p_data->>'description')),0) not between 1 and 4000 or scope is null or scope not in ('company','site','department','employee') then raise exception 'Check incident details and time range'; end if;
   select * into i from public.sl_incidents where id=rid;
   if i.id is not null then
    if i.company_id<>me.company_id or i.created_by<>me.id or i.source_payload<>p_data then raise exception 'Incident ID conflict'; end if;
   else
    select array_agg(e.id) into targets from public.sl_employees e where e.company_id=me.company_id and e.role='employee' and e.access_status='active'
     and (scope='company' or (scope='site' and e.site_id::text=p_data->>'target') or (scope='department' and e.team=p_data->>'target' and e.team<>'') or (scope='employee' and e.id::text=p_data->>'target'));
    if coalesce(cardinality(targets),0)=0 then raise exception 'Choose affected active employees'; end if;
    insert into public.sl_incidents(id,company_id,kind,title,description,starts_at,ends_at,created_by,source_payload)
     values(rid,me.company_id,p_data->>'kind',trim(p_data->>'title'),trim(p_data->>'description'),starts,ends,me.id,p_data);
    insert into public.sl_incident_targets select rid,employee_id,me.company_id from unnest(targets) as target(employee_id);
   end if;
   perform shiftline_private.link_incidents(me.company_id);
  elsif p_action='review_incident_exception' then
   if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','decision','reason')) then raise exception 'Invalid review payload'; end if;
   select * into x from public.sl_attendance_exceptions where id=rid and company_id=me.company_id for update;
   if x.id is null or x.employee_id=me.id then raise exception 'Unknown review or cannot review yourself'; end if;
   if coalesce(p_data->>'decision','') not in ('explained','dismissed') or coalesce(length(trim(p_data->>'reason')),0) not between 1 and 1000 then raise exception 'Decision and reason required'; end if;
   if x.status<>'pending' then
    if x.status<>p_data->>'decision' or x.review_reason<>trim(p_data->>'reason') or x.reviewed_by<>me.id then raise exception 'Incident explanation already reviewed'; end if;
   else
    update public.sl_attendance_exceptions set status=p_data->>'decision',review_reason=trim(p_data->>'reason'),reviewed_by=me.id,reviewed_at=clock_timestamp() where id=rid;
   end if;
  elsif p_action='reserve_report_document' then
   if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','incidentId','filename','mimeType','sizeBytes')) then raise exception 'Invalid document payload'; end if;
   if not exists(select 1 from public.sl_incidents where id=(p_data->>'incidentId')::uuid and company_id=me.company_id) then raise exception 'Unknown incident'; end if;
   if coalesce(p_data->>'mimeType','') not in ('application/pdf','text/plain') or coalesce((p_data->>'sizeBytes')::integer,0) not between 1 and 5242880 or coalesce(length(p_data->>'filename'),0) not between 1 and 200 then raise exception 'Upload a PDF or TXT document up to 5 MB'; end if;
   select * into d from public.sl_report_documents where id=rid;
   if d.id is not null then
    if d.company_id<>me.company_id or d.uploaded_by<>me.id or d.incident_id<>(p_data->>'incidentId')::uuid or d.filename<>p_data->>'filename' or d.mime_type<>p_data->>'mimeType' or d.size_bytes<>(p_data->>'sizeBytes')::integer then raise exception 'Document ID conflict'; end if;
   else
    insert into public.sl_report_documents(id,incident_id,company_id,uploaded_by,filename,mime_type,size_bytes,object_path)
     values(rid,(p_data->>'incidentId')::uuid,me.company_id,me.id,p_data->>'filename',p_data->>'mimeType',(p_data->>'sizeBytes')::integer,me.company_id::text||'/'||rid::text||case when p_data->>'mimeType'='application/pdf' then '.pdf' else '.txt' end);
   end if;
  else
   if exists(select 1 from jsonb_object_keys(p_data) k where k<>'id') then raise exception 'Invalid document payload'; end if;
   select * into d from public.sl_report_documents where id=rid and company_id=me.company_id and uploaded_by=me.id for update;
   if d.id is null then raise exception 'Unknown document'; end if;
   if to_regclass('storage.objects') is null then raise exception 'Storage is unavailable'; end if;
   execute 'select metadata from storage.objects where bucket_id=$1 and name=$2' into obj using 'shiftline-reports',d.object_path;
   if obj is null or coalesce((obj->>'size')::bigint,0)<>d.size_bytes or obj->>'mimetype' is distinct from d.mime_type then raise exception 'Uploaded document is missing or does not match'; end if;
   if d.status<>'ready' then update public.sl_report_documents set status='ready' where id=d.id; end if;
  end if;
 end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('id',rid));
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_workplace_reports(),shiftline_private.command(text,jsonb),shiftline_private.command_before_workplace_reports(text,jsonb) from public,anon,authenticated;
revoke all on function shiftline_private.preserve_report_evidence() from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
