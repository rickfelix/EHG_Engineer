/**
 * PROOF OF CONCEPT (TESTING sub-agent, EXEC-TO-PLAN review of
 * SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002).
 *
 * CLAIM UNDER TEST: "BaseExecutor.execute() is not drivable from a unit test without standing
 * up the whole gate pipeline."  This file exists to falsify that claim by driving execute()
 * all the way to the gate-failure branch and asserting on the RETURNED OBJECT — i.e. a real
 * behaviour test for M6, replacing the source-shape (grep) instrument.
 *
 * If this file is green, M6 is behaviourally detectable and the source-shape block can go.
 */
import { describe, it, expect, vi } from 'vitest';

// ---- the six dynamic imports execute() performs before it reaches the gate branch ----
vi.mock('../../../lib/sd/type-detection.js', () => ({ isOrchestratorSync: () => false }));
vi.mock('../../../lib/claim/ownership-detection.js', () => ({ getClaimHolder: async () => null }));
vi.mock('../../../lib/handoff/gate-skip-detection.js', () => ({ shouldSkipForType: () => ({ skip: false, reason: '' }) }));
vi.mock('../../../lib/claim-validity-gate.js', () => ({
  assertValidClaim: async () => ({ ownership: 'claim_holder' }),
  ClaimIdentityError: class ClaimIdentityError extends Error {},
}));
vi.mock('../../../scripts/modules/handoff/claim-gate-decision.js', () => ({
  evaluateClaimCheckForHandoff: () => ({ block: false, alreadyCompleted: false, detail: '' }),
}));
vi.mock('../../../lib/rca/index.js', () => ({
  triggerRCAOnFailure: async () => {}, buildGateContext: (x) => x,
}));
// ---- top-level imports that would otherwise touch DB / git ----
vi.mock('../../../scripts/modules/handoff/gate-policy-resolver.js', () => ({
  applyGatePolicies: async (_sb, gates) => ({ filteredGates: gates, fallbackUsed: false }),
}));
vi.mock('../../../scripts/modules/handoff/gates/dfe-escalation-gate.js', () => ({
  createDFEEscalationGate: () => ({ name: 'DFE_ESCALATION_GATE', validator: async () => ({ passed: true }) }),
}));
vi.mock('../../../scripts/modules/handoff/shared-git-context.js', () => ({ SharedGitContext: class {} }));
vi.mock('../../../scripts/modules/handoff/gate-verdict-cache.js', () => ({
  isCacheAllowed: () => false, loadPriorGateResults: async () => null,
  mergePassResults: (p) => p, logCacheTelemetry: async () => {},
}));
vi.mock('../../../scripts/modules/handoff/skip-and-continue.js', () => ({
  shouldSkipAndContinue: () => ({ shouldSkip: false, reason: 'not eligible' }),
  executeSkipAndContinue: async () => ({}),
}));

const { BaseExecutor } = await import('../../../scripts/modules/handoff/executors/BaseExecutor.js');

/** Permissive PostgREST-shaped stub; every terminal resolves {data:null,error:null}. */
function stubSupabase() {
  const term = Promise.resolve({ data: null, error: null });
  const chain = new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return term.then.bind(term);
      if (prop === 'catch') return term.catch.bind(term);
      if (prop === 'finally') return term.finally.bind(term);
      return () => chain;
    },
    apply: () => chain,
  });
  return { from: () => chain, rpc: () => term };
}

const SD = { id: 'sd-uuid-1', sd_key: 'SD-POC-001', sd_type: 'infrastructure', status: 'active', metadata: {} };

class ProbeExecutor extends BaseExecutor {
  get handoffType() { return 'PLAN-TO-LEAD'; }
  // Every one of these is an ordinary overridable method — no module patching needed.
  async _checkAndExecutePendingMigrations() { return null; }
  async _checkMultiSessionClaimConflict() { return { pass: true }; }
  async setup() { return { success: true }; }
  async _claimSDForSession() { return { success: true }; }
  async _autoTriggerDatabaseSubAgent() {}
  async _displayHandoffStartDirectives() {}
  async _displayOnFailureDirectives() {}
  async _loadPriorWaitState() { return null; }
  async getRequiredGates() { return []; }
  getRemediation() { return 'remediation text'; }
}

function makeExecutor(gateResults) {
  return new ProbeExecutor({
    supabase: stubSupabase(),
    sdRepo: { getById: async () => SD },
    prdRepo: null,
    validationOrchestrator: {
      buildGatesFromRules: async () => [],
      validateGates: async () => gateResults,
    },
  });
}

const FAILING_GATES = {
  passed: false,
  failedGate: 'OPERATOR_CONTRACT',
  issues: ['OPERATOR_CONTRACT_MISSING_TRIPLE'],
  warnings: [],
  totalScore: 0,
  totalMaxScore: 100,
  gateResults: {
    OPERATOR_CONTRACT: {
      passed: false, score: 0, max_score: 100,
      details: { reason: 'OPERATOR_CONTRACT_MISSING_TRIPLE', repo_path: 'C:/named/tree', creator_kinds: ['flag'] },
    },
  },
};

describe('POC: BaseExecutor.execute() IS drivable to the gate-failure branch', () => {
  it('M6 AS A BEHAVIOUR TEST — execute() returns a result carrying failedGate', async () => {
    const result = await makeExecutor(FAILING_GATES).execute('SD-POC-001', {});
    expect(result.success).toBe(false);
    // THE ASSERTION. Deleting `gateFailureResult.failedGate = gateResults.failedGate`
    // in BaseExecutor makes this undefined. No source-shape grep involved.
    expect(result.failedGate).toBe('OPERATOR_CONTRACT');
  });

  it('the per-gate results ride along too (the L5 sibling assignment)', async () => {
    const result = await makeExecutor(FAILING_GATES).execute('SD-POC-001', {});
    expect(result.gateResults.OPERATOR_CONTRACT.details.repo_path).toBe('C:/named/tree');
  });

  it('END-TO-END WIRE: execute() -> recordFailure -> validation_details.summary.failed_gate', async () => {
    // This is the wire M6 was supposed to pin: the PRODUCER's output fed to the real
    // consumer, with nothing hand-assembled in between.
    const { HandoffRecorder } = await import('../../../scripts/modules/handoff/recording/HandoffRecorder.js');
    const result = await makeExecutor(FAILING_GATES).execute('SD-POC-001', {});

    const inserts = [];
    const supabase = {
      from: (table) => ({
        insert: (row) => { inserts.push({ table, row }); return { select: () => Promise.resolve({ data: [row], error: null }) }; },
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { buildRejection: () => ({ executive_summary: 'r' }) },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    recorder._resolveToUUID = async () => '00000000-0000-0000-0000-000000000001';
    recorder._logGovernanceAudit = async () => {};

    await recorder.recordFailure('PLAN-TO-LEAD', 'SD-POC-001', result);
    const row = inserts.find((i) => i.table === 'sd_phase_handoffs')?.row;
    expect(row.validation_details.summary.failed_gate).toBe('OPERATOR_CONTRACT');
  });
});
