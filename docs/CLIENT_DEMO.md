# GP Pharmacy Placement Portal — Client Demo Guide

Plain-language guide for installing the app and walking through a demo with stakeholders.

---

## Hosted demo (Netlify)

**Live URL:** https://jocular-licorice-d3a3ac.netlify.app

UI + API run on the same Netlify site (Functions). Use the same demo emails / password `changeme123`.

Note: SQLite on Netlify Functions is for demos; data can reset when the function cold-starts. For permanent college data, use Render + Postgres later.

---

## What this product does


College placement aptitude portal for pharmacy courses:

| Role | Who | What they do |
|------|-----|----------------|
| **Admin** | Placement cell / HO | Create users, assign staff to classes, promote years, export packs |
| **Staff** | Faculty | Create & publish tests for their class, release results, view marks |
| **Student** | Learners | Take timed MCQ tests for their degree + year + section |

**Classes are:** Degree (D.Pharm / B.Pharm / M.Pharm) × Year × Section (A or B).

---

## Install (Windows — recommended for demo PC)

### 1. Prerequisites

1. Install **Node.js 20 LTS** from https://nodejs.org (includes `npm`).
2. Confirm in PowerShell or Command Prompt:

```bash
node -v
npm -v
```

### 2. Open the project

```bash
cd D:\placement
```

(Use your actual folder path if different.)

### 3. Install packages

```bash
npm run install:all
```

This installs both `frontend/` and `backend/`.

### 4. Configure the API

```bash
copy backend\.env.example backend\.env
```

Default settings use a local SQLite file (`backend\prisma\dev.db`) — no separate database install needed for demos.

Optional: open `backend\.env` and keep:

- `SEED_FORCE_PASSWORD_CHANGE=false` — so local demo logins work without a forced password change.
- On a **production** host, leave `ALLOW_DEMO_SEED` / `ALLOW_DEMO_SEED_PASSWORD` unset so `changeme123` is rejected and demo accounts are not seeded.

### 5. Create database + demo users

```bash
cd backend
npm run db:push
npm run db:seed
cd ..
```

Wait until you see **Seed complete**.

### 6. Start the app

From the project root:

```bash
npm run dev
```

| Service | Open in browser |
|---------|-----------------|
| **Login / UI** | http://localhost:5173 |
| **API** | http://127.0.0.1:3001 |
| **Health check** | http://127.0.0.1:3001/api/health |

If port 5173 is busy, the terminal will show another port (e.g. 5174) — use that URL.

Stop the demo with `Ctrl+C` in the terminal.

---

## All login details

**Password for every seeded account:** `changeme123`

### Quick demo accounts (start here)

| Role | Email | Password | What to show |
|------|-------|----------|--------------|
| Admin | `admin@gppharmacy.edu` | `changeme123` | Full college control |
| Staff (whole D.Pharm) | `staff@gppharmacy.edu` | `changeme123` | Faculty for one department |
| Student | `student@gppharmacy.edu` | `changeme123` | Student exam experience (B.Pharm Year 2 Sec A) |

### Department staff (all years in that degree)

| Email | Password | Scope |
|-------|----------|--------|
| `staff.dpharm@gppharmacy.edu` | `changeme123` | All D.Pharm years / sections |
| `staff.bpharm@gppharmacy.edu` | `changeme123` | All B.Pharm years / sections |
| `staff.mpharm@gppharmacy.edu` | `changeme123` | All M.Pharm years / sections |
| `staff@gppharmacy.edu` | `changeme123` | Same as D.Pharm (short alias) |

### Class staff & students (every year × section)

There are **16 classes** (every program × year × Sec A/B):

| Program | Years | Sections |
|---------|-------|----------|
| D.Pharm (`dpharm`) | 1–2 | A, B |
| B.Pharm (`bpharm`) | 1–4 | A, B |
| M.Pharm (`mpharm`) | 1–2 | A, B |

Per class seeded:

- **2 staff**
- **10 students**

**Email patterns**

| Role | Pattern | Example |
|------|---------|---------|
| Class staff | `staff.<course>.y<year>.<a\|b>.<1\|2>@gppharmacy.edu` | `staff.bpharm.y1.a.1@gppharmacy.edu` |
| Student | `student.<course>.y<year>.<a\|b>.<01–10>@gppharmacy.edu` | `student.dpharm.y2.b.05@gppharmacy.edu` |

**More examples (password always `changeme123`)**

| Email | Meaning |
|-------|---------|
| `staff.bpharm.y3.b.2@gppharmacy.edu` | B.Pharm 3rd Year Sec B — staff #2 |
| `student.bpharm.y1.a.01@gppharmacy.edu` | B.Pharm 1st Year Sec A — roll 01 |
| `student.mpharm.y1.a.01@gppharmacy.edu` | M.Pharm 1st Year Sec A — roll 01 |
| `student.dpharm.y1.a.10@gppharmacy.edu` | D.Pharm 1st Year Sec A — roll 10 |
| `staff.mpharm.y2.a.1@gppharmacy.edu` | M.Pharm 2nd Year Sec A — staff #1 |

**Totals after seed:** 1 admin · ~36 staff · 161 students (incl. demo student).

---

## Suggested client walkthrough (15–20 min)

### A. Student journey (~5 min)

1. Open http://localhost:5173  
2. Login: `student@gppharmacy.edu` / `changeme123`  
3. Show dashboard — only tests for their class (or open demos).  
4. Open **Demo Aptitude — All Students** (or a class test if published).  
5. Take a short MCQ attempt; submit; show result / wait for release if needed.  
6. Logout.

**Talking points:** timed exam, degree/year/section targeting, simple student UI.

### B. Staff journey (~5 min)

1. Login: `staff@gppharmacy.edu` / `changeme123` (or a class staff email).  
2. Show tests list — drafts vs published.  
3. Open create/edit test — pick **degree + year + section**.  
4. Mention publish window and results release.  
5. Show marks / roster for their scope only.  
6. Logout.

**Talking points:** staff only see their department/class; cannot edit other classes’ papers.

### C. Admin journey (~5–7 min)

1. Login: `admin@gppharmacy.edu` / `changeme123`  
2. **Users** — list of staff/students; create or edit a user.  
3. **Staff allocation** — assign a teacher to Year + Section.  
4. **Promote students** — move a year forward (e.g. Year 1 → Year 2), optional hold-backs.  
5. **Export pack / marks** — download reports for the college.  
6. Logout.

**Talking points:** one place for placement cell; year promotion without re-entering every student.

### D. Optional — class-specific login

To prove section isolation:

1. Student: `student.bpharm.y1.a.01@gppharmacy.edu`  
2. Staff: `staff.bpharm.y1.a.1@gppharmacy.edu`  

Show that Year 1 Sec A staff sees that class, not Sec B.

---

## Folder layout (for IT / developers)

```
placement/
  frontend/     → React UI (Vite) — what users see
  backend/      → Express API + Prisma database
  docs/         → Extra hosting notes
```

| Task | Command |
|------|---------|
| Install both apps | `npm run install:all` |
| Run UI + API together | `npm run dev` |
| Reset / refresh demo data | `cd backend` → `npm run db:seed` |
| UI only | `npm run dev --prefix frontend` |
| API only | `npm run dev --prefix backend` |

---

## Re-seed demo data (clean slate)

From `backend/`:

```bash
set SEED_FORCE_PASSWORD_CHANGE=false
npm run db:seed
```

This recreates/updates all demo users and sample tests. Password stays `changeme123`.

---

## Hosting (production later)

| Piece | Typical host |
|-------|----------------|
| Frontend (UI) | Netlify — set site base to `frontend/` |
| Backend (API + DB) | Render (or similar) with PostgreSQL |

Build-time on Netlify: set `VITE_API_URL` to your public API URL.  
On the API: set `CLIENT_ORIGIN` to your Netlify site URL.

Details: `docs/NETLIFY.md` and `docs/TRIAL_HOST.md`.

---

## Troubleshooting (demo day)

| Problem | Fix |
|---------|-----|
| Login page loads but login fails | Confirm `npm run dev` is running both UI and API; open `/api/health` |
| “API not found / 404” on hosted UI | UI is static without API URL — set `VITE_API_URL` or use local `npm run dev` |
| Port 5173 in use | Use the `Local:` URL printed in the terminal |
| Forgot passwords | Re-run `npm run db:seed` in `backend/` |
| Blank / old data | Re-seed; hard-refresh browser (Ctrl+F5) |

---

## One-page cheat sheet (print this)

```
URL:      http://localhost:5173
Password: changeme123  (all accounts)

Admin:    admin@gppharmacy.edu
Staff:    staff@gppharmacy.edu
Student:  student@gppharmacy.edu

Class staff:   staff.bpharm.y1.a.1@gppharmacy.edu
Class student: student.bpharm.y1.a.01@gppharmacy.edu
```
