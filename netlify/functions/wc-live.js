// Netlify Function — cached World Cup live-score proxy.
//
// Why this exists: football-data.org's free tier allows 10 req/min and the API key must
// stay secret. This function holds the key server-side (env var) and returns the data with
// a 12-second edge-cache header, so Netlify hits the upstream API at most ~5×/minute no
// matter how many people are watching. The browser polls THIS, never football-data.org.
//
// Set the key in: Netlify → Site settings → Environment variables → FOOTBALL_DATA_KEY
// Without a key it returns {source:"none"} so the frontend falls back gracefully.

const API = "https://api.football-data.org/v4/competitions/WC/matches";

function ymd(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

exports.handler = async function () {
  const key = process.env.FOOTBALL_DATA_KEY;

  // Graceful no-key path: frontend keeps its existing fallback feed.
  if (!key) {
    return json(200, { source: "none", reason: "no FOOTBALL_DATA_KEY set", matches: [] });
  }

  // A small window: yesterday → +2 days catches in-play + what's coming up.
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3600 * 1000);
  const to = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
  const url = `${API}?dateFrom=${ymd(from)}&dateTo=${ymd(to)}`;

  try {
    const r = await fetch(url, { headers: { "X-Auth-Token": key } });
    if (!r.ok) {
      // 429 = rate limited; tell the client to back off but don't crash the page.
      return json(200, { source: "none", reason: `upstream ${r.status}`, matches: [] });
    }
    const data = await r.json();
    const matches = (data.matches || []).map(normalize);
    return json(200, { source: "football-data", fetchedAt: new Date().toISOString(), matches });
  } catch (e) {
    return json(200, { source: "none", reason: String(e), matches: [] });
  }
};

function normalize(m) {
  const ft = (m.score && m.score.fullTime) || {};
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,            // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
    stage: m.stage,             // GROUP_STAGE | LAST_16 | ... | FINAL
    group: m.group || "",
    homeName: m.homeTeam ? (m.homeTeam.name || m.homeTeam.shortName || "TBD") : "TBD",
    awayName: m.awayTeam ? (m.awayTeam.name || m.awayTeam.shortName || "TBD") : "TBD",
    homeTla: m.homeTeam ? m.homeTeam.tla : null,
    awayTla: m.awayTeam ? m.awayTeam.tla : null,
    homeScore: ft.home == null ? null : ft.home,
    awayScore: ft.away == null ? null : ft.away,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Edge cache: at most ~5 upstream calls/min regardless of visitor count.
      "Cache-Control": "public, max-age=12",
      "Netlify-CDN-Cache-Control": "public, s-maxage=12, stale-while-revalidate=30",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
