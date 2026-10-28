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
.tp .pill.info{color:var(--info);background:var(--info-bg)} .tp .pill.warn{color:var(--warn);background:var(--warn-bg)}
.tp .pill.ok{color:var(--ok);background:var(--ok-bg)} .tp .pill.muted{color:var(--muted);background:var(--bg)}
.tp .pill.ask{color:var(--accent);background:transparent;box-shadow:inset 0 0 0 1.5px var(--accent)}
.tp .card.ask{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.tp .linkish{background:none;border:0;padding:0;color:var(--accent);font:inherit;text-align:left;cursor:pointer}
.tp .err{color:var(--bad);background:var(--bad-bg);border-radius:10px;padding:10px 12px;font-size:14px}
.tp .row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.tp .list{display:flex;flex-direction:column}
.tp .item{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;color:inherit;font:inherit;width:100%}
.tp .item:first-child{border-top:0}
.tp a.item{text-decoration:none} .tp a.linkish{text-decoration:none}
.tp .dot{width:8px;height:8px;border-radius:4px;background:var(--accent);flex-shrink:0;margin-top:8px}
.tp .bubble{border-radius:12px;padding:10px 12px;max-width:90%;white-space:pre-wrap;word-break:break-word}
.tp .bubble.team{background:var(--info-bg);align-self:flex-start} .tp .bubble.tester{background:var(--bg);border:1px solid var(--line);align-self:flex-end}
.tp .thumb{display:block;width:120px;height:84px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.tp .ok{color:var(--ok);background:var(--ok-bg);border-radius:10px;padding:10px 12px;font-size:14px}
.tp code.link{display:block;font:13px ui-monospace,monospace;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;word-break:break-all}
.tp .wrap-text,.tp h1,.tp h2,.tp p,.tp dd,.tp .bubble,.tp .item b{overflow-wrap:anywhere;word-break:break-word;min-width:0}
.tp .req{color:var(--faint);font-weight:500;font-size:12.5px}
.tp details summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:14px}
.tp details[open] summary{margin-bottom:8px}
.tp .progress{height:8px;border-radius:4px;background:var(--line);overflow:hidden}
.tp .progress>span{display:block;height:100%;background:var(--accent);transition:width .2s}
.tp .foot{font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:6px;padding:4px}
.tp .foot a{color:var(--accent)}
.tp a.mail{color:var(--accent);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.tp .note{background:var(--info-bg);color:var(--ink);border-radius:10px;padding:10px 12px;font-size:14px}
.tp .thumb-wrap{position:relative;display:inline-block}
.tp .thumb-x{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer}
.tp .file-chip{display:inline-flex;align-items:center;gap:6px}
.tp .danger{color:var(--bad)}
.tp .skeleton{height:18px;border-radius:6px;background:var(--line);opacity:.6}
@media (max-width:767px){
  .tp{padding:16px 12px 96px}
  .tp input,.tp textarea,.tp select{font-size:16px}
  .tp .actionbar{position:sticky;bottom:0;z-index:5;background:var(--card);margin:0 -20px -20px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);border-radius:0 0 14px 14px}
  .tp .actionbar .btn.primary{flex:1}
  .tp .acct .btn,.tp .acct .linkish,.tp .tap-row .btn,.tp .tap-row .linkish{min-height:44px;display:inline-flex;align-items:center}
  .tp .acct-actions{flex-direction:column;align-items:flex-start;gap:8px}
  .tp .thumb-x{width:44px;height:44px;border-radius:22px;top:-16px;right:-16px}
}
`;

import { KEEP_TYPED_SCRIPT } from '@/components/beta/tester/common';

export function TesterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tp">
      <style>{TESTER_CSS}</style>
      {/* Records typing that happens before the page's script loads (slow phones); see useKeepTyped. */}
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: KEEP_TYPED_SCRIPT }} />
      <main className="wrap">{children}</main>
    </div>
  );
}
