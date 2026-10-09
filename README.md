# Shiftline

Shiftline is an employee attendance and job app with a manager workspace. Employees record clock-in, lunch, job departures, personal departures and clock-out; review shifts, tasks, messages, company news, events and approved hours; and submit requests and timesheets. Managers assign shifts and jobs, review requests and corrections, publish notices, message employees, manage job steps and teams, and prepare gross-pay CSV exports.

The employee web app is designed for a phone-sized viewport. The manager workspace has desktop navigation and bookmarkable sections. An Expo client for employee attendance lives in [`mobile/`](mobile/README.md); newer web communication screens are not yet mirrored there.

## Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/`. Without Supabase environment values, development uses an embedded PostgreSQL-compatible database in the ignored `.shiftline-local/` directory. Create a manager account and company, add employees, assign shifts, then have employees activate their own accounts with their employee number and one-time code. Local account data stays on this computer and is not a hosted service.

Web attendance actions require a connection. The Expo client has a durable SQLite attendance queue and distinguishes locally saved intents from server-confirmed records. Worksite checks are opt-in and run only while the app is foregrounded during active work; shift end stops them. Team membership is for job coordination; the job's primary assignee records its attendance actions. Direct messages are manager-to-employee and in-app only. Payroll covers gross amounts and CSV exports, without tax, deductions or payouts.

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
