/**
 * SD-EHG-UIUX-REVIEW-W0-001 (FR-5 / activation test).
 *
 * The W0 deliverable is a REVIEW/REPORT (docs/reports/ehg-uiux-review-w0.md) — NO UI code (FR-4).
 * This pure test machine-verifies the report's required structure so it cannot silently regress
 * or ship hollow: the five required sections are present, the Surface Inventory covers all 8
 * governed ehg_page_routes, every ranked recommendation maps to a named gauge application-layer
 * capability, and the no-UI-code invariant is declared. No DB, no IO beyond reading the report file.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.resolve(__dirname, '../../docs/reports/ehg-uiux-review-w0.md');
const report = fs.readFileSync(REPORT_PATH, 'utf8');

// The 8 governed ehg_page_routes surfaces the inventory must cover (FR-1).
const ROUTES = [
  '/analytics',
  '/automation',
  '/chairman',
  '/chairman/settings',
  '/eva',
  '/reports/builder',
  '/ventures',
  '/ventures/:id',
];

// The named gauge application-layer capabilities recommendations map to (FR-3).
const GAUGE_CAPABILITIES = [
  'operator cockpit',
  'queryable north-star',
  'distance-to-broke',
  'distance-to-quit',
  'venture-performance read',
  'presentation-surface-consolidation',
];

const REQUIRED_SECTIONS = [
  '## 1. Surface Inventory',
  '## 2. Assessment',
  '## 3. Prioritized Recommendations',
  '## 4. Follow-on Builds',
  '## 5. Coordination',
];

describe('W0 EHG UI/UX review report — required sections present', () => {
  it.each(REQUIRED_SECTIONS)('contains section: %s', (heading) => {
    expect(report).toContain(heading);
  });
});

describe('Surface Inventory completeness (all 8 governed routes)', () => {
  it.each(ROUTES)('inventories route %s', (route) => {
    // Match the route as a backticked token so /ventures does not satisfy /ventures/:id.
    expect(report).toContain('`' + route + '`');
  });

  it('covers exactly the 8 governed routes (no silent shrinkage)', () => {
    const present = ROUTES.filter((r) => report.includes('`' + r + '`'));
    expect(present.length).toBe(ROUTES.length);
  });
});

describe('Assessment classifies surfaces and enumerates missing capabilities (FR-2)', () => {
  it('uses the four classification labels', () => {
    for (const label of ['redundant', 'underdefined', 'orphaned', 'adequate']) {
      expect(report.toLowerCase()).toContain(label);
    }
  });
  it('has a Missing-capabilities subsection', () => {
    expect(report).toMatch(/Missing[- ]capabilities/i);
  });
});

describe('Prioritized Recommendations each map to a named gauge capability (FR-3)', () => {
  // Isolate the Recommendations section (## 3 ... up to ## 4).
  const sec3 = report.slice(
    report.indexOf('## 3. Prioritized Recommendations'),
    report.indexOf('## 4. Follow-on Builds')
  );

  it('has at least 3 ranked recommendations (R1, R2, R3, ...)', () => {
    const rIds = [...sec3.matchAll(/^### R\d+\b/gm)].map((m) => m[0]);
    expect(rIds.length).toBeGreaterThanOrEqual(3);
  });

  it('every ranked recommendation references at least one named gauge capability', () => {
    // Split into per-recommendation blocks on the "### R<n>" headers.
    const blocks = sec3.split(/^### R\d+/m).slice(1); // drop the pre-R1 preamble
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const mapped = GAUGE_CAPABILITIES.some((cap) => block.includes(cap));
      expect(mapped).toBe(true);
    }
  });

  it('the full capability vocabulary appears across the recommendations', () => {
    // Every named gauge capability is advanced by at least one recommendation/section.
    for (const cap of GAUGE_CAPABILITIES) {
      expect(report).toContain(cap);
    }
  });
});

describe('No-UI-code invariant is declared (FR-4)', () => {
  it('states the report ships no UI code and defers builds to follow-on SDs', () => {
    expect(report).toMatch(/no\s+UI\s+code/i);
    expect(report).toMatch(/follow-on/i);
  });
  it('records a coordination note vs the cockpit-design effort', () => {
    expect(report).toContain('SD-EHG-COCKPIT-PHASE0-DESIGN-001');
    expect(report.toLowerCase()).toMatch(/compose.*(not|don).*overlap|compose, don/);
  });
});
