/**
 * QF-20260903-315 — the orchestrator's own `phase` argument must reach executeSubAgent() at
 * BOTH call sites (the parallel independent-agents branch and the sequential dependent-agents
 * branch), merged into options, not merely stamped onto the result object afterward.
 *
 * Root cause: execution.js's executeSubAgent() defaulted options.phase to the literal sentinel
 * 'orchestrated' when the caller didn't supply one -- and until this fix, NEITHER call site did.
 * resolveStoryGateContext() (lib/sub-agents/testing/index.js) cannot resolve 'orchestrated' to
 * PRE_/POST_IMPLEMENTATION, so it fail-closed (blocking:true) on every orchestrated TESTING run,
 * silently defeating QF-20260903-748(b)'s escape hatch.
 *
 * This test asserts the actual argument executeSubAgent() receives, not just that PLAN_PRD is
 * passed to orchestrate() at the top -- that assertion alone would have passed on the broken code
 * (the bug is entirely in what happens to `phase` between the top of the function and this call).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/utils/sd-type-validation.js', () => ({
  getValidationRequirements: () => ({ skipCodeValidation: false }),
}));
vi.mock('../../../lib/learning/pattern-to-subagent-mapper.js', () => ({
  getPatternBasedSubAgents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../handoff/required-subagents.js', () => ({
  getRequiredSubAgents: () => [],
}));
vi.mock('./phase-config.js', () => ({
  MANDATORY_SUBAGENTS_BY_PHASE: {},
  REFACTOR_INTENSITY_MANDATORY: {},
  VALID_PHASES: ['PLAN_PRD'],
}));

const INDEPENDENT_AGENT = { code: 'DESIGN', sub_agent_code: 'DESIGN', name: 'Design', priority: 80 };
const DEPENDENT_AGENT = { code: 'TESTING', sub_agent_code: 'TESTING', name: 'Testing', priority: 90, depends_on: ['DESIGN'] };

vi.mock('./sd-queries.js', () => ({
  getSDDetails: vi.fn().mockResolvedValue({ id: 'sd-1', title: 'Test SD', scope: 'test scope', priority: 'high', sd_type: 'feature' }),
  getPhaseSubAgents: vi.fn(),
  getPhaseSubAgentsForSd: vi.fn().mockResolvedValue([INDEPENDENT_AGENT, DEPENDENT_AGENT]),
}));
vi.mock('./subagent-selection.js', () => ({
  isSubAgentRequired: vi.fn().mockResolvedValue({ required: true, reason: 'test' }),
}));

const executeSubAgentMock = vi.fn().mockResolvedValue({ sub_agent_code: 'X', verdict: 'PASS', confidence: 90 });
vi.mock('./execution.js', () => ({
  executeSubAgent: executeSubAgentMock,
  storeSubAgentResult: vi.fn().mockResolvedValue(undefined),
  updatePRDMetadataFromSubAgents: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./result-aggregation.js', () => ({
  aggregateResults: vi.fn(() => ({ verdict: 'PASS', can_proceed: true, results: [] })),
}));

const { orchestrate } = await import('./index.js');

describe('QF-20260903-315: phase reaches executeSubAgent() at both orchestrator call sites', () => {
  it('the independent-agent (parallel) branch merges phase into the options object passed to executeSubAgent', async () => {
    executeSubAgentMock.mockClear();
    await orchestrate({}, 'PLAN_PRD', 'sd-1', { someOtherOption: true });

    const independentCall = executeSubAgentMock.mock.calls.find(
      ([subAgent]) => (subAgent.sub_agent_code || subAgent.code) === 'DESIGN'
    );
    expect(independentCall).toBeDefined();
    const [, sdId, options] = independentCall;
    expect(sdId).toBe('sd-1');
    // The load-bearing assertion: phase is IN OPTIONS, not merely stamped onto the result later.
    expect(options.phase).toBe('PLAN_PRD');
    expect(options.someOtherOption).toBe(true); // original options are preserved, not replaced
  });

  it('the dependent-agent (sequential) branch merges phase into the options object passed to executeSubAgent', async () => {
    executeSubAgentMock.mockClear();
    await orchestrate({}, 'PLAN_PRD', 'sd-1', {});

    const dependentCall = executeSubAgentMock.mock.calls.find(
      ([subAgent]) => (subAgent.sub_agent_code || subAgent.code) === 'TESTING'
    );
    expect(dependentCall).toBeDefined();
    const [, , options] = dependentCall;
    expect(options.phase).toBe('PLAN_PRD');
  });

  it('a different phase value is passed through correctly (not hardcoded)', async () => {
    executeSubAgentMock.mockClear();
    await orchestrate({}, 'EXEC_IMPLEMENTATION', 'sd-1', {});

    for (const call of executeSubAgentMock.mock.calls) {
      const [, , options] = call;
      expect(options.phase).toBe('EXEC_IMPLEMENTATION');
      expect(options.phase).not.toBe('orchestrated');
    }
  });
});
