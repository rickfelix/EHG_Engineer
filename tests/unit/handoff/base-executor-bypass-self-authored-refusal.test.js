/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B2/FR-B3): a bypass whose actor authored the
 * failing evidence is REFUSED, not overridden. Reuses the DI-seam pattern proven in
 * base-executor-failed-gate-wire.test.js to drive BaseExecutor.execute() with
 * {bypassValidation:true} end-to-end -- no test in the repo did this before this SD.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const auditLogCalls = [];
vi.mock('../../../scripts/lib/emit-validation-audit-log.mjs', () => ({
  emitValidationAuditLog: async (params) => { auditLogCalls.push(params); return { id: 'audit-1', written_at: new Date().toISOString() }; },
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

const SD = { id: 'sd-uuid-1', sd_key: 'SD-POC-002', sd_type: 'infrastructure', status: 'active', metadata: {} };
const ACTOR_SESSION_ID = 'actor-session-aaa';

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
  async executeSpecific() { return { success: true }; }
  async _handlePlanModeTransition() {}
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

function gateResultsWithFailingEvidence(sessionId) {
  return {
    passed: false,
    failedGate: 'GATE_SUBAGENT_EVIDENCE',
    issues: ['SUBAGENT_EVIDENCE_BAD_VERDICT: TESTING=BLOCKED'],
    warnings: [],
    totalScore: 0,
    totalMaxScore: 100,
    gateResults: {
      GATE_SUBAGENT_EVIDENCE: {
        passed: false, score: 0, max_score: 100,
        details: {
          failing: [{ agent: 'TESTING', verdict: 'BLOCKED', created_at: new Date().toISOString(), session_id: sessionId }],
          non_evidence: [],
        },
      },
    },
  };
}

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B FR-B2: self-authored bypass refusal', () => {
  const originalSessionId = process.env.CLAUDE_SESSION_ID;

  beforeEach(() => {
    auditLogCalls.length = 0;
    process.env.CLAUDE_SESSION_ID = ACTOR_SESSION_ID;
  });

  afterEach(() => {
    if (originalSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = originalSessionId;
  });

  it('refuses a bypass whose actor authored the failing evidence (session_id matches)', async () => {
    const gateResults = gateResultsWithFailingEvidence(ACTOR_SESSION_ID);
    const result = await makeExecutor(gateResults).execute('SD-POC-002', {
      bypassValidation: true,
      bypassReason: 'attempting to override my own failing evidence',
      bypassLedgerId: 'ledger-row-1',
    });

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('GATE_BYPASS_SELF_AUTHORED_REFUSED_FAILED');
    // The bypass must NOT have been applied -- no false success, no validation_passed override.
    expect(result.bypassed).not.toBe(undefined); // marker used only for the join-back, not a "success" flag
    expect(result.bypassLedgerId).toBe('ledger-row-1');
  });

  it('emits a validation_audit_log row with failure_category=bypass_refused_self_authored', async () => {
    const gateResults = gateResultsWithFailingEvidence(ACTOR_SESSION_ID);
    await makeExecutor(gateResults).execute('SD-POC-002', {
      bypassValidation: true,
      bypassReason: 'attempting to override my own failing evidence',
      bypassLedgerId: 'ledger-row-2',
    });

    expect(auditLogCalls.length).toBe(1);
    expect(auditLogCalls[0].failure_category).toBe('bypass_refused_self_authored');
    expect(auditLogCalls[0].metadata.bypass_ledger_id).toBe('ledger-row-2');
  });

  it('proceeds exactly as before when the failing evidence session_id differs from the actor', async () => {
    const gateResults = gateResultsWithFailingEvidence('some-other-session-bbb');
    const result = await makeExecutor(gateResults).execute('SD-POC-002', {
      bypassValidation: true,
      bypassReason: 'legitimate override of someone else\'s failing evidence',
      bypassLedgerId: 'ledger-row-3',
    });

    expect(result.success).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(result.bypassLedgerId).toBe('ledger-row-3');
    expect(auditLogCalls.length).toBe(0);
  });

  it('proceeds exactly as before when the failing evidence has no session_id (pre-cutover / not comparable)', async () => {
    const gateResults = gateResultsWithFailingEvidence(null);
    const result = await makeExecutor(gateResults).execute('SD-POC-002', {
      bypassValidation: true,
      bypassReason: 'legitimate override, no comparable author identity',
      bypassLedgerId: 'ledger-row-4',
    });

    expect(result.success).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(auditLogCalls.length).toBe(0);
  });
});
