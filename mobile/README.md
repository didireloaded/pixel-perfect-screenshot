# Shiftline native app

From this directory, run `npm ci`, copy `.env.example` to `.env`, and set the dedicated Supabase URL and publishable key. Apply both root migrations first. Run `npm run ios` or `npm run android` with the corresponding native toolchain, then `npm start`.

Use a native development build for background task and notification verification. Background sync is opportunistic: the OS chooses execution time. The app saves every attendance intent to SQLite before displaying local success; it only displays confirmed sync after a server response. A review conflict blocks dependent submissions and preserves all records.

Accounts use Supabase Auth, employee number and one-time activation code. Manager setup and approvals are in the web application. SecureStore holds session credentials; SQLite records and caches are scoped to the signed-in account. Geolocation is a foreground clock-in stamp only. No location watcher runs after duty.

Run `npm run typecheck`. To verify bundling, run `npx expo export --platform ios --platform android --output-dir .mobile-build`. Bundling is not proof of native hardware behavior. Before release, test airplane-mode capture, restart recovery, retries, account switching, manager conflict approval, permission denial and background scheduling on physical devices.

Device registration supports personal/kiosk records; this app is the personal employee client. Kiosk PIN/QR, continuous geofence monitoring and remote push delivery remain unimplemented. See root SETUP.md for cloud and dependency limitations.
