# Company hours, late arrival and check-in reminders

Owners configure normal company start/finish times, weekdays and the employees
expected to follow them in Settings. Configuration is optional and off until
explicitly saved. A saved rule takes effect tomorrow in the company's timezone;
it never creates historical expectations or rewrites an already materialized day.
Newly approved staff are not automatically enrolled. Flexible staff can remain
outside this rule. Rules describe ordinary same-day hours, not assigned shifts
or calendar jobs; workers still create their own actual workdays.

A minute-by-minute Supabase cron materializes each selected active worker's
expected arrival for that company day. It retains the policy and timezone used,
scheduled start, adjusted expected start, accepted clock-in, original clock-in
evidence and exact late seconds. Arrivals are derived from effective attendance
events, including approved corrections, rather than worker GPS or receipt time.
Corrections to historical arrivals are reflected when that day's history is read.
The original event remains immutable and its timestamp stays visible.

Approved full-day leave excludes an arrival. Approved hourly leave covering the
start moves the expected arrival to the leave end; contiguous approved intervals
are followed. Prior-day work whose planned window and recorded attendance overlap
the expected start is excluded. Unresolved old workdays outside that window do
not exempt another day. Unapproved requests do not change expectations. Holidays
are not inferred: the configured weekdays and selected employees are the scope.

Without accepted clock-in, a worker receives one reminder after five minutes and
another after twenty minutes, through the existing private notification and web
push infrastructure. Execution/phone delivery can be delayed. Repeated runs are
idempotent; a delayed first run sends only the latest due reminder, and no reminder
is generated after normal finish. Pending reminders are suppressed at dispatch
if clock-in, approved leave or overlapping overnight evidence makes them stale.
If approved hourly leave changes the expected start, the old queued reminder is
suppressed and the revised start has its own deduplicated stages.

The manager's Attendance screen includes a date-selectable arrival history.
`No check-in recorded` is not an absence finding and has no late-minute total
until evidence exists. Exact arrival lateness is displayed in minutes/seconds.
Owners, HR and Operations can read company history; workers can read only their
own records and never receive the company's configured employee roster. Only
Owners can configure the rule. Tables are RLS/default-deny with a public invoker
RPC and private validated implementation.

No payroll, deductions, clock-ins or clock-outs are created by this feature.
No new third-party service or AI call is involved. Real phone notifications still
depend on the worker's permission and a valid subscription. Existing attendance,
leave, correction and payroll approval workflows remain authoritative.
