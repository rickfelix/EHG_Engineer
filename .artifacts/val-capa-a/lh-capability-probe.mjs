// READ-ONLY capability probe: can this machine produce a real Lighthouse LHR
// with performance/best-practice scores, despite the chrome-launcher EPERM?
// Uses the lighthouse node API directly and guards the teardown.
// WRITES NOTHING to the database.
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = 'https://altifyai.app/';
let chrome;
let lhr = null;
try {
  chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  const runnerResult = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' });
  lhr = runnerResult?.lhr ?? null;
} finally {
  // The exact call that throws EPERM under the lhci CLI path. Guard it.
  try {
    await chrome?.kill();
  } catch (err) {
    console.log('[teardown] chrome.kill() threw (expected on this box):', err.code || err.message);
  }
}

if (!lhr) {
  console.log('RESULT: no LHR produced');
  process.exit(1);
}

console.log('RESULT: LHR PRODUCED SUCCESSFULLY');
console.log('  finalUrl:', lhr.finalDisplayedUrl || lhr.finalUrl);
console.log('  lighthouseVersion:', lhr.lighthouseVersion, '| fetchTime:', lhr.fetchTime);
console.log('  CATEGORY SCORES:');
for (const [k, v] of Object.entries(lhr.categories || {})) {
  console.log(`    ${k.padEnd(16)} ${v.score}`);
}
console.log('  METRICS the runner compares against lighthouserc.json:');
for (const key of ['first-contentful-paint', 'largest-contentful-paint']) {
  console.log(`    ${key.padEnd(26)} numericValue=${lhr.audits?.[key]?.numericValue}`);
}

// Now feed it through the runner's OWN builder to prove FR-2 findings would materialize.
const { buildLighthouseFindings } = await import('../../scripts/eva/capa-001-a-baseline-runner.mjs');
const { readFileSync } = await import('node:fs');
const thresholds = JSON.parse(readFileSync('lighthouserc.json', 'utf8')).ci.assert.assertions;
const findings = buildLighthouseFindings('50763b6a-1fad-4e1e-b2fc-296a1d66ebf9', url, 'val-probe-run', lhr, thresholds);
console.log(`\n  buildLighthouseFindings() would persist ${findings.length} finding(s):`);
for (const f of findings) {
  console.log(`    [${f.severity}] ${f.finding_signature} :: ${JSON.stringify(f.evidence_pointer).slice(0, 220)}`);
}
console.log('\nNOTE: nothing written to the database by this probe.');
