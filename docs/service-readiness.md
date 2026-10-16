# Service readiness · 16 October 2026

## Verified on the hosted system

- Worker and manager HTTPS pages and their JavaScript assets respond successfully.
- Worker-access rejects GET, the report dispatcher rejects unauthenticated POST,
  and the REST gateway rejects requests without an API key. These are availability
  and basic boundary checks, not proof of authenticated workflows or database health.
- GPS expiry, push delivery and report interpretation cron schedules are active.
  No failed cron executions were recorded in the preceding 24 hours at inspection.
- Two active push subscriptions exist and two deliveries are recorded as sent.
  This means the push service accepted delivery, not that a phone displayed it.
- OpenAI's pinned report model passed a synthetic structured-output call.
  No historical incident reports have been queued or sent by the new processor.
- The report-summary API uses the existing public invoker/private validated
  implementation pattern. Company and role isolation tests still pass.

## Availability monitoring

`Production availability` in GitHub Actions checks the public pages, JavaScript
assets and rejection behavior every 15 minutes, with manual dispatch available.
**Activation blocked:** the first hosted run and the verification workflow were
rejected before any steps ran: "The job was not started because your account is
locked due to a billing issue." The same availability script passed locally.
Resolve the GitHub account billing restriction, then rerun and confirm a successful
Actions run before relying on scheduled checks. No billing settings were changed.
It uses no credentials, reads no employee records and performs no mutations.
GitHub may delay schedules; this is basic pilot monitoring, not a guaranteed
incident response service. Failure notifications depend on the repository owner's
GitHub Actions notification preferences. The run output is the evidence.

Runtime frontend exception collection is not configured as a production service.
The existing Lovable preview hook is not a replacement. No private snapshots,
access codes, GPS points, message bodies or incident descriptions should be sent
to a future error tracker. A tracker account/project and approved retention are
still needed before adding an external collector.

## Email delivery remains a launch requirement

The owner has no sending domain or dedicated email-provider account yet.
No custom SMTP provider was configured in this pass. The current manager reset
flow uses Supabase Auth; receiving a test reset does not prove production delivery
capacity or delivery to arbitrary customer addresses. Confirm the current Auth
sender settings in the dashboard. Remote config inspection was unavailable here.

Before broad onboarding, register a domain, verify its sending DNS with a provider,
configure that provider's SMTP credentials in Supabase Auth, then test password
reset on the hosted origin with legitimate mailboxes. Never commit SMTP passwords
or put them in VITE variables. Worker access codes do not require email or SMS.

## Backups remain unverified

The Supabase backup listing returned `backups: null`, an empty physical-backup
metadata object, and `pitr_enabled: false`. This does not establish a usable
backup, retention period or recovery guarantee. No restoration was attempted and
no live company records were overwritten. No paid add-on or new project was
created. Verify plan/backup entitlement in the dashboard and select a recovery
budget before a separate-project restore drill. Database backups do not include
the actual private Storage file contents; files need their own recovery plan.

## Remaining acceptance

On a real iPhone Home Screen install and Android install, enable notifications,
receive a legitimate work update, then verify lunch, clock-out and planned-finish
GPS privacy. Test offline replay and an overnight workday. Confirm Mapbox permanent
geocoding storage entitlement in the Mapbox account; a successful token does not
prove contractual storage rights. Native background GPS remains unsupported.

Supabase still reports leaked-password protection disabled and the known pg_net
public-extension notice. Confirm plan support before enabling leaked-password
checks; the network extension's execution privileges remain restricted to backend
roles. Neither notice is resolved by adding another frontend service.

This system is suitable for controlled pilot verification, not an unrestricted
production-readiness certification.
