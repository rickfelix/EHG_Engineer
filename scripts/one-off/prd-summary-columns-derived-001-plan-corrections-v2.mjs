#!/usr/bin/env node
/**
 * TESTING re-check (evidence 1d78482f-bc8c-486f-b49d-5a10b9773718, verdict=FAIL, confidence 90)
 * conceded BLOCKER-4 (venture_gate_last_verdict IS present on the target row -- confirmed) but
 * found re-verifying it surfaced something worse: FR-5's derivation would invert an evidenced
 * governance clearance (fence_status.state=CLEARED, derived-from verdict=NOT_MET, confirmed live
 * by this session), with no value-mapping function ever defined. Also found the FR-3 correction
 * from the prior pass only touched functional_requirements/acceptance_criteria/test_scenarios --
 * system_architecture, implementation_approach and integration_operationalization still describe
 * the rejected control_pack_failures+backfill design. This script:
 *  - Descopes FR-5 (mirrors the FR-6 pattern) instead of staging an undefined, clearance-inverting
 *    trigger behind a chairman-gate that cannot mitigate an unspecified mapping function.
 *  - Propagates the FR-3 control_pack_status correction into every section an implementer reads.
 *  - Tightens FR-3's predicate wording to be unambiguous about waived controls (confirmed real,
 *    in lib/eva/uat-control-pack.js:206-226, though unexercised in live data today).
 *  - Corrects the false "no WHEN clause available" claim (3 in-repo precedents confirmed).
 *  - Corrects TS-3's "3 symmetric carriers" framing (3 rows carry fence_status_2026_08_17, only 2
 *    carry venture_gate_last_verdict).
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'scripts/temp/prd-summary-columns-derived-001.json';
const prd = JSON.parse(readFileSync(PATH, 'utf8'));
const byId = (arr, id) => arr.find((x) => x.id === id);

// ---------- FR-3: tighten predicate wording (waiver-safe, unambiguous) ----------
const fr3 = byId(prd.functional_requirements, 'FR-3');
fr3.requirement =
  "Derive uat_test_runs.metadata.control_pack_evaluated from control_pack_status via a BEFORE INSERT OR UPDATE trigger -- true iff NONE of the 4 required control keys equals the literal string 'not_attempted' (this correctly counts a 'waived: <reason>' value as evaluated, mirroring lib/eva/uat-control-pack.js:206-226's allRequiredEvaluated exactly) -- must be implemented as an inequality against 'not_attempted', never as an equality test against 'evaluated'";
fr3.description +=
  " TESTING re-check (evidence 1d78482f) independently confirmed B1/B2/B3 are genuinely fixed (recomputed the corrected predicate against all 26 live rows: 0 disagreements, no backfill needed) but flagged a real implementation-risk: lib/eva/uat-control-pack.js:206-226 shows the canonical writer emits THREE status shapes per control, not two -- 'evaluated', 'not_attempted', and a 'waived: <reason>' template string (chairman-waived controls) -- confirmed by direct source read; only 'not_attempted'/'evaluated' have been exercised in live data so far (26/26 rows), so a waiver has zero production precedent today but is a real, designed-for writer output. An equality check against the literal 'evaluated' string would derive false for a legitimately waived control, inverting the app layer's own missing = status.filter(c => status[c] === 'not_attempted') semantic and manufacturing exactly the drift class this SD exists to close. The trigger predicate must be phrased as an inequality (status[c] != 'not_attempted' for all 4 keys), never an allowlist of one string. Separately: the earlier claim that 'no WHEN clause is available since there is no distinct column to diff' was ALSO checked and found FALSE -- 3 in-repo precedents (database/migrations/20260412_deferred_sd_audit_trigger.sql:29, 20260529_create_venture_stages_unified.sql:230, 20260608_venture_stages_audit_add_gate_label.sql:81) use IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN as a short-circuit guard inside the trigger body; this SD's trigger should follow that same precedent rather than unconditionally recomputing on every metadata write.";
fr3.acceptance_criteria[0] =
  "Trigger sets metadata.control_pack_evaluated = true only when NONE of the 4 required keys (fence_two_sidedness, canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) in metadata.control_pack_status equals the literal string 'not_attempted' -- implemented as an inequality, never as an equality check against 'evaluated' alone; the trigger body uses IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN as its short-circuit guard, per the 3 in-repo precedents cited in the description";
fr3.acceptance_criteria.push(
  "A fixture row with 1 required key = 'waived: <reason>' and the remaining 3 = 'evaluated' derives control_pack_evaluated = true -- an equality-against-'evaluated' implementation would wrongly derive false for this fixture and must fail this test"
);

// ---------- FR-4: no changes needed beyond the prior pass (already control_pack_status) ----------

// ---------- FR-5: DESCOPE (mirrors FR-6) -- clearance inversion + undefined mapping are disqualifying ----------
const fr5 = byId(prd.functional_requirements, 'FR-5');
fr5.requirement =
  "Descope strategic_directives_v2.metadata.fence_status_2026_08_17 derivation (instance 1) from this SD's implementation -- design constraints only, no migration, with an explicit follow-up recommendation";
fr5.description =
  "SUPERSEDES the prior 'stage a chairman-gated trigger' design. TESTING re-check (evidence 1d78482f) conceded its own BLOCKER-4 was a genuine measurement error -- venture_gate_last_verdict IS present on SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E (value NOT_MET), independently re-confirmed live by this session -- so FR-5 is not zero-yield. But re-verifying that claim surfaced something more severe, also independently confirmed live by this session: the SAME row's fence_status_2026_08_17.state is 'CLEARED' (an evidenced coordinator clearance: cleared_by 0d37100a, cleared_at 2026-08-17T15:39:26Z, Adam advisory 6ca01194, carrying its own evidence_correction narrative) while venture_gate_last_verdict is 'NOT_MET', 46 days stale. A trigger deriving fence_status from venture_gate_last_verdict would, on its first fire, OVERWRITE that evidenced CLEARED decision with a value derived from stale, disagreeing data -- reversing a real governance outcome, not merely syncing a summary to its detail. Worse: no value-mapping function was ever specified anywhere in this PRD (system_architecture said only 'recomputes the paired summary field', never defining verdict-to-state semantics), and live data shows the two vocabularies are currently disjoint across all rows (venture_gate_last_verdict in {NOT_MET}, fence_status.state in {CLEARED}, confirmed via a full 6270-row scan) -- there is no existing precedent pair to infer a mapping from. A chairman apply-gate can approve WHEN a migration applies; it cannot supply a mapping function nobody has written, and staging an underspecified trigger behind that gate only defers discovering it derives the wrong value until apply time, against a live governance field. This is the same class of finding that led RISK (LEAD phase, 594115a9) to flag instance 3 (SMS, FR-6) as unsafe: real design work -- naming the canonical source among 3 candidates (venture_gate_last_verdict / venture_gate_attestations / a fresh governed re-measure) AND authoring a reviewed verdict-to-state mapping that provably cannot silently reverse an existing terminal/cleared state -- is needed before any trigger for this instance can be written, and that work is beyond this SD's remaining scope.";
fr5.priority = 'MEDIUM';
fr5.acceptance_criteria = [
  'No migration or trigger for strategic_directives_v2.metadata.fence_status_2026_08_17 ships in this SD',
  'A written design note (this PRD) records: (a) the confirmed CLEARED-vs-NOT_MET inversion hazard with row-level evidence, (b) that no verdict-to-state mapping function has ever been specified, (c) that the 3-way canonical-source ambiguity (R3, LEAD phase) remains unresolved -- for whoever picks up the follow-up',
  "The retrospective/completion-flags capture explicitly flags this as a deliberately descoped instance (not silently dropped), and explicitly corrects the record on TESTING's now-conceded BLOCKER-4 (the key is present; the disqualifying finding is the clearance-inversion hazard, not zero-yield)"
];

// ---------- system_architecture: fix all 3 remaining stale-design references ----------
prd.system_architecture.overview =
  "The CI lint is widened to the actual defect shapes (boolean, jsonb-key, cross-table); the one instance where deriving is currently safe (uat_test_runs, cold table, corrected control_pack_status-based predicate) gets a governed trigger; the two instances where deriving is currently unsafe (SMS -- a live worker claim queue with no durable detail source; strategic_directives_v2 fence-status -- would invert an evidenced governance clearance with no defined value-mapping) are explicitly descoped with documented design constraints for their own follow-ups.";
prd.system_architecture.components[0].responsibility =
  "BEFORE trigger deriving uat_test_runs.metadata.control_pack_evaluated from control_pack_status (true iff no required key equals 'not_attempted' -- correctly waiver-safe); no backfill (existing rows are already correct under this predicate)";
prd.system_architecture.components[1] = {
  name: '(descoped) database/chairman-gated/*_sd_fence_status_derive.sql',
  responsibility:
    "NOT SHIPPED in this SD. FR-5 is descoped: deriving fence_status_2026_08_17 from venture_gate_last_verdict would invert an evidenced CLEARED governance clearance on this exact row, and no verdict-to-state mapping function has ever been defined. Follow-up SD needed.",
  technology: 'N/A -- descoped'
};
prd.system_architecture.data_flow =
  "uat_test_runs: a BEFORE trigger uses IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN as a short-circuit guard (precedented 3x in-repo: 20260412_deferred_sd_audit_trigger.sql:29, 20260529_create_venture_stages_unified.sql:230, 20260608_venture_stages_audit_add_gate_label.sql:81), then recomputes control_pack_evaluated from control_pack_status in the same row/transaction before the write commits -- summary and detail can never be observed out of sync by any reader. strategic_directives_v2's fence_status derivation is NOT implemented in this SD (FR-5 descoped) -- no data flow exists for that instance until a follow-up SD defines a reviewed value-mapping function.";

// data_contracts: fix uat_test_runs schema note; remove the fence_status "staged" contract (nothing ships)
const dcList = prd.integration_operationalization.data_contracts;
const dcUat = dcList.find((c) => c.contract_name === 'uat_test_runs.metadata shape');
if (dcUat) {
  dcUat.schema =
    "control_pack_status: jsonb object mapping each of 4 required control keys to 'not_attempted', 'evaluated', or 'waived: <reason>' (canonical derivation source -- true iff none equals 'not_attempted', which correctly counts a waiver as evaluated); control_pack_failures: jsonb (array or jsonb null, NOT used for derivation -- ambiguous per its own writer); control_pack_evaluated: boolean, trigger-derived from control_pack_status";
}
prd.integration_operationalization.data_contracts = dcList.filter(
  (c) => c.contract_name !== 'strategic_directives_v2.metadata.fence_status_2026_08_17 shape'
);

// consumers: fix control_pack_status reference
prd.integration_operationalization.consumers[0].interaction =
  'Reads metadata.control_pack_evaluated, now guaranteed in sync with control_pack_status by FR-3\'s trigger';

// dependencies: FR-5's apply-ceremony dependency no longer applies (nothing ships)
prd.integration_operationalization.dependencies = prd.integration_operationalization.dependencies.filter(
  (d) => !/FR-5/.test(d.contract || '')
);
prd.integration_operationalization.dependencies.push({
  name: 'Follow-up SD (not yet created)',
  type: 'downstream',
  contract:
    "Must name the canonical venture-gate source among 3 candidates (R3, LEAD phase), author a reviewed verdict-to-state mapping function, and prove it cannot silently reverse an existing CLEARED/terminal governance state before any strategic_directives_v2 fence_status trigger is written",
  failure_handling: 'N/A -- no code ships for this instance in this SD'
});

prd.integration_operationalization.runtime_config.deployment_considerations =
  'FR-3 ships as a normal chairman-gated apply. FR-5 is fully descoped in this SD -- no migration, staged or otherwise.';
prd.integration_operationalization.observability_rollout.rollout_strategy =
  'Phase 1 (lint) ships immediately; Phase 2 (uat_test_runs) ships via chairman-gated apply; strategic_directives_v2 fence-status (FR-5) and sms_outbound_obligations (FR-6) are both descoped in this SD, each with a documented design-constraint note for its own follow-up';

// ---------- implementation_approach: fix Phase 2 (no backfill) and Phase 3 (descope, not stage) ----------
const phases = prd.implementation_approach.phases;
const phase2 = phases.find((p) => p.phase === 'Phase 2');
if (phase2) phase2.description = 'Ship the uat_test_runs pilot trigger (FR-3, FR-4) -- cold table, clear derivation, no backfill (existing rows already correct)';
const phase3 = phases.find((p) => p.phase === 'Phase 3');
if (phase3) {
  phase3.description =
    "Descope the strategic_directives_v2 fence-status instance (FR-5) -- confirmed clearance-inversion hazard and no defined value-mapping function make it unsafe to stage even behind a chairman gate; document constraints for a follow-up SD";
  phase3.deliverables = ['Design-constraint note in this PRD (no migration ships)'];
}
prd.implementation_approach.technical_decisions.push(
  "Descope FR-5 entirely (not merely stage-not-apply) once TESTING's re-check confirmed the derivation would invert an evidenced CLEARED governance clearance with no value-mapping function ever defined -- a chairman apply-gate cannot mitigate an unspecified mapping"
);

// ---------- top-level acceptance_criteria ----------
prd.acceptance_criteria[1] =
  "strategic_directives_v2's fence-status derivation (FR-5) is explicitly descoped -- no migration ships -- with the clearance-inversion hazard and undefined value-mapping documented for a follow-up SD";

// ---------- risks: replace the FR-5 "chairman may lack context" risk with the descope's residual risk ----------
const risks = prd.risks;
const fr5RiskIdx = risks.findIndex((r) => /3-way canonical-source ambiguity for venture_gate verdict/.test(r.risk));
if (fr5RiskIdx >= 0) {
  risks[fr5RiskIdx] = {
    risk:
      "Descoping strategic_directives_v2's fence-status instance (FR-5) leaves the summary/detail drift class only 1/3 closed by this SD, and a future worker may re-attempt the derivation without re-discovering that it would invert an evidenced CLEARED governance clearance (confirmed live: fence_status.state=CLEARED, venture_gate_last_verdict=NOT_MET, same row)",
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation:
      "The descope is recorded as its own risk/completion-flag finding (not silently dropped), naming the exact hazard (clearance inversion + undefined value-mapping) and the 3-way canonical-source ambiguity, so a future SD inherits the finding rather than re-deriving it",
    rollback_plan: 'N/A -- no code shipped for this instance to roll back'
  };
}

// ---------- test_scenarios: replace FR-5 trigger-behavior tests with a descope-verification test; fix TS-3 framing; add waiver test ----------
const ts = prd.test_scenarios;
const keepIds = new Set(['TS-1', 'TS-2', 'TS-2b', 'TS-2c', 'TS-2d', 'TS-2e', 'TS-4', 'TS-5', 'TS-5b', 'TS-6', 'TS-7']);
prd.test_scenarios = ts.filter((t) => keepIds.has(t.id));
prd.test_scenarios.push({
  id: 'TS-2f',
  scenario: "Insert a uat_test_runs fixture with 1 required key = 'waived: <reason>' and the remaining 3 = 'evaluated' and confirm control_pack_evaluated derives to true, not false",
  test_type: 'unit',
  given: "A uat_test_runs row where one required control key in metadata.control_pack_status is the literal string 'waived: some reason' (a real, designed-for writer output per lib/eva/uat-control-pack.js:206-226, unexercised in live data today) and the other 3 are 'evaluated'",
  when: 'The row is inserted',
  then: "metadata.control_pack_evaluated derives to true -- proves the trigger uses an inequality against 'not_attempted', not an equality allowlist of 'evaluated' alone, which would wrongly derive false for this fixture"
});
prd.test_scenarios.push({
  id: 'TS-3',
  scenario: "strategic_directives_v2's fence_status_2026_08_17 receives no migration and no live trigger from this SD",
  test_type: 'unit',
  given: "This SD's full migration set",
  when: "Reviewed against database/chairman-gated/ (file-existence check) AND a live query of pg_trigger for strategic_directives_v2 filtered to any new trigger name this SD would have introduced (mechanism check)",
  then: "No file targets fence_status_2026_08_17 derivation, and pg_trigger shows no new trigger post-SD -- FR-5's descope is verified at the mechanism level, mirroring TS-7's verification of FR-6's descope"
});

writeFileSync(PATH, JSON.stringify(prd, null, 2));
console.log('PRD v2 corrections applied and saved:', PATH);
console.log('FR-3 tightened (waiver-safe predicate, WHEN-clause precedent corrected).');
console.log('FR-5 fully descoped (clearance-inversion + undefined mapping).');
console.log('system_architecture, implementation_approach, integration_operationalization, data_contracts, risks, test_scenarios all propagated.');
