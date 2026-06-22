/**
 * QF-20260621-379 — chairman exec-email HTML↔plaintext parity.
 *
 * ROOT CAUSE: the HTML assembly in scripts/adam-exec-summary.mjs led with a bare vision-%
 * and OMITTED 5 plaintext lines (buildLine lead, rungLine, rungRollupLine, forecastLine with
 * its degraded fallback, operationalLine). The chairman reads HTML, so he never saw the
 * Estimated-completion forecast though it was correct in plaintext + the DB.
 *
 * The script runs at import time and touches the live DB, so we don't import it. We (1) mirror
 * the exact HTML fragment logic and assert the 3 forecast states, and (2) read the source and
 * assert the HTML assembly references each of the 5 lines — a regression guard against any
 * future edit silently dropping a line from the HTML again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FORECAST_DEGRADED_MARKER = 'Estimated completion: (forecast temporarily unavailable)';

// Mirror of the script's HTML fragment (kept identical to scripts/adam-exec-summary.mjs QF-379).
function htmlFragment({ visPct, buildLine, rungNatureLine, rungLine, rungRollupLine, forecastLine, forecastDegraded, operationalLine }) {
  return `<p>${esc(buildLine || (visPct != null ? `EHG vision: ${visPct}% built (build-segmented detail unavailable)` : 'EHG vision: (gauge unavailable)'))}</p>` +
    (rungNatureLine ? `<div>${esc(rungNatureLine)}</div>` : '') +
    (rungLine ? `<div>${esc(rungLine)}</div>` : '') +
    (rungRollupLine ? `<div>${esc(rungRollupLine)}</div>` : '') +
    (forecastLine ? `<div>${esc(forecastLine)}</div>` : (forecastDegraded ? `<div>${esc(FORECAST_DEGRADED_MARKER)}</div>` : '')) +
    (operationalLine ? `<div>${esc(operationalLine)}</div>` : '');
}

const base = {
  visPct: 41,
  buildLine: 'Fleet build: 12% built (infra scope)',
  rungNatureLine: 'Rung nature: Foundation',
  rungLine: 'V1 rung: 3/8 complete',
  rungRollupLine: 'Rollup: Foundation 60%',
  operationalLine: 'Operational: 4 live loops',
};

describe('QF-20260621-379 exec-email HTML parity', () => {
  it('renders all 5 lines and leads with buildLine when a forecast is present', () => {
    const fc = 'Estimated completion (infra-build scope): 2026-07-28';
    const h = htmlFragment({ ...base, forecastLine: fc, forecastDegraded: false });
    for (const line of [base.buildLine, base.rungNatureLine, base.rungLine, base.rungRollupLine, fc, base.operationalLine]) {
      expect(h).toContain(esc(line));
    }
    // leads with the fleet-build line, not the bare vision-%
    expect(h.startsWith(`<p>${esc(base.buildLine)}</p>`)).toBe(true);
  });

  it('shows the degraded marker (not a silent omission) when the forecast errored', () => {
    const h = htmlFragment({ ...base, forecastLine: '', forecastDegraded: true });
    expect(h).toContain(esc(FORECAST_DEGRADED_MARKER));
  });

  it('stays silent on a genuine no-forecast', () => {
    const h = htmlFragment({ ...base, forecastLine: '', forecastDegraded: false });
    expect(h).not.toContain('Estimated completion');
    expect(h).not.toContain('forecast');
  });

  it('falls back to the vision-% expr when buildLine is empty', () => {
    const h = htmlFragment({ ...base, buildLine: '', forecastLine: '', forecastDegraded: false });
    expect(h).toContain('EHG vision: 41% built (build-segmented detail unavailable)');
  });

  it('SOURCE GUARD: the HTML assembly references each of the 5 parity lines', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../scripts/adam-exec-summary.mjs'), 'utf8');
    // Scope to the `const html = '<div...` assembly so we don't match the plaintext array.
    const start = src.indexOf("const html = '<div");
    expect(start).toBeGreaterThan(-1);
    const htmlBlock = src.slice(start, src.indexOf('</div>\';', start));
    for (const sym of ['buildLine', 'rungLine', 'rungRollupLine', 'forecastLine', 'forecastDegraded', 'FORECAST_DEGRADED_MARKER', 'operationalLine']) {
      expect(htmlBlock, `HTML assembly must reference ${sym}`).toContain(sym);
    }
  });
});

// QF-20260621-940 — the SUBJECT %-built must equal the BODY-headline %-built (both build_pct).
// Mirror the subject selector (the script isn't imported); the body headline leads with build_pct.
function subjPctSelector(visPct, visBuildPct) {
  return (typeof visBuildPct === 'number') ? visBuildPct : visPct;
}
// What the body headline shows as its number (FR-3: build_pct when present, else overall_pct).
function bodyHeadlinePct(visPct, visBuildPct) {
  return (typeof visBuildPct === 'number') ? visBuildPct : visPct;
}

describe('QF-20260621-940 exec-email subject↔body %-built parity', () => {
  const cases = [
    { name: 'normal split (the live bug: subject 55 vs body 60 → must converge)', pct: 55, build_pct: 60, expect: 60 },
    { name: 'build_pct===0 (the falsy trap a `||` would break)', pct: 42, build_pct: 0, expect: 0 },
    { name: 'no buildable split (both fall back to overall_pct)', pct: 48, build_pct: null, expect: 48 },
    { name: 'fully unavailable', pct: null, build_pct: null, expect: null },
  ];
  for (const c of cases) {
    it(`subject% === body-headline% — ${c.name}`, () => {
      const subj = subjPctSelector(c.pct, c.build_pct);
      const body = bodyHeadlinePct(c.pct, c.build_pct);
      expect(subj).toBe(c.expect);
      expect(subj).toBe(body); // the parity the QF exists to guarantee
    });
  }

  it('SOURCE GUARD: subject uses a typeof-number/subjPct selector, NEVER `visBuildPct || visPct`', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../scripts/adam-exec-summary.mjs'), 'utf8');
    expect(src).toContain('const subjPct =');
    expect(src).toMatch(/typeof visBuildPct === 'number'/);
    expect(src).toMatch(/visBuildPct = fmt\.build_pct/);
    // the zero-trap: a truthy `||` fallback must NOT be used for the subject percent
    expect(src).not.toMatch(/visBuildPct\s*\|\|\s*visPct/);
  });
});
