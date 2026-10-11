# Shiftline

Shiftline is an employee attendance and job app with a manager workspace. Employees record clock-in, lunch, job departures, personal departures and clock-out; review shifts, tasks, messages, company news, events and approved hours; and submit requests and timesheets. Managers assign shifts and jobs, review requests and corrections, publish notices, discuss jobs with workers, manage job steps and teams, review attendance, and see recent worksite presence.

The employee web app is designed for a phone-sized viewport. The new iOS-style worker web UI lives in [`worker-ui/`](worker-ui/README.md) and uses the same Supabase database as the manager workspace. The manager dashboard follows the Project Inc. reference with a white sidebar, purple task controls, a four-stage board, and bookmarkable sections. Payroll is not shown in the manager dashboard. An Expo client for employee attendance lives in [`mobile/`](mobile/README.md); newer web communication screens are not yet mirrored there.

## Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/`. Without Supabase environment values, development uses an embedded PostgreSQL-compatible database in the ignored `.shiftline-local/` directory. Create a manager account and company, add employees, assign shifts, then have employees activate their own accounts with their employee number and one-time code. Local account data stays on this computer and is not a hosted service.

For the paired Supabase web apps, run the repository root on port 8084 and `worker-ui/` on port 8083. Open `/manager` on the root app for managers and the worker UI root for employees. Both need the same Supabase URL and publishable key in ignored `.env.local` files. Manager assignments, messages, notices, approvals and job changes reach workers through the shared database; the worker app refreshes while visible and when reopened.

In development, `/manager` opens a clearly labelled dashboard design preview without signing in. Its sample rows do not modify Supabase. Use **Connect live account** to sign in and work with real company records. Production builds never show the unauthenticated preview.

Web attendance actions require a connection. The Expo client has a durable SQLite attendance queue and distinguishes locally saved intents from server-confirmed records. Worksite checks are opt-in and run only while the app is foregrounded during active work; shift end stops them. Team membership is for job coordination; the job's primary assignee records its attendance actions. Managers initiate in-app conversations and workers can reply. Task comments are visible to managers and workers assigned to the job. Manager notes are private to managers. The map uses worksite coordinates and recent on-duty presence checks, never individual worker coordinates; checks expire from the view after three minutes or when the shift is no longer active. The browser cannot guarantee location updates while closed. Existing gross-pay records and exports remain in the database, but payroll is removed from the manager dashboard.

## Hosted setup

GitHub/Lovable sync transfers source code but does not provision a database. Use a dedicated Supabase project, apply every SQL file in [`supabase/migrations/`](supabase/migrations/) in filename order, and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the build environment. Keep service-role credentials out of client environment variables. Set up email/password authentication, email delivery, site URL and redirects before production use. See [SETUP.md](SETUP.md) for the full setup, security and rollback procedure.

## Checks

```sh
npx tsc --noEmit
npm test
npm run test:database
npm run lint
npm run build
```

The database tests run the actual migrations and RPCs against an isolated embedded PostgreSQL database. They cover attendance transitions, tenant isolation, approvals, messages, job progress and exports. Physical-device GPS, background scheduling, hosted authentication and email delivery require separate validation. Browser offline clock-in, web push delivery and an installable PWA are not implemented.

### Interactive manager demonstration

In development, opening `/manager` without a signed-in account displays the labelled Project Inc. demo. It starts on Overview and saves sample task status, team assignments, checklists, comments, notes, conversations, decisions, announcements, policy settings and supervised attendance actions in this browser. Reset demo restores the sample records. It never sends demo records to Supabase or to worker accounts.

The calendar supports month/week navigation, current and past jobs, and selected-day details. Reports include historical attendance and CSV download. The demo map uses OpenStreetMap with configured example worksites; its roster hides lunch, personal-break and off-duty states. Sample assignments are not live GPS evidence.

The signed-in manager continues to use the existing company-scoped backend. Apply `supabase/migrations/20261011081637_shiftline_manager_task_status.sql` to the hosted project before using the new live board move action. It validates manager/company ownership and status, locks the job, checks the expected status and audits changes. Moving a job does not create attendance events or alter worked hours. The board migration is now applied to hosted Supabase. Live job-site tracking remains unimplemented.

## Shared backend

The hosted project now has all eleven migrations, including chat, manager workspace, task-board changes and database integrity protections. See [docs/backend.md](docs/backend.md) for the schema, access rules, verification, demo boundaries and backup procedure. Both web clients use generated Supabase types in `shared/database.types.ts`.
