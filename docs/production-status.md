# Production status — 13 October 2026

Both web applications now use the same configured Supabase project. Runtime sample datasets, preview screens, simulated sync, local account APIs and automatic test identities have been removed. Empty workspaces show setup and empty states. SQL fixtures exist only in automated tests and are not deployed.

## Completed and verified

- Shared typed Supabase client behavior with separately stored manager and worker sessions.
- Server-derived company/employee identity, default-deny table access, scoped RPCs and immutable attendance/audit evidence.
- Real workplace joining, attendance/lunch/departures, shifts, task progress/comments/teams, messaging/replies, notices, requests, correction review, timesheet approval and gross-pay exports.
- Worker corrections enter the actual manager correction workflow.
- Auth changes clear old account records; stale reads and old mutation results cannot restore another account's data. Manager password recovery uses Supabase Auth; worker login-code recovery goes through their manager.
- Private company invalidation notifications, authorized snapshot reloads, visible-tab fallback every 15 seconds, and refresh on focus/reconnection. Supabase initializes daily notification partitions on the first Realtime connection.
- Location monitoring pauses during breaks, departures, hidden tabs, offline state and after the tracking deadline. The manager Mapbox screen shows configured workplaces/job sites and current on-duty employee points, without route history.
- Production builds require HTTPS Supabase configuration and a publishable/anon key; secret/service-role keys are rejected.
- 45 manager/shared UI and unit tests, 40 worker calculation tests and 21 SQL integration tests passed. Both TypeScript checks and production builds passed. Lint has no errors; existing development hot-reload and native dependency warnings remain.
- The hosted transactional smoke test passed for activation, tasks, messages, attendance, privacy, tenant isolation and private live notifications. All fixture records were rolled back. Those checks preceded real company setup; subsequent checks preserve the current real company/manager records.
- A direct unauthenticated Data API call was denied with HTTP 401 / SQL 42501. Production asset scans found no test identities, reusable codes or sample records.

## Required before a public launch

1. The real manager, worker and Plug & Play workplace are configured; finalize company contact details, attendance policies, departments and upcoming schedules/jobs. Test the first full working day with the actual employees.
2. Choose the public HTTPS addresses. Configure Supabase's site URL and allowed confirmation/recovery redirects for both apps. Local development addresses are http://127.0.0.1:8084 and http://127.0.0.1:8083.
3. Configure and verify authentication email delivery with the final mailbox/domain. Leaked-password protection is currently disabled according to the hosted security advisor; enable it when supported by the selected Supabase plan.
4. Verify database backup retention and perform a restore into a separate project. Backup/restore availability has not been confirmed by this implementation.
5. Deploy both application builds with matching Supabase project settings, then run a real-account acceptance pass: worker registers with name/phone, saves the generated number/code; manager approves access; worker records a shift/lunch/request; manager sees and reviews the same records. SQL tests verify the workflows, but the full real working-day flow, confirmation-email delivery and physical-device GPS still require this pass. Native JWT reads are verified in both signed-in browser apps.

The web app requires a connection for first clock-in and authentication restoration. An already loaded workday can save lunch, personal departure and clock-out locally until reconnection confirms them. It cannot guarantee tracking or notifications while closed. Native background tracking and APNs/FCM delivery require separate native-app work. Payroll remains gross pay and exports only; taxes and payouts are not implemented. These limitations are explicit and do not use simulated success.

## Worker name/phone signup update

- Signup now collects only name and required international phone. A server-side function creates a native Supabase Auth identity, issues the employee number and private eight-character code, and registers a pending employee in the configured workplace. No confirmation email, SMS or chosen password is involved.
- Team receives contact details and registration status. Managers can approve/reject registrations and replace lost login codes. Pending/rejected snapshots, mutations and company live updates are blocked server-side. The worker waiting screen checks status automatically. Code replacement does not revoke existing sessions.
- The migration and worker-access function are deployed. Hosted invalid signup returns HTTP 400; unauthenticated code replacement returns HTTP 401. Hosted SQL verification passed for pending-data isolation, Team visibility, approval, role/tenant protection and reset permissions, with fixtures rolled back. The real company and manager remain; no sample workers were added.
- 33 frontend/shared tests, 15 database tests and 4 Edge handler tests passed. Both TypeScript checks/builds and Deno type checks pass. Edge handler tests substitute Auth/API transport, so successful real worker account provisioning and signed-in browser-to-browser acceptance still need the first actual employee signup. Hosted Auth minimum is not exposed by the public settings API; it must accept eight-character generated codes.
- Advisors retain the existing leaked-password-protection warning and informational default-deny RLS/unused-index notices. No new advisor error was found.

## Workplace operations update

- The shift duplicate error is fixed on hosted PostgreSQL. Calendar supports creating and editing eligible shifts without generating another employee/day record. Identical save retries are safe; stale edits and captured/locked attendance are protected.
- The public Mapbox token is stored only in ignored local configuration and used by the manager map. The supplied workplace coordinates are saved in Supabase. The map loads the actual workplace, has bottom filters/fit controls and distinguishes current points from lunch, off-duty and unavailable states.
- Job briefs have actual coordinates, radius, instructions, lunch plan and overtime flag. Worker lunch pauses location while preserving the active job. Board status cannot prematurely end it. Current location is physically expired by the active hosted minute-by-minute cleanup job.
- Employees replaces the Audit sidebar; profile/department/bio/photo-URL editing uses manager-only commands. Company policies remain in account-menu settings. Worker announcements open complete detail sheets and support acknowledgement.
- Hosted rollback tests passed for the new workflows, role/tenant isolation and shift scheduling. Real company and employee data were preserved; no fixture jobs/attendance remain. Signed-in UI checks verified the loaded map, directory/profile dialogs and job/dropdown forms without adding actual attendance.
- Security advisors show the existing leaked-password-protection warning and intentional default-deny RLS informational notices; performance findings are informational unused indexes. No new advisor error or missing foreign-key index was reported. Enable [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before launch.

No public-launch certification is implied: HTTPS deployment, backup/restore verification and physical-device working-day acceptance remain required. The worker build uses standard Vite assets for browser caching; Vite and esbuild were updated and the unnecessary single-file bundler removed. Its dependency audit reports no known vulnerabilities as of 2026-10-13.

## Worker-started attendance (2026-10-13)

Workers no longer need a manager to assign today’s shift. The `start_workday` RPC derives company, employee, date, worksite and capture time on the server and atomically creates the workday and timesheet before clock-in. Failed geofence or state validation rolls back the new records. It preserves approval, period locks, GPS policy and idempotency. Workers choose an expected finish time as the privacy cutoff. Existing planned jobs must fit that cutoff. This flow supports same-day work; overnight work requires a separate design.

Lunch remains an explicit start/end event, with noon and 60 minutes used as the current default plan. Regular time retains the existing 480-minute threshold; overtime still needs approval. Neither a lunch reminder nor expected finish creates attendance evidence. Attendance has its own manager view; both calendars now show date-based jobs with optional employee assignments. Historical attendance records remain preserved.

Workers can choose location sharing when checking in. Fresh moving-device updates are throttled to ten seconds; stationary devices request fresh evidence each minute. The web page must remain visible and connected. Map markers update in place, with fullscreen and Fit workers controls. Existing server-side geofences, lunch/personal-time clearing and position expiry remain enforced. No native background tracking is claimed.

## Reference-driven HR and worker improvements (2026-10-13)

The selected patterns and exclusions are recorded in [reference-review.md](reference-review.md). The manager overview, directory/profile, request review and notification feed use actual company records. Workers have a job calendar, dated full-day/hourly leave requests, workday progress and a prominent clock-out action. Open-interval time is explicitly a display estimate; accepted evidence remains authoritative for payroll. Reports and profiles now distinguish recorded time from approved payable time.

Versioned hosted migrations add leave dates and manager notification receipts, fix calendar assignment validation and cover the calendar creator foreign key with an index. Generated schema types match the hosted database. The hosted HR/calendar smoke test passed with all fixtures rolled back. A live UI check observed the worker clock-out and submitted timesheet reflected on the manager side without creating attendance fixtures.

Validation: 53 frontend/shared tests, 23 isolated database tests and 40 worker calculation tests pass. The frontend suite passes with two workers; unrestricted parallel execution alongside the database suite caused test timeouts on this development machine. Both apps type-check and build. Lint reports zero errors and 19 existing warnings. Visual checks cover manager overview, calendar form, directory/profile, notification feed, map boundaries and the worker workday/leave views. No public-launch certification is implied.

## Durable browser attendance (2026-10-13)

Attendance after first clock-in is saved locally before submission. The outbox preserves original event IDs, capture times and action order. Entries survive remounts/reloads and are scoped to the company and employee. Reconnection, visible-tab polling and a manual retry replay the same payload. Entries are removed only after a server-confirmed acceptance or transfer into manager review. Replay stops at a conflict; later entries remain pending. Web Locks coordinate replay across tabs where supported. The server retains tenant validation and idempotency on all browsers.

Pending attendance is explicitly unconfirmed. The worker can start/end lunch and clock out during a network outage on a loaded workday. Pending entries do not change stored payroll totals. Location monitoring pauses while the queue is nonempty. No GPS or credentials are stored in the outbox. Storage failures and unreadable entries produce errors without silently clearing evidence. Sign-out warns when unsynchronized entries remain.

This is not complete offline startup: opening the app and restoring its authenticated snapshot still requires connectivity, and first clock-in remains online. Browser storage deletion/device loss can remove unsynchronized evidence. See [launch-runbook.md](launch-runbook.md) for acceptance, deployment and separate-project backup restoration procedures. Overnight work, granular roles/multi-company membership, hosting, monitoring, leaked-password protection and a tested backup restore remain open.

Validation: 60 frontend/shared tests, 23 database tests and 40 overtime tests pass. Both TypeScript checks and production builds pass. The database suite verifies offline capture timestamps, exact replay and removal of lunch coordinates. A UI test verifies offline lunch persistence through remount and reconnection. GitHub Actions now defines the same checks for pushes and pull requests; build-only CI settings cannot access the hosted database. No production records were created for this pass.

## Workplace reports and activities — stage one (2026-10-13)

Workers can record job departure, arrival, inspection, return and other confirmed
work activities. Job-related transitions reuse existing attendance and break
privacy behavior. Managers have Workplace reports with operational incidents,
company/site/department/employee targeting, private PDF/TXT evidence and review
of potentially overlapping recorded workdays. Explanations never change hours or
pay; attendance changes still use Corrections. Original reports and evidence are
immutable. Medical uploads and external automated processing are not supported
in this operational flow.

The hosted migration and private Storage bucket are deployed. The hosted rollback
smoke passes for activities, reports, overlap links, review, tenant isolation,
upload authorization and unchanged attendance. No fixtures or actual files remain
from this proof. Local validation includes 67 frontend/shared tests and 25 database
tests; both applications type-check and build. Lint has zero errors and the same
19 existing warnings. Security advisors retain the existing leaked-password
protection warning and deliberate default-deny RLS informational notices, with no
new security warning. Performance advisors report only informational unused indexes.

The manager report page was visually checked with real company empty states. A
real HTTP PDF/TXT upload and an actual employee activity day still need acceptance
with legitimate records. New work activities currently require connectivity;
background interpretation, push delivery and summaries remain later stages. See
[workplace-reports.md](workplace-reports.md) for behavior, access and limits.

## Located job plans (2026-10-13)

Managers create date-based job plans without assigning attendance shifts. Crew
selection is optional; a selected crew restricts who can start the job. Workers
start today's plan from their actual, clocked-in workday. The server attaches
the execution to that workday, preserves complete instructions and uses the
confirmed destination and boundary for existing job geofencing. Repeated starts
reuse the same execution. Job briefs remain separate from the execution board.

Job forms use permanent Mapbox Geocoding address suggestions, a draggable map
pin and manual coordinates. Namibia venue-name coverage is limited: unmatched
places require a confirmed pin, never invented coordinates. The configured
token accepted permanent requests; no Mapbox billing or licensing settings were
changed. A saved destination is not evidence of a worker's live position.
Managers can edit a plan's location before execution starts, with stale-edit
protection and safe identical retries. Started destinations are locked.

Both migrations are deployed. Hosted rollback verification covers plan creation,
location edits, worker execution, retries, lunch resumption and tenant isolation;
fixtures were rolled back. Both apps type-check and build, with zero lint errors
and 19 existing warnings. Live address selection and the loaded location editor
were checked without submitting a test job or changing existing company records.
AI processing remains unconnected; address search uses Mapbox, not AI.

## Check-in cutoff and browser notifications (14 October 2026)

Each company has a check-in cutoff, defaulting to 17:00 in its configured
timezone. Company settings can change it. The worker button turns grey at the
cutoff, including an already-open confirmation sheet; the server rejects new
live check-ins after it. Accepted event retries remain valid. Clock-out, breaks,
existing work and reviewed corrections are not stopped or rewritten.

New messages, jobs, announcements, request decisions, timesheet approvals,
pending registrations and work-boundary alerts create employee-scoped notification
records. Read receipts are separate from approval and message read status. The
feed shows the latest 100 updates. Existing work records remain available; old
history is not sent retroactively as push alerts. Expected-finish reminders do
not create attendance evidence or automatically clock anyone out.

Both apps have installation manifests, icons and separate push service workers.
Users explicitly enable phone notifications. iPhone users must first save the
app to their Home Screen using Safari (Web Push requires iOS 16.4 or newer).
Lock-screen alerts contain generic categories, never message bodies, medical
details or GPS observations. Subscriptions are company-account scoped and can
be disabled. Sign-out attempts to unregister the current device; offline cleanup
may fail, so a generic alert can still arrive until connectivity returns or the
subscription is disabled. No private content is included in that alert.

VAPID and dispatch secrets are generated on the server and stored in Supabase
Vault. A minute-by-minute scheduled Edge dispatcher uses leased delivery rows,
bounded retries and expired-subscription handling. Server acceptance does not
guarantee OS display. Physical iPhone/Android notification acceptance still
requires a legitimate signed-in user to enable permission and receive a real
work update. This change does not add offline cold-start, offline clock-in or
native background GPS.

Verification: 74 frontend/shared tests and 27 database tests pass (26 established
checks plus the new notification/cutoff test). Both apps type-check and build.
The Edge function type-checks; scheduled requests return HTTP 200. Hosted
rollback SQL verifies cutoff boundaries, rejected late clock-ins and notification
access/read isolation without leaving fixtures. The notification interface was
checked on a phone viewport. Existing onboarding behavior is preserved.

The new notification RPC follows the existing public-invoker/private-definer
pattern. Network-extension execution is revoked from ordinary app roles.
Supabase still reports the non-relocatable pg_net extension's default public
namespace ([extension advisory](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)),
the existing leaked-password-protection warning, and deliberate default-deny
RLS informational notices. No new missing-FK-index warning was reported.

## Returning sessions (14 October 2026)

Supabase continues to persist separate manager and worker sessions and refresh
tokens. The worker splash screen now waits for restoration rather than opening
Welcome after a fixed 1.5-second timer. Network or snapshot failures show a retry
state; they do not request credentials or clear an already loaded workday.
Both apps retry restoration on reconnection and focus. Initial auth callbacks
without a user defer to session restoration; confirmed sign-out still clears
account records. Stale results from a previous account remain discarded.

78 frontend/shared tests pass, including slow startup, retry after failure,
remount restoration and explicit sign-out. Both apps type-check and build.
Sessions belong to an origin and browser: localhost, 127.0.0.1 and the hosted
address each require their own initial login. Private browsing, cleared site
storage, revoked sessions and expired/invalid refresh tokens still require login.
No password or access-code storage was added, and no auth checks were bypassed.

## Multi-company onboarding · 14 October 2026

Company owners can create independent workspaces, provide company/workplace details,
and upload a private company logo. Team and Settings show a company registration code.
Workers must supply this code with their name and phone; manager approval still gates
company access. The previous implicit single-company signup path now fails closed.
Each account belongs to one company. Multi-membership switching and billing are outside
this change. Logos use membership-scoped Storage policies and signed display URLs.

Verification: frontend/shared suite, both TypeScript checks and production builds;
five focused SQL tests cover multi-company enrollment, approvals, profiles, private
logo access and existing cross-company mutations. A hosted two-company setup/profile
smoke test passed inside a rolled-back transaction, leaving no fixture records.
Existing workspace data is not reset by the migration; any reset is a separate,
explicit destructive operation.
