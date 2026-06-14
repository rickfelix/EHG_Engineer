/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C — engineered spend-guardrails.
 *
 * Pure, no-DB unit + activation suite covering all 6 FRs:
 *  - FR-1: each of the 8 guardrails passes when satisfied and BLOCKS on violation
 *          (incl. fail-closed on missing input) + the operator-observable report.
 *  - FR-2: the registered 'spend guardrails ready' exit-gate verifier is fail-closed
 *          (block / missing-rows / query-error) and passes only when all 8 allow.
 *  - FR-3: the D1 kill-switch trips the reused CircuitBreaker, and a content
 *          snapshot proves circuit-breaker.js is reused READ-ONLY (zero diff).
 *  - FR-5: per-venture isolation (scope by venture_id).
 *  - Activation invariant (GATE_ACTIVATION_INVARIANT): registration + fail-closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import {
  GUARDRAILS,
  GUARDRAIL_NAMES,
  evaluateGuardrails,
  formatGuardrailReport,
} from '../../lib/venture-deploy/spend-guardrails.js';
import { createVentureKillSwitch } from '../../lib/venture-deploy/d1-kill-switch.js';
import { GATE_VERIFIERS, resolveVerifier } from '../../lib/eva/lifecycle/exit-gate-verifiers.js';

const VENTURE = 'venture-aaa-111';

/** A fully-satisfying context for every guardrail, scoped to VENTURE. */
function passingCtx(overrides = {}) {
  return {
    ventureId: VENTURE,
    usage: { agentTokens: 100, d1Writes: 50 },
    limits: { agentTokenCeiling: 1000, d1WriteCeiling: 500, cloudRunMaxInstancesCeiling: 10 },
    config: { cloudRunMaxInstances: 3 },
    state: {
      humanGateApproved: true,
      ciDeterministic: true,
      migrationDeterministic: true,
      operatorExportEnabled: true,
      neonPlan: 'paid',
      isolationScope: VENTURE,
    },
    ...overrides,
  };
}

// A per-guardrail mutation that flips exactly that guardrail to a violation.
const VIOLATIONS = {
  'agent-token-ceiling': (c) => { c.usage.agentTokens = 999999; },
  'human-gate': (c) => { c.state.humanGateApproved = false; },
  'deterministic-ci-migration': (c) => { c.state.ciDeterministic = false; },
  'd1-write-ceiling': (c) => { c.usage.d1Writes = 999999; },
  'operator-export': (c) => { c.state.operatorExportEnabled = false; },
  'neon-paid-plan': (c) => { c.state.neonPlan = 'free'; },
  'cloud-run-max-instances': (c) => { c.config.cloudRunMaxInstances = 99; },
  'per-venture-isolation': (c) => { c.state.isolationScope = 'some-other-venture'; },
};

describe('FR-1: 8 spend-guardrails policy', () => {
  it('defines exactly the 8 canonical guardrails', () => {
    expect(GUARDRAIL_NAMES).toEqual([
      'agent-token-ceiling', 'human-gate', 'deterministic-ci-migration', 'd1-write-ceiling',
      'operator-export', 'neon-paid-plan', 'cloud-run-max-instances', 'per-venture-isolation',
    ]);
    expect(GUARDRAILS).toHaveLength(8);
  });

  it('all 8 guardrails ALLOW when satisfied', () => {
    const result = evaluateGuardrails(passingCtx());
    expect(result.satisfied).toBe(true);
    expect(result.blocked).toHaveLength(0);
    expect(result.decisions.every((d) => d.decision === 'allow')).toBe(true);
  });

  // 8 violation cases — each flips exactly one guardrail and asserts it (and only it) blocks.
  for (const name of GUARDRAIL_NAMES) {
    it(`BLOCKS when '${name}' is violated`, () => {
      const ctx = passingCtx();
      VIOLATIONS[name](ctx);
      const result = evaluateGuardrails(ctx);
      expect(result.satisfied).toBe(false);
      const blockedNames = result.blocked.map((b) => b.guardrail);
      expect(blockedNames).toContain(name);
      expect(blockedNames).toHaveLength(1); // isolation: one violation blocks only itself
    });
  }

  it('FAIL-CLOSED: a missing input blocks (never silent pass)', () => {
    const ctx = passingCtx();
    delete ctx.usage.agentTokens; // measurement absent
    delete ctx.state.humanGateApproved; // approval unknown
    const result = evaluateGuardrails(ctx);
    const blocked = result.blocked.map((b) => b.guardrail);
    expect(blocked).toContain('agent-token-ceiling');
    expect(blocked).toContain('human-gate');
  });

  it('formatGuardrailReport surfaces an operator-observable BLOCKED line (AC-1)', () => {
    const ctx = passingCtx();
    VIOLATIONS['agent-token-ceiling'](ctx);
    const report = formatGuardrailReport(evaluateGuardrails(ctx));
    expect(report).toContain('DEPLOY BLOCKED');
    expect(report).toContain('BLOCKED: agent-token-ceiling');
    expect(formatGuardrailReport(evaluateGuardrails(passingCtx()))).toContain('ALL 8 SPEND GUARDRAILS SATISFIED');
  });
});

describe('FR-3: D1 kill-switch reuses CircuitBreaker (read-only)', () => {
  it('trips the breaker on a D1 write-ceiling breach and halts deploys', () => {
    const ks = createVentureKillSwitch(VENTURE);
    expect(ks.isHalted()).toBe(false);
    expect(ks.trip('d1-write-ceiling exceeded')).toBe(true);
    expect(ks.isHalted()).toBe(true);
  });

  it('reset() clears the halt (operator recovery)', () => {
    const ks = createVentureKillSwitch(VENTURE);
    ks.trip();
    ks.reset();
    expect(ks.isHalted()).toBe(false);
  });

  it('FAIL-LOUD: trip() throws (never returns false) if the breaker cannot open', () => {
    // A pathological config whose failure-rate path can never open (threshold >= 1).
    // threshold>=1 disables the failure-rate path; default dailyCostCap (500) is
    // far beyond the bounded guard, so the breaker genuinely cannot open here.
    const ks = createVentureKillSwitch(VENTURE, { failureThreshold: 1, windowSize: 5 });
    expect(() => ks.trip()).toThrow(/failed to trip/);
    expect(ks.isHalted()).toBe(false); // confirmed it did not silently fail open
  });

  it('ZERO-DIFF GUARD: circuit-breaker.js content is unchanged (proves read-only reuse)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const cbPath = resolve(here, '../../lib/eva/pipeline-runner/circuit-breaker.js');
    const normalized = readFileSync(cbPath, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(normalized).digest('hex');
    // Pinned hash of the reused CircuitBreaker. If this fails, circuit-breaker.js
    // was MODIFIED — FR-3 requires read-only reuse (import the class, do not edit).
    expect(hash).toBe('d6bdea0f0d3dfb9882d19e03a05641a18540899cb57bdd19bf5e8fa100e9e23c');
  });
});

// Build a minimal fake supabase whose .from(table).select().eq() resolves to {data, error}.
function fakeSupabase({ data = null, error = null } = {}) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return Promise.resolve({ data, error }); },
      };
      return chain;
    },
  };
}

const ALL_ALLOW_ROWS = GUARDRAIL_NAMES.map((g) => ({ guardrail: g, decision: 'allow', killswitch_open: false }));

describe('FR-2: spend-guardrails exit-gate verifier (FAIL-CLOSED)', () => {
  it('is registered under a gate string distinct from siblings B/D', () => {
    const verifier = resolveVerifier('spend guardrails ready');
    expect(typeof verifier).toBe('function');
    // distinctness: the existing sibling/lifecycle gate strings resolve elsewhere
    expect(resolveVerifier('application deployed')).not.toBe(verifier);
    expect(GATE_VERIFIERS.some((v) => v.match === 'spend guardrails ready')).toBe(true);
  });

  it('PASSES only when all 8 guardrails are recorded as allow', async () => {
    const verifier = resolveVerifier('spend guardrails ready');
    const res = await verifier({ supabase: fakeSupabase({ data: ALL_ALLOW_ROWS }), ventureId: VENTURE });
    expect(res.satisfied).toBe(true);
  });

  it('BLOCKS (fail-closed) when a guardrail decision is block', async () => {
    const rows = ALL_ALLOW_ROWS.map((r) => (r.guardrail === 'neon-paid-plan' ? { ...r, decision: 'block' } : r));
    const verifier = resolveVerifier('spend guardrails ready');
    const res = await verifier({ supabase: fakeSupabase({ data: rows }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('neon-paid-plan');
  });

  it('BLOCKS (fail-closed) when the kill-switch is open', async () => {
    const rows = ALL_ALLOW_ROWS.map((r) => (r.guardrail === 'd1-write-ceiling' ? { ...r, killswitch_open: true } : r));
    const verifier = resolveVerifier('spend guardrails ready');
    const res = await verifier({ supabase: fakeSupabase({ data: rows }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('kill-switch-open');
  });

  it('BLOCKS (fail-closed) when rows are missing (table empty / not applied)', async () => {
    const verifier = resolveVerifier('spend guardrails ready');
    const res = await verifier({ supabase: fakeSupabase({ data: [] }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('not recorded');
  });

  it('BLOCKS (fail-closed) on a query error (e.g. missing table)', async () => {
    const verifier = resolveVerifier('spend guardrails ready');
    const res = await verifier({ supabase: fakeSupabase({ error: { message: 'relation does not exist' } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('fail-closed');
  });
});

describe('Activation invariant (GATE_ACTIVATION_INVARIANT)', () => {
  it('the spend-guardrail safety system is live: registered + fail-closed by default', async () => {
    // A fresh venture with no recorded guardrail state must NOT be allowed to advance.
    const verifier = resolveVerifier('spend guardrails ready');
    expect(verifier).toBeTypeOf('function');
    const res = await verifier({ supabase: fakeSupabase({ data: [] }), ventureId: 'brand-new-venture' });
    expect(res.satisfied).toBe(false);
  });
});
