-- ShrekBook currently uses its authenticated Express API and service-role
-- Supabase client. Match the chosen database configuration: no RLS policies
-- and RLS disabled for application tables in the exposed public schema.
-- Supabase-managed storage tables are intentionally not altered here.
do $$
declare
  p record;
  t record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
      p.policyname, p.schemaname, p.tablename);
  end loop;

  for t in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname = 'public'
      and c.relrowsecurity
  loop
    execute format('alter table public.%I disable row level security', t.table_name);
  end loop;
end
$$;
