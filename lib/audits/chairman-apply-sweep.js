/**
 * Chairman-apply retrospective sweep — pure core (SD-LEO-INFRA-RETROSPECTIVE-SWEEP-EVERY-001)
 *
 * The chairman apply-gate read as protection while providing none for its entire life. This audits
 * what already shipped under it. It is READ-ONLY and remediates nothing: where a live object
 * diverges from what a chairman approved, that is chairman-facing by construction.
 *
 * WHY THE FLAG IS NOT THE POPULATION. metadata.requires_chairman_apply measures 27, but the gate
 * was recorded at least nine ways across two tables, quick_fixes has NO metadata column at all
 * (38 items unreachable by any metadata query), and ~73% of already-documented unapplied cases
 * fall outside the flag — the earliest two months before the flag first existed.
 *
 * WHY APPLIED IS NEARLY UNREACHABLE, and why that is the correct answer rather than a bug.
 * Measured availability over the live population: an object-naming approval exists for 23%, a
 * named .sql artifact for 37%, metadata.migration_files for 0%, and BOTH approval and artifact for
 * ONE item (2%). Since APPLIED requires all three independent inputs, the correct output is ~95%
 * UNVERIFIABLE. Stated up front so a correct run is not mistaken for a broken one and "fixed" by
 * loosening the rules — which is the failure direction that closes the audit on a real divergence.
 *
 * ALL IO LIVES IN THE CALLER. Not stylistic: the unit test tier leaks real production credentials
 * (.env loads in the parent process and pool:'forks' inherits it before setup can no-op it), so a
 * collector that builds its own client would silently reach production.
 */

export const VERDICT = Object.freeze({
  APPLIED: 'APPLIED',
  APPLIED_BUT_DIVERGENT: 'APPLIED-BUT-DIVERGENT',
  NOT_APPLIED_BUT_COMPLETED: 'NOT-APPLIED-BUT-COMPLETED',
  NEVER_BOUND: 'NEVER-BOUND',
  UNVERIFIABLE: 'UNVERIFIABLE',
});

/**
 * UNVERIFIABLE is sub-typed so it cannot function as a shrug. The histogram is what turns the
 * report from a mostly-empty verdict table into a REMEDIATION BACKLOG: each reason names what
 * would have to exist for the item to become answerable.
 */
export const UNVERIFIABLE_REASON = Object.freeze({
  NO_ARTIFACT: 'NO_ARTIFACT',
  NO_APPROVAL: 'NO_APPROVAL',
  LEDGER_SILENT: 'LEDGER_SILENT',
  CLASS_UNPROBEABLE: 'CLASS_UNPROBEABLE',
});

/**
 * Population arms. The audit unions ALL of them; dropping any one silently loses sole-reach
 * members (measured drops from a 41-row union: 28 / 5 / 3 / 2 / 2 — every arm is load-bearing).
 * quick_fixes and the completion-flag index are separate arms because neither is metadata-reachable.
 */
export const POPULATION_ARMS = Object.freeze([
  'requires_chairman_apply',
  'chairman_gated_migration',
  'chairman_gated',
  'chairman_gate',
  'apply_authority',
  'requires_chairman_apply_note',
  'quick_fixes_freetext',
  'completion_flag_index',
]);

/**
 * MEMBERSHIP IS KEY-PRESENCE — decided here, not deferred to the implementer.
 *
 * A false or prose value is carried as a DISPOSITION, never as an exclusion: being ruled out is a
 * VERDICT about an item, not grounds for the item never appearing. Measured divergence is real
 * (key-presence 43 vs truthy 39) and includes two `requires_chairman_apply=false` on COMPLETED
 * SDs, where "ruled out" and "cleared after apply" are indistinguishable from the value alone.
 */
export function membershipOf(metadata, armKey) {
  if (!metadata || typeof metadata !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(metadata, armKey)) return null;
  const v = metadata[armKey];
  if (v === true) return { member: true, disposition: 'asserted' };
  if (v === false) return { member: true, disposition: 'ruled_out' };
  if (typeof v === 'string' && v.trim() !== '') {
    // Prose values carry real gates, e.g. "ALTER of created_at/updated_at to timestamptz — DDL,
    // requires chairman approval". Excluding prose drops members the boolean path never sees.
    return { member: true, disposition: /^\s*(true|yes)\s*$/i.test(v) ? 'asserted' : 'prose' };
  }
  return { member: true, disposition: 'unrecognised_shape' };
}

/**
 * Prefix/contains semantics where the stored value is prose. Bare equality on
 * apply_authority='CHAIRMAN-ONLY non-delegatable' returns ZERO live, because real values carry
 * that as a prefix — silently dropping 2 SDs, both access-control DDL.
 */
export function matchesAuthorityPrefix(value, prefix = 'CHAIRMAN-ONLY') {
  return typeof value === 'string' && value.trim().toUpperCase().startsWith(prefix.toUpperCase());
}

/**
 * Keys under which an approval would actually be RECORDED. The predicate reads only these, never
 * the whole metadata blob: object-kind words like "table"/"view"/"index" occur constantly in
 * unrelated metadata prose, and matching the blob measured 24/43 against 16/43 scoped — inflating
 * APPLIED nearly threefold.
 */
export const APPROVAL_BEARING_KEY = /chairman|apply|gate|approval|migration/i;

/** snake_case or schema-qualified — the shape a real DB object reference takes. */
const IDENTIFIER_RE = /\b(?:public\.)?[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const DDL_VERB_RE = /\b(alter|create|drop|grant|revoke|enable|add)\b/i;

/**
 * Identifier-shaped tokens that name no probeable object: the arm keys themselves, plus generic
 * column/constraint vocabulary that appears in approvals about entirely unrelated objects.
 */
const IDENTIFIER_NOISE = Object.freeze(new Set([
  'requires_chairman_apply', 'chairman_gated_migration', 'chairman_gated', 'apply_authority',
  'requires_chairman_apply_note', 'chairman_approval', 'migration_files', 'sd_key',
  'search_path', 'not_null', 'primary_key', 'foreign_key', 'created_at', 'updated_at',
]));

/**
 * Collect the approval-bearing text for one metadata object. Exported because the scoping decision
 * — read approval fields, not the blob — is itself load-bearing and must be testable.
 */
export function approvalTextOf(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  let out = '';
  for (const [key, val] of Object.entries(metadata)) {
    if (!APPROVAL_BEARING_KEY.test(key)) continue;
    // JSON.stringify emits ESCAPE SEQUENCES as literal two-character pairs, so multi-line approval
    // prose turns "\nstage_executions" into backslash-n-stage_executions and the identifier scanner
    // reads `nstage_executions`. No verdict flips, which is why this hides — but the PROBE TARGET is
    // corrupted, and a probe target is this predicate's only purpose. A prober would then look up a
    // nonexistent object and report it MISSING: a fabricated finding shaped exactly like a real one.
    const text = typeof val === 'string' ? val : JSON.stringify(val).replace(/\\[nrtbf"\\/]/g, ' ');
    out += ' ' + text;
  }
  return out;
}

/**
 * AC-12 — THE PINNED OBJECT-NAMING PREDICATE. An approval names objects IFF it carries a concrete
 * identifier AND a DDL verb.
 *
 * WHY THIS READING AND NOT ANOTHER. The predicate exists to yield a PROBE TARGET. "DDL — requires
 * chairman approval" names nothing you can look up; "ALTER of created_at/updated_at on the four
 * core protocol tables" does. A reading that produces nothing probeable cannot feed the live-probe
 * input the three-input rule needs, so it fails at its only purpose.
 *
 * The phrase alone did NOT determine a number: three defensible readings measured 24 / 17 / 16 of
 * 43 members and moved APPLIED from 11 to 4. Pinned rather than described, for that reason.
 * Returns the identifiers so a caller can probe them, not merely a boolean.
 */
export function namesObjects(approvalText) {
  const text = typeof approvalText === 'string' ? approvalText : '';
  const identifiers = [...new Set(text.match(IDENTIFIER_RE) || [])]
    .filter((t) => !IDENTIFIER_NOISE.has(t));
  const named = identifiers.length > 0 && DDL_VERB_RE.test(text);
  return { named, identifiers };
}

/**
 * Two inputs sharing an origin are one input.
 *
 * PROVENANCE MUST BE AFFIRMATIVELY KNOWN. This previously read `provenanceIndependent !== false`,
 * which counted UNKNOWN provenance as independent — failing OPEN toward APPLIED, the one direction
 * this audit must never fail (a false APPLIED closes the audit on a real divergence and nothing
 * re-examines it). Found by mutation: the mutant that removed the three-input check survived,
 * because the check was unreachable, and tracing why surfaced this default.
 */
function independentInputCount(evidence) {
  const e = evidence || {};
  let n = 0;
  if (e.approval && e.approval.namesObjects && e.approval.provenanceIndependent === true) n += 1;
  if (e.artifact && e.artifact.present) n += 1;
  if (e.live && e.live.probed) n += 1;
  return n;
}

/**
 * Pure verdict.
 *
 * THE ASYMMETRY (the load-bearing rule): APPLIED requires an object-naming approval AND an
 * artifact AND a live probe. Without an object-naming approval, artifact + live may still yield a
 * DISAGREEMENT verdict — disagreement is informative even from correlated inputs — but NEVER
 * APPLIED. Rationale: a false NOT-APPLIED costs one chairman interruption and self-corrects; a
 * false APPLIED closes the audit on a real production divergence and nothing re-examines it,
 * because this is the only backward-looking sweep.
 */
export function classifyItem(evidence) {
  const e = evidence || {};

  // NEVER-BOUND is the ABSENCE of the control, reported separately from UNVERIFIABLE. Only after
  // the secondary check of PRD/retrospective/commit text — metadata absence alone is insufficient.
  if (!e.artifact?.present && e.secondaryArtifactSearchDone && !e.secondaryArtifactFound) {
    return { verdict: VERDICT.NEVER_BOUND, reason: null, inputs: inputsOf(e) };
  }
  if (!e.artifact?.present) {
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.NO_ARTIFACT, inputs: inputsOf(e) };
  }
  // A class the only file-level verifier cannot see (POLICY, GRANT/REVOKE, ENABLE RLS,
  // ALTER FUNCTION SET search_path) must be probed directly or reported unprobeable — never
  // inferred from a verifier that has no such class and fails open toward APPLIED.
  if (!e.live?.probed) {
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.CLASS_UNPROBEABLE, inputs: inputsOf(e) };
  }

  const agree = e.live.matchesArtifact === true;
  const approvalNamesObjects = Boolean(e.approval?.namesObjects);
  // Unknown provenance is NOT independence — see independentInputCount.
  const provenanceKnown = e.approval?.provenanceIndependent === true;
  const hasApproval = approvalNamesObjects && provenanceKnown;

  if (!agree) {
    // Disagreement is informative even without an approval — but the SURPLUS half is
    // unattributable, because extra live objects may be unrelated later work rather than
    // divergence from what was approved. Closing false-APPLIED opened this mirror.
    // UNKNOWN surplus is treated as UNATTRIBUTABLE, not as attributable. `=== true` here would let
    // an unset field present unexplained live objects as divergence-from-approval — the mirror of
    // the false APPLIED the asymmetry closed. Polarity rule for this file: a field that ENABLES a
    // stronger claim is tested `=== true`; a field that BLOCKS one is tested `!== false`.
    const surplusUnattributable = !hasApproval && e.live.surplus !== false;
    return e.live.missing === true
      ? { verdict: VERDICT.NOT_APPLIED_BUT_COMPLETED, reason: null, inputs: inputsOf(e), surplusUnattributable }
      : { verdict: VERDICT.APPLIED_BUT_DIVERGENT, reason: null, inputs: inputsOf(e), surplusUnattributable };
  }

  // They agree. Without an approval the two are a SELF-COMPARISON, not corroboration: an
  // artifact that under-declares makes artifact and live agree while both diverge from what was
  // actually approved. ~77% of the population lacks an object-naming approval.
  if (!hasApproval) {
    // An approval that NAMES objects but whose independence is unconfirmed is a DIFFERENT gap from
    // having no approval at all: the document exists, but nothing corroborates that it was recorded
    // independently of the artifact it is being compared against. Sub-typed so the remediation
    // differs — LEDGER_SILENT asks for provenance, NO_APPROVAL asks for an approval.
    const reason = approvalNamesObjects
      ? UNVERIFIABLE_REASON.LEDGER_SILENT
      : UNVERIFIABLE_REASON.NO_APPROVAL;
    return { verdict: VERDICT.UNVERIFIABLE, reason, inputs: inputsOf(e) };
  }
  // THREE-WAY, because this field has three real states and collapsing it either way is wrong.
  // `=== true` alone let UNDEFINED resolve toward APPLIED with the check permanently off (no caller
  // sets it). But `!== false` would route every unset row to DIVERGENT — the false-divergent mirror.
  // TRUE = the approval over-declares (divergence). FALSE = compared, covered (may proceed).
  // UNKNOWN = the comparison was never performed, which is UNVERIFIABLE, not a verdict either way.
  if (e.approval.declaresMoreThanArtifact === true) {
    return { verdict: VERDICT.APPLIED_BUT_DIVERGENT, reason: null, inputs: inputsOf(e) };
  }
  if (e.approval.declaresMoreThanArtifact !== false) {
    // The approval-vs-artifact coverage comparison was never performed, so nothing establishes that
    // the artifact covers everything the approval authorised. APPLIED would be asserting a
    // comparison that did not happen.
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.LEDGER_SILENT, inputs: inputsOf(e) };
  }
  // Reaching here means all three inputs are already proven present: the artifact guard, the live
  // guard and hasApproval (which now requires provenanceIndependent === true) each returned early
  // otherwise. A `independentInputCount(e) < 3` check sat here and was UNREACHABLE — dead code
  // reading as a three-input guard. Removed rather than left: a mutant deleting it survived twice,
  // which is what an unreachable control looks like from the outside. The real enforcement is
  // hasApproval above, and independentInputCount remains the single source for that count.
  if (independentInputCount(e) !== 3) {
    throw new Error(`classifyItem invariant violated: APPLIED reached with ${independentInputCount(e)} inputs`);
  }
  return { verdict: VERDICT.APPLIED, reason: null, inputs: inputsOf(e) };
}

/** Per-row input disclosure, so a two-input row reads as bounded rather than triangulated. */
function inputsOf(e) {
  return {
    approval: Boolean(e.approval?.namesObjects) && e.approval?.provenanceIndependent === true,
    artifact: Boolean(e.artifact?.present),
    live: Boolean(e.live?.probed),
  };
}

/**
 * A missing manifest member HARD-FAILS: a manifest's coverage equals its membership.
 *
 * ARM-AWARE, and that is the load-bearing part. This previously asked only `ids.has(identifier)`,
 * so a seed that had stopped being reachable through ITS DECLARED ARM still satisfied the check as
 * long as some OTHER arm happened to pick it up. Every seed is chosen because it is SOLE-REACH for
 * its arm — that is an authoring-time property of the data, not an enforced one, and a single
 * metadata edit adding a second key silently retires it. With an identifier-only check the free-text
 * arms could collapse from 20 members to 1 with ok:true and exit 0.
 *
 * Takes population ROWS ({identifier, arms}), not bare ids, so the arm claim can actually be tested.
 */
export function checkManifest(manifest, population, armList) {
  const byId = new Map();
  for (const p of population || []) {
    // Tolerate a bare id list so a caller that has not been updated fails LOUDLY on the arm check
    // rather than silently reverting to identifier-only semantics.
    if (typeof p === 'string') byId.set(p, null);
    else if (p && p.identifier) byId.set(p.identifier, Array.isArray(p.arms) ? p.arms : null);
  }
  const missing = [];
  const wrongArm = [];
  for (const m of manifest || []) {
    if (!byId.has(m.identifier)) { missing.push(m); continue; }
    const arms = byId.get(m.identifier);
    if (arms && !arms.includes(m.source_arm)) wrongArm.push({ ...m, observed_arms: arms });
  }
  const armsSeeded = new Set((manifest || []).map((m) => m.source_arm));
  const unseededArms = (armList || []).filter((a) => !armsSeeded.has(a));
  return {
    ok: missing.length === 0 && unseededArms.length === 0 && wrongArm.length === 0,
    missing, unseededArms, wrongArm,
  };
}

/** Directional baseline: a recorded count may only GROW. A non-zero check cannot see a predicate error. */
export function checkBaselines(observed, baseline) {
  const regressions = [];
  for (const [arm, floor] of Object.entries(baseline || {})) {
    const got = (observed || {})[arm];
    if (!Number.isFinite(got) || got < floor) regressions.push({ arm, floor, got: got ?? null });
  }
  return { ok: regressions.length === 0, regressions };
}

export function reasonHistogram(rows) {
  const h = {};
  for (const r of rows || []) {
    if (r.verdict !== VERDICT.UNVERIFIABLE) continue;
    const k = r.reason || 'UNREASONED';
    h[k] = (h[k] || 0) + 1;
  }
  return h;
}

/** Non-zero when the audit found something a chairman must decide, or when a control failed. */
export function exitCodeFor(rows, controlsOk) {
  if (controlsOk === false) return 2;
  const actionable = (rows || []).some((r) =>
    r.verdict === VERDICT.NOT_APPLIED_BUT_COMPLETED || r.verdict === VERDICT.APPLIED_BUT_DIVERGENT);
  return actionable ? 1 : 0;
}
