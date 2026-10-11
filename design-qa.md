# Shiftline manager operational demo QA — 2026-10-11

Final result: blocked (reference-image fidelity comparison only)
Functional manager demo verification: passed.

## Scope and evidence
Preserved the purple manager shell while replacing generic unauthenticated preview rows with an interactive, browser-persisted demo. Shared live components now include the overview, month/week calendar, task movement, checklist editing and comments. No claim of hosted end-to-end operation.

Evidence in `../shiftline-overhaul/`:
- `manager-overview-functional.png`: final desktop overview at 1440 × 1000.
- `manager-tasks-tablet.png`: task board at 768 × 1024.
- Earlier worker/manager captures remain available; worker visual QA was not repeated in this manager-only iteration.

## Browser verification
Verified task creation with two assigned workers and a location; task appears in month calendar. Verified task status selection moves a card between columns and updates counts, comment posting, checklist creation and completion, note creation, manager messages, simulated worker replies, request approval with required explanation, past attendance report, supervised lunch and clock-out, and hidden map presence while on lunch. Changes survive reload. Reset demo restores clean presentation records.

Viewed desktop overview/month calendar, tablet task board, and 430px mobile board/navigation. Mobile board intentionally scrolls horizontally. The OpenStreetMap embed rendered its map and zoom controls.

Found and fixed an offscreen task drawer: shared centered-dialog translate utilities conflicted with right-drawer positioning. Used existing Tailwind class merging to override both translation utilities. Confirmed drawer top at zero and checkbox interaction succeeding after the fix. Added month-cell alignment, explicit lunch minutes, purple progress styling and report-day navigation.

## Code and database proof
Main TypeScript and focused manager ESLint passed. Production build passed; existing bundle-size advisory remains. Seven database tests passed, including new manager-only task status, company isolation, invalid status, stale-update rejection and no attendance-event fabrication. `git diff --check` passed.

## Remaining limits
Original reference `/Users/visionhaus/Desktop/file (1).webp` is no longer available at its supplied path, so a final pixel comparison cannot be completed. The functionality/layout checks above are not a reference-fidelity pass.
Demo changes are labelled, sample-only, persisted locally and not transmitted to Supabase or worker accounts. Map markers describe configured example worksites, not actual employee GPS. Production job-site GPS tracking remains outside the verified demo. The hosted task-status migration is now applied; shared backend SQL smoke tests passed on 11 October 2026. See docs/backend.md for the current verification. Browser logs include a transient Vite reload error from an intermediate edit; final source compiles and reloads successfully.

## Preview
http://127.0.0.1:8084/manager
