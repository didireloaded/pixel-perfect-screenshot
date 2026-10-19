-- Keep approved leave and original balance charges as evidence. Reversals are separate.
alter table public.sl_requests drop constraint sl_requests_status_check;
alter table public.sl_requests add constraint sl_requests_status_check check(status in ('pending','approved','declined','cancelled'));
create table public.sl_leave_changes(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 employee_id uuid not null, request_id uuid not null, kind text not null check(kind in ('cancel','amend')),
 leave_start date,leave_end date,leave_start_time time,leave_end_time time,
 explanation text not null check(length(trim(explanation)) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','declined')),
 requested_at timestamptz not null default now(),reviewed_by uuid references public.sl_employees,reviewed_at timestamptz,review_reason text,
 replacement_id uuid references public.sl_requests,
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id),
 foreign key(request_id,company_id) references public.sl_requests(id,company_id),
 check((kind='cancel' and leave_start is null and leave_end is null and leave_start_time is null and leave_end_time is null) or
 (kind='amend' and leave_start is not null and leave_end is not null and leave_end>=leave_start and leave_end-leave_start<=366 and
 ((leave_start_time is null and leave_end_time is null) or (leave_start_time is not null and leave_end_time is not null and leave_start=leave_end and leave_end_time>leave_start_time))))
);
create unique index sl_leave_change_pending on public.sl_leave_changes(request_id) where status='pending';
create index sl_leave_changes_company on public.sl_leave_changes(company_id,requested_at);
create table public.sl_leave_reversals(
 request_id uuid primary key references public.sl_requests, change_id uuid not null unique references public.sl_leave_changes,
 created_at timestamptz not null default now()
);
alter table public.sl_leave_changes enable row level security;
alter table public.sl_leave_reversals enable row level security;
revoke all on public.sl_leave_changes,public.sl_leave_reversals from public,anon,authenticated;
create trigger sl_leave_reversals_immutable before update or delete on public.sl_leave_reversals for each row execute function shiftline_private.immutable();
create view shiftline_private.active_leave_charges as select c.* from public.sl_leave_charges c where not exists(select 1 from public.sl_leave_reversals r where r.request_id=c.request_id);
revoke all on shiftline_private.active_leave_charges from public,anon,authenticated;
-- Existing snapshot/approval/allowance calculations share the same active ledger projection.
do $$ declare f record; definition text; changed integer:=0; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='shiftline_private' and p.prokind='f' loop
  definition:=pg_get_functiondef(f.oid);
  if position('from public.sl_leave_charges' in definition)>0 then
   execute replace(definition,'from public.sl_leave_charges','from shiftline_private.active_leave_charges'); changed:=changed+1;
  end if;
 end loop;
 if changed<2 then raise exception 'Leave ledger integration source mismatch'; end if;
end $$;
create function shiftline_private.leave_changes(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.sl_employees; req public.sl_requests; change public.sl_leave_changes; replacement uuid; result jsonb; today date; local_now timestamp; reviewer record;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then raise exception 'Invalid leave change'; end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select (now() at time zone timezone)::date, now() at time zone timezone into today,local_now from public.sl_companies where id=me.company_id;
 if p_action='request' then
  select * into req from public.sl_requests where id=(p_data->>'requestId')::uuid and company_id=me.company_id and employee_id=me.id and kind='leave' for update;
  if req.id is null or req.status not in ('pending','approved') then raise exception 'Choose your pending or approved leave'; end if;
  if coalesce(length(trim(p_data->>'explanation')),0) not between 1 and 1000 or coalesce(p_data->>'kind','') not in ('cancel','amend') then raise exception 'Choose a change and explain why'; end if;
  if req.leave_start is null or req.leave_start+coalesce(req.leave_start_time,'00:00'::time)<=local_now then raise exception 'Past or started leave requires a historical attendance review'; end if;
  if exists(select 1 from public.sl_periods where company_id=me.company_id and daterange(start_date,end_date,'[]') && daterange(req.leave_start,req.leave_end,'[]')) then raise exception 'This period is locked'; end if;
  insert into public.sl_leave_changes(id,company_id,employee_id,request_id,kind,explanation,leave_start,leave_end,leave_start_time,leave_end_time)
   values(coalesce((p_data->>'id')::uuid,gen_random_uuid()),me.company_id,me.id,req.id,p_data->>'kind',trim(p_data->>'explanation'),
    (p_data->>'leaveStart')::date,(p_data->>'leaveEnd')::date,(p_data->>'leaveStartTime')::time,(p_data->>'leaveEndTime')::time);
  for reviewer in select id from public.sl_employees where company_id=me.company_id and access_role in ('owner','hr') and access_status='active' and id<>me.id loop
   perform shiftline_private.notify_employee(reviewer.id,'leave-change:'||(p_data->>'id'),'Leave change needs review','/manager?tab=Requests');
  end loop;
 elsif p_action='review' then
  if me.access_role not in ('owner','hr') then raise exception 'Owner or HR access required' using errcode='42501'; end if;
  select * into change from public.sl_leave_changes where id=(p_data->>'id')::uuid and company_id=me.company_id for update;
  if change.id is null or change.status<>'pending' or change.employee_id=me.id then raise exception 'This change cannot be reviewed'; end if;
  if coalesce(p_data->>'status','') not in ('approved','declined') or coalesce(length(trim(p_data->>'reason')),0) not between 1 and 1000 then raise exception 'Choose a decision and explain why'; end if;
  select * into req from public.sl_requests where id=change.request_id and company_id=me.company_id for update;
  if p_data->>'status'='approved' then
   if req.status not in ('pending','approved') or req.leave_start+coalesce(req.leave_start_time,'00:00'::time)<=local_now then raise exception 'Leave changed or has started; refresh and review attendance instead'; end if;
   if exists(select 1 from public.sl_periods where company_id=me.company_id and (daterange(start_date,end_date,'[]') && daterange(req.leave_start,req.leave_end,'[]') or (change.kind='amend' and daterange(start_date,end_date,'[]') && daterange(change.leave_start,change.leave_end,'[]')))) then raise exception 'This period is locked'; end if;
   if change.kind='amend' and change.leave_start+coalesce(change.leave_start_time,'00:00'::time)<=local_now then raise exception 'Choose future leave dates'; end if;
   update public.sl_requests set status='cancelled' where id=req.id;
   if req.status='approved' then insert into public.sl_leave_reversals(request_id,change_id) values(req.id,change.id); end if;
   if change.kind='amend' then
    replacement:=gen_random_uuid();
    insert into public.sl_requests(id,company_id,employee_id,kind,summary,detail,leave_start,leave_end,leave_start_time,leave_end_time,leave_type)
     values(replacement,me.company_id,req.employee_id,'leave',req.summary,req.detail,change.leave_start,change.leave_end,change.leave_start_time,change.leave_end_time,req.leave_type);
    -- Reuse normal overlap, classification, allowance and approval validation atomically.
    perform shiftline_private.command('review_request',jsonb_build_object('id',replacement,'status','approved','reason',trim(p_data->>'reason')));
   end if;
  end if;
  update public.sl_leave_changes set status=p_data->>'status',reviewed_by=me.id,reviewed_at=now(),review_reason=trim(p_data->>'reason'),replacement_id=replacement where id=change.id;
   perform shiftline_private.notify_employee(change.employee_id,'leave-change-review:'||change.id,'Your leave change was reviewed','requests');
 elsif p_action<>'list' then raise exception 'Unknown leave change action'; end if;
 if p_action<>'list' then
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'leave_change_'||p_action,p_data-array['explanation','reason']);
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Leave refresh unavailable: %',sqlstate; end;
  end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.requested_at desc),'[]'::jsonb) into result from public.sl_leave_changes c where c.company_id=me.company_id and (c.employee_id=me.id or me.access_role in ('owner','hr'));
 return jsonb_build_object('changes',result);
end $$;
revoke all on function shiftline_private.leave_changes(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.leave_changes(text,jsonb) to authenticated;
create function public.sl_leave_changes(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.leave_changes(p_action,p_data) $$;
revoke all on function public.sl_leave_changes(text,jsonb) from public,anon;
grant execute on function public.sl_leave_changes(text,jsonb) to authenticated;
