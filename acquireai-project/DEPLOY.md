# Deploy Guide (Vercel, No Card)

This project is configured to deploy frontend + backend on Vercel from one repo:

- Frontend: Vite app in `frontend/`
- Backend: Express API in `backend/src/server.js`
- Vercel routing: configured in `vercel.json`

## 1) Pre-check

1. Push latest code to your Git provider (GitHub/GitLab/Bitbucket).
2. Ensure these files exist:
   - `vercel.json`
   - `backend/.env.prod` (template)
   - `frontend/.env.production`

## 2) Create project on Vercel

1. Open Vercel Dashboard -> **Add New...** -> **Project**.
2. Import this repository.
3. Keep project root as repository root (do not change to `frontend`).
4. Click **Deploy** (first deploy may fail until env vars are added; that's okay).

## 3) Add backend environment variables

In Vercel Project -> **Settings** -> **Environment Variables**:

1. Open `backend/.env.prod`.
2. Copy key/value pairs and add them in Vercel.
3. Replace placeholders before saving:
   - `AZURE_OPENAI_API_KEY=replace_me`
   - `AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com`
   - `CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app` (set to your real Vercel URL)

Notes:
- `PORT` is optional on Vercel (platform manages port), but harmless if present.
- Never commit real secret values.

## 4) Frontend API base

`frontend/.env.production` uses:

```env
VITE_API_BASE=
```

That means frontend calls same-origin `/api/*` on Vercel, so no separate backend URL is needed.

## 5) Redeploy

After env vars are added:

1. Go to **Deployments**.
2. Click **Redeploy** on latest deployment.

## 6) Verify

Check:

1. `https://<your-app>.vercel.app/health` -> should return JSON `{ ok: true, ... }`
2. `https://<your-app>.vercel.app/` -> landing page loads
3. Open Betting Assistant and run a query
4. Open odds board route (`/match/<id>`) from assistant flow

## 7) Common issues

- **CORS error**: `CORS_ORIGIN` does not match deployed frontend domain.
- **500 from /api/query**: missing/invalid Azure env vars.
- **Build succeeds but APIs 404**: project root was not repo root, or `vercel.json` not picked.
- **First call slow**: serverless cold start can happen.

