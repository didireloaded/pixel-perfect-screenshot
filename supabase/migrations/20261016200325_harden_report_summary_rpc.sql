-- Preserve role/company validation in the private implementation and expose only
-- an invoker wrapper, matching sl_snapshot/sl_command/notification boundaries.
alter function public.sl_report_interpretation(uuid) set schema shiftline_private;
create function public.sl_report_interpretation(p_incident uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select shiftline_private.sl_report_interpretation(p_incident)
$$;
revoke all on function public.sl_report_interpretation(uuid),shiftline_private.sl_report_interpretation(uuid) from public,anon,authenticated;
grant execute on function public.sl_report_interpretation(uuid),shiftline_private.sl_report_interpretation(uuid) to authenticated;
