-- A committed transition remains retryable after its local workday ends. Resolve
-- only existing event IDs here; new evidence still passes every original guard.
alter function shiftline_private.command(text,jsonb) rename to command_before_transition_retry;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; event public.sl_events; submission public.sl_submissions;
begin
 if p_action='transition' and p_data->>'id' is not null then
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into me from public.sl_employees where user_id=auth.uid();
  if me.id is null then raise exception 'Join your workplace first'; end if;
  if me.access_status<>'active' then raise exception 'Your workplace access is awaiting manager approval' using errcode='42501'; end if;
  -- Match the lock used by normal attendance so simultaneous replays serialize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  select * into event from public.sl_events where id=(p_data->>'id')::uuid;
  if event.id is not null then
   select * into submission from public.sl_submissions where canonical_event_id=event.id;
   if event.employee_id<>me.id or event.company_id<>me.company_id
    or event.type is distinct from p_data->>'type'
    or event.note is distinct from coalesce(p_data->>'note','')
    or (event.type='start_job' and event.job_id is distinct from nullif(p_data->>'jobId','')::uuid)
    or (submission.id is not null and (
      submission.device_id is distinct from nullif(p_data->>'deviceId','')::uuid
      or submission.payload->>'reason' is distinct from p_data->>'reason'
      or submission.payload->>'expectedReturn' is distinct from p_data->>'expectedReturn'
      or (submission.payload->'location' is not null and submission.payload->'location'<>'null'::jsonb
       and submission.payload->'location' is distinct from p_data->'location')
    )) then raise exception 'Event ID conflict'; end if;
   return jsonb_build_object('duplicate',true,'status','synced','snapshot',shiftline_private.snapshot());
  end if;
 end if;
 return shiftline_private.command_before_transition_retry(p_action,p_data);
end $$;
revoke all on function shiftline_private.command_before_transition_retry(text,jsonb),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
