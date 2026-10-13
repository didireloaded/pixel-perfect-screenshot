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

The web app requires a connection to record attendance and cannot guarantee tracking or notifications while closed. Native background tracking and APNs/FCM delivery require separate native-app work. Payroll remains gross pay and exports only; taxes and payouts are not implemented. These limitations are explicit and do not use simulated success.

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

Lunch remains an explicit start/end event, with noon and 60 minutes used as the current default plan. Regular time retains the existing 480-minute threshold; overtime still needs approval. Neither a lunch reminder nor expected finish creates attendance evidence. Manager Calendar is now an attendance view, with no shift-assignment control. Historical planned records remain preserved.

Workers can choose location sharing when checking in. Fresh moving-device updates are throttled to ten seconds; stationary devices request fresh evidence each minute. The web page must remain visible and connected. Map markers update in place, with fullscreen and Fit workers controls. Existing server-side geofences, lunch/personal-time clearing and position expiry remain enforced. No native background tracking is claimed.
