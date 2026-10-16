-- Interpretation is separate from immutable evidence, attendance and pay.
create table public.sl_report_interpretations (
 incident_id uuid primary key, company_id uuid not null,
 status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 available_at timestamptz not null default now(), lease uuid,
 suggestion jsonb, model text, completed_at timestamptz,
 foreign key(incident_id,company_id) references public.sl_incidents(id,company_id),
 check((status='ready')=(suggestion is not null))
);
create index sl_report_interpretations_queue on public.sl_report_interpretations(available_at) where status in ('pending','processing');
alter table public.sl_report_interpretations enable row level security;
revoke all on public.sl_report_interpretations from public,anon,authenticated;

create function shiftline_private.enqueue_report_interpretation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.sl_report_interpretations(incident_id,company_id) values(new.id,new.company_id);
 return new;
end $$;
revoke all on function shiftline_private.enqueue_report_interpretation() from public,anon,authenticated;
create trigger sl_incident_interpretation after insert on public.sl_incidents
for each row execute function shiftline_private.enqueue_report_interpretation();
-- No historical reports are sent to a provider by this migration.

create function public.sl_report_interpretation(p_incident uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; result jsonb;
begin
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null or me.access_status<>'active' or me.access_role not in ('owner','operations') then
  raise exception 'Operational manager access required' using errcode='42501';
 end if;
 if not exists(select 1 from public.sl_incidents where id=p_incident and company_id=me.company_id) then
  raise exception 'Unknown report' using errcode='42501';
 end if;
 select jsonb_build_object('status',status,'suggestion',suggestion,'completedAt',completed_at)
 into result from public.sl_report_interpretations where incident_id=p_incident and company_id=me.company_id;
 return coalesce(result,jsonb_build_object('status','not_processed'));
end $$;
revoke all on function public.sl_report_interpretation(uuid) from public,anon;
grant execute on function public.sl_report_interpretation(uuid) to authenticated;

create function public.sl_report_ai_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 update public.sl_report_interpretations set status='failed',lease=null
 where status='processing' and available_at<=now() and attempts>=3;
 with candidates as (
  select incident_id from public.sl_report_interpretations
  where status in ('pending','processing') and available_at<=now() and attempts<3
  order by available_at for update skip locked limit 3
 ), claimed as (
  update public.sl_report_interpretations q set status='processing',attempts=attempts+1,
   lease=gen_random_uuid(),available_at=now()+interval '5 minutes'
  from candidates c where q.incident_id=c.incident_id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.incident_id,'lease',q.lease,
  'report',jsonb_build_object('title',i.title,'description',i.description,'kind',i.kind,
   'startsAt',i.starts_at,'endsAt',i.ends_at))),'[]') into output
 from claimed q join public.sl_incidents i on i.id=q.incident_id and i.company_id=q.company_id;
 return output;
end $$;
revoke all on function public.sl_report_ai_batch() from public,anon,authenticated;
grant execute on function public.sl_report_ai_batch() to service_role;

create function public.sl_report_ai_result(p_incident uuid,p_lease uuid,p_suggestion jsonb,p_model text) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if p_suggestion is not null and (
  jsonb_typeof(p_suggestion)<>'object' or jsonb_typeof(p_suggestion->'summary') is distinct from 'string'
  or length(p_suggestion->>'summary') not between 1 and 2000
  or jsonb_typeof(p_suggestion->'questions') is distinct from 'array'
  or jsonb_array_length(p_suggestion->'questions')>8
  or length(p_suggestion::text)>6000
 ) then raise exception 'Invalid interpretation'; end if;
 update public.sl_report_interpretations set
  status=case when p_suggestion is not null then 'ready' when attempts>=3 then 'failed' else 'pending' end,
  suggestion=p_suggestion,model=case when p_suggestion is not null then p_model end,
  completed_at=case when p_suggestion is not null then now() end,
  available_at=now()+interval '5 minutes',lease=null
 where incident_id=p_incident and lease=p_lease and status='processing' and available_at>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.sl_report_ai_result(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.sl_report_ai_result(uuid,uuid,jsonb,text) to service_role;

-- Dedicated dispatcher credential; the provider key stays in Edge Function secrets.
create function public.sl_report_ai_dispatch_key() returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 select decrypted_secret into result from vault.decrypted_secrets where name='shiftline_report_ai_dispatch' limit 1;
 return result;
end $$;
revoke all on function public.sl_report_ai_dispatch_key() from public,anon,authenticated;
grant execute on function public.sl_report_ai_dispatch_key() to service_role;
do $$ begin
 if exists(select 1 from pg_namespace where nspname='vault') and exists(select 1 from pg_namespace where nspname='cron') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'shiftline_report_ai_dispatch');
  perform cron.schedule('shiftline-report-interpretation','* * * * *',$job$
   select net.http_post(url:='https://hfhiuxijpbujoahtnkjt.supabase.co/functions/v1/report-interpretation',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
     (select decrypted_secret from vault.decrypted_secrets where name='shiftline_report_ai_dispatch' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=120000);
  $job$);
 end if;
end $$;
