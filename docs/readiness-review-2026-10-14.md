# Shiftline readiness review · 14 October 2026

## Decision

Prepare a controlled Namibia company pilot with daytime work. Do not describe this
as an unrestricted production launch. Automated checks validate important behavior,
but do not establish device reliability, recovery capability or operation at scale.
This is an engineering readiness review, not an independent security certification.

## Fresh evidence

- 89 frontend/shared tests pass.
- 27 database tests pass; five additional tenancy/integrity tests pass (some integrity
  tests overlap the main database suite).
- 40 worker overtime calculation tests pass.
- Both TypeScript checks and both production builds pass.
- Both production dependency audits report zero known vulnerabilities at audit time.
- Lint: zero errors after correcting three formatting errors; 19 existing warnings
  remain, including React hook dependency warnings. Both live app URLs return HTTP 200.
- Hosted Supabase has 28 migrations. Direct employee-table reads and anonymous
  worker-provisioning RPC execution are denied. Both Storage buckets are private.
- The push schedule is active. There are no queued/failed deliveries and zero registered
  push devices at review time. An empty queue does not prove notification delivery.
- No company or employee records were changed during this review.

## Implemented and covered by automated checks

- Independent company creation, company profile/logo, company-code worker enrollment,
  manager approval, worker credentials and tenant-scoped records.
- Persistent manager/worker sessions, retry on connection failures and account-change
  guards. Restoring a workday still requires a network connection.
- Worker-created attendance, lunch, personal/work departures, job activities, clock-out,
  company check-in cutoff, idempotent submissions and review of conflicting evidence.
- Job calendar with optional required employees, destinations, task status and comments.
- Requests and date-based leave, manager decisions, corrections, announcements, messages,
  employee profiles, notes and reports.
- Recorded versus approved payable hours remain distinct. Incident reports and private
  PDF/TXT evidence do not automatically rewrite attendance or pay.
- On-duty location observations, stale-position expiry, geofence display and privacy
  pauses. Namibia-only Mapbox address suggestions and manual location confirmation.
- Durable in-app notifications, read status, private push subscriptions, scheduled
  dispatch/retries and PWA installation/notification controls.
- Offline actions on an already-loaded workday, with original IDs/timestamps and
  reconciliation after reconnecting.

## Missing or not proven

1. **Overnight attendance:** expected finish must be later on the same day. Late-night
   event production spanning midnight is not supported and is a launch blocker for
   those customers. Do not work around this by inventing clock-outs or splitting evidence.
2. **Physical-device acceptance:** complete a real workday on current iPhone and Android
   devices, including permissions, GPS uncertainty, lunch privacy, lost connectivity,
   PWA reopening and notification delivery while closed/locked.
3. **Recovery:** verify backup/PITR entitlement, retention and Storage recovery. Perform
   and document a restore into a separate non-production project. No restore was performed.
4. **Operational monitoring and scale:** prove alerting, incident response and realistic
   concurrent-company/device load. Location invalidations still refresh full snapshots;
   no scalable incremental location feed has been implemented.
5. **Authentication hardening:** Supabase still reports leaked-password protection
   disabled. Review plan availability and enable it before a broad launch. The existing
   pg_net public-schema warning remains; app-role network execution was previously revoked.
6. **Venue coverage:** Mapbox does not reliably find all Namibia venues or event names.
   A manager can use a verified pin. Country filtering applies to suggestions; it is
   not a country-boundary validator for manually entered coordinates.
7. **Business rules:** leave balances/accrual, granular HR/operations roles and policy-aware
   attendance expectations are not complete. No check-in is explicitly not labelled
   confirmed absence. One account belongs to one company; membership switching is absent.
8. **AI/native/payroll scope:** background AI extraction and summaries are not connected.
   Background GPS while the web app is closed is unsupported. Gross-hours/pay exports
   do not implement tax, statutory payroll or salary payments.

The RLS-without-policy notices are consistent with the RPC-only, default-deny design;
they do not alone demonstrate exposure. Authorization tests are useful evidence but
are not a substitute for an independent security review.

## Tightening applied during this review

The dedicated tenancy suite was missing from GitHub Actions. CI now runs
`npm run test:tenancy` in addition to the existing checks, so company-profile and
private-logo isolation regressions are covered on future pushes and pull requests.
Three formatting violations in the SQL test harness and worker-access handler were
also corrected. These edits do not change application or database behavior.

## Release gate

Resolve overnight behavior if event crews are in scope, then pass the actual-device
procedure and backup restoration procedure in `docs/launch-runbook.md`. Confirm
monitoring, authentication configuration and realistic load before accepting an
unrestricted commercial rollout. Preserve existing evidence and require authorized
review for corrections; do not use automatic attendance/pay adjustments to hide gaps.
