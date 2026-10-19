-- Contact information never changes authentication identifiers.
alter table public.sl_employees add column contact_phone text not null default '' check(length(contact_phone)<=40);
create table public.sl_profile_change_requests(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies(id),
 employee_id uuid not null references public.sl_employees(id),original_profile jsonb not null,proposed_profile jsonb not null,
 submitted_at timestamptz not null default clock_timestamp()
);
create index sl_profile_changes_company on public.sl_profile_change_requests(company_id,submitted_at desc);
create index sl_profile_changes_employee on public.sl_profile_change_requests(employee_id);
create table public.sl_profile_change_reviews(
 request_id uuid primary key references public.sl_profile_change_requests(id),company_id uuid not null references public.sl_companies(id),
 reviewer_id uuid not null references public.sl_employees(id),decision text not null check(decision in ('approved','declined')),
 reason text not null check(length(trim(reason)) between 1 and 1000),reviewed_at timestamptz not null default clock_timestamp()
);
create index sl_profile_reviews_company on public.sl_profile_change_reviews(company_id);
create index sl_profile_reviews_reviewer on public.sl_profile_change_reviews(reviewer_id);
alter table public.sl_profile_change_requests enable row level security;
alter table public.sl_profile_change_reviews enable row level security;
revoke all on public.sl_profile_change_requests,public.sl_profile_change_reviews from public,anon,authenticated;
create trigger sl_profile_requests_immutable before update or delete on public.sl_profile_change_requests for each row execute function shiftline_private.immutable();
create trigger sl_profile_reviews_immutable before update or delete on public.sl_profile_change_reviews for each row execute function shiftline_private.immutable();
create function shiftline_private.profile_change_requests_api(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees;target public.sl_employees;req public.sl_profile_change_requests;profile jsonb;proposed jsonb;decision text;reason text;key text;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then raise exception 'Invalid profile request';end if;
 if p_action='submit' then
  if me.role<>'employee' then raise exception 'Employee access required' using errcode='42501';end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','contactPhone','jobTitle','bio')) then raise exception 'Only contact profile fields can be requested';end if;
  foreach key in array array['name','contactPhone','jobTitle','bio'] loop
   if jsonb_typeof(p_data->key) is distinct from 'string' then raise exception 'Enter all contact profile fields';end if;
  end loop;
  proposed:=jsonb_build_object('name',trim(p_data->>'name'),'contactPhone',trim(p_data->>'contactPhone'),'jobTitle',trim(p_data->>'jobTitle'),'bio',trim(p_data->>'bio'));
  if length(proposed->>'name') not between 1 and 100 or length(proposed->>'contactPhone')>40 or length(proposed->>'jobTitle')>100 or length(proposed->>'bio')>1000 then raise exception 'Profile fields exceed their allowed length';end if;
  select * into me from public.sl_employees where id=me.id for update;
  profile:=jsonb_build_object('name',me.name,'contactPhone',me.contact_phone,'jobTitle',me.job_title,'bio',me.bio);
  if profile=proposed then raise exception 'No profile changes to request';end if;
  if exists(select 1 from public.sl_profile_change_requests r where r.employee_id=me.id and not exists(select 1 from public.sl_profile_change_reviews v where v.request_id=r.id)) then raise exception 'A profile request is already awaiting review';end if;
  insert into public.sl_profile_change_requests(company_id,employee_id,original_profile,proposed_profile) values(me.company_id,me.id,profile,proposed);
 elsif p_action='review' then
  if me.access_role not in ('owner','hr') then raise exception 'HR access required' using errcode='42501';end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('requestId','decision','reason')) then raise exception 'Invalid review fields';end if;
  select * into req from public.sl_profile_change_requests where id=(p_data->>'requestId')::uuid and company_id=me.company_id for update;
  if req.id is null or req.employee_id=me.id then raise exception 'Independent company reviewer required' using errcode='42501';end if;
  if exists(select 1 from public.sl_profile_change_reviews where request_id=req.id) then raise exception 'Request already reviewed';end if;
  decision:=p_data->>'decision';reason:=trim(coalesce(p_data->>'reason',''));
  if decision is null or decision not in ('approved','declined') or length(reason) not between 1 and 1000 then raise exception 'Choose a decision and explain it';end if;
  select * into target from public.sl_employees where id=req.employee_id and company_id=me.company_id for update;
  if decision='approved' then
   if target.access_status<>'active' then raise exception 'Employee no longer has active access';end if;
   profile:=jsonb_build_object('name',target.name,'contactPhone',target.contact_phone,'jobTitle',target.job_title,'bio',target.bio);
   if profile<>req.original_profile then raise exception 'Profile changed since submission; decline and request a fresh change';end if;
   update public.sl_employees set name=req.proposed_profile->>'name',contact_phone=req.proposed_profile->>'contactPhone',job_title=req.proposed_profile->>'jobTitle',bio=req.proposed_profile->>'bio' where id=target.id;
  end if;
  insert into public.sl_profile_change_reviews(request_id,company_id,reviewer_id,decision,reason) values(req.id,me.company_id,me.id,decision,reason);
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'profile_change_reviewed',jsonb_build_object('requestId',req.id,'decision',decision));
 elsif p_action<>'list' then raise exception 'Unknown profile change action';end if;
 return jsonb_build_object('currentProfile',jsonb_build_object('name',me.name,'contactPhone',me.contact_phone,'jobTitle',me.job_title,'bio',me.bio),'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'name',e.name,'original',r.original_profile,'proposed',r.proposed_profile,'submittedAt',r.submitted_at,'decision',coalesce(v.decision,'pending'),'reason',v.reason,'reviewedAt',v.reviewed_at,'reviewerId',v.reviewer_id) order by r.submitted_at desc) from public.sl_profile_change_requests r join public.sl_employees e on e.id=r.employee_id left join public.sl_profile_change_reviews v on v.request_id=r.id where r.company_id=me.company_id and (r.employee_id=me.id or me.access_role in ('owner','hr'))),'[]'::jsonb));
end $$;
create function public.sl_profile_change_requests(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select shiftline_private.profile_change_requests_api(p_action,p_data)$$;
revoke all on function public.sl_profile_change_requests(text,jsonb),shiftline_private.profile_change_requests_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_profile_change_requests(text,jsonb),shiftline_private.profile_change_requests_api(text,jsonb) to authenticated;

-- Enrich only employee rows already visible through the existing scoped snapshot.
do $$ begin
 if to_regprocedure('shiftline_private.snapshot()') is null or to_regprocedure('shiftline_private.snapshot_before_contact_profile()') is not null then
  raise exception 'Contact profile snapshot migration state is unexpected';
 end if;
end $$;
alter function shiftline_private.snapshot() rename to snapshot_before_contact_profile;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;me public.sl_employees;
begin
 result:=shiftline_private.snapshot_before_contact_profile();
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null or jsonb_typeof(result->'employees') is distinct from 'array' then return result;end if;
 return jsonb_set(result,'{employees}',coalesce((select jsonb_agg(
  case when e.id=me.id or me.access_role in ('owner','hr') then item||jsonb_build_object('contactPhone',e.contact_phone) else item end order by ord)
  from jsonb_array_elements(result->'employees') with ordinality a(item,ord)
  join public.sl_employees e on e.id=(item->>'id')::uuid and e.company_id=me.company_id),'[]'::jsonb));
end $$;
revoke all on function shiftline_private.snapshot(),shiftline_private.snapshot_before_contact_profile() from public,anon,authenticated;
grant execute on function shiftline_private.snapshot() to authenticated;
