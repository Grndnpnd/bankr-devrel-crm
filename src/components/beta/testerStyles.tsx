/** Shared look for the public beta-tester pages: calm, readable, light/dark, phone-first. */
export const TESTER_CSS = `
.tp{--bg:#f6f5f2;--card:#ffffff;--ink:#1c1b19;--muted:#66625a;--faint:#9a958b;--line:#e4e1da;--accent:#c4620d;--accent-ink:#fff;--ok:#2f7d4f;--ok-bg:#e5f3ea;--warn:#9a6400;--warn-bg:#fbf0d9;--bad:#b3261e;--bad-bg:#fbe5e3;--info:#3c5a8c;--info-bg:#e6ecf6;
  min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,system-ui,-apple-system,sans-serif;padding:24px 16px 64px}
@media (prefers-color-scheme:dark){.tp{--bg:#121315;--card:#1b1d20;--ink:#ecebe8;--muted:#a8a49c;--faint:#77736b;--line:#2c2f33;--accent:#f0913f;--accent-ink:#1a1206;--ok:#7fd3a0;--ok-bg:#16301f;--warn:#f0bd57;--warn-bg:#33280f;--bad:#f2948d;--bad-bg:#3a1c1c;--info:#a3bde9;--info-bg:#1c2638}}
.tp *{box-sizing:border-box}
.tp .wrap{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.tp .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.tp h1{font-size:26px;line-height:1.2;margin:0;letter-spacing:-.01em;text-wrap:balance}
.tp h2{font-size:18px;margin:0}
.tp .eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.tp .muted{color:var(--muted)} .tp .faint{color:var(--faint);font-size:13px}
.tp label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.tp input,.tp textarea,.tp select{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tp input:focus-visible,.tp textarea:focus-visible,.tp select:focus-visible,.tp button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.tp textarea{resize:vertical;min-height:96px}
.tp .field{display:flex;flex-direction:column}
.tp .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}
.tp .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:600 15px/1 Inter,system-ui,sans-serif;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:12px 16px;cursor:pointer;text-decoration:none}
.tp .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.tp .btn:disabled{opacity:.5;cursor:default}
.tp .seg{display:flex;flex-wrap:wrap;gap:8px}
.tp .seg button{flex:1 1 120px;text-align:left;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:10px 12px;font:inherit;cursor:pointer}
.tp .seg button[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:var(--card)}
.tp .seg b{display:block;font-size:14px} .tp .seg span{font-size:12.5px;color:var(--muted)}
.tp .pill{display:inline-block;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.tp .pill.new,.tp .pill.triaged{color:var(--info);background:var(--info-bg)} .tp .pill.in_progress{color:var(--warn);background:var(--warn-bg)}
.tp .pill.fixed,.tp .pill.answered{color:var(--ok);background:var(--ok-bg)} .tp .pill.wont_fix,.tp .pill.duplicate{color:var(--muted);background:var(--bg)}
.tp .err{color:var(--bad);background:var(--bad-bg);border-radius:10px;padding:10px 12px;font-size:14px}
.tp .row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.tp .list{display:flex;flex-direction:column}
.tp .item{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;color:inherit;font:inherit;width:100%}
.tp .item:first-child{border-top:0}
.tp .dot{width:8px;height:8px;border-radius:4px;background:var(--accent);flex-shrink:0;margin-top:8px}
.tp .bubble{border-radius:12px;padding:10px 12px;max-width:90%;white-space:pre-wrap;word-break:break-word}
.tp .bubble.team{background:var(--info-bg);align-self:flex-start} .tp .bubble.tester{background:var(--bg);border:1px solid var(--line);align-self:flex-end}
.tp code.link{display:block;font:13px ui-monospace,monospace;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;word-break:break-all}
`;

export function TesterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tp">
      <style>{TESTER_CSS}</style>
      <main className="wrap">{children}</main>
    </div>
  );
}
