/**
 * QF-20260905-565: a WAIT verdict was charged against the gate retry-count exactly like a
 * genuine FAIL, so a handoff blocked on GATE_SUBAGENT_EVIDENCE's "phase started <30s ago"
 * grace period crossed the gate-2x auto-signal threshold and fired a HIGH-severity stuck
 * signal for a handoff that accepted at score 100 within 30 seconds (specimens 85b61dc1,
 * 41bc016b on SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A). Behaviour test (mirrors the ProbeExecutor
 * precedent in base-executor-failed-gate-wire.test.js) — drives execute() through the real
 * retry loop rather than grepping source shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
// Always retry-eligible (reason contains 'etry') so the loop actually cycles GATE_MAX_RETRIES
// times regardless of sd.parent_sd_id / autoProceed real logic.
vi.mock('../../../scripts/modules/handoff/skip-and-continue.js', () => ({
  shouldSkipAndContinue: () => ({ shouldSkip: false, reason: 'Retry 1/2 - not yet exhausted' }),
  executeSkipAndContinue: async () => ({}),
}));

const { BaseExecutor } = await import('../../../scripts/modules/handoff/executors/BaseExecutor.js');

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

const SD = { id: 'sd-uuid-2', sd_key: 'SD-POC-002-A', parent_sd_id: 'parent-uuid', sd_type: 'infrastructure', status: 'active', metadata: {} };

class ProbeExecutor extends BaseExecutor {
  get handoffType() { return 'PLAN-TO-LEAD'; }
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

function makeExecutor(validateGatesImpl) {
  return new ProbeExecutor({
    supabase: stubSupabase(),
    sdRepo: { getById: async () => SD },
    prdRepo: null,
    validationOrchestrator: {
      buildGatesFromRules: async () => [],
      validateGates: validateGatesImpl,
    },
  });
}

const WAIT_RESULT = {
  passed: false,
  waitVerdict: true,
  waitingGates: ['GATE_SUBAGENT_EVIDENCE'],
  waitReasons: ['phase started <30s ago'],
  failedGate: 'GATE_SUBAGENT_EVIDENCE',
  gateResults: {},
};

describe('QF-20260905-565: a WAIT verdict is not charged as a retry / does not trip the auto-signal', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); delete process.env.LEO_AUTO_SIGNAL; });

  it('a persisting WAIT verdict logs "Gate wait", never "Gate retry", and the loop still exhausts', async () => {
    let calls = 0;
    const executor = makeExecutor(async () => { calls++; return WAIT_RESULT; });
    const result = await executor.execute('SD-POC-002-A', { autoProceed: true });

    // GATE_MAX_RETRIES=2 -> attempts 0,1,2 -> validateGates called 3 times regardless.
    expect(calls).toBe(3);
    expect(result.wait).toBe(true);
    expect(result.waitVerdict).toBe(true);

    const logged = logSpy.mock.calls.map((c) => c.join(' '));
    expect(logged.some((l) => l.includes('Gate wait (not counted as a retry)'))).toBe(true);
    expect(logged.some((l) => l.includes('Gate retry'))).toBe(false);
  });

  it('a genuine FAIL (waitVerdict:false) still logs "Gate retry" at each crossing and fails', async () => {
    process.env.LEO_AUTO_SIGNAL = 'off'; // guarantee the auto-signal call is inert here regardless
    let calls = 0;
    const executor = makeExecutor(async () => {
      calls++;
      return {
        passed: false, waitVerdict: false, failedGate: 'OPERATOR_CONTRACT',
        issues: ['x'], warnings: [], totalScore: 0, totalMaxScore: 100, gateResults: {},
      };
    });
    const result = await executor.execute('SD-POC-002-A', { autoProceed: true });

    expect(calls).toBe(3);
    expect(result.success).toBe(false);
    expect(result.failedGate).toBe('OPERATOR_CONTRACT');

    const logged = logSpy.mock.calls.map((c) => c.join(' '));
    expect(logged.some((l) => l.includes('Gate retry 1/2'))).toBe(true);
    expect(logged.some((l) => l.includes('Gate retry 2/2'))).toBe(true);
  });
});
