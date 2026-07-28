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

  it('pins the DISPOSITION LABEL at both boundaries, not just membership', () => {
    // Membership (does the item enter the population) is pinned above. The LABEL is a separate
    // property and was only half-covered: `ruled_out` and `prose` had fixtures, but the
    // string-"true" -> `asserted` arm of the ternary and the empty-string boundary did not, so
    // "always return prose" and "admit '' as prose" both survived mutation. Low severity — the
    // population is unaffected — but the label is what a reader of the report actually sees, and
    // an approval stored as the STRING "true" reading as prose misrepresents it as a real gate note.
    expect(membershipOf({ chairman_gated: 'true' }, 'chairman_gated').disposition).toBe('asserted');
    expect(membershipOf({ chairman_gated: ' YES ' }, 'chairman_gated').disposition).toBe('asserted');
    expect(membershipOf({ chairman_gated: 'requires DDL sign-off' }, 'chairman_gated').disposition).toBe('prose');
    expect(membershipOf({ chairman_gated: '' }, 'chairman_gated').disposition).toBe('unrecognised_shape');
  });

  it('an UNRECOGNISED value shape is still a MEMBER — key-presence means key-presence', () => {
    // Returning null for unrecognised shapes survived mutation, and null EXCLUDES the item from the
    // population entirely. That silently contradicts the stated doctrine for every odd value shape
    // a human might type: null, a number, an array, an empty string. Membership is decided by the
    // KEY; the value only ever picks a disposition.
    for (const value of [null, 1, ['x'], '', {}]) {
      const m = membershipOf({ chairman_gated: value }, 'chairman_gated');
      expect(m, `value ${JSON.stringify(value)} must remain a member`).not.toBeNull();
      expect(m.member).toBe(true);
    }
  });

  it('survives null / non-object metadata rather than throwing', () => {
    // quick_fixes has NO metadata column at all — null metadata is the documented common case for
    // 38 items, and no fixture passed it. Dropping the guard throws, which would abort the whole
    // sweep partway and produce a partial population with no control able to notice.
    expect(membershipOf(null, 'chairman_gated')).toBeNull();
    expect(membershipOf(undefined, 'chairman_gated')).toBeNull();
    expect(approvalTextOf(null)).toBe('');
    expect(approvalTextOf(undefined)).toBe('');
    expect(namesObjects(undefined)).toEqual({ named: false, identifiers: [] });
    expect(namesObjects(null).named).toBe(false);
    expect(matchesAuthorityPrefix(undefined)).toBe(false);
    expect(matchesAuthorityPrefix(null)).toBe(false);
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

  it('pins EVERY DDL verb, not just alter — the access-control verbs are the point', () => {
    // The conjunct's PRESENCE was pinned; its CONTENTS were not. An independent sweep showed the
    // verb list could be narrowed to alter|create|drop, or to `alter` alone, with the suite green.
    // Severity is higher than it looks: GRANT/REVOKE/ENABLE RLS are precisely the classes this
    // module's own docstring says the file-level verifier cannot see and which must be probed
    // directly. Silently losing those verbs drops the class the audit was built to cover.
    for (const verb of ['ALTER', 'CREATE', 'DROP', 'GRANT', 'REVOKE', 'ENABLE', 'ADD']) {
      const r = namesObjects(`${verb} on stage_executions`);
      expect(r.named, `verb ${verb} must be recognised`).toBe(true);
    }
    // Negative control: a non-DDL verb with the same identifier must NOT qualify.
    expect(namesObjects('SELECT from stage_executions').named).toBe(false);
  });

  it('does not fuse escape characters into the identifier it extracts', () => {
    // JSON.stringify on multi-line approval prose emits a literal backslash-n, so the identifier
    // scanner read `stage_executions` as `nstage_executions`. No verdict flips — `named` stays true
    // — which is why it survived mutation, but the PROBE TARGET is corrupted, and a probe target is
    // the predicate's only purpose. A follow-on prober would look up an object that does not exist
    // and report it MISSING: a fabricated finding that reads exactly like a real one.
    const r = namesObjects(approvalTextOf({
      chairman_apply_note: { line1: 'ALTER TABLE', line2: '\nstage_executions ADD COLUMN x' },
    }));
    expect(r.named).toBe(true);
    expect(r.identifiers).toContain('stage_executions');
    expect(r.identifiers).not.toContain('nstage_executions');
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

    // THE THIRD STATE, previously untested despite this test's own title claiming the distinction:
    // the search RAN and DID find an artifact elsewhere (PRD, retrospective, commit text). That is
    // not NEVER-BOUND — the control was bound, just not via metadata. Dropping the
    // secondaryArtifactFound conjunct survived mutation because only two of three states existed.
    const searchedAndFound = classifyItem({
      artifact: { present: false }, secondaryArtifactSearchDone: true, secondaryArtifactFound: true,
    });
    expect(searchedAndFound.verdict).toBe(VERDICT.UNVERIFIABLE);
    expect(searchedAndFound.reason).toBe(UNVERIFIABLE_REASON.NO_ARTIFACT);
  });

  it('discloses per-row which inputs were available, so a two-input row cannot read as triangulated', () => {
    const r = classifyItem(agreeing(false));
    expect(r.inputs).toEqual({ approval: false, artifact: true, live: true });
  });

  it('discloses artifact:false and live:false HONESTLY — not hardcoded true', () => {
    // Hardcoding either field survived mutation, because the only test asserting `inputs` used a
    // row where artifact AND live were both true and approval was the sole varying field. ~63% of
    // the live population has no artifact, so most report rows would have falsely read as
    // triangulated — the exact misreading the disclosure exists to prevent. A field is only pinned
    // if some fixture exercises it in BOTH states.
    const noArtifact = classifyItem({ artifact: { present: false } });
    expect(noArtifact.inputs).toEqual({ approval: false, artifact: false, live: false });

    const artifactNoProbe = classifyItem({
      approval: { namesObjects: true, provenanceIndependent: true },
      artifact: { present: true },
      live: { probed: false },
    });
    expect(artifactNoProbe.inputs).toEqual({ approval: true, artifact: true, live: false });
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

  it('fails when a seed is no longer reached VIA ITS DECLARED ARM', () => {
    // The check previously asked only `ids.has(identifier)`, so a seed that had stopped being
    // reachable through its own arm still passed as long as some OTHER arm picked it up. Every seed
    // is chosen because it is SOLE-REACH for its arm — an authoring-time property no control could
    // see, which one metadata edit adding a second key silently retires.
    // This is not hypothetical: when the arm-aware check first ran it falsified THREE of eight
    // annotations in this repo's own manifest, each a real member reached via a different arm.
    const r = checkManifest(
      [{ identifier: 'A', source_arm: 'arm_a' }, { identifier: 'B', source_arm: 'arm_b' }],
      [{ identifier: 'A', arms: ['arm_b'] }, { identifier: 'B', arms: ['arm_b'] }],
      ARMS);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.wrongArm.map((w) => w.identifier)).toEqual(['A']);
    expect(r.wrongArm[0].observed_arms).toEqual(['arm_b']);
  });

  it('accepts a seed reached via its arm ALONGSIDE others', () => {
    // Sharing an arm is not a failure; losing the declared one is.
    const r = checkManifest(
      [{ identifier: 'A', source_arm: 'arm_a' }, { identifier: 'B', source_arm: 'arm_b' }],
      [{ identifier: 'A', arms: ['arm_a', 'arm_b'] }, { identifier: 'B', arms: ['arm_b'] }],
      ARMS);
    expect(r.ok).toBe(true);
  });

  it('passes only when every member resolves AND every arm is seeded', () => {
    const r = checkManifest(
      [{ identifier: 'A', source_arm: 'arm_a' }, { identifier: 'B', source_arm: 'arm_b' }],
      ['A', 'B'], ARMS);
    expect(r.ok).toBe(true);
  });

  it('pins the COMPLETE arm list — every arm by name, not just distinctness and a sample', () => {
    // An independent mutation sweep showed SIX OF EIGHT arms could be deleted from POPULATION_ARMS
    // with the whole suite still green, because this test previously pinned only distinctness,
    // size === length, and two named arms. Deleting requires_chairman_apply alone loses 28 members.
    // Distinctness and a sample are not coverage of a list — the list itself must be the assertion.
    expect([...POPULATION_ARMS].sort()).toEqual([
      'apply_authority',
      'apply_to_prod_requires_user_go',
      'chairman_enum_migration_authorization',
      'chairman_gate',
      'chairman_gated',
      'chairman_gated_ddl',
      'chairman_gated_fence_20260726',
      'chairman_gated_migration',
      'chairman_gated_migration_possible',
      'completion_flag_index',
      'irreversible_exec_chairman_gated',
      'may_require_ddl',
      'migration_requires_chairman_apply',
      'quick_fixes_freetext',
      'requires_chairman_apply',
      'requires_chairman_apply_note',
      'requires_chairman_ddl',
    ]);
    expect(new Set(POPULATION_ARMS).size).toBe(POPULATION_ARMS.length);
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

  it('accepts EQUALITY — the steady state of every unchanged run', () => {
    // `got < floor` -> `got <= floor` survived mutation because the suite pinned shrink (28 v 29)
    // and growth (30 v 29) but never equality, which is what an unchanged population returns every
    // single run. It fails CLOSED, so it would not hide anything — it would make the control cry
    // wolf on every invocation until someone silenced it, which is how a real control gets removed.
    expect(checkBaselines({ arm_a: 29 }, { arm_a: 29 }).ok).toBe(true);
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

// ---------------------------------------------------------------------------
// COLLECTORS. Both real defects this module has had were HERE, not in the
// verdict logic, and neither was reachable while these functions sat behind the
// Supabase import in the CLI. That is the whole reason they moved to lib/.
// This file imports ONLY pure modules — no dotenv, no createClient — so the
// unit tier's production-credential leak has no reachable sink.
// ---------------------------------------------------------------------------
describe('collectors', () => {
  it('reads free-text sources from freeText, not from empty metadata', async () => {
    const { buildEvidence } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // THE SHIPPED DEFECT: this selected on the literal 'quick_fixes', so completion-flag rows fell
    // through to approvalTextOf({}) === '' and were verdicted from an empty string. 16 of 19
    // carried a .sql path that was discarded, including the arm's own manifest seed.
    const flag = {
      source: 'feedback', metadata: {},
      freeText: 'CHAIRMAN-ONLY: unapplied migration db/migrations/enable_rls.sql — ALTER TABLE audit_log',
    };
    const e = buildEvidence(flag);
    expect(e.artifact.present).toBe(true);
    expect(e.artifact.path).toBe('db/migrations/enable_rls.sql');
    expect(e.approval.namesObjects).toBe(true);

    // The SD source must still read metadata, not freeText.
    const sd = {
      source: 'strategic_directives_v2',
      metadata: { chairman_apply_note: 'ALTER TABLE stage_executions per db/m.sql' },
    };
    expect(buildEvidence(sd).artifact.path).toBe('db/m.sql');
  });

  it('never claims independent provenance, because approval and artifact share one string', async () => {
    const { buildEvidence } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // Hardcoding `true` here asserted the very flag the classifier checks and silently defeated the
    // asymmetry at its only call site. Both values below come from the SAME text, so they are one
    // origin — the self-comparison the design exists to reject.
    const e = buildEvidence({ source: 'quick_fixes', freeText: 'ALTER TABLE t per x.sql' });
    expect(e.approval.provenanceIndependent).toBe(false);
  });

  it('the quick-fix arm requires a gate phrase AND a DDL term, and drops retro shells', async () => {
    const { isQuickFixMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    expect(isQuickFixMember({ title: 'Apply 5 migrations (CHAIRMAN-GATED DDL)' })).toBe(true);
    // A chairman MENTION is not membership — the loose reading admitted 256 of 1184 rows.
    expect(isQuickFixMember({ title: 'Chairman decision queue flooded' })).toBe(false);
    expect(isQuickFixMember({ title: 'EHG brand asset kit (chairman review)' })).toBe(false);
    expect(isQuickFixMember({ title: '[Retro action items] 03020f59', description: 'chairman-gated migration' })).toBe(false);
    expect(isQuickFixMember(null)).toBe(false);
  });

  it('the completion-flag arm is scoped by CATEGORY, not by searching all feedback', async () => {
    const { isCompletionFlagMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    const text = { title: 'chairman-gated migration not applied', description: 'ALTER TABLE x' };
    expect(isCompletionFlagMember({ ...text, category: 'completion_flag' })).toBe(true);
    expect(isCompletionFlagMember({ ...text, category: 'completion_flag_witness' })).toBe(true);
    // Same text under any other category is NOT a completion flag. Free-texting the whole table
    // matched 168 of 13637 rows and let this one arm supply 73% of the population: `feedback` holds
    // every kind of feedback, so a text predicate over it is a search, not an index.
    expect(isCompletionFlagMember({ ...text, category: 'harness_backlog' })).toBe(false);
    expect(isCompletionFlagMember({ ...text, category: undefined })).toBe(false);
    expect(isCompletionFlagMember(null)).toBe(false);
  });

  it('buildPopulation unions arms by key-presence and keeps free-text sources separate', async () => {
    const { buildPopulation, addCompletionFlagArm } = await import('../../../lib/audits/chairman-apply-collectors.js');
    const sds = [
      { sd_key: 'SD-A', status: 'completed', metadata: { requires_chairman_apply: false } },
      { sd_key: 'SD-B', status: 'draft', metadata: { chairman_gated: 'prose gate' } },
      { sd_key: 'SD-C', status: 'completed', metadata: { unrelated: true } },
    ];
    const qfs = [{ id: 'QF-1', status: 'open', title: 'chairman-gated migration', description: 'ALTER' }];
    const pop = buildPopulation(sds, qfs, ['requires_chairman_apply', 'chairman_gated']);
    expect(pop.map((p) => p.identifier).sort()).toEqual(['QF-1', 'SD-A', 'SD-B']);
    // false is a DISPOSITION, never an exclusion.
    expect(pop.find((p) => p.identifier === 'SD-A').dispositions).toEqual(['ruled_out']);

    const withFlags = addCompletionFlagArm(pop, [
      { id: 'f1', category: 'completion_flag', title: 'chairman-gated', description: 'migration not applied' },
      { id: 'f2', category: 'other', title: 'chairman-gated', description: 'migration not applied' },
    ]);
    expect(withFlags.map((p) => p.identifier)).toContain('FEEDBACK-f1');
    expect(withFlags.map((p) => p.identifier)).not.toContain('FEEDBACK-f2');
  });

  it('an empty metadata arm list collects NO SDs — the shape that silently halved the population', async () => {
    const { buildPopulation } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // Observed live during the collector refactor: the call site passed two arguments to a
    // three-parameter function, metadataArms arrived undefined, and the population fell 82 -> 39
    // with every per-arm count at zero. The baseline control caught it and exited 2. Pinned so the
    // arity contract is a test rather than a near-miss.
    const sds = [{ sd_key: 'SD-A', status: 'completed', metadata: { requires_chairman_apply: true } }];
    expect(buildPopulation(sds, [], []).length).toBe(0);
    expect(buildPopulation(sds, [], undefined).length).toBe(0);
    expect(buildPopulation(sds, [], ['requires_chairman_apply']).length).toBe(1);
  });
});

describe('the producer/consumer contract at the source seam', () => {
  it('feeds buildPopulation OUTPUT straight into buildEvidence — no hand-built source', async () => {
    const c = await import('../../../lib/audits/chairman-apply-collectors.js');
    // THE SEAM. buildPopulation EMITS `source`; buildEvidence SWITCHES on it. Both halves were
    // pinned independently and the CONTRACT between them was not pinned at all, because every
    // fixture hand-built its own `source` value and so could not see the boundary. Changing the
    // producer's literal silently routed SD rows down the free-text branch — evidence read from an
    // empty string, .sql path discarded. That is this module's original shipped defect mirrored
    // onto the other arm, with the whole suite green. This test never names a source literal.
    const pop = c.buildPopulation(
      [{ sd_key: 'SD-A', status: 'completed', metadata: { chairman_apply_note: 'ALTER TABLE stage_executions per db/x.sql' } }],
      [{ id: 'QF-1', status: 'open', title: 'chairman-gated migration', description: 'ALTER TABLE t per db/qf.sql' }],
      ['chairman_apply_note']);
    const withFlags = c.addCompletionFlagArm(pop, [
      { id: 'f1', category: 'completion_flag', title: 'chairman-gated', description: 'unapplied migration db/f.sql ALTER' },
    ]);

    const byId = Object.fromEntries(withFlags.map((r) => [r.identifier, c.buildEvidence(r)]));
    // Each arm must reach ITS OWN text. If the seam breaks, the SD row silently yields null.
    expect(byId['SD-A'].artifact.path).toBe('db/x.sql');
    expect(byId['QF-1'].artifact.path).toBe('db/qf.sql');
    expect(byId['FEEDBACK-f1'].artifact.path).toBe('db/f.sql');
  });

  it('the SD source literal is defined ONCE and both sides use it', async () => {
    const c = await import('../../../lib/audits/chairman-apply-collectors.js');
    expect(c.SOURCE.SD).toBe('strategic_directives_v2');
    const row = c.buildPopulation(
      [{ sd_key: 'SD-A', status: 'completed', metadata: { chairman_apply_note: 'ALTER TABLE t per db/x.sql' } }],
      [], ['chairman_apply_note'])[0];
    expect(row.source).toBe(c.SOURCE.SD);
  });
});

describe('the arm predicates are conjunctions, not disjunctions', () => {
  it('quick-fix arm: a gate phrase WITHOUT a DDL term is not a member, and vice versa', async () => {
    const { isQuickFixMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // No fixture exercised gate-XOR-DDL, so AND and OR were INDISTINGUISHABLE. OR is exactly the
    // 256-of-1184 loose reading the pin exists to reject, and both examples below are the ones
    // named in the module's own comment as the reason for the pin.
    expect(isQuickFixMember({ title: 'CHAIRMAN-GATED brand asset kit' })).toBe(false);
    expect(isQuickFixMember({ title: 'ALTER TABLE ventures add column' })).toBe(false);
    expect(isQuickFixMember({ title: 'CHAIRMAN-GATED migration for ventures' })).toBe(true);
  });

  it('completion-flag arm: same conjunction, independently', async () => {
    const { isCompletionFlagMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    const cat = 'completion_flag';
    expect(isCompletionFlagMember({ category: cat, title: 'awaiting chairman signoff' })).toBe(false);
    expect(isCompletionFlagMember({ category: cat, title: 'ALTER TABLE ventures' })).toBe(false);
    expect(isCompletionFlagMember({ category: cat, title: 'awaiting chairman ALTER TABLE ventures' })).toBe(true);
  });
});

describe('buildEvidence output constants are asserted WHOLE, not sampled', () => {
  it('asserts the complete evidence object for a no-artifact row', async () => {
    const { buildEvidence } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // The published histogram is entirely a function of four constants here and NONE were asserted:
    // live.probed, secondaryArtifactSearchDone, secondaryArtifactFound and artifact.present.
    // They corrupt DISJOINT halves of the population — flipping live.probed fabricates a
    // chairman-actionable divergence on the ~37% with an artifact and changes the exit code to 1,
    // while flipping searchDone converts every remaining row to NEVER-BOUND — so no single sampled
    // field catches both. Asserting the whole object closes all four at once.
    expect(buildEvidence({ source: 'quick_fixes', freeText: 'no artifact here' })).toEqual({
      approval: { namesObjects: false, identifiers: [], provenanceIndependent: false },
      artifact: { present: false, path: null },
      live: { probed: false },
      secondaryArtifactSearchDone: false,
      secondaryArtifactFound: false,
    });
  });

  it('asserts the complete evidence object for an artifact-bearing row', async () => {
    const { buildEvidence } = await import('../../../lib/audits/chairman-apply-collectors.js');
    expect(buildEvidence({ source: 'quick_fixes', freeText: 'ALTER TABLE stage_executions per db/x.sql' })).toEqual({
      approval: { namesObjects: true, identifiers: ['stage_executions'], provenanceIndependent: false },
      artifact: { present: true, path: 'db/x.sql' },
      live: { probed: false },
      secondaryArtifactSearchDone: false,
      secondaryArtifactFound: false,
    });
  });

  it('an artifact is a .sql file, not any cited document', async () => {
    const { buildEvidence } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // Widening the artifact pattern to .md survived: prose citing a design doc would become an
    // artifact, and artifact.present is one of the three inputs APPLIED requires.
    expect(buildEvidence({ source: 'quick_fixes', freeText: 'see docs/plan.md' }).artifact.present).toBe(false);
  });
});

describe('regex CONTENTS are pinned, not merely their presence', () => {
  it('every gate-phrase alternative is load-bearing', async () => {
    const { isQuickFixMember, isCompletionFlagMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // Third file with this shape: the presence of each regex was pinned, its contents were not.
    // Reducing the gate phrase to just /chairman[- ]?gated/ survived, as did dropping whole DDL
    // families. Each alternative below is a real live phrasing.
    for (const phrase of ['CHAIRMAN-ONLY', 'chairman-gated', 'requires chairman',
      'chairman must', 'awaiting chairman', 'chairman to apply', 'chairman approval']) {
      expect(isQuickFixMember({ title: phrase + ' — ALTER TABLE t' }), phrase).toBe(true);
    }
    for (const phrase of ['CHAIRMAN-ONLY', 'requires chairman', 'awaiting chairman',
      'unapplied migration', 'not applied']) {
      expect(isCompletionFlagMember({ category: 'completion_flag', title: phrase + ' ALTER TABLE t' }), phrase).toBe(true);
    }
  });

  it('every DDL term is load-bearing — including the access-control ones', async () => {
    const { isQuickFixMember } = await import('../../../lib/audits/chairman-apply-collectors.js');
    for (const term of ['alter', 'create', 'drop', 'grant', 'revoke', 'enable',
      'migration', 'ddl', 'rls', 'policy']) {
      expect(isQuickFixMember({ title: 'chairman-gated ' + term + ' change' }), term).toBe(true);
    }
    // Negative control: gate phrase with no DDL term at all.
    expect(isQuickFixMember({ title: 'chairman-gated rename of a button' })).toBe(false);
  });
});

describe('buildPopulation applies its predicates and accumulates arms', () => {
  it('EXCLUDES a non-member quick fix — the arm predicate is applied at the CALL SITE', async () => {
    const { buildPopulation } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // isQuickFixMember was directly tested, yet deleting the call to it inside buildPopulation
    // survived: no fixture supplied a NON-member quick fix, so a bypass at the call site was
    // invisible. Testing a predicate is not testing that anything USES it.
    const pop = buildPopulation([], [
      { id: 'QF-YES', status: 'open', title: 'chairman-gated migration' },
      { id: 'QF-NO', status: 'open', title: 'unrelated button rename' },
    ], []);
    expect(pop.map((p) => p.identifier)).toEqual(['QF-YES']);
  });

  it('reads the DESCRIPTION as well as the title', async () => {
    const { isQuickFixMember, buildPopulation } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // A bland title with a gated description is a real live shape, and every fixture had put the
    // gate language in the title, so narrowing the read to title-only survived.
    expect(isQuickFixMember({ title: 'Follow-up', description: 'chairman-gated migration for ventures' })).toBe(true);
    const pop = buildPopulation([], [
      { id: 'QF-D', status: 'open', title: 'Follow-up', description: 'chairman-gated migration' },
    ], []);
    expect(pop.map((p) => p.identifier)).toEqual(['QF-D']);
  });

  it('ACCUMULATES every arm and disposition for a multi-arm SD', async () => {
    const { buildPopulation } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // `arms` was never asserted anywhere, so dropping the accumulation survived. It is not
    // cosmetic: the arm-aware manifest check reads exactly this array, and the per-arm baseline
    // floors are computed from it — a truncated arms list would silently shrink both.
    const pop = buildPopulation([{
      sd_key: 'SD-MULTI', status: 'completed',
      metadata: { requires_chairman_apply: true, chairman_gated: 'prose gate' },
    }], [], ['requires_chairman_apply', 'chairman_gated']);
    expect(pop).toHaveLength(1);
    expect(pop[0].arms).toEqual(['requires_chairman_apply', 'chairman_gated']);
    expect(pop[0].dispositions).toEqual(['asserted', 'prose']);
  });
});

describe('matchesAuthorityPrefix is WIRED, not merely exported', () => {
  it('buildPopulation stamps chairmanOnly for the apply_authority arm', async () => {
    const { buildPopulation } = await import('../../../lib/audits/chairman-apply-collectors.js');
    // It was exported, asserted by three tests, and called by NOTHING in production for the whole
    // life of the module — a dead control reading as active coverage. Testing a helper is not
    // testing that anything uses it, which is the same shape as the bypassable arm predicate.
    const pop = buildPopulation([
      { sd_key: 'SD-ONLY', status: 'completed', metadata: { apply_authority: 'CHAIRMAN-ONLY non-delegatable' } },
      { sd_key: 'SD-DELEG', status: 'completed', metadata: { apply_authority: 'delegated to PLAN' } },
    ], [], ['apply_authority']);
    const byId = Object.fromEntries(pop.map((r) => [r.identifier, r]));
    expect(byId['SD-ONLY'].chairmanOnly).toBe(true);
    expect(byId['SD-DELEG'].chairmanOnly).toBe(false);
  });
});
