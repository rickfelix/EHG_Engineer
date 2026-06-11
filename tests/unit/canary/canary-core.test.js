/**
 * SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001 (FR-6) — hermetic tests for the
 * pure canary core. No fs/DB/network/clock: dates injected, fixtures inline.
 */
import { describe, it, expect } from 'vitest';
import {
  CANARY_FLAG, EXTERNAL_DEP_STAGES, STAGE_STATUS,
  buildRunId, alertDedupKey, classifyExecutionRow, buildRunReport,
  probeAdmission, nextAction,
} from '../../../scripts/canary/canary-core.mjs';

const T = new Date('2026-06-10T12:00:00Z');

describe('run identity + alert dedup', () => {
  it('run id embeds the UTC date and the injected suffix', () => {
    expect(buildRunId(T, 'abc12345')).toBe('canary-2026-06-10-abc12345');
  });

  it('dedup key is stable per stage per UTC day (same-day re-run dedupes)', () => {
    const a = alertDedupKey(7, new Date('2026-06-10T01:00:00Z'));
    const b = alertDedupKey(7, new Date('2026-06-10T23:59:00Z'));
    const c = alertDedupKey(7, new Date('2026-06-11T00:01:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(alertDedupKey(8, T)).not.toBe(alertDedupKey(7, T));
  });
});

describe('classifyExecutionRow', () => {
  it('succeeded (live stage_executions value) maps to pass', () => {
    const r = classifyExecutionRow({ lifecycle_stage: 2, status: 'succeeded' });
    expect(r.status).toBe(STAGE_STATUS.PASS);
  });

  it('completed → pass with duration', () => {
    const r = classifyExecutionRow({
      lifecycle_stage: 4, status: 'completed',
      started_at: '2026-06-10T12:00:00Z', completed_at: '2026-06-10T12:00:30Z',
    });
    expect(r).toMatchObject({ stage: 4, status: STAGE_STATUS.PASS, duration_ms: 30000 });
  });

  it('failed → fail with the error message', () => {
    const r = classifyExecutionRow({ lifecycle_stage: 7, status: 'failed', error_message: 'renderer crashed' });
    expect(r).toMatchObject({ stage: 7, status: STAGE_STATUS.FAIL, error: 'renderer crashed' });
  });

  it('anything non-terminal → blocked (never silently pass)', () => {
    const r = classifyExecutionRow({ lifecycle_stage: 9, status: 'running' });
    expect(r.status).toBe(STAGE_STATUS.BLOCKED);
  });
});

describe('external-dep frontier + bounds (nextAction)', () => {
  it('drives normal stages within the bound', () => {
    expect(nextAction(5, 26)).toEqual({ action: 'drive', stage: 5 });
  });

  it('external_skip exactly the hard-dependency stages', () => {
    for (const s of [18, 19, 23, 24, 25, 26]) {
      expect(EXTERNAL_DEP_STAGES.has(s)).toBe(true);
      expect(nextAction(s, 26).action).toBe('external_skip');
    }
    for (const s of [17, 20, 21, 22]) {
      expect(EXTERNAL_DEP_STAGES.has(s)).toBe(false);
    }
  });

  it('honors --max-stages', () => {
    expect(nextAction(4, 3).action).toBe('done');
  });
});

describe('probeAdmission (flag gating)', () => {
  it('allows when the flag is enabled', () => {
    expect(probeAdmission({ flagEnabled: true, forceLocal: false }).allowed).toBe(true);
  });
  it('allows --force-local for verification runs', () => {
    const a = probeAdmission({ flagEnabled: false, forceLocal: true });
    expect(a).toMatchObject({ allowed: true, reason: 'force_local_override' });
  });
  it('refuses otherwise, naming the flag', () => {
    const a = probeAdmission({ flagEnabled: false, forceLocal: false });
    expect(a.allowed).toBe(false);
    expect(a.reason).toContain(CANARY_FLAG);
  });
});

describe('buildRunReport', () => {
  const stages = [
    { stage: 1, status: STAGE_STATUS.PASS, duration_ms: 100 },
    { stage: 2, status: STAGE_STATUS.PASS, duration_ms: 150 },
    { stage: 3, status: STAGE_STATUS.FAIL, duration_ms: 50, error: 'rpc missing' },
    { stage: 18, status: STAGE_STATUS.EXTERNAL_SKIP, duration_ms: null },
  ];

  it('summarizes counts and outcome FAIL when any stage failed', () => {
    const rep = buildRunReport({
      runId: 'canary-2026-06-10-x', startedAt: T, endedAt: new Date(T.getTime() + 5000),
      startStage: 1, endStage: 3, stageResults: stages, maxStage: 26,
    });
    expect(rep.summary).toMatchObject({ passed: 2, failed: 1, blocked: 0, external_skipped: 1 });
    expect(rep.outcome).toBe('FAIL');
    expect(rep.duration_ms).toBe(5000);
  });

  it('outcome PASS when no failures or blocks', () => {
    const rep = buildRunReport({
      runId: 'r', startedAt: T, endedAt: T, startStage: 1, endStage: 2,
      stageResults: stages.filter(s => s.status === STAGE_STATUS.PASS), maxStage: 26,
    });
    expect(rep.outcome).toBe('PASS');
  });

  it('outcome BLOCKED when blocked but not failed; carries the net-zero row delta', () => {
    const rep = buildRunReport({
      runId: 'r', startedAt: T, endedAt: T, startStage: 1, endStage: 1,
      stageResults: [{ stage: 5, status: STAGE_STATUS.BLOCKED, duration_ms: null }],
      maxStage: 26, rowDelta: { stage_executions: 0, venture_artifacts: 0 },
    });
    expect(rep.outcome).toBe('BLOCKED');
    expect(rep.row_delta).toEqual({ stage_executions: 0, venture_artifacts: 0 });
  });
});
