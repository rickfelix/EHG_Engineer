// Generates the chairman-reviewable calibration packet as a self-contained HTML artifact.
// Manifest-driven (SD-LEO-INFRA-APA-FIXTURE-HARNESS-001): reads the fixture set from
// docs/design/apa-calibration-fixtures/manifest.json — each fixture declares its `format`
// ('html_native' | 'capture_png'). Both formats render from their PNG + manifest metadata;
// the format distinction is enforced by the test's pair check (only html_native requires an
// .html source). Base64-embeds each PNG and writes review-packet.html.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('docs/design/apa-calibration-fixtures');

async function b64(file) {
  const buf = await readFile(path.join(DIR, file));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const manifest = JSON.parse(await readFile(path.join(DIR, 'manifest.json'), 'utf8'));
const FIXTURES = manifest.fixtures;

const GROUP_META = {
  good: { label: 'GOOD anchors', accent: 'var(--good)', bg: 'var(--good-bg)' },
  defect: { label: 'DEFECT anchors', accent: 'var(--defect)', bg: 'var(--defect-bg)' },
  boundary: { label: 'BOUNDARY fixtures', accent: 'var(--boundary)', bg: 'var(--boundary-bg)' },
  integrity: { label: 'INTEGRITY canaries', accent: 'var(--integrity)', bg: 'var(--integrity-bg)' },
};

const GROUP_INTRO = {
  good: 'What the floor-4/5 looks like — the standard MarketLens competes against. G4 is your own reserved pick, already ratified.',
  defect: 'One per rubric dimension, seeded onto real MarketLens screens as minimal, controlled patches — unambiguous ground truth for the judge to catch.',
  boundary: 'Real screens, real ambiguity. This is the irreplaceable part: your yes/no per screen sets the 3-floor’s true position. Two of three are fresh picks or substitutions — see the flags.',
  integrity: 'The judge must be un-gameable. Each of these should score badly on at least one dimension no matter what the copy claims.',
};

function cardHtml(f, imgData) {
  const flagHtml = f.flag ? `<div class="flag">${f.flag}</div>` : '';
  return `<article class="card" data-group="${f.group}">
  <div class="card-media"><img src="${imgData}" alt="${f.title} fixture screenshot" loading="lazy"></div>
  <div class="card-body">
    <div class="card-head">
      <span class="fid">${f.label}</span>
      <span class="verdict verdict-${f.group}">${f.verdict}</span>
    </div>
    <h3>${f.title}</h3>
    <p class="sub">${f.sub}</p>
    <p class="rationale">${f.rationale}</p>
    ${flagHtml}
    <div class="actions">
      <button type="button" class="btn-confirm" data-state="pending">Confirm</button>
      <button type="button" class="btn-swap">Flag for swap</button>
    </div>
  </div>
</article>`;
}

const groups = ['good', 'defect', 'boundary', 'integrity'];
let sections = '';
for (const g of groups) {
  const items = FIXTURES.filter((f) => f.group === g);
  const cards = [];
  for (const f of items) {
    const imgData = await b64(`${f.id}.png`);
    cards.push(cardHtml(f, imgData));
  }
  const meta = GROUP_META[g];
  sections += `
<section class="group" id="group-${g}">
  <header class="group-head">
    <h2>${meta.label} <span class="count">${items.length}</span></h2>
    <p>${GROUP_INTRO[g]}</p>
  </header>
  <div class="grid">
    ${cards.join('\n    ')}
  </div>
</section>`;
}

const html = `<title>APA Calibration Fixture Set — Chairman Review Packet</title>
<style>
:root {
  --paper: #F3F5F8;
  --paper-raised: #FFFFFF;
  --ink: #14171C;
  --ink-soft: #545B68;
  --ink-faint: #8991A0;
  --line: #DCE1E8;
  --accent: #3247D6;
  --accent-soft: #EAEDFC;
  --good: #157A50; --good-bg: #E7F5EE;
  --defect: #B3271F; --defect-bg: #FBEBEA;
  --boundary: #9A6300; --boundary-bg: #FBF1DE;
  --integrity: #6234B5; --integrity-bg: #F1EAFB;
  --display: 'Neue Haas Grotesk Display', 'Helvetica Neue', Arial, sans-serif;
  --body-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SF Mono', 'Cascadia Code', Consolas, 'Courier New', monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body-font);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

.masthead {
  background: var(--ink);
  color: #F3F5F8;
  padding: 3rem 1.75rem 2.5rem;
}
.masthead-inner { max-width: 1180px; margin: 0 auto; }
.eyebrow {
  font-family: var(--mono);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9AA6C4;
  margin: 0 0 0.75rem;
}
.masthead h1 {
  font-family: var(--display);
  font-weight: 700;
  font-size: clamp(1.75rem, 3.4vw, 2.5rem);
  letter-spacing: -0.01em;
  margin: 0 0 0.75rem;
  text-wrap: balance;
  max-width: 42rem;
}
.masthead p.deck {
  color: #C4CBDC;
  font-size: 1.0625rem;
  max-width: 42rem;
  margin: 0 0 1.5rem;
}
.masthead-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  font-family: var(--mono);
  font-size: 0.8125rem;
  color: #9AA6C4;
  border-top: 1px solid #333A4D;
  padding-top: 1.25rem;
}
.masthead-meta strong { color: #E4E8F5; font-weight: 600; }

main { max-width: 1180px; margin: 0 auto; padding: 2.5rem 1.75rem 5rem; }

.summary-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  margin: -1.75rem 0 2.5rem;
  box-shadow: 0 8px 24px -12px rgba(20,23,28,0.25);
}
.summary-cell { background: var(--paper-raised); padding: 1.1rem 1.25rem; }
.summary-cell .num { font-family: var(--mono); font-size: 1.625rem; font-weight: 600; font-variant-numeric: tabular-nums; display: block; }
.summary-cell .lbl { font-size: 0.8125rem; color: var(--ink-soft); }
.summary-cell.good .num { color: var(--good); }
.summary-cell.defect .num { color: var(--defect); }
.summary-cell.boundary .num { color: var(--boundary); }
.summary-cell.integrity .num { color: var(--integrity); }

.group { margin-bottom: 3.25rem; }
.group-head { max-width: 46rem; margin-bottom: 1.5rem; }
.group-head h2 {
  font-family: var(--display);
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.005em;
  margin: 0 0 0.4rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.group-head .count {
  font-family: var(--mono);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink-faint);
}
.group-head p { color: var(--ink-soft); font-size: 0.9375rem; margin: 0; max-width: 44rem; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

.card {
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 160ms ease, transform 160ms ease;
}
.card:hover { box-shadow: 0 10px 28px -14px rgba(20,23,28,0.28); transform: translateY(-1px); }

.card-media {
  aspect-ratio: 16 / 10;
  background: #E9ECF1 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2220%22 height=%2220%22 fill=%22%23e9ecf1%22/></svg>');
  overflow: hidden;
  position: relative;
}
.card-media img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }

.card-body { padding: 1.1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.fid { font-family: var(--mono); font-weight: 700; font-size: 0.875rem; color: var(--ink); letter-spacing: 0.02em; }
.verdict {
  font-family: var(--mono);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 100px;
  white-space: nowrap;
}
.verdict-good { background: var(--good-bg); color: var(--good); }
.verdict-defect { background: var(--defect-bg); color: var(--defect); }
.verdict-boundary { background: var(--boundary-bg); color: var(--boundary); }
.verdict-integrity { background: var(--integrity-bg); color: var(--integrity); }

.card-body h3 { font-family: var(--display); font-size: 1.0625rem; font-weight: 700; margin: 0; }
.card-body .sub { font-size: 0.8125rem; color: var(--ink-faint); margin: 0; }
.card-body .rationale { font-size: 0.9375rem; color: var(--ink-soft); margin: 0.15rem 0 0; }

.flag {
  font-size: 0.8125rem;
  background: var(--boundary-bg);
  color: #7A4E00;
  border-left: 3px solid var(--boundary);
  padding: 0.55rem 0.75rem;
  border-radius: 0 6px 6px 0;
  margin-top: 0.25rem;
}

.actions { display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; }
.actions button {
  font-family: var(--body-font);
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 7px;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--paper-raised);
  color: var(--ink);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.btn-confirm { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-confirm:hover { background: #2839B8; }
.btn-confirm[data-state="confirmed"] { background: var(--good); border-color: var(--good); }
.btn-confirm[data-state="confirmed"]::after { content: ' \\2713'; }
.btn-swap:hover { border-color: var(--defect); color: var(--defect); }
.btn-swap[data-state="flagged"] { background: var(--defect-bg); border-color: var(--defect); color: var(--defect); }

footer.colophon {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 1.75rem 4rem;
  color: var(--ink-faint);
  font-size: 0.8125rem;
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
}

@media (prefers-reduced-motion: reduce) {
  .card { transition: none; }
}
</style>

<div class="masthead">
  <div class="masthead-inner">
    <p class="eyebrow">APA Calibration &mdash; Commission #4 &mdash; Phase B</p>
    <h1>16-fixture calibration packet, ready for your sign-off</h1>
    <p class="deck">Solomon proposed the set; Sonnet assembled it. Four reference anchors, six seeded defects, three boundary calls that are yours alone to make, and three canaries the judge must never be fooled by. About 20 minutes to confirm or swap at a glance &mdash; your B1/B2 floor calls and the G4 pick are the two places nothing but your own taste will do.</p>
    <div class="masthead-meta">
      <span><strong>Ratified</strong> 2026-07-07</span>
      <span><strong>Rubric</strong> design_quality_v1</span>
      <span><strong>Feeds</strong> APA Child E &sect;12.4</span>
      <span><strong>SSOT</strong> docs/design/apa-calibration-fixture-set.md</span>
    </div>
  </div>
</div>

<main>
  <div class="summary-bar">
    <div class="summary-cell good"><span class="num">4</span><span class="lbl">Good anchors</span></div>
    <div class="summary-cell defect"><span class="num">6</span><span class="lbl">Seeded defects</span></div>
    <div class="summary-cell boundary"><span class="num">3</span><span class="lbl">Boundary calls</span></div>
    <div class="summary-cell integrity"><span class="num">3</span><span class="lbl">Integrity canaries</span></div>
  </div>

  ${sections}
</main>

<footer class="colophon">
  Frozen snapshots (screenshot + HTML) captured at assembly, 2026-07-08. On your sign-off this set versions and freezes as the immutable APA calibration standard &mdash; the judge misclassifying any fixture here turns APA's own gauge red.
</footer>

<script>
document.querySelectorAll('.btn-confirm').forEach((btn) => {
  btn.addEventListener('click', () => {
    const confirmed = btn.dataset.state === 'confirmed';
    btn.dataset.state = confirmed ? 'pending' : 'confirmed';
    btn.textContent = confirmed ? 'Confirm' : 'Confirmed';
    const swapBtn = btn.closest('.actions').querySelector('.btn-swap');
    if (!confirmed) { swapBtn.dataset.state = ''; swapBtn.textContent = 'Flag for swap'; }
  });
});
document.querySelectorAll('.btn-swap').forEach((btn) => {
  btn.addEventListener('click', () => {
    const flagged = btn.dataset.state === 'flagged';
    btn.dataset.state = flagged ? '' : 'flagged';
    btn.textContent = flagged ? 'Flag for swap' : 'Flagged';
    const confirmBtn = btn.closest('.actions').querySelector('.btn-confirm');
    if (!flagged) { confirmBtn.dataset.state = 'pending'; confirmBtn.textContent = 'Confirm'; }
  });
});
</script>`;

await writeFile(path.join(DIR, 'review-packet.html'), html, 'utf8');
console.log('OK review-packet.html written, size:', (html.length / 1024 / 1024).toFixed(2), 'MB');
