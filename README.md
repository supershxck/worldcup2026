# World Cup 2026 Dashboard

> Live FIFA 2026 match schedule, host-city maps, and analytics — static site with cached score proxy.

| | |
|---|---|
| **Status** | Building — live scores shipped; Cloudflare Pages deploy ready |
| **Stack** | HTML/CSS/JS, Leaflet, Cloudflare Pages Functions, optional FastAPI analytics (`api/`) |
| **Repo** | [supershxck/worldcup2026](https://github.com/supershxck/worldcup2026) |
| **Deploy** | Cloudflare Pages (see [DEPLOY.md](./DEPLOY.md)) |

## Purpose

Fan dashboard for the 2026 World Cup: today's matches, venue maps across USA/Canada/Mexico, and tournament analytics. Built as a lightweight static site that degrades gracefully when APIs are unavailable.

## Current state

- Match schedule and host-city map UI
- Live score feed via cached edge proxy at `/api/wc-live` (`FOOTBALL_DATA_KEY` — server-side only)
- Analytics views with offline fallback to `data/analytics-bundle.json`

## Work in progress

- [ ] Standings and bracket views
- [ ] Analytics API co-deployed with static site
- [ ] Mobile layout polish

## Quick start

```bash
# Static preview
open index.html

# Cloudflare Pages dev (functions + .dev.vars)
npm install
cp .dev.vars.example .dev.vars   # add FOOTBALL_DATA_KEY
npm run dev:cf

# Deploy
npm run deploy:cf
```
