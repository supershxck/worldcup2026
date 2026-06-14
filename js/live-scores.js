/* ════════════════════════════════════════════════════════════════════════
   live-scores.js — football-data.org live feed for the World Cup dashboard.

   Design: a *decorator*, not a rewrite. The app already has a global loadData()
   (worldcup26.ir) feeding state.matches → renderAll(). This file makes
   football-data.org the PRIMARY source by wrapping loadData(): try football-data
   first, fall back to the original feed, then to the embedded cache. It reuses the
   app's own state model, computeAllStats(), and renderers. Reversible: delete this
   file + its <script> tag and the app behaves exactly as before.

   Cost control: polls our cached Netlify function (/.netlify/functions/wc-live),
   never football-data.org directly. Fast (12s ≈ 5/min) only while a match is live;
   idle (5 min) otherwise; paused entirely while the tab is hidden.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var FN_URL = "/.netlify/functions/wc-live";
  var FAST_MS = 12000;    // ~5 calls/min — live windows only
  var IDLE_MS = 300000;   // 5 min — nothing in play
  var WAKE_MS = 800;      // quick refresh when tab regains focus

  var STAGE_MAP = {
    GROUP_STAGE: "group", LEAGUE_STAGE: "group",
    LAST_32: "r32", LAST_16: "r16",
    QUARTER_FINALS: "qf", SEMI_FINALS: "sf",
    THIRD_PLACE: "third", FINAL: "final"
  };

  function pad(n) { return String(n).padStart(2, "0"); }

  // ISO (UTC) → 'MM/DD/YYYY HH:MM' in the viewer's local time (what isToday/fmtDate expect).
  function toLocalStamp(iso) {
    var d = new Date(iso);
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + "/" + d.getFullYear() +
           " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function groupLetter(g) { return g ? String(g).replace(/GROUP[_\s]?/i, "").trim() : ""; }

  // Resolve a football-data team to one of the app's team ids; create a flag-bearing
  // synthetic entry if the app doesn't know it yet, so cards still render cleanly.
  function ensureTeam(tla, name) {
    var teams = state.teams || (state.teams = {});
    for (var id in teams) {
      if (teams[id] && (teams[id].c === tla || teams[id].n === name)) return id;
    }
    var newId = "fd-" + (tla || name);
    teams[newId] = {
      n: name || tla || "TBD",
      c: tla || "—",
      f: (typeof FLAGS !== "undefined" && FLAGS[tla]) || "🏳️",
      g: "?"
    };
    return newId;
  }

  // football-data match → the app's match shape. (No scorers/cards on the free tier.)
  function toAppMatch(m) {
    var finished = m.status === "FINISHED";
    return {
      id: "fd-" + m.id,
      local_date: toLocalStamp(m.utcDate),
      finished: finished ? "TRUE" : false,
      home_team_id: ensureTeam(m.homeTla, m.homeName),
      away_team_id: ensureTeam(m.awayTla, m.awayName),
      home_score: m.homeScore == null ? 0 : m.homeScore,
      away_score: m.awayScore == null ? 0 : m.awayScore,
      home_scorers: null,
      away_scorers: null,
      type: STAGE_MAP[m.stage] || "group",
      group: groupLetter(m.group),
      _status: m.status
    };
  }

  function anyLive(raw) {
    return raw.some(function (m) { return m._status === "IN_PLAY" || m._status === "PAUSED"; });
  }

  var lastLive = false;

  async function loadFootballData() {
    try {
      var r = await fetch(FN_URL, { cache: "no-store" });
      if (!r.ok) return false;
      var data = await r.json();
      if (!data || data.source !== "football-data" ||
          !Array.isArray(data.matches) || !data.matches.length) return false;

      var appMatches = data.matches.map(toAppMatch);
      lastLive = anyLive(appMatches);
      state.matches = appMatches;
      state.dataSource = "live";
      computeAllStats();
      try { persistCache(); } catch (e) {}
      updateHeaderStats();
      renderAll();
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Decorator: football-data primary, original feed as fallback ----------------
  var _origLoadData = (typeof loadData === "function") ? loadData : null;
  loadData = async function (force) {
    var ok = await loadFootballData();
    if (ok) return;
    if (_origLoadData) return _origLoadData(force);
  };

  // --- Adaptive polling -----------------------------------------------------------
  var timer = null;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  function tick() {
    if (document.hidden) { schedule(IDLE_MS); return; }   // don't poll a hidden tab
    Promise.resolve(loadData()).finally(function () {
      schedule(lastLive ? FAST_MS : IDLE_MS);
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) schedule(WAKE_MS);
  });

  function start() {
    Promise.resolve(loadData()).finally(function () {
      schedule(lastLive ? FAST_MS : IDLE_MS);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
