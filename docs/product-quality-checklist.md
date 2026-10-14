# Shiftline product quality standard

Adapted from the supplied app-quality guide on 14 October 2026. This document
defines acceptance criteria; it does not certify that every criterion is met.
Existing implementation evidence comes from `production-status.md`, the readiness
review and regression tests. No fresh device, accessibility or load testing was
performed while preparing this checklist.

## Product boundaries

- Namibia-first web/PWA product: worker UI for phones; manager UI for phones and desktop.
- Companies have independent records, branding and worker enrollment codes. Workers
  use a personal employee number/login code after registration and manager approval.
- Workers record actual attendance. Managers plan jobs, not employee clock-in times.
- Calendar assignment is optional unless a job requires specific employees.
- Work-related travel is not absence. A missing clock-in alone does not establish
  lateness or absence without an applicable expectation and reviewed evidence.
- Location sharing is explicit, on-duty and limited by the working window. Lunch,
  personal time, clock-out, hidden pages and lost connectivity pause sharing.
- Original attendance and supporting evidence remain distinct from corrections,
  approved payable hours and suggested interpretations.
- No automatic pay adjustment, invented attendance or fake successful action.
- Native background GPS, biometrics, widgets and AI are not implied by the PWA.

## Status vocabulary

**Implemented/tested** means code and relevant automated checks exist. It does not
mean the workflow passed physical-device acceptance. **Device acceptance** means
hands-on evidence is still required. **Partial** means a material capability is
missing. **Open** means it has not been established or implemented. Do not assign
a numerical quality score without measurements, or average away release blockers.

## Worker acceptance flows

| Flow | Acceptance criteria | Current position |
| --- | --- | --- |
| Register | Company code has its own labelled field; name/phone remain on error; personal credentials shown once; no company data before approval | Implemented/tested; device acceptance |
| Return to app | Saved valid session restores; outages retain credentials and offer recovery; rejected credentials do not loop forever | Implemented/tested; installed-PWA acceptance |
| Start work | Immediate busy feedback; no duplicate action; required GPS explained at action time; success only after server acceptance | Implemented/tested; real GPS acceptance |
| Break/return | Clear work/break labels; actual timestamps retained; sharing pauses; offline state is visibly unconfirmed | Implemented/tested; device acceptance |
| Leave for job | Today, eligibility, destination and work state validated; every disabled departure explains the reason and next action | Implemented/tested; complete field journey acceptance |
| Clock out | Easy to find; duplicate taps/retries safe; queued evidence survives reconnect; sharing stops | Implemented/tested; device acceptance |
| Previous workday | Unresolved attendance is visible and blocks misleading new check-in; no manufactured finish | Implemented/tested; overnight completion remains blocked |
| Requests | Relevant types, dates, status and reviewer reasons; validation preserves input; medical evidence is not exposed broadly | Core requests implemented; balances/policies and sensitive medical workflow partial |
| Messages/updates | Real persisted replies; announcement detail opens; unread status remains coherent after delayed refresh | Implemented/tested; device acceptance |
| Notifications | One-time setup; explicit permission; correct current-account subscription; meaningful destination; generic lock-screen text | Implemented/tested; real push delivery open |
| Account switch/logout | No old-account actions continue under the next account; unsent evidence is not silently erased; browser push cleanup attempted | Regression coverage; shared-device acceptance |

## Manager acceptance flows

| Flow | Acceptance criteria | Current position |
| --- | --- | --- |
| Create company | Own details/logo, private workspace, clear first employee invitation; no default company identity copied to unrelated companies | Implemented/tested; onboarding journey acceptance |
| Overview | Useful actual counts, approved leave and exceptions; missing check-in is not labelled confirmed absence | Implemented; expectation-aware attendance partial |
| Employees | Search/filter, meaningful profile, role/department, approval and recovery; no cross-company visibility | Core implemented/tested; granular authority partial |
| Jobs/calendar | Date, purpose, optional crew and verified destination; changes appear on worker side; distinct from attendance | Implemented/tested; two-device acceptance |
| Task board | Status changes, assigned people and comments persist; failed writes recover rather than pretending success | Implemented/tested; keyboard/touch journey acceptance |
| Map | Office/job/worker distinctions, freshness, uncertainty and off-site labels; lunch/off-duty never shown as live work | Core implemented/tested; physical GPS acceptance |
| Review requests/hours | Review and read receipts are separate; original evidence remains; approved hours distinct from recorded hours | Implemented/tested; overnight approval incomplete |
| Incidents/documents | Targets and evidence stay company-scoped; upload errors are recoverable; incidents never silently rewrite hours | Structured workflow implemented; real upload journey acceptance |
| Reports | Correct dates/timezone and approved-versus-recorded labels; export matches authorized records; empty periods explained | Core implemented/tested; production reconciliation acceptance |
| Administration | Settings disclose impact; protected operations authorized by backend; sensitive exports and changes retain traceability | Core implemented; granular HR permissions partial |

## Shared UI and accessibility acceptance

These require a screen-by-screen review, not merely a successful build.

- [ ] Use one typography, spacing, surface, radius, icon and status vocabulary.
- [ ] Prioritize the main task; avoid redundant cards and decorative charts.
- [ ] Show loading, success, failure and disabled reasons for consequential actions.
- [ ] Preserve entered information after validation/network failures and avoid
  dismissing forms during background refresh.
- [ ] Every empty list explains whether it is empty, filtered, unavailable or offline.
- [ ] Keyboard focus is visible; dialogs label themselves, trap focus appropriately,
  dismiss predictably and return focus to the trigger.
- [ ] VoiceOver/TalkBack order and names match visible controls and status changes.
- [ ] Critical tasks work with large text, reduced motion, keyboard and touch.
- [ ] Verify contrast against WCAG 2.2 AA; status is never communicated only by color.
- [ ] Target comfortable 44–48 CSS-pixel touch areas where practical; assess web
  target-size exceptions separately rather than equating CSS pixels with native points.
- [ ] Check narrow phones, landscape, manager desktop, safe areas and open keyboards.
- [ ] No accidental horizontal scrolling, hidden primary actions or clipped critical text.
- [ ] Deep links and Back preserve context without discarding unsaved work.
- [ ] Use familiar names: workday, job, company registration code and personal login
  code. Do not revive the removed activation or manager-assigned-shift flow.
- [ ] Explain Namibia search coverage and verified-pin fallback; do not invent coordinates.

## Engineering and operational release gates

| Gate | Required proof | Current position |
| --- | --- | --- |
| Tenant/role isolation | Negative database/API tests for reads, writes, attachments and subscriptions | Automated coverage; independent review still useful |
| Evidence integrity | Concurrent actions, duplicate IDs, changed payloads, offline replay and locked periods | Automated coverage |
| Overnight attendance | Explicit finish date, active workday selection, review, jobs, reports and privacy across midnight | Open release blocker for overnight event crews |
| Connectivity | Real phone: disconnect, reconnect, cold reopen, denied GPS, stalled requests and account switch | Device acceptance open; offline cold startup/first check-in unsupported |
| Push | Installed iPhone/Android delivery, denied permission, expired endpoint, shared account/device and tap destination | Device acceptance open |
| Performance | Measure startup, request latency, scrolling and realistic concurrent-company/GPS load | Not established; full-snapshot location refresh remains |
| Recovery | Verify retention/PITR entitlement and restore DB plus uploaded evidence into a separate project | Open; no production restore test |
| Monitoring | Availability/errors, provisioning and queue failures alert a responsible operator without sensitive payloads | Operational acceptance open |
| Auth/privacy policy | Leaked-password protection, account recovery, retention, export/deletion and permission disclosure reviewed | Partial; published policy and operator decisions require verification |
| Dependencies/CI | Both builds/types, tests, lint and dependency audit; no frontend server secrets | Checks exist; warnings are not silently waived |

The latest reliability pass recorded 113 frontend tests, 28 database tests, five
additional tenancy/integrity tests and 40 calculation tests passing. Both apps
built, with zero lint errors and 19 warnings. These are dated engineering results,
not proof that the open release gates above have been completed.

## Work order

1. Finish and measure one complete worker journey: company enrollment, approval,
   clock-in, job travel, break, return and clock-out, observed from the manager app.
2. Resolve overnight attendance coherently before promising overnight event crews
   can use it. Use `overnight-design.md`; do not split or alter actual evidence as a shortcut.
3. Complete mobile accessibility, keyboard, denied-permission and connection-loss
   acceptance; record device/browser/version, steps, result and any remaining defect.
4. Complete real push, recovery, monitoring and load gates before unrestricted rollout.
5. Refine consistent microcopy, empty states, spacing and navigation around verified
   workflow problems. Preserve the established visual direction unless a change is requested.
6. Consider optional automation, AI or native capabilities only after core workflows
   are reliable and a concrete user need is established.

For each future change, record its affected flow, invariant, failure/recovery state,
accessibility impact, evidence and unresolved limits. Add a focused regression test
when behavior or risk warrants it; do not add implementation-mirroring tests for
cosmetic edits. Screenshots alone do not close a functional release gate.
