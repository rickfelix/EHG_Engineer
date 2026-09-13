#!/usr/bin/env node
/**
 * TESTING pass 4 (evidence d12076b3-bf85-4af9-bab8-f247b10517f3, verdict=FAIL, confidence 94)
 * found pass 3's own BLOCKER-1 was factually wrong: a bare
 * `IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN` guard does NOT raise
 * "record old is not assigned yet" on INSERT in PG 11+ (OLD gets an all-NULL row via tupdesc).
 * This session independently re-verified by EXECUTING the trigger live against PG 17.4
 * (always-ROLLBACK, TEMP table) via scripts/temp/verify-old-metadata-insert-guard.mjs:
 * confirmed the bare guard does not error; it silently SKIPS the body only when
 * NEW.metadata is NULL at insert time (a real but narrower hazard than previously claimed).
 * The fabricated citation (lib/uat/result-recorder.js:122 re: QF-20260830-487) is unrelated
 * (that comment is about a run_id NOT NULL violation).
 *
 * Also fixes: BLOCKER-2 (AC-8 unsatisfiable as written -- resolved by scoping the guard to
 * the control_pack_status sub-key, a design improvement TESTING itself suggested), BLOCKER-3
 * (presence requirement drifted out of components[0]/data_contracts[0]), BLOCKER-4 (FR-3's
 * "mirrors ... exactly" claim is false on the absent-key case -- state the divergence honestly),
 * and the missing TS coverage for AC-7/AC-8/absent-single-key plus risks[0]'s phantom TS citation.
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'scripts/temp/prd-summary-columns-derived-001.json';
const prd = JSON.parse(readFileSync(PATH, 'utf8'));
const byId = (arr, id) => arr.find((x) => x.id === id);

const CORRECTED_GUARD_NOTE =
  "the trigger body uses `IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN` as its guard, scoped to the control_pack_status sub-key (not the whole metadata blob, and not a bare OLD reference)";

// ---------- FR-3: correct the fabricated error mechanism, fix the guard, drop false "exactly" ----------
const fr3 = byId(prd.functional_requirements, 'FR-3');
fr3.requirement =
  "Derive uat_test_runs.metadata.control_pack_evaluated from control_pack_status via a BEFORE INSERT OR UPDATE trigger -- true iff all 4 required control keys are PRESENT and NONE equals the literal string 'not_attempted' (this correctly counts a 'waived: <reason>' value as evaluated). This mirrors lib/eva/uat-control-pack.js:206-226's allRequiredEvaluated for every shape the writer has ever produced (all 4 keys always present); it is DELIBERATELY MORE STRICT on a key's theoretical absence (app: absent key treated as not-missing, fails open; trigger: absent key fails closed), a defensive hardening against any future writer that does not fully populate control_pack_status -- not an exact mirror in the abstract, and not claimed as one. Must be implemented as a presence-plus-inequality check, never as an equality test against 'evaluated' alone.";
fr3.description +=
  " TESTING pass 4 (evidence d12076b3) found pass 3's own BLOCKER-1 correction was itself factually wrong, independently re-verified by this session executing the actual trigger against live Postgres 17.4 (always-ROLLBACK, TEMP table, scripts/temp/verify-old-metadata-insert-guard.mjs): a bare `IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN` guard inside a BEFORE INSERT OR UPDATE trigger does NOT raise 'record \"old\" is not assigned yet' on INSERT -- since Postgres 11, OLD is given an all-NULL row via the table's tupdesc on INSERT, not an unassigned-record error (that error is PG<=10 statement-level behavior). Live test: an INSERT with a non-null metadata value fires the body correctly (NULL IS DISTINCT FROM 'value' = TRUE); an INSERT with metadata left NULL (either explicit NULL or the column omitted, relying on its default) silently SKIPS the body (NULL IS DISTINCT FROM NULL = FALSE) and leaves control_pack_evaluated undetermined -- a silent no-derivation gap, not a thrown error. The previously-cited supporting citation (lib/uat/result-recorder.js:122's QF-20260830-487 comment) was fabricated -- that comment documents an unrelated run_id NOT NULL violation, not anything about OLD or triggers. The prescribed guard, `TG_OP = 'INSERT' OR ...`, remains correct, but for this corrected reason: it forces derivation to run on every INSERT regardless of whether metadata was set at insert time, closing the silent-skip gap rather than avoiding a (nonexistent) thrown error. Separately, TESTING found AC-8 (the short-circuit test) unsatisfiable as originally phrased: since the guard compared the WHOLE metadata blob, changing ANY unrelated sub-key made OLD.metadata IS DISTINCT FROM NEW.metadata true, so the body always recomputed on any metadata UPDATE -- it never actually short-circuited except on a byte-identical UPDATE. TESTING's own suggested remedy (arguably the better design) is adopted: the guard is scoped to the control_pack_status sub-key specifically (" + CORRECTED_GUARD_NOTE + "), so an UPDATE touching an unrelated metadata sub-key correctly leaves control_pack_evaluated untouched, making AC-8 true as originally written.";
fr3.acceptance_criteria[0] =
  "Trigger sets metadata.control_pack_evaluated = true only when all 4 required keys (fence_two_sidedness, canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) are PRESENT in metadata.control_pack_status AND none equals the literal string 'not_attempted' -- implemented as presence-plus-inequality, never as an equality check against 'evaluated' alone; " + CORRECTED_GUARD_NOTE + " (per database/chairman-gated/20260906_retrospectives_published_guard.sql:172-228 for the TG_OP='INSERT' branch; the sub-key scoping is this SD's own design choice, not drawn from that precedent)";
fr3.acceptance_criteria[6] =
  "A fixture INSERT (not just an UPDATE) with metadata left NULL (or the column omitted) succeeds without error and does NOT silently skip derivation -- the TG_OP='INSERT' branch forces the body to run even though the sub-key-scoped comparison alone (NULL vs NULL) would otherwise evaluate false and skip it";
fr3.acceptance_criteria[7] =
  "A fixture UPDATE that changes an unrelated metadata sub-key (not control_pack_status) leaves control_pack_evaluated unchanged and does not recompute -- confirms the guard is scoped to metadata->'control_pack_status', not the whole metadata blob, so it genuinely short-circuits on unrelated changes (not merely on a byte-identical UPDATE)";
fr3.acceptance_criteria.push(
  "A fixture row with exactly 1 of the 4 required keys ABSENT from control_pack_status (the other 3 present, non-'not_attempted') derives control_pack_evaluated = false -- distinct from TS-2d (whole key absent): this is the single-required-key-absent case that diverges from the app layer's own fail-open semantic, per FR-3's stated deliberate divergence"
);

// ---------- system_architecture.data_flow: correct error mechanism + guard scoping ----------
prd.system_architecture.data_flow =
  "uat_test_runs: a BEFORE INSERT OR UPDATE trigger guards with IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN (sub-key-scoped, not a bare OLD.metadata comparison, so an UPDATE to an unrelated metadata sub-key correctly does not recompute), then recomputes control_pack_evaluated from control_pack_status in the same row/transaction before the write commits. A bare OLD.metadata comparison would not error on INSERT (verified live against PG 17.4: OLD is an all-NULL row via tupdesc, not an unassigned-record error) but would silently skip derivation whenever NEW.metadata is NULL at insert time -- the TG_OP='INSERT' branch closes that gap. strategic_directives_v2's fence_status derivation is NOT implemented in this SD (FR-5 descoped) -- no data flow exists for that instance until a follow-up SD defines a reviewed value-mapping function.";

// components[0]: add presence requirement (was drifted)
prd.system_architecture.components[0].responsibility =
  "BEFORE trigger deriving uat_test_runs.metadata.control_pack_evaluated from control_pack_status (true iff all 4 required keys present AND none equals 'not_attempted' -- waiver-safe, sub-key-scoped guard); no backfill (existing rows are already correct under this predicate)";

// data_contracts[0]: add presence requirement (was drifted)
const dc0 = prd.integration_operationalization.data_contracts[0];
dc0.schema =
  "control_pack_status: jsonb object mapping each of 4 required control keys to 'not_attempted', 'evaluated', or 'waived: <reason>' (canonical derivation source -- true iff all 4 keys present AND none equals 'not_attempted', which correctly counts a waiver as evaluated and deliberately diverges from the app layer's fail-open behavior on an absent key); control_pack_failures: jsonb (array or jsonb null, NOT used for derivation -- ambiguous per its own writer); control_pack_evaluated: boolean, trigger-derived from control_pack_status";

// ---------- risks[0]: correct the fabricated failure mode ----------
prd.risks[0] = {
  risk:
    "FR-3's trigger (the SD's only shipping migration) fires on every write to uat_test_runs touching metadata->'control_pack_status'; a naively-guarded version (bare OLD.metadata comparison) would not error but would silently SKIP derivation whenever an INSERT leaves metadata NULL at insert time, leaving control_pack_evaluated undetermined on those rows",
  probability: 'LOW',
  impact: 'MEDIUM',
  mitigation:
    "Guard with IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN, closing the silent-skip gap on INSERT; TS-1/TS-2/TS-2b/TS-2d/TS-2f/TS-2g (INSERT-path and absent-key fixtures) plus TS-2h (the NULL-metadata INSERT regression) must all pass before this migration ships",
  rollback_plan: 'DOWN sibling drops the trigger; TR-2 requires pre-derivation value capture so control_pack_evaluated can be restored if needed'
};

// ---------- test_scenarios: add the 3 missing scenarios (AC-7, AC-8, absent-single-key) ----------
prd.test_scenarios.push(
  {
    id: 'TS-2g',
    scenario: 'Insert a uat_test_runs fixture with exactly 1 of the 4 required control keys absent from control_pack_status (the other 3 present, non-\'not_attempted\')',
    test_type: 'unit',
    given: "A row where control_pack_status has 3 of 4 required keys set to 'evaluated' and the 4th key is not present in the object at all",
    when: 'The row is inserted',
    then: "metadata.control_pack_evaluated derives to false -- the single-required-key-absent case, distinct from TS-2d (whole key absent), confirming the trigger's deliberate divergence from the app layer's fail-open behavior on this shape"
  },
  {
    id: 'TS-2h',
    scenario: 'Insert a uat_test_runs row with metadata left NULL (or the metadata column omitted, relying on its default) and confirm the trigger still derives a value rather than silently skipping',
    test_type: 'integration',
    given: 'A uat_test_runs INSERT where metadata is NULL at insert time',
    when: 'The row is inserted',
    then: "The TG_OP='INSERT' branch of the guard forces the body to run (rather than short-circuiting on NULL IS DISTINCT FROM NULL = FALSE, which the sub-key-scoped comparison alone would evaluate); control_pack_evaluated is set to false (control_pack_status absent), not left undetermined"
  },
  {
    id: 'TS-2i',
    scenario: 'Insert a uat_test_runs fixture (INSERT path, not UPDATE) with a fully-evaluated control_pack_status and confirm it succeeds without error and derives true',
    test_type: 'integration',
    given: 'A uat_test_runs INSERT with metadata.control_pack_status having all 4 required keys set to a real, non-\'not_attempted\' status',
    when: 'The row is inserted',
    then: 'The INSERT succeeds without error (regression-guards against ever reintroducing a bare, unguarded OLD reference) and metadata.control_pack_evaluated derives to true'
  },
  {
    id: 'TS-2j',
    scenario: "Insert a row, then UPDATE it changing an unrelated metadata sub-key (not control_pack_status), and confirm control_pack_evaluated is left unchanged and the trigger body does not recompute",
    test_type: 'integration',
    given: 'A row whose control_pack_status has already been derived',
    when: "The row is UPDATEd to change a different metadata sub-key (e.g. a timestamp or unrelated field), leaving control_pack_status byte-identical",
    then: "control_pack_evaluated is unchanged and the trigger body does not re-run its derivation logic -- confirms the guard is scoped to metadata->'control_pack_status' specifically, not the whole metadata blob (closes the AC-8 gap: a whole-blob comparison would have recomputed here, since ANY sub-key change makes OLD.metadata IS DISTINCT FROM NEW.metadata true)"
  }
);

writeFileSync(PATH, JSON.stringify(prd, null, 2));
console.log('PRD v4 corrections applied and saved:', PATH);
console.log('Fabricated error-mechanism claim corrected everywhere (FR-3, data_flow, risks[0]).');
console.log('Guard re-scoped to control_pack_status sub-key (resolves AC-8 / BLOCKER-2).');
console.log('components[0]/data_contracts[0] presence-requirement drift fixed (BLOCKER-3).');
console.log('FR-3 "mirrors ... exactly" claim corrected to state the deliberate divergence (BLOCKER-4).');
console.log('4 new test scenarios added (TS-2g/2h/2i/2j) covering AC-7/AC-8/absent-single-key.');
