# Host UI on Netlify (API on Render)

The Vite React app deploys to **Netlify**. The Express API + Postgres stay on **Render** (see [TRIAL_HOST.md](./TRIAL_HOST.md)). Netlify alone cannot run this API (sessions, Prisma, timed exams).

**Important:** Production `netlify.toml` must **not** proxy `/api` to laptop tunnels. Set `VITE_API_URL` to your Render origin so the browser calls the API directly (cross-origin cookies via `CLIENT_ORIGIN`).

```
Browser  →  https://your-site.netlify.app     (UI)
         →  https://placement-portal.onrender.com/api/...  (API + cookies)
```

## 1. Deploy the API first (Render)

1. Follow [TRIAL_HOST.md](./TRIAL_HOST.md) (Blueprint / Docker).
2. Confirm health: `https://<your-api>.onrender.com/api/health` → `{"ok":true,...}`.
3. Note the API origin (no trailing slash), e.g. `https://placement-portal.onrender.com`.

## 2. Deploy the UI (Netlify)

1. Push this repo to GitHub.
2. [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Connect the repo. Netlify reads [`netlify.toml`](../netlify.toml):
   - Build command: `npm run build:ui`
   - Publish directory: `dist`
4. **Site configuration → Environment variables** → Add:

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://<your-api>.onrender.com` (no trailing slash) |

5. Deploy. Open `https://<your-site>.netlify.app`.

## 3. Point the API at Netlify (cookies + CORS)

On the **Render** web service → Environment:

| Variable | Value |
|----------|--------|
| `CLIENT_ORIGIN` | `https://<your-site>.netlify.app` (exact HTTPS origin, no trailing slash, **never `*`**) |
| `PUBLIC_API_URL` | Same as your Render URL (optional; Render usually injects `RENDER_EXTERNAL_URL`) |

Production CORS allows **only** exact origins from `CLIENT_ORIGIN` + `CLIENT_ORIGINS`. Wildcard Netlify hosts are not allowed in production.

Optional exact extras (custom domain or a specific preview URL):

| Variable | Value |
|----------|--------|
| `CLIENT_ORIGINS` | e.g. `https://placement.gppharmacycollege.com` (comma-separated exact origins) |

Redeploy / restart the Render service after changing env.

Cross-origin login uses `SameSite=None; Secure` cookies automatically when the UI host ≠ API host.

## 4. Smoke test

1. Open the **Netlify** URL (not Render’s UI path).
2. Log in as `admin@gppharmacy.edu` / `changeme123` (after seed).
3. Confirm `/api/health` via browser Network tab hits the Render host.
4. Staff publish a short test → student takes it from Netlify.

## Custom domain

1. Netlify → Domain management → add domain (e.g. `placement.gppharmacycollege.com`).
2. On Render, either:
   - set `CLIENT_ORIGIN=https://placement.gppharmacycollege.com`, or
   - keep Netlify as `CLIENT_ORIGIN` and add `CLIENT_ORIGINS=https://placement.gppharmacycollege.com`.
3. Redeploy Netlify (no change needed if `VITE_API_URL` still points at Render).

## Local development

Leave `VITE_API_URL` unset. Vite proxies `/api` to `http://127.0.0.1:3001` ([`vite.config.ts`](../vite.config.ts)).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login works then immediately signed out | Set `CLIENT_ORIGIN` on Render to the exact Netlify HTTPS origin; restart API. |
| CORS error in console | Origin must match `CLIENT_ORIGIN` / `CLIENT_ORIGINS` exactly; check `http` vs `https` and trailing slash. Production does not allow `*`. |
| UI calls localhost API | Rebuild Netlify with `VITE_API_URL` set (Vite bakes it in at **build** time). |
| Blank page on refresh | Confirm `netlify.toml` SPA redirect `/* → /index.html` is present. |
| Free Render sleep | Cold starts can take ~1 min; use a non-sleeping plan for live exams. |

## What not to do

- Do not set Netlify Functions as the Express backend for this project.
- Do not use SQLite on Netlify/Render production — use Render Postgres.
- Do not put secrets in `VITE_*` vars (they are public in the browser bundle). Only the public API origin belongs there.
