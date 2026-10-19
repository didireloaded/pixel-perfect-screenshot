-- Plain-text company knowledge. Acknowledgement records receipt of an exact version, not a legal signature.
create table public.sl_knowledge_versions(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.sl_companies,
 article_id uuid not null,version integer not null check(version>0),
 category text not null check(category in ('article','policy')),title text not null check(length(trim(title)) between 1 and 200),
 body text not null check(length(trim(body)) between 1 and 20000),published boolean not null default false,
 created_by uuid not null,created_at timestamptz not null default now(),
 foreign key(created_by,company_id) references public.sl_employees(id,company_id),unique(article_id,version),unique(id,company_id)
);
create index sl_knowledge_company on public.sl_knowledge_versions(company_id,article_id,version desc);
create table public.sl_knowledge_acknowledgements(
 version_id uuid not null,company_id uuid not null,employee_id uuid not null,acknowledged_at timestamptz not null default now(),
 primary key(version_id,employee_id),foreign key(version_id,company_id) references public.sl_knowledge_versions(id,company_id),
 foreign key(employee_id,company_id) references public.sl_employees(id,company_id)
);
alter table public.sl_knowledge_versions enable row level security;
alter table public.sl_knowledge_acknowledgements enable row level security;
revoke all on public.sl_knowledge_versions,public.sl_knowledge_acknowledgements from public,anon,authenticated;
create trigger sl_knowledge_versions_immutable before update or delete on public.sl_knowledge_versions for each row execute function shiftline_private.immutable();
create trigger sl_knowledge_ack_immutable before update or delete on public.sl_knowledge_acknowledgements for each row execute function shiftline_private.immutable();
create function shiftline_private.knowledge(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.sl_employees; entry public.sl_knowledge_versions; article uuid; next_version integer; entry_id uuid; records jsonb; receipts jsonb; roster jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active';
 if me.id is null then raise exception 'Active company access required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>90000 then raise exception 'Invalid knowledge request'; end if;
 if p_action='create' then
  if me.access_role not in ('owner','hr') then raise exception 'Owner or HR access required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','articleId','title','body','category','published')) then raise exception 'Invalid article fields'; end if;
  perform 1 from public.sl_companies where id=me.company_id for update;
  entry_id:=coalesce((p_data->>'id')::uuid,gen_random_uuid());article:=(p_data->>'articleId')::uuid;
  if article is null then article:=entry_id;next_version:=1;
  else
   select * into entry from public.sl_knowledge_versions where company_id=me.company_id and article_id=article order by version desc limit 1;
   if entry.id is null then raise exception 'Choose a company article'; end if;
   if entry.category is distinct from p_data->>'category' then raise exception 'Keep the original article category'; end if;
   next_version:=entry.version+1;
  end if;
  if coalesce(length(trim(p_data->>'title')),0) not between 1 and 200 or coalesce(length(trim(p_data->>'body')),0) not between 1 and 20000 or coalesce(p_data->>'category','') not in ('article','policy') or jsonb_typeof(p_data->'published') is distinct from 'boolean' then raise exception 'Provide title, plain text, category and publication choice'; end if;
  insert into public.sl_knowledge_versions(id,company_id,article_id,version,category,title,body,published,created_by)
   values(entry_id,me.company_id,article,next_version,p_data->>'category',trim(p_data->>'title'),trim(p_data->>'body'),(p_data->>'published')::boolean,me.id);
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'knowledge_version_created',jsonb_build_object('id',entry_id,'articleId',article,'version',next_version,'published',p_data->'published'));
 elsif p_action='acknowledge' then
  select * into entry from public.sl_knowledge_versions where id=(p_data->>'versionId')::uuid and company_id=me.company_id and published and category='policy';
  if entry.id is null then raise exception 'Choose a published company policy'; end if;
  insert into public.sl_knowledge_acknowledgements(version_id,company_id,employee_id) values(entry.id,me.company_id,me.id) on conflict do nothing;
 elsif p_action<>'list' then raise exception 'Unknown knowledge action'; end if;
 if p_action<>'list' and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);exception when others then raise log 'Knowledge refresh unavailable: %',sqlstate;end;
 end if;
 select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc,v.version desc),'[]'::jsonb) into records from public.sl_knowledge_versions v where v.company_id=me.company_id and (v.published or me.access_role in ('owner','hr'));
 select coalesce(jsonb_agg(jsonb_build_object('versionId',a.version_id,'employeeId',a.employee_id,'employeeName',e.name,'acknowledgedAt',a.acknowledged_at)),'[]'::jsonb) into receipts
  from public.sl_knowledge_acknowledgements a join public.sl_employees e on e.id=a.employee_id and e.company_id=a.company_id
  where a.company_id=me.company_id and (a.employee_id=me.id or me.access_role in ('owner','hr'));
 if me.access_role in ('owner','hr') then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]'::jsonb) into roster from public.sl_employees where company_id=me.company_id and access_status='active';
 end if;
 return jsonb_build_object('entries',records,'acknowledgements',receipts,'employees',coalesce(roster,'[]'::jsonb),'me',me.id);
end $$;
revoke all on function shiftline_private.knowledge(text,jsonb) from public,anon;
grant execute on function shiftline_private.knowledge(text,jsonb) to authenticated;
create function public.sl_knowledge(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select shiftline_private.knowledge(p_action,p_data)$$;
revoke all on function public.sl_knowledge(text,jsonb) from public,anon;
grant execute on function public.sl_knowledge(text,jsonb) to authenticated;
