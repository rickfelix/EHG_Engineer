/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C — lib/adam/output-flow-gauge.js.
 */
import { describe, it, expect } from 'vitest';
import { detectOutputFlowStall, OUTPUT_FLOW_STALL_THRESHOLD_MS } from '../../../lib/adam/output-flow-gauge.js';

describe('detectOutputFlowStall', () => {
  it('never flags on a missing HEAD reading (git failure/offline)', () => {
    const r = detectOutputFlowStall({ headSha: null, priorHeadSha: 'abc', priorFirstSeenAt: 0, nowMs: 999_999_999 });
    expect(r.matched).toBe(false);
    expect(r.nextState).toEqual({ headSha: 'abc', firstSeenAt: 0 });
  });

  it('resets the baseline (never flags) on the first-ever reading', () => {
    const r = detectOutputFlowStall({ headSha: 'sha1', priorHeadSha: null, priorFirstSeenAt: null, nowMs: 1000 });
    expect(r.matched).toBe(false);
    expect(r.nextState).toEqual({ headSha: 'sha1', firstSeenAt: 1000 });
  });

  it('resets the baseline (never flags) when HEAD has moved since last tick', () => {
    const r = detectOutputFlowStall({ headSha: 'sha2', priorHeadSha: 'sha1', priorFirstSeenAt: 0, nowMs: 999_999_999 });
    expect(r.matched).toBe(false);
    expect(r.nextState).toEqual({ headSha: 'sha2', firstSeenAt: 999_999_999 });
  });

  it('flags when HEAD is unchanged for >= threshold while the fleet is active (not quiescent)', () => {
    const priorFirstSeenAt = 0;
    const nowMs = OUTPUT_FLOW_STALL_THRESHOLD_MS + 1;
    const r = detectOutputFlowStall({ headSha: 'sha1', priorHeadSha: 'sha1', priorFirstSeenAt, nowMs, quiescent: false });
    expect(r.matched).toBe(true);
    expect(r.stalledMs).toBe(nowMs - priorFirstSeenAt);
    expect(r.nextState).toEqual({ headSha: 'sha1', firstSeenAt: priorFirstSeenAt });
  });

  it('does NOT flag when unchanged for >= threshold but the fleet is legitimately quiescent', () => {
    const nowMs = OUTPUT_FLOW_STALL_THRESHOLD_MS + 1;
    const r = detectOutputFlowStall({ headSha: 'sha1', priorHeadSha: 'sha1', priorFirstSeenAt: 0, nowMs, quiescent: true });
    expect(r.matched).toBe(false);
  });

  it('does NOT flag when unchanged but under threshold', () => {
    const nowMs = OUTPUT_FLOW_STALL_THRESHOLD_MS - 1;
    const r = detectOutputFlowStall({ headSha: 'sha1', priorHeadSha: 'sha1', priorFirstSeenAt: 0, nowMs, quiescent: false });
    expect(r.matched).toBe(false);
  });

  it('a custom thresholdMs overrides the default', () => {
    const r = detectOutputFlowStall({ headSha: 'sha1', priorHeadSha: 'sha1', priorFirstSeenAt: 0, nowMs: 100, thresholdMs: 50, quiescent: false });
    expect(r.matched).toBe(true);
  });
});
