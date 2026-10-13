# ChatGPT Sites hosting

The worker app is hosted at `/`; the manager app is at `/manager`.
Both use the existing Supabase backend and keep separate app sessions.
The Site audience is public, so ChatGPT sign-in is not required. Shiftline
authentication and company permissions remain enforced.

Build from the repository root with the configured public Supabase and Mapbox
environment values:

```sh
npm run build
npm --prefix worker-ui run build -- --base=/worker/
node scripts/assemble-sites.mjs
```

The assembler creates the ignored `dist/` deployment artifact, including the
hosting manifest, Nitro manager server, worker entrypoint and both apps' assets.
It verifies the worker asset base before replacing this artifact. The Sites
source workflow must push matching source, package the artifact, then save and
deploy that exact version. Reuse the project ID in `.openai/hosting.json`.
The publishing checkout under `sites/shiftline` is a separate Sites-managed Git
repository; do not overwrite this repository's GitHub remote with its credentials.

Never commit environment files, source credentials, VAPID private keys, service
keys, employee records or compiled bundles. Notification secrets remain in
Supabase Vault. Sites controls final CDN cache headers; the wrapper and asset
headers request fresh HTML and long-lived caching for versioned assets.

Live worker app: https://shiftline-workforce.didireloaded.chatgpt.site/

Live manager app: https://shiftline-workforce.didireloaded.chatgpt.site/manager
