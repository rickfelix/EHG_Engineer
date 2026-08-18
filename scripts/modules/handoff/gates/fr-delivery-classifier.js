/**
 * FR Delivery Classifier — shared per-FR delivery status for completion gates.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001, repaired by SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * Single source of truth used by BOTH the LEAD-FINAL FR_DELIVERY_VERIFICATION gate
 * and the EXEC-TO-PLAN FR_DELIVERY_TRACEABILITY gate. Reads the AUTHORITATIVE FR list
 * (product_requirements_v2.functional_requirements) and classifies each FR:
 *   - DELIVERED : a validated/completed user_story REFERENCES the FR id (title / user_want /
 *                 acceptance_criteria / technical_notes). This is real per-FR mapping, NOT the
 *                 prior any-completed-story-marks-all-FRs proxy.
 *   - DESCOPED  : the SD has an APPROVER-GATED descope record for the FR
 *                 (strategic_directives_v2.metadata.descoped_frs[].approved_by non-empty and
 *                 != the requester).
 *   - UNVERIFIABLE: the FR-reference convention is not in use for THIS SD at all, so no
 *                 instrument here could have observed delivery either way. Decided PER-SD,
 *                 never per-FR — see below.
 *   - UNDELIVERED: the convention IS in use for this SD and this FR still has no reference.
 *
 * WHY UNVERIFIABLE EXISTS (SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001, "green-where-blind").
 * Measured on 60 recent completed SDs (55 with FRs): 45 classified at 0% satisfied and only
 * 4 at 100%, because the healthy story-generation path never writes an FR id into story text
 * (it lands in ~a fifth of rows only via a degenerate fallback branch). Collapsing that into
 * UNDELIVERED asserts "we looked and it is absent" when the truth is "no instrument here could
 * have seen it" — and the old warn-only projection then reported score 100 anyway, so the
 * blindness was invisible. Separating the two states is what makes an UNDELIVERED verdict mean
 * something: it is only reachable when this SD demonstrably uses the convention.
 *
 * REJECTED ALTERNATIVE — positional story_key linkage. story_key is minted as SDKEY:US-NNN by
 * every generator iterating functional_requirements in array order, and the correspondence is
 * real (49/49 SDs-with-stories have contiguous 1..N ordinals). It must NOT be used as a delivery
 * signal: executed against the specimen it returns 6/6 DELIVERED, including the two FRs that
 * SD's own metadata.scope_completion_annotation records as not delivered, and population-wide it
 * flips 45/55 SDs from 0% to 100%. Its only live discriminant is whether the generator minted a
 * story at that ordinal — decided at PLAN time, before any code exists — so it measures generator
 * output completeness and reports it as delivery. It converts a false 0 into a false 100.
 *
 * Enforcement is gated by LEO_FR_TRACEABILITY_ENFORCE (default OFF = warn-only). The flag governs
 * BLOCKING ONLY (passed / required) — it never changes the REPORTED SCORE. A gate that reports a
 * number it did not measure is the defect this module was repaired to remove.
 */
import { specFileExists } from '../../../../lib/stories/e2e-path-guard.js';

/** True when strict FR-delivery enforcement is turned on. Default OFF (warn-only). */
export function isFrTraceabilityEnforced(env = process.env) {
  const v = env.LEO_FR_TRACEABILITY_ENFORCE;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

/**
 * Ceiling on the UNVERIFIABLE state, as a fraction (0..1) of an SD's FRs.
 *
 * Shipped on day one deliberately. The precedent is the WAIT verdict, which needed
 * WAIT_MAX_ATTEMPTS and a 24h wall clock retrofitted (ValidationOrchestrator.js) after an
 * open-ended non-failing state had already become a permanent escape hatch. An uncapped
 * UNVERIFIABLE would just be warn-only under a new name.
 *
 * Default 1.0 = a fully-unverifiable SD is tolerated but always reported as such and always
 * scored honestly. Lowering it (e.g. 0.5) is how the fleet ratchets the unmeasurable population
 * down once story->FR linkage is actually recorded.
 */
export function frUnverifiableCeiling(env = process.env) {
  const raw = env.LEO_FR_UNVERIFIABLE_CEILING;
  if (raw == null || String(raw).trim() === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 1;
  return n;
}

/**
 * The score a gate reports when it could not measure delivery at all (no PRD, no FRs, an
 * orchestrator parent delegating to children, or a validator that threw). NOT 100: a
 * non-measurement must never be arithmetically indistinguishable from a verified full delivery,
 * because the composite handoff score is an unweighted mean that cannot tell them apart.
 */
export const NOT_MEASURED_SCORE = 75;

/**
 * The score a gate reports when its own validator THREW and the failure was swallowed to stay
 * non-blocking in warn-only mode. Distinct from — and lower than — NOT_MEASURED_SCORE: "there
 * was nothing to measure" and "the instrument broke" are different conditions and must not
 * share a number. Previously both of these, and a verified full delivery, all reported 100.
 */
export const ERRORED_SCORE = 50;

/** Stable FR id for an FR entry (falls back to FR-<n> by 1-based index). */
export function frIdOf(fr, index) {
  return (fr && (fr.id || fr.fr_id)) || `FR-${index + 1}`;
}

/**
 * Pure: does this user story reference the given FR id in any of its text fields?
 * Uses a word-boundary match on the exact FR id (e.g. "FR-004") so "FR-04" / "FR-0040"
 * do not false-match.
 */
export function frReferencesId(story, frId) {
  if (!story || !frId) return false;
  const esc = String(frId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\w-])${esc}([^\\w-]|$)`, 'i');
  const fields = [];
  const push = (v) => { if (v == null) return; fields.push(typeof v === 'string' ? v : JSON.stringify(v)); };
  push(story.title);
  push(story.user_want);
  push(story.acceptance_criteria);
  push(story.technical_notes);
  return fields.some((f) => re.test(f));
}

/** A story counts as a delivery signal only when it is validated/completed. */
export function isValidatedStory(story) {
  const s = (story && story.status) || '';
  const vs = (story && story.validation_status) || '';
  return s === 'completed' || s === 'done' || s === 'validated' || vs === 'validated';
}

/** Approver-gated descope lookup for an FR id. requesterSessionId is excluded as a self-approver. */
export function descopeFor(sdMetadata, frId, requesterSessionId = null) {
  const list = (sdMetadata && Array.isArray(sdMetadata.descoped_frs)) ? sdMetadata.descoped_frs : [];
  // QF-20260816-923: requesterSessionId was null on every production handoff (BaseExecutor's
  // validationContext never set it), so the self-approval check below never even ran — a
  // worker could descope an FR "approved" by itself with no guard firing at all. Now that
  // sessionId is threaded through, warn loudly on the identity-unknown case rather than
  // silently trusting it, so a caller that still can't identify itself is visible in logs.
  if (!requesterSessionId) {
    console.warn('[fr-delivery-classifier] descopeFor: requesterSessionId is unknown — the self-approval guard cannot run for this check');
  }
  return list.find((d) => {
    if (!d || (d.fr_id !== frId && d.id !== frId)) return false;
    const approver = typeof d.approved_by === 'string' ? d.approved_by.trim() : '';
    if (!approver) return false;                        // descope without a named approver is ignored
    if (requesterSessionId && approver === requesterSessionId) return false; // no self-approval
    return true;
  }) || null;
}

/**
 * SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 — a second, TESTING-evidence-backed delivery
 * signal for SD types (e.g. infrastructure) that are not required to have user stories, so the
 * story-only signal above structurally never fires and every FR reads UNVERIFIABLE by
 * construction. Two independently-measured, iteratively-corrected design constraints (see the
 * prospective TESTING evidence rows referenced in this SD's PRD, product_requirements_v2 id
 * PRD-SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001, for the full derivation):
 *   1. A regex scan of TESTING evidence PROSE is a CLAIM, not proof — LEAD-phase evidence
 *      commonly names an FR to flag RISK, not to confirm delivery. Measured: promoting on that
 *      regex would falsely mark 9/16 currently-blind infra SDs as 100% delivered. It stays a
 *      report-only diagnostic (regexFrMentions below), never consulted for delivery, phase, or
 *      conventionInUse.
 *   2. The only delivery-promoting testing signal is a STRUCTURED, schema-valid,
 *      fr_id-MATCHED, phase-admitted metadata.fr_coverage entry. "Schema-valid" alone is not
 *      enough (a valid-shaped entry can still name a nonexistent FR); "a row exists" alone is
 *      not enough (74% of FR-carrying SDs have >=1 TESTING row at every handoff regardless of
 *      whether it says anything about FR coverage) — both were tried and both let one row
 *      silently swing every OTHER FR's classification, measured at 3/50 real SDs flipping
 *      undelivered (blocks under enforcement) to unverifiable (never blocks, default ceiling
 *      1.0). Only genuinely matched entries count toward hasWorkProduct/conventionInUse.
 */

/**
 * Real, live-measured phase-column values for sub_agent_execution_results (see PRD TR-2/TR-6
 * for the census methodology and exact counts, which drift as the population grows — re-measure
 * at implementation/maintenance time rather than trust this list as eternally exhaustive).
 * Normalized comparison (uppercase, hyphens->underscores) collapses spelling variants like
 * "EXEC-TO-PLAN" / "EXEC_TO_PLAN" and "LEAD-FINAL-APPROVAL" / "LEAD_FINAL_APPROVAL".
 */
const EXEC_OR_LATER_PHASES = new Set([
  'EXEC', 'EXEC_TO_PLAN', 'PLAN_TO_LEAD', 'LEAD_FINAL_APPROVAL',
  'COMPLETED', 'PLAN_VERIFY', 'PLAN_VERIFICATION', 'EXEC_IMPLEMENTATION', 'EXEC_COMPLETE',
  'ORCHESTRATED',
]);
const PRE_EXEC_PHASES = new Set(['LEAD', 'PLAN', 'PLAN_TO_EXEC', 'DRAFT']);

function normalizePhase(phase) {
  return String(phase ?? '').trim().toUpperCase().replace(/-/g, '_');
}

/**
 * Three-way classification: 'admitted' (EXEC-or-later, matched signal may promote),
 * 'rejected' (known pre-EXEC), or 'unrecognized' (matches neither list — a real, growing
 * population, e.g. "PLAN_PRD"; treated as rejected for promotion purposes, per isExecPhaseOrLater,
 * but tracked separately so drift in phase-naming is visible rather than a silent permanent gap).
 */
export function classifyPhaseBucket(phase) {
  const n = normalizePhase(phase);
  if (EXEC_OR_LATER_PHASES.has(n)) return 'admitted';
  if (PRE_EXEC_PHASES.has(n)) return 'rejected';
  return 'unrecognized';
}

/** Strict boolean: true ONLY for the 'admitted' bucket. 'unrecognized' fails closed. */
export function isExecPhaseOrLater(phase) {
  return classifyPhaseBucket(phase) === 'admitted';
}

/**
 * Pure: does this fr_coverage entry have the required shape
 * {fr_id: string, status: 'delivered'|'undelivered', test_ref: non-empty string}?
 * Any deviation (wrong type, missing field, unrecognized status) is treated as absent, never
 * partially trusted — fr_coverage already exists as an uncoordinated ad-hoc metadata key in
 * numerous unrelated one-off scripts using several mutually-incompatible shapes.
 *
 * This function checks SHAPE only. test_ref's EXISTENCE on disk is checked separately by
 * testRefResolvesToRealFile() (see below) in resolveTestingEvidenceCoverage() — kept as two
 * deliberately separate arms, same split e2e-path-guard.js itself uses (existence is decidable;
 * anything about a passing RUN is not verified here or there — no attempt is made to re-execute
 * the referenced test, only to confirm it exists).
 */
function isWellFormedCoverageEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.fr_id !== 'string' || entry.fr_id.trim() === '') return false;
  if (entry.status !== 'delivered' && entry.status !== 'undelivered') return false;
  if (typeof entry.test_ref !== 'string' || entry.test_ref.trim() === '') return false;
  return true;
}

/** Normalized fr_id match, consistent with frReferencesId()'s case-insensitivity — no padding equivalence (FR-1 !== FR-001), matching frReferencesId's own word-boundary behavior. */
function frIdsMatch(a, b) {
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/**
 * SECURITY finding 2 (EXEC-phase review): does this test_ref actually name a file that exists?
 * Strips a trailing :LINE or :LINE:COL suffix (this field's own documented convention, e.g.
 * "tests/foo.test.js:42") before delegating to the existing specFileExists() choke-point
 * (lib/stories/e2e-path-guard.js) — reused rather than reinvented, since the SAME TESTING
 * sub-agent already has an analogous self-reported field (e2e_test_path) verified there, built
 * after measuring a 46.1% fabrication rate on that field. Existence only, same as its source:
 * this does not confirm the file is a real test, or that it ever passed — only that it exists.
 *
 * THIS IS A FABRICATION GUARD, NOT AN ANTI-FORGERY CONTROL (confirmed across 3 rounds of
 * independent SECURITY review). It takes an accidental/hallucinated test_ref from free to
 * impossible — the problem e2e-path-guard.js was built to close, and the problem this signal
 * exists to close too. As of round 5 (see resolveTestingEvidenceCoverage's expectedRepoRoots)
 * the ROOT can no longer be forged — it comes exclusively from this SD's registered
 * applications.local_path, never from anything the TESTING sub-agent writes. A writer can
 * therefore no longer satisfy this check by naming an arbitrary host file (repo_path='C:/',
 * test_ref='Windows/win.ini' is impossible now); it can only name a file that genuinely exists
 * within the CORRECT repo. That is still not proof the named file is a real test for THIS FR,
 * or that it passed — a writer can still name any real, unrelated file within the right repo.
 * Never cite this signal as resisting a compromised TESTING agent's DELIVERY CLAIM in general —
 * a compromised agent can already assert delivered outright without naming a file at all; this
 * check only closes the narrower "the referenced file doesn't exist" failure mode.
 */
function testRefResolvesToRealFile(testRef, { repoRoot = process.cwd(), existsSync } = {}) {
  if (typeof testRef !== 'string') return false;
  const stripped = testRef.trim().replace(/:\d+(:\d+)?$/, '');
  return specFileExists(repoRoot, stripped, existsSync ? { existsSync } : {});
}

/**
 * Scans TESTING evidence text for FR-id mentions across ALL phases (deliberately NOT
 * phase-filtered — this is the report-only diagnostic; filtering it would hide exactly the
 * LEAD-phase risk-flagging mentions it exists to surface, and would make a mutation test of its
 * non-load-bearing-ness unreachable for non-EXEC-phase fixtures). Excludes metadata.fr_coverage
 * itself from the scan surface so a fr_coverage entry's own fr_id never trivially echoes into
 * this diagnostic (which would defeat its purpose of finding FRs named in prose but ABSENT from
 * fr_coverage).
 */
export function extractRegexFrMentions(rows, frs) {
  const mentions = [];
  for (const row of rows) {
    const metadataWithoutCoverage = row?.metadata && typeof row.metadata === 'object'
      ? Object.fromEntries(Object.entries(row.metadata).filter(([k]) => k !== 'fr_coverage'))
      : {};
    // SECURITY finding 1 (EXEC-phase review): JSON.stringify throws RangeError on
    // pathologically deep input (measured: JSON.parse tolerates >=200,000 levels,
    // JSON.stringify throws at ~5,000) while this function's own contract is report-only and
    // must never be able to break a gate it isn't allowed to influence -- degrade to '' rather
    // than let a malformed metadata blob propagate an exception out of a diagnostic scan.
    let metadataText = '';
    try { metadataText = JSON.stringify(metadataWithoutCoverage); } catch { /* degrade to '' */ }
    const textParts = [row?.detailed_analysis, row?.summary, row?.raw_output, metadataText]
      .filter((v) => v != null)
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
    const haystack = textParts.join('\n');
    for (let i = 0; i < frs.length; i++) {
      const id = frIdOf(frs[i], i);
      if (frReferencesId({ title: haystack }, id)) {
        mentions.push({ fr_id: id, sub_agent_result_id: row?.id ?? null, phase: row?.phase ?? null });
      }
    }
  }
  return mentions;
}

// SECURITY finding 3 (EXEC-phase review): a single malicious row's fr_coverage array can be
// arbitrarily long, and unmatchedFrCoverageIds/unresolvedTestRefs previously grew unbounded with
// it (measured: 200k unmatched entries produced a 3.29MB details blob, parameterized-insert-safe
// but still an unbounded storage cost into validation_details.gate_results). Diagnostic-only
// arrays are capped; capping never affects delivered/undelivered/unverifiable scoring, which
// never reads array length. Keeps the FIRST 50 entries encountered and drops the rest (NOT a
// FIFO/rolling window — which entries survive doesn't matter for a diagnostic-only field, but
// the mechanism is worth naming correctly). Same 50-entry bound already used elsewhere in this
// codebase for an analogous diagnostic array (issue_patterns.metadata.filter_log[]).
const MAX_DIAGNOSTIC_ENTRIES = 50;

/**
 * Resolves the structured testing_evidence signal from TESTING sub_agent_execution_results rows
 * already fetched for this SD. Returns matched (schema-valid, fr_id-matched, AND test_ref
 * disk-verified) entries plus diagnostics for everything that did NOT make it into the
 * promoting set, so "the writer never fired" stays distinguishable from "the writer fired but
 * nothing was valid".
 *
 * @param {Array} rows — row.metadata.repo_path is NEVER read here (SECURITY finding, round 5:
 *   it is writer-controlled, so even gating it on "compliant" left the remaining ~24% of
 *   non-compliant rows falling back to cwd, reopening the exact cross-repo false-promote this
 *   exists to prevent, and it went stale the moment a worktree source was cleaned up). The
 *   trusted root instead comes exclusively from expectedRepoRoots (below) — an
 *   infrastructure-controlled value the writer cannot influence at all.
 * @param {Array} frs
 * @param {{repoRoot?: string, existsSync?: Function}} [fsDeps] — injectable for tests. If
 *   fsDeps.repoRoot is explicitly set it is used for EVERY row (test determinism).
 * @param {Map<string, string>} [expectedRepoRoots] — row id -> this SD's registered
 *   applications.local_path (v_sub_agent_repo_compliance.expected_repo_path, CLAUDE.md prologue
 *   #11's SUB_AGENT_REPO_RESOLUTION contract), used when fsDeps.repoRoot is not explicitly set.
 *   A row with NEITHER an fsDeps override NOR a map entry (an unregistered/unknown_application
 *   SD, ~0.7% measured) has no root this classifier can trust — every entry on that row is
 *   treated as unresolved WITHOUT ever calling the filesystem, deliberately not falling back to
 *   cwd (that fallback is exactly how the writer-controlled-root class re-opens).
 */
export function resolveTestingEvidenceCoverage(rows, frs, fsDeps = {}, expectedRepoRoots = new Map()) {
  const matchedTestingCoverage = [];
  const unmatchedFrCoverageIds = [];
  const unresolvedTestRefs = [];
  const unrecognizedPhaseRows = [];
  const rejectedPhaseRows = [];
  let testingEvidenceRowsSeen = 0;

  for (const row of rows) {
    const bucket = classifyPhaseBucket(row?.phase);
    if (bucket === 'unrecognized') {
      unrecognizedPhaseRows.push({ sub_agent_result_id: row?.id ?? null, phase: row?.phase ?? null });
      continue; // fails closed, same as 'rejected' — tracked separately for visibility only
    }
    if (bucket === 'rejected') {
      // A misconfigured writer firing at a known pre-EXEC phase would otherwise be
      // byte-identical to no TESTING evidence existing at all — this keeps "the writer fired
      // at the wrong phase" distinguishable from "the writer never fired", the same
      // distinction unrecognizedPhaseRows exists to make for the unrecognized bucket.
      rejectedPhaseRows.push({ sub_agent_result_id: row?.id ?? null, phase: row?.phase ?? null });
      continue;
    }
    testingEvidenceRowsSeen += 1;

    const coverage = row?.metadata?.fr_coverage;
    if (!Array.isArray(coverage)) continue; // wrong type entirely (incl. bare scalar strings) — absent, not iterated

    // SECURITY finding (round 5, closing rounds 2-4's remaining gap): the root comes ONLY from
    // an explicit test override or the infrastructure-controlled expectedRepoRoots map — never
    // from the row's own metadata.repo_path, which a writer with fr_coverage write access can
    // always influence (directly, or by the field simply going stale once a worktree source is
    // cleaned up). No override and no map entry means no trustworthy root exists for this row;
    // canResolve short-circuits every entry on it to unresolved before testRefResolvesToRealFile
    // is ever called, so there is no path back to a cwd default.
    const hasOverride = fsDeps.repoRoot !== undefined;
    const rowRepoRoot = hasOverride ? fsDeps.repoRoot : expectedRepoRoots.get(row?.id);
    const canResolve = hasOverride || rowRepoRoot != null;
    const rowFsDeps = { ...fsDeps, repoRoot: rowRepoRoot };

    for (const entry of coverage) {
      if (!isWellFormedCoverageEntry(entry)) continue;
      const matchIndex = frs.findIndex((fr, i) => frIdsMatch(frIdOf(fr, i), entry.fr_id));
      if (matchIndex === -1) {
        if (unmatchedFrCoverageIds.length < MAX_DIAGNOSTIC_ENTRIES) unmatchedFrCoverageIds.push(entry.fr_id);
        continue;
      }
      // SECURITY finding 2: test_ref was previously shape-checked only (any non-empty string
      // promoted). The SAME TESTING sub-agent already has an analogous self-reported field
      // (user_stories.e2e_test_path) disk-verified at lib/stories/e2e-path-guard.js, built
      // after measuring 641/1390 rows (46.1%) claiming a passing status for a file that does
      // not exist. Reusing that exact primitive rather than trusting test_ref as-is.
      if (!canResolve || !testRefResolvesToRealFile(entry.test_ref, rowFsDeps)) {
        if (unresolvedTestRefs.length < MAX_DIAGNOSTIC_ENTRIES) {
          unresolvedTestRefs.push({ fr_id: frIdOf(frs[matchIndex], matchIndex), test_ref: entry.test_ref, sub_agent_result_id: row?.id ?? null });
        }
        continue;
      }
      matchedTestingCoverage.push({
        fr_id: frIdOf(frs[matchIndex], matchIndex),
        status: entry.status,
        test_ref: entry.test_ref,
        sub_agent_result_id: row?.id ?? null,
      });
    }
  }

  return {
    matchedTestingCoverage, unmatchedFrCoverageIds, unresolvedTestRefs, unrecognizedPhaseRows, rejectedPhaseRows, testingEvidenceRowsSeen,
  };
}

/**
 * Classify every FR for an SD. Injectable supabase for testing.
 * @param {object} [opts]
 * @param {{repoRoot?: string, existsSync?: Function}} [opts.fsDeps] — injectable for tests; a
 *   test_ref's on-disk existence is checked against this (defaults to the real filesystem).
 * @returns {Promise<{frs: Array<{id,description,status:'delivered'|'descoped'|'undelivered',evidence}>,
 *   total:number, delivered:number, descoped:number, undelivered:number}>}
 */
export async function classifyFrDelivery(supabase, {
  sdId, directiveId = null, sdMetadata = {}, functionalRequirements = null, requesterSessionId = null, fsDeps = {},
} = {}) {
  let frs = functionalRequirements;
  if (!Array.isArray(frs)) {
    // product_requirements_v2.directive_id stores the SD KEY (e.g. SD-FOO-001), not the UUID.
    // Callers that only have the UUID must pass directiveId=sd_key; fall back to sdId otherwise.
    const lookupKey = directiveId || sdId;
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('functional_requirements')
      .eq('directive_id', lookupKey)
      .maybeSingle();
    frs = (prd && prd.functional_requirements) || [];
  }

  // NOTE: user_stories has NO `description` column — selecting it errors the whole query
  // (data -> null -> every FR wrongly flagged undelivered). Stick to real columns.
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, title, user_want, acceptance_criteria, technical_notes, status, validation_status')
    .eq('sd_id', sdId);
  const validated = (stories || []).filter(isValidatedStory);

  // Second signal: TESTING sub_agent_execution_results evidence for this SD. Bind `error`
  // explicitly (do not repeat the pre-existing stories-query anti-pattern above, which this
  // module's own header already documents as dangerous) — an error means "no usable evidence",
  // never "zero rows found by design".
  const { data: testingRows, error: testingError } = await supabase
    .from('sub_agent_execution_results')
    .select('id, phase, detailed_analysis, summary, raw_output, metadata')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING');
  const safeTestingRows = testingError ? [] : (testingRows || []);

  // SECURITY finding (round 5, the converged design after rounds 2-4 each closed part of the
  // gap): metadata.repo_path is WRITER-CONTROLLED — the same TESTING sub-agent chooses both it
  // and test_ref, so trusting it (even conditionally, "when compliant") still fell back to cwd
  // for the ~24% of rows that weren't — reopening the exact cross-repo false-promote for that
  // slice, and inheriting metadata.repo_path's staleness (a worktree-sourced path resolves today
  // and stops resolving once that worktree is cleaned up). v_sub_agent_repo_compliance already
  // exposes expected_repo_path — this SD's registered applications.local_path, resolved via
  // target_application, INFRASTRUCTURE-CONTROLLED and never influenced by what any sub-agent
  // writes. It is populated for the large majority even of non-compliant rows (the "legacy"
  // bucket included), so using it directly is simultaneously simpler than gating on compliance
  // AND strictly stronger: the writer's own repo_path claim is never consulted at all. A row
  // with no known application (unregistered target_application, small single-digit-percent
  // minority) gets no map entry and is correctly treated as unresolved rather than defaulting to
  // cwd — see the canResolve short-circuit in resolveTestingEvidenceCoverage. A query error
  // fails closed (empty map, nothing trusted), same as the testingError pattern above.
  const { data: complianceRows, error: complianceError } = await supabase
    .from('v_sub_agent_repo_compliance')
    .select('id, expected_repo_path')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING');
  const expectedRepoRoots = complianceError
    ? new Map()
    : new Map(
      (complianceRows || [])
        .filter((r) => typeof r?.expected_repo_path === 'string' && r.expected_repo_path.trim() !== '')
        .map((r) => [r.id, r.expected_repo_path]),
    );

  const regexFrMentions = extractRegexFrMentions(safeTestingRows, frs);
  const {
    matchedTestingCoverage, unmatchedFrCoverageIds, unresolvedTestRefs, unrecognizedPhaseRows, rejectedPhaseRows, testingEvidenceRowsSeen,
  } = resolveTestingEvidenceCoverage(safeTestingRows, frs, fsDeps, expectedRepoRoots);

  // PASS 1 — resolve the positive signals per FR without deciding the negative case yet. The
  // negative case (undelivered vs unverifiable) cannot be decided per-FR: it depends on whether
  // THIS SD uses EITHER delivery convention at all, which is only knowable after every FR has
  // been examined.
  const resolved = [];
  const conflictingSignals = [];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    const id = frIdOf(fr, i);
    const desc = (fr && (fr.requirement || fr.description || fr.title)) || '';
    const deliveredBy = validated.find((s) => frReferencesId(s, id));
    const testingEntries = matchedTestingCoverage.filter((c) => frIdsMatch(c.fr_id, id));
    const testingDelivered = testingEntries.find((c) => c.status === 'delivered') || null;
    const testingUndelivered = testingEntries.find((c) => c.status === 'undelivered') || null;

    // Precedence: a validated story always wins on conflict — it is human-reviewed, tested
    // evidence; a TESTING agent's self-reported claim is not treated as stronger than that. A
    // conflict is recorded as a diagnostic, never silently dropped, but never flips the verdict.
    if (deliveredBy && testingUndelivered) {
      conflictingSignals.push({ fr_id: id, story_says: 'delivered', testing_evidence_says: 'undelivered' });
    }

    const descope = deliveredBy ? null : descopeFor(sdMetadata, id, requesterSessionId);

    // An approver-gated descope is ALSO a human-reviewed record, same tier as a story — it must
    // not be silently overwritten by an agent's self-reported fr_coverage entry. The conflict is
    // recorded (never dropped) even though descope wins below; scoring is unaffected either way
    // (delivered and descoped both count as satisfied in projectGateResult).
    if (descope && testingDelivered) {
      conflictingSignals.push({ fr_id: id, descoped_by: descope.approved_by, testing_evidence_says: 'delivered' });
    }

    resolved.push({ id, desc, deliveredBy, descope, testingDelivered, testingUndelivered });
  }

  // PASS 2 — is EITHER delivery convention in use for this SD? A story reference can only ever
  // express "delivered" (there is no "story says undelivered"), so its convention-proof is
  // necessarily one-sided. A matched testing_evidence entry proves the convention is in use
  // regardless of which way it points — a matched "undelivered" entry is the STRONGEST possible
  // negative signal and must count at least as much as no evidence at all (an earlier draft only
  // counted status==="delivered" here, which perversely made shipping explicit negative evidence
  // classify as unverifiable — never-blocking — instead of undelivered — blocking).
  const conventionInUse = resolved.some((r) => r.deliveredBy) || matchedTestingCoverage.length > 0;

  // ...but UNVERIFIABLE requires that there was something we could have read. hasWorkProduct is
  // symmetric across both signals: a validated story OR a genuinely matched testing_evidence
  // entry both count as real work product; an admitted TESTING row with zero matched entries
  // does NOT (it is exactly as if that row did not exist, for this purpose — it still counts
  // toward testingEvidenceRowsSeen so "ran and found nothing" stays observable). With neither
  // signal present there is no work product at all, so "the convention is not in use here" is
  // not an available excuse — nothing exists that could have carried a reference. That stays
  // UNDELIVERED rather than being laundered into blindness. Surfaced by an existing hard-fail
  // test in fr-delivery-traceability-gate.test.js, which was right to object.
  const hasWorkProduct = validated.length > 0 || matchedTestingCoverage.length > 0;
  const unmeasurable = !conventionInUse && hasWorkProduct;

  const out = resolved.map(({ id, desc, deliveredBy, descope, testingDelivered, testingUndelivered }) => {
    if (deliveredBy) {
      return { id, description: desc, status: 'delivered', delivery_basis: 'story', evidence: `Validated story ${deliveredBy.id} references ${id}` };
    }
    if (descope) {
      // Checked before testingDelivered: descope is an approver-gated human record, same
      // precedence tier as a validated story. A matched fr_coverage entry never silently
      // overwrites it — see the conflictingSignals push above, which still records the
      // disagreement when both exist.
      return { id, description: desc, status: 'descoped', evidence: `Descoped by ${descope.approved_by}${descope.reason ? `: ${descope.reason}` : ''}` };
    }
    if (testingDelivered) {
      return {
        id, description: desc, status: 'delivered', delivery_basis: 'testing_evidence',
        evidence: `TESTING evidence (sub_agent_execution_results ${testingDelivered.sub_agent_result_id}) references ${id} with test_ref ${testingDelivered.test_ref}`,
      };
    }
    if (unmeasurable) {
      return {
        id,
        description: desc,
        status: 'unverifiable',
        evidence: `No FR of this SD is referenced by any of its ${validated.length} validated story/stories or ${matchedTestingCoverage.length} matched testing-evidence entries, so the FR-reference convention is not in use here — delivery of this FR was not observable either way`,
      };
    }
    if (testingUndelivered) {
      return {
        id, description: desc, status: 'undelivered',
        evidence: `TESTING evidence (sub_agent_execution_results ${testingUndelivered.sub_agent_result_id}) explicitly marks ${id} undelivered with test_ref ${testingUndelivered.test_ref}`,
      };
    }
    // Reachable only when unmeasurable===false and hasWorkProduct===true, which forces
    // conventionInUse===true -- i.e. some OTHER (sibling) FR of this SD really is referenced,
    // either by a story or by a matched testing-evidence entry. Signal-agnostic on purpose: an
    // earlier draft always said "sibling FRs... ARE referenced" as if by a story specifically,
    // which was false whenever the only work product was testing evidence with zero stories.
    const why = hasWorkProduct
      ? 'No validated story references this FR id, no admitted TESTING evidence matches it, and no approver-gated descope exists — yet this SD demonstrably uses the FR-reference convention (a sibling FR is referenced by a validated story or a matched testing-evidence entry)'
      : 'No validated story exists for this SD and no admitted TESTING evidence matched any FR — nothing was built or validated against this FR';
    return { id, description: desc, status: 'undelivered', evidence: why };
  });

  const count = (status) => out.filter((f) => f.status === status).length;
  const total = out.length;
  const unverifiable = count('unverifiable');
  return {
    frs: out,
    total,
    delivered: count('delivered'),
    descoped: count('descoped'),
    undelivered: count('undelivered'),
    unverifiable,
    convention_in_use: conventionInUse,
    has_work_product: hasWorkProduct,
    validated_story_count: validated.length,
    unverifiable_ratio: total === 0 ? 0 : unverifiable / total,
    regex_fr_mentions: regexFrMentions,
    testing_evidence_rows_seen: testingEvidenceRowsSeen,
    unmatched_fr_coverage_ids: unmatchedFrCoverageIds,
    unresolved_test_refs: unresolvedTestRefs,
    unrecognized_phase_rows: unrecognizedPhaseRows,
    rejected_phase_rows: rejectedPhaseRows,
    conflicting_signals: conflictingSignals,
  };
}

/**
 * Project a classification into a gate result.
 *
 * THE SCORE IS ALWAYS THE TRUE satisfied/total RATIO, in BOTH modes. The enforcement flag
 * governs only `passed` and `required` — i.e. whether the gate BLOCKS — never what it REPORTS.
 *
 * The previous implementation pinned the warn-only score at 100 and hid the real number in
 * details.raw_score, on the reasoning that a sub-100 score could soft-block a borderline SD.
 * That bought "zero blast radius" by making the gate structurally unable to lower a score:
 * measured on the specimen, 0 of 6 FRs satisfied still reported 100, so the composite could
 * not distinguish six-of-six from zero-of-six. Honest reporting is the whole point of a gate.
 * Measured cost of telling the truth, across 62 handoffs carrying an FR gate: mean composite
 * delta -2.26 points, worst -10.0 on a small roster, and exactly 2 handoffs newly crossing
 * below their type threshold. Small, bounded, and enumerable — not zero, and stated as such.
 */
export function projectGateResult(classification, {
  enforced = isFrTraceabilityEnforced(),
  gateName = 'FR_DELIVERY',
  ceiling = frUnverifiableCeiling(),
} = {}) {
  const { frs, total, delivered, descoped, undelivered, unverifiable = 0 } = classification;
  const satisfied = delivered + descoped;
  const score = total === 0 ? NOT_MEASURED_SCORE : Math.round((satisfied / total) * 100);
  const listOf = (status, label) => frs
    .filter((f) => f.status === status)
    .map((f) => `  ${label}: ${`${f.id}: ${f.description}`.trim()}`);
  const undeliveredList = listOf('undelivered', 'Undelivered');
  const unverifiableList = listOf('unverifiable', 'Unverifiable');
  const ratio = total === 0 ? 0 : unverifiable / total;
  const overCeiling = total > 0 && ratio > ceiling;
  const details = { ...classification, ceiling, over_ceiling: overCeiling };

  if (total === 0) {
    // No FRs to measure. Reported as a NON-MEASUREMENT, not as a delivery.
    return {
      passed: true, score: NOT_MEASURED_SCORE, max_score: 100, issues: [], required: false,
      warnings: [`${gateName}: no functional requirements in PRD — delivery NOT verified (score ${NOT_MEASURED_SCORE} denotes not-measured, not delivered)`],
      details,
    };
  }

  const issues = [];
  const warnings = [];

  if (undelivered > 0) {
    const line = `${gateName}: ${undelivered}/${total} FR(s) UNDELIVERED — this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing`;
    (enforced ? issues : warnings).push(line, ...undeliveredList);
  }

  if (unverifiable > 0) {
    // Never silent, in either mode: an unmeasurable completion is the condition this gate was
    // repaired to surface, so it is always stated even when it does not block.
    warnings.push(
      `${gateName}: ${unverifiable}/${total} FR(s) UNVERIFIABLE — no FR of this SD is referenced by any validated story, so delivery was not observable. This is BLINDNESS, not evidence of absence, and the score below reflects VERIFIED delivery only.`,
      ...unverifiableList,
    );
  }

  if (overCeiling) {
    const line = `${gateName}: unverifiable ratio ${(ratio * 100).toFixed(0)}% exceeds the ceiling of ${(ceiling * 100).toFixed(0)}% (LEO_FR_UNVERIFIABLE_CEILING) — an SD may not complete this blind`;
    (enforced ? issues : warnings).push(line);
  }

  if (!enforced && (undelivered > 0 || unverifiable > 0)) {
    warnings.push(`${gateName} is warn-only (set LEO_FR_TRACEABILITY_ENFORCE to block); the score is the true verified-delivery ratio either way.`);
  }

  const blocking = enforced && (undelivered > 0 || overCeiling);
  return {
    passed: !blocking,
    score,
    max_score: 100,
    required: blocking ? true : enforced,
    issues,
    warnings,
    details,
  };
}
