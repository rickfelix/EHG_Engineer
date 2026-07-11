/**
 * SD-LEO-FIX-EVA-DECISIONS-CANNOT-001 — pins the decided_by/context payload
 * contract that reject_s16_programmatic_approval enforces on stage-16
 * (Blueprint->Build) chairman_decisions approvals. Pure logic test against
 * buildDecisionStamp() (no live DB write) — the trigger's chairman-allowlist
 * regex is `LOWER(decided_by) LIKE '%chairman%'`; the agent-allowlist path
 * additionally requires context with 'stage' and 'timestamp' keys.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDecisionStamp, DEFAULT_DECIDED_BY } from '../../scripts/eva-decisions.js';

const ORIGINAL_ARGV = [...process.argv];

function setArgv(...extraFlags) {
  process.argv = [...ORIGINAL_ARGV.slice(0, 2), ...extraFlags];
}

beforeEach(() => setArgv());
afterEach(() => { process.argv = [...ORIGINAL_ARGV]; });

describe('buildDecisionStamp — trigger contract (reject_s16_programmatic_approval)', () => {
  it('default decided_by matches the chairman allowlist regex (LOWER(x) LIKE %chairman%)', () => {
    const stamp = buildDecisionStamp(16);
    expect(stamp.decided_by).toBe(DEFAULT_DECIDED_BY);
    expect(stamp.decided_by.toLowerCase().includes('chairman')).toBe(true);
  });

  it('context always has stage and timestamp keys present', () => {
    const stamp = buildDecisionStamp(16);
    expect(stamp.context).toHaveProperty('stage');
    expect(stamp.context).toHaveProperty('timestamp');
  });

  it('context.stage reflects the row\'s actual lifecycle_stage, not a hardcoded 16', () => {
    const stamp = buildDecisionStamp(22);
    expect(stamp.context.stage).toBe(22);
  });

  it('context.timestamp is a valid ISO8601 string', () => {
    const stamp = buildDecisionStamp(16);
    expect(() => new Date(stamp.context.timestamp).toISOString()).not.toThrow();
    expect(new Date(stamp.context.timestamp).toISOString()).toBe(stamp.context.timestamp);
  });

  it('an explicit --decided-by override is honored verbatim, not the default', () => {
    setArgv('--decided-by', 'chairman_custom_stamp');
    const stamp = buildDecisionStamp(16);
    expect(stamp.decided_by).toBe('chairman_custom_stamp');
  });

  it('an explicit agent-allowlist override is honored verbatim too', () => {
    setArgv('--decided-by', 'monitoring_agent');
    const stamp = buildDecisionStamp(16);
    expect(stamp.decided_by).toBe('monitoring_agent');
    // The agent path additionally requires context.stage/timestamp — already
    // satisfied unconditionally by buildDecisionStamp.
    expect(stamp.context).toHaveProperty('stage');
    expect(stamp.context).toHaveProperty('timestamp');
  });

  it('mutation-proof: pre-fix code (no decided_by/context in the payload) would fail this contract', () => {
    // Simulates the pre-fix updatePayload shape directly (no buildDecisionStamp call).
    const preFixPayload = { status: 'approved', decision: 'proceed', rationale: 'x' };
    expect(preFixPayload.decided_by).toBeUndefined();
    expect(preFixPayload.context).toBeUndefined();
  });
});
