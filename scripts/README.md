`local-api.mjs` supplies the development-only PostgreSQL adapter and local password/session endpoints. Vite loads it only during development. The deployed application talks directly to Supabase Auth and the scoped SQL RPCs.

`database.test.mjs` runs the migration in a fresh in-memory PostgreSQL database. Fixtures never touch the local working database or a hosted project.
