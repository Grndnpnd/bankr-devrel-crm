/**
 * A dashboard as an artifact: a page of panels that reads live CRM data through the
 * `crm` capability (window.claude.use('crm').query(spec)), so every viewer sees the
 * numbers they're allowed to see, refreshed every minute. Built by the agent's
 * build_dashboard tool; the page is plain HTML anyone with edit access can change.
 */
import type { AnalyticsSpec } from '@/lib/analyticsSpec';

export interface DashboardPanel { spec: AnalyticsSpec; wide?: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The capability declaration a dashboard page carries. */
export const DASHBOARD_CAPABILITIES = { crm: {}, user: {} };

export function dashboardHtml(title: string, panels: DashboardPanel[], subtitle?: string) {
  const data = JSON.stringify(panels).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg:#f7f7f5; --card:#ffffff; --ink:#1b1b1b; --muted:#6b6b6b; --line:#e6e6e2; --accent:#d9480f; --bar:#e8590c; --err:#c92a2a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0f0f0f; --card:#181818; --ink:#efefef; --muted:#8f8f8f; --line:#2a2a2a; --accent:#f5a623; --bar:#f5a623; --err:#ff6b6b; } }
:root[data-theme="dark"] { --bg:#0f0f0f; --card:#181818; --ink:#efefef; --muted:#8f8f8f; --line:#2a2a2a; --accent:#f5a623; --bar:#f5a623; --err:#ff6b6b; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding:24px 16px 8px; max-width:1200px; margin:0 auto; }
h1 { margin:0; font-size:22px; letter-spacing:-0.01em; }
.sub { color:var(--muted); font-size:13px; margin-top:4px; }
main { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; padding:12px 16px 32px; max-width:1200px; margin:0 auto; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; min-width:0; }
.card.wide { grid-column:1 / -1; }
.card h2 { margin:0 0 10px; font-size:13px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; }
.stat { font-size:40px; font-weight:700; color:var(--accent); line-height:1.1; }
.note { color:var(--muted); font-size:12px; margin-top:6px; }
.err { color:var(--err); font-size:13px; }
.bars { display:grid; gap:6px; }
.bar { display:grid; grid-template-columns:minmax(80px, 38%) 1fr auto; gap:8px; align-items:center; font-size:12.5px; }
.bar .l { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bar .t { height:10px; border-radius:5px; background:var(--line); overflow:hidden; }
.bar .f { height:100%; background:var(--bar); border-radius:5px; }
.bar .v { font-variant-numeric:tabular-nums; color:var(--muted); }
.tablewrap { overflow:auto; max-height:420px; }
table { width:100%; border-collapse:collapse; font-size:12.5px; }
th { text-align:left; color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; padding:6px 8px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--card); }
td { padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap; max-width:260px; overflow:hidden; text-overflow:ellipsis; }
.legend { display:grid; gap:4px; font-size:12.5px; }
.legend span.k { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; vertical-align:middle; }
.pie { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
svg text { fill:var(--muted); font-size:10px; }
footer { color:var(--muted); font-size:12px; text-align:center; padding:0 16px 24px; }
</style>
</head>
<body>
<header><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}<div class="sub" id="updated">Loading live data…</div></header>
<main id="grid"></main>
<footer>Live from the CRM — each person sees only the programs and data they have access to.</footer>
<script type="application/json" id="panels">${data}</script>
<script>
(function () {
  var PANELS = JSON.parse(document.getElementById('panels').textContent);
  var COLORS = ['#e8590c', '#1971c2', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#e67700', '#5f3dc4', '#868e96', '#495057'];
  var NOUN = { beta_reports: 'report', beta_testers: 'tester', beta_outreach: 'message', beta_payouts: 'payout', artifacts: 'artifact' };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : String(n); }
  function cell(v) { if (typeof v === 'boolean') return v ? 'Yes' : 'No'; if (typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T/.test(v)) return v.slice(0, 10); return v == null || v === '' ? '—' : String(v); }
  function matched(spec, n) { var w = NOUN[spec.source] || 'project'; return n + ' ' + w + (n === 1 ? '' : 's'); }

  var cards = PANELS.map(function (p) {
    var c = el('section', 'card' + (p.wide || p.spec.type === 'table' || p.spec.type === 'line' ? ' wide' : ''));
    c.appendChild(el('h2', null, p.spec.title));
    var body = el('div', 'note', 'Loading…');
    c.appendChild(body);
    document.getElementById('grid').appendChild(c);
    return { panel: p, body: body };
  });

  function render(card, r) {
    var spec = card.panel.spec, b = el('div');
    if (r.type === 'stat') {
      b.appendChild(el('div', 'stat', fmt(r.value)));
      if (r.metricLabel !== 'count') b.appendChild(el('div', 'note', r.metricLabel + ' · ' + matched(spec, r.matched || 0)));
    } else if (r.type === 'table') {
      if (!r.rows.length) { b.appendChild(el('div', 'note', 'Nothing matches right now.')); }
      else {
        var w = el('div', 'tablewrap'), t = el('table'), h = el('tr');
        r.columns.forEach(function (c) { h.appendChild(el('th', null, c.replace(/_/g, ' '))); });
        var th = el('thead'); th.appendChild(h); t.appendChild(th);
        var tb = el('tbody');
        r.rows.forEach(function (row) { var tr = el('tr'); r.columns.forEach(function (c) { var td = el('td', null, cell(row[c])); td.title = cell(row[c]); tr.appendChild(td); }); tb.appendChild(tr); });
        t.appendChild(tb); w.appendChild(t); b.appendChild(w);
        if (r.matched > r.rows.length) b.appendChild(el('div', 'note', 'Showing ' + r.rows.length + ' of ' + r.matched));
      }
    } else if (!r.series.length) {
      b.appendChild(el('div', 'note', 'Nothing matches right now.'));
    } else if (r.type === 'pie') {
      var total = r.series.reduce(function (a, s) { return a + s.value; }, 0) || 1, wrap = el('div', 'pie');
      var s = svg('svg', { width: 150, height: 150, viewBox: '0 0 42 42', role: 'img' }), off = 25;
      r.series.forEach(function (x, i) {
        var pct = x.value / total * 100;
        s.appendChild(svg('circle', { cx: 21, cy: 21, r: 15.915, fill: 'none', stroke: COLORS[i % COLORS.length], 'stroke-width': 6, 'stroke-dasharray': pct + ' ' + (100 - pct), 'stroke-dashoffset': off }));
        off -= pct;
      });
      wrap.appendChild(s);
      var lg = el('div', 'legend');
      r.series.forEach(function (x, i) { var d = el('div'); var k = el('span', 'k'); k.style.background = COLORS[i % COLORS.length]; d.appendChild(k); d.appendChild(document.createTextNode(x.label + ' — ' + fmt(x.value))); lg.appendChild(d); });
      wrap.appendChild(lg); b.appendChild(wrap);
    } else if (r.type === 'line' && r.series.length > 1) {
      var W = Math.max(280, card.body.parentNode.clientWidth - 32), H = 180, P = 24, max = Math.max.apply(null, r.series.map(function (x) { return x.value; })) || 1;
      var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
      var step = r.series.length > 1 ? (W - 2 * P) / (r.series.length - 1) : 0;
      var pts = r.series.map(function (x, i) { return (P + i * step) + ',' + (H - P - (x.value / max) * (H - 2 * P)); });
      g.appendChild(svg('line', { x1: P, y1: H - P, x2: W - P, y2: H - P, stroke: 'currentColor', 'stroke-opacity': 0.15 }));
      g.appendChild(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: COLORS[0], 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      r.series.forEach(function (x, i) { var p = pts[i].split(','); var dot = svg('circle', { cx: p[0], cy: p[1], r: 3, fill: COLORS[0] }); var tt = svg('title', {}); tt.textContent = x.label + ': ' + fmt(x.value); dot.appendChild(tt); g.appendChild(dot); });
      var a = svg('text', { x: P, y: H - 6 }); a.textContent = r.series[0].label; g.appendChild(a);
      var z = svg('text', { x: W - P, y: H - 6, 'text-anchor': 'end' }); z.textContent = r.series[r.series.length - 1].label; g.appendChild(z);
      var m = svg('text', { x: W - P, y: 12, 'text-anchor': 'end' }); m.textContent = 'max ' + fmt(max); g.appendChild(m);
      b.appendChild(g);
    } else {
      var top = Math.max.apply(null, r.series.map(function (x) { return x.value; })) || 1, bars = el('div', 'bars');
      r.series.forEach(function (x) {
        var row = el('div', 'bar'); row.appendChild(el('span', 'l', x.label)); row.lastChild.title = x.label;
        var t = el('span', 't'), f = el('span', 'f'); f.style.width = Math.max(2, x.value / top * 100) + '%'; f.style.display = 'block'; t.appendChild(f); row.appendChild(t);
        row.appendChild(el('span', 'v', fmt(x.value))); bars.appendChild(row);
      });
      b.appendChild(bars);
    }
    card.body.replaceWith(b); card.body = b;
  }

  function fail(card, msg) { var e = el('div', 'err', msg); card.body.replaceWith(e); card.body = e; }

  if (!window.claude || !window.claude.use) { cards.forEach(function (c) { fail(c, 'Open this dashboard in the CRM to see live data.'); }); document.getElementById('updated').textContent = ''; return; }
  window.claude.use('crm').then(function (crm) {
    if (!crm) { cards.forEach(function (c) { fail(c, 'This page needs the crm capability to read live data.'); }); return; }
    function refresh() {
      Promise.all(cards.map(function (c) {
        return crm.query(c.panel.spec).then(function (r) { render(c, r); return null; }, function (e) { return (e && e.message) || 'Couldn’t load this panel.'; });
      })).then(function (errors) {
        var updated = document.getElementById('updated');
        // Every panel refused for the same reason (usually: no access to the program) — say it once.
        if (errors.every(function (m) { return m && m === errors[0]; })) {
          var grid = document.getElementById('grid');
          grid.textContent = '';
          var c = el('section', 'card wide'); c.appendChild(el('div', 'err', errors[0])); grid.appendChild(c);
          updated.textContent = '';
          return;
        }
        cards.forEach(function (c, i) { if (errors[i]) fail(c, errors[i]); });
        updated.textContent = 'Live · updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      });
    }
    refresh();
    setInterval(function () { if (!document.hidden) refresh(); }, 60000);
  });
})();
</script>
</body>
</html>`;
}
