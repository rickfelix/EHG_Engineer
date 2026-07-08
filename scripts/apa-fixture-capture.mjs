// SD-FDBK-ENH-APA-CALIBRATION-FIXTURE-001: capture frozen snapshots (screenshot + HTML)
// for the 16-fixture APA calibration set defined in docs/design/apa-calibration-fixture-set.md.
// Usage: node scripts/apa-fixture-capture.mjs <fixtureId> <url> [--width=1440] [--full]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('docs/design/apa-calibration-fixtures');

async function capture(fixtureId, url, { width = 1440, height = 900, fullPage = false, waitMs = 800 } = {}) {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(waitMs);
    // Strip embedded base64 image data (real pages often inline icons/logos as data URIs) --
    // the HTML is a provenance record, not the visual artifact; large embedded binary blobs
    // both bloat the repo and can coincidentally match secret-scanner regexes (verified on
    // a Wealthsimple capture: false-positive AWS-key-pattern hits inside inlined image data).
    const html = (await page.content()).replace(
      /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+\/=]{20,}/g,
      'data:image/*;base64,[STRIPPED-FOR-FROZEN-RECORD]'
    );
    const screenshotPath = path.join(OUT_DIR, `${fixtureId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage });
    await writeFile(path.join(OUT_DIR, `${fixtureId}.html`), html, 'utf8');
    console.log(`OK ${fixtureId} <- ${url} -> ${screenshotPath}`);
  } catch (err) {
    console.error(`FAIL ${fixtureId} <- ${url}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

const [, , fixtureId, url, ...rest] = process.argv;
if (!fixtureId || !url) {
  console.error('Usage: node scripts/apa-fixture-capture.mjs <fixtureId> <url> [--width=N] [--full]');
  process.exit(1);
}
const opts = {};
for (const arg of rest) {
  if (arg === '--full') opts.fullPage = true;
  else if (arg.startsWith('--width=')) opts.width = Number(arg.split('=')[1]);
}
await capture(fixtureId, url, opts);
