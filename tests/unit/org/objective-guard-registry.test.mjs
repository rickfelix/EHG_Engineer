/**
 * FR-4 objective + anti-Goodhart-guard registry — pure unit tests.
 * DB-free: guard loads injected via the loadGuardsFn seam; the fire-and-forget event emit
 * runs against a minimal insert-thenable stub. Matches the tests/unit/org house convention
 * (writer-authorization.test.mjs / chairman-surface.test.mjs): no live DB, no mocking library.
 *
 * TS-4: the objective+guard registry rejects/flags a synthetic Goodhart-style gaming attempt.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateObjective,
  registerObjective,
  registerGuard,
  MODES,
  GUARD_TYPES,
} from '../../../lib/org/objective-guard-registry.mjs';

// Minimal supabase stub: only the fire-and-forget system_events insert path is exercised by
// evaluateObjective when guard loading is injected via a seam.
const emitStub = () => {
  const calls = [];
  return {
    calls,
    supabase: {
      from() {
        return { insert(row) { calls.push(row); return Promise.resolve({ error: null }); } };
      },
    },
  };
};

const guard = (over = {}) => ({ guard_key: 'g1', guard_type: 'anti_goodhart', mode: MODES.BLOCKING, status: 'active', ...over });

describe('objective-guard-registry (FR-4)', () => {
  describe('evaluateObjective — TS-4 anti-Goodhart gaming attempt', () => {
    it('BLOCKS (violation, passed=false) when a blocking anti_goodhart guard trips on a gaming attempt', async () => {
      const { supabase, calls } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'growth', observation: { claimsTargetMet: true, gamingSignals: ['signups_from_bot_traffic'] } },
        { loadGuardsFn: async () => [guard({ mode: MODES.BLOCKING })] },
      );
      expect(res.passed).toBe(false);
      expect(res.violations).toHaveLength(1);
      expect(res.violations[0].guardKey).toBe('g1');
      expect(res.violations[0].reason).toContain('gaming signal');
      expect(res.warnings).toHaveLength(0);
      // fire-and-forget emit fired with the VIOLATED event type
      expect(calls).toHaveLength(1);
      expect(calls[0].event_type).toBe('ORG_OBJECTIVE_GUARD_VIOLATED');
    });

    it('FLAGS but does not block (warning, passed=true) when the same gaming attempt hits an advisory guard', async () => {
      const { supabase } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'growth', observation: { claimsTargetMet: true, gamingSignals: ['metric_inflation'] } },
        { loadGuardsFn: async () => [guard({ mode: MODES.ADVISORY })] },
      );
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0].guardKey).toBe('g1');
    });

    it('PASSES cleanly when the target is met with no gaming signals', async () => {
      const { supabase, calls } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'growth', observation: { claimsTargetMet: true, gamingSignals: [] } },
        { loadGuardsFn: async () => [guard({ mode: MODES.BLOCKING })] },
      );
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
      expect(calls[0].event_type).toBe('ORG_OBJECTIVE_GUARD_PASSED');
    });

    it('handles constraint and tripwire guard types by caller-reported keys', async () => {
      const { supabase } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'ops', observation: { constraintViolations: ['c1'], tripwires: ['t1'] } },
        { loadGuardsFn: async () => [
          guard({ guard_key: 'c1', guard_type: 'constraint', mode: MODES.BLOCKING }),
          guard({ guard_key: 't1', guard_type: 'tripwire', mode: MODES.ADVISORY }),
        ] },
      );
      expect(res.violations.map((v) => v.guardKey)).toEqual(['c1']);
      expect(res.warnings.map((w) => w.guardKey)).toEqual(['t1']);
    });

    it('downgrades a throwing detector to an advisory warning (fail-open), never a violation', async () => {
      const { supabase } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'x', observation: {} },
        {
          loadGuardsFn: async () => [guard({ mode: MODES.BLOCKING })],
          detectorResolver: () => () => { throw new Error('boom'); },
        },
      );
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(res.warnings[0].reason).toContain('detector error');
    });

    it('skips a guard whose guard_type has no resolvable detector (fail-open per guard)', async () => {
      const { supabase } = emitStub();
      const res = await evaluateObjective(
        supabase,
        { objectiveKey: 'x', observation: {} },
        { loadGuardsFn: async () => [guard({ guard_type: 'not_a_real_type' })] },
      );
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('requires an objectiveKey', async () => {
      const { supabase } = emitStub();
      await expect(evaluateObjective(supabase, { observation: {} })).rejects.toThrow(/objectiveKey/);
    });
  });

  describe('registerObjective / registerGuard validation', () => {
    const upsertStub = (captured) => ({
      from() {
        return { upsert(row) { captured.row = row; return { select: () => ({ maybeSingle: async () => ({ data: { id: 'r1', ...row }, error: null }) }) }; } };
      },
    });

    it('registerObjective persists via upsert with the correct conflict shape', async () => {
      const captured = {};
      const row = await registerObjective(upsertStub(captured), { objectiveKey: 'growth', statement: 'grow real revenue', metric: 'mrr', target: '10k', mode: MODES.BLOCKING, createdBy: 'chairman' });
      expect(captured.row.objective_key).toBe('growth');
      expect(captured.row.mode).toBe('blocking');
      expect(row.id).toBe('r1');
    });

    it('registerObjective rejects missing objectiveKey/statement', async () => {
      await expect(registerObjective({}, { statement: 'x' })).rejects.toThrow(/objectiveKey/);
      await expect(registerObjective({}, { objectiveKey: 'x' })).rejects.toThrow(/statement/);
    });

    it('registerGuard rejects an invalid guardType', async () => {
      await expect(registerGuard({}, { objectiveKey: 'o', guardKey: 'g', predicateDescription: 'p', guardType: 'bogus' })).rejects.toThrow(/invalid guardType/);
    });

    it('registerGuard accepts each valid guard type', async () => {
      const captured = {};
      for (const gt of GUARD_TYPES) {
        // eslint-disable-next-line no-await-in-loop
        await registerGuard(upsertStub(captured), { objectiveKey: 'o', guardKey: 'g_' + gt, predicateDescription: 'p', guardType: gt });
        expect(captured.row.guard_type).toBe(gt);
      }
    });

    it('registerObjective rejects an invalid mode', async () => {
      await expect(registerObjective({}, { objectiveKey: 'o', statement: 's', mode: 'sideways' })).rejects.toThrow(/invalid mode/);
    });
  });
});
