/**
 * EHG self-scoring regression-pin.
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-5 / TS-15).
 *
 * Pins the EHG early-return identity preservation. The fixture
 * tests/fixtures/ehg-baseline-score.json captures the score at the time
 * this SD merged; any subsequent regression in the EHG path causes the
 * total or per-dim score to drift, which this test catches structurally.
 *
 * Live-scoring assertion (`it.runIf(LIVE_EHG_SCORE=1)`) re-runs the actual
 * scorer against DB+filesystem and asserts ±2 pt delta from baseline.
 * Default-skipped to keep unit tests hermetic.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../../fixtures/ehg-baseline-score.json');
const SCORER_PATH = join(__dirname, '../../../scripts/eva/vision-evidence-scorer.js');
const LIVE = process.env.LIVE_EHG_SCORE === '1';

function loadBaseline() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('EHG self-scoring regression-pin (fixture)', () => {
  it('baseline fixture exists', () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
  });

  it('baseline has total_score 90-100 (sanity)', () => {
    const b = loadBaseline();
    expect(typeof b.total_score).toBe('number');
    expect(b.total_score).toBeGreaterThanOrEqual(90);
    expect(b.total_score).toBeLessThanOrEqual(100);
  });

  it('baseline contains 18 dimensions (V01-V11 + A01-A07)', () => {
    const b = loadBaseline();
    expect(Array.isArray(b.dimensions)).toBe(true);
    expect(b.dimensions).toHaveLength(18);
    const ids = b.dimensions.map(d => d.id).sort();
    expect(ids).toContain('V01');
    expect(ids).toContain('V11');
    expect(ids).toContain('A01');
    expect(ids).toContain('A07');
  });

  it('every baseline dimension has a numeric score, name, reasoning', () => {
    const b = loadBaseline();
    for (const d of b.dimensions) {
      expect(typeof d.score).toBe('number');
      expect(d.name).toBeTypeOf('string');
      expect(d.reasoning).toBeTypeOf('string');
    }
  });

  it.runIf(LIVE)('LIVE: re-running EHG scorer produces overall + per-dim scores within ±2pt of baseline', () => {
    const baseline = loadBaseline();
    const out = execFileSync('node', [SCORER_PATH], { encoding: 'utf8', cwd: join(__dirname, '../../..'), timeout: 180_000 });
    const m = out.match(/===EVIDENCE_SCORE_JSON===\n([\s\S]*?)===END_JSON===/);
    expect(m, 'scorer should emit ===EVIDENCE_SCORE_JSON=== block').toBeTruthy();
    const current = JSON.parse(m[1]);
    expect(Math.abs(current.total_score - baseline.total_score)).toBeLessThanOrEqual(2);
    const baseById = new Map(baseline.dimensions.map(d => [d.id, d]));
    for (const cur of current.dimensions) {
      const base = baseById.get(cur.id);
      expect(base, `dim ${cur.id} missing from baseline`).toBeTruthy();
      expect(Math.abs(cur.score - base.score), `dim ${cur.id} drifted ${cur.score} vs ${base.score}`).toBeLessThanOrEqual(2);
    }
  });
});
