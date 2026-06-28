/* ════════════════════════════════════════════════════════════════════════
   live-scores.js — football-data.org via /api/wc-live (Forge, Cloudflare, Netlify).

   On Forge Run: hydrate cache → retry live fetch → always render.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.WC_LOCAL === true || location.protocol === "file:") {
    window.__wcLivePolling = false;
    return;
  }
  window.__wcLivePolling = true;

  var FN_URL = window.WC_LIVE_URL || "/api/wc-live";
  var WAKE_MS = 800;
  var MAX_ATTEMPTS = 6;
  var RETRY_MS = 500;

  var STAGE_MAP = {
    GROUP_STAGE: "group", LEAGUE_STAGE: "group",
    LAST_32: "r32", LAST_16: "r16",
    QUARTER_FINALS: "qf", SEMI_FINALS: "sf",
    THIRD_PLACE: "third", FINAL: "final"
  };

  var FD_NAME_ALIASES = {
    "Czechia": "Czech Republic",
    "Bosnia-Herzegovina": "Bosnia & Herz.",
    "Cape Verde Islands": "Cape Verde",
    "Côte d'Ivoire": "Ivory Coast",
    "Korea Republic": "South Korea",
    "IR Iran": "Iran"
  };

  var TLA_ALIASES = { URY: "URU", CUR: "CUW" };

  function pad(n) { return String(n).padStart(2, "0"); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function toLocalStamp(iso) {
    var d = new Date(iso);
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + "/" + d.getFullYear() +
           " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function groupLetter(g) { return g ? String(g).replace(/GROUP[_\s]?/i, "").trim() : ""; }

  function staticTeamId(tla, name) {
    if (typeof T === "undefined") return null;
    if (tla) {
      var code = TLA_ALIASES[tla] || tla;
      for (var id in T) {
        if (T[id] && T[id].c === code) return id;
      }
    }
    var alias = FD_NAME_ALIASES[name] || name;
    for (var id in T) {
      if (T[id] && (T[id].n === alias || T[id].n === name)) return id;
    }
    return null;
  }

  function seedTeams() {
    if (typeof T === "undefined") return;
    var teams = state.teams || (state.teams = {});
    for (var id in T) {
      if (!teams[id]) teams[id] = T[id];
    }
  }

  function ensureTeam(tla, name) {
    seedTeams();
    var teams = state.teams;
    var sid = staticTeamId(tla, name);
    if (sid) return sid;
    for (var id in teams) {
      if (teams[id] && (teams[id].c === tla || teams[id].n === name)) return id;
    }
    var newId = "fd-" + (tla || name);
    var code = TLA_ALIASES[tla] || tla;
    teams[newId] = {
      n: name || tla || "TBD",
      c: code || "—",
      f: (typeof FLAGS !== "undefined" && FLAGS[code]) || "🏳️",
      g: "?"
    };
    return newId;
  }

  function isTbdName(name) {
    return !name || name === "TBD" || /^tbd$/i.test(name);
  }

  function toAppMatch(m) {
    var finished = m.status === "FINISHED";
    var g = groupLetter(m.group);
    var homeTbd = !m.homeTla && isTbdName(m.homeName);
    var awayTbd = !m.awayTla && isTbdName(m.awayName);
    return {
      id: "fd-" + m.id,
      local_date: toLocalStamp(m.utcDate),
      _utcDate: m.utcDate,
      finished: finished ? "TRUE" : false,
      home_team_id: homeTbd ? "0" : ensureTeam(m.homeTla, m.homeName),
      away_team_id: awayTbd ? "0" : ensureTeam(m.awayTla, m.awayName),
      home_score: m.homeScore == null ? 0 : m.homeScore,
      away_score: m.awayScore == null ? 0 : m.awayScore,
      home_scorers: null,
      away_scorers: null,
      type: STAGE_MAP[m.stage] || "group",
      group: g,
      _status: m.status,
      home_team_name_en: m.homeName,
      away_team_name_en: m.awayName
    };
  }

  function applyLiveMatches(raw) {
    var appMatches = raw.map(toAppMatch);
    appMatches.forEach(function (m) {
      var t = state.teams[m.home_team_id];
      if (t && m.group) t.g = m.group;
      t = state.teams[m.away_team_id];
      if (t && m.group) t.g = m.group;
    });
    state.matches = appMatches;
    state.dataSource = "live";
    state.lastFetchAt = Date.now();
    state.lastUpdated = new Date();
    state._loadFailed = false;
    computeAllStats();
    try { persistCache(); } catch (e) {}
    updateHeaderStats();
    renderAll();
  }

  function hydrateFromCache() {
    if (typeof loadEmbeddedCache !== "function") return false;
    if (loadEmbeddedCache() && state.matches.length) {
      if (!state.computed.gameStats.length) computeAllStats();
      updateHeaderStats();
      renderAll();
      return true;
    }
    return false;
  }

  async function fetchLivePayload() {
    var bust = Date.now();
    var r = await fetch(FN_URL + "?_=" + bust, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  }

  async function loadFootballData() {
    try {
      var data = await fetchLivePayload();
      if (!data || data.source !== "football-data" ||
          !Array.isArray(data.matches) || !data.matches.length) {
        return false;
      }
      applyLiveMatches(data.matches);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function loadFootballDataWithRetry(force) {
    var attempts = force ? MAX_ATTEMPTS : 2;
    for (var i = 0; i < attempts; i++) {
      if (await loadFootballData()) return true;
      if (i < attempts - 1) await sleep(RETRY_MS * (i + 1));
    }
    return false;
  }

  var _origLoadData = (typeof loadData === "function") ? loadData : null;
  loadData = async function (force) {
    var ok = await loadFootballDataWithRetry(!!force);
    if (ok) return;

    if (!state.matches.length) hydrateFromCache();

    if (!state.matches.length && _origLoadData) {
      await _origLoadData(force);
    }

    if (!state.matches.length) {
      state.dataSource = "static";
      state._loadFailed = true;
    }
    updateHeaderStats();
    renderAll();
  };

  var timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  window.__wcScheduleSync = function () {
    schedule(pollMs());
  };

  function tick() {
    if (document.hidden) {
      schedule(300000);
      return;
    }
    Promise.resolve(loadData(false)).finally(function () {
      schedule(pollMs());
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      loadData(false).finally(function () { schedule(WAKE_MS); });
    }
  });

  function purgeEmbeddedBlob() {
    var el = document.getElementById("wc-embedded-cache");
    if (el && el.textContent && el.textContent.length > 4) el.textContent = "{}";
  }

  async function start() {
    window.__wcLivePollingStarted = true;
    purgeEmbeddedBlob();
    seedTeams();

    if (typeof startOfDay === "function" && !state.viewDate) {
      state.viewDate = startOfDay(new Date());
    }
    if (state.curDayKey === null || state.curDayKey === undefined) {
      var now = new Date();
      state.curDayKey = pad(now.getMonth() + 1) + "/" + pad(now.getDate()) + "/" + now.getFullYear();
    }

    var upd = document.getElementById("upd");
    if (upd) upd.textContent = "Fetching live scores…";

    // Instant paint from last good snapshot while server finishes booting.
    if (!state.matches.length) hydrateFromCache();

    if (typeof renderToday === "function" && !state.matches.length) renderToday();

    await loadData(true);
    schedule(pollMs());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
