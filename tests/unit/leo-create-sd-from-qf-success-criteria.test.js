/**
 * QF-20260902-866
 *
 * lib/sd-creation/source-adapters/qf.js's createFromQF() never passed an explicit
 * success_criteria argument to createSD(), so every escalated SD fell through to
 * pipeline.js's buildDefaultSuccessCriteria() -- a generic, type-agnostic 3-item template
 * ("Code passes lint and type checks", "PR reviewed and approved", ...), never the QF's own
 * measured premise. Witnessed live: 4 SDs minted 2026-09-02 12:32Z all carried the template,
 * and the coordinator had to hand-stamp a note that LEAD must re-key from the source QF
 * before LEAD-TO-PLAN.
 *
 * buildMeasuredSuccessCriteria() is the pure, extracted fix: derives criteria from the QF's
 * own expected_behavior / actual_behavior / steps_to_reproduce fields, falling back to the
 * QF's own title (never a generated template) when none of those are present.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Pure-function tests: no mocking required ──────────────────────────────────────────
const { buildMeasuredSuccessCriteria } = await import('../../lib/sd-creation/source-adapters/qf.js');

describe('buildMeasuredSuccessCriteria (QF-20260902-866)', () => {
  it('derives criteria from expected_behavior, actual_behavior, and steps_to_reproduce', () => {
    const criteria = buildMeasuredSuccessCriteria({
      title: 'x',
      expected_behavior: 'The write succeeds and is reported as ok.',
      actual_behavior: 'The write succeeds but is reported as a failure.',
      steps_to_reproduce: '1. Run the writer. 2. Read back the row.',
    });
    expect(criteria).toEqual([
      'Expected behavior achieved: The write succeeds and is reported as ok.',
      'Defective behavior no longer occurs: The write succeeds but is reported as a failure.',
      'Reproduction steps no longer trigger the defect: 1. Run the writer. 2. Read back the row.',
    ]);
  });

  it('never returns the generic pipeline.js template ("Code passes lint and type checks", etc.)', () => {
    const criteria = buildMeasuredSuccessCriteria({
      title: 'x',
      expected_behavior: 'A specific, measured expectation.',
    });
    expect(criteria.join(' ')).not.toMatch(/Code passes lint and type checks/);
    expect(criteria.join(' ')).not.toMatch(/PR reviewed and approved/);
    expect(criteria.join(' ')).not.toMatch(/All implementation items from scope are complete/);
  });

  it('falls back to the QF title (its own content, not a generated template) when no behavior fields exist', () => {
    const criteria = buildMeasuredSuccessCriteria({ title: 'Fix the readback comparator' });
    expect(criteria).toEqual(['Resolves: Fix the readback comparator']);
  });

  it('falls back to a generic phrase only when even the title is missing', () => {
    const criteria = buildMeasuredSuccessCriteria({});
    expect(criteria).toEqual(['Resolves: the escalated quick-fix']);
  });

  it('includes only the fields the QF actually measured (partial fixture)', () => {
    const criteria = buildMeasuredSuccessCriteria({ title: 'x', actual_behavior: 'Only actual is known.' });
    expect(criteria).toEqual(['Defective behavior no longer occurs: Only actual is known.']);
  });
});

// ── End-to-end: createFromQF -> createSDOrThrow carries success_criteria verbatim ────────
const h = vi.hoisted(() => ({ cfg: null, createSDArgs: null }));

vi.mock('../../lib/sd-creation/context.js', () => ({
  supabase: {
    from(table) {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        update: () => b,
        maybeSingle: async () => {
          if (table === 'quick_fixes') return { data: h.cfg?.qfRow ?? null, error: null };
          return { data: null, error: null };
        },
        then: (resolve) => resolve({ error: null })
      };
      return b;
    },
    rpc: async () => ({ data: { success: true }, error: null })
  }
}));

vi.mock('../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: async () => 'LEO',
  createSDOrThrow: async (args) => { h.createSDArgs = args; return { id: 'SD-UUID-1' }; }
}));

vi.mock('../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: async () => 'SD-LEO-FIX-TEST-001'
}));

vi.mock('../../lib/eva/stage-zero/data-pollers/retry.js', () => ({
  withRetry: async (fn) => fn()
}));

const { createFromQF } = await import('../../lib/sd-creation/source-adapters/qf.js');

function baseQfRow(overrides = {}) {
  return {
    id: 'QF-TEST-1',
    title: 'Test QF',
    description: 'desc',
    type: 'bug',
    severity: 'medium',
    estimated_loc: 40,
    target_application: 'EHG_Engineer',
    status: 'open',
    escalated_to_sd_id: null,
    claiming_session_id: null,
    ...overrides
  };
}

beforeEach(() => {
  h.cfg = null;
  h.createSDArgs = null;
});

describe('createFromQF carries the QF measured criteria verbatim into createSD (QF-20260902-866)', () => {
  it('a QF with a measured premise yields success_criteria from that premise, not the generic template', async () => {
    h.cfg = {
      qfRow: baseQfRow({
        expected_behavior: 'The recorder reports ok because the row persisted with the same instant.',
        actual_behavior: 'The recorder reports readback_mismatch on every write although the row is present.',
      })
    };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs).not.toBeNull();
    expect(h.createSDArgs.success_criteria).toEqual([
      'Expected behavior achieved: The recorder reports ok because the row persisted with the same instant.',
      'Defective behavior no longer occurs: The recorder reports readback_mismatch on every write although the row is present.',
    ]);
    expect(h.createSDArgs.success_criteria.join(' ')).not.toMatch(/Code passes lint and type checks/);
  });

  it('a QF with no behavior fields still carries its own title, never a fabricated template', async () => {
    h.cfg = { qfRow: baseQfRow({ title: 'Fix the flaky retry loop', expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.success_criteria).toEqual(['Resolves: Fix the flaky retry loop']);
  });
});
