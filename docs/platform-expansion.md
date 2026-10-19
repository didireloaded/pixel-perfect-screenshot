# Platform workflows — 19 October 2026

This release adds company-scoped operational workflows to the existing attendance system. It is a subset of the authorised expansion, not completion of the entire backlog. Payroll additions and integrations are deferred at the user's request.

## Implemented

| Workflow | Worker | Manager |
| --- | --- | --- |
| Attendance context | View own punctuality records and explain an issue | Owner/HR/Operations review explanations and configure dated off days or different hours |
| Availability | Submit and withdraw future availability preferences | View company preferences; preferences do not excuse attendance |
| Leave changes | Request cancellation or amendment | Owner/HR independently review; original records and charge reversals remain preserved |
| Jobs | Seen, Available or Conflict response with a note | Owner/Operations view responses and configure reporting times for assigned employees |
| Task templates | Existing task checklist experience | Owner/Operations explicitly apply a saved checklist once to an existing unfinished task |
| Knowledge and policies | Search published text and acknowledge the exact policy version | Owner/HR publish immutable versions and view receipts |
| Profile changes | Request name, contact phone, title or bio changes | Owner/HR review with a reason; login credentials and roles remain unchanged |

Job reporting times use the company's timezone and configured attendance policy. They do not create attendance. Reporting expectations survive job completion and crew changes. Off-day and different-hours exceptions are explicit, dated records. Historical attendance is not rewritten by an explanation or preference.

Contact phone is a separate field from login phone. Only the employee and Owner/HR receive the additional contact field. Operations receives no new access to other employees' contact information. Workers cannot access drafts or other workers' policy receipt lists.

The new RPCs follow the existing default-deny architecture: public invoker wrappers call authenticated private functions. New tables deny direct client access. Every workflow derives the company and employee from the authenticated account; supplied IDs are validated against that scope. Notifications invalidate authorised reads; visible-tab polling remains a fallback.

## Verification

- Local UI/shared suite: 40 files, 143 tests passed.
- Seven new workflow SQL suites plus punctuality regressions: 12 tests passed.
- Both TypeScript checks, lint and both production builds passed.
- Independent read-only reviewer found no remaining actionable findings in the frozen product source; independently reran focused UI, both typechecks and all 12 SQL tests.
- `npm run test:platform` runs the seven workflow SQL suites; GitHub verification now includes it. Account billing still blocks hosted CI execution, so these are local results.

## Deliberate limits and pending work

Task templates are manual, not recurring scheduling. Knowledge articles are plain text; document vaults, restricted attachments and legal e-signatures are not implemented here. Availability is a preference, not approved leave. Profile requests do not change authentication phone numbers. No attendance, pay or legal entitlement is inferred automatically.

Other expansion items remain pending: break/rest policies, shared-device clock-in, full offline startup, leave accrual/coverage/delegation, recurring tasks, reusable forms/evidence, worker hazard reports, handovers/equipment, document/training/offboarding workflows, group conversations, notification preferences, confidential feedback, saved trends, expenses, bulk invites, scoped managers, multiple memberships, account security controls, retention and subscription billing.

All explicitly excluded features remain excluded. This release does not certify unrestricted production readiness. Reliable production email and a verified backup restore remain launch requirements. User-reported phone GPS/push acceptance does not establish coverage across all devices.
