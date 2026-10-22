# Get a permanent public link (not a tunnel)

Temporary tunnels (loca.lt) are **not** hosting. You need a cloud account once.

## Fastest: one link on Render (UI + API together)

Gives something like `https://placement-portal.onrender.com` — login works.

1. Create a free [GitHub](https://github.com/new) repo (empty, no README).
2. In PowerShell on this project:

```powershell
cd d:\placement
git add .
git commit -m "Initial placement portal for hosting"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

3. Open [Render](https://dashboard.render.com) → **New** → **Blueprint** → connect that GitHub repo (`render.yaml` is already in the project).
4. Wait until the service is **Live**.
5. Open the Render URL — that is your hosted link.

Demo login after seed: `admin@gppharmacy.edu` / `changeme123`

Details: [TRIAL_HOST.md](./TRIAL_HOST.md)

## Optional: Netlify UI + Render API

Only if you want the frontend on Netlify specifically. See [NETLIFY.md](./NETLIFY.md).  
You still need Render for the API — Netlify alone cannot run exams/login.

## What the agent needs to deploy for you

Paste either:

- A **Netlify Personal Access Token** (Site → User settings → Applications), plus your **Render API URL**, or  
- Confirm the GitHub repo is pushed and you’ve connected **Render Blueprint** (then share the Render URL).

Without a Netlify/Render/GitHub login, no permanent public link can be created from this PC.
