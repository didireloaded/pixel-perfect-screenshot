// Isolated SQL test harness. Never imported by the application or development servers.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function createLocalDatabase(directory) {
  if (directory) await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new PGlite(directory);
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users(id uuid primary key);
    alter table auth.users add column if not exists email text;
    alter table auth.users add column if not exists email_confirmed_at timestamptz;
    alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}';
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema if not exists local_private;
    create table if not exists local_private.migrations(name text primary key);
    -- Minimal Storage schema for report policy tests. No fake application data.
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert on storage.objects to authenticated;
  `);
  const directoryPath = path.join(root, "supabase/migrations");
  for (const name of (await readdir(directoryPath)).filter((n) => n.endsWith(".sql")).sort()) {
    // Hosted migration timestamps can change when pending source migrations are deployed.
    // The descriptive identity stays the same; do not rerun already-applied SQL after that rename.
    const applied = await db.query(
      "select 1 from local_private.migrations where regexp_replace(name,'^[0-9]+_','')=$1",
      [name.replace(/^\d+_/, "")],
    );
    if (!applied.rows.length)
      await db.transaction(async (tx) => {
        await tx.exec(await readFile(path.join(directoryPath, name), "utf8"));
        await tx.query("insert into local_private.migrations values($1)", [name]);
      });
  }
  return db;
}
export async function runRpc(db, userId, action, data = {}) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await tx.exec("set local role authenticated");
    const response =
      action === null
        ? await tx.query("select public.sl_snapshot() as result")
        : await tx.query("select public.sl_command($1,$2::jsonb) as result", [
            action,
            JSON.stringify(data),
          ]);
    const result = response.rows[0].result;
    if (action === "setup" && result.snapshot?.company?.id) {
      // Historical integration fixtures may clock in at any test-run hour.
      // Cutoff tests explicitly set the policy they verify.
      await tx.exec("reset role");
      await tx.query("update public.sl_companies set checkin_close_time='23:59' where id=$1", [result.snapshot.company.id]);
    }
    return result;
  });
}
