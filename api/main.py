"""World Cup 2026 Analytics API — pre-computed visualizations for the dashboard."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from analytics_engine import AnalyticsEngine

engine = AnalyticsEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await engine.load()
    yield


app = FastAPI(title="World Cup Analytics API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "tournaments": len(engine.tournaments), "ready": engine.ready}


@app.get("/api/analytics/bundle")
async def analytics_bundle():
    return engine.bundle()


@app.get("/api/analytics/historical-trends")
async def historical_trends():
    return engine.historical_trends()


@app.get("/api/analytics/choropleth")
async def choropleth(metric: str = Query("titles", pattern="^(titles|appearances|goals)$")):
    return engine.choropleth(metric)


@app.get("/api/analytics/network")
async def match_network():
    return engine.match_network()


@app.get("/api/analytics/player-network")
async def player_network():
    return engine.player_network()


@app.get("/api/analytics/goal-heatmap")
async def goal_heatmap():
    return engine.goal_heatmap()


@app.get("/api/analytics/team-radar")
async def team_radar(teams: str = Query("Brazil,Germany,Argentina,France")):
    names = [t.strip() for t in teams.split(",") if t.strip()]
    return engine.team_radar(names)


@app.get("/api/analytics/venues")
async def venues():
    return engine.venues_diaspora()