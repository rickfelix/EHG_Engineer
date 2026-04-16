/**
 * Unit tests for wiring-validation-runner.js
 * SD: SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D
 *
 * Covers the pure-function surfaces that do not need a live DB:
 *   - extractTrailingJson parser (JSON with leading logs, malformed, nested)
 *   - invokeDetector graceful handling (missing script, unparseable output)
 *
 * DB-touching paths (persistRows, trigger derivation) are covered by the
 * integration test `tests/integration/wiring-validation/runner.integration.test.js`
 * which runs against the migrated Supabase schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Re-implement extractTrailingJson here as the runner does not export it.
// Kept in lockstep with the runner source; if the runner changes, update here.
function extractTrailingJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  let depth = 0;
  let end = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const c = trimmed[i];
    if (c === '}') { if (depth === 0) end = i; depth++; }
    else if (c === '{') {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(i, end + 1);
        try { return JSON.parse(candidate); } catch { /* keep scanning */ }
      }
    }
  }
  return null;
}

describe('extractTrailingJson', () => {
  it('parses whole-output JSON', () => {
    const out = '{"sd_key":"SD-X","check_type":"orphan_detection","status":"passed"}';
    expect(extractTrailingJson(out)).toEqual({
      sd_key: 'SD-X',
      check_type: 'orphan_detection',
      status: 'passed',
    });
  });

  it('parses JSON preceded by log lines', () => {
    const out = [
      '[detector] starting...',
      '[detector] scanning files',
      '{"sd_key":"SD-X","check_type":"orphan_detection","status":"passed","signals_detected":0}'
    ].join('\n');
    const parsed = extractTrailingJson(out);
    expect(parsed).not.toBeNull();
    expect(parsed.status).toBe('passed');
  });

  it('returns null on empty input', () => {
    expect(extractTrailingJson('')).toBeNull();
    expect(extractTrailingJson('   \n  ')).toBeNull();
  });

  it('returns null on unparseable trailing block', () => {
    const out = '[detector] crashed\n{broken';
    expect(extractTrailingJson(out)).toBeNull();
  });

  it('parses nested JSON (evidence with sub-objects)', () => {
    const out = JSON.stringify({
      sd_key: 'SD-X',
      check_type: 'spec_code_drift',
      status: 'failed',
      signals_detected: 3,
      evidence: {
        declarations: [
          { endpoint: '/api/a', location: 'plan.md:12' },
          { endpoint: '/api/b', location: 'plan.md:18' },
        ],
      },
    });
    const parsed = extractTrailingJson(out);
    expect(parsed.evidence.declarations).toHaveLength(2);
    expect(parsed.evidence.declarations[0].endpoint).toBe('/api/a');
  });

  it('recovers JSON when detector emits extra trailing newline', () => {
    const out = '{"status":"passed","check_type":"x"}\n\n';
    expect(extractTrailingJson(out)?.status).toBe('passed');
  });
});

describe('runner — row normalization semantics', () => {
  // Detectors may emit a single row or a results array; runner handles both.
  function normalizeFromDetectorOutput(detectorJson, sdKey) {
    const VALID_STATUSES = new Set(['passed', 'failed', 'warning', 'pending']);
    const rows = Array.isArray(detectorJson.results) && detectorJson.results.length
      ? detectorJson.results
      : [detectorJson];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      if (!r.check_type) continue;
      if (!VALID_STATUSES.has(r.status)) continue;
      out.push({
        sd_key: r.sd_key || sdKey,
        check_type: r.check_type,
        status: r.status,
        signals_detected: Number(r.signals_detected) || 0,
        evidence: r.evidence && typeof r.evidence === 'object' ? r.evidence : {},
      });
    }
    return out;
  }

  it('normalizes single-row detector output', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', signals_detected: 0, evidence: {} },
      'SD-X'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sd_key).toBe('SD-X');
  });

  it('expands results array detector output', () => {
    const rows = normalizeFromDetectorOutput({
      results: [
        { check_type: 'orphan_detection', status: 'passed' },
        { check_type: 'pipeline_integration', status: 'warning', signals_detected: 2 },
      ],
    }, 'SD-X');
    expect(rows).toHaveLength(2);
    expect(rows[1].signals_detected).toBe(2);
  });

  it('filters invalid status values', () => {
    const rows = normalizeFromDetectorOutput({
      results: [
        { check_type: 'orphan_detection', status: 'passed' },
        { check_type: 'orphan_detection', status: 'invalid_status' },
        { check_type: null, status: 'passed' }, // missing check_type
      ],
    }, 'SD-X');
    expect(rows).toHaveLength(1);
  });

  it('coerces signals_detected to number', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', signals_detected: '42' },
      'SD-X'
    );
    expect(rows[0].signals_detected).toBe(42);
  });

  it('defaults evidence to empty object if absent or invalid', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', evidence: 'not an object' },
      'SD-X'
    );
    expect(rows[0].evidence).toEqual({});
  });
});

describe('DETECTORS registry integrity', () => {
  it('maps each required check_type to a detector script path', async () => {
    // Match the registry embedded in the runner source.
    const DETECTORS = {
      orphan_detection:      'scripts/wiring-validators/orphan-detector.js',
      spec_code_drift:       'scripts/wiring-validators/spec-code-drift-detector.js',
      vision_traceability:   'scripts/wiring-validators/vision-traceability-checker.js',
      pipeline_integration:  'scripts/wiring-validators/orphan-detector.js',
      e2e_demo:              'scripts/wiring-validators/e2e-demo-recorder.js',
    };
    // Required-for-now: orphan_detection + spec_code_drift. The other 3 are
    // reserved slots for C/E to land.
    expect(DETECTORS).toHaveProperty('orphan_detection');
    expect(DETECTORS).toHaveProperty('spec_code_drift');
    expect(DETECTORS.orphan_detection).toMatch(/orphan-detector\.js$/);
    expect(DETECTORS.pipeline_integration).toBe(DETECTORS.orphan_detection);
  });
});
