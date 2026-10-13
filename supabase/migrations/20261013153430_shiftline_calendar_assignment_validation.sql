-- Qualify the candidate ID: the old bare `id` resolved to e.id inside the subquery.
do $$
declare definition text; old_check text; new_check text;
begin
 definition:=pg_get_functiondef('shiftline_private.command_before_leave_notifications(text,jsonb)'::regprocedure);
 old_check:='from unnest(ids) id where not exists(select 1 from public.sl_employees e where e.id=id';
 new_check:='from unnest(ids) as assigned(employee_id) where not exists(select 1 from public.sl_employees e where e.id=assigned.employee_id';
 if position(old_check in definition)=0 then raise exception 'Expected calendar assignment check was not found'; end if;
 execute replace(definition,old_check,new_check);
end $$;
