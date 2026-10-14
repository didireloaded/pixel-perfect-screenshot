# Overnight attendance boundary and implementation scope

Reviewed 14 October 2026. Overnight attendance is **not supported**. Do not advertise
the retry fix as overnight support, fabricate a midnight clock-out, or move a worker's
recorded timestamp onto another date.

## Verified current behavior

`scripts/employee-clockin.test.mjs` executes the actual migration chain against an
isolated PostgreSQL-compatible database. Its midnight case uses Africa/Windhoek
and dates in the past, independent of the host's time or timezone. It verifies:

- Next-day clock-out evidence is stored with its original timestamp and
  `SHIFT_DATE_MISMATCH`; no canonical clock-out is manufactured.
- Replaying the same submission returns the same pending review result.
- No GPS is retained on that clock-out, and subsequent live-position reporting is
  rejected outside the original workday window.
- A manager cannot currently approve next-day evidence: correction approval also
  requires the assigned date. Preserve the evidence while this remains unsupported.
- A new workday cannot silently replace the unresolved previous workday. Its
  provisional insert rolls back if another workday remains open.
- The legacy `transition` endpoint recognizes committed retries before looking for
  today's shift. Different employees, revoked access, changed event types and
  changed notes are rejected. New transitions retain the existing date guards.

## Coherent overnight implementation required before release

1. Add explicit expected-end date or a finish instant to attendance workdays, with
   a bounded duration. Preserve the start date as the reporting identity and retain
   existing one-workday-per-employee/start-date compatibility. Existing rows must
   retain exactly the same finish and privacy deadlines.
2. Make worker clock-in explicitly distinguish today from tomorrow. Convert local
   timestamps with the company's timezone in the database. Do not infer tomorrow
   merely because the selected finish time is earlier than the current time.
3. Select the employee's unresolved active workday independently of the current
   date in commands and UI; keep planned job dates separate from attendance dates.
   Define missed-clock-out handling explicitly. Do not auto-close or grant payable
   time when a workday expires.
4. Change submission, correction, job activity and calendar-job execution guards
   together to validate against the workday's real interval. Preserve capture-time,
   ordering, tenant, approval, period-lock and duplicate-ID checks. Determine which
   reporting/pay period owns a cross-boundary workday before changing lock logic.
5. Change server location acceptance, presence snapshots, browser tracking and both
   maps to use the same explicit finish instant. Lunch, personal time, clock-out,
   stale-position expiry and the tracking deadline must still pause or erase live
   visibility. An unresolved old workday must never extend tracking indefinitely.
6. Exercise midnight clock-in/out, lunch and job travel across midnight, offline
   replay/reordering, locked-period review, duplicate submissions, conflicting
   workdays, reporting and privacy. Include at least one non-Namibia timezone in
   database conversion tests even though the current market is Namibia.

This scope is an implementation boundary, not a migration or an enabled feature.
The current fix adds no speculative columns or automatically altered evidence.
