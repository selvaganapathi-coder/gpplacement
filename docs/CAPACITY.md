# Capacity & load balancing (~1000 concurrent users)

Campus exam waves can push **~1000 students** signing in and autosaving at once. Local **SQLite + single `npm run dev`** is for demos only.

## Quick overall check

With the API running:

```bash
curl http://127.0.0.1:3001/api/capacity
curl http://127.0.0.1:3001/api/ready
curl http://127.0.0.1:3001/api/health
```

| Endpoint | Use |
|----------|-----|
| `/api/health` | Liveness (DB ping) — Docker / LB health |
| `/api/ready` | Readiness — returns **503** if capacity status is `fail` |
| `/api/capacity` | **Overall** report from `.env` (engine, replicas, rate limits, guidance) |

Boot also prints `[capacity] OK|WARN|FAIL …` in the API log.

## Required for 1000 users

1. **PostgreSQL** (not SQLite) — set `DATABASE_URL=postgresql://…` and `provider = "postgresql"` in `backend/prisma/schema.prisma`.
2. **2+ API processes** behind a load balancer (`API_REPLICAS=2`).
3. **`TRUST_PROXY=1`** so rate limits see real client IPs behind Nginx/Render.
4. Strong **`JWT_SECRET`** (32+) and exact **`CLIENT_ORIGIN`**.

## `.env` knobs (overall)

Copy from `backend/.env.example` — capacity section:

| Variable | Default | Meaning |
|----------|---------|---------|
| `EXPECTED_CONCURRENT_USERS` | `1000` | Target examinees — drives capacity WARN/FAIL |
| `API_REPLICAS` | `1` | How many API processes behind the LB |
| `INSTANCE_ID` | hostname | Label in `/api/capacity` (e.g. `api1`) |
| `TRUST_PROXY` | prod=`1` | Trust `X-Forwarded-*` from Nginx/Render |
| `DB_POOL_SIZE` | `20` | Prisma `connection_limit` per API process |
| `RATE_LIMIT_GLOBAL_PER_MIN` | `600` | Per-user API ceiling |
| `RATE_LIMIT_AUTOSAVE_PER_MIN` | `90` | Exam answer autosave |
| `RATE_LIMIT_SUBMIT_PER_MIN` | `30` | Submit attempts |
| `RATE_LIMIT_LOGIN_PER_15MIN` | `120` | Login attempts per IP |

Rate limits are keyed by **user id** when signed in (shared college lab IP does not block everyone).

## Docker load-balanced stack

From the repo root (after switching Prisma to `postgresql`):

```bash
docker compose up --build
curl http://localhost/api/capacity
```

Services: **Postgres** · **api1** · **api2** · **Nginx** (`deploy/nginx.conf`, least-conn).

UI can stay on Netlify / Vite; point `VITE_API_URL` (or proxy) at `http://localhost` (or your LB HTTPS host).

## Render / production

- Use **Postgres** (Blueprint already does).
- Scale the web service to **2+ instances** when expecting a full exam wave; set `API_REPLICAS` to match.
- Set `TRUST_PROXY=1`, `EXPECTED_CONCURRENT_USERS=1000`, `DB_POOL_SIZE=15` (keep `pool × replicas` under Postgres `max_connections`).

## What SQLite will report

With `EXPECTED_CONCURRENT_USERS=1000` and `file:./dev.db`, `/api/capacity` returns **fail** for `database_engine` — that is intentional. Use Postgres before exam day.
