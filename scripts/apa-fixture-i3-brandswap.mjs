// I3 FIXTURE (integrity canary): pixel-identical duplicate of G1 with only the brand swapped.
// Composites a brand-swap overlay onto the frozen G1 screenshot via an HTML wrapper + Playwright.
import { chromium } from 'playwright';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('docs/design/apa-calibration-fixtures');
const g1Path = path.join(OUT_DIR, 'G1-airtable.png').replace(/\\/g, '/');

// A missing source screenshot would otherwise render a blank background while the
// script still logs success -- this is the one fixture explicitly designed to catch
// judge gameability, so a silently-broken composite is the worst possible failure mode.
try {
  await access(path.join(OUT_DIR, 'G1-airtable.png'));
} catch {
  console.error(`FAIL I3-brand-swap: source screenshot not found at ${g1Path} -- run apa-fixture-capture.mjs G1-airtable first`);
  process.exit(1);
}

const html = `<!doctype html>
<html><head><style>
  * { margin:0; padding:0; }
  body { width:1440px; height:900px; position:relative; }
  .bg { position:absolute; top:0; left:0; width:1440px; height:900px; background:url('file:///${g1Path}') no-repeat top left; background-size:1440px auto; }
  .patch { position:absolute; top:56px; left:32px; width:160px; height:38px; background:#ffffff; }
  .wordmark { position:absolute; top:60px; left:32px; font-family:'Segoe UI',Arial,sans-serif; font-weight:800; font-size:22px; color:#111318; display:flex; align-items:center; gap:8px; }
  .wordmark .icon { width:22px; height:22px; background:#111318; border-radius:5px; display:inline-block; }
</style></head>
<body>
  <div class="bg"></div>
  <div class="patch"></div>
  <div class="wordmark"><span class="icon"></span>Vantable</div>
</body></html>`;

const htmlPath = path.join(OUT_DIR, 'I3-brand-swap.html');
await writeFile(htmlPath, html, 'utf8');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'I3-brand-swap.png') });
  console.log('OK I3-brand-swap');
} finally {
  await browser.close();
}
