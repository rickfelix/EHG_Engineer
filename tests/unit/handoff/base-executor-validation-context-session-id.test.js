/**
 * QF-20260816-923: BaseExecutor's validationContext never carried a sessionId, so
 * fr-delivery-classifier.js's descopeFor() self-approval guard
 * (`requesterSessionId && approver === requesterSessionId`) was dead code on every
 * production handoff — a worker's own session could descope an FR "approved" by
 * that same session with no guard ever firing.
 *
 * Reuses the drivable-execute() harness from base-executor-failed-gate-wire.test.js
 * (TESTING sub-agent's proof that BaseExecutor.execute() does not require standing
 * up the whole gate pipeline to unit test).
 */
import { describe, it, expect, vi } from 'vitest';

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
vi.mock('../../../scripts/modules/handoff/skip-and-continue.js', () => ({
  shouldSkipAndContinue: () => ({ shouldSkip: false, reason: 'not eligible' }),
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

const SD = { id: 'sd-uuid-1', sd_key: 'SD-POC-001', sd_type: 'infrastructure', status: 'active', metadata: {} };

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

function makeExecutor(buildGatesFromRulesSpy) {
  return new ProbeExecutor({
    supabase: stubSupabase(),
    sdRepo: { getById: async () => SD },
    prdRepo: null,
    validationOrchestrator: {
      buildGatesFromRules: buildGatesFromRulesSpy,
      validateGates: async () => ({ passed: true, gateResults: {}, totalScore: 100, totalMaxScore: 100, issues: [], warnings: [] }),
    },
  });
}

describe('QF-20260816-923: BaseExecutor validationContext.sessionId', () => {
  it('threads options.autoProceedSessionId into validationContext.sessionId', async () => {
    let capturedContext = null;
    const spy = vi.fn(async (_gates, _handoffType, ctx) => { capturedContext = ctx; return []; });
    await makeExecutor(spy).execute('SD-POC-001', { autoProceedSessionId: 'session-abc-123' });

    expect(capturedContext).not.toBeNull();
    expect(capturedContext.sessionId).toBe('session-abc-123');
  });

  it('falls back to process.env.CLAUDE_SESSION_ID when autoProceedSessionId is absent', async () => {
    const prev = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-session-xyz';
    try {
      let capturedContext = null;
      const spy = vi.fn(async (_gates, _handoffType, ctx) => { capturedContext = ctx; return []; });
      await makeExecutor(spy).execute('SD-POC-001', {});

      expect(capturedContext.sessionId).toBe('env-session-xyz');
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = prev;
    }
  });

  it('is null (not undefined) when neither source is available -- identity-unknown, not identity-omitted', async () => {
    const prev = process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;
    try {
      let capturedContext = null;
      const spy = vi.fn(async (_gates, _handoffType, ctx) => { capturedContext = ctx; return []; });
      await makeExecutor(spy).execute('SD-POC-001', {});

      expect(capturedContext.sessionId).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = prev;
    }
  });
});
