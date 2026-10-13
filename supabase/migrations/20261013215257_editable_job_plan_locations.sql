alter function shiftline_private.command(text,jsonb) rename to command_before_plan_location_edits;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; plan public.sl_calendar_jobs; lat double precision; lon double precision; radius integer; v_address text; requested jsonb; current_location jsonb;
begin
 if p_action<>'update_job_plan_location' then return shiftline_private.command_before_plan_location_edits(p_action,p_data); end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','address','latitude','longitude','radiusM','expected')) then raise exception 'Invalid location payload'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null then raise exception 'Join your workplace first'; end if;
 perform 1 from public.sl_companies where id=me.company_id for update;
 select * into me from public.sl_employees where id=me.id;
 if me.role<>'manager' or me.access_status<>'active' then raise exception 'Manager access required' using errcode='42501'; end if;
 select * into plan from public.sl_calendar_jobs where id=(p_data->>'id')::uuid and company_id=me.company_id for update;
 if plan.id is null then raise exception 'Unknown job plan'; end if;
 lat:=(p_data->>'latitude')::double precision; lon:=(p_data->>'longitude')::double precision; radius:=(p_data->>'radiusM')::integer; v_address:=trim(p_data->>'address');
 if lat is null or lon is null or radius is null or v_address is null or length(v_address) not between 1 and 200 or not(lat between -90 and 90) or not(lon between -180 and 180) or radius not between 100 and 5000 then raise exception 'Confirm the address and exact coordinates'; end if;
 current_location:=jsonb_build_object('address',plan.address,'latitude',plan.latitude,'longitude',plan.longitude,'radiusM',plan.radius_m);
 requested:=jsonb_build_object('address',v_address,'latitude',lat,'longitude',lon,'radiusM',radius);
 if current_location=requested then return jsonb_build_object('snapshot',shiftline_private.snapshot(),'duplicate',true); end if;
 if current_location is distinct from p_data->'expected' then raise exception 'Job location changed; refresh before saving'; end if;
 if exists(select 1 from public.sl_jobs where calendar_job_id=plan.id) then raise exception 'Job already started; its destination must remain part of the attendance record'; end if;
 update public.sl_calendar_jobs set address=v_address,latitude=lat,longitude=lon,radius_m=radius where id=plan.id;
 insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,'job_plan_location_updated',jsonb_build_object('jobId',plan.id,'previous',current_location,'replacement',requested));
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send('{}'::jsonb,'refresh','shiftline:'||me.company_id::text,true); exception when others then raise log 'Shiftline live update unavailable: %',sqlstate; end;
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.command(text,jsonb),shiftline_private.command_before_plan_location_edits(text,jsonb) from public,anon,authenticated;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
