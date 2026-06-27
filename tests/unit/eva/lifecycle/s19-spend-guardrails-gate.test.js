/**
 * Fail-closed regression test for the S19 'spend guardrails ready' exit gate.
 *
 * SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-D / FR-2
 *
 * Migration 20260627_s19_spend_guardrails_exit_gate.sql prepends the gate
 * string 'spend guardrails ready' to venture_stages.metadata.gates.exit for
 * stage 19, so lib/eva/lifecycle/exit-gate-enforcer.js dispatches the
 * already-registered verifySpendGuardrailsReady verifier. This proves the
 * 8-point spend-guardrail policy is a HARD precondition before a
 * Cloudflare-default venture goes live (the conditional-go's runaway-invoice
 * mitigation), enforced explicitly at the stage gate — not just implicitly
 * inside publish.js.
 *
 * Covers the three guardrail states:
 *   - no venture_guardrail_state rows           → BLOCKED (all 8 missing)
 *   - all 8 decision='allow', no kill-switch    → ALLOWED
 *   - d1-write-ceiling kill-switch open         → BLOCKED (names d1-write-ceiling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GUARDRAIL_NAMES } from '../../../../lib/venture-deploy/spend-guardrails.js';

const VENTURE_ID = '11111111-2222-3333-4444-555555555555';
const S19 = 19;

/**
 * Build a supabase mock whose S19 exit gates are ONLY 'spend guardrails ready'
 * (isolating the gate under test) and whose venture_guardrail_state returns the
 * supplied rows. The verifier reads via `.from('venture_guardrail_state')
 * .select(...).eq('venture_id', id)` which resolves to { data, error }.
 */
function buildSupabaseMock({ guardrailRows = [] } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'venture_stages') {
        const chain = {
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { metadata: { gates: { exit: ['spend guardrails ready'] } } },
            error: null,
          }),
        };
        return { select: vi.fn(() => chain) };
      }
      if (table === 'venture_guardrail_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: guardrailRows, error: null }),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  };
}

/** All 8 guardrails recorded decision='allow', kill-switch closed. */
function allAllowRows() {
  return GUARDRAIL_NAMES.map((guardrail) => ({ guardrail, decision: 'allow', killswitch_open: false }));
}

async function importEnforcer() {
  vi.resetModules();
  process.env.LEO_S19_EXIT_GATE_ENFORCER = 'on';
  return import('../../../../lib/eva/lifecycle/exit-gate-enforcer.js');
}

describe('S19 spend-guardrails exit gate (FR-2, fail-closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches the spend-guardrails verifier at S19', async () => {
    const { checkExitGates } = await importEnforcer();
    const result = await checkExitGates({
      supabase: buildSupabaseMock({ guardrailRows: allAllowRows() }),
      ventureId: VENTURE_ID,
      fromStage: S19,
    });
    expect(result.gates_checked).toContain('spend guardrails ready');
  });

  it('BLOCKS go-live when no guardrail rows are recorded (all 8 missing → fail-closed)', async () => {
    const { checkExitGates } = await importEnforcer();
    const result = await checkExitGates({
      supabase: buildSupabaseMock({ guardrailRows: [] }),
      ventureId: VENTURE_ID,
      fromStage: S19,
    });
    expect(result.allowed).toBe(false);
    expect(result.blocked_by.join(' ')).toMatch(/spend guardrails ready/);
    // every canonical guardrail named as missing
    for (const name of GUARDRAIL_NAMES) {
      expect(result.blocked_by.join(' ')).toContain(name);
    }
  });

  it('ALLOWS go-live when all 8 guardrails are decision=allow with no kill-switch open', async () => {
    const { checkExitGates } = await importEnforcer();
    const result = await checkExitGates({
      supabase: buildSupabaseMock({ guardrailRows: allAllowRows() }),
      ventureId: VENTURE_ID,
      fromStage: S19,
    });
    expect(result.allowed).toBe(true);
    expect(result.blocked_by).toEqual([]);
  });

  it('RE-BLOCKS go-live when the d1-write-ceiling kill-switch is open (runaway-invoice protection)', async () => {
    const rows = allAllowRows().map((r) =>
      r.guardrail === 'd1-write-ceiling' ? { ...r, killswitch_open: true } : r,
    );
    const { checkExitGates } = await importEnforcer();
    const result = await checkExitGates({
      supabase: buildSupabaseMock({ guardrailRows: rows }),
      ventureId: VENTURE_ID,
      fromStage: S19,
    });
    expect(result.allowed).toBe(false);
    expect(result.blocked_by.join(' ')).toContain('d1-write-ceiling');
  });
});
