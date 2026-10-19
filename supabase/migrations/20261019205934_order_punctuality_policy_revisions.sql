-- A monotonic revision selects the last saved rule even if timestamps coincide.
alter table public.sl_punctuality_policies add column revision bigint generated always as identity;
create unique index sl_punctuality_policy_revision on public.sl_punctuality_policies(revision);
do $$
declare signature regprocedure; definition text;
begin
 foreach signature in array array['shiftline_private.refresh_punctuality(uuid,date,timestamptz)'::regprocedure,
  'shiftline_private.punctuality_api(text,jsonb)'::regprocedure] loop
  select pg_get_functiondef(signature) into definition;
  if position('starts_on desc,created_at desc,id desc' in definition)=0 then raise exception 'Punctuality policy lookup changed'; end if;
  execute replace(definition,'starts_on desc,created_at desc,id desc','starts_on desc,revision desc');
 end loop;
end $$;
