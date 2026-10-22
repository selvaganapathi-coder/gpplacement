# GP Pharmacy — Placement & Aptitude Portal

Web app for college placement aptitude tests: **admin** manages users and classes, **staff** publish tests and release scores, **students** take timed MCQ exams matched to degree, year, and section (A/B).

**Overall project documentation:** **[docs/PROJECT.md](docs/PROJECT.md)** · [docs index](docs/README.md)

**Client / stakeholder demo:** [docs/CLIENT_DEMO.md](docs/CLIENT_DEMO.md)  
**Full login list:** [docs/ALL_LOGINS.md](docs/ALL_LOGINS.md)

**Stack:** React (Vite) · Express API · Prisma · SQLite (local) / PostgreSQL (Render)

**Host:** UI on [Netlify](docs/NETLIFY.md) · API + DB on [Render](docs/TRIAL_HOST.md)  
**~1000 concurrent users:** [docs/CAPACITY.md](docs/CAPACITY.md) · check `GET /api/capacity` · Docker LB in `docker-compose.yml`

---

## Layout

| Folder | What |
|--------|------|
| `frontend/` | Vite + React UI (Netlify) |
| `backend/` | Express API + Prisma (Render / local `:3001`) |

## Quick start

**Requirements:** Node.js 18+ and npm.

```bash
cd placement
npm run install:all
copy backend\.env.example backend\.env   # Windows — or: cp backend/.env.example backend/.env
cd backend
npm run db:push
npm run db:seed
cd ..
npm run dev
```

| Service | URL |
|---------|-----|
| **App (login)** | http://localhost:5173 (or next free port — see terminal) |
| **API** | http://127.0.0.1:3001 |
| **Health check** | http://127.0.0.1:3001/api/health |

Vite proxies `/api` to the API in dev. If **5173** is busy, the UI may use **5174–5199** — open the `Local:` URL from the terminal.

---

## Demo logins

Full client guide (all emails + walkthrough): **[docs/CLIENT_DEMO.md](docs/CLIENT_DEMO.md)**

| Role | Email | Password |
|------|--------|----------|
| Admin | `admin@gppharmacy.edu` | `changeme123` |
| Staff | `staff@gppharmacy.edu` | `changeme123` |
| Student | `student@gppharmacy.edu` | `changeme123` |

**G.P. Pharmacy College courses:** D.Pharm · B.Pharm · M.Pharm · Pharm.D

**Bulk seeded** (pharmacy cohorts × Sec A/B):

- Staff: `staff.<course>.y<year>.<a|b>.<n>@gppharmacy.edu` — e.g. `staff.bpharm.y1.a.1@gppharmacy.edu`
- Student: `student.<course>.y<year>.<a|b>.<nn>@gppharmacy.edu` — e.g. `student.pharmd.y1.a.01@gppharmacy.edu`

Courses: `dpharm` (Y1–2) · `bpharm` (Y1–4) · `mpharm` (Y1–2) · `pharmd` (Y1–6)

With `SEED_FORCE_PASSWORD_CHANGE=false` in `backend/.env`, local demos can login without a forced password change. **Production always forces change** after any demo seed, and rejects `changeme123` unless `ALLOW_DEMO_SEED_PASSWORD=true` (trial only).

---

## How it works (by role)

### Administrator

| Tab | What you do |
|-----|-------------|
| **Students & staff** | Create/edit/delete users; strong passwords enforced on create |
| **Assign classes** | Link staff to students; branch scope or direct assignment |
| **Tests** | Create drafts (cohort or all students); bulk import questions; view **Results** / **Download CSV** for every test |

Admin creates tests; **staff** publish them and release scores to students.

**API (advanced):** `POST /api/admin/students/import` with `{ students: [{ email, name, program, levelType, level }] }` · `GET /api/admin/audit-logs`

### Staff

1. **Dashboard** — summary: draft tests, submissions awaiting result release.
2. **Publish…** — make a test visible to students (optional schedule window).
3. **View / Edit** — questions (own tests or admin tests for your class).
4. **Results** — attempts from **directly assigned** students only.
5. **Publish results to students** — unlocks scores on the student dashboard.
6. **Download CSV** — export filtered results.

### Student

1. Sees tests for **degree + semester** when staff have published them in the active window.
2. **Start test** — question and option order **shuffled** per attempt.
3. Answers **autosave**; timer **auto-submits** at 0:00 (saved answers are kept).
4. After submit: **Result pending** until staff publish results.
5. **View result** — score and question review.

---

## Bulk question import

On **New test** or **Edit test** → **Bulk import**:

| Format | Notes |
|--------|--------|
| **Excel / CSV** | Columns: `Question`, `Option A`–`D`, `Correct` (A/B/C/D, 1–4, or exact option text). Max 2 MB / 500 questions / 4 options; content validated (not just extension). |
| **JSON** | Download [sample JSON](http://localhost:5173/samples/bulk-questions.json) or use `samples/bulk-questions.json` in the repo. Same limits + structural checks. |

```json
{
  "questions": [
    {
      "prompt": "Your question?",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1
    }
  ]
}
```

Use **Download template** in the UI for a ready-made `.xlsx`.

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API + UI (watch mode) |
| `npm run dev:api` | API only (`http://127.0.0.1:3001`) |
| `npm run dev:ui` | UI only (Vite) |
| `npm run build` | Build UI + compile server |
| `npm start` | Production API + static UI from `dist/` |
| `npm test` | Run unit tests (password rules, JSON import) |
| `npm run db:push` | Apply Prisma schema to database |
| `npm run db:seed` | Demo users, classes, 30 draft tests |
| `npm run db:publish-demo` | Publish **Demo Aptitude — All Students** |
| `npm run db:studio` | Browse database in browser |

---

## Environment (`.env`)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev-only-secret-change-in-production-use-long-random-string"
CLIENT_ORIGIN="http://localhost:5173"
PORT=3001
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite file (dev) or PostgreSQL URL (production) |
| `JWT_SECRET` | Auth token signing — use a long random value in production |
| `CLIENT_ORIGIN` | Primary UI origin for CORS (required HTTPS exact origin in production; never `*`) |
| `CLIENT_ORIGINS` | Optional comma-separated extra exact origins (e.g. custom domain) |
| `PORT` | API port (default `3001`) |
| `SEED_FORCE_PASSWORD_CHANGE` | Local: set `false` for easy demos. Production seed always forces change. |
| `ALLOW_DEMO_SEED` | Production: must be `true` to run demo seed (trial only). Omit on real prod. |
| `ALLOW_DEMO_SEED_PASSWORD` | Production: must be `true` to accept `changeme123` login (trial only). |
| `BCRYPT_COST` | Optional bcrypt rounds (default `12`) |
| `ACCESS_TOKEN_MINUTES` | Access JWT lifetime (default `15`) |
| `SESSION_HOURS` | Refresh / idle session lifetime (default `2`) |

After schema changes: `npm run db:push` → `npx prisma generate` → restart `npm run dev`.

---

## Production (PostgreSQL)

- **UI → Netlify:** [docs/NETLIFY.md](docs/NETLIFY.md) (`netlify.toml` + `VITE_API_URL`)
- **API + DB → Render:** [docs/TRIAL_HOST.md](docs/TRIAL_HOST.md) (`Dockerfile` + `render.yaml`)

Set Render `CLIENT_ORIGIN` to your Netlify HTTPS URL so login cookies work cross-site.

Local Postgres:

```bash
docker compose up -d
copy .env.example .env
npm run db:push
npm run db:seed
npm run build
npm start
```

Serve behind HTTPS in production. Set `NODE_ENV=production` for secure cookies. On Render, set `CLIENT_ORIGIN` to your Netlify (or custom) HTTPS origin — required in production.

**Backup:** `pg_dump -U placement placement > backup.sql`  
**Restore:** `psql -U placement placement < backup.sql`

---

## Security & reliability

| Feature | Description |
|---------|-------------|
| Password hashing | **bcrypt** (bcryptjs, cost 12) — never MD5, SHA-256(password), or plain text |
| Password policy | 8+ chars, upper, lower, number; blocks `changeme123` as a new password |
| Seed password | `changeme123` is **rejected in production** (`SEED_PASSWORD_FORBIDDEN`) unless trial opt-in `ALLOW_DEMO_SEED_PASSWORD=true` |
| Forced reset | `SEED_FORCE_PASSWORD_CHANGE` (local default via `.env`; **always true in production** after seed) |
| Demo seed guard | Production refuses `db:seed` / load-seed unless `ALLOW_DEMO_SEED=true` (trial/staging only) |
| Auth cookies | **HttpOnly + Secure (prod) + SameSite** — JWTs never in `localStorage` / `sessionStorage` / URL |
| Access token | Short-lived JWT cookie (`placement_at`, default 15 min via `ACCESS_TOKEN_MINUTES`) |
| Refresh rotation | Opaque refresh cookie (`placement_rt`) rotated on `POST /api/auth/refresh` |
| Session revoke | Logout, password change, admin disable / password reset invalidate all sessions |
| IDOR / BOLA | Attempt APIs require ownership (+ cohort for live ops); staff scoped to department; uniform 404 |
| Permission matrix | Explicit codes (`requirePermission`) — see [docs/PERMISSION_MATRIX.md](docs/PERMISSION_MATRIX.md) |
| Exam answer keys | Student session never returns `isCorrect` / `correctIndex` (server-side scoring only) |
| Server timer | `attempt.endsAt` is authoritative; expired answers/proctor → auto-submit |
| One active attempt | Unique `openLock` per student+test while in progress (DB-enforced) |
| Autosave | Answers only — client `score` / `passed` rejected; server grades on submit |
| Result status | Submit stores score as **PENDING**; students see scores only after **RELEASED** (staff/auto publish) |
| Bulk import | File size / question / option / string limits; content sniff (not extension); structural validation |
| CSV export | Formula injection neutralized (`=`, `+`, `-`, `@` prefixed) |
| Rate limits | Global `/api` ceiling + login / 2FA / password-reset / change-password + submit / autosave / proctor + import/export/publish/release |
| CORS | Production: exact `CLIENT_ORIGIN` (+ `CLIENT_ORIGINS`) only — never `Access-Control-Allow-Origin: *` |
| Security headers | Helmet: CSP (`default-src 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS (prod), `X-Powered-By` disabled |
| Auto-close | Server and client submit when time expires |
| Shuffled MCQs | Per-attempt question and option order |
| Two-step release | Publish **test** → students take exam → publish **results** |
| Audit log | Admin: `GET /api/admin/audit-logs` — LOGIN/FAILED/LOGOUT, user/test/attempt/result/import/CSV events; stores timestamp, userId, role, action, target, IP, user-agent, success (never passwords/tokens) |
| Admin 2FA | Optional by default (email + password). Set `REQUIRE_ADMIN_2FA=true` to force authenticator for Admin / Super Admin |
| Recovery codes | One-time backup codes issued on 2FA enable (hashed at rest); usable at login if authenticator is lost |
| Password reset | Email link (`/forgot-password` → `/reset-password?token=…`); SMTP via `SMTP_URL` / `SMTP_*` (dev logs link) |
| TOTP at rest | AES-256-GCM (`enc:v1:…`); optional `TOTP_ENCRYPTION_KEY` |
| Session revoke | Staff/admin multi-device list + revoke one / revoke others (`GET/DELETE /api/auth/sessions`) |
| Health | `GET /api/health` |

**Real production:** leave `ALLOW_DEMO_SEED` and `ALLOW_DEMO_SEED_PASSWORD` unset, do not run demo seeds, create staff/students from the Admin UI with strong passwords.

---

## Project layout

```
placement/
├── prisma/           # Schema, seed, demo publish script
├── server/           # Express API (routes, auth, results export)
├── shared/           # Academic helpers (degree, semester, emails)
├── src/              # React UI
├── samples/          # Bulk question JSON examples
├── public/samples/   # Sample JSON served to the UI
├── tests/            # Vitest tests
└── docker-compose.yml
```

---

## Troubleshooting

### Cannot log in / “Email and password required”

1. Restart the API: stop `npm run dev` and run again (body parser must run before auth routes).
2. Confirm API is up: open http://127.0.0.1:3001/api/health — should show `{"ok":true,...}`.
3. Use the UI URL from the Vite terminal (not an old port).
4. Re-seed if needed: `npm run db:seed`

### API crashes on start (`Unknown argument …`)

```bash
npx prisma generate
npm run dev
```

### Student sees no tests

- Staff must **Publish** the test (and schedule window must be open).
- Test **degree/semester** must match the student profile.
- Or run `npm run db:publish-demo` for the all-student demo test.

### Student cannot see results

Staff must click **Publish results to students** on the test **Results** page (separate from publishing the test).

### Port already in use

Kill other Node processes or let Vite pick the next port (`5174`, `5175`, …).

---

## License

Private / internal use — GP Pharmacy placement portal.
