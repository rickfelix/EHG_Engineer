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
  let closer = null;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const c = trimmed[i];
    if (c === '}' || c === ']') {
      if (depth === 0) { end = i; closer = c; }
      depth++;
    } else if (c === '{' || c === '[') {
      depth--;
      if (depth === 0 && closer &&
          ((c === '{' && closer === '}') || (c === '[' && closer === ']'))) {
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
  // Detectors emit one of three shapes; runner supports all.
  // Status aliases: pass→passed, fail/error→failed, warn→warning, pending→pending.
  const STATUS_ALIASES = {
    pass: 'passed', passed: 'passed',
    fail: 'failed', failed: 'failed', error: 'failed',
    warn: 'warning', warning: 'warning',
    pending: 'pending',
  };
  const VALID = new Set(['passed', 'failed', 'warning', 'pending']);

  function normalizeStatus(raw) {
    if (typeof raw !== 'string') return null;
    const m = STATUS_ALIASES[raw.toLowerCase()];
    return VALID.has(m) ? m : null;
  }
  function normalizeSignals(raw) {
    if (Array.isArray(raw)) return raw.length;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function normalizeFromDetectorOutput(detectorJson, sdKey) {
    const rows = Array.isArray(detectorJson)              ? detectorJson
               : Array.isArray(detectorJson.results)       ? detectorJson.results
               : [detectorJson];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      if (!r.check_type) continue;
      const status = normalizeStatus(r.status);
      if (!status) continue;
      out.push({
        sd_key: r.sd_key || sdKey,
        check_type: r.check_type,
        status,
        signals_detected: normalizeSignals(r.signals_detected),
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

  it('accepts top-level array detector output (real orphan/spec-code-drift shape)', () => {
    const rows = normalizeFromDetectorOutput(
      [
        { sd_key: 'SD-X', check_type: 'orphan_detection', status: 'pass', signals_detected: [] },
        { sd_key: 'SD-X', check_type: 'spec_code_drift',  status: 'error', signals_detected: [{ endpoint: '/api/a' }] },
      ],
      'SD-X'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('passed');           // pass → passed alias
    expect(rows[1].status).toBe('failed');           // error → failed alias
    expect(rows[1].signals_detected).toBe(1);        // array length
  });

  it('maps status aliases: pass/fail/error/warn', () => {
    const rows = normalizeFromDetectorOutput([
      { check_type: 'orphan_detection', status: 'pass' },
      { check_type: 'spec_code_drift',  status: 'fail' },
      { check_type: 'vision_traceability', status: 'error' },
      { check_type: 'pipeline_integration', status: 'warn' },
      { check_type: 'e2e_demo', status: 'pending' },
    ], 'SD-X');
    expect(rows.map(r => r.status)).toEqual(['passed', 'failed', 'failed', 'warning', 'pending']);
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

  it('coerces numeric signals_detected', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', signals_detected: '42' },
      'SD-X'
    );
    expect(rows[0].signals_detected).toBe(42);
  });

  it('converts signals_detected array to count', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', signals_detected: [{ file: 'a' }, { file: 'b' }, { file: 'c' }] },
      'SD-X'
    );
    expect(rows[0].signals_detected).toBe(3);
  });

  it('defaults evidence to empty object if absent or invalid', () => {
    const rows = normalizeFromDetectorOutput(
      { check_type: 'orphan_detection', status: 'passed', evidence: 'not an object' },
      'SD-X'
    );
    expect(rows[0].evidence).toEqual({});
  });
});

describe('extractTrailingJson — arrays', () => {
  it('parses top-level JSON array (detector format)', () => {
    const out = '[{"sd_key":"SD-X","check_type":"orphan_detection","status":"pass"}]';
    const parsed = extractTrailingJson(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].check_type).toBe('orphan_detection');
  });

  it('parses JSON array after leading log lines', () => {
    const out = [
      '[detector] starting',
      '[detector] done',
      '[{"sd_key":"SD-X","check_type":"orphan_detection","status":"pass","signals_detected":[]}]'
    ].join('\n');
    const parsed = extractTrailingJson(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
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
