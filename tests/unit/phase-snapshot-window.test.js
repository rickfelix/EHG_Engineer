/**
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-1, FR-2)
 *
 * Direct HandoffRecorder execution is hard to mock without the full dep tree (established
 * pattern, see tests/unit/handoff-recorder-pending-upsert.test.js) -- this file covers the pure
 * buildPhaseSnapshotWindow() helper directly, plus source-pin assertions confirming the wiring
 * into HandoffRecorder.js and the migration's immutability trigger/view shapes.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPhaseSnapshotWindow } from '../../lib/governance/phase-snapshot-window.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('buildPhaseSnapshotWindow — pure builder', () => {
  test('returns a window_registered_at timestamp and a baseline_snapshot carrying sd/phase identity', () => {
    const result = buildPhaseSnapshotWindow({ sdId: 'sd-1', fromPhase: 'LEAD', toPhase: 'PLAN' });
    expect(typeof result.window_registered_at).toBe('string');
    expect(Number.isNaN(Date.parse(result.window_registered_at))).toBe(false);
    expect(result.baseline_snapshot.sd_id).toBe('sd-1');
    expect(result.baseline_snapshot.from_phase).toBe('LEAD');
    expect(result.baseline_snapshot.to_phase).toBe('PLAN');
    expect(result.baseline_snapshot.registered_at).toBe(result.window_registered_at);
  });

  test('metrics is an explicitly empty object, not fabricated data', () => {
    const result = buildPhaseSnapshotWindow({ sdId: 'sd-2', fromPhase: 'PLAN', toPhase: 'EXEC' });
    expect(result.baseline_snapshot.metrics).toEqual({});
  });

  test('accepts an explicit registeredAt override (for deterministic tests / seeded fixtures)', () => {
    const fixed = '2026-08-29T00:00:00.000Z';
    const result = buildPhaseSnapshotWindow({ sdId: 'sd-3', fromPhase: 'EXEC', toPhase: 'PLAN', registeredAt: fixed });
    expect(result.window_registered_at).toBe(fixed);
    expect(result.baseline_snapshot.registered_at).toBe(fixed);
  });

  test('handles missing sdId/fromPhase/toPhase without throwing', () => {
    expect(() => buildPhaseSnapshotWindow({})).not.toThrow();
    const result = buildPhaseSnapshotWindow({});
    expect(result.baseline_snapshot.sd_id).toBeNull();
  });
});

describe('HandoffRecorder.js wiring — source-pin assertions', () => {
  let source;
  test('setup: read HandoffRecorder.js', () => {
    source = readFileSync(
      path.join(ROOT, 'scripts/modules/handoff/recording/HandoffRecorder.js'),
      'utf8'
    );
    expect(source.length).toBeGreaterThan(0);
  });

  test('imports buildPhaseSnapshotWindow from the governance module', () => {
    expect(source).toMatch(/import\s*\{\s*buildPhaseSnapshotWindow\s*\}\s*from\s*['"].*phase-snapshot-window\.mjs['"]/);
  });

  test('handoffRecord includes window_registered_at/baseline_snapshot fields', () => {
    expect(source).toMatch(/window_registered_at:\s*phaseSnapshotWindow\.window_registered_at/);
    expect(source).toMatch(/baseline_snapshot:\s*phaseSnapshotWindow\.baseline_snapshot/);
  });

  test('PGRST204 retry-fallback exists so a not-yet-migrated table never breaks every handoff', () => {
    expect(source).toMatch(/insertError\.code === ['"]PGRST204['"]/);
    expect(source).toMatch(/window_registered_at\|baseline_snapshot/);
  });
});

describe('Migration file — immutability trigger and view shapes', () => {
  let sql;
  let sqlNoComments;
  test('setup: read the migration', () => {
    sql = readFileSync(
      path.join(ROOT, 'database/chairman-gated/20260829_phase_snapshot_windows_agent_class_rates.sql'),
      'utf8'
    );
    expect(sql.length).toBeGreaterThan(0);
    // Strip line comments (-- ...) so assertions about actual SQL statements aren't tripped by
    // explanatory prose that legitimately mentions sd_corrections/REVOKE/GRANT as context.
    sqlNoComments = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  });

  test('adds nullable, additive columns (no DROP/backfill)', () => {
    expect(sql).toMatch(/ALTER TABLE sd_phase_handoffs\s+ADD COLUMN IF NOT EXISTS window_registered_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ALTER TABLE sd_phase_handoffs\s+ADD COLUMN IF NOT EXISTS baseline_snapshot JSONB/);
    expect(sql).not.toMatch(/DROP COLUMN/);
  });

  test('immutability trigger rejects a rewrite once window_registered_at is already set', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.phase_snapshot_window_freeze/);
    expect(sql).toMatch(/OLD\.window_registered_at IS NOT NULL/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.sd_phase_handoffs/);
  });

  test('v_phase_snapshot_windows excludes blocked/wait rows', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_phase_snapshot_windows/);
    expect(sql).toMatch(/status IS DISTINCT FROM 'blocked'/);
    expect(sql).toMatch(/wait/);
  });

  test('v_agent_class_rates view body never references sd_corrections, only sub_agent_execution_results', () => {
    const viewMatch = sqlNoComments.match(/CREATE OR REPLACE VIEW public\.v_agent_class_rates AS([\s\S]*?);/);
    expect(viewMatch).not.toBeNull();
    const viewBody = viewMatch[1];
    expect(viewBody).toMatch(/FROM public\.sub_agent_execution_results/);
    expect(viewBody).not.toMatch(/sd_corrections/);
  });

  test('no REVOKE/GRANT/RLS-policy statements (purely additive)', () => {
    expect(sqlNoComments).not.toMatch(/\bREVOKE\b/i);
    expect(sqlNoComments).not.toMatch(/\bGRANT\b/i);
    expect(sqlNoComments).not.toMatch(/\bCREATE POLICY\b/i);
    expect(sqlNoComments).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});
