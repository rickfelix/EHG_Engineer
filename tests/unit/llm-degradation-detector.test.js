/**
 * SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-3/FR-5) — fallback-ladder rung evaluator.
 * Pins each rung boundary, precedence, recovery, and the fail-open direction.
 */
import { describe, it, expect } from 'vitest';
import { evaluateDegradationRung, isDegradedSafeMode, RUNG, DEFAULT_LIVENESS_STALE_MS, detectFromDb } from '../../scripts/continuity/llm-degradation-detector.mjs';

const NOW = 1_000_000_000_000;
const isoAgo = (ms) => new Date(NOW - ms).toISOString();
const healthy = () => ({
  status: 'rolling', current_error_rate: 0.01, error_rate_threshold: 0.05,
  current_latency_p95_ms: 1000, baseline_latency_p95_ms: 1000, latency_multiplier_threshold: 2.0,
  consecutive_failures: 0, failures_before_rollback: 3, last_quality_check_at: isoAgo(60_000),
});

describe('evaluateDegradationRung — rung boundaries', () => {
  it('NORMAL when all signals healthy', () => {
    expect(evaluateDegradationRung(healthy(), NOW).rung).toBe(RUNG.NORMAL);
  });

  it('NORMAL when there is NO canary row (assume healthy, do not disrupt)', () => {
    expect(evaluateDegradationRung(null, NOW).rung).toBe(RUNG.NORMAL);
    expect(evaluateDegradationRung(undefined, NOW).rung).toBe(RUNG.NORMAL);
  });

  it('SINGLE_SESSION on latency degradation (p95 > mult × baseline)', () => {
    const r = evaluateDegradationRung({ ...healthy(), current_latency_p95_ms: 2100 }, NOW); // > 2.0×1000
    expect(r.rung).toBe(RUNG.SINGLE_SESSION);
  });

  it('SINGLE_SESSION on stale liveness (probe ran then stopped)', () => {
    const r = evaluateDegradationRung({ ...healthy(), last_quality_check_at: isoAgo(DEFAULT_LIVENESS_STALE_MS + 60_000) }, NOW);
    expect(r.rung).toBe(RUNG.SINGLE_SESSION);
    expect(r.signals.livenessStale).toBe(true);
  });

  it('MODEL_FALLBACK on error-rate over threshold (out-ranks latency/liveness)', () => {
    const r = evaluateDegradationRung({ ...healthy(), current_error_rate: 0.06, current_latency_p95_ms: 5000 }, NOW);
    expect(r.rung).toBe(RUNG.MODEL_FALLBACK);
  });

  it('PAUSE_AND_SURFACE when consecutive_failures hits the limit ON AN ACTIVE PROBE (highest precedence)', () => {
    const r = evaluateDegradationRung({ ...healthy(), status: 'rolling', consecutive_failures: 3, failures_before_rollback: 3, current_error_rate: 0.9 }, NOW);
    expect(r.rung).toBe(RUNG.PAUSE_AND_SURFACE);
    expect(isDegradedSafeMode(r.rung)).toBe(true);
  });

  it('does NOT pause on a stale/paused singleton with a leftover failure counter (no false-pause on a quiescent fleet)', () => {
    // consecutive_failures is reset-only on llm_canary_state; a paused row at >=limit must NOT pin PAUSE.
    const r = evaluateDegradationRung({ ...healthy(), status: 'paused', consecutive_failures: 9, failures_before_rollback: 3 }, NOW);
    expect(r.rung).toBe(RUNG.NORMAL);
  });

  it('does NOT treat status=rolled_back as degradation (on the local-rollout canary it means back to the HEALTHY cloud — inverse of a cap)', () => {
    expect(evaluateDegradationRung({ ...healthy(), status: 'rolled_back' }, NOW).rung).toBe(RUNG.NORMAL);
  });
});

describe('evaluateDegradationRung — precedence + recovery + fail-safe', () => {
  it('precedence: pause > model-fallback > single-session > normal', () => {
    const base = { ...healthy(), consecutive_failures: 3, current_error_rate: 0.9, current_latency_p95_ms: 9999 };
    expect(evaluateDegradationRung(base, NOW).rung).toBe(RUNG.PAUSE_AND_SURFACE); // failures win
    expect(evaluateDegradationRung({ ...base, consecutive_failures: 0 }, NOW).rung).toBe(RUNG.MODEL_FALLBACK); // err wins over latency
    expect(evaluateDegradationRung({ ...base, consecutive_failures: 0, current_error_rate: 0.01 }, NOW).rung).toBe(RUNG.SINGLE_SESSION); // latency only
  });

  it('recovery: healthy signals return NORMAL (climbs back)', () => {
    expect(evaluateDegradationRung(healthy(), NOW).rung).toBe(RUNG.NORMAL);
  });

  it('fail-safe: null/garbage metrics do not spuriously degrade', () => {
    expect(evaluateDegradationRung({ status: 'paused', current_error_rate: null, current_latency_p95_ms: null, last_quality_check_at: null }, NOW).rung).toBe(RUNG.NORMAL);
    expect(evaluateDegradationRung({ current_error_rate: 'x', baseline_latency_p95_ms: 0 }, NOW).rung).toBe(RUNG.NORMAL);
  });

  it('isDegradedSafeMode is true only for PAUSE_AND_SURFACE', () => {
    expect(isDegradedSafeMode(RUNG.PAUSE_AND_SURFACE)).toBe(true);
    expect(isDegradedSafeMode(RUNG.MODEL_FALLBACK)).toBe(false);
    expect(isDegradedSafeMode(RUNG.NORMAL)).toBe(false);
  });
});

describe('detectFromDb — repoint + Layer-2 quiescent-fleet guard (SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001)', () => {
  const NOW2 = 1_000_000_000_000;
  const freshIso = new Date(NOW2 - 60_000).toISOString();
  const degraded = { status: 'rolling', current_error_rate: 0.06, error_rate_threshold: 0.05, current_latency_p95_ms: 1000, baseline_latency_p95_ms: 1000, latency_multiplier_threshold: 2.0, consecutive_failures: 0, failures_before_rollback: 3, last_quality_check_at: freshIso };
  const pausing = { ...degraded, current_error_rate: 0.9, consecutive_failures: 3 };

  function fakeDb({ healthRow, liveCount = null, liveError = null, healthError = null }) {
    return {
      from(table) {
        if (table === 'llm_cloud_health') {
          const api = { select() { return api; }, limit() { return api; }, maybeSingle: async () => ({ data: healthRow, error: healthError }) };
          return api;
        }
        if (table === 'claude_sessions') {
          const api = { select() { return api; }, eq() { return api; }, gt: async () => ({ count: liveCount, error: liveError }) };
          return api;
        }
        throw new Error('unexpected table ' + table);
      },
    };
  }

  it('reads llm_cloud_health (live feeder substrate), NOT the old llm_canary_state placeholder', async () => {
    const tables = [];
    const db = { from(t) { tables.push(t); const api = { select() { return api; }, limit() { return api; }, eq() { return api; }, maybeSingle: async () => ({ data: null, error: null }), gt: async () => ({ count: 0, error: null }) }; return api; } };
    await detectFromDb(db, NOW2);
    expect(tables).toContain('llm_cloud_health');
    expect(tables).not.toContain('llm_canary_state');
  });

  it('degraded row + 0 live workers -> NORMAL (quiescent guard suppresses)', async () => {
    const r = await detectFromDb(fakeDb({ healthRow: degraded, liveCount: 0 }), NOW2);
    expect(r.rung).toBe(RUNG.NORMAL);
    expect(r.reason).toMatch(/quiescent/i);
  });

  it('degraded row + >=1 live worker -> the degraded rung (not suppressed)', async () => {
    const r = await detectFromDb(fakeDb({ healthRow: degraded, liveCount: 2 }), NOW2);
    expect(r.rung).toBe(RUNG.MODEL_FALLBACK);
    expect(r.signals.liveWorkers).toBe(2);
  });

  it('PAUSE candidate + 0 live workers -> NORMAL; + 1 live worker -> PAUSE_AND_SURFACE', async () => {
    expect((await detectFromDb(fakeDb({ healthRow: pausing, liveCount: 0 }), NOW2)).rung).toBe(RUNG.NORMAL);
    expect((await detectFromDb(fakeDb({ healthRow: pausing, liveCount: 1 }), NOW2)).rung).toBe(RUNG.PAUSE_AND_SURFACE);
  });

  it('degraded row + UNKNOWN liveness (query error) -> NOT suppressed (surface the real signal)', async () => {
    const r = await detectFromDb(fakeDb({ healthRow: degraded, liveError: { message: 'liveness q failed' } }), NOW2);
    expect(r.rung).toBe(RUNG.MODEL_FALLBACK);
  });

  it('healthy row -> NORMAL (evaluator returns early; guard not consulted)', async () => {
    const r = await detectFromDb(fakeDb({ healthRow: { ...degraded, status: 'paused', current_error_rate: 0.0, consecutive_failures: 0 }, liveCount: 0 }), NOW2);
    expect(r.rung).toBe(RUNG.NORMAL);
  });

  it('cloud-health read error -> NORMAL (fail-open)', async () => {
    const r = await detectFromDb(fakeDb({ healthRow: null, healthError: { message: 'down' } }), NOW2);
    expect(r.rung).toBe(RUNG.NORMAL);
  });
});
