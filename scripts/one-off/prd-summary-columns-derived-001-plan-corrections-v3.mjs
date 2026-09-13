#!/usr/bin/env node
/**
 * TESTING re-verify pass 3 (evidence fc38d1fd-4abb-494f-b4eb-1186f4bfc251, verdict=FAIL,
 * confidence 92) confirmed FR-5's descope and FR-3's waiver-safety are both complete and
 * consistent, but found:
 *  - BLOCKER-1 (CRITICAL, new): FR-3 AC-1's bare `IF OLD.metadata IS DISTINCT FROM NEW.metadata`
 *    guard raises "record 'old' is not assigned yet" on INSERT (OLD is unassigned on INSERT in
 *    PL/pgSQL) -- would break lib/uat/result-recorder.js:117-119 startSession() on every call.
 *    Confirmed independently against database/chairman-gated/20260906_retrospectives_published_guard.sql:172,
 *    which guards every OLD access behind TG_OP = 'UPDATE' first for exactly this reason.
 *  - BLOCKER-2 (HIGH): risks[0] still describes FR-5's rejected/descoped trigger as shipping;
 *    the SD's one real shipping migration (FR-3) has zero risk entries.
 *  - BLOCKER-3 (MEDIUM-HIGH): implementation_approach.technical_decisions[0] contradicts [3].
 *  - BLOCKER-4 (MEDIUM): system_architecture.integration_points still lists strategic_directives_v2.
 *  - Mediums: TR-4/TR-5 wording still frames FR-5 as a shipping trigger target;
 *    exploration_summary.patterns_identified keeps FR-5-only patterns as live design choices.
 *  - Low: "NONE of the 4 required keys equals 'not_attempted'" vacuously passes on an absent key;
 *    tighten to require presence.
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'scripts/temp/prd-summary-columns-derived-001.json';
const prd = JSON.parse(readFileSync(PATH, 'utf8'));
const byId = (arr, id) => arr.find((x) => x.id === id);

// ---------- BLOCKER-1 (CRITICAL): fix the INSERT-breaking guard ----------
const fr3 = byId(prd.functional_requirements, 'FR-3');
fr3.requirement = fr3.requirement.replace(
  "true iff NONE of the 4 required control keys equals the literal string 'not_attempted'",
  "true iff all 4 required control keys are PRESENT and NONE equals the literal string 'not_attempted'"
);
fr3.description +=
  " TESTING re-verify pass 3 (evidence fc38d1fd) found a CRITICAL defect in the prior correction: a bare `IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN` guard inside a BEFORE INSERT OR UPDATE trigger raises 'record \"old\" is not assigned yet' on every INSERT, since OLD is unassigned until an UPDATE fires -- this would break lib/uat/result-recorder.js:117-119's startSession() on every UAT run (the exact failure mode already documented in that file's own QF-20260830-487 comment). The 3 previously-cited precedents (20260412/20260529/20260608) are all UPDATE-ONLY triggers, which is exactly why their bare guard is safe -- they are not valid precedent for an INSERT-OR-UPDATE trigger. The correct in-repo precedent for THIS timing is database/chairman-gated/20260906_retrospectives_published_guard.sql:172-228 (BEFORE INSERT OR UPDATE), whose function guards every OLD access behind `IF TG_OP = 'UPDATE' AND ...` first. The guard must be `IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN`, never a bare OLD reference. Additionally, read literally, 'NONE of the 4 required keys equals not_attempted' vacuously passes when a key is simply ABSENT from control_pack_status (not equal to 'not_attempted', but also not present) -- safe against the current app writer (which always emits all 4 keys, per lib/eva/uat-control-pack.js:206-226) but not defensive against a trigger reading arbitrary NEW.metadata from any future writer. The predicate is tightened to require all 4 keys present AND none equal to 'not_attempted'.";
fr3.acceptance_criteria[0] =
  "Trigger sets metadata.control_pack_evaluated = true only when all 4 required keys (fence_two_sidedness, canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) are PRESENT in metadata.control_pack_status AND none equals the literal string 'not_attempted' -- implemented as presence-plus-inequality, never as an equality check against 'evaluated' alone; the trigger body uses `IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN` as its guard (per database/chairman-gated/20260906_retrospectives_published_guard.sql:172-228, the correct precedent for a BEFORE INSERT OR UPDATE trigger -- NOT the 3 previously-cited UPDATE-only triggers, whose bare OLD-referencing guard would raise 'record \"old\" is not assigned yet' on every INSERT)";
fr3.acceptance_criteria.push(
  "A fixture INSERT (not just an UPDATE) with a fully-evaluated control_pack_status succeeds without error and derives control_pack_evaluated = true -- regression-guards the TG_OP='INSERT' branch of the guard specifically",
  "A fixture UPDATE that changes an unrelated metadata sub-key (not control_pack_status) leaves control_pack_evaluated unchanged and does not needlessly recompute -- confirms the OLD.metadata IS DISTINCT FROM NEW.metadata short-circuit actually short-circuits on the UPDATE branch"
);

// system_architecture.data_flow: fix the guard description
prd.system_architecture.data_flow =
  "uat_test_runs: a BEFORE INSERT OR UPDATE trigger guards with IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN (precedented by database/chairman-gated/20260906_retrospectives_published_guard.sql:172-228, the correct pattern for this trigger timing -- a bare OLD-referencing guard, as used by the 3 UPDATE-only precedents originally cited, raises 'record \"old\" is not assigned yet' on INSERT), then recomputes control_pack_evaluated from control_pack_status in the same row/transaction before the write commits -- summary and detail can never be observed out of sync by any reader. strategic_directives_v2's fence_status derivation is NOT implemented in this SD (FR-5 descoped) -- no data flow exists for that instance until a follow-up SD defines a reviewed value-mapping function.";

// ---------- BLOCKER-2 (HIGH): risks[0] still describes FR-5's rejected trigger ----------
prd.risks[0] = {
  risk:
    "FR-3's trigger (the SD's only shipping migration) is a BEFORE INSERT OR UPDATE trigger firing on every write to uat_test_runs.metadata -- an incorrectly-guarded version (bare OLD reference) would raise 'record \"old\" is not assigned yet' on every INSERT, breaking lib/uat/result-recorder.js:117-119's startSession() on every live UAT run",
  probability: 'LOW',
  impact: 'HIGH',
  mitigation:
    "Guard with IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN (per database/chairman-gated/20260906_retrospectives_published_guard.sql:172-228), never a bare OLD reference; TS-1/TS-2/TS-2b/TS-2d/TS-2f (INSERT-path) plus the new INSERT-specific regression test must all pass before this migration ships",
  rollback_plan: 'DOWN sibling drops the trigger; TR-2 requires pre-derivation value capture so control_pack_evaluated can be restored if needed'
};

// ---------- BLOCKER-3 (MEDIUM-HIGH): reconcile contradicting technical_decisions ----------
const td = prd.implementation_approach.technical_decisions;
td[0] =
  "Sequence by blast radius: only uat_test_runs (cold table, corrected control_pack_status predicate, TG_OP-guarded) ships in this SD; both the hot-table instance (strategic_directives_v2 fence-status, FR-5) and the highest-risk instance (SMS, FR-6) are fully descoped, not merely staged, per the findings below";

// ---------- BLOCKER-4 (MEDIUM): fix integration_points ----------
prd.system_architecture.integration_points = ['uat_test_runs', 'CI pipeline (new lint job)'];

// ---------- Mediums: TR-4/TR-5 wording no longer matches "two trigger targets" ----------
const tr4 = byId(prd.technical_requirements, 'TR-4');
tr4.rationale = tr4.rationale.replace(
  "for this SD's two high-hazard trigger targets.",
  "for this SD's one shipping trigger target (uat_test_runs) -- FR-5 and FR-6 are both fully descoped, so no second target exists in this SD."
);
const tr5 = byId(prd.technical_requirements, 'TR-5');
tr5.rationale =
  "The SD spine's '>=8 existing triggers' claim on strategic_directives_v2 undercounts the measured reality: 57 triggers exist (37 BEFORE, firing in alphabetical NAME order) -- informative context for whichever follow-up SD eventually implements FR-5 (fully descoped in this SD, so not load-bearing here). uat_test_runs (FR-3's target, the SD's only shipping trigger) has ZERO existing triggers today -- it is the first trigger ever added to that table, materially lower ordering risk.";

// exploration_summary.patterns_identified: mark FR-5-only patterns as follow-up context, not live choices
prd.exploration_summary.patterns_identified = [
  "A prior deliberate fix (QF-20260830-666) already exists for one of the 3 named readers -- must reconcile, not revert (still applies: FR-4)",
  "For a future FR-5 follow-up SD only (not used by anything shipping in this SD): chairman-gated migrations already have an established lock_timeout mitigation pattern for strategic_directives_v2 to reuse, and sd_key-allowlisting (not pattern-matching on a jsonb key name) would be the correct scoping mechanism for a trigger meant to touch exactly one row"
];

writeFileSync(PATH, JSON.stringify(prd, null, 2));
console.log('PRD v3 corrections applied and saved:', PATH);
console.log('BLOCKER-1 (INSERT-breaking guard) fixed in FR-3 + data_flow.');
console.log('BLOCKER-2 (stale FR-5 risk) replaced with the real FR-3 shipping risk.');
console.log('BLOCKER-3 (contradicting technical_decisions) reconciled.');
console.log('BLOCKER-4 (stale integration_points) fixed.');
console.log('TR-4/TR-5/exploration_summary mediums fixed.');
