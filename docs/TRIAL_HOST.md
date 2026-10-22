# 10-day trial host (Render)

Public HTTPS trial of the Placement & Aptitude Portal: one **Web Service** (UI + API) and **Postgres**.

## Before you start

1. Push this repo to **GitHub**.
2. Create a [Render](https://render.com) account.
3. Use a **non-sleeping** plan during live exams (Blueprint uses `starter` web + `basic-256mb` Postgres). Free web instances sleep and will break timed tests.

## Deploy (Blueprint)

1. In Render: **New → Blueprint**.
2. Connect the GitHub repo that contains [`render.yaml`](../render.yaml).
3. Apply the blueprint. Wait until the web service is **Live**.
4. Open the service URL: `https://<name>.onrender.com`.
5. Health check: `https://<name>.onrender.com/api/health` → `{"ok":true,...}`.

On first boot the container runs `prisma db push` and seeds demo users (`SEED_ON_START=true` + `ALLOW_DEMO_SEED=true`).

## Demo logins (after seed)

| Role | Email | Password |
|------|--------|----------|
| Admin | `admin@gppharmacy.edu` | `changeme123` |
| Staff | `staff@gppharmacy.edu` | `changeme123` |
| Student | `student@gppharmacy.edu` | `changeme123` |

Trial blueprint sets `ALLOW_DEMO_SEED_PASSWORD=true` and `SEED_FORCE_PASSWORD_CHANGE=true`: you can sign in with the demo password, then **must set a real password** before using the app. Do not use this pattern on a live college database — leave both `ALLOW_DEMO_*` flags unset and do not seed demos.

## Environment (set by Blueprint)

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | From Render Postgres |
| `JWT_SECRET` | Auto-generated (32+ chars) |
| `NODE_ENV` | `production` (secure cookies) |
| `RENDER_EXTERNAL_URL` | Injected by Render; used as cookie/CORS origin |
| `SEED_ON_START` | `true` — seed on each deploy start (safe upserts) |
| `ALLOW_DEMO_SEED` | `true` — required for production demo seed (trial only) |
| `ALLOW_DEMO_SEED_PASSWORD` | `true` — trial only; real production must omit this |
| `SEED_FORCE_PASSWORD_CHANGE` | `true` — demo password cannot stay as the lasting credential |
| `SESSION_HOURS` | `2` — idle sign-out |

Optional: set `CLIENT_ORIGIN` explicitly to `https://<name>.onrender.com` if CORS ever rejects the browser origin.

## Smoke test (15 minutes)

1. Admin login → **People** — confirm users exist.
2. Staff login → create/publish a short test with an **exam end time**.
3. Student login → take the test → submit.
4. Wait for auto-release (or publish results early) → student sees score on Home.
5. Sign in on a second browser with the same user → first session should be signed out (single session).

## Local Postgres (optional — same provider as Render)

For local SQLite (default in this repo), keep `provider = "sqlite"` and `DATABASE_URL="file:./dev.db"`.

To match Render with Postgres:

1. Set `provider = "postgresql"` in `prisma/schema.prisma`
2. `docker compose up -d`
3. Set `DATABASE_URL` as in `.env.postgres.example`
4. `npm run db:push` && `npm run db:seed` && `npm run dev`

Do not point a **postgresql** schema at a SQLite `file:` URL (login will fail).

## Day 10 — tear down

1. Render Dashboard → delete **placement-portal** web service.
2. Delete the **placement** Postgres database.
3. Confirm billing shows no further charges.

Export data first if you need it: use Render’s Postgres shell / `pg_dump`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Prisma | Ensure `DATABASE_URL` exists at runtime; build uses a dummy URL only for `generate`. |
| `JWT_SECRET` error on boot | Secret must be 32+ chars and must not contain `dev-` or `change`. Regenerate in Render env. |
| Blank page / 404 on refresh | Confirm Docker image includes `dist/` and Express static SPA fallback. |
| Cannot log in | Check `/api/health`; re-deploy so seed runs; confirm email/password from table above. |
| Service sleeps mid-exam | Upgrade off free/sleeping plan for the trial window. |

## What this does not include

- Custom college domain (add later under Render → Settings → Custom Domains)
- Migrating your existing local SQLite `dev.db` (trial DB is freshly seeded)
- Email notifications
