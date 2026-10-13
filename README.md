# Shiftline

Shiftline is an employee attendance and job app with a manager workspace. Employees record clock-in, lunch, job departures, personal departures and clock-out; review shifts, tasks, messages, company news, events and approved hours; and submit requests and timesheets. Managers assign shifts and jobs, review requests and corrections, publish notices, discuss jobs with workers, manage job steps and teams, review attendance, and see recent worksite presence.

The employee web app is designed for a phone-sized viewport. The new iOS-style worker web UI lives in [`worker-ui/`](worker-ui/README.md) and uses the same Supabase database as the manager workspace. The manager dashboard follows the Project Inc. reference with a purple sidebar, purple task controls, a task board, and bookmarkable sections. Payroll is not shown in the manager dashboard. An Expo client for employee attendance lives in [`mobile/`](mobile/README.md); newer web communication screens are not yet mirrored there.

## Development with the real backend

Use Node.js 22 or newer. Put the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local` files in this directory and in `worker-ui/`. Never use a service-role or secret key in browser configuration. Missing Supabase configuration stops production builds. Set `VITE_MAPBOX_ACCESS_TOKEN` to a public `pk.` token in the root manager build environment to enable the map. Restrict its allowed origins before public deployment.

```sh
# Repository root: manager app
npm ci
npm run dev -- --host 127.0.0.1 --port 8084 --strictPort
# In worker-ui/: worker app
npm ci
npm run dev -- --host 127.0.0.1 --port 8083 --strictPort
```

Open `http://127.0.0.1:8084/manager` and `http://127.0.0.1:8083/`. Both require real Supabase accounts. Confirm the manager account, create the company/worksite, approve worker registrations and assign shifts. Worker signup uses name and phone and issues an employee number/private code. There are no local account endpoints, reusable access codes, automatic test logins or sample-record screens. Empty accounts show their actual setup and empty states.

Workers register with name and phone only. The server issues an employee number and private eight-character access code; Team shows the registration immediately, and a manager approves workplace access. No worker email confirmation or chosen password is required. Lost codes are replaced in Team.

Both clients share the typed backend in `shared/backend.ts`. Manager and worker sessions use separate storage keys. Committed commands notify private company channels with an invalidation only; each client reads its authorized snapshot again. Updates also refresh on focus, reconnection and every 15 seconds while visible. `shared/live-sync.ts` coalesces overlapping reads. Supabase Realtime initializes its notification partitions on the first connection; polling remains the fallback during a cold start or outage.

Web attendance actions require a connection. The Expo client has a durable SQLite attendance queue and distinguishes locally saved intents from server-confirmed records. Worksite checks are opt-in and run only while the app is foregrounded during active work; shift end stops them. Team membership is for job coordination; the job's primary assignee records its attendance actions. Managers initiate in-app conversations and workers can reply. Task comments are visible to managers and workers assigned to the job. Manager notes are private to managers. The Mapbox map shows workplaces, job sites and current on-duty worker positions to company managers. It stores one latest point per worker, without routes, expires points after three minutes and physically clears them through hosted minute-by-minute cleanup. Lunch/personal time and off-duty positions are hidden. Lunch on a job keeps that job active and resumes it after the break. The browser cannot guarantee location updates while closed. Existing gross-pay records and exports remain in the database, but payroll is removed from the manager dashboard.

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

## Shared backend

The hosted project now has all seventeen migrations, including chat, manager workspace, task-board changes and database integrity protections. See [docs/backend.md](docs/backend.md) for the schema, access rules, verification and backup procedure. Both web clients use generated Supabase types in `shared/database.types.ts`.
# Hosted apps

See [ChatGPT Sites hosting](hosting/sites/README.md) for deployment source,
artifact assembly and the live worker and manager URLs.

