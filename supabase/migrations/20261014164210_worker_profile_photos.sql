alter table public.sl_employees add column photo_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('employee-photos','employee-photos',false,1048576,array['image/jpeg']);

create function shiftline_private.employee_photo_access(object_name text,write_access boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sl_employees e where e.user_id=auth.uid()
  and e.access_status='active' and split_part(object_name,'/',1)=e.company_id::text
  and object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.jpg$'
  and (not write_access or split_part(object_name,'/',2)=e.id::text))
$$;
revoke all on function shiftline_private.employee_photo_access(text,boolean) from public,anon,authenticated;
grant execute on function shiftline_private.employee_photo_access(text,boolean) to authenticated;
create policy employee_photo_read on storage.objects for select to authenticated
 using(bucket_id='employee-photos' and shiftline_private.employee_photo_access(name,false));
create policy employee_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='employee-photos' and shiftline_private.employee_photo_access(name,true));
create policy employee_photo_update on storage.objects for update to authenticated
 using(bucket_id='employee-photos' and shiftline_private.employee_photo_access(name,true))
 with check(bucket_id='employee-photos' and shiftline_private.employee_photo_access(name,true));

alter function shiftline_private.snapshot() rename to snapshot_before_employee_photos;
create function shiftline_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=shiftline_private.snapshot_before_employee_photos();
 if jsonb_typeof(result->'employees')='array' then
  result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(item||jsonb_build_object('photoPath',e.photo_path))
   from jsonb_array_elements(result->'employees') item join public.sl_employees e
    on e.id=(item->>'id')::uuid and e.company_id=(result#>>'{company,id}')::uuid),'[]'::jsonb));
 end if;
 return result;
end $$;
alter function shiftline_private.command(text,jsonb) rename to command_before_employee_photos;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; path text;
begin
 if p_action<>'save_profile_photo' then return shiftline_private.command_before_employee_photos(p_action,p_data); end if;
 select * into me from public.sl_employees where user_id=auth.uid() and access_status='active' for update;
 if me.id is null then raise exception 'Active workplace access required' using errcode='42501'; end if;
 path:=me.company_id::text||'/'||me.id::text||'/avatar.jpg';
 if p_data->>'path' is distinct from path or not exists(select 1 from storage.objects where bucket_id='employee-photos' and name=path) then
  raise exception 'Upload your own profile photo first';
 end if;
 update public.sl_employees set photo_path=path where id=me.id;
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('employeeId',me.id));
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.snapshot_before_employee_photos(),shiftline_private.command_before_employee_photos(text,jsonb),shiftline_private.snapshot(),shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.snapshot(),shiftline_private.command(text,jsonb) to authenticated;
