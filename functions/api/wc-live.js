/**
 * Cloudflare Pages Function — cached World Cup live-score proxy.
 * Same contract as netlify/functions/wc-live.js and api/wc_live.py.
 *
 * Set FOOTBALL_DATA_KEY in: Cloudflare dashboard → Pages → Settings → Environment variables
 * or: wrangler pages secret put FOOTBALL_DATA_KEY --project-name=worldcup2026
 */

const API = "https://api.football-data.org/v4/competitions/WC/matches";

export async function onRequest(context) {
  const key = context.env.FOOTBALL_DATA_KEY;

  if (!key) {
    return json(200, { source: "none", reason: "no FOOTBALL_DATA_KEY set", matches: [] });
  }

  try {
    const r = await fetch(API, { headers: { "X-Auth-Token": key } });
    if (!r.ok) {
      return json(200, { source: "none", reason: `upstream ${r.status}`, matches: [] });
    }
    const data = await r.json();
    const matches = (data.matches || []).map(normalize);
    return json(200, {
      source: "football-data",
      fetchedAt: new Date().toISOString(),
      matches,
    });
  } catch (e) {
    return json(200, { source: "none", reason: String(e), matches: [] });
  }
}

function normalize(m) {
  const ft = (m.score && m.score.fullTime) || {};
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    stage: m.stage,
    group: m.group || "",
    homeName: m.homeTeam ? (m.homeTeam.name || m.homeTeam.shortName || "TBD") : "TBD",
    awayName: m.awayTeam ? (m.awayTeam.name || m.awayTeam.shortName || "TBD") : "TBD",
    homeTla: m.homeTeam ? m.homeTeam.tla : null,
    awayTla: m.awayTeam ? m.awayTeam.tla : null,
    homeScore: ft.home == null ? null : ft.home,
    awayScore: ft.away == null ? null : ft.away,
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=12, s-maxage=12, stale-while-revalidate=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
