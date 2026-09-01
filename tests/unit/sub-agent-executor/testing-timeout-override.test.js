/**
 * QF-20260901-879 — TESTING sub-agent's internal timeout (was 120s, hardcoded global default)
 * is shorter than this repo's full E2E suite (~439s), so every real evidence attempt timed out
 * and EXEC-TO-PLAN blocked forever on SUBAGENT_EVIDENCE_MISSING.
 *
 * resolveSubAgentTimeoutMs() is the pure precedence chain executor.js's real call site uses;
 * tested directly (no real sub-agent module execution) to avoid touching lib/sub-agents/testing.js.
 */
import { describe, it, expect } from 'vitest';
import { resolveSubAgentTimeoutMs } from '../../../lib/sub-agent-executor/executor.js';

describe('resolveSubAgentTimeoutMs — QF-20260901-879 per-code override', () => {
  it('TESTING gets the 600000ms override, comfortably above the ~439s E2E suite', () => {
    expect(resolveSubAgentTimeoutMs('TESTING', undefined, {})).toBe(600000);
  });

  it('the TESTING override wins even when the global SUB_AGENT_TIMEOUT_MS env is set low', () => {
    expect(resolveSubAgentTimeoutMs('TESTING', undefined, { SUB_AGENT_TIMEOUT_MS: '50' })).toBe(600000);
  });

  it('a per-code env override (SUB_AGENT_TIMEOUT_MS_TESTING) wins over the hardcoded default', () => {
    expect(resolveSubAgentTimeoutMs('TESTING', undefined, { SUB_AGENT_TIMEOUT_MS_TESTING: '900000' })).toBe(900000);
  });

  it('an explicit options.timeout still wins over everything (unchanged contract)', () => {
    expect(resolveSubAgentTimeoutMs('TESTING', 30, {})).toBe(30);
  });

  it('other sub-agent codes are unaffected — fall through to the existing 120000ms global default', () => {
    expect(resolveSubAgentTimeoutMs('SECURITY', undefined, {})).toBe(120000);
  });

  it('other codes still honor a raised global SUB_AGENT_TIMEOUT_MS env (regression: fixture where the old timeout would have fired now passes)', () => {
    expect(resolveSubAgentTimeoutMs('SECURITY', undefined, { SUB_AGENT_TIMEOUT_MS: '439000' })).toBe(439000);
  });
});
