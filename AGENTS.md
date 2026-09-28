# AGENTS.md

## Cursor Cloud specific instructions

FILA LSL is a single Next.js 15 (App Router) + TypeScript PWA for truck check-in and
unloading-queue management. Its backend (Postgres + Auth + Realtime) is **Supabase**.
There is only one runnable service: the Next.js app. Everything else lives in Supabase.

Standard commands are in `package.json` (`npm run dev`, `npm run build`, `npm run lint`).
The dependency-install step (`npm ci`) runs automatically via the startup update script.

### Local Supabase is required for a working app
The repo targets a hosted Supabase project, but for local dev/testing a **local Supabase
stack** (Docker) is used. Docker and the Supabase CLI are NOT part of the update script and
are not preinstalled on a fresh VM — install/start them as needed:

1. Docker: install Docker CE, set `/etc/docker/daemon.json` to `{"storage-driver":"fuse-overlayfs"}`,
   switch to `iptables-legacy`/`ip6tables-legacy`, then run `sudo dockerd` (keep it running,
   e.g. in a tmux session). Give the `ubuntu` user socket access with `sudo chmod 666 /var/run/docker.sock`.
2. Supabase CLI: install the release tarball into a single directory and keep both `supabase`
   and its co-located `supabase-go` binary on `PATH` (the CLI is a shim that forwards to
   `supabase-go`; extracting only `supabase` fails at runtime).
3. From the repo root run `supabase start`. This prints the local `API_URL`
   (`http://127.0.0.1:54321`), `ANON_KEY`, and `SERVICE_ROLE_KEY`.

### Applying the database schema (gotchas)
The SQL under `supabase/` is written for the hosted Supabase SQL Editor, not `supabase db`.
Apply it manually against the local DB (`docker exec -i supabase_db_workspace psql -U postgres -d postgres < FILE`),
in the order from `supabase/INSTALAR-APP.md`, then the extra migrations
(`migracao-previsao`, `migracao-minuta-inteligente`, `migracao-closed-by`,
`migracao-fila-ativa-persistente`, `migracao-seguranca-performance`), then `fix-roles-teste.sql`.

- Do NOT run these files inside a single transaction — several add an enum value and use it
  in the same file, which Postgres rejects inside one transaction. Run each file with plain
  autocommit `psql` (no `--single-transaction`).
- `migracao-rpc-fila.sql` errors with "cannot change return type of existing function"; this is
  harmless because `migracao-previsao.sql` / `migracao-fila-ativa-persistente.sql` recreate that
  function afterwards.
- **Table privileges are NOT auto-granted** when you apply SQL via `psql` as `postgres`
  (the hosted SQL Editor grants them for you). After loading the schema you MUST run:
  `GRANT ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;`
  plus matching `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public`. Without this the app gets
  "permission denied for table queue_entries".

### Test accounts / auth
Create the test users via the Auth admin API (`POST $API_URL/auth/v1/admin/users` with the
service-role key and `"email_confirm": true`). The `handle_new_user` trigger assigns roles by
email, so these get the right roles automatically:
`motorista@lsl.com / Motorista@2024`, `empilhador@lsl.com / Empilhador@2024`,
`admin@lsl.com / Admin@2024`.

- Staff login (`/login`) uses **email + password** and works locally.
- Driver login (`/login/motorista`) is **Google/Apple OAuth only** — not usable locally
  without configuring an OAuth provider. To exercise the driver check-in path locally, obtain
  a motorista access token via password grant and drive the REST/queue APIs directly.

### `.env.local`
Point it at the local stack: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `supabase start`,
`NEXT_PUBLIC_APP_URL=http://localhost:3000`. For local testing also set
`NEXT_PUBLIC_SKIP_GEOFENCE=true` and `NEXT_PUBLIC_SKIP_CHECKIN_LIMITS=true` so check-in isn't
blocked by GPS geofence / cooldown rules. `.env.local` is gitignored.

### Notes
- `next lint` is deprecated (Next 16) but still works; a couple of unused-var warnings in
  `src/lib/motorista-routing.ts` are pre-existing and non-blocking.
- The local Supabase stack does not survive a VM restart; re-run `supabase start` and note the
  DB schema/data are re-created empty (re-apply the SQL + recreate users when needed).
