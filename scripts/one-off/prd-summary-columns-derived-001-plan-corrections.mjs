#!/usr/bin/env node
/**
 * PLAN-phase TESTING sub-agent (evidence 51dde124-d736-4ace-a9eb-90264145515a, verdict=FAIL,
 * 4 blockers) found FR-3's derivation predicate backwards and FR-3's "23/24 drifted" claim
 * false; independently re-verified live against uat_test_runs row 84d310e1. TESTING's own
 * BLOCKER-4 (FR-5 "zero-yield by construction") was in turn independently re-verified WRONG
 * by this session: venture_gate_last_verdict DOES exist on the target row (value NOT_MET,
 * identical to the other row, checked_at 2026-07-28), and the row's updated_at predates
 * TESTING's own evidence timestamp -- not a timing race, a measurement error. This script
 * applies the corrected FR-3/FR-5 design plus supporting section fixes to the PRD JSON.
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'scripts/temp/prd-summary-columns-derived-001.json';
const prd = JSON.parse(readFileSync(PATH, 'utf8'));

const byId = (arr, id) => arr.find((x) => x.id === id);

// ---------- FR-3: redesign derivation source ----------
const fr3 = byId(prd.functional_requirements, 'FR-3');
fr3.requirement =
  "Derive uat_test_runs.metadata.control_pack_evaluated from control_pack_status (the per-control status map) via a BEFORE INSERT OR UPDATE trigger -- true only when all 4 required control keys are non-'not_attempted', mirroring lib/eva/uat-control-pack.js's existing application-layer allRequiredEvaluated logic -- never from control_pack_failures";
fr3.description =
  "CORRECTED at PLAN (TESTING evidence 51dde124, BLOCKER-1/2/3; independently re-verified live by this session against uat_test_runs row 84d310e1). The original design derived from control_pack_failures IS NOT NULL AND jsonb_typeof(...) != 'null', which reintroduces the exact QF-20260830-666 bug class in SQL: control_pack_failures is documented by its own writer (lib/uat/result-recorder.js:613) as AMBIGUOUS -- null means EITHER 'evaluated, all passed' OR 'never evaluated', and a failures-based predicate cannot tell these apart. Live measurement of row 84d310e1 confirms this directly: control_pack_status shows 3 of 4 required controls 'not_attempted' and 1 'evaluated', control_pack_failures is null, and control_pack_evaluated is (correctly) false -- exactly the 'never evaluated' case a failures-based predicate would misread. The corrected source is control_pack_status: derive true only when ALL 4 required keys (fence_two_sidedness, canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) are present with a value other than 'not_attempted', matching the existing correct application-layer logic in result-recorder.js:593/619 (controlPackStatus.allRequiredEvaluated) and lib/eva/uat-control-pack.js. The originally-claimed '23 of 24 rows drifted, needs backfill' was independently verified FALSE by both TESTING and a direct query in this session: those 23 rows are already CORRECTLY control_pack_evaluated=false under the control_pack_status predicate (incomplete control coverage, not drift) -- a backfill under the flawed predicate would have corrupted 23 correct rows. Because a single writer (result-recorder.js:606-622) sets control_pack_failures, control_pack_evaluated and control_pack_status atomically in ONE .update(), there is in fact NO live drift for this instance today; the trigger is a forward-looking guarantee against a future writer bypassing that atomic path, not a fix for existing data. control_pack_failures/control_pack_status are not columns -- the trigger reads NEW.metadata->'control_pack_status' (jsonb path) and, having no distinct column to scope a WHEN clause to, fires on every INSERT/UPDATE touching the metadata blob. uat_test_runs is COLD (26 rows, ~6/day, ZERO existing triggers on this table today) -- ship this instance first as the pilot, per RISK's sequencing recommendation.";
fr3.acceptance_criteria = [
  "Trigger sets metadata.control_pack_evaluated = true only when metadata.control_pack_status has ALL 4 required keys (fence_two_sidedness, canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) present with a value other than 'not_attempted' -- mirroring lib/eva/uat-control-pack.js's allRequiredEvaluated logic; the trigger never reads control_pack_failures",
  "A fixture row with control_pack_status matching live row 84d310e1's shape (3 of 4 controls 'not_attempted') derives control_pack_evaluated = false -- matching the existing live value, confirming this is correct behavior, not drift",
  "A fixture row with all 4 required controls non-'not_attempted' AND control_pack_failures = jsonb null (a clean, fully-evaluated pass) derives control_pack_evaluated = true -- the false-negative the original control_pack_failures-based predicate would have introduced",
  "Chairman-gated migration (database/chairman-gated/) + DOWN sibling; DOWN captures pre-derivation values before dropping the trigger; migration test script follows the SAVEPOINT-guarded, session_replication_role-toggling, always-ROLLBACK *_dry_run.mjs convention (e.g. database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger_dry_run.mjs)",
  "NO backfill ships with this migration -- the 23 existing evaluated=false rows are already correct under the corrected predicate; the migration's header comment records this explicitly so a future reviewer does not re-attempt one"
];

// ---------- FR-4: fix references from control_pack_failures -> control_pack_status ----------
const fr4 = byId(prd.functional_requirements, 'FR-4');
fr4.description = fr4.description.replace(
  /is always in sync with control_pack_failures \(including the jsonb-null fix\)/,
  'is always in sync with control_pack_status (its corrected derivation source, per FR-3)'
);
fr4.acceptance_criteria = fr4.acceptance_criteria.map((c) =>
  c.replace(
    'control_pack_evaluated and control_pack_failures can never independently disagree',
    'control_pack_evaluated and control_pack_status can never independently disagree'
  )
);

// ---------- FR-5: correct TESTING's disproven BLOCKER-4, keep design (already appropriately cautious) ----------
const fr5 = byId(prd.functional_requirements, 'FR-5');
fr5.description +=
  " CORRECTION (this session, independently verified against live data): PLAN-phase TESTING (evidence 51dde124, BLOCKER-4) claimed venture_gate_last_verdict is 'absent' from this row and that FR-5 is therefore 'zero-yield by construction'. Direct query shows this is FACTUALLY WRONG -- the key IS present on this exact row (value NOT_MET, checked_at 2026-07-28T23:44:24Z), byte-identical to the value on SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 (both evidently stamped by the same batch writer in one pass); the row's updated_at (2026-09-12T15:33:08Z) predates TESTING's own evidence timestamp (2026-09-13T01:30:05Z), ruling out a timing race -- this was a genuine measurement error, not stale data. FR-5 is NOT dead-by-construction. The real, still-valid concern is LEAD-phase RISK finding R3: the SD row's own park_reason admits this value is stale ('needs a governed re-measure writer, not a hand edit'), and a genuinely disagreeing 3rd source exists -- venture_gate_attestations id=3 (verdict=PASS, check_type=chairman_site_review, computed_at=2026-08-18, more recent), confirmed via its subject (AltifyAI) matching this SD's own park_reason narrative about the same venture. FR-5's design (defer the 3-way reconciliation to an explicit chairman decision at apply time, never auto-resolve it in code) was already the correct response to that genuine ambiguity and needs no redesign -- only this factual correction to the record.";
fr5.acceptance_criteria.push(
  "A fixture/regression check directly queries strategic_directives_v2.metadata for the allowlisted row and asserts venture_gate_last_verdict IS present before the migration is staged for apply -- turning TESTING's (now-corrected) zero-yield concern into an enforced precondition rather than an assumption"
);

// ---------- system_architecture.data_flow: fix mechanism-level description ----------
prd.system_architecture.data_flow =
  "There is no distinct control_pack_status/control_pack_failures column to scope a WHEN clause to -- any INSERT/UPDATE touching the metadata jsonb blob on uat_test_runs fires a BEFORE trigger that recomputes control_pack_evaluated from control_pack_status in the SAME row/transaction before the write commits. Similarly, for the allowlisted strategic_directives_v2 row, any INSERT/UPDATE touching its metadata blob fires a BEFORE trigger recomputing the fence_status_2026_08_17.state sub-key from venture_gate_last_verdict via a two-level jsonb_set, preserving sibling provenance keys. In both cases summary and detail can never be observed out of sync by any reader once the trigger is live.";

// data_contracts: add control_pack_status shape
const dc = prd.integration_operationalization?.data_contracts?.find(
  (c) => c.contract_name === 'uat_test_runs.metadata shape'
);
if (dc) {
  dc.schema =
    "control_pack_status: jsonb object mapping each of 4 required control keys to 'not_attempted' or a real status (canonical derivation source); control_pack_failures: jsonb (array or jsonb null, NOT used for derivation -- ambiguous per its own writer); control_pack_evaluated: boolean, trigger-derived from control_pack_status";
}

// ---------- technical_requirements: correct trigger-count claim, add dry-run convention TR ----------
prd.technical_requirements.push({
  id: 'TR-4',
  requirement:
    "Every migration in this SD uses the SAVEPOINT-guarded, session_replication_role-toggling, always-ROLLBACK *_dry_run.mjs proof-script convention (e.g. database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger_dry_run.mjs) as its migration test harness, rather than a new, unreviewed test mechanism",
  rationale:
    "This is the established, already-working pattern for proving a chairman-gated trigger's behavior against live-shaped data without committing a real mutation or requiring an exec_sql/execute_sql RPC (none is exposed in this project) -- reusing it is lower-risk than inventing a parallel one for this SD's two high-hazard trigger targets."
});
prd.technical_requirements.push({
  id: 'TR-5',
  requirement:
    "Trigger-ordering claims must cite the measured live count, not the SD's original placeholder figure",
  rationale:
    "The SD spine's '>=8 existing triggers' claim on strategic_directives_v2 undercounts the measured reality: 57 triggers exist (37 BEFORE, firing in alphabetical NAME order), a load-bearing fact for FR-5's trigger-naming choice. uat_test_runs (FR-3's target) has ZERO existing triggers today -- it is the first trigger ever added to that table, materially lower ordering risk than FR-5's target."
});

// ---------- test_scenarios: replace with corrected + expanded set ----------
prd.test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Insert a uat_test_runs fixture with control_pack_status showing all 4 required controls non-\'not_attempted\' and confirm control_pack_evaluated derives to true without being written directly',
    test_type: 'integration',
    given: "A uat_test_runs INSERT with metadata.control_pack_status having all 4 required keys set to a real status",
    when: 'The row is inserted',
    then: 'metadata.control_pack_evaluated reads true, set by the trigger, never by the INSERT statement itself'
  },
  {
    id: 'TS-2',
    scenario: "Insert a uat_test_runs fixture matching live row 84d310e1's shape (3 of 4 controls 'not_attempted') and confirm control_pack_evaluated derives to false, matching the existing correct live value",
    test_type: 'unit',
    given: "A uat_test_runs row where metadata.control_pack_status has 3 of 4 required keys = 'not_attempted'",
    when: 'The row is inserted',
    then: 'metadata.control_pack_evaluated derives to false -- confirms this is correct behavior (incomplete coverage), not drift needing a backfill'
  },
  {
    id: 'TS-2b',
    scenario: 'Insert a uat_test_runs fixture with all 4 required controls non-\'not_attempted\' AND control_pack_failures = JSON null (a clean, fully-evaluated pass) and confirm control_pack_evaluated derives to true, not false',
    test_type: 'unit',
    given: 'A uat_test_runs row that is fully evaluated with zero failures (control_pack_failures is the jsonb null literal)',
    when: 'The row is inserted',
    then: 'metadata.control_pack_evaluated derives to true -- closes the false-negative the original control_pack_failures-based predicate would have introduced for this exact shape'
  },
  {
    id: 'TS-2c',
    scenario: 'Insert a uat_test_runs row with incomplete control_pack_status, then UPDATE it once all controls complete, and confirm the trigger re-fires on UPDATE (not only INSERT)',
    test_type: 'integration',
    given: 'A row inserted with control_pack_evaluated=false (incomplete coverage)',
    when: "The row is later UPDATEd so all 4 required keys become non-'not_attempted'",
    then: 'metadata.control_pack_evaluated flips to true on the UPDATE, proving the trigger covers both INSERT and UPDATE paths'
  },
  {
    id: 'TS-2d',
    scenario: 'Insert a uat_test_runs row whose metadata has no control_pack_status key at all',
    test_type: 'unit',
    given: 'A row inserted with metadata lacking the control_pack_status key entirely',
    when: 'The row is inserted',
    then: 'metadata.control_pack_evaluated derives to false (fails closed) rather than erroring or defaulting true'
  },
  {
    id: 'TS-2e',
    scenario: "Apply the DOWN migration after the trigger has derived values on fixture rows and confirm pre-derivation values are restorable, per TR-2",
    test_type: 'integration',
    given: 'Fixture rows whose control_pack_evaluated has been trigger-derived',
    when: 'The DOWN migration runs',
    then: 'The captured pre-derivation snapshot allows restoring the prior values -- DOWN is a real data rollback, not only DROP TRIGGER'
  },
  {
    id: 'TS-3',
    scenario: 'The fence_status trigger fires for the allowlisted SD row and does not fire for either of the 2 other completed SDs carrying the same key',
    test_type: 'integration',
    given: 'Prior to this trigger existing: 3 SD rows all carrying a fence_status_2026_08_17 key, only one of them SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E',
    when: 'venture_gate_last_verdict is updated on each row',
    then: "Only the allowlisted row's fence_status_2026_08_17 changes; the 2 other completed SDs' values are untouched"
  },
  {
    id: 'TS-3b',
    scenario: "A fixture/regression check confirms venture_gate_last_verdict is present in metadata on the allowlisted row before FR-5's migration is staged",
    test_type: 'unit',
    given: "SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E's current metadata",
    when: 'The check queries for the venture_gate_last_verdict key',
    then: "The key is present (corrects TESTING's disproven BLOCKER-4 assumption; a future absence would now be caught, not assumed)"
  },
  {
    id: 'TS-3c',
    scenario: "Each new migration's DDL block is preceded by SET lock_timeout='3s' (or tighter) before any CREATE TRIGGER/ALTER TABLE statement, per TR-1",
    test_type: 'unit',
    given: "This SD's migration files",
    when: 'A migration-header assertion scans for the SET lock_timeout statement preceding the DDL',
    then: 'Both FR-3 and FR-5 migrations pass; a fixture migration missing the header fails'
  },
  {
    id: 'TS-4',
    scenario: 'The widened CI lint fails a fixture migration adding a new jsonb summary-shaped key with no paired trigger',
    test_type: 'unit',
    given: 'A fixture migration file writing a metadata jsonb key matching a summary-name heuristic, no CREATE TRIGGER in the same file',
    when: 'The lint runs against the fixture',
    then: 'CI fails with a message naming the undereived key'
  },
  {
    id: 'TS-5',
    scenario: 'The widened CI lint passes a fixture migration adding a GENERATED boolean column, and passes the 7 existing baseline boolean columns unchanged',
    test_type: 'unit',
    given: 'A fixture migration with a GENERATED ALWAYS boolean column, plus the live migration history containing the 7 baseline columns',
    when: 'The lint runs',
    then: 'Both pass -- the baseline is asserted, not retroactively failed'
  },
  {
    id: 'TS-5b',
    scenario: 'The widened CI lint flags (not auto-fails) a fixture migration adding a column that is both a foreign key and matches the status/summary naming heuristic, per FR-1 predicate (c)',
    test_type: 'unit',
    given: 'A fixture migration adding a foreign-key column whose name matches a status/summary pattern',
    when: 'The lint runs',
    then: 'CI surfaces a MANUAL REVIEW REQUIRED flag without blocking the PR outright, since predicate (c) cannot be fully mechanical'
  },
  {
    id: 'TS-6',
    scenario: 'A trigger-liveness assertion catches a disabled trigger that a data-agreement query alone would miss',
    test_type: 'integration',
    given: 'Within a SAVEPOINT-guarded transaction that is always rolled back (per the *_dry_run.mjs convention): the uat_test_runs trigger is disabled via ALTER TABLE ... DISABLE TRIGGER, then a drifted row is inserted through an anon-key-equivalent path that silently no-ops on the derivation',
    when: 'The TR-3 liveness check runs (reading pg_trigger) inside the same guarded transaction',
    then: 'The check reports the trigger as disabled/not-firing, distinct from and in addition to any data-agreement query result -- then the transaction ROLLBACKs, so no disabled-trigger state or drifted row is ever committed to production'
  },
  {
    id: 'TS-7',
    scenario: 'sms_outbound_obligations receives no migration and no live trigger from this SD',
    test_type: 'unit',
    given: "This SD's full migration set",
    when: "Reviewed against database/chairman-gated/ (file-existence check) AND a live query of pg_trigger for the sms_outbound_obligations table (mechanism check)",
    then: "No file targets sms_outbound_obligations, and pg_trigger shows zero triggers on the table post-SD -- FR-6's descope is verified at the mechanism level, not only by a migration-file grep (a file's presence is a ceremony marker, never proof of live schema state)"
  }
];

// ---------- acceptance_criteria (top-level): drop backfill claim ----------
prd.acceptance_criteria[0] =
  "uat_test_runs.control_pack_evaluated is derived by a chairman-gated trigger from control_pack_status (not control_pack_failures); no backfill ships since existing rows are already correct under the corrected predicate";

writeFileSync(PATH, JSON.stringify(prd, null, 2));
console.log('PRD corrected and saved:', PATH);
console.log('FR-3, FR-4, FR-5, system_architecture.data_flow, data_contracts, technical_requirements (+TR-4/TR-5), test_scenarios, acceptance_criteria[0] updated.');
