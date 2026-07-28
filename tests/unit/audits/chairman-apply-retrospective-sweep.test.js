/**
 * Scenario suite for the chairman-apply retrospective sweep pure core.
 *
 * EVERY assertion here was mutation-verified: the branch it targets was deleted and the test
 * confirmed RED before being kept. Four review rounds on this SD each found a control that was
 * correct in form and blind in fact — a fixture naming a guard it could never reach, a scenario
 * asserting a data structure rather than a capability — and only mutation distinguished them.
 */

import { describe, it, expect } from 'vitest';
import {
  VERDICT, UNVERIFIABLE_REASON, POPULATION_ARMS,
  membershipOf, matchesAuthorityPrefix, approvalTextOf, namesObjects,
  classifyItem, checkManifest, checkBaselines, reasonHistogram, exitCodeFor,
} from '../../../lib/audits/chairman-apply-sweep.js';

describe('membership is key-presence, with value as a disposition', () => {
  it('admits a FALSE boolean and records it as ruled_out', () => {
    // Measured divergence is real: key-presence 43 vs truthy 39, and two of the false values sit on
    // COMPLETED SDs where "ruled out" and "cleared after apply" are indistinguishable from the
    // value alone. Excluding them would silently drop exactly the ambiguous cases.
    const m = membershipOf({ requires_chairman_apply: false }, 'requires_chairman_apply');
    expect(m).toEqual({ member: true, disposition: 'ruled_out' });
  });

  it('admits a PROSE value — the boundary TS-25 exists for', () => {
    const m = membershipOf(
      { chairman_gated: 'ALTER of created_at/updated_at to timestamptz — DDL, requires chairman approval' },
      'chairman_gated');
    expect(m.member).toBe(true);
    expect(m.disposition).toBe('prose');
  });

  it('returns null only when the KEY IS ABSENT, not when the value is falsy', () => {
    expect(membershipOf({ other: true }, 'requires_chairman_apply')).toBeNull();
    expect(membershipOf({ requires_chairman_apply: false }, 'requires_chairman_apply')).not.toBeNull();
  });
});

describe('apply_authority is a PREFIX match, never an equality', () => {
  it('matches the live prose form', () => {
    // Bare equality on 'CHAIRMAN-ONLY non-delegatable' returns ZERO live: real values carry it as a
    // prefix. That silently dropped 2 SDs, both access-control DDL.
    expect(matchesAuthorityPrefix('CHAIRMAN-ONLY non-delegatable')).toBe(true);
    expect(matchesAuthorityPrefix('chairman-only, see migration notes')).toBe(true);
  });
  it('rejects a value that merely mentions the phrase later', () => {
    expect(matchesAuthorityPrefix('delegated; not CHAIRMAN-ONLY')).toBe(false);
  });
});

describe('AC-12 — the pinned object-naming predicate (TS-29)', () => {
  it('an approval with a DDL verb but NO identifier does not name objects', () => {
    expect(namesObjects('DDL — requires chairman approval').named).toBe(false);
  });

  it('an approval with an identifier AND a DDL verb DOES name objects, and returns probe targets', () => {
    const r = namesObjects('ALTER FUNCTION fn_is_chairman SET search_path');
    expect(r.named).toBe(true);
    expect(r.identifiers).toContain('fn_is_chairman');
  });

  it('bare object-KIND words are not identifiers — the discriminator that costs 24 vs 16 members', () => {
    // Matching words like "table"/"policy"/"index" in prose measured 24/43 against 16/43 scoped,
    // inflating APPLIED nearly threefold. This is the boundary that separates the two.
    expect(namesObjects('create a policy on the table using the index').named).toBe(false);
  });

  it('excludes generic column noise that names no probeable object', () => {
    expect(namesObjects('ALTER of created_at and updated_at').named).toBe(false);
  });

  it('an identifier WITHOUT a DDL verb does not name objects', () => {
    // Added after a mutant that deleted the DDL-verb clause SURVIVED: the prose fixture above has
    // no snake_case identifier, so it returned false either way and left the clause untested.
    // The conjunction needs a fixture that isolates each half.
    expect(namesObjects('see the stage_executions dashboard for context').named).toBe(false);
    expect(namesObjects('ALTER TABLE stage_executions ADD COLUMN x').named).toBe(true);
  });

  it('reads APPROVAL-BEARING fields only, never the whole metadata blob', () => {
    const metadata = {
      requires_chairman_apply: true,
      unrelated_note: 'ALTER TABLE some_other_table for unrelated reasons',
    };
    // The DDL text lives under a NON-approval key, so it must not count.
    expect(namesObjects(approvalTextOf(metadata)).named).toBe(false);
    expect(namesObjects(approvalTextOf({
      chairman_gated: 'ALTER TABLE stage_executions ADD COLUMN x',
    })).named).toBe(true);
  });
});

describe('THE ASYMMETRY — APPLIED requires three inputs (TS-24)', () => {
  const agreeing = (approvalNamesObjects) => ({
    // declaresMoreThanArtifact: false means the coverage comparison WAS performed and the artifact
    // covers the approval. Omitting it is not equivalent — see the three-way test below.
    approval: { namesObjects: approvalNamesObjects, provenanceIndependent: true, declaresMoreThanArtifact: false },
    artifact: { present: true },
    live: { probed: true, matchesArtifact: true },
  });

  it('NEVER returns APPLIED when no object-naming approval exists, even when artifact and live agree', () => {
    // Without an approval the two are a SELF-COMPARISON: an artifact that under-declares makes
    // artifact and live agree while both diverge from what was actually approved.
    const r = classifyItem(agreeing(false));
    expect(r.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(r.reason).toBe(UNVERIFIABLE_REASON.NO_APPROVAL);
  });

  it('returns APPLIED only with all three inputs present', () => {
    expect(classifyItem(agreeing(true)).verdict).toBe(VERDICT.APPLIED);
  });

  it('an UNPERFORMED coverage comparison reaches neither APPLIED nor DIVERGENT', () => {
    // declaresMoreThanArtifact has three real states and collapsing it either way is wrong:
    // `=== true` alone let UNDEFINED resolve toward APPLIED with the check permanently off, since
    // no caller sets the field; `!== false` would route every unset row to DIVERGENT, which is the
    // false-divergent mirror. Unknown means the comparison never happened.
    const r = classifyItem({
      approval: { namesObjects: true, provenanceIndependent: true },  // declaresMoreThanArtifact unset
      artifact: { present: true },
      live: { probed: true, matchesArtifact: true },
    });
    expect(r.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(r.reason).toBe(UNVERIFIABLE_REASON.LEDGER_SILENT);
  });

  it('an approval that OVER-DECLARES relative to the artifact is DIVERGENT', () => {
    const r = classifyItem({
      approval: { namesObjects: true, provenanceIndependent: true, declaresMoreThanArtifact: true },
      artifact: { present: true },
      live: { probed: true, matchesArtifact: true },
    });
    expect(r.verdict).toBe(VERDICT.APPLIED_BUT_DIVERGENT);
  });

  it('UNKNOWN surplus is UNATTRIBUTABLE, not attributable', () => {
    // `=== true` would let an unset field present unexplained live objects as divergence-from-
    // approval. Polarity rule: enables a stronger claim -> `=== true`; blocks one -> `!== false`.
    const r = classifyItem({
      approval: { namesObjects: false },
      artifact: { present: true },
      live: { probed: true, matchesArtifact: false },   // surplus unset
    });
    expect(r.surplusUnattributable).toBe(true);
  });

  it('UNKNOWN provenance is not independence — it must not reach APPLIED (TS-22)', () => {
    // Found by mutation: the three-input check was UNREACHABLE (every earlier guard had already
    // proven all three present), so LEDGER_SILENT could never be emitted. Tracing why exposed the
    // real defect behind it — provenanceIndependent was tested with `!== false`, so UNKNOWN counted
    // as independent and failed OPEN toward APPLIED, the one direction this audit must never fail.
    const r = classifyItem({
      approval: { namesObjects: true },            // provenanceIndependent deliberately absent
      artifact: { present: true },
      live: { probed: true, matchesArtifact: true },
    });
    expect(r.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(r.reason).toBe(UNVERIFIABLE_REASON.LEDGER_SILENT);
    expect(r.inputs.approval).toBe(false);
  });

  it('an approval with EXPLICITLY dependent provenance is also not independence', () => {
    const r = classifyItem({
      approval: { namesObjects: true, provenanceIndependent: false },
      artifact: { present: true },
      live: { probed: true, matchesArtifact: true },
    });
    expect(r.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(r.reason).toBe(UNVERIFIABLE_REASON.LEDGER_SILENT);
  });

  it('a DISAGREEMENT is still informative without an approval, but marks its surplus UNATTRIBUTABLE', () => {
    // Closing false-APPLIED opened its mirror: extra live objects may be unrelated later work.
    const r = classifyItem({
      approval: { namesObjects: false },
      artifact: { present: true },
      live: { probed: true, matchesArtifact: false, surplus: true },
    });
    expect(r.verdict).toBe(VERDICT.APPLIED_BUT_DIVERGENT);
    expect(r.surplusUnattributable).toBe(true);
  });

  it('reports NOT-APPLIED-BUT-COMPLETED when live is MISSING what the artifact declares', () => {
    const r = classifyItem({
      approval: { namesObjects: true, provenanceIndependent: true },
      artifact: { present: true },
      live: { probed: true, matchesArtifact: false, missing: true },
    });
    expect(r.verdict).toBe(VERDICT.NOT_APPLIED_BUT_COMPLETED);
  });

  it('an unprobed class reports CLASS_UNPROBEABLE rather than inferring from a verifier that fails open', () => {
    const r = classifyItem({
      approval: { namesObjects: true }, artifact: { present: true }, live: { probed: false },
    });
    expect(r.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(r.reason).toBe(UNVERIFIABLE_REASON.CLASS_UNPROBEABLE);
  });

  it('distinguishes NEVER-BOUND from UNVERIFIABLE only after a secondary artifact search', () => {
    const noSearch = classifyItem({ artifact: { present: false } });
    expect(noSearch.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(noSearch.reason).toBe(UNVERIFIABLE_REASON.NO_ARTIFACT);

    const searched = classifyItem({
      artifact: { present: false }, secondaryArtifactSearchDone: true, secondaryArtifactFound: false,
    });
    expect(searched.verdict).toBe(VERDICT.NEVER_BOUND);
  });

  it('discloses per-row which inputs were available, so a two-input row cannot read as triangulated', () => {
    const r = classifyItem(agreeing(false));
    expect(r.inputs).toEqual({ approval: false, artifact: true, live: true });
  });
});

describe('the manifest hard-fails — a manifest coverage equals its membership', () => {
  const ARMS = ['arm_a', 'arm_b'];

  it('fails when a seeded member is no longer in the population', () => {
    const r = checkManifest(
      [{ identifier: 'GONE', source_arm: 'arm_a' }, { identifier: 'HERE', source_arm: 'arm_b' }],
      ['HERE'], ARMS);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.identifier)).toEqual(['GONE']);
  });

  it('fails when an ARM carries no seed at all — the check that caught two unimplemented arms live', () => {
    // Not hypothetical: this fired twice during EXEC, once for quick_fixes_freetext and once for
    // completion_flag_index, the latter declared in POPULATION_ARMS with no collector written.
    const r = checkManifest([{ identifier: 'HERE', source_arm: 'arm_a' }], ['HERE'], ARMS);
    expect(r.ok).toBe(false);
    expect(r.unseededArms).toEqual(['arm_b']);
  });

  it('passes only when every member resolves AND every arm is seeded', () => {
    const r = checkManifest(
      [{ identifier: 'A', source_arm: 'arm_a' }, { identifier: 'B', source_arm: 'arm_b' }],
      ['A', 'B'], ARMS);
    expect(r.ok).toBe(true);
  });

  it('every declared population arm is a real, distinct arm', () => {
    expect(new Set(POPULATION_ARMS).size).toBe(POPULATION_ARMS.length);
    expect(POPULATION_ARMS).toContain('quick_fixes_freetext');
    expect(POPULATION_ARMS).toContain('completion_flag_index');
  });
});

describe('baselines are DIRECTIONAL — a count may only grow', () => {
  it('flags a shrunk arm, which a non-zero check cannot see', () => {
    const r = checkBaselines({ arm_a: 28 }, { arm_a: 29 });
    expect(r.ok).toBe(false);
    expect(r.regressions[0]).toMatchObject({ arm: 'arm_a', floor: 29, got: 28 });
  });

  it('flags a MISSING arm rather than treating absence as zero-and-fine', () => {
    const r = checkBaselines({}, { arm_a: 1 });
    expect(r.ok).toBe(false);
    expect(r.regressions[0].got).toBeNull();
  });

  it('accepts growth', () => {
    expect(checkBaselines({ arm_a: 30 }, { arm_a: 29 }).ok).toBe(true);
  });
});

describe('the reason histogram is what makes the output a remediation backlog (TS-27)', () => {
  it('counts only UNVERIFIABLE rows, bucketed by reason', () => {
    const rows = [
      { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.NO_ARTIFACT },
      { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.NO_ARTIFACT },
      { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.CLASS_UNPROBEABLE },
      { verdict: VERDICT.APPLIED, reason: null },
    ];
    expect(reasonHistogram(rows)).toEqual({ NO_ARTIFACT: 2, CLASS_UNPROBEABLE: 1 });
  });

  it('surfaces an UNREASONED unverifiable rather than hiding it', () => {
    expect(reasonHistogram([{ verdict: VERDICT.UNVERIFIABLE, reason: null }])).toEqual({ UNREASONED: 1 });
  });
});

describe('exit codes', () => {
  it('returns 2 when a control failed, regardless of findings', () => {
    expect(exitCodeFor([{ verdict: VERDICT.APPLIED }], false)).toBe(2);
  });
  it('returns 1 on a chairman-actionable finding', () => {
    expect(exitCodeFor([{ verdict: VERDICT.NOT_APPLIED_BUT_COMPLETED }], true)).toBe(1);
    expect(exitCodeFor([{ verdict: VERDICT.APPLIED_BUT_DIVERGENT }], true)).toBe(1);
  });
  it('an all-UNVERIFIABLE run is NOT actionable and NOT a failure — the correct answer here', () => {
    // ~91% UNVERIFIABLE is the expected shape. Exiting non-zero on it would train the reader to
    // ignore the signal that actually matters.
    expect(exitCodeFor([{ verdict: VERDICT.UNVERIFIABLE }], true)).toBe(0);
  });
});
