# Shiftline native UI demo

This is a separate, mock-data-only Expo Router app. The working attendance client remains in `../mobile`. Clock, departure, correction, and request actions in this demo only update local presentation or show a clear demo alert; they do not save records.

Run `npm ci`, then `npm start`. Use `npm run ios` with Xcode Simulator or scan the Expo QR code. `npm run typecheck` and `npm run export` verify source and bundling. Native layout and gestures still require device or simulator review at 375pt and 430pt widths before release.
