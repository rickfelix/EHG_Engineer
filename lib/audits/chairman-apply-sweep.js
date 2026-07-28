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
  // ARMS 7-15: keys that were UNCONSUMED and each reach a member NO other arm reaches.
  // Every one was admitted by READING ITS VALUE, never by matching its name. A loose candidate
  // regex (chairman|apply|gate|authoriz|ddl) returned 188 keys and implied a 91% undercount — it
  // had swept in gate_exemptions (141 SDs), gate0_origin, lead_9q_gate and kill_gates, which are
  // LEO protocol gates with nothing to do with chairman authorisation. Tightening gave 16
  // candidates; reading their values left these 9 keys, which add 9 SDs (not 10).
  // CORRECTED after review: requires_chairman_ddl and chairman_gated_fence_20260726 BOTH point
  // only at SD-EHG-IDEATION-PIPELINE-SEAMS-001, so neither is sole-reach and dropping either
  // alone loses nothing. They are kept because either could outlive the other, but the
  // 'each reaches a member no other arm reaches' claim was FALSE for this pair.
  // DELIBERATELY EXCLUDED after reading: parked_chairman_gate (a workflow park pending a parent's
  // LEAD approval), chairman_gate_note and chairman_gate_reason (chairman REVIEW prose, no apply),
  // requires_chairman_runtime_gate (a runtime flag, not DDL), destructive_family_gated (a method
  // note on a sweep). Each names a chairman, none names an apply gate.
  'requires_chairman_ddl',
  'chairman_gated_ddl',
  'migration_requires_chairman_apply',
  'irreversible_exec_chairman_gated',
  'chairman_gated_fence_20260726',
  'chairman_gated_migration_possible',
  'apply_to_prod_requires_user_go',
  'chairman_enum_migration_authorization',
  'may_require_ddl',
  // ARMS 16-18, added after review caught them missing. These record an authorization GRANTED
  // rather than one PENDING, which makes them MORE in scope, not less: a granted authorization is
  // precisely an item that shipped under the gate, and whether what was applied matches what was
  // authorised is the whole question. Values read before admitting, as always:
  //   chairman_authorization -> SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 is the CHARTER of
  //     the gate being audited ("Adam may APPLY additive DB changes (CREATE TABLE/INDEX...)"), and
  //     DB-RETENTION-GOVERNANCE-AUDIT-LOG-001 authorises a destructive prune of ~598k rows.
  //   chairman_authorized -> SOURCING-ENGINE-ACTIVATION-001 authorises FR-1 additive migrations
  //     "to proceed via the governed apply path".
  //   chairman_preauthorization -> a conditional pre-authorised flip, void if verification fails.
  // Seven of chairman_authorized's ten values are a bare `true` naming no apply scope. They are
  // ADMITTED ANYWAY, because membership is KEY-PRESENCE and the value only picks a disposition —
  // excluding them here would be the exact "ruled out means never appears" error this file forbids.
  'chairman_authorized',
  'chairman_authorization',
  'chairman_preauthorization',
  // ARM 19, surfaced by the FR-7 detector on its FIRST run after three manual sweeps missed it.
  // Admitted on the DISCRIMINANT used throughout: at least one member's VALUE evidences an
  // apply — MIGRATION-DEPLOY-DRIFT-001 reads 'FR-1 apply ~9 genuine gaps ... retire ~106
  // legacy'. The other three are work approvals and ride as dispositions, because for an
  // audit whose failure direction is MISSING a real divergence, over-inclusion is the safe
  // side: it costs an UNVERIFIABLE row, where under-inclusion drops a chairman finding.
  'chairman_approval',
  // ARM 20. Once buildPopulation read PRD metadata this became REACHABLE, so the reason it was
  // briefly excluded no longer holds. Admitted on the key rather than the value: unlike
  // chairman_approved (generic approval, 10 bare `true` values, no member evidencing an apply),
  // `gated_ddl` names a gated DDL unambiguously in the key itself.
  'gated_ddl',
  'quick_fixes_freetext',
  'completion_flag_index',
]);

/**
 * FR-7 AC-3 — THE UNCONSUMED-KEY DETECTOR.
 *
 * Nothing else in this module can see a key that SHOULD be an arm. The baseline floors catch an arm
 * SHRINKING; the manifest catches a declared arm FAILING; neither can notice a gate recorded under
 * a name no arm reads. That blind spot cost two rounds of review here — the second time it hid
 * ADAM-DBCHANGE-APPLY-DELEGATION-001, the charter of the very gate being audited, from its own
 * audit — and the candidate regex existed only as prose, so completeness rested on an
 * unreproducible manual sweep. Encoded here so it is re-runnable and so drift is detectable.
 *
 * SOLE-REACH IS THE DISCRIMINANT. A key already covered by another arm loses nothing; a key with
 * sole-reach > 0 means the population is PROVABLY INCOMPLETE, which is a control failure rather
 * than a note, because the audit can no longer claim to have enumerated what it audits.
 * The only way to clear it is to DECIDE: admit the key, or record it in EXCLUDED_KEYS with a reason.
 */
/**
 * TWO INDEPENDENT SIGNALS, name-agnostic. The first version required the literal word "chairman"
 * plus a qualifier, with a hardcoded two-name escape hatch for keys naming no chairman. Review
 * supplied the decisive negative control: THAT RULE COULD NOT REDISCOVER `apply_authority` - a live
 * arm, 2 SDs, both access-control DDL, and a manifest seed. A detector that cannot re-find an arm
 * the audit already depends on cannot be trusted to find one it does not.
 *
 * The near-miss underneath it is worth keeping visible: the old qualifier was /authoriz/i, which
 * does NOT match "author-i-t-y". That one missing letter is the entire reason apply_authority was
 * unreachable - and I reproduced the identical bug in my first replacement rule before measuring it.
 *
 * Requiring TWO signals rejects one-signal noise (chairman_note, gate_exemptions, lead_9q_gate,
 * kill_gates, gate0_origin, chairman_priority, chairman_directed - all verified false) while
 * recovering every one of the 19 consumed arms, and needs no per-key escape list.
 */
export const UNCONSUMED_KEY_SIGNALS = Object.freeze([
  /apply/i, /gate/i, /author/i, /(^|_)ddl(_|$)/i, /migration/i, /approv/i, /chairman/i, /require/i,
]);

/**
 * Excluded after READING THE VALUE, never by name. Each names a chairman; none names an apply gate.
 * Recorded here rather than in prose so an exclusion is reviewable and so re-admitting one is a
 * visible diff rather than a silent widening.
 */
export const EXCLUDED_KEYS = Object.freeze({
  parked_chairman_gate: 'a workflow park pending a PARENT SD LEAD approval, not a DDL apply',
  chairman_gate_note: 'chairman REVIEW prose (source-of-truth rulings, digest wording) — no apply',
  chairman_gate_reason: 'a chairman decision record (ownership/credential model) — no apply',
  requires_chairman_runtime_gate: 'a runtime feature flag, not DDL',
  destructive_family_gated: 'a method note on a code sweep, not an authorisation',
  chairman_approved: 'SD-level approval of the WORK (all 9 values are a bare true on feature SDs); NO member evidences a DDL apply — the discriminant that admitted chairman_approval',
  chairman_amendment_2026_07_28_consult_gate: 'a process directive about consulting Solomon during work selection',
  chairman_decision_2026_06_13_gate_posture: 'a gate-POSTURE decision (BALANCED), not an apply of anything',
  // Surfaced by the widened two-signal detector. Values read; none evidences a chairman-gated
  // APPLY. Recorded individually rather than by pattern so each is reviewable and re-admitting one
  // is a visible diff.
  chairman_decision_required: 'chairman DECISIONS about work routing ("approved foundation-SD route", "directed proceed", "blessed") - no apply',
  requires_chairman_visibility: 'a visibility flag; the chairman is told, not asked to apply',
  chairman_awareness_required: 'same class as visibility - awareness, not authorisation',
  chairman_authoritative: 'a verbatim chairman intent quote about queue routing - no apply',
  chairman_authorized_via: 'a POINTER to how an authorisation was given ("advisory 44330add"); names no object and no apply. Weakest of these exclusions - revisit if the pointer target is ever resolved.',
  chairman_supplied_params_required: 'the chairman must supply parameters, not apply anything',
  chairman_gated_items: 'genuinely chairman-gated, but the items are LEGAL/BUSINESS actions (LLC formation, live Stripe account, sk_live_ provisioning) - not database applies. In scope for a chairman-gate audit generally; OUT of scope for THIS one, which audits what was applied to the database.',
  requires_migration: 'a migration-TRACKING flag (true/false/a .sql filename). Names no authority and no chairman - it says a migration is needed, not that anyone gated it.',
  migration_required: 'same class as requires_migration, on a PRD',
  requires_db_migration: 'same class as requires_migration',
});

/**
 * GAPS THAT ARE NOT EXCLUSIONS. EXCLUDED_KEYS means "read the value, it is not an apply gate".
 * These are the opposite: real apply gates the population CANNOT REACH for a structural reason.
 * Keeping them in EXCLUDED_KEYS would let a genuine miss inherit the credibility of a decision.
 */
export const KNOWN_SCOPE_GAPS = Object.freeze({
  prd_and_feedback_borne_gates: {
    where: 'product_requirements_v2 and feedback metadata',
    why_unreachable: 'buildPopulation reads strategic_directives_v2 metadata only, so a gate recorded on any other row type cannot be admitted no matter which arm names it.',
    to_close: 'extend buildPopulation to accept PRD and feedback rows as metadata sources, the way quick_fixes and feedback free-text already are.',
    how_it_is_counted: 'DERIVED at runtime from findUnconsumedKeys().unreachableMembers, never a hardcoded number. The first version of this export hardcoded "1 row" and named gated_ddl — a bare `true` naming no object — while the measured class was 11 and included the audit OWN FLAGSHIP RLS case, whose .sql artifact lives on the PRD row while the SD row reports NO_ARTIFACT. A heading that asserts a class and names its least significant member is this SD own thesis turned on its deliverable.',
  },
});

export function isUnconsumedKeyCandidate(key) {
  if (typeof key !== 'string') return false;
  let n = 0;
  for (const re of UNCONSUMED_KEY_SIGNALS) if (re.test(key)) n += 1;
  return n >= 2;
}

/**
 * @param rows            [{ identifier, metadata }] — every SD, not only current members
 * @param populationArms  the arms currently consumed
 * `rows` may span SOURCES - a gate recorded on a PRD or a feedback row is the same gate on a
 * different row type, and scanning only strategic_directives_v2 made those structurally invisible.
 * WHAT ok=false MEANS: sole-reach > 0 PROVES the population is incomplete. The converse does NOT
 * hold - ok=true is not a completeness certificate, only "this rule found nothing".
 * @returns { ok, findings } where a finding is { key, members, soleReach, sources } and soleReach counts
 *          items NO consumed arm reaches. ok is false iff some finding has soleReach > 0.
 */
export function findUnconsumedKeys(rows, populationArms, excluded = EXCLUDED_KEYS, populationIds = null) {
  const arms = new Set(populationArms || []);
  // THE REAL population when the caller supplies it. Recomputing it from the scan rows was the
  // SEC-24 defect: carrying an arm key is not the same as BEING REACHED by that arm, and once the
  // scan spanned tables the population cannot read, the two diverged silently.
  const known = populationIds ? new Set(populationIds) : null;
  const inPopulation = new Set();
  const unreachableMembers = [];
  for (const r of rows || []) {
    const md = (r && r.metadata) || {};
    let carriesArm = false;
    for (const a of arms) {
      if (Object.prototype.hasOwnProperty.call(md, a)) { carriesArm = true; break; }
    }
    if (!carriesArm) continue;
    if (known && !known.has(r.identifier)) {
      // Carries a CONSUMED arm key and yet no arm reaches it. The consumed-key skip below means
      // this row can never surface as an unconsumed-key finding, so without this it is invisible
      // in exactly the way that looks like coverage.
      unreachableMembers.push({
        identifier: r.identifier,
        source: (r && r.source) || 'unknown',
        arms: [...arms].filter((a) => Object.prototype.hasOwnProperty.call(md, a)),
      });
      continue;
    }
    inPopulation.add(r.identifier);
  }
  const byKey = new Map();
  for (const r of rows || []) {
    const md = (r && r.metadata) || {};
    for (const key of Object.keys(md)) {
      if (arms.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(excluded || {}, key)) continue;
      if (!isUnconsumedKeyCandidate(key)) continue;
      if (!byKey.has(key)) byKey.set(key, { key, members: 0, soleReach: 0, sources: [] });
      const f = byKey.get(key);
      f.members += 1;
      const src = (r && r.source) || 'strategic_directives_v2';
      if (!f.sources.includes(src)) f.sources.push(src);
      if (!inPopulation.has(r.identifier)) f.soleReach += 1;
    }
  }
  const findings = [...byKey.values()].sort((a, b) => b.soleReach - a.soleReach || a.key.localeCompare(b.key));
  return {
    ok: !findings.some((f) => f.soleReach > 0) && unreachableMembers.length === 0,
    findings,
    unreachableMembers,
  };
}

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
  if (e.approval && e.approval.namesObjects === true && e.approval.provenanceIndependent === true) n += 1;
  if (e.artifact && e.artifact.present === true) n += 1;
  if (e.live && e.live.probed === true) n += 1;
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
/**
 * SEC-11 NOTE — the three gating fields are compared `=== true`, never for truthiness, and this is
 * not defensive style. `namesObjects` is ALSO the name of an exported FUNCTION in this file that
 * returns `{named, identifiers}`. An author writing the natural `namesObjects: namesObjects(text)`
 * hands this a truthy OBJECT, and under truthiness an approval naming NOTHING reached APPLIED with
 * all three inputs disclosed as present — the per-row disclosure built to stop a two-input row
 * reading as triangulated would have actively corroborated it. Same for a prober recording
 * `probed:'timeout'`, which is the one field FR-4 is guaranteed to write.
 * The file states the rule at inputsOf: a field that ENABLES a stronger claim is `=== true`. It had
 * been applied to provenanceIndependent, declaresMoreThanArtifact and surplus — and not to the
 * FOUR fields that actually gate a verdict. secondaryArtifactSearchDone was missed even by the
 * first sweep of this note, and it is the worst of them: NEVER_BOUND is exit-0 AND excluded from
 * reasonHistogram, so a non-boolean there silently drops the row out of the remediation backlog.
 */
export function classifyItem(evidence) {
  const e = evidence || {};

  // NEVER-BOUND is the ABSENCE of the control, reported separately from UNVERIFIABLE. Only after
  // the secondary check of PRD/retrospective/commit text — metadata absence alone is insufficient.
  if (e.artifact?.present !== true && e.secondaryArtifactSearchDone === true && e.secondaryArtifactFound !== true) {
    return { verdict: VERDICT.NEVER_BOUND, reason: null, inputs: inputsOf(e) };
  }
  if (e.artifact?.present !== true) {
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.NO_ARTIFACT, inputs: inputsOf(e) };
  }
  // A class the only file-level verifier cannot see (POLICY, GRANT/REVOKE, ENABLE RLS,
  // ALTER FUNCTION SET search_path) must be probed directly or reported unprobeable — never
  // inferred from a verifier that has no such class and fails open toward APPLIED.
  if (e.live?.probed !== true) {
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.CLASS_UNPROBEABLE, inputs: inputsOf(e) };
  }

  // AGREEMENT OVER AN EMPTY SET IS NOT AGREEMENT. approval.identifiers is the probe target list,
  // and ~81% of harvested targets name no real relation (JSON keys and filenames read as objects).
  // A prober that resolves them, finds zero, and compares [] to [] would set matchesArtifact true
  // and reach APPLIED having checked nothing. classifyItem never read identifiers at all, so the
  // emptiness was invisible to the verdict. A vacuous match is now UNVERIFIABLE, never APPLIED.
  // filter(Boolean), not length: the modal prober is identifiers.map(id => lookup(id)), which emits
  // [null x N] when nothing resolves — and ~81% of harvested targets resolve to nothing, so the
  // all-null array is the EXPECTED shape for the majority case this guard exists to reject.
  // A resolved database object is never falsy, so filtering costs no false negative.
  const probedObjectCount = Array.isArray(e.live?.resolvedObjects)
    ? e.live.resolvedObjects.filter(Boolean).length
    : null;
  const vacuousMatch = e.live?.probed === true && !(probedObjectCount > 0);

  const agree = e.live.matchesArtifact === true;
  const approvalNamesObjects = e.approval?.namesObjects === true;
  // Unknown provenance is NOT independence — see independentInputCount.
  const provenanceKnown = e.approval?.provenanceIndependent === true;
  const hasApproval = approvalNamesObjects && provenanceKnown;

  if (vacuousMatch) {
    // Placed BEFORE the disagreement branch, not only before the approval check: a probe that
    // resolved zero objects is uninformative about agreement AND about disagreement.
    return { verdict: VERDICT.UNVERIFIABLE, reason: UNVERIFIABLE_REASON.CLASS_UNPROBEABLE, inputs: inputsOf(e) };
  }
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
  // The previous invariant here recomputed the same three predicates the guards above had already
  // proven, so it could never fire — a dead check three lines under the comment explaining why dead
  // checks are bad. This one asserts something the guards do NOT establish: that APPLIED was reached
  // having actually resolved at least one object.
  const inputCount = independentInputCount(e);
  if (inputCount !== 3 || !(probedObjectCount > 0)) {
    // Asserts what the guards above do NOT establish: that all three inputs were counted by the
    // SAME predicates the verdict used, and that at least one object was actually resolved.
    // The previous invariant recomputed only what the guards had already proven, so it could never
    // fire; replacing it then orphaned independentInputCount entirely, leaving its three `=== true`
    // predicates unmutatable. Both halves are now load-bearing on the reachable path.
    throw new Error(
      `classifyItem invariant violated: APPLIED with ${inputCount} inputs, ${probedObjectCount} objects`);
  }
  return { verdict: VERDICT.APPLIED, reason: null, inputs: inputsOf(e) };
}

/** Per-row input disclosure, so a two-input row reads as bounded rather than triangulated. */
function inputsOf(e) {
  return {
    approval: e.approval?.namesObjects === true && e.approval?.provenanceIndependent === true,
    artifact: e.artifact?.present === true,
    live: e.live?.probed === true,
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
    // A bare id carries no arm claim, so it is recorded as UNKNOWN and reported as a control
    // failure below. Accepting the shape without checking it is what made the old version silently
    // identifier-only.
    if (typeof p === 'string') byId.set(p, null);
    else if (p && p.identifier) byId.set(p.identifier, Array.isArray(p.arms) ? p.arms : null);
  }
  const missing = [];
  const wrongArm = [];
  const armsUnknown = [];
  for (const m of manifest || []) {
    if (!byId.has(m.identifier)) { missing.push(m); continue; }
    const arms = byId.get(m.identifier);
    if (arms === null) {
      // A caller that passed bare ids (or rows without `arms`) CANNOT have its arm claim checked.
      // That is a control failure, not a pass. The previous version skipped silently while the
      // comment above claimed it failed loudly, so one `population.map(p => p.identifier)`
      // simplification would have turned the whole arm-aware upgrade off with controls_ok true —
      // the exact defect this function was rewritten to close, recurring inside its own fix.
      armsUnknown.push(m);
      continue;
    }
    if (!arms.includes(m.source_arm)) wrongArm.push({ ...m, observed_arms: arms });
  }
  const armsSeeded = new Set((manifest || []).map((m) => m.source_arm));
  const unseededArms = (armList || []).filter((a) => !armsSeeded.has(a));
  return {
    ok: missing.length === 0 && unseededArms.length === 0
        && wrongArm.length === 0 && armsUnknown.length === 0,
    missing, unseededArms, wrongArm, armsUnknown,
  };
}

/** Directional baseline: a recorded count may only GROW. A non-zero check cannot see a predicate error. */
export function checkBaselines(observed, baseline, armList) {
  const regressions = [];
  for (const [arm, floor] of Object.entries(baseline || {})) {
    const got = (observed || {})[arm];
    if (!Number.isFinite(got) || got < floor) regressions.push({ arm, floor, got: got ?? null });
  }
  // RECONCILE THE FLOOR SET AGAINST THE ARM SET. This function only walks the floors it is GIVEN,
  // so deleting a floor deletes a check and reports as a pass — an arm with no floor could collapse
  // to zero with ok:true. Passing armList makes the absence itself a finding. Lives here rather
  // than in the caller because in the caller it was correct but unmutatable, which is how the gap
  // survived a mutation sweep that flagged everything around it.
  const armsWithoutFloor = (armList || []).filter((a) => !(a in (baseline || {})));
  return {
    ok: regressions.length === 0 && armsWithoutFloor.length === 0,
    regressions,
    armsWithoutFloor,
  };
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
