/**
 * World Cup Insights — D3, Leaflet choropleth, force networks, SVG heatmaps, radar charts.
 */
const WCAnalytics = (() => {
  const API_BASE = window.WC_API_URL || 'http://localhost:8000';
  const BUNDLE_FALLBACK = 'data/analytics-bundle.json';
  const GEO_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

  let bundle = null;
  let charts = { radar: null };
  let maps = { choropleth: null, venues: null };

  const ISO_NAME = {
    DZA:'Algeria',ARG:'Argentina',AUS:'Australia',BRA:'Brazil',CAN:'Canada',CHN:'China',
    COL:'Colombia',CRI:'Costa Rica',CRO:'Croatia',ECU:'Ecuador',EGY:'Egypt',ENG:'England',
    FRA:'France',DEU:'Germany',GHA:'Ghana',IRN:'Iran',ITA:'Italy',JPN:'Japan',MEX:'Mexico',
    MAR:'Morocco',NLD:'Netherlands',NOR:'Norway',POL:'Poland',POR:'Portugal',QAT:'Qatar',
    KOR:'South Korea',ESP:'Spain',SEN:'Senegal',CHE:'Switzerland',TUN:'Tunisia',USA:'USA',
    URY:'Uruguay',GBR:'England',BEL:'Belgium',SRB:'Serbia',CZE:'Czech Republic',ROU:'Romania',
    HUN:'Hungary',SWE:'Sweden',AUT:'Austria',CHL:'Chile',PER:'Peru',PRY:'Paraguay',CMR:'Cameroon',
    NGA:'Nigeria',ZAF:'South Africa',RUS:'Russia',UKR:'Ukraine',TUR:'Turkey',DNK:'Denmark',
    ISL:'Iceland',PAN:'Panama',IRQ:'Iraq',JOR:'Jordan',UZB:'Uzbekistan',COD:'DR Congo',
  };

  async function loadBundle() {
    if (bundle) return bundle;
    try {
      const r = await fetch(`${API_BASE}/api/analytics/bundle`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) { bundle = await r.json(); return bundle; }
    } catch (_) {}
    const r2 = await fetch(BUNDLE_FALLBACK);
    bundle = await r2.json();
    return bundle;
  }

  function destroyCharts() {
    if (charts.radar) { charts.radar.destroy(); charts.radar = null; }
    maps.choropleth?.remove(); maps.choropleth = null;
    maps.venues?.remove(); maps.venues = null;
  }

  // ── D3 Historical Trends ──────────────────────────────────────
  function renderTrends(el, data) {
    const trends = data.trends;
    const margin = { top: 24, right: 24, bottom: 40, left: 48 };
    const W = el.clientWidth || 700;
    const H = 280;
    const iw = W - margin.left - margin.right;
    const ih = H - margin.top - margin.bottom;

    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scaleBand().domain(trends.map(d => String(d.year))).range([0, iw]).padding(0.15);
    const y = d3.scaleLinear().domain([0, d3.max(trends, d => d.avgGoals) * 1.15]).range([ih, 0]);

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(x.domain().filter((_, i) => i % 2 === 0)))
      .selectAll('text').attr('fill', '#94a3b8').attr('font-size', 10);
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1)))
      .selectAll('text').attr('fill', '#94a3b8').attr('font-size', 10);

    g.selectAll('.bar').data(trends).join('rect')
      .attr('x', d => x(String(d.year)))
      .attr('y', d => y(d.avgGoals))
      .attr('width', x.bandwidth())
      .attr('height', d => ih - y(d.avgGoals))
      .attr('fill', '#3b82f6')
      .attr('rx', 3)
      .style('opacity', 0.85)
      .on('mouseenter', function (_, d) {
        d3.select(this).attr('fill', '#f59e0b');
        tip.style('opacity', 1).html(`<b>${d.year}</b> · ${d.host}<br>${d.avgGoals} goals/match · ${d.goals} total<br>🏆 ${d.champion || '—'}`);
      })
      .on('mousemove', (ev) => tip.style('left', `${ev.offsetX + 12}px`).style('top', `${ev.offsetY - 8}px`))
      .on('mouseleave', function () { d3.select(this).attr('fill', '#3b82f6'); tip.style('opacity', 0); });

    const line = d3.line().x(d => x(String(d.year)) + x.bandwidth() / 2).y(d => y(d.avgGoals)).curve(d3.curveMonotoneX);
    g.append('path').datum(trends).attr('fill', 'none').attr('stroke', '#fcd34d').attr('stroke-width', 2).attr('d', line);

    const tip = d3.select(el).append('div').attr('class', 'viz-tooltip').style('opacity', 0);
  }

  // ── Leaflet Choropleth ────────────────────────────────────────
  async function renderChoropleth(el, countries, metric) {
    maps.choropleth?.remove();
    el.innerHTML = '';
    const mapEl = document.createElement('div');
    mapEl.className = 'choropleth-map';
    mapEl.style.height = '380px';
    el.appendChild(mapEl);

    const lookup = Object.fromEntries(countries.map(c => [c.iso, c]));
    const vals = countries.map(c => c[metric] || 0);
    const max = Math.max(...vals, 1);
    const color = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, max]);

    const map = L.map(mapEl, { scrollWheelZoom: false, attributionControl: true }).setView([20, 0], 2);
    maps.choropleth = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 6,
    }).addTo(map);

    const geo = await d3.json(GEO_URL);
    const layer = L.geoJSON(geo, {
      style: f => {
        const iso = f.properties.ISO_A3;
        const v = lookup[iso]?.[metric] || 0;
        return { fillColor: v ? color(v) : '#0c1530', weight: 0.5, color: '#1e293b', fillOpacity: v ? 0.82 : 0.35 };
      },
      onEachFeature: (f, l) => {
        const iso = f.properties.ISO_A3;
        const d = lookup[iso];
        const name = f.properties.ADMIN || ISO_NAME[iso] || iso;
        const v = d?.[metric] ?? 0;
        l.bindPopup(`<b>${name}</b><br>${metric}: <b>${v}</b>${d?.teamNames ? '<br><span style="opacity:.7">'+d.teamNames.join(', ')+'</span>' : ''}`);
      },
    }).addTo(map);

    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = `<span class="ml-title">${metric}</span>` +
      [0, 0.25, 0.5, 0.75, 1].map(t => `<span class="ml-swatch" style="background:${color(t * max)}"></span>`).join('') +
      `<span class="ml-labels"><span>0</span><span>${max}</span></span>`;
    el.appendChild(legend);
  }

  // ── D3 Force-Directed Network ─────────────────────────────────
  function renderForceNetwork(el, graph, title) {
    const W = el.clientWidth || 600;
    const H = 360;
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');

    const nodes = graph.nodes.map(d => ({ ...d }));
    const links = graph.links.map(d => ({ ...d }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 80 / Math.sqrt(d.weight || 1)).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => d.type === 'player' ? 10 : 16));

    const link = svg.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#334155').attr('stroke-opacity', 0.5)
      .attr('stroke-width', d => Math.sqrt(d.weight || 1));

    const node = svg.append('g').selectAll('g').data(nodes).join('g').call(
      d3.drag().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

    node.append('circle')
      .attr('r', d => d.type === 'player' ? 5 + Math.min(d.goals || 1, 5) : 12)
      .attr('fill', d => d.type === 'player' ? '#60a5fa' : '#f59e0b')
      .attr('stroke', '#0f172a').attr('stroke-width', 1.5);

    node.append('text').text(d => d.type === 'team' ? (d.label || '').slice(0, 3).toUpperCase() : '')
      .attr('text-anchor', 'middle').attr('dy', 4).attr('fill', '#0f172a').attr('font-size', 8).attr('font-weight', 700);

    node.append('title').text(d => d.type === 'player' ? `${d.label} (${d.goals} goals)` : d.label);

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
  }

  // ── SVG Goal Heatmap (D3) ─────────────────────────────────────
  function renderGoalHeatmap(el, data) {
    const bins = data.bins;
    const matrix = data.matrix || [];
    const W = el.clientWidth || 600;
    el.innerHTML = '';

    const row1H = 120;
    const row2H = matrix.length * 36 + 40;
    const H = row1H + row2H + 20;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');

    const maxB = d3.max(bins, d => d.goals) || 1;
    const cw = Math.min(56, (W - 80) / bins.length);
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, maxB]);

    svg.append('text').text('Goals by Match Minute (all World Cups)').attr('x', 16).attr('y', 22)
      .attr('fill', '#94a3b8').attr('font-size', 11).attr('font-weight', 700);

    const g1 = svg.append('g').attr('transform', 'translate(40,36)');
    g1.selectAll('rect').data(bins).join('rect')
      .attr('x', (_, i) => i * (cw + 4))
      .attr('y', 0)
      .attr('width', cw)
      .attr('height', d => 12 + (d.goals / maxB) * 56)
      .attr('y', d => 70 - (d.goals / maxB) * 56)
      .attr('fill', d => color(d.goals))
      .attr('rx', 3)
      .append('title').text(d => `${d.label}: ${d.goals} goals`);

    g1.selectAll('.lbl').data(bins).join('text')
      .attr('class', 'lbl').attr('x', (_, i) => i * (cw + 4) + cw / 2)
      .attr('y', 82).attr('text-anchor', 'middle').attr('fill', '#64748b').attr('font-size', 8)
      .text(d => d.label.replace("'", ''));

    if (matrix.length) {
      const maxM = d3.max(matrix, r => Math.max(r.firstHalf, r.secondHalf)) || 1;
      const g2 = svg.append('g').attr('transform', `translate(40,${row1H + 10})`);
      g2.append('text').text('Era × Half Heatmap').attr('x', 0).attr('y', 0)
        .attr('fill', '#94a3b8').attr('font-size', 11).attr('font-weight', 700);

      matrix.forEach((row, i) => {
        const y = 20 + i * 36;
        g2.append('text').text(row.era).attr('x', 0).attr('y', y + 22).attr('fill', '#94a3b8').attr('font-size', 10);
        [['1st Half', row.firstHalf], ['2nd Half', row.secondHalf]].forEach(([lbl, v], j) => {
          const x = 90 + j * 120;
          g2.append('rect').attr('x', x).attr('y', y).attr('width', 100).attr('height', 28)
            .attr('fill', d3.interpolateOrRd(v / maxM)).attr('rx', 4);
          g2.append('text').text(`${lbl}: ${v}`).attr('x', x + 50).attr('y', y + 18)
            .attr('text-anchor', 'middle').attr('fill', '#f1f5f9').attr('font-size', 9);
        });
      });
    }

    const half = data.byHalf || {};
    svg.append('text').text(`1st: ${half.first || 0} · 2nd: ${half.second || 0} · ET: ${half.extra || 0}`)
      .attr('x', 40).attr('y', H - 8).attr('fill', '#64748b').attr('font-size', 10);
  }

  // ── Chart.js Radar ────────────────────────────────────────────
  function renderRadar(canvas, radarData) {
    if (charts.radar) charts.radar.destroy();
    const teams = radarData.teams;
    if (!teams.length) return;

    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a78bfa', '#f472b6'];
    charts.radar = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: radarData.labels,
        datasets: teams.map((t, i) => ({
          label: t.team,
          data: t.values,
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '33',
          borderWidth: 2,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: { color: 'rgba(148,163,184,.12)' },
            angleLines: { color: 'rgba(148,163,184,.1)' },
            pointLabels: { color: '#94a3b8', font: { size: 10, weight: '600' } },
          },
        },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const raw = teams[ctx.datasetIndex]?.raw;
                if (!raw) return '';
                const keys = ['winPct', 'gfPerGame', 'gaPerGame', 'gdPerGame', 'cleanSheetPct', 'bttsPct'];
                return `Raw: ${raw[keys[ctx.dataIndex]]}`;
              },
            },
          },
        },
      },
    });
  }

  // ── Venues + Diaspora Map ─────────────────────────────────────
  function renderVenuesMap(el, data) {
    maps.venues?.remove();
    el.innerHTML = '';
    const mapEl = document.createElement('div');
    mapEl.className = 'choropleth-map';
    mapEl.style.height = '400px';
    el.appendChild(mapEl);

    const map = L.map(mapEl, { scrollWheelZoom: false }).setView([39, -98], 4);
    maps.venues = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 8 }).addTo(map);

    const flag = n => (typeof NAME_FLAGS !== 'undefined' ? NAME_FLAGS[n] : null) || '🏟';

    data.venues.forEach(v => {
      L.circleMarker([v.lat, v.lng], {
        radius: 8 + v.cap / 20000, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.75, weight: 2,
      }).addTo(map).bindPopup(`<b>${v.name}</b><br>${v.city}, ${v.country}<br>Capacity: ${v.cap.toLocaleString()}`);
    });

    const narrative = document.createElement('div');
    narrative.className = 'diaspora-note';
    narrative.innerHTML = `<b>${data.totalNations} nations</b> converge on 16 host venues across USA, Mexico & Canada — ` +
      `a tournament where humanity in sport crosses every border. ` +
      `<span style="color:var(--t3)">Blue nodes = venues · Gold rings sized by capacity</span>`;
    el.appendChild(narrative);
  }

  // ── Main render ───────────────────────────────────────────────
  async function renderAll() {
    const root = document.getElementById('insights-panels');
    if (!root) return;
    root.innerHTML = '<div class="loading"><span class="spinner"></span>Loading analytics…</div>';

    try {
      const b = await loadBundle();
      destroyCharts();
      root.innerHTML = `
        <div class="insights-grid">
          <div class="viz-card viz-wide"><div class="viz-card-hdr">Historical Trends <span class="viz-tag">D3.js</span></div><div id="viz-trends" class="viz-body"></div></div>
          <div class="viz-card viz-wide"><div class="viz-card-hdr">Global Choropleth <span class="viz-tag">Leaflet</span>
            <select id="choropleth-metric" class="fsel viz-sel"><option value="titles">World Cup Titles</option><option value="appearances">Appearances</option><option value="goals">Total Goals</option></select>
          </div><div id="viz-choropleth" class="viz-body"></div></div>
          <div class="viz-card"><div class="viz-card-hdr">Team Radar <span class="viz-tag">Spider Chart</span></div>
            <div class="viz-controls" id="radar-teams"></div>
            <div class="radar-wrap"><canvas id="viz-radar"></canvas></div>
          </div>
          <div class="viz-card"><div class="viz-card-hdr">Goal Timing <span class="viz-tag">SVG Heatmap</span></div><div id="viz-heatmap" class="viz-body"></div></div>
          <div class="viz-card viz-wide"><div class="viz-card-hdr">Match Network <span class="viz-tag">Force-Directed</span></div><div id="viz-network" class="viz-body viz-tall"></div></div>
          <div class="viz-card viz-wide"><div class="viz-card-hdr">Scorer ↔ Nation Network <span class="viz-tag">D3 Force</span></div><div id="viz-players" class="viz-body viz-tall"></div></div>
          <div class="viz-card viz-wide"><div class="viz-card-hdr">2026 Host Venues & Global Reach <span class="viz-tag">Leaflet</span></div><div id="viz-venues" class="viz-body"></div></div>
        </div>`;

      renderTrends(document.getElementById('viz-trends'), b.historicalTrends);

      const metricSel = document.getElementById('choropleth-metric');
      const chorData = { titles: b.choropleth, goals: b.choroplethGoals, appearances: b.choroplethApps };
      const drawMap = () => renderChoropleth(document.getElementById('viz-choropleth'), chorData[metricSel.value].countries, metricSel.value);
      metricSel.onchange = drawMap;
      await drawMap();

      const radarSel = document.getElementById('radar-teams');
      const avail = b.teamRadar.available ||
        Object.keys(b.teamStatsFull || {}).sort((a, c) => (b.teamStatsFull[c]?.wins || 0) - (b.teamStatsFull[a]?.wins || 0));
      avail.slice(0, 16).forEach(t => {
        const lbl = document.createElement('label');
        lbl.className = 'radar-chk';
        lbl.innerHTML = `<input type="checkbox" value="${t}" ${['Brazil','Germany','Argentina','France'].includes(t)?'checked':''}> ${t}`;
        radarSel.appendChild(lbl);
      });
      const updateRadar = async () => {
        const selected = [...radarSel.querySelectorAll('input:checked')].map(i => i.value).slice(0, 4);
        let rd = b.teamRadar;
        if (selected.length) {
          try {
            const r = await fetch(`${API_BASE}/api/analytics/team-radar?teams=${encodeURIComponent(selected.join(','))}`, { signal: AbortSignal.timeout(3000) });
            if (r.ok) rd = await r.json();
            else rd = computeClientRadar(b, selected);
          } catch (_) {
            rd = computeClientRadar(b, selected);
          }
        }
        renderRadar(document.getElementById('viz-radar'), rd);
      };
      radarSel.onchange = updateRadar;
      updateRadar();

      renderGoalHeatmap(document.getElementById('viz-heatmap'), b.goalHeatmap);
      renderForceNetwork(document.getElementById('viz-network'), b.network);
      renderForceNetwork(document.getElementById('viz-players'), b.playerNetwork);
      renderVenuesMap(document.getElementById('viz-venues'), b.venues);

      const src = document.getElementById('insights-src');
      if (src) {
        try {
          await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
          src.textContent = 'api'; src.className = 'data-src live';
        } catch (_) {
          src.textContent = 'bundled'; src.className = 'data-src cache';
        }
      }
    } catch (e) {
      root.innerHTML = `<div class="empty">Analytics failed to load. ${e.message}</div>`;
    }
  }

  function computeClientRadar(b, teams) {
    const labels = b.teamRadar.labels;
    const full = b.teamStatsFull || {};
    const metrics = [];
    for (const name of teams) {
      const s = full[name];
      if (!s || !s.played) continue;
      const p = s.played;
      metrics.push({
        team: name,
        raw: {
          winPct: Math.round(100 * s.wins / p * 10) / 10,
          gfPerGame: Math.round(s.gf / p * 100) / 100,
          gaPerGame: Math.round(s.ga / p * 100) / 100,
          gdPerGame: Math.round((s.gf - s.ga) / p * 100) / 100,
          cleanSheetPct: Math.round(100 * s.cleanSheets / p * 10) / 10,
          bttsPct: Math.round(100 * s.btts / p * 10) / 10,
        },
      });
    }
    const norm = (val, lo, hi) => hi <= lo ? 50 : Math.round(Math.max(5, Math.min(100, 5 + 90 * (val - lo) / (hi - lo))) * 10) / 10;
    for (const m of metrics) {
      const r = m.raw;
      m.values = [
        norm(r.winPct, 20, 70), norm(r.gfPerGame, 0.5, 2.5), norm(3.0 - r.gaPerGame, 0.5, 2.5),
        norm(r.gdPerGame, -0.5, 1.5), norm(r.cleanSheetPct, 10, 50), norm(r.bttsPct, 30, 70),
      ];
    }
    return { labels, teams: metrics };
  }

  return { loadBundle, renderAll, destroyCharts };
})();