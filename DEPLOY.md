# worldcup2026 — Deploy Runbook (live scores)

**Primary host:** Cloudflare Pages (`functions/api/wc-live.js` + static site).  
**Production URL:** https://shxck-wc26.pages.dev  
**Legacy:** Netlify still supported via `netlify/functions/wc-live.js`.

> Note: `worldcup2026.pages.dev` is occupied by an unrelated site — we use project name `shxck-wc26`.

Pre-verified 2026-06-14. The live-score feature is additive and reversible: it's one new
JS file, one edge function, and a single `<script>` tag. Removing them restores the
prior behavior exactly.

## Cloudflare Pages (recommended)

### 1. Auth (do not paste tokens in chat)
```bash
# Option A — OAuth (preferred)
npx wrangler login

# Option B — API token with "Cloudflare Pages:Edit" scope only
export CLOUDFLARE_API_TOKEN="..."   # in your shell only, never commit
```

### 2. Install + smoke check
```bash
cd ~/ANQ/product/worldcup2026
npm install
npm run check
cp .dev.vars.example .dev.vars   # optional local dev — add FOOTBALL_DATA_KEY
npx wrangler pages dev .         # http://localhost:8788 — Today tab
```

### 3. Create project (once)
```bash
npx wrangler pages project create shxck-wc26 --production-branch main
```

### 4. Set the football-data key (production)
```bash
npx wrangler pages secret put FOOTBALL_DATA_KEY --project-name=shxck-wc26
# paste token when prompted — from https://www.football-data.org/client/register
```

Or: Cloudflare dashboard → Workers & Pages → shxck-wc26 → Settings → Environment variables.

### 5. Deploy
```bash
npm run deploy:cf
# → https://shxck-wc26.pages.dev (or your custom domain)
```

### 6. Post-deploy smoke test
- Open production URL → **Today** tab → scores render.
- `curl -s https://shxck-wc26.pages.dev/api/wc-live | head -c 200`
  → `"source":"football-data"` (or `"none"` if key missing).
- DevTools → Network: `/api/wc-live` returns `200`, `cache-control` ~12s.

### 7. Custom domain (optional)
Cloudflare dashboard → Pages → shxck-wc26 → Custom domains → add e.g. `wc26.yourdomain.com`.

---

## GitHub auto-deploy (push → production)

Every push to `main` runs `.github/workflows/deploy-cloudflare-pages.yml`.

### One-time setup
1. **Create Pages project** (if missing):
   ```bash
   npx wrangler pages project create shxck-wc26 --production-branch main
   ```
2. **GitHub repo secrets** — [supershxck/worldcup2026 → Settings → Secrets](https://github.com/supershxck/worldcup2026/settings/secrets/actions):
   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Token with **Cloudflare Pages:Edit** (+ Account read) |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar |
3. **Pages env var** (live scores): Cloudflare → shxck-wc26 → Settings → Variables → `FOOTBALL_DATA_KEY`
4. Push to `main` — Actions tab shows deploy; production URL updates automatically.

### Optional: Cloudflare Git integration (dashboard)
Instead of Actions, connect the repo in Cloudflare dashboard → Create application → Pages → Connect to Git → `supershxck/worldcup2026`, branch `main`, build output `.`, no build command. Use **either** Actions **or** dashboard Git — not both unless you intend duplicate deploys.

---

## Netlify (legacy)

## Preflight — already verified ✓
- `node --check` passes on `netlify/functions/wc-live.js` and `js/live-scores.js`.
- Function smoke tests pass: **no-key** → graceful fallback; **live feed** → correct
  normalization; **upstream 429** → page stays up and falls back.
- No API key or token in any client file. Key is read only from `process.env`.
- `.env` is gitignored; no `.env` present in the repo.
- Edge cache header `s-maxage=12` ⇒ ≤ 5 upstream calls/min (agreed cadence).
- Static site degrades cleanly without the Python `api/` backend (analytics falls back to
  `data/analytics-bundle.json`).

## 1. Get the key in place (do NOT commit it)
1. Copy your free token from football-data.org (arrives by email after registration).
2. **Production:** Netlify → Site settings → Environment variables → add
   `FOOTBALL_DATA_KEY` = your token. (Scope: all deploy contexts.)
3. **Local test (optional):** `cp .env.example .env`, paste the key into `.env`.

## 2. Test locally before shipping (recommended)
The function only runs under Netlify's runtime, not a plain file-open:
```bash
cd ~/ANQ/worldcup2026
npm i -g netlify-cli      # once
netlify dev               # serves site + function with .env loaded
```
Open the local URL → **Today** tab. Confirm:
- During a live match: scores update within ~12s, card shows `LIVE`.
- Header `Updated` shows `Live · <time>`.
- Network tab: requests go to `/.netlify/functions/wc-live` (NOT football-data.org), and
  repeat calls return from cache (~12s apart).

## 3. Deploy
```bash
git add -A
git commit -m "feat: football-data.org live scores via cached Netlify proxy"
git push        # if the Netlify site auto-builds from this repo
# — or — drag-and-drop / `netlify deploy --prod` if you deploy manually
```

## 4. Post-deploy smoke test (2 min)
- Load the production URL → **Today** tab → scores render.
- DevTools → Network: `wc-live` returns `200` with `cache-control: ... s-maxage=12`.
- Hit `https://<your-site>/.netlify/functions/wc-live` directly → JSON with
  `"source":"football-data"` (or `"source":"none"` if the env var isn't set — fix that).
- Leave it open during a match for 2–3 min; confirm scores advance and you are NOT getting
  429s (see monitoring).

## 5. Monitoring — rate limit
- football-data free tier = **10 req/min**. The edge cache keeps you near 5/min.
- Watch Netlify → Functions → `wc-live` logs for `upstream 429`. A few are harmless
  (the page falls back); sustained 429s mean the cache isn't collapsing traffic.
- If sustained: raise `s-maxage` in `wc-live.js` from `12` to `20` (→ 3/min) and redeploy.

## 6. Rollback triggers & how
Roll back if any of these occur post-deploy:
- The Today tab breaks or shows errors for all users.
- Sustained 429s even after raising `s-maxage`.
- Scores are wrong/mismatched vs. the official source.

**Fastest rollback (no redeploy of logic):** remove the `FOOTBALL_DATA_KEY` env var in
Netlify and redeploy — the function returns `source:none` and the app reverts to its prior
`worldcup26.ir` feed automatically.

**Full rollback:** revert the commit (or delete `js/live-scores.js` + its `<script>` tag in
`index.html`) and redeploy. Baseline commit to return to:
`baseline: worldcup2026 before live-scores feature`.

## Known limitation (by design, free tier)
No goal-scorer names, cards, or match stats on the free tier — cards show the scoreline and
LIVE/FT status only. Upgrading the football-data plan later adds these with no code change.
