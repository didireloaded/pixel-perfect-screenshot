-- Company communications and job-specific teams and steps. All access remains through scoped RPCs.
create table public.sl_messages (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 recipient_id uuid not null references public.sl_employees, sender_id uuid not null references public.sl_employees,
 title text not null check(length(trim(title)) between 1 and 120),
 body text not null check(length(trim(body)) between 1 and 2000),
 sent_at timestamptz not null default clock_timestamp(), read_at timestamptz
);
create index sl_messages_recipient on public.sl_messages(recipient_id,sent_at desc);
create table public.sl_job_steps (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sl_companies,
 job_id uuid not null references public.sl_jobs, label text not null check(length(trim(label)) between 1 and 160),
 sort_order integer not null default 0, completed_at timestamptz, completed_by uuid references public.sl_employees,
 created_by uuid not null references public.sl_employees, created_at timestamptz not null default now()
);
create index sl_job_steps_job on public.sl_job_steps(job_id,sort_order,created_at);
create table public.sl_job_members (
 job_id uuid not null references public.sl_jobs, employee_id uuid not null references public.sl_employees,
 company_id uuid not null references public.sl_companies, added_by uuid not null references public.sl_employees,
 added_at timestamptz not null default now(), primary key(job_id,employee_id)
);
alter table public.sl_messages enable row level security;
alter table public.sl_job_steps enable row level security;
alter table public.sl_job_members enable row level security;
revoke all on public.sl_messages,public.sl_job_steps,public.sl_job_members from anon,authenticated;
alter table public.sl_notices drop constraint if exists sl_notices_kind_check;
alter table public.sl_notices add constraint sl_notices_kind_check
 check(kind in ('holiday','closure','early_release','announcement','event'));
alter table public.sl_notices add column starts_time time;

alter function shiftline_private.snapshot() rename to snapshot_v3;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; base jsonb;
begin
 base:=shiftline_private.snapshot_v3();
 if base->>'onboarding'='true' then return base; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 return base||jsonb_build_object(
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'recipientId',m.recipient_id,
    'senderName',s.name,'title',m.title,'body',m.body,'sentAt',m.sent_at,'readAt',m.read_at)
    order by m.sent_at desc) from public.sl_messages m join public.sl_employees s on s.id=m.sender_id
    where m.company_id=me.company_id and (me.role='manager' or m.recipient_id=me.id)),'[]'::jsonb),
  'jobSteps',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'jobId',st.job_id,
    'label',st.label,'sortOrder',st.sort_order,'completedAt',st.completed_at)
    order by st.sort_order,st.created_at) from public.sl_job_steps st join public.sl_jobs j on j.id=st.job_id
    where st.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id)),'[]'::jsonb),
  'jobTeam',coalesce((select jsonb_agg(jsonb_build_object('jobId',team.job_id,'employeeId',team.employee_id,
    'name',team.name,'team',team.team) order by team.name) from (
      select j.id job_id,e.id employee_id,e.name,e.team from public.sl_jobs j
       join public.sl_employees e on e.id=j.employee_id
       where j.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id)
      union all
      select j.id,e.id,e.name,e.team from public.sl_job_members jm
       join public.sl_jobs j on j.id=jm.job_id join public.sl_employees e on e.id=jm.employee_id
       where jm.company_id=me.company_id and (me.role='manager' or j.employee_id=me.id)
    ) team),'[]'::jsonb),
  'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,
    'body',n.body,'startsOn',n.starts_on,'endsOn',n.ends_on,
    'startsTime',case when n.starts_time is null then null else to_char(n.starts_time,'HH24:MI') end,
    'requiresAck',n.requires_ack,'acknowledged',a.notice_id is not null,'createdAt',n.created_at)
    order by n.starts_on desc) from public.sl_notices n
    left join public.sl_notice_acks a on a.notice_id=n.id and a.employee_id=me.id
    where n.company_id=me.company_id and (me.role='manager' or n.ends_on>=current_date-30)),'[]'::jsonb));
end $$;

alter function shiftline_private.command(text,jsonb) rename to command_v5;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; recipient public.sl_employees; job public.sl_jobs; step public.sl_job_steps;
 member_id uuid; notice_id uuid;
begin
 if p_action not in ('send_message','read_message','add_job_step','set_job_step_done',
  'add_job_member','remove_job_member','create_event') then
  return shiftline_private.command_v5(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Activate your account first'; end if;
 if p_action in ('send_message','add_job_step','add_job_member','remove_job_member','create_event')
  and me.role<>'manager' then raise exception 'Manager access required'; end if;
 if p_action='send_message' then
  select * into recipient from public.sl_employees
   where id=(p_data->>'recipientId')::uuid and company_id=me.company_id and role='employee';
  if recipient.id is null then raise exception 'Choose an employee in your company'; end if;
  insert into public.sl_messages(company_id,recipient_id,sender_id,title,body)
   values(me.company_id,recipient.id,me.id,trim(p_data->>'title'),trim(p_data->>'body'));
 elsif p_action='read_message' then
  update public.sl_messages set read_at=clock_timestamp()
   where id=(p_data->>'id')::uuid and recipient_id=me.id and company_id=me.company_id and read_at is null;
 elsif p_action='create_event' then
  insert into public.sl_notices(company_id,kind,title,body,starts_on,ends_on,starts_time,requires_ack,created_by)
   values(me.company_id,'event',trim(p_data->>'title'),coalesce(p_data->>'body',''),
    (p_data->>'startsOn')::date,(p_data->>'endsOn')::date,
    nullif(p_data->>'startsTime','')::time,false,me.id) returning id into notice_id;
 elsif p_action='add_job_step' then
  select * into job from public.sl_jobs where id=(p_data->>'jobId')::uuid and company_id=me.company_id;
  if job.id is null then raise exception 'Unknown job'; end if;
  insert into public.sl_job_steps(company_id,job_id,label,sort_order,created_by)
   values(me.company_id,job.id,trim(p_data->>'label'),
    coalesce((select max(sort_order)+1 from public.sl_job_steps where job_id=job.id),0),me.id);
 elsif p_action='set_job_step_done' then
  select st.* into step from public.sl_job_steps st join public.sl_jobs j on j.id=st.job_id
   where st.id=(p_data->>'stepId')::uuid and st.company_id=me.company_id
    and (me.role='manager' or j.employee_id=me.id) for update of st;
  if step.id is null then raise exception 'Unknown job step'; end if;
  update public.sl_job_steps set completed_at=case when (p_data->>'done')::boolean then clock_timestamp() else null end,
   completed_by=case when (p_data->>'done')::boolean then me.id else null end where id=step.id;
 elsif p_action in ('add_job_member','remove_job_member') then
  select * into job from public.sl_jobs where id=(p_data->>'jobId')::uuid and company_id=me.company_id;
  if job.id is null then raise exception 'Unknown job'; end if;
  member_id:=(p_data->>'employeeId')::uuid;
  if p_action='add_job_member' then
   if member_id=job.employee_id or not exists(select 1 from public.sl_employees
      where id=member_id and company_id=me.company_id and role='employee') then
    raise exception 'Choose another employee in your company'; end if;
   insert into public.sl_job_members(job_id,employee_id,company_id,added_by)
    values(job.id,member_id,me.company_id,me.id) on conflict do nothing;
  else
   delete from public.sl_job_members where job_id=job.id and employee_id=member_id
    and company_id=me.company_id;
  end if;
 end if;
 insert into public.sl_audit(company_id,actor,action,detail)
  values(me.company_id,me.id,p_action,
   case when p_action='send_message' then jsonb_build_object('recipientId',recipient.id)
        when p_action='create_event' then jsonb_build_object('noticeId',notice_id)
        else p_data end);
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
create or replace function public.sl_snapshot() returns jsonb language sql security invoker set search_path='' as $$
 select shiftline_private.snapshot(); $$;
create or replace function public.sl_command(p_action text,p_data jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select shiftline_private.command(p_action,p_data); $$;
revoke all on all functions in schema shiftline_private from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
