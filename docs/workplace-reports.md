# Workplace reports and worker activities

## Confirmed activity

Workers with an open, working workday can record departure for an assigned job,
arrival, inspection, return or another work activity with a short explanation.
Departure and inspection reuse the existing start-job event where needed; return
reuses the end-job event. Arrival and descriptions add context without inventing
additional attendance. Lunch, personal departure and clock-out retain their
existing workflows and location privacy rules. A work activity cannot be recorded
while on lunch, away or clocked out. These new activities currently require a
connection; the attendance outbox still covers the existing attendance actions.

## Official company reports

Managers use Workplace reports for power outages, disruptions, early release,
emergencies or other operational incidents. Reports collect company-local times,
details and a company, worksite, department or individual audience. The selected
active employee audience is materialized at submission, preserving the historical
target even when departments later change.

Matching requires recorded clock-in evidence and a time overlap. Planned shifts
alone do not create an attendance explanation. An open workday is considered
potentially overlapping until its local day boundary; a missing clock-out is not
proof that the employee remained at work. Such links require manager review.
Location at an incident is not inferred from a department or workplace audience.
A link is contextual evidence, not confirmation that the worker was physically
affected. Reports do not make absence, misconduct or payroll decisions.

Links created when a report is submitted are retained as historical context.
Later accepted attendance can add links. A manager can confirm an explanation or
dismiss a connection, with a required reason. These decisions never rewrite
attendance or payable totals. Use the existing Corrections workflow for any
attendance adjustment. Official reports, worker activity evidence and completed
review decisions are immutable; a new report can clarify earlier information.

## Supporting files

The private `shiftline-reports` bucket accepts operational PDF/TXT documents up to
5 MB. A manager first reserves server-derived metadata and an object path. Only
that active company manager can upload at that path. Company managers can read
the evidence; workers and other companies cannot. Overwrite and deletion policies
are not granted. A finalize command requires an actual Storage object whose size
and MIME metadata match the reservation. Interrupted uploads remain pending and
can be retried or confirmed from the report screen.

Original files remain in private Storage. Generated access links expire after
60 seconds. Browser validation checks the PDF header or plain UTF-8 text; it is
not a malware scanner or a guarantee that every PDF is structurally valid. No
document is parsed, executed or sent to an external intelligence provider in this
stage. Do not upload medical documents to this operational flow. Sensitive leave
attachments require separate restricted roles and a dedicated access policy.

## Proof and limits

Migration `20261013165436_workplace_reports_activities.sql` is deployed. The local
database tests cover actual transitions, replay, cross-company rejection, review
immutability, unchanged hours, Storage policies and missing-upload rejection.
The hosted rollback smoke verifies activity/report/review RPCs, scoped snapshots,
upload authorization and preservation of attendance, without uploading a file or
leaving fixture records. Frontend tests cover report submission, manual activity
confirmation, lunch restrictions and upload failure/retry behavior.

The live manager screen was checked with real company data and its empty states.
A real signed-in PDF/TXT upload and a physical workday activity run still need
acceptance using legitimate company records. No demo incidents were added.

Background extraction, category suggestions, document interpretation, durable
processing queues, push delivery and operational summaries belong to later
stages. There is no external processing, automatic classification or automatic
attendance/pay adjustment in this implementation.
