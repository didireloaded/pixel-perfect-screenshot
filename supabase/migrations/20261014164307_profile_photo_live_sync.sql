-- Notify the existing company channel after the employee photo record is saved.
create or replace function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true);
  exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.command(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
