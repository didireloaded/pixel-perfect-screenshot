# Launch verification

This is an acceptance procedure, not a claim that a public deployment exists.

## Automated checks

GitHub Actions runs both TypeScript checks, lint, frontend/shared tests, isolated
database tests, overtime tests and both production builds. Its build settings
cannot reach the live project. Passing CI does not verify production credentials,
physical GPS, email delivery or a backup restore.

## Deployment

Choose separate public HTTPS addresses for the manager and worker apps. Configure
the same Supabase project URL and publishable key in both builds. Never put a
service-role key in either frontend. Set Supabase's allowed redirect addresses
for manager confirmation and recovery. Rebuild when frontend settings change.

Verify direct navigation and refresh at worker routes and `/manager` using the
host's SPA fallback. Confirm sign-in, sign-out, access approval and password
recovery with actual accounts. Confirm that another company cannot read or write
the records. Keep source maps private if the hosting provider supports them.

## Offline attendance acceptance

1. Sign in while connected and start a workday.
2. Disconnect. Start lunch, return from lunch and clock out. Each action must
   display a pending count. No action may claim that Supabase accepted it yet.
3. Reconnect. Confirm the pending count clears and the manager sees the original
   capture times, not reconnection times. Replay must not duplicate events.
4. Test a network failure after the server accepts an event. Retrying must reuse
   its ID and payload. Test manager edits or period locking before replay;
   conflicting attendance must enter manager review, not disappear.
5. Confirm map sharing pauses during offline attendance and pending replay. Check
   lunch, personal departure, clock-out and the expected finish cutoff on a real
   phone. The server expires stale positions when a disconnected phone cannot
   send a clearing command.

The current outbox covers an existing workday. First clock-in still requires a
connection. Pending entries survive reload, but reopening the app and restoring
the authenticated snapshot requires a connection. Browser storage clearing or
device loss can destroy unsynchronized entries. The outbox stores no GPS or
credentials. Queue entries are scoped to the company and employee; signing into
another account must not transmit them. Keep the device locked and synchronize
before clearing browser storage or replacing the device.

## Backup restoration

Confirm the project's backup/PITR entitlement and retention in Supabase before
promising recovery. Restore into a separate non-production project; never restore
over this project's live records for a test. Compare table counts, migration
history, representative attendance events, membership and message records.
Verify RPC authorization, triggers and storage objects separately; a database
backup does not prove uploaded files were restored. Record the restore date,
recovered timestamp, elapsed recovery time and any missing data. Creating a paid
project or enabling paid recovery requires the owner's billing decision.

## Monitoring and remaining scope

After hosting is chosen, configure availability and error alerts for both app
addresses, worker-access provisioning and Supabase. Never send access codes,
message bodies, precise coordinates or full snapshots to monitoring logs.

Overnight work has explicit finish dates and automated midnight tests. Verify an
actual overnight phone session, offline recovery and tracking cutoff before rollout.
Granular manager roles and multiple-company membership need a reviewed
access policy. Native locked-phone tracking remains a separate product effort.
Leaked-password protection must be verified against the current plan and enabled
through Supabase Auth settings. These requirements are not satisfied by CI.
