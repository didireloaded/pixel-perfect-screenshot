# Shiftline implementation

The employee UI preserves the Lovable design tokens, card layout and bottom navigation. Today, Jobs, My hours and Requests now use server-validated records. The manager dashboard handles employees, sites, shifts, job briefs, requests, approvals and current work locations. Audit evidence and gross-pay exports stay in the backend.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Both development servers and production builds use the configured Supabase backend and real accounts. There is no local authentication bypass or automatic sample-data fallback. The isolated PGlite SQL harness is used only by automated tests. Production builds require both connection values and reject secret/service-role credentials.

1. Managers create an account with an email and a password of at least 12 characters. Worker signup collects only full name and an international phone number.
2. Select **I am setting up a company**, then enter the company, manager name, site and timezone.
3. Open **Manage employees, shifts and approvals**.
4. Ask workers to register from the worker app. The system issues each person an employee number and private eight-character login code. They must save both before continuing.
5. Assign the employee a shift in Schedule, and optionally a job inside that shift.
6. Review new registrations in Team. Their name and phone are contact details, not proof of identity: confirm who they are before approving workplace access. Pending/rejected accounts cannot read company records, receive company live updates or record attendance. Once approved, the waiting screen opens the app automatically. Replace lost login codes in Team and share them privately; existing sessions remain signed in.
7. The employee clocks in, starts/ends lunch or an assigned job, then clocks out. Times are recorded by the database server. Web actions require a connection. The Expo client saves attendance intents to SQLite before showing “Saved on this phone”; server confirmation is shown separately.
8. The employee submits the completed timesheet from My hours, requesting any recorded overtime.
9. The manager approves the timesheet and the amount of overtime. A manager cannot approve their own timesheet.
10. The manager locks the completed payroll date range, sets effective hourly rates, creates a frozen gross-pay run, then downloads its CSV. Every assigned shift in the period must be complete and approved.

The manager can publish holiday, closure, early-release and general notices, review site exit/return alerts, and issue a private code for a supervised kiosk. Employees can acknowledge notices and opt into foreground worksite monitoring. The kiosk requires a signed-in manager, employee number and code; it is not an unattended terminal.

The employee web app also has a calendar for assigned shifts, jobs and company notices; an inbox for direct manager messages, news and events; and job steps with progress calculated from completed steps. Managers initiate conversations in **Messages** and workers can reply. Managers also publish events and add job steps and team members. Job team members are visible for coordination; the job's primary assignee is the person authorized to record its attendance actions. Messages are in-app records, without email, SMS or push delivery.

Shifts in this release start and end on the same company-local date. Jobs remain paid work; lunch and personal departures are unpaid. New timesheet calculations sum integer seconds from effective attendance intervals, with a per-shift regular-time cap. Previously locked attendance exports retain their original format. Gross-pay runs freeze approved hours, hourly rates, overtime multipliers and gross amounts in minor currency units. No tax, deductions or actual payment processing is included. Locked periods cannot be reopened through the application. Notices do not automatically cancel shifts or calculate holiday pay.

## Connect Supabase / Lovable Cloud

GitHub sync transfers source code. It does not apply migrations or connect authentication by itself.

The dedicated Shiftline project is `hfhiuxijpbujoahtnkjt`. Its first seven migrations were applied on 9 October 2026; four further migrations for chat, the manager workspace, task status and backend integrity were applied on 11 October 2026. The SQL filenames in this repository now match the migration versions recorded by Supabase, so subsequent CLI migrations can continue from that history. The project starts with no company or employee records; the first manager must sign up and complete company setup in the app. Local web and native clients read their ignored `.env.local` files. The obsolete `mobile-ui/` mock prototype has been removed. The live-sync migration was applied on 12 October 2026; twelve migrations now match the hosted history.

1. Enable a dedicated database for this Lovable project, or connect its dedicated Supabase project. Do not reuse an unrelated project's database.
2. Apply every SQL file in `supabase/migrations/` in filename order using the Supabase SQL editor or CLI migration workflow for that project. Apply each migration once. They create only `sl_*` tables and the `shiftline_private` schema; they do not alter existing application tables.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's build environment. A legacy public anon JWT can also be supplied in `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put service-role credentials in browser environment variables.
4. Enable email/password sign-in, keep anonymous sign-in disabled, configure the manager site URL and allowed redirects, and use an Auth minimum password length no greater than 8 for the generated worker codes (the manager signup UI requires 12). Keep manager email confirmation enabled and configure its email delivery. Workers do not need mail or SMS delivery.
5. Rebuild/restart the app. Create and confirm the manager's account, then complete company setup. Employees confirm their own account before entering workplace access codes.

If Lovable reports missing `projects:write`, remove and add its connector with current permissions. The implementation can still be synced from GitHub; provisioning cannot be performed with a read-only connector. A production build without connection values fails with a configuration error. An unconfigured development app displays **Connect Shiftline**. No local account service is loaded.

RPCs are `sl_snapshot()` and `sl_command(p_action, p_data)`. Every command checks `auth.uid()` and current database membership. Company writes are serialized in transactions; attendance IDs deduplicate retries; employee activation is locked and consumed atomically. Default-deny RLS and revoked table privileges prevent direct client mutations or broad reads. Scoped RPCs expose only the current employee's data or their company's manager data. Activation secrets are excluded from snapshots and audit records.

## Checks

```sh
npx tsc --noEmit
npm test
npm run test:database
npm run build
```

Database integration tests execute the actual migration in PostgreSQL, with Supabase-style roles and `auth.uid()`. They check transition rules, duplicates, company isolation, denied direct table access, activation expiry and reuse, integer totals, review permissions, and locked exports. Hosted Supabase Auth, email delivery and cloud deployment still need verification after connection.

## Native client and approval workflow

See `mobile/README.md` for Expo setup. The native client implements all eight attendance actions, an owner-scoped durable SQLite queue, lease recovery, bounded retries and cached shift data. Pending, synced and review states remain distinct. A conflicting oldest submission blocks later intents until reviewed; rejected submissions remain preserved for manual reconciliation rather than being silently removed.

Company policies are versioned and pinned to assigned shifts. Sites support validate, notify and auto-suggest verification modes. Corrections preserve original events and create separate immutable adjustments after configured manager/payroll approval stages. The default requires a different payroll administrator at level two. Approved calculations and locked CSV exports remain immutable.

The manager Policies tab includes setup progress, sites, policy history, payroll role grants and device revocation. Corrections shows capture and receipt times and location evidence. Neither request decisions nor geofence alerts silently alter pay.

## Deployment and rollback

Apply all migrations in filename order before deploying the new app. Back up the dedicated database first. For an application rollback, redeploy the previous application commit while retaining the additive tables and immutable records. Do not drop attendance, adjustment, calculation or export tables. Test migrations and restoration in staging before production payroll.

## Verification limits

Web and native TypeScript, unit tests, actual PostgreSQL integration tests and native Metro bundling are checked locally. These do not prove physical-device SQLite recovery, operating-system background scheduling, GPS behavior, hosted Supabase Auth or email delivery. Verify these on iOS and Android development builds after cloud connection.

With employee consent, web clients share current positions at the workplace or assigned job while visible and on duty. Lunch, personal time, offline/hidden tabs and shift end pause sharing. Managers receive only fresh current points; no route history is stored. The hosted minute-by-minute cleanup physically expires stale/off-duty positions. Exit/return alerts separately retain distance and accuracy. The older Expo client has not yet received all the new web job/location screens. Operating-system background geofence detection with the app closed, unattended kiosk/QR scanning and APNs/FCM manager push are not implemented. Auto-suggest currently produces server warnings, not automatic arrival prompts. Notices communicate holidays and closures; an automatic jurisdiction holiday/pay engine is not included.

The Expo dependency tree currently reports transitive build-tool advisories in Metro/Expo dependencies. A forced downgrade is not a safe remedy; review compatible upstream fixes before distribution.

## Deploying worker registration

Deploy `supabase/functions/worker-access/index.ts` and its dependencies after applying the worker-access migration. It is public for registration (`verify_jwt=false`); code replacement verifies the manager JWT and same-company authorization inside the function. Supabase provides `SUPABASE_SERVICE_ROLE_KEY` only to the function runtime. Never put it in either frontend environment file.

Public registration resolves exactly one configured company, failing closed for zero or multiple companies. This deployment currently has one real workplace. Multi-company public registration needs an explicit workplace invitation/link before enabling it. Signup is bounded to 5 attempts per IP/hour, 2 per phone/day and 50 globally/hour; native Supabase Auth handles login rate limits. Phone numbers are normalized, required and unverified. Credentials are generated cryptographically, stored only as Auth password hashes, and never put in snapshots or audits. Employee-number sequence gaps are normal after failed/rolled-back provisioning.

Run server tests with `npx --yes deno@2.5.6 test --allow-env --allow-net supabase/functions/worker-access/handler.test.ts`. SQL verification is included in `npm run test:database`. The hosted `supabase/tests/worker_access_smoke.sql` checks registration, approval and access isolation inside a rolled-back transaction.

For the manager map, configure `VITE_MAPBOX_ACCESS_TOKEN` with a public `pk.` token in the root `.env.local` and deployed build environment. Keep the same Supabase project in both clients. Worksite settings are under the manager account menu; job location/lunch/overtime details are in Tasks and Project management. See [docs/backend.md](docs/backend.md) for the current schema and position-expiry rules.
