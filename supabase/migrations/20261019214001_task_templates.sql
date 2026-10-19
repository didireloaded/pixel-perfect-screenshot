-- Templates are explicit planning aids, never workday/attendance generators.
create table public.sl_task_templates (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies(id),
 title text not null check(length(trim(title)) between 1 and 100),
 instructions text not null default '' check(length(instructions)<=1000),
 checklist text[] not null default '{}',created_by uuid not null references public.sl_employees(id),
 created_at timestamptz not null default clock_timestamp(),archived_at timestamptz,
 check(cardinality(checklist)<=30)
);
create index sl_task_templates_company on public.sl_task_templates(company_id,created_at desc);
create index sl_task_templates_creator on public.sl_task_templates(created_by);
create table public.sl_task_template_applications (
 template_id uuid not null references public.sl_task_templates(id),job_id uuid not null references public.sl_jobs(id),
 company_id uuid not null references public.sl_companies(id),applied_by uuid not null references public.sl_employees(id),
 applied_at timestamptz not null default clock_timestamp(),primary key(template_id,job_id)
);
create index sl_task_template_applications_job on public.sl_task_template_applications(job_id);
create index sl_task_template_applications_company on public.sl_task_template_applications(company_id);
create index sl_task_template_applications_actor on public.sl_task_template_applications(applied_by);
alter table public.sl_task_templates enable row level security;
alter table public.sl_task_template_applications enable row level security;
revoke all on public.sl_task_templates,public.sl_task_template_applications from public,anon,authenticated;
create function shiftline_private.task_templates_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees;t public.sl_task_templates;j public.sl_jobs;items text[];v_label text;position integer;
begin
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null or me.access_role not in ('owner','operations') then raise exception 'Operations access required' using errcode='42501';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>16384 then raise exception 'Invalid template payload';end if;
 if action='save' then
  if jsonb_typeof(payload->'checklist') is distinct from 'array' or jsonb_array_length(payload->'checklist')>30 then raise exception 'Choose up to 30 checklist items';end if;
  if exists(select 1 from jsonb_array_elements(payload->'checklist') v where jsonb_typeof(v)<>'string') then raise exception 'Checklist items must be text';end if;
  select coalesce(array_agg(trim(value) order by ord),'{}') into items from jsonb_array_elements_text(payload->'checklist') with ordinality as a(value,ord);
  if exists(select 1 from unnest(items) v where length(v) not between 1 and 160) then raise exception 'Checklist items must contain 1–160 characters';end if;
  insert into public.sl_task_templates(company_id,title,instructions,checklist,created_by) values(me.company_id,trim(payload->>'title'),trim(coalesce(payload->>'instructions','')),items,me.id) returning * into t;
 elsif action in ('archive','apply') then
  select * into t from public.sl_task_templates where id=(payload->>'templateId')::uuid and company_id=me.company_id for update;
  if t.id is null then raise exception 'Template unavailable' using errcode='42501';end if;
  if action='archive' then update public.sl_task_templates set archived_at=coalesce(archived_at,clock_timestamp()) where id=t.id;
  else
   if t.archived_at is not null then raise exception 'Template is archived';end if;
   select * into j from public.sl_jobs where id=(payload->>'jobId')::uuid and company_id=me.company_id for update;
   if j.id is null then raise exception 'Task unavailable' using errcode='42501';end if;
   if j.status='completed' then raise exception 'Completed tasks cannot receive new checklist items';end if;
   insert into public.sl_task_template_applications(template_id,job_id,company_id,applied_by) values(t.id,j.id,me.company_id,me.id) on conflict do nothing;
   if found then
    select coalesce(max(sort_order)+1,0) into position from public.sl_job_steps where job_id=j.id;
    foreach v_label in array t.checklist loop
     if not exists(select 1 from public.sl_job_steps where job_id=j.id and label=v_label) then
      insert into public.sl_job_steps(company_id,job_id,label,sort_order,created_by) values(me.company_id,j.id,v_label,position,me.id);position:=position+1;
     end if;
    end loop;
    insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'task_template_applied',jsonb_build_object('templateId',t.id,'jobId',j.id));
   end if;
  end if;
 elsif action<>'list' then raise exception 'Unknown template action';end if;
 return jsonb_build_object('templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'instructions',instructions,'checklist',checklist,'createdAt',created_at) order by created_at desc) from public.sl_task_templates where company_id=me.company_id and archived_at is null),'[]'::jsonb));
end $$;
create function public.sl_task_templates(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select shiftline_private.task_templates_api(action,payload)$$;
revoke all on function public.sl_task_templates(text,jsonb),shiftline_private.task_templates_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sl_task_templates(text,jsonb),shiftline_private.task_templates_api(text,jsonb) to authenticated;
