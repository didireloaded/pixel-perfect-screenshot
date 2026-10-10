# Shiftline worker app

This directory uses the supplied `shiftline-ios-app-design (1).zip` visual design as a phone-sized web app. It is not a React Native or Expo binary. The existing Shiftline web and mobile apps remain in their original directories.

Run `npm install` and `npm run dev -- --host 127.0.0.1 --port 8083` from this directory. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an ignored `.env.local`. Authentication, email sign-up, password reset, session restoration, and employee activation use the existing Supabase project. Email confirmation must be completed before activation. The manager app in the repository root can run on port 8084; both apps use the same Supabase project.

The five main tabs now read `sl_snapshot()` and write through `sl_command()`. Clock-in/out, lunch, job departures, personal departures, requests, timesheet submission, task progress, message reads, notice acknowledgement and worksite checks use the existing server permissions and calculations. Data refreshes when the app becomes visible and every 15 seconds while visible. A server-confirmed response is required before showing an action as saved. Browser attendance actions require a connection; the separate Expo client contains the durable offline queue.

Worksite checks require the worker to enable them. The preference persists for their account and automatically starts on later shifts while the browser is foregrounded and the worker is actively working. Checks stop when work ends, when the shift tracking deadline arrives, or when the worker turns them off. The server records exit/return alerts, not a location route. Clock-in asks for one GPS stamp when the company policy requires it.

The original sample screens and state remain in the source archive as design reference, but the authenticated app renders only live data. The first manager must create a company and invite employees through the root manager app. Native background tracking, payroll tax/deductions and payouts are outside this web app.

The archive's overtime calculator and its 40 tests are retained for design-reference calculations. The live hours screen uses server-calculated totals and manager-approved overtime.
