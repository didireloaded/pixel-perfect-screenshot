# Shiftline implementation

The employee UI preserves the Lovable design tokens, card layout and bottom navigation. Today, Jobs, My hours and Requests now use server-validated records. The manager dashboard handles employees, sites, shifts, jobs, requests, approvals, audit history and payroll CSVs.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Without Supabase environment values, the development server runs embedded PostgreSQL (PGlite). Its database, local account password hashes and sessions persist in `.shiftline-local/`, which is ignored by Git. This is a development service on your computer; it is not a hosted production backend. It uses the same attendance migration and RPCs as Supabase. Local accounts do not send email or verify email addresses.

1. Create an account with an email and a password of at least 12 characters.
2. Select **I am setting up a company**, then enter the company, manager name, site and timezone.
3. Open **Manage employees, shifts and approvals**.
4. Add an employee. Privately give them their employee number and the generated activation code. Codes expire after 48 hours, are stored hashed, and can be used once. Replace expired codes from Employees.
5. Assign the employee a shift in Schedule, and optionally a job inside that shift.
6. The employee creates their own account, then enters their number and activation code.
7. The employee clocks in, starts/ends lunch or an assigned job, then clocks out. Times are recorded by the database server. Web actions require a connection. The Expo client saves attendance intents to SQLite before showing “Saved on this phone”; server confirmation is shown separately.
8. The employee submits the completed timesheet from My hours, requesting any recorded overtime.
9. The manager approves the timesheet and the amount of overtime. A manager cannot approve their own timesheet.
10. The manager locks the completed payroll date range, sets effective hourly rates, creates a frozen gross-pay run, then downloads its CSV. Every assigned shift in the period must be complete and approved.

The manager can publish holiday, closure, early-release and general notices, review site exit/return alerts, and issue a private code for a supervised kiosk. Employees can acknowledge notices and opt into foreground worksite monitoring. The kiosk requires a signed-in manager, employee number and code; it is not an unattended terminal.

Shifts in this release start and end on the same company-local date. Jobs remain paid work; lunch and personal departures are unpaid. New timesheet calculations sum integer seconds from effective attendance intervals, with a per-shift regular-time cap. Previously locked attendance exports retain their original format. Gross-pay runs freeze approved hours, hourly rates, overtime multipliers and gross amounts in minor currency units. No tax, deductions or actual payment processing is included. Locked periods cannot be reopened through the application. Notices do not automatically cancel shifts or calculate holiday pay.

## Connect Supabase / Lovable Cloud

GitHub sync transfers source code. It does not apply migrations or connect authentication by itself.

1. Enable a dedicated database for this Lovable project, or connect its dedicated Supabase project. Do not reuse an unrelated project's database.
2. Apply every SQL file in `supabase/migrations/` in filename order using the Supabase SQL editor or CLI migration workflow for that project. Apply each migration once. They create only `sl_*` tables and the `shiftline_private` schema; they do not alter existing application tables.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's build environment. The legacy public anon key is supported as `VITE_SUPABASE_ANON_KEY`. Never put service-role credentials in browser environment variables.
4. Enable email/password sign-in, keep anonymous sign-in disabled, configure the site URL and allowed redirects, and set a minimum password length of 12. For a real launch, configure email delivery and keep email confirmation enabled.
5. Rebuild/restart the app. Create and confirm the manager's account, then complete company setup. Employees confirm their own account before consuming activation codes.

If Lovable reports missing `projects:write`, remove and add its connector with current permissions. The implementation can still be synced from GitHub; provisioning cannot be performed with a read-only connector. A production build without connection values displays **Connect Shiftline**, rather than falling back to browser storage or simulated success. The local development account service is not included in the deployed application.

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

With employee consent, web and native clients check the worksite while the app is open and the employee is actively working, then pause for breaks, job departures, offline state and shift end. The server stores alert distance and accuracy, not location coordinates. Operating-system background geofence detection with the app closed, unattended kiosk/QR scanning and APNs/FCM manager push are not implemented. Auto-suggest currently produces server warnings, not automatic arrival prompts. Notices communicate holidays and closures; an automatic jurisdiction holiday/pay engine is not included.

The Expo dependency tree currently reports transitive build-tool advisories in Metro/Expo dependencies. A forced downgrade is not a safe remedy; review compatible upstream fixes before distribution.
