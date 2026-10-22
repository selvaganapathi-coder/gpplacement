# Deploy on Vercel (UI + API in one project, no external database)

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `.` (repo root) |
| Install / Build / Output | from `vercel.json` (`npm ci` in frontend + backend, `npm run vercel:build`, `frontend/dist`) |
| Node.js | 20.x or 22.x |

* `api/index.js` runs the Express API (`backend/`) as one Vercel Function; `/api/*` is rewritten to it, everything else falls back to the SPA.
* The build seeds a SQLite demo database (`backend/scripts/build-demo-db.cjs`). It is copied to `/tmp` on cold start, so changes reset when the function instance recycles. Set `DATABASE_URL` to Postgres for persistent data.
* Env vars: `JWT_SECRET` (32+ random chars), `SEED_FORCE_PASSWORD_CHANGE=false`, `ALLOW_DEMO_SEED=true`, `ALLOW_DEMO_SEED_PASSWORD=true`, `SESSION_HOURS=8`, optional `VITE_SHOW_DEMO_LOGIN=true` (demo role buttons on the login page). `CLIENT_ORIGIN` defaults to the deployment URL. Do **not** set `NODE_ENV` (devDependencies are needed for the build).
* Demo logins: see `docs/ALL_LOGINS.md` (password `changeme123`) — public demo only; change before real use.
