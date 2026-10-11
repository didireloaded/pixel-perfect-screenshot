# Shiftline backend

The manager and worker web apps use one Supabase project: `hfhiuxijpbujoahtnkjt` (PostgreSQL 17). The database is authoritative for identities, permissions, attendance, tasks, conversations, approvals, calculations and audit history. Neither a publishable key nor an employee number confers manager access.

## Database and API

The authoritative schema is the ordered SQL history in `supabase/migrations/`. Eleven migrations are applied to the hosted project as of 11 October 2026. `shared/database.types.ts` is generated from that hosted schema and used by both web clients. Generate it again after schema changes.

The public application API has two authenticated RPCs:

- `sl_snapshot()` returns the current account's permitted records and company-local date. `schemaVersion: 11` identifies the current contract.
- `sl_command(p_action, p_data)` validates an object payload, derives identity from `auth.uid()`, validates database membership and applies a mutation in one PostgreSQL transaction. It returns an updated scoped snapshot.

Direct table access is denied to `anon` and `authenticated`. All 30 application tables have RLS enabled. RLS intentionally has no permissive policies: clients use scoped RPCs. The privileged implementation lives in the non-exposed `shiftline_private` schema, has an empty search path, and checks authenticated database membership. Only its current snapshot/command entry points are executable by `authenticated`; archived implementation functions are not.

| Area                              | Tables                                                                                                      | Ownership and behavior                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companies, worksites, employees   | `sl_companies`, `sl_sites`, `sl_employees`                                                                  | Auth user binds to one employee; company owns sites and employee numbers. Manager-created activation codes are hashed, expire in 48 hours and are consumed atomically.                         |
| Attendance and schedule           | `sl_shifts`, `sl_jobs`, `sl_events`, `sl_timesheets`                                                        | Unique employee/day shift, shift policy version, valid event sequence, server receipt time, employee/shift/job consistency.                                                                    |
| Offline evidence and devices      | `sl_devices`, `sl_submissions`                                                                              | Device belongs to the submitting employee; event UUID deduplicates retries; original evidence cannot be edited or deleted. Review status remains separate.                                     |
| Requests and corrections          | `sl_requests`, `sl_request_decision_reads`, `sl_corrections`, `sl_adjustments`                              | Worker owns request; managers review within the company; original events remain append-only; approved corrections add adjustments. Configured two-level approval requires different reviewers. |
| Approved calculations and exports | `sl_policies`, `sl_calculations`, `sl_periods`, `sl_pay_rates`, `sl_gross_runs`                             | Versioned shift policies and approved calculations; frozen period/gross exports. Gross pay only; no taxes or payouts. Payroll is absent from the dashboard.                                    |
| Task collaboration                | `sl_job_members`, `sl_job_steps`, `sl_job_comments`                                                         | Managers assign teams; primary assignee and job members see job/roster/checklist/comments. Members can complete steps and comment, without accessing another worker's attendance or pay.       |
| Messaging                         | `sl_messages`                                                                                               | Manager initiates; worker replies in that conversation. Only sender/recipient see it. Read receipt changes do not grant access to others.                                                      |
| News and calendar events          | `sl_notices`, `sl_notice_acks`                                                                              | Company-scoped holidays, closures, early releases, announcements and events; acknowledgements cannot cross companies.                                                                          |
| Manager workspace                 | `sl_manager_notes`, `sl_site_presence`, `sl_site_alerts`, `sl_setup_progress`, `sl_kiosk_codes`, `sl_audit` | Manager-only notes and operational views; supervised attendance has a distinct credential and audit trail. Audit history is append-only.                                                       |

## Integrity and concurrency

Composite foreign keys enforce company ownership for employee/site, shift, job, sender/recipient, author, reviewer, device and calculation references. Additional keys enforce employee ownership of shifts and matching shift ownership of events, corrections, devices and approved calculations. Join tables without a company column validate the corresponding parent ownership.

Attendance inserts lock the owning shift and validate the state machine and event chronology at the database layer. Authenticated company mutations serialize using the existing company lock; activation additionally uses a per-user advisory lock. Two clock-ins cannot both succeed for the same shift. Board moves use the expected previous status to detect a stale write and never create attendance events. A task already moved to In progress can still be started by its assigned worker.

Foreign-key lookups have covering indexes. Frequently used company/date, task-status, pending request/submission and audit queries have dedicated indexes. The unused-index advisor is expected on the currently empty hosted database; do not remove ownership/FK indexes merely because traffic has not started.

## Location privacy

Foreground `report_position` calls require the worker's own active shift, configured worksite, acceptable GPS accuracy and an open company-local tracking window. They are rejected during lunch, personal breaks and after shift end. The map receives configured worksite coordinates and recent inside/outside presence, not a worker's raw GPS coordinates. Presence expires from snapshots after three minutes and is removed immediately by confirmed break/departure/clock-out actions, including supervised attendance.

Only clock-in submissions may retain a GPS stamp within the bounded shift capture window. Lunch, personal departures and clock-out discard supplied coordinates before saving evidence. Raw position reports are not written to location history. An offline replay uses the same sanitized payload for idempotency.

Current limitations: foreground monitoring does not run with the browser closed; the map is worksite presence rather than continuous individual GPS tracking. Job-site tracking while away from the base worksite still needs its own location model and native-device validation.

## Live records versus development demos

Use **Connect live account** in the manager dashboard to sign in, create the company and add workers. Employees sign in and consume the manager's one-time activation code. Both web apps must use this same Supabase URL and publishable key.

The unauthenticated manager design demo intentionally stores sample interactions in browser storage. The development employee `EMP-1042` / `SHIFT-1042` intentionally uses an isolated local PostgreSQL database. Neither creates hosted business records. These development paths are not production authentication bypasses. The hosted database currently has no company, employee or attendance records.

## Verification

`npm run test:database` runs real SQL migrations and RPCs in isolated PostgreSQL-compatible databases. It covers tenant/role isolation, activation, transitions, concurrent clock-ins, idempotency, immutable evidence, approvals/exports, worker replies, teammate access, and lunch privacy.

`supabase/tests/backend_smoke.sql` exercises those shared paths on hosted PostgreSQL with temporary fixture users and companies. It finishes with `ROLLBACK`, so no test records remain. It passed against this project on 11 October 2026. Run the whole file as one transaction; never run extracted fixture statements separately.

Supabase advisors report no missing foreign-key indexes. They report informational RLS-without-policy findings for the intentional RPC-only access model. One Auth warning remains: leaked-password protection is disabled. Enable it in Supabase Auth before launch: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . Hosted SQL verification does not prove email delivery, real user login or physical-device GPS behavior.

## Backup and release procedure

Apply migrations before deploying matching app code. Migration filenames match hosted history; do not edit applied SQL. The local adapter identifies migrations by their descriptive suffix so aligning filenames with hosted timestamps does not apply existing migrations twice.

Database backups are separate from source control and CSV exports. Automatic daily backups depend on the Supabase plan; their availability and restore history have not been verified for this project. Confirm them in https://supabase.com/dashboard/project/hfhiuxijpbujoahtnkjt/database/backups/scheduled . Pro/Team/Enterprise have scheduled backups; free projects need regular off-site exports. Point-in-time recovery is a paid option and has not been enabled here. See https://supabase.com/docs/guides/platform/backups . Storage file contents need a separate backup if uploads are introduced.

Before client data is added, agree backup retention, store an off-site export securely and test a restore in a separate project. For application rollback, redeploy the previous app while retaining additive schema and immutable history. Do not drop attendance/audit tables or reset the hosted database.
