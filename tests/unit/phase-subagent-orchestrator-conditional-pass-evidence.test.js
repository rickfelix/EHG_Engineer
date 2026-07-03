/**
 * QF-20260703-369: the orchestrated writer (scripts/modules/phase-subagent-orchestrator/
 * execution.js::storeSubAgentResult) is a SECOND, independent insert path for
 * sub_agent_execution_results, parallel to lib/sub-agent-executor/results-storage.js.
 * QF-20260603-485 fixed the CONDITIONAL_PASS-without-evidence case (check_conditions_required /
 * check_justification_required DB constraints) only in the latter. Any producer that downgrades
 * to CONDITIONAL_PASS without self-populating conditions/justification (e.g. DESIGN via
 * applyRepoResolutionVerdict) still crashed the orchestrated path with Postgres 23514.
 *
 * These tests pin that the orchestrated writer now derives the same evidence before insert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('storeSubAgentResult (orchestrated writer): CONDITIONAL_PASS evidence synthesis (QF-20260703-369)', () => {
  const capture = {};

  beforeEach(() => {
    capture.insertData = null;

    vi.doMock('../../scripts/modules/safe-insert.js', () => ({
      safeInsert: async (_supabase, _table, data) => {
        capture.insertData = data;
        return { success: true, data: { id: data.id, ...data }, warnings: [], error: null };
      },
      generateUUID: () => 'mock-uuid-0000'
    }));

    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_supabase, sdId) => sdId
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../scripts/modules/safe-insert.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
  });

  function makeFakeSupabase() {
    return {
      from() {
        return {
          select() { return this; },
          contains() { return this; },
          eq() { return this; },
          single: async () => ({ data: { id: 'mock-uuid-0000' }, error: null })
        };
      }
    };
  }

  it('synthesizes non-empty conditions + justification>=50 for a bare CONDITIONAL_PASS (DESIGN-shaped, no self-populated evidence)', async () => {
    const { storeSubAgentResult } = await import('../../scripts/modules/phase-subagent-orchestrator/execution.js');

    await storeSubAgentResult(makeFakeSupabase(), 'SD-TEST-001', {
      sub_agent_code: 'DESIGN',
      sub_agent_name: 'Senior Design Sub-Agent',
      verdict: 'CONDITIONAL_PASS',
      confidence: 60,
      critical_issues: [{ severity: 'LOW', issue: '1 accessibility violations', recommendation: 'Fix WCAG 2.1 AA violations before deployment' }],
      warnings: [],
      recommendations: []
      // justification / conditions deliberately omitted, matching design/index.js's actual shape
    }, { skipIdempotency: true });

    expect(capture.insertData).not.toBeNull();
    expect(Array.isArray(capture.insertData.conditions)).toBe(true);
    expect(capture.insertData.conditions.length).toBeGreaterThan(0);
    expect(typeof capture.insertData.justification).toBe('string');
    expect(capture.insertData.justification.length).toBeGreaterThanOrEqual(50);
  });

  it('leaves an already-self-populated CONDITIONAL_PASS (e.g. VALIDATION) untouched', async () => {
    const { storeSubAgentResult } = await import('../../scripts/modules/phase-subagent-orchestrator/execution.js');

    const ownConditions = [{ action: 'Resolve X before merge', priority: 'high', blocking: true }];
    const ownJustification = 'A'.repeat(60);

    await storeSubAgentResult(makeFakeSupabase(), 'SD-TEST-001', {
      sub_agent_code: 'VALIDATION',
      sub_agent_name: 'Principal Systems Analyst',
      verdict: 'CONDITIONAL_PASS',
      confidence: 100,
      conditions: ownConditions,
      justification: ownJustification
    }, { skipIdempotency: true });

    expect(capture.insertData.conditions).toEqual(ownConditions);
    expect(capture.insertData.justification).toBe(ownJustification);
  });

  it('leaves conditions/justification null for a non-CONDITIONAL_PASS verdict (no constraint applies)', async () => {
    const { storeSubAgentResult } = await import('../../scripts/modules/phase-subagent-orchestrator/execution.js');

    await storeSubAgentResult(makeFakeSupabase(), 'SD-TEST-001', {
      sub_agent_code: 'SECURITY',
      sub_agent_name: 'Chief Security Architect',
      verdict: 'PASS',
      confidence: 100
    }, { skipIdempotency: true });

    expect(capture.insertData.conditions).toBeNull();
    expect(capture.insertData.justification).toBeNull();
  });
});
