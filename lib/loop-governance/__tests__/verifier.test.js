/**
 * Closure-verifier orchestrator tests (FR-3).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 */
import { describe, it, expect } from 'vitest';
import { evaluateLoopBatch, runClosureVerifier, VERIFIER_PROCESS_KEY } from '../verifier.js';
import { PREDICATE_TYPES, LOOP_STATUS } from '../closure-engine.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();

const loops = [
  { loop_key: 'L-open', predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600 } },
  { loop_key: 'L-closed', predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600 } },
];

describe('evaluateLoopBatch (FR-3)', () => {
  it('flags an opened loop OPEN and a closed loop CLOSED', async () => {
    const collect = (loop) => loop.loop_key === 'L-closed'
      ? { edgeAt: ago(60), upstreamFiredAt: ago(120) }
      : { edgeAt: null, upstreamFiredAt: ago(120) };
    const v = await evaluateLoopBatch(loops, collect, NOW);
    expect(v.find((x) => x.loop_key === 'L-open').status).toBe(LOOP_STATUS.OPEN);
    expect(v.find((x) => x.loop_key === 'L-closed').status).toBe(LOOP_STATUS.CLOSED);
  });

  it('degrades ONE loop to unknown when its collector throws (never aborts the batch)', async () => {
    const collect = (loop) => { if (loop.loop_key === 'L-open') throw new Error('probe boom'); return { edgeAt: ago(60), upstreamFiredAt: ago(120) }; };
    const v = await evaluateLoopBatch(loops, collect, NOW);
    expect(v.find((x) => x.loop_key === 'L-open').status).toBe(LOOP_STATUS.UNKNOWN);
    expect(v.find((x) => x.loop_key === 'L-closed').status).toBe(LOOP_STATUS.CLOSED);
  });
});

describe('runClosureVerifier (FR-3 — fail-soft end-to-end)', () => {
  it('reads loops, evaluates, and writes status back', async () => {
    const updates = [];
    const supabase = {
      from: () => ({
        select: async () => ({ data: loops }),
        update(payload) { this._p = payload; return this; },
        eq(_c, v) { updates.push({ key: v, payload: this._p }); return Promise.resolve({ error: null }); },
      }),
    };
    const collect = () => ({ edgeAt: ago(60), upstreamFiredAt: ago(120) });
    const r = await runClosureVerifier(supabase, collect, NOW);
    expect(r.ran).toBe(true);
    expect(r.evaluated).toBe(2);
    expect(r.written).toBe(2);
    expect(updates[0].payload.status).toBe(LOOP_STATUS.CLOSED);
    expect(updates[0].payload.evaluated_at).toBeTruthy();
  });

  it('FAIL-SOFT: reports ran=false when loop_registry is absent (chairman-gated apply pending)', async () => {
    const supabase = { from: () => ({ select: async () => ({ error: { message: 'relation "loop_registry" does not exist' } }) }) };
    const r = await runClosureVerifier(supabase, () => ({}), NOW);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/loop_registry/);
  });

  it('exports the ARMED process key for the verifier self-cadence', () => {
    expect(VERIFIER_PROCESS_KEY).toBe('g3-armed-loop-closure-verifier');
  });
});
