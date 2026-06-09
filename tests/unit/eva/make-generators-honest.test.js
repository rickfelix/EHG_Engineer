/**
 * SD-LEO-INFRA-MAKE-EHG-ENGINEER-001 — make the cadence generators honest.
 * FR-1: management-review-round reads the REAL objectives/key_results (not okr_objectives/okr_key_results).
 * FR-2: okr_snapshot progress is value-derived (current/target/baseline + direction), never a .progress column.
 * FR-3: design-quality-scorecard scoreByKey is wired at EXEC-TO-PLAN, fail-open (try/catch + warn).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deriveKrProgress, buildOkrSnapshot } from '../../../lib/eva/okr-progress.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const ROUND_SRC = readFileSync(resolve(REPO_ROOT, 'scripts/eva/management-review-round.mjs'), 'utf8');
const EXEC_SRC = readFileSync(resolve(REPO_ROOT, 'scripts/modules/handoff/executors/exec-to-plan/index.js'), 'utf8');

describe('FR-2: deriveKrProgress (value-derived, never .progress)', () => {
  it('derives mid-range progress from baseline/current/target', () => {
    expect(deriveKrProgress({ baseline_value: 0, current_value: 5, target_value: 10 })).toBe(50);
  });
  it('honors a decrease goal via the sign of the span', () => {
    expect(deriveKrProgress({ baseline_value: 100, current_value: 75, target_value: 50 })).toBe(50);
  });
  it('guards divide-by-zero (target == baseline)', () => {
    expect(deriveKrProgress({ baseline_value: 10, current_value: 10, target_value: 10 })).toBe(100); // zero span, target reached
    expect(deriveKrProgress({ baseline_value: 10, current_value: 5, target_value: 10 })).toBe(0); // zero span, target NOT reached
  });
  it('clamps to [0,100] and tolerates missing/NaN values', () => {
    expect(deriveKrProgress({ baseline_value: 0, current_value: 20, target_value: 10 })).toBe(100); // over-target clamps
    expect(deriveKrProgress({ baseline_value: 0, current_value: -5, target_value: 10 })).toBe(0); // below-baseline clamps
    expect(deriveKrProgress({ current_value: 5 })).toBe(0); // missing baseline/target
    expect(deriveKrProgress(null)).toBe(0);
  });
  it('NEVER reads a .progress field (value-derived only)', () => {
    // A row with a bogus progress field still derives from values.
    expect(deriveKrProgress({ baseline_value: 0, current_value: 3, target_value: 6, progress: 99 })).toBe(50);
  });
});

describe('FR-2: buildOkrSnapshot', () => {
  it('groups key_results by objective_id and derives non-zero avg progress', () => {
    const objectives = [{ id: 'o1', code: 'O1', title: 'Obj 1' }];
    const keyResults = [
      { objective_id: 'o1', code: 'KR1', title: 'KR 1', status: 'on_track', baseline_value: 0, current_value: 5, target_value: 10 },
      { objective_id: 'o1', code: 'KR2', title: 'KR 2', status: 'on_track', baseline_value: 0, current_value: 10, target_value: 10 },
    ];
    const snap = buildOkrSnapshot(objectives, keyResults);
    expect(snap).toHaveLength(1);
    expect(snap[0].objective).toBe('Obj 1');
    expect(snap[0].keyResults.map(k => k.progress)).toEqual([50, 100]);
    expect(snap[0].avgKRProgress).toBe(75); // non-zero, value-derived
  });
  it('tolerates empty input', () => {
    expect(buildOkrSnapshot([], [])).toEqual([]);
    expect(buildOkrSnapshot(null, null)).toEqual([]);
  });
});

describe('FR-1: management-review-round reads the real OKR tables', () => {
  it('queries objectives + key_results, not okr_objectives/okr_key_results', () => {
    expect(ROUND_SRC).toMatch(/\.from\('objectives'\)/);
    expect(ROUND_SRC).toMatch(/\.from\('key_results'\)/);
    expect(ROUND_SRC).not.toMatch(/from\('okr_objectives'\)/);
    expect(ROUND_SRC).not.toMatch(/from\('okr_key_results'\)/);
    expect(ROUND_SRC).not.toMatch(/checkFreshness\('okr_key_results'\)/); // freshness fixed too
  });
  it('uses the value-derived buildOkrSnapshot and no longer reads a .progress field', () => {
    expect(ROUND_SRC).toMatch(/buildOkrSnapshot\(objectives, keyResults\)/);
    expect(ROUND_SRC).not.toMatch(/kr\.progress/);
    expect(ROUND_SRC).not.toMatch(/obj\.progress/);
  });
});

describe('FR-3: design-quality-scorecard wired at EXEC-TO-PLAN, fail-open', () => {
  it('imports scoreByKey and calls it on the SD key', () => {
    expect(EXEC_SRC).toMatch(/scoreByKey/);
    expect(EXEC_SRC).toMatch(/import\(['"]\.\.\/\.\.\/\.\.\/\.\.\/design-quality-scorecard\.js['"]\)/);
    expect(EXEC_SRC).toMatch(/scoreByKey\(sd\?\.sd_key \|\| sdId\)/);
  });
  it('is fail-open (try/catch + console.warn, never throws into the verdict)', () => {
    // The scoreByKey call is wrapped so a failure is swallowed with a warn.
    const hook = EXEC_SRC.slice(EXEC_SRC.indexOf('design-quality scorecard for THIS SD'), EXEC_SRC.indexOf('return {\n      success: true'));
    expect(hook).toMatch(/try \{/);
    expect(hook).toMatch(/catch/);
    expect(hook).toMatch(/console\.warn\(\[?['"]?\[exec-to-plan\] design-quality-scorecard refresh skipped/);
  });
});
