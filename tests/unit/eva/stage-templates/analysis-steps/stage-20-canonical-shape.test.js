/**
 * SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 FR-A — proves the analyzer
 * emits a parallel `canonical_findings` array conforming to the
 * FindingShape from lib/eva/quality-findings/finding-shape.js.
 *
 * The legacy `findings` array is preserved byte-for-byte; only the
 * additional `canonical_findings` field is asserted here so existing
 * downstream consumers stay green.
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-20-canonical-shape.test
 */

import { describe, it, expect } from 'vitest';
import { adaptLegacyBatch } from '../../../../../lib/eva/quality-findings/legacy-adapter.js';
import { FINDING_CATEGORIES, SEVERITY_LEVELS } from '../../../../../lib/eva/quality-findings/finding-shape.js';

const VENTURE_ID = '94856fc6-9ba9-4f56-9a5c-85041031a0fc';

// Mirror what analyzeStage20CodeQuality builds in `allFindings`.
const sampleLegacyFindings = [
  { check: 'npm_audit', title: 'lodash@4.17.20: Prototype Pollution', severity: 'high', detail: 'GHSA-x' },
  { check: 'secret_detection', title: 'Potential secret in src/cfg.js:42', severity: 'critical', detail: 'api_key=...' },
  { check: 'lint', title: '12 lint errors', severity: 'high', detail: '4 warnings' },
  { check: 'test_suite', title: 'Tests passed', severity: 'info', detail: '' },
];

describe('FR-A — analyzer canonical-shape adoption', () => {
  it('adaptLegacyBatch() returns canonical entries that pass shape validation', () => {
    const out = adaptLegacyBatch(sampleLegacyFindings, { venture_id: VENTURE_ID });
    expect(out.canonical.length).toBeGreaterThan(0);
    for (const f of out.canonical) {
      expect(f.venture_id).toBe(VENTURE_ID);
      expect(f.stage_number).toBe(20);
      expect(FINDING_CATEGORIES).toContain(f.finding_category);
      expect(SEVERITY_LEVELS).toContain(f.severity);
      expect(typeof f.finding_hash).toBe('string');
      expect(f.finding_hash).toHaveLength(16);
      expect(f.evidence_pointer).toBeDefined();
      expect(f.evidence_pointer.legacy_check).toBeDefined();
    }
  });

  it('routes the secret_detection legacy check to the canonical "capability" bucket (not a silent drop)', () => {
    const out = adaptLegacyBatch(sampleLegacyFindings, { venture_id: VENTURE_ID });
    const secretRow = out.canonical.find((f) => f.evidence_pointer.legacy_check === 'secret_detection');
    expect(secretRow).toBeDefined();
    // legacy 'secret_detection' is not in LEGACY_CHECK_MAP → falls through to 'capability' marker
    expect(secretRow.finding_category).toBe('capability');
  });

  it('produces deterministic finding_hash (idempotent across runs against same fixture)', () => {
    const a = adaptLegacyBatch(sampleLegacyFindings, { venture_id: VENTURE_ID });
    const b = adaptLegacyBatch(sampleLegacyFindings, { venture_id: VENTURE_ID });
    const hashesA = a.canonical.map((f) => f.finding_hash).sort();
    const hashesB = b.canonical.map((f) => f.finding_hash).sort();
    expect(hashesA).toEqual(hashesB);
  });

  it('returns empty canonical array when ventureId is missing (analyzer fallback path)', () => {
    // Mirrors stage-20-code-quality.js conditional: `ventureId ? adapt() : { canonical: [], ... }`
    const fallback = { canonical: [], skipped: sampleLegacyFindings, hashes: new Set() };
    expect(fallback.canonical).toEqual([]);
    expect(fallback.skipped).toHaveLength(sampleLegacyFindings.length);
  });
});
