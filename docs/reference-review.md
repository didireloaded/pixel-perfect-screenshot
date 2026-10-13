# Reference review and implementation decisions

The user supplied separate references for the manager map, calendar, HR overview, employee directory, employee profile, leave requests, task board, manager notifications, worker attendance home and worker requests. The references guide individual sections; they do not replace company rules or introduce sample employee records.

| Reference | Adaptation |
| --- | --- |
| Manager map and Dribbble fleet map | Work-only positions, working/lunch counters, fullscreen, fit controls, real employee photos where available, metre-based workplace/job boundaries and tracking cutoff status. No route history. |
| Employee-row schedule | Date-based jobs and assigned employee names. Calendar creation has date, title, details and optional employees. Shift times, breaks and payroll fields remain outside the job calendar. |
| HR dashboards | Real employee, clock-in, awaiting-check-in and approved full-day leave counts; seven-day recorded-hour overview; leave applications; company notices and upcoming jobs. |
| Employee directory | Search, department and role filters, active/pending/declined tabs, employee identifiers, profile access and status. No fabricated archive status. |
| Employee profile | Real photo or initials, department, role, bio, contact details, recorded workdays/hours and completed/assigned field jobs. No invented salary, tenure, work-format percentages or monitoring of apps and URLs. |
| Leave request | Full-day/date-range and hourly leave capture, server validation, retries, manager review, decision reason and worker synchronization. Private file attachments and leave balances require a separate storage/leave-policy design. |
| Task manager | Status summaries with filters, existing drag-and-drop and keyboard-friendly status controls, assigned team, comments and checklist progress. Keep Planned, In Progress and Completed because those match the current state machine. |
| Manager notification feed | All/unread views, search, event-specific destinations, persisted read receipts, company-scoped requests/messages/registrations/geofence alerts. Reading an alert is not a disciplinary decision. |
| Worker attendance home | Workday summary card, regular-hour progress, explicitly labeled live estimate, emergency shortcut and prominent clock-out action. Stored payroll calculations still use accepted evidence. |
| Worker request/calendar cards | Dated company jobs with optional assignments and full details, personal leave forms and existing request decisions. Open shifts and shift transfer terminology do not fit the worker-started attendance model. |

## Backend findings

The review caught an ambiguous SQL identifier in calendar assignment validation. The unqualified inner identifier resolved to the employee table's ID instead of the candidate assignment. A versioned migration fixes the responsible function. Regression tests reject another company's IDs and worker attempts to create manager jobs. A hosted query found no existing invalid assignments.

Leave dates and hourly ranges now have both command validation and database constraints. Manager read receipts have default-deny table access and a scoped RPC. The missing calendar creator foreign-key index is added. Schema types are regenerated from the hosted project.

## Delivery proof and limits

Local UI tests exercise the job-only form and worker calendar details. Database tests cover optional assignments, duplicate retries, company isolation, role boundaries, hourly leave, approvals and notification receipts. Hosted verification uses transactions ending in rollback. Browser review uses the actual signed-in manager and worker apps; it does not create production attendance for testing.

This work does not certify public SaaS readiness. Overnight attendance, durable web offline capture, granular company roles, multi-company onboarding, production hosting/monitoring, backup restoration and physical-device GPS acceptance remain separate launch work. Browser location requires a visible, connected page. Supabase leaked-password protection remains disabled. These limitations must remain visible in production-status documentation.
