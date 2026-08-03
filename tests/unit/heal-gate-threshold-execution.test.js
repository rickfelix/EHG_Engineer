// FR-2 — the gate is EXECUTED, not grepped.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// WHY THIS FILE EXISTS. The sibling suite heal-gate-threshold-single-source.test.js asserts on the
// gate's SOURCE TEXT and on properties of the IMPORTED TABLE. Mutation testing showed what that is
// worth: 5 of 7 mutants SURVIVED the whole repo suite. Every survivor was the same shape — behaviour
// removed, source text left intact:
//
//   * gate returns a hard-coded default, the `SD_TYPE_THRESHOLDS[sdType]` text still present
//   * the tier branch made unreachable with `if (false && …)`, import and subscript still present
//   * the narrowing outcome log disabled, all five outcome literals still present
//   * `no_dimension_scores` collapsed into `skipped_corrective`, the literal kept in a comment
//   * the ADVISORY Score Age line made unreachable, the string still present
//
// So the headline claim of this SD — four in-flight orchestrator SDs move 85 -> 70 — could have been
// FULLY REVERTED without one test going red. A test that asserts on the source of a deliverable
// instead of executing it proves the characters are there, not that they run.
//
// loadHealThreshold IS exported (heal-before-complete.js exports it alongside readAppConfigValue and
// loadToleranceBuffer), so the resolver can be driven directly with a fake client. No grep here.
import { describe, it, expect } from 'vitest';
import { loadHealThreshold } from '../../scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js';
import { SD_TYPE_THRESHOLDS } from '../../lib/handoff/threshold-resolver.js';

/**
 * Minimal Supabase double for readAppConfigValue.
 *
 * DEFAULT IS "NO OVERRIDE ROW". app_config.heal_gate_threshold is consulted FIRST and wins over
 * everything, so a fake that accidentally returned a value would make every assertion below pass
 * for the wrong reason — the threshold would be the fake's number, not the resolver's.
 */
function fakeSupabase({ appConfigValue = null } = {}) {
  return {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: appConfigValue === null ? null : { value: appConfigValue }, error: null }),
        single: async () => ({ data: appConfigValue === null ? null : { value: appConfigValue }, error: null }),
        then: undefined,
      };
      return q;
    },
  };
}

describe('FR-2 executed — the gate resolves the canonical tier, not a local copy', () => {
  it('orchestrator resolves to 70 — the headline claim, asserted on the RESOLVED NUMBER', async () => {
    // THE ASSERTION THE WHOLE SD RESTS ON. A mutant returning a hard-coded default dies here.
    const { threshold, source } = await loadHealThreshold(fakeSupabase(), 'orchestrator');
    expect(threshold).toBe(70);
    expect(source).toBe('sd_type:orchestrator');
  });

  it('the resolved number TRACKS the canonical table rather than restating a literal', async () => {
    // Deliberately compares against the imported table, so a future deliberate re-tuning of the
    // tier does not fail here for the wrong reason — while a gate that stopped consulting the
    // table still dies.
    for (const type of ['feature', 'security', 'documentation', 'refactor', 'enhancement']) {
      const { threshold } = await loadHealThreshold(fakeSupabase(), type);
      expect(threshold, type).toBe(SD_TYPE_THRESHOLDS[type]);
    }
  });

  it('DISCRIMINATES between tiers — a constant-returning resolver passes single-tier checks', async () => {
    const feature = await loadHealThreshold(fakeSupabase(), 'feature');
    const documentation = await loadHealThreshold(fakeSupabase(), 'documentation');
    expect(feature.threshold).toBeGreaterThan(documentation.threshold);
  });
});

describe('FR-2 executed — the unknown-type fallback reads the SAME table', () => {
  it('an unrecognised sd_type resolves to the canonical _default, not a gate-local constant', async () => {
    // THE DEFECT THIS FILE WAS WRITTEN FOR. Previously an unknown type fell to a gate-local
    // DEFAULT_HEAL_THRESHOLD = 85 while the canonical _default was 80 — two constants five points
    // apart still governing one decision, one branch below the table that had just been de-duplicated.
    const { threshold, source } = await loadHealThreshold(fakeSupabase(), 'discovery_spike');
    expect(threshold).toBe(SD_TYPE_THRESHOLDS._default);
    expect(source).toBe('sd_type:_default');
  });

  it('and it is not 85 — pinning the direction, since the old value was a plausible answer', async () => {
    // Without this, a regression restoring the local 85 would be caught only if _default stayed 80.
    const { threshold } = await loadHealThreshold(fakeSupabase(), 'uat');
    expect(threshold).not.toBe(85);
  });

  it.each(['uat', 'docs', 'implementation', 'ux_debt', 'discovery_spike'])(
    'real unmapped sd_type %s takes the canonical fallback', async (type) => {
      // These five are MEASURED, not imagined: 41 SDs in the live table carry them (all terminal).
      // `docs` is the interesting one — it is not `documentation`, so it has been silently taking
      // the fallback rather than the tier its name suggests.
      const { threshold } = await loadHealThreshold(fakeSupabase(), type);
      expect(threshold).toBe(SD_TYPE_THRESHOLDS._default);
    });

  it('missing / empty sd_type also lands on the canonical default', async () => {
    for (const t of [undefined, null, '']) {
      const { threshold } = await loadHealThreshold(fakeSupabase(), t);
      expect(threshold).toBe(SD_TYPE_THRESHOLDS._default);
    }
  });
});

describe('FR-2 executed — a prototype-named sd_type cannot resolve to an inherited member', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    '%s falls to _default instead of returning a Function', async (type) => {
      // `SD_TYPE_THRESHOLDS['constructor']` is an inherited Function — NOT nullish — so a
      // `!= null` guard would hand a Function back as the threshold. Object.hasOwn plus a typeof
      // number check is what makes this land on the default.
      const { threshold } = await loadHealThreshold(fakeSupabase(), type);
      expect(typeof threshold).toBe('number');
      expect(threshold).toBe(SD_TYPE_THRESHOLDS._default);
    });
});

describe('FR-2 executed — app_config override still wins, and its bounds hold', () => {
  it('a valid override beats the sd_type tier', async () => {
    // Both arms matter: if the fake silently returned no row, the assertions above would pass for
    // the wrong reason. This proves the fake CAN deliver an override, so their default really is
    // "no override".
    const { threshold, source } = await loadHealThreshold(fakeSupabase({ appConfigValue: '42' }), 'orchestrator');
    expect(threshold).toBe(42);
    expect(source).toBe('app_config');
  });

  it('an out-of-range override is ignored and the tier is used', async () => {
    for (const bad of ['0', '101', 'abc', '-5']) {
      const { threshold } = await loadHealThreshold(fakeSupabase({ appConfigValue: bad }), 'orchestrator');
      expect(threshold, bad).toBe(70);
    }
  });
});
