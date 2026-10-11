-- Board changes alter job planning only, never create attendance events.
alter function shiftline_private.command(text,jsonb) rename to command_before_task_board;
create function shiftline_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.sl_employees; job public.sl_jobs; target text;
begin
 if p_action <> 'set_job_status' then
  return shiftline_private.command_before_task_board(p_action,p_data);
 end if;
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into me from public.sl_employees where user_id=auth.uid();
 if me.id is null or me.role <> 'manager' then raise exception 'Manager access required'; end if;
 target := p_data->>'status';
 if target is null or target not in ('assigned','in_progress','completed') then raise exception 'Invalid task status'; end if;
 select * into job from public.sl_jobs where id=(p_data->>'jobId')::uuid and company_id=me.company_id for update;
 if job.id is null then raise exception 'Unknown job'; end if;
 if p_data ? 'expectedStatus' and job.status is distinct from p_data->>'expectedStatus' then raise exception 'Task changed. Refresh the board and try again'; end if;
 if job.status <> target then
  update public.sl_jobs set status=target where id=job.id;
  insert into public.sl_audit(company_id,actor,action,detail) values(me.company_id,me.id,p_action,jsonb_build_object('jobId',job.id,'before',job.status,'after',target));
 end if;
 return jsonb_build_object('snapshot',shiftline_private.snapshot());
end $$;
revoke all on function shiftline_private.command_before_task_board(text,jsonb) from public,anon,authenticated;
revoke all on function shiftline_private.command(text,jsonb) from public,anon;
grant execute on function shiftline_private.command(text,jsonb) to authenticated;
