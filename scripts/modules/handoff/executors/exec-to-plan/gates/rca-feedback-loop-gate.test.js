// Vitest fixture for rca-feedback-loop-gate.js + helper
// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G FR-11 (>=12 cases)

import { describe, it, expect } from 'vitest';
import {
  validFeedbackLoop,
  validNoSeamExists,
  validateRcaPayload,
  suggestedDeepeningFrom,
  OUTCOMES,
  SUGGESTED_FALLBACK
} from '../../../../pocock/rca-feedback-loop.js';
import { createRcaFeedbackLoopGate } from './rca-feedback-loop-gate.js';

function makeFakeSupabase({ configValue, rcaRows, captureUpserts, captureInserts } = {}) {
  const upserts = [];
  const inserts = [];
  return {
    _upserts: upserts,
    _inserts: inserts,
    from(table) {
      return {
        select() { return {
          eq() { return {
            eq() { return {
              gt: async () => ({ data: rcaRows || [], error: null })
            }; },
            maybeSingle: async () => ({
              data: configValue !== undefined ? { value: configValue } : null,
              error: null
            })
          }; }
        }; },
        insert(row) { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        upsert(row) { upserts.push({ table, row }); return Promise.resolve({ error: null }); }
      };
    }
  };
}

const validFL = { command: 'npx vitest run gate', time_to_fail_seconds: 30, deterministic: true };
const validNS = 'No good test seam exists because the orchestrator hook fires synchronously inside a global stage transition.';

describe('rca-feedback-loop helper', () => {
  it('Case 1 — feedback_loop valid -> PASS_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: validFL });
    expect(r.pass).toBe(true);
    expect(r.outcome).toBe(OUTCOMES.PASS_FEEDBACK_LOOP);
  });

  it('Case 2 — no_seam_exists valid -> PASS_NO_SEAM_EXISTS', () => {
    const r = validateRcaPayload({ no_seam_exists: { rationale: validNS } });
    expect(r.pass).toBe(true);
    expect(r.outcome).toBe(OUTCOMES.PASS_NO_SEAM_EXISTS);
  });

  it('Case 3 — both present -> BLOCK_USE_ONE_NOT_BOTH', () => {
    const r = validateRcaPayload({ feedback_loop: validFL, no_seam_exists: { rationale: validNS } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_USE_ONE_NOT_BOTH);
  });

  it('Case 4 — neither -> BLOCK_REQUIRE_ONE', () => {
    const r = validateRcaPayload({});
    expect(r.outcome).toBe(OUTCOMES.BLOCK_REQUIRE_ONE);
  });

  it('Case 5 — command too short -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, command: 'test' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('Case 6 — time_to_fail_seconds = 0 -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, time_to_fail_seconds: 0 } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('Case 7 — deterministic = string -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, deterministic: 'true' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('Case 8 — feedback_loop extra key -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, priority: 'p0' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('Case 9 — no_seam_exists = "none" -> BLOCK_INVALID_NO_SEAM', () => {
    const r = validateRcaPayload({ no_seam_exists: { rationale: 'none' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_NO_SEAM);
  });

  it('Case 10 — no_seam_exists rationale < 30 chars -> BLOCK_INVALID_NO_SEAM', () => {
    const r = validateRcaPayload({ no_seam_exists: { rationale: 'short rationale text here.' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_NO_SEAM);
  });

  it('Case 11 — feedback_loop with shell-chain metacharacter -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, command: 'echo a && rm -rf /' } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('Case 12 — feedback_loop with floating time_to_fail_seconds -> BLOCK_INVALID_FEEDBACK_LOOP', () => {
    const r = validateRcaPayload({ feedback_loop: { ...validFL, time_to_fail_seconds: 60.5 } });
    expect(r.outcome).toBe(OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP);
  });

  it('suggestedDeepeningFrom returns extracted sentence when long enough', () => {
    const long = 'Extract a deterministic harness around the orchestrator hook. Subsequent text.';
    expect(suggestedDeepeningFrom(long)).toContain('Extract a deterministic harness');
  });

  it('suggestedDeepeningFrom returns fallback for short rationale', () => {
    expect(suggestedDeepeningFrom('short.')).toBe(SUGGESTED_FALLBACK);
  });
});

describe('createRcaFeedbackLoopGate', () => {
  it('disabled mode -> gate is no-op PASS', async () => {
    const sb = makeFakeSupabase({ configValue: '"disabled"' });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', phase: 'EXEC-TO-PLAN', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
  });

  it('advisory mode + BLOCK outcome -> gate returns PASS, telemetry written', async () => {
    const sb = makeFakeSupabase({
      configValue: '"advisory"',
      rcaRows: [{ id: 'rca-1', metadata: {} }]
    });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', sd_key: 'SD-X', phase: 'EXEC-TO-PLAN', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(true);
    expect(r.details.mode).toBe('advisory');
    expect(sb._inserts.some(i => i.row.sub_agent_code === 'RCA_FEEDBACK_LOOP_GATE')).toBe(true);
  });

  it('blocking mode + BLOCK outcome -> gate returns FAIL', async () => {
    const sb = makeFakeSupabase({
      configValue: '"blocking"',
      rcaRows: [{ id: 'rca-1', metadata: {} }]
    });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', sd_key: 'SD-X', phase: 'EXEC-TO-PLAN', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('blocking mode + PASS_NO_SEAM_EXISTS -> upsert to architectural_prevention_findings', async () => {
    const sb = makeFakeSupabase({
      configValue: '"blocking"',
      rcaRows: [{ id: 'rca-2', metadata: { no_seam_exists: { rationale: validNS } } }]
    });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', sd_key: 'SD-Y', phase: 'PLAN-TO-LEAD', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(true);
    expect(sb._upserts.length).toBe(1);
    expect(sb._upserts[0].table).toBe('architectural_prevention_findings');
    expect(sb._upserts[0].row.source_rca_id).toBe('rca-2');
    expect(sb._upserts[0].row.source_sd_key).toBe('SD-Y');
  });

  it('no RCA rows -> PASS without enforcement', async () => {
    const sb = makeFakeSupabase({ configValue: '"blocking"', rcaRows: [] });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', sd_key: 'SD-Z', phase: 'EXEC-TO-PLAN', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(true);
    expect(r.details.rca_row_count).toBe(0);
  });

  it('missing app_config row -> defaults to advisory (safer)', async () => {
    const sb = makeFakeSupabase({
      configValue: undefined,
      rcaRows: [{ id: 'rca-3', metadata: {} }]
    });
    const gate = createRcaFeedbackLoopGate(sb);
    const r = await gate.validator({ sd_id: 'sd-uuid', sd_key: 'SD-Q', phase: 'EXEC-TO-PLAN', phase_started_at: '2020-01-01T00:00:00Z' });
    expect(r.passed).toBe(true);
    expect(r.details.mode).toBe('advisory');
  });
});
