/**
 * Unit tests for scripts/s19-vision-coverage-gauge.mjs's pure functions.
 *
 * SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-C FR-3/FR-4, TS-5/TS-6.
 *
 * @module tests/unit/eva/s19-vision-coverage-gauge.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  STANDARD_SECTION_KEYS,
  SUBSTANTIVE_SECTION_MIN_CHARS,
  COVERAGE_MINIMUM,
  countStandardSectionCoverage,
  computeS19CoverageGauge,
  buildSnapshotRow,
} from '../../../scripts/s19-vision-coverage-gauge.mjs';

const LONG = (n) => 'x'.repeat(n);

describe('countStandardSectionCoverage', () => {
  it('counts 0 for null/undefined sections', () => {
    expect(countStandardSectionCoverage(null)).toBe(0);
    expect(countStandardSectionCoverage(undefined)).toBe(0);
  });

  it('counts 0 for a non-object sections value', () => {
    expect(countStandardSectionCoverage('not-an-object')).toBe(0);
  });

  it('only counts standard keys present at >=50 chars', () => {
    const sections = {
      executive_summary: LONG(60),
      problem_statement: LONG(49), // just under threshold — not counted
      not_a_standard_key: LONG(100), // ignored, not in STANDARD_SECTION_KEYS
    };
    expect(countStandardSectionCoverage(sections)).toBe(1);
  });

  it('reports 10/10 when all standard sections are substantive', () => {
    const sections = {};
    for (const key of STANDARD_SECTION_KEYS) sections[key] = LONG(SUBSTANTIVE_SECTION_MIN_CHARS);
    expect(countStandardSectionCoverage(sections)).toBe(STANDARD_SECTION_KEYS.length);
  });

  it('does not count a non-string section value', () => {
    const sections = { executive_summary: 12345 };
    expect(countStandardSectionCoverage(sections)).toBe(0);
  });
});

describe('computeS19CoverageGauge', () => {
  it('TS-5: flags a venture below the 8/10 minimum, naming its id/vision_key and section count', () => {
    const sections = {};
    for (const key of STANDARD_SECTION_KEYS.slice(0, 4)) sections[key] = LONG(60); // 4/10
    const rows = [
      { venture_id: 'v-stuck', vision_key: 'vision-stuck', sections },
    ];
    const gauge = computeS19CoverageGauge(rows);
    expect(gauge.total).toBe(1);
    expect(gauge.below_minimum).toBe(1);
    expect(gauge.findings).toEqual([
      { venture_id: 'v-stuck', vision_key: 'vision-stuck', section_count: 4 },
    ]);
  });

  it('reports zero below-minimum ventures when all are >=8/10', () => {
    const fullSections = {};
    for (const key of STANDARD_SECTION_KEYS) fullSections[key] = LONG(60);
    const rows = [
      { venture_id: 'v-1', vision_key: 'vision-1', sections: fullSections },
      { venture_id: 'v-2', vision_key: 'vision-2', sections: fullSections },
    ];
    const gauge = computeS19CoverageGauge(rows);
    expect(gauge.total).toBe(2);
    expect(gauge.below_minimum).toBe(0);
    expect(gauge.findings).toEqual([]);
  });

  it('honors COVERAGE_MINIMUM exactly (8/10 is NOT below minimum)', () => {
    const sections = {};
    for (const key of STANDARD_SECTION_KEYS.slice(0, COVERAGE_MINIMUM)) sections[key] = LONG(60);
    const rows = [{ venture_id: 'v-exact', vision_key: 'vision-exact', sections }];
    const gauge = computeS19CoverageGauge(rows);
    expect(gauge.below_minimum).toBe(0);
  });

  it('handles an empty row list', () => {
    const gauge = computeS19CoverageGauge([]);
    expect(gauge).toEqual({ total: 0, below_minimum: 0, findings: [] });
  });

  it('handles a non-array input defensively', () => {
    const gauge = computeS19CoverageGauge(null);
    expect(gauge).toEqual({ total: 0, below_minimum: 0, findings: [] });
  });
});

describe('buildSnapshotRow (fail-soft snapshot contract)', () => {
  it('TS-6: a query error still produces a persistable snapshot row with available=false', () => {
    const row = buildSnapshotRow(null, new Error('db down'));
    expect(row.dimension).toBe('s19_vision_section_coverage_gap');
    expect(row.target_application).toBe('EHG');
    expect(row.metadata.available).toBe(false);
    expect(row.metadata.error).toBe('db down');
    expect(row.findings).toEqual([]);
    expect(row.score).toBe(0);
  });

  it('produces a 100% score row when no ventures are below minimum', () => {
    const gauge = { total: 3, below_minimum: 0, findings: [] };
    const row = buildSnapshotRow(gauge, null);
    expect(row.metadata.available).toBe(true);
    expect(row.score).toBe(100);
  });

  it('produces a proportional score row when some ventures are below minimum', () => {
    const gauge = { total: 4, below_minimum: 1, findings: [{ venture_id: 'v', vision_key: 'k', section_count: 3 }] };
    const row = buildSnapshotRow(gauge, null);
    expect(row.score).toBe(75);
    expect(row.metadata.below_minimum).toBe(1);
    expect(row.findings).toEqual(gauge.findings);
  });

  it('handles a zero-venture (empty S19) result as 100%, not a divide-by-zero', () => {
    const gauge = { total: 0, below_minimum: 0, findings: [] };
    const row = buildSnapshotRow(gauge, null);
    expect(row.score).toBe(100);
  });
});
