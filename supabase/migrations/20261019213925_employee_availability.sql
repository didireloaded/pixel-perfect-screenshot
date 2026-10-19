-- Availability expresses a preference, never approved leave or attendance evidence.
create table public.sl_employee_availability(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,
 employee_id uuid not null,availability text not null check(availability in ('available','unavailable')),
 start_date date not null,end_date date not null,start_time time,end_time time,
 reason text not null default '' check(length(reason)<=1000),created_at timestamptz not null default now(),withdrawn_at timestamptz,
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id),
 check(end_date>=start_date and end_date-start_date<=366),
 check((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_date=end_date and end_time>start_time))
);
create index sl_employee_availability_company on public.sl_employee_availability(company_id,start_date);
create index sl_employee_availability_employee on public.sl_employee_availability(employee_id,start_date) where withdrawn_at is null;
alter table public.sl_employee_availability enable row level security;
revoke all on public.sl_employee_availability from public,anon,authenticated;
create function shiftline_private.availability_immutable() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'Availability history is retained'; end if;
 if old.withdrawn_at is not null or new.withdrawn_at is null or (to_jsonb(old)-'withdrawn_at') is distinct from (to_jsonb(new)-'withdrawn_at') then raise exception 'Only withdrawal is allowed'; end if;
 return new;
end $$;
revoke all on function shiftline_private.availability_immutable() from public,anon,authenticated;
create trigger sl_availability_immutable before update or delete on public.sl_employee_availability for each row execute function shiftline_private.availability_immutable();
create function shiftline_private.availability(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.sl_employees; first_day date; last_day date; starts time; ends time; local_now timestamp; selected public.sl_employee_availability; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then raise exception 'Invalid availability'; end if;
 if p_action<>'list' then perform 1 from public.sl_companies where id=me.company_id for update; end if;
 select now() at time zone timezone into local_now from public.sl_companies where id=me.company_id;
 if p_action='create' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','availability','startDate','endDate','startTime','endTime','reason')) then raise exception 'Invalid availability fields'; end if;
  first_day:=(p_data->>'startDate')::date;last_day:=(p_data->>'endDate')::date;starts:=nullif(p_data->>'startTime','')::time;ends:=nullif(p_data->>'endTime','')::time;
  if first_day is null or last_day is null or last_day<first_day or last_day-first_day>366 or first_day+coalesce(starts,'00:00'::time)<=local_now then raise exception 'Choose future availability dates'; end if;
  if (starts is null)<>(ends is null) or (starts is not null and (first_day<>last_day or ends<=starts)) then raise exception 'Hourly availability needs both times on one day'; end if;
  if coalesce(p_data->>'availability','') not in ('available','unavailable') or length(coalesce(p_data->>'reason',''))>1000 then raise exception 'Choose availability and a reason up to 1000 characters'; end if;
  if exists(select 1 from public.sl_employee_availability a where a.employee_id=me.id and a.withdrawn_at is null and
   tsrange(a.start_date+coalesce(a.start_time,'00:00'::time),case when a.end_time is null then a.end_date+1 else a.end_date+a.end_time end,'[)') &&
   tsrange(first_day+coalesce(starts,'00:00'::time),case when ends is null then last_day+1 else last_day+ends end,'[)')) then raise exception 'An availability preference already covers this period. Withdraw it first'; end if;
  insert into public.sl_employee_availability(id,company_id,employee_id,availability,start_date,end_date,start_time,end_time,reason)
   values(coalesce((p_data->>'id')::uuid,gen_random_uuid()),me.company_id,me.id,p_data->>'availability',first_day,last_day,starts,ends,trim(coalesce(p_data->>'reason','')));
 elsif p_action='withdraw' then
  select * into selected from public.sl_employee_availability where id=(p_data->>'id')::uuid and employee_id=me.id and company_id=me.company_id for update;
  if selected.id is null then raise exception 'Choose your own availability preference'; end if;
  if selected.withdrawn_at is null then
   if selected.start_date+coalesce(selected.start_time,'00:00'::time)<=local_now then raise exception 'Started availability remains in history'; end if;
   update public.sl_employee_availability set withdrawn_at=now() where id=selected.id;
  end if;
 elsif p_action<>'list' then raise exception 'Unknown availability action'; end if;
 if p_action<>'list' then
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'availability_'||p_action,p_data-'reason');
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);exception when others then raise log 'Availability refresh unavailable: %',sqlstate;end;
  end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.start_date desc,a.created_at desc),'[]'::jsonb) into result from public.sl_employee_availability a
  where a.company_id=me.company_id and (a.employee_id=me.id or me.access_role in ('owner','hr','operations'));
 return jsonb_build_object('availability',result);
end $$;
revoke all on function shiftline_private.availability(text,jsonb) from public,anon;
grant execute on function shiftline_private.availability(text,jsonb) to authenticated;
create function public.sl_availability(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.availability(p_action,p_data) $$;
revoke all on function public.sl_availability(text,jsonb) from public,anon;
grant execute on function public.sl_availability(text,jsonb) to authenticated;
