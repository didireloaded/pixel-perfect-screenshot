-- Task discussion, manager notes, and short-lived worksite presence.
-- Presence retains no worker coordinates; the map uses configured site coordinates.
create table public.sl_job_comments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 job_id uuid not null references public.sl_jobs, author_id uuid not null references public.sl_employees,
 body text not null check(length(trim(body)) between 1 and 2000), created_at timestamptz not null default clock_timestamp()
);
create index sl_job_comments_job on public.sl_job_comments(job_id,created_at);
create table public.sl_manager_notes (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 author_id uuid not null references public.sl_employees,
 title text not null check(length(trim(title)) between 1 and 120),
 body text not null default '' check(length(body)<=4000),
 created_at timestamptz not null default clock_timestamp()
);
create index sl_manager_notes_company on public.sl_manager_notes(company_id,created_at desc);
create table public.sl_site_presence (
 employee_id uuid primary key references public.sl_employees, company_id uuid not null references public.sl_companies,
 site_id uuid not null references public.sl_sites, shift_id uuid not null references public.sl_shifts,
 inside boolean not null, checked_at timestamptz not null default clock_timestamp()
);
create index sl_site_presence_company on public.sl_site_presence(company_id,checked_at desc);
alter table public.sl_job_comments enable row level security;
alter table public.sl_manager_notes enable row level security;
alter table public.sl_site_presence enable row level security;
revoke all on public.sl_job_comments,public.sl_manager_notes,public.sl_site_presence from anon,authenticated;

alter function shiftline_private.snapshot() rename to snapshot_v6;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_v6();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object(
  'jobComments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'jobId',c.job_id,
   'authorId',c.author_id,'authorName',e.name,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
   from public.sl_job_comments c join public.sl_employees e on e.id=c.author_id
   join public.sl_jobs j on j.id=c.job_id
   where c.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id or exists(
    select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id))),'[]'::jsonb),
  'managerNotes',case when me.role='manager' then coalesce((select jsonb_agg(jsonb_build_object(
   'id',n.id,'title',n.title,'body',n.body,'authorName',e.name,'createdAt',n.created_at) order by n.created_at desc)
   from public.sl_manager_notes n join public.sl_employees e on e.id=n.author_id
   where n.company_id=me.company_id),'[]'::jsonb) else '[]'::jsonb end,
  'sitePresence',case when me.role='manager' then coalesce((select jsonb_agg(jsonb_build_object(
   'employeeId',p.employee_id,'siteId',p.site_id,'shiftId',p.shift_id,'inside',p.inside,
   'checkedAt',p.checked_at) order by p.checked_at desc)
   from public.sl_site_presence p join public.sl_shifts sh on sh.id=p.shift_id
   join public.sl_companies co on co.id=p.company_id
   where p.company_id=me.company_id and p.checked_at>clock_timestamp()-interval '3 minutes'
    and (clock_timestamp() at time zone co.timezone)::date=sh.date
    and (clock_timestamp() at time zone co.timezone)::time between sh.start_time and sh.end_time
    and shiftline_private.state(sh.id)='working'),'[]'::jsonb) else '[]'::jsonb end);
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_v8;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; j public.sl_jobs; sh public.sl_shifts; site public.sl_sites; result jsonb;
 lat double precision; lon double precision; accuracy double precision; meters double precision;
begin
 if p_action='submit_attendance' then
  result:=shiftline_private.command_v8(p_action,p_data);
  if result->>'status'='synced' and p_data->>'type' in ('start_lunch','start_job','start_personal','clock_out') then
   select * into me from public.sl_employees where user_id=auth.uid();
   delete from public.sl_site_presence where employee_id=me.id and company_id=me.company_id;
  end if;
  return result;
 end if;
 if p_action='report_position' then
  result:=shiftline_private.command_v8(p_action,p_data);
  select * into me from public.sl_employees where user_id=auth.uid();
  select * into sh from public.sl_shifts where id=(p_data->>'shiftId')::uuid and company_id=me.company_id and employee_id=me.id;
  select * into site from public.sl_sites where id=sh.site_id;
  lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision;
  accuracy:=(p_data->>'accuracyM')::double precision;
  meters:=shiftline_private.distance(site.latitude,site.longitude,lat,lon);
  insert into public.sl_site_presence(employee_id,company_id,site_id,shift_id,inside,checked_at)
   values(me.id,me.company_id,site.id,sh.id,meters<=site.radius_m+accuracy,clock_timestamp())
   on conflict(employee_id) do update set company_id=excluded.company_id,site_id=excluded.site_id,
    shift_id=excluded.shift_id,inside=excluded.inside,checked_at=excluded.checked_at;
  return result;
 end if;
 if p_action not in ('add_job_comment','add_manager_note','delete_manager_note') then
  return shiftline_private.command_v8(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 if p_action='add_job_comment' then
  select * into j from public.sl_jobs where id=(p_data->>'jobId')::uuid and company_id=me.company_id;
  if j.id is null or not (me.role='manager' or j.employee_id=me.id or exists(
   select 1 from public.sl_job_members jm where jm.job_id=j.id and jm.employee_id=me.id)) then
   raise exception 'Job unavailable'; end if;
  insert into public.sl_job_comments(company_id,job_id,author_id,body)
   values(me.company_id,j.id,me.id,trim(p_data->>'body'));
 elsif p_action='add_manager_note' then
  if me.role<>'manager' then raise exception 'Manager access required'; end if;
  insert into public.sl_manager_notes(company_id,author_id,title,body)
   values(me.company_id,me.id,trim(p_data->>'title'),trim(coalesce(p_data->>'body','')));
 elsif p_action='delete_manager_note' then
  if me.role<>'manager' then raise exception 'Manager access required'; end if;
  delete from public.sl_manager_notes where id=(p_data->>'id')::uuid and company_id=me.company_id;
 end if;
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,
  case when p_action='add_job_comment' then jsonb_build_object('jobId',j.id) else p_data end);
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
