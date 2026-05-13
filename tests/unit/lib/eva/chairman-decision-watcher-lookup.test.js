// SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-5 unit tests
// Covers isDecisionCreatingStage + FALLBACK_DECISION_CREATING_STAGES.

import { describe, it, expect, vi } from 'vitest';
import {
  isDecisionCreatingStage,
  FALLBACK_DECISION_CREATING_STAGES,
} from '../../../../lib/eva/chairman-decision-watcher.js';

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

function makeSupabase(rpcImpl) {
  return { rpc: vi.fn().mockImplementation((name, args) => rpcImpl(name, args)) };
}

function row({ creates, gate_type = null, review_mode = null }) {
  return { data: [{ creates_decision: creates, gate_type, review_mode }], error: null };
}

describe('isDecisionCreatingStage — RPC path (FR-1 primary)', () => {
  const stageMatrix = [
    { stage: 1, creates: false, gate_type: 'none', review_mode: 'none' },
    { stage: 2, creates: false, gate_type: 'none', review_mode: 'none' },
    { stage: 3, creates: true, gate_type: 'kill', review_mode: 'auto' },
    { stage: 4, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 5, creates: true, gate_type: 'kill', review_mode: 'auto' },
    { stage: 6, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 7, creates: true, gate_type: 'none', review_mode: 'review' },
    { stage: 8, creates: true, gate_type: 'none', review_mode: 'review' },
    { stage: 9, creates: true, gate_type: 'none', review_mode: 'review' },
    { stage: 10, creates: true, gate_type: 'kill', review_mode: 'auto' },
    { stage: 11, creates: true, gate_type: 'none', review_mode: 'review' },
    { stage: 12, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 13, creates: true, gate_type: 'kill', review_mode: 'auto' },
    { stage: 14, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 15, creates: false, gate_type: 'none', review_mode: 'auto' },
    // S16 is the empirical witness — NameSignal venture stuck on 2026-05-12.
    { stage: 16, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    { stage: 17, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    { stage: 18, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    { stage: 19, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    // S20 was previously in the hand-maintained Set but stage_config says 'none'.
    { stage: 20, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 21, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 22, creates: false, gate_type: 'none', review_mode: 'auto' },
    { stage: 23, creates: true, gate_type: 'kill', review_mode: 'auto' },
    { stage: 24, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    { stage: 25, creates: true, gate_type: 'promotion', review_mode: 'auto' },
    { stage: 26, creates: false, gate_type: 'none', review_mode: 'auto' },
  ];

  for (const { stage, creates, gate_type, review_mode } of stageMatrix) {
    it(`stage ${stage}: creates_decision=${creates} (gate_type=${gate_type}, review_mode=${review_mode})`, async () => {
      const supabase = makeSupabase((name, args) => {
        expect(name).toBe('stage_creates_decision');
        expect(args).toEqual({ p_stage_number: stage });
        return row({ creates, gate_type, review_mode });
      });
      const result = await isDecisionCreatingStage(stage, supabase, { logger: silentLogger });
      expect(result).toEqual({
        creates_decision: creates,
        gate_type,
        review_mode,
        source: 'rpc',
      });
    });
  }
});

describe('isDecisionCreatingStage — fallback path (FR-1 defensive)', () => {
  it('falls back to in-process Set when RPC returns error', async () => {
    const warns = [];
    const logger = { log: () => {}, warn: msg => warns.push(msg), error: () => {} };
    const supabase = { rpc: () => Promise.resolve({ data: null, error: { message: 'rpc not found' } }) };
    const result = await isDecisionCreatingStage(16, supabase, { logger });
    expect(result).toEqual({ creates_decision: true, gate_type: null, review_mode: null, source: 'fallback' });
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/fell back to in-process Set/);
    expect(warns[0]).toMatch(/stage 16/);
  });

  it('falls back when RPC throws', async () => {
    const logger = { log: () => {}, warn: () => {}, error: () => {} };
    const supabase = { rpc: () => Promise.reject(new Error('network')) };
    const result = await isDecisionCreatingStage(5, supabase, { logger });
    expect(result.creates_decision).toBe(true);
    expect(result.source).toBe('fallback');
  });

  it('fallback correctly INCLUDES S16 (the empirical NameSignal incident stage)', () => {
    expect(FALLBACK_DECISION_CREATING_STAGES.has(16)).toBe(true);
  });

  it('fallback correctly EXCLUDES S20 (stage_config gate_type=none)', () => {
    expect(FALLBACK_DECISION_CREATING_STAGES.has(20)).toBe(false);
  });

  it('fallback contains exactly the predicate-aligned stages', () => {
    const expected = new Set([3, 5, 7, 8, 9, 10, 11, 13, 16, 17, 18, 19, 23, 24, 25]);
    expect(FALLBACK_DECISION_CREATING_STAGES.size).toBe(expected.size);
    for (const s of expected) {
      expect(FALLBACK_DECISION_CREATING_STAGES.has(s)).toBe(true);
    }
  });
});
