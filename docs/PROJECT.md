# GP Pharmacy Placement Portal — Overall Project Documentation

**Product:** College Assessment & Placement Aptitude Portal  
**College:** G.P. Pharmacy College  
**Repo root:** `placement/`  
**Version:** 0.2.x

This document is the **single overview** of the whole system: what it does, how it is built, how to run it, how roles work, and where deeper docs live.

---

## 1. Purpose

A web portal for **timed MCQ / placement assessments**:

| Role | Responsibility |
|------|----------------|
| **Admin** | Users, class links, assessments, results, settings, audit |
| **Staff** | Department-scoped papers, publish, results desk, students, analytics |
| **Student** | Take exams, see released scores, leaderboard, practice |

Audience is keyed by **program** (D.Pharm / B.Pharm / M.Pharm / Pharm.D), **year**, and **section (A/B)**.

---

## 2. Documentation map

| Document | Contents |
|----------|----------|
| **[PROJECT.md](PROJECT.md)** (this file) | Overall architecture, flows, ops |
| [CLIENT_DEMO.md](CLIENT_DEMO.md) | Stakeholder demo walkthrough |
| [ALL_LOGINS.md](ALL_LOGINS.md) | Every seeded email / password |
| [PERMISSION_MATRIX.md](PERMISSION_MATRIX.md) | API permission codes by role |
| [CAPACITY.md](CAPACITY.md) | ~1000 concurrent users, LB, `/api/capacity` |
| [NETLIFY.md](NETLIFY.md) | Frontend host + `VITE_API_URL` |
| [TRIAL_HOST.md](TRIAL_HOST.md) | Render API + Postgres trial |
| [GET_PUBLIC_LINK.md](GET_PUBLIC_LINK.md) | Sharing a public/trial URL |
| Root [README.md](../README.md) | Quick start, commands, security summary |

---

## 3. High-level architecture

```
┌─────────────────────┐         HTTPS / cookies          ┌──────────────────────┐
│  Frontend (Vite)    │ ───────────────────────────────► │  Backend (Express)   │
│  React + React Router│ ◄─────────────────────────────── │  Prisma ORM          │
│  Netlify or :5173   │         /api/*                   │  :3001 or Render     │
└─────────────────────┘                                  └──────────┬───────────┘
                                                                    │
                                                         ┌──────────▼───────────┐
                                                         │  SQLite (local) or   │
                                                         │  PostgreSQL (prod)   │
                                                         └──────────────────────┘
```

**Exam-day scale (optional):**

```
Browsers → Nginx (least_conn) → api1 + api2 → PostgreSQL
```

See `docker-compose.yml`, `deploy/nginx.conf`, and [CAPACITY.md](CAPACITY.md).

### Stack

| Layer | Technology |
|-------|------------|
| UI | React 18, Vite, TypeScript, Tailwind, React Router |
| API | Express 4/5, TypeScript (`tsx` in dev) |
| Data | Prisma · SQLite (dev) · PostgreSQL (prod / LB) |
| Auth | HttpOnly cookies · short JWT access + opaque refresh |
| Host | Netlify (UI) · Render / Docker (API + DB) |

---

## 4. Repository layout

```
placement/
├── frontend/                 # Vite React app
│   ├── src/pages/            # Role dashboards & exam UI
│   ├── src/components/       # Forms, shell, results, banks
│   ├── src/context/          # AuthContext
│   ├── src/services/         # authApi, http client
│   └── vite.config.ts        # Dev proxy /api → :3001
├── backend/
│   ├── server/               # Express app & domain modules
│   │   ├── index.ts          # Main API (large route surface)
│   │   ├── routes/           # auth, health, …
│   │   ├── capacity.ts       # Exam-day .env capacity checks
│   │   ├── rateLimit.ts      # Per-user / IP limiters
│   │   ├── sessions.ts       # Refresh sessions
│   │   └── prisma.ts         # DB client + SQLite WAL / PG pool
│   ├── prisma/               # schema.prisma, seed scripts
│   ├── shared/               # Shared TS (assessment types, taxonomy)
│   ├── Dockerfile
│   └── .env.example
├── deploy/nginx.conf         # Load balancer config
├── docker-compose.yml        # Postgres + 2 APIs + Nginx
├── docs/                     # All project documentation
├── netlify/                  # Optional serverless API adapter
├── netlify.toml
└── package.json              # Root: concurrently runs UI + API
```

> Note: older README snippets that show `prisma/` and `src/` at the **repo root** refer to the split under `backend/` and `frontend/` today.

---

## 5. Runtime URLs (local)

| Service | URL |
|---------|-----|
| Sign-in UI | http://localhost:5173/login |
| API | http://127.0.0.1:3001 |
| Health (liveness) | http://127.0.0.1:3001/api/health |
| Ready (capacity gate) | http://127.0.0.1:3001/api/ready |
| Capacity (overall check) | http://127.0.0.1:3001/api/capacity |

Dev: Vite **proxies** `/api` → `http://127.0.0.1:3001`.

---

## 6. Quick start

**Requirements:** Node.js 18+, npm.

```bash
cd placement
npm run install:all
copy backend\.env.example backend\.env    # Windows
cd backend
npm run db:push
npm run db:seed
cd ..
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + UI together |
| `npm run build` | Production UI + compiled server |
| `npm run db:push` / `db:seed` | Schema + demo data (from `backend/`) |

Default demo password: `changeme123` (local with `SEED_FORCE_PASSWORD_CHANGE=false`).

| Role | Example login |
|------|----------------|
| Admin | `admin@gppharmacy.edu` |
| Staff (dept) | `staff.dpharm@gppharmacy.edu` · `staff.bpharm@…` · `staff.mpharm@…` · `staff.pharmd@…` |
| Student (dept) | `student.dpharm@…` · `student.bpharm@…` · etc. |

Full list: [ALL_LOGINS.md](ALL_LOGINS.md).

---

## 7. Core business flows

### 7.1 Assessment lifecycle

```
Draft  →  Publish (staff/admin)  →  Students take exam  →  Submit / auto-submit
                                                              ↓
                                                    Results PENDING
                                                              ↓
                                              Release results (staff/admin)
                                                              ↓
                                                    Students see scores
```

- **Publish test** ≠ **release results** (two steps).
- Server timer (`attempt.endsAt`) is authoritative; autosave stores answers only.
- Student payloads never include answer keys; scoring is server-side.

### 7.2 Department scope (staff)

- Department staff (e.g. `staff.bpharm@…`) manage **whole program**.
- Class staff (e.g. `staff.bpharm.y1.a.1@…`) manage **year + section**.
- Object-level checks after permissions — see [PERMISSION_MATRIX.md](PERMISSION_MATRIX.md).

### 7.3 Student eligibility

A student sees a test when:

1. Test is **published**,
2. Schedule window is open (if set),
3. Audience matches **program / year / section** (or “all students”).

---

## 8. Frontend modules (by role)

| Area | Path prefix | Main pages |
|------|-------------|------------|
| Auth | `/login`, `/forgot-password`, `/reset-password` | Login (dev demo chips), password reset |
| Admin | `/dashboard/admin/*` | Home, People, Assessments, Results, Banks, Settings |
| Staff | `/dashboard/staff/*` | Home, Assessments, Banks, Results desk, Students, Analytics |
| Student | `/dashboard/student/*` | Home, My assessments, Take test, Results, Leaderboard, Practice |

Shell: `DashboardShell` + `dashboardNav.ts` sidebars.

---

## 9. Backend modules

| Module | Role |
|--------|------|
| `routes/authRoutes.ts` | Login, 2FA, sessions, password reset/change |
| `routes/health.ts` | `/api/health`, `/api/ready`, `/api/capacity` |
| `sessions.ts` | Refresh tokens, multi-device (staff/admin), student single-session |
| `attemptLifecycle.ts` / `finalizeAttempt.ts` | Start, autosave, submit, grade |
| `testPermissions.ts` / `staffVisibility.ts` | Who can see/edit which papers & students |
| `questionBankRoutes.ts` | Master banks & blueprints |
| `analytics.ts` / `leaderboard.ts` | Insights & ranks |
| `rateLimit.ts` + `capacity.ts` | Throughput & exam-day readiness |
| `audit.ts` | Security / ops audit log |

---

## 10. Data model (summary)

Prisma schema: `backend/prisma/schema.prisma`.

Important entities:

- **User** — role, program, year, section, rollNo, 2FA, lockout, active flag  
- **Test** / questions / cohorts — audience & schedule  
- **TestAttempt** — status, answers, score, release state  
- **StaffBranchScope** / assignments — department & class links  
- **QuestionBank** / categories — reusable banks  
- **Session** / audit logs — auth & compliance  

Local DB file: `backend/prisma/dev.db` when `DATABASE_URL=file:./dev.db`.

---

## 11. Environment configuration

Primary template: `backend/.env.example`.

### Essential

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite `file:./dev.db` or `postgresql://…` |
| `JWT_SECRET` | 32+ chars in production |
| `CLIENT_ORIGIN` | Exact UI origin (HTTPS in prod; never `*`) |
| `CLIENT_ORIGINS` | Extra exact origins |
| `PORT` | API port (default `3001`) |

### Sessions & exams

| Variable | Default | Purpose |
|----------|---------|---------|
| `ACCESS_TOKEN_MINUTES` | 15 | Short JWT cookie |
| `SESSION_HOURS` | 2 | Idle / refresh lifetime |
| `SESSION_WARN_MINUTES` | 5 | UI warning before logout |
| `RESULTS_AUTO_RELEASE_MINUTES` | 30 | Auto-release after exam end |

### Capacity / load (~1000 users)

| Variable | Purpose |
|----------|---------|
| `EXPECTED_CONCURRENT_USERS` | Target; drives `/api/capacity` |
| `API_REPLICAS` | Instances behind LB |
| `TRUST_PROXY` | Trust `X-Forwarded-*` |
| `DB_POOL_SIZE` | Prisma pool per process |
| `RATE_LIMIT_*` | Per-user / IP ceilings |

Details: [CAPACITY.md](CAPACITY.md). Check overall:

```bash
curl http://127.0.0.1:3001/api/capacity
```

### Demo / trial only (never real production)

| Variable | Purpose |
|----------|---------|
| `SEED_FORCE_PASSWORD_CHANGE` | Local demos often `false` |
| `ALLOW_DEMO_SEED` | Allow seeding in production (trial) |
| `ALLOW_DEMO_SEED_PASSWORD` | Allow login with `changeme123` (trial) |

---

## 12. Security model (summary)

- Passwords: **bcrypt**; strong policy; demo password blocked in real prod  
- Auth: **HttpOnly** cookies only (no JWT in localStorage)  
- IDOR: attempt APIs require ownership / cohort; staff department-scoped  
- Permissions: explicit codes — [PERMISSION_MATRIX.md](PERMISSION_MATRIX.md)  
- Rate limits: global + login + autosave + submit + sensitive ops  
- Helmet CSP / nosniff / frame deny / HSTS (prod)  
- Audit log for admin  
- Optional admin 2FA (`REQUIRE_ADMIN_2FA`)  

Full table: root [README.md](../README.md) § Security & reliability.

---

## 13. Deployment

| Target | Doc | Notes |
|--------|-----|--------|
| UI on Netlify | [NETLIFY.md](NETLIFY.md) | Set `VITE_API_URL` to API origin |
| API + DB on Render | [TRIAL_HOST.md](TRIAL_HOST.md) | Blueprint `backend/render.yaml` |
| Docker LB + Postgres | [CAPACITY.md](CAPACITY.md) | `docker compose up --build` |
| Public trial link | [GET_PUBLIC_LINK.md](GET_PUBLIC_LINK.md) | Share with stakeholders |

Production checklist:

1. PostgreSQL (not SQLite)  
2. Strong `JWT_SECRET` + exact `CLIENT_ORIGIN`  
3. No `ALLOW_DEMO_*` on a live college DB  
4. For exam waves: 2+ API replicas, `TRUST_PROXY=1`, verify `/api/capacity`  

---

## 14. Operations cheat sheet

| Task | Action |
|------|--------|
| Start local | `npm run dev` from repo root |
| Health | `GET /api/health` |
| Capacity overall | `GET /api/capacity` |
| Re-seed demos | `cd backend && npm run db:seed` |
| Browse DB | `cd backend && npm run db:studio` |
| Port conflict | Free **3001** (wrong app often `D:\gp website`) and **5173** |
| Student no tests | Publish test + matching cohort + open window |
| Student no scores | Staff must **release results** |

---

## 15. Testing & quality

| Area | How |
|------|-----|
| Frontend unit | `frontend`: Vitest (`npm test` where configured) |
| Backend checks | `backend/server/*.check.ts` (password, IDOR, CORS, 2FA, …) |
| Load readiness | Seed helpers (`db:load-500`, verify flows) + [CAPACITY.md](CAPACITY.md) |

---

## 16. Product conventions (G.P. Pharmacy)

- Programs: **D.Pharm · B.Pharm · M.Pharm · Pharm.D**  
- Sections: **A / B**  
- Email domain: `@gppharmacy.edu`  
- Branding: `frontend` college brand helpers + admin college settings  

---

## 17. License & ownership

Private / internal use — G.P. Pharmacy placement portal.  
Not open-source unless the college decides otherwise.

---

## 18. Change log pointer

Feature history lives in git commits. For stakeholder demos, prefer [CLIENT_DEMO.md](CLIENT_DEMO.md). For capacity work, see [CAPACITY.md](CAPACITY.md).
