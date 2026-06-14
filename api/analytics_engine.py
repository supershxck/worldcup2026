"""Pre-compute World Cup analytics from openfootball/worldcup.json."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

import httpx

HIST_BASE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master"
HIST_YEARS = [
    1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982,
    1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
]

WC_HOSTS = {
    1930: "Uruguay", 1934: "Italy", 1938: "France", 1950: "Brazil",
    1954: "Switzerland", 1958: "Sweden", 1962: "Chile", 1966: "England",
    1970: "Mexico", 1974: "West Germany", 1978: "Argentina", 1982: "Spain",
    1986: "Mexico", 1990: "Italy", 1994: "United States", 1998: "France",
    2002: "Japan", 2006: "Germany", 2010: "South Africa", 2014: "Brazil",
    2018: "Russia", 2022: "Qatar",
}

# Team name → ISO 3166-1 alpha-3 for choropleth
TEAM_ISO = {
    "Algeria": "DZA", "Angola": "AGO", "Argentina": "ARG", "Australia": "AUS",
    "Austria": "AUT", "Belgium": "BEL", "Bolivia": "BOL",
    "Bosnia-Herzegovina": "BIH", "Brazil": "BRA", "Bulgaria": "BGR",
    "Cameroon": "CMR", "Canada": "CAN", "Chile": "CHL", "China": "CHN",
    "Colombia": "COL", "Costa Rica": "CRI", "Croatia": "HRV", "Cuba": "CUB",
    "Czech Republic": "CZE", "Czechoslovakia": "CZE", "Côte d'Ivoire": "CIV",
    "Denmark": "DNK", "Dutch East Indies": "IDN", "East Germany": "DEU",
    "Ecuador": "ECU", "Egypt": "EGY", "El Salvador": "SLV", "England": "GBR",
    "France": "FRA", "Germany": "DEU", "Ghana": "GHA", "Greece": "GRC",
    "Haiti": "HTI", "Honduras": "HND", "Hungary": "HUN", "Iceland": "ISL",
    "Iran": "IRN", "Iraq": "IRQ", "Ireland": "IRL", "Israel": "ISR",
    "Italy": "ITA", "Jamaica": "JAM", "Japan": "JPN", "Kuwait": "KWT",
    "Mexico": "MEX", "Morocco": "MAR", "Netherlands": "NLD", "New Zealand": "NZL",
    "Nigeria": "NGA", "North Korea": "PRK", "Northern Ireland": "GBR",
    "Norway": "NOR", "Panama": "PAN", "Paraguay": "PRY", "Peru": "PER",
    "Poland": "POL", "Portugal": "PRT", "Qatar": "QAT", "Romania": "ROU",
    "Russia": "RUS", "Saudi Arabia": "SAU", "Scotland": "GBR", "Senegal": "SEN",
    "Serbia": "SRB", "Serbia and Montenegro": "SRB", "Slovakia": "SVK",
    "Slovenia": "SVN", "South Africa": "ZAF", "South Korea": "KOR",
    "Soviet Union": "RUS", "Spain": "ESP", "Sweden": "SWE", "Switzerland": "CHE",
    "Togo": "TGO", "Trinidad and Tobago": "TTO", "Tunisia": "TUN", "Turkey": "TUR",
    "USA": "USA", "Ukraine": "UKR", "United Arab Emirates": "ARE",
    "United States": "USA", "Uruguay": "URY", "Wales": "GBR",
    "West Germany": "DEU", "Yugoslavia": "SRB", "Zaire": "COD",
    "Curaçao": "CUW", "Cape Verde": "CPV", "Congo DR": "COD",
    "Uzbekistan": "UZB", "Jordan": "JOR", "Bosnia & Herz.": "BIH",
}

VENUES_2026 = [
    {"name": "Estadio Azteca", "city": "Mexico City", "country": "Mexico", "lat": 19.303, "lng": -99.150, "cap": 83000},
    {"name": "AT&T Stadium", "city": "Dallas", "country": "USA", "lat": 32.748, "lng": -97.093, "cap": 94000},
    {"name": "MetLife Stadium", "city": "New York", "country": "USA", "lat": 40.813, "lng": -74.074, "cap": 82500},
    {"name": "SoFi Stadium", "city": "Los Angeles", "country": "USA", "lat": 33.953, "lng": -118.339, "cap": 70000},
    {"name": "Hard Rock Stadium", "city": "Miami", "country": "USA", "lat": 25.958, "lng": -80.239, "cap": 65000},
    {"name": "Mercedes-Benz Stadium", "city": "Atlanta", "country": "USA", "lat": 33.755, "lng": -84.401, "cap": 75000},
    {"name": "NRG Stadium", "city": "Houston", "country": "USA", "lat": 29.685, "lng": -95.411, "cap": 72000},
    {"name": "Lincoln Financial Field", "city": "Philadelphia", "country": "USA", "lat": 39.901, "lng": -75.168, "cap": 69000},
    {"name": "Levi's Stadium", "city": "San Francisco", "country": "USA", "lat": 37.403, "lng": -121.970, "cap": 71000},
    {"name": "Lumen Field", "city": "Seattle", "country": "USA", "lat": 47.595, "lng": -122.332, "cap": 69000},
    {"name": "Gillette Stadium", "city": "Boston", "country": "USA", "lat": 42.091, "lng": -71.264, "cap": 65000},
    {"name": "Arrowhead Stadium", "city": "Kansas City", "country": "USA", "lat": 39.049, "lng": -94.484, "cap": 73000},
    {"name": "Estadio Akron", "city": "Guadalajara", "country": "Mexico", "lat": 20.682, "lng": -103.462, "cap": 48000},
    {"name": "Estadio BBVA", "city": "Monterrey", "country": "Mexico", "lat": 25.670, "lng": -100.244, "cap": 53500},
    {"name": "BC Place", "city": "Vancouver", "country": "Canada", "lat": 49.277, "lng": -123.112, "cap": 54000},
    {"name": "BMO Field", "city": "Toronto", "country": "Canada", "lat": 43.633, "lng": -79.419, "cap": 45000},
]


def _score(m: dict) -> tuple[int | None, int | None]:
    s = m.get("score") or {}
    if "p" in s:
        return s["p"][0], s["p"][1]
    if "et" in s:
        return s["et"][0], s["et"][1]
    if "ft" in s:
        return s["ft"][0], s["ft"][1]
    return None, None


def _champion(matches: list, year: int) -> str | None:
    final = next((m for m in matches if (m.get("round") or "").lower() == "final"), None)
    if final:
        hs, as_ = _score(final)
        if hs is not None and hs != as_:
            return final["team1"] if hs > as_ else final["team2"]
    if year == 1950:
        dec = next(
            (m for m in matches if m.get("round") == "Final Round"
             and {m["team1"], m["team2"]} == {"Uruguay", "Brazil"}),
            None,
        )
        if dec:
            hs, as_ = _score(dec)
            if hs is not None and hs != as_:
                return dec["team1"] if hs > as_ else dec["team2"]
    return None


def _goal_minute(g: dict) -> int | None:
    try:
        m = int(g.get("minute", 0))
        off = int(g.get("offset", 0) or 0)
        return min(120, m + off)
    except (TypeError, ValueError):
        return None


class AnalyticsEngine:
    def __init__(self) -> None:
        self.tournaments: dict[int, list[dict]] = {}
        self.ready = False

    async def load(self) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            tasks = [self._fetch_year(client, y) for y in HIST_YEARS]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        for year, result in zip(HIST_YEARS, results):
            if isinstance(result, list):
                self.tournaments[year] = result
        self.ready = True

    async def _fetch_year(self, client: httpx.AsyncClient, year: int) -> list[dict]:
        url = f"{HIST_BASE}/{year}/worldcup.json"
        r = await client.get(url)
        r.raise_for_status()
        return r.json().get("matches", [])

    def historical_trends(self) -> dict[str, Any]:
        trends = []
        titles: dict[str, int] = defaultdict(int)
        for year in HIST_YEARS:
            matches = self.tournaments.get(year, [])
            if not matches:
                continue
            goals = 0
            played = 0
            for m in matches:
                hs, as_ = _score(m)
                if hs is None:
                    continue
                played += 1
                goals += hs + as_
            champ = _champion(matches, year)
            if champ:
                titles[champ] += 1
            trends.append({
                "year": year,
                "host": WC_HOSTS.get(year, ""),
                "matches": played,
                "goals": goals,
                "avgGoals": round(goals / played, 2) if played else 0,
                "teams": len({t for m in matches for t in (m["team1"], m["team2"])}),
                "champion": champ,
            })
        return {"trends": trends, "titleCounts": dict(sorted(titles.items(), key=lambda x: -x[1]))}

    def choropleth(self, metric: str = "titles") -> dict[str, Any]:
        by_iso: dict[str, dict] = defaultdict(lambda: {
            "titles": 0, "appearances": 0, "goals": 0, "matches": 0, "teams": set(),
        })
        for year in HIST_YEARS:
            matches = self.tournaments.get(year, [])
            champ = _champion(matches, year)
            if champ:
                iso = TEAM_ISO.get(champ)
                if iso:
                    by_iso[iso]["titles"] += 1
            seen = set()
            for m in matches:
                hs, as_ = _score(m)
                for team, gf in ((m["team1"], hs), (m["team2"], as_)):
                    iso = TEAM_ISO.get(team)
                    if not iso:
                        continue
                    if team not in seen:
                        by_iso[iso]["appearances"] += 1
                        by_iso[iso]["teams"].add(team)
                        seen.add(team)
                    if hs is not None and gf is not None:
                        by_iso[iso]["goals"] += gf
                        by_iso[iso]["matches"] += 1

        countries = []
        for iso, d in by_iso.items():
            countries.append({
                "iso": iso,
                "titles": d["titles"],
                "appearances": d["appearances"],
                "goals": d["goals"],
                "avgGoals": round(d["goals"] / d["matches"], 2) if d["matches"] else 0,
                "teamNames": sorted(d["teams"]),
            })
        key = {"titles": "titles", "appearances": "appearances", "goals": "goals"}.get(metric, "titles")
        countries.sort(key=lambda c: -c[key])
        return {"metric": metric, "countries": countries}

    def match_network(self) -> dict[str, Any]:
        edges: dict[tuple[str, str], int] = defaultdict(int)
        teams: set[str] = set()
        for matches in self.tournaments.values():
            for m in matches:
                hs, as_ = _score(m)
                if hs is None:
                    continue
                a, b = sorted([m["team1"], m["team2"]])
                edges[(a, b)] += 1
                teams.update([a, b])
        nodes = [{"id": t, "iso": TEAM_ISO.get(t, ""), "group": 1} for t in sorted(teams)]
        links = [{"source": a, "target": b, "weight": w} for (a, b), w in edges.items() if w >= 2]
        return {"nodes": nodes, "links": links}

    def goal_heatmap(self) -> dict[str, Any]:
        bins = [0] * 8  # 15-min bins: 0-14, 15-29, ... 105-120
        by_half = {"first": 0, "second": 0, "extra": 0}
        for matches in self.tournaments.values():
            for m in matches:
                for goals in (m.get("goals1") or [], m.get("goals2") or []):
                    for g in goals:
                        if g.get("owngoal"):
                            continue
                        minute = _goal_minute(g)
                        if minute is None:
                            continue
                        if minute <= 45:
                            by_half["first"] += 1
                        elif minute <= 90:
                            by_half["second"] += 1
                        else:
                            by_half["extra"] += 1
                        idx = min(7, minute // 15)
                        bins[idx] += 1
        labels = ["0-14'", "15-29'", "30-44'", "45-59'", "60-74'", "75-89'", "90-104'", "105-120'"]
        return {
            "bins": [{"label": labels[i], "goals": bins[i]} for i in range(8)],
            "byHalf": by_half,
            "matrix": self._build_matchday_matrix(),
        }

    def _build_matchday_matrix(self) -> list[dict]:
        """Goals by tournament era × half — SVG heatmap rows."""
        eras = [(1930, 1970), (1974, 1990), (1994, 2010), (2014, 2022)]
        rows = []
        for start, end in eras:
            first = second = 0
            for year in range(start, end + 1):
                for m in self.tournaments.get(year, []):
                    for goals in (m.get("goals1") or [], m.get("goals2") or []):
                        for g in goals:
                            if g.get("owngoal"):
                                continue
                            minute = _goal_minute(g)
                            if minute is None:
                                continue
                            if minute <= 45:
                                first += 1
                            else:
                                second += 1
            rows.append({"era": f"{start}–{end}", "firstHalf": first, "secondHalf": second})
        return rows

    def team_radar(self, team_names: list[str]) -> dict[str, Any]:
        stats: dict[str, dict] = defaultdict(lambda: {
            "played": 0, "wins": 0, "draws": 0, "gf": 0, "ga": 0, "cleanSheets": 0, "btts": 0,
        })
        for matches in self.tournaments.values():
            for m in matches:
                hs, as_ = _score(m)
                if hs is None:
                    continue
                for team, gf, ga in (
                    (m["team1"], hs, as_),
                    (m["team2"], as_, hs),
                ):
                    s = stats[team]
                    s["played"] += 1
                    s["gf"] += gf
                    s["ga"] += ga
                    if gf > ga:
                        s["wins"] += 1
                    elif gf == ga:
                        s["draws"] += 1
                    if ga == 0:
                        s["cleanSheets"] += 1
                    if gf > 0 and ga > 0:
                        s["btts"] += 1

        all_teams = sorted(stats.keys(), key=lambda t: -stats[t]["wins"])
        default = team_names or [t for t in ["Brazil", "Germany", "Argentina", "France"] if t in stats]
        if not default:
            default = all_teams[:4]

        def normalize(val: float, lo: float, hi: float) -> float:
            if hi <= lo:
                return 50.0
            return round(max(5, min(100, 5 + 90 * (val - lo) / (hi - lo))), 1)

        metrics = []
        for name in default:
            s = stats.get(name)
            if not s or not s["played"]:
                continue
            p = s["played"]
            metrics.append({
                "team": name,
                "iso": TEAM_ISO.get(name, ""),
                "raw": {
                    "winPct": round(100 * s["wins"] / p, 1),
                    "gfPerGame": round(s["gf"] / p, 2),
                    "gaPerGame": round(s["ga"] / p, 2),
                    "gdPerGame": round((s["gf"] - s["ga"]) / p, 2),
                    "cleanSheetPct": round(100 * s["cleanSheets"] / p, 1),
                    "bttsPct": round(100 * s["btts"] / p, 1),
                },
            })

        if not metrics:
            return {"teams": [], "labels": []}

        labels = ["Win %", "Goals/Game", "Defense", "Goal Diff", "Clean Sheets", "BTTS"]
        # Defense = inverted GA (lower is better)
        for m in metrics:
            r = m["raw"]
            m["values"] = [
                normalize(r["winPct"], 20, 70),
                normalize(r["gfPerGame"], 0.5, 2.5),
                normalize(3.0 - r["gaPerGame"], 0.5, 2.5),
                normalize(r["gdPerGame"], -0.5, 1.5),
                normalize(r["cleanSheetPct"], 10, 50),
                normalize(r["bttsPct"], 30, 70),
            ]

        return {"labels": labels, "teams": metrics, "available": all_teams[:48]}

    def venues_diaspora(self) -> dict[str, Any]:
        """2026 host venues + participating nation origins (2026 teams)."""
        teams_2026 = [
            "Mexico", "South Africa", "South Korea", "Czech Republic", "Canada", "Switzerland",
            "Qatar", "Bosnia-Herzegovina", "Brazil", "Morocco", "Haiti", "Scotland", "USA",
            "Paraguay", "Australia", "Turkey", "Germany", "Curaçao", "Côte d'Ivoire", "Ecuador",
            "Netherlands", "Japan", "Tunisia", "Sweden", "Belgium", "Egypt", "Iran", "New Zealand",
            "Spain", "Cape Verde", "Saudi Arabia", "Uruguay", "France", "Senegal", "Norway", "Iraq",
            "Argentina", "Algeria", "Austria", "Jordan", "Portugal", "Colombia", "Uzbekistan",
            "Congo DR", "England", "Croatia", "Ghana", "Panama",
        ]
        # Map team → approximate diaspora regions (continent groupings for narrative viz)
        origins = []
        for t in teams_2026:
            iso = TEAM_ISO.get(t.replace("Bosnia & Herz.", "Bosnia-Herzegovina").replace("Congo DR", "Zaire"), "")
            origins.append({"team": t, "iso": iso})
        return {"venues": VENUES_2026, "participants": origins, "totalNations": len(origins)}

    def player_network(self) -> dict[str, Any]:
        """Scorer relationships — players linked to national teams (club data unavailable)."""
        players: dict[str, dict] = {}
        for year, matches in self.tournaments.items():
            for m in matches:
                for team, goals in ((m["team1"], m.get("goals1") or []), (m["team2"], m.get("goals2") or [])):
                    for g in goals:
                        if g.get("owngoal"):
                            continue
                        name = g.get("name", "").strip()
                        if not name:
                            continue
                        key = name.lower()
                        if key not in players:
                            players[key] = {"name": name, "teams": set(), "goals": 0, "tournaments": set()}
                        players[key]["teams"].add(team)
                        players[key]["goals"] += 1
                        players[key]["tournaments"].add(year)

        top = sorted(players.values(), key=lambda p: -p["goals"])[:40]
        nodes = []
        links = []
        node_ids: set[str] = set()
        for p in top:
            pid = f"p:{p['name']}"
            nodes.append({"id": pid, "type": "player", "goals": p["goals"], "label": p["name"]})
            node_ids.add(pid)
            for team in p["teams"]:
                tid = f"t:{team}"
                if tid not in node_ids:
                    nodes.append({"id": tid, "type": "team", "label": team, "iso": TEAM_ISO.get(team, "")})
                    node_ids.add(tid)
                links.append({"source": pid, "target": tid, "weight": p["goals"]})
        return {"nodes": nodes, "links": links}

    def _all_team_stats(self) -> dict[str, dict]:
        stats: dict[str, dict] = defaultdict(lambda: {
            "played": 0, "wins": 0, "draws": 0, "gf": 0, "ga": 0, "cleanSheets": 0, "btts": 0,
        })
        for matches in self.tournaments.values():
            for m in matches:
                hs, as_ = _score(m)
                if hs is None:
                    continue
                for team, gf, ga in ((m["team1"], hs, as_), (m["team2"], as_, hs)):
                    s = stats[team]
                    s["played"] += 1
                    s["gf"] += gf
                    s["ga"] += ga
                    if gf > ga:
                        s["wins"] += 1
                    elif gf == ga:
                        s["draws"] += 1
                    if ga == 0:
                        s["cleanSheets"] += 1
                    if gf > 0 and ga > 0:
                        s["btts"] += 1
        return dict(stats)

    def bundle(self) -> dict[str, Any]:
        return {
            "historicalTrends": self.historical_trends(),
            "choropleth": self.choropleth("titles"),
            "choroplethGoals": self.choropleth("goals"),
            "choroplethApps": self.choropleth("appearances"),
            "network": self.match_network(),
            "playerNetwork": self.player_network(),
            "goalHeatmap": self.goal_heatmap(),
            "teamRadar": self.team_radar([]),
            "teamStatsFull": self._all_team_stats(),
            "venues": self.venues_diaspora(),
        }