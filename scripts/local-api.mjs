// Development-only embedded PostgreSQL. Production uses Supabase Auth + these same RPCs.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function createLocalDatabase(directory) {
  if (directory) await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new PGlite(directory);
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema if not exists local_private;
    create table if not exists local_private.migrations(name text primary key);
    create table if not exists local_private.accounts(user_id uuid primary key references auth.users,email text unique not null,password_hash text not null,salt text not null);
    create table if not exists local_private.sessions(token_hash text primary key,user_id uuid not null references auth.users,expires_at timestamptz not null);
  `);
  const directoryPath = path.join(root, "supabase/migrations");
  for (const name of (await readdir(directoryPath)).filter((n) => n.endsWith(".sql")).sort()) {
    const applied = await db.query("select 1 from local_private.migrations where name=$1", [name]);
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
    return response.rows[0].result;
  });
}
export async function createLocalHandler() {
  const db = await createLocalDatabase(path.join(root, ".shiftline-local"));
  const attempts = new Map();
  const cookie = (token) =>
    `shiftline_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}`;
  const send = (res, status, value) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(value));
  };
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const handler = async (req, res, next) => {
    if (!req.url?.startsWith("/api/local/")) return next();
    try {
      const route = req.url.split("?")[0].slice("/api/local/".length);
      if (!["GET", "POST"].includes(req.method)) throw fail("Method not allowed", 405);
      let body = {};
      if (req.method === "POST") {
        if (
          req.headers.origin !== `http://${req.headers.host}` &&
          req.headers.origin !== `https://${req.headers.host}`
        )
          throw fail("Invalid request origin", 403);
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw fail("JSON required", 415);
        const parts = [];
        let size = 0;
        for await (const part of req) {
          size += part.length;
          if (size > 16384) throw fail("Request too large", 413);
          parts.push(part);
        }
        try {
          body = JSON.parse(Buffer.concat(parts).toString());
        } catch {
          throw fail("Invalid JSON");
        }
      }
      const token = req.headers.cookie?.match(/(?:^|;\s*)shiftline_session=([a-f0-9]{64})/)?.[1];
      const session = token
        ? (
            await db.query(
              "select user_id from local_private.sessions where token_hash=$1 and expires_at>now()",
              [hash(token)],
            )
          ).rows[0]
        : undefined;
      if (route === "session" && req.method === "GET")
        return send(res, 200, { authenticated: !!session });
      if (["signup", "login"].includes(route) && req.method === "POST") {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        const recent = (attempts.get(key) || []).filter((t) => t > now - 900000);
        if (recent.length >= 20) throw fail("Too many attempts. Try again in 15 minutes.", 429);
        attempts.set(key, [...recent, now]);
        const { email, password } = body;
        if (
          typeof email !== "string" ||
          email.length > 254 ||
          !/^\S+@\S+\.\S+$/.test(email) ||
          typeof password !== "string" ||
          password.length < 12 ||
          password.length > 128
        )
          throw fail("Use a valid email and a password of 12–128 characters.");
        const normalized = email.trim().toLowerCase();
        let account;
        if (route === "signup") {
          const salt = randomBytes(16).toString("hex");
          const passwordHash = scryptSync(password, salt, 64).toString("hex");
          const userId = randomUUID();
          await db.transaction(async (tx) => {
            await tx.query("insert into auth.users values($1)", [userId]);
            await tx.query("insert into local_private.accounts values($1,$2,$3,$4)", [
              userId,
              normalized,
              passwordHash,
              salt,
            ]);
          });
          account = { user_id: userId };
        } else {
          account = (
            await db.query("select * from local_private.accounts where email=$1", [normalized])
          ).rows[0];
          const actual = scryptSync(password, account?.salt || "missing-account-salt", 64);
          if (!account || !timingSafeEqual(actual, Buffer.from(account.password_hash, "hex")))
            throw fail("Email or password is incorrect.", 401);
        }
        const newToken = randomBytes(32).toString("hex");
        await db.query("insert into local_private.sessions values($1,$2,now()+interval '7 days')", [
          hash(newToken),
          account.user_id,
        ]);
        res.setHeader("Set-Cookie", cookie(newToken));
        return send(res, 200, { authenticated: true });
      }
      if (!session) throw fail("Sign in first", 401);
      if (route === "logout" && req.method === "POST") {
        await db.query("delete from local_private.sessions where token_hash=$1", [hash(token)]);
        res.setHeader("Set-Cookie", cookie(""));
        return send(res, 200, { ok: true });
      }
      if (route === "snapshot" && req.method === "GET")
        return send(res, 200, await runRpc(db, session.user_id, null));
      if (route === "command" && req.method === "POST") {
        if (
          typeof body.action !== "string" ||
          !body.data ||
          typeof body.data !== "object" ||
          Array.isArray(body.data)
        )
          throw fail("Invalid command");
        return send(res, 200, await runRpc(db, session.user_id, body.action, body.data));
      }
      throw fail("Not found", 404);
    } catch (error) {
      const message =
        error.status || error.code === "P0001"
          ? error.message
          : error.code === "23505"
            ? "That account, employee number or shift already exists."
            : "The request could not be saved. Check the values and try again.";
      if (
        !error.status &&
        !["P0001", "23505", "23514", "23502", "22P02", "22007"].includes(error.code)
      )
        console.error("Local API error", error.message);
      send(res, error.status || 400, { error: message });
    }
  };
  handler.close = () => db.close();
  return handler;
}
