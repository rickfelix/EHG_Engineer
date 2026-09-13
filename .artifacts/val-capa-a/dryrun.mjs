// READ-ONLY validation probe. Imports the runner's exported builders and
// exercises them against the real AltifyAI surface. WRITES NOTHING to the DB.
import 'dotenv/config';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { VIEWPORTS, validateDeploymentUrl, buildAccessibilityFindings, buildResponsiveFindings, enforceSeverityCap }
  from '../../scripts/eva/capa-001-a-baseline-runner.mjs';
import { computeFindingHash } from '../../lib/eva/quality-findings/finding-shape.js';
import { validateFindingShape } from '../../lib/eva/quality-findings/finding-shape.js';

const url = validateDeploymentUrl('https://altifyai.app');
console.log('validateDeploymentUrl OK ->', url);
const VID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#root, body > div', { state: 'attached', timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(1000);

const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
const rootHtmlLen = await page.evaluate(() => (document.querySelector('#root')?.innerHTML || '').length);
console.log(`hydration check: total DOM nodes=${domNodes}, #root innerHTML chars=${rootHtmlLen}`);

const axeResults = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
const a11y = buildAccessibilityFindings(VID, url, axeResults.violations);
console.log(`axe violations=${axeResults.violations.length} -> findings=${a11y.length}`);
for (const f of a11y.slice(0,8)) console.log(`   [${f.severity}] ${f.finding_signature} (impact=${f.evidence_pointer.impact})`);

const bp = [];
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  await page.setViewportSize(vp);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const o = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  bp.push({ breakpoint: name, viewport: vp, ...o });
  console.log(`   ${name.padEnd(8)} ${vp.width}x${vp.height} scrollW=${o.scrollWidth} clientW=${o.clientWidth} overflow=${o.scrollWidth-o.clientWidth}px`);
}
const resp = buildResponsiveFindings(VID, url, bp);
console.log(`responsive findings=${resp.length}`);
await browser.close();

const all = [...a11y, ...resp];
for (const f of all) f.finding_hash = computeFindingHash(f);
enforceSeverityCap(all);
const bad = all.filter(f => !validateFindingShape(f).valid);
console.log(`\nWOULD-PERSIST total=${all.length}; shape-invalid=${bad.length}; severity-cap guard passed`);
console.log('categories:', JSON.stringify(all.reduce((a,f)=>{a[f.finding_category]=(a[f.finding_category]||0)+1;return a},{})));
console.log('NOTE: nothing written to the database by this probe.');
