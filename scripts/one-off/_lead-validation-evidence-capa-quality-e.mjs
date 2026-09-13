#!/usr/bin/env node
/**
 * LEAD-phase VALIDATION evidence for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (LEAD-TO-PLAN gate).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'bedf5ed9-9b17-4c15-93d7-4c59e25a8939';
const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E';

async function writeValidation(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,

    critical_issues: [
      {
        id: 'C1-the-lint-the-SD-plans-to-reuse-NEVER-READS-THE-REGISTRY',
        severity: 'CRITICAL',
        summary: 'scripts/lint/process-env-feature-flag-lint.mjs does NOT read leo_feature_flags. Its own header (line 2) and its own failure message (line 91) both state the contract "registered in leo_feature_flags OR listed in the allowlist with a reason", but main() implements only `if (name in allow) continue;` — there is no supabase client, no createClient import, and no query anywhere in the 101-line file. Grep for supabase|leo_feature_flags|createClient returns exactly 3 lines: 2, 9 and 91, ALL comments or a console.log string. The only registry the lint actually consults is the 52-entry JSON file scripts/lint/process-env-feature-flag-allowlist.json. CONSEQUENCE FOR SCOPE: P3.1 "a CI lint fails on a non-binding mechanism outside the registry" cannot be delivered by adding --enforce to an existing lint, because the registry half of that lint does not exist yet. It must be built. This is the writer/reader-asymmetry class (a documented contract half-implemented, reading as wired) that this very CAPA programme root-cause class B exists to eliminate, sitting inside the tool child -E was going to lean on.',
      },
      {
        id: 'C2-BOTH-env-var-mechanisms-the-SD-NAMES-are-invisible-to-that-lints-detector',
        severity: 'CRITICAL',
        summary: 'Even with C1 fixed and --enforce turned on, the lint would report 0 ungoverned and MISS all four of the SD own named mechanisms — a green exit predicate proving nothing. Measured against extractEnvFlags() (regex /process\\.env\\.([A-Z][A-Z0-9_]*)/g, gated on NAME_SHAPE /_(V\\d+|ENABLED|FLAG|TOGGLE|REVIEW_EVERY)$/ or BOOLISH_NEAR on/off/enabled/disabled). (a) DESIGN_FIDELITY_GATE_MODE at lib/eva/bridge/customer-facing-design-detector.js:87 is read as `env.DESIGN_FIDELITY_GATE_MODE` off an injected `env` parameter, not `process.env.` — regex MISS; name ends _MODE — NAME_SHAPE MISS; the line compares to the literal "bind" — BOOLISH_NEAR MISS. Triple miss. (b) LEO_THESIS_KILL_GATE at lib/eva/lifecycle/thesis-kill-gate.js:37-41 is read as `process.env[FLAG_NAME]`, bracket notation through an indirected const — regex MISS; name ends _GATE — NAME_SHAPE MISS. Double miss. (c) The two hardcoded constants have no env read at all by construction. COROLLARY, independently confirming the gap is systemic and not specific to -E: the _ENFORCE suffix carried by the two closest sibling rows already in leo_feature_flags (LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE, PATH_INTEGRITY_EXIT_GATE_ENFORCE) is ALSO absent from NAME_SHAPE, so the entire ENFORCE class is invisible to this detector today. The PRD must carry detector extension (name shapes _MODE/_GATE/_ENFORCE, bracket-notation reads, indirected env-param reads) as a first-class FR, or -E ships a lint that is dead by construction while reading as wired.',
      },
      {
        id: 'C3-registering-the-two-HARDCODED-CONSTANTS-as-ordinary-flag-rows-REPEATS-A-CANCELLED-SDs-FAILURE',
        severity: 'CRITICAL',
        summary: 'Confirmed on the live table: leo_feature_flags has 26 rows and NO mechanism_type column (columns are id, flag_key, display_name, description, is_enabled, created_at, updated_at, lifecycle_state, risk_tier, owner_type, owner_id, is_temporary, expiry_at, row_version, gates_what, enablement_criteria, rolled_out_at, last_reviewed_at, target). So the proposed "constant" mechanism_type has no home without a migration. That matters because the two hardcoded mechanisms are genuinely untoggleable: WARN_CAPPED_CATEGORIES (lib/eva/quality-findings/finding-shape.js:78) is an Object.freeze([usability, accessibility, journey_coherence]) with no key string, and VISION_ABSENCE_SEVERITY (lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js:246) is a bare `const VISION_ABSENCE_SEVERITY = "medium";` whose own comment says it is kept as a named constant "for an easy future chairman tightening". Registering either as a normal is_enabled=false row would create a registry row with NO reader, which classifyFlag() (lib/feature-flags/governance-review.js:88-120) would then classify never-reviewed / disabled-aging / stale-off-pending and emit a daily KILL or ENABLE recommendation for a toggle that does not exist. That is precisely the defect that got SD-LEO-FEAT-FLAG-GOVERNANCE-KILL-001 CANCELLED (cancel_reason on the row: "PREMISE DISPROVEN ... flag-gov digest mis-classified load-bearing off-flags as disabled-aging ... Fenced off belt by coordinator 66353a41; do not build"). -E must not manufacture a second generation of that noise. RECOMMENDED ZERO-MIGRATION SHAPE: reuse the in-band marker convention the classifier ALREADY parses — governance-review.js:135 reads /\\[OPERATOR_HOLD/i out of enablement_criteria|description and downgrades KILL to KEEP. Add a sibling [MECHANISM: constant] marker plus one analogous ~6-LOC branch that suppresses enable/kill for constants. Honest, no schema change, and it keeps the constants VISIBLE for graduation review without faking a toggle.',
      },
    ],

    warnings: [
      {
        id: 'W1-P3.2-fits-the-existing-digest-with-ZERO-new-verbs-if-rows-use-the-ENFORCE-convention',
        severity: 'WARNING',
        summary: 'The "there is no retire verb" concern dissolves under the right row modelling, and this materially SHRINKS P3.2. Model each toggleable non-binding mode exactly like the two rows that already exist for this purpose: LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE and PATH_INTEGRITY_EXIT_GATE_ENFORCE, both lifecycle=disabled / is_enabled=false / risk_tier=high, both ALREADY carrying enablement_criteria AND gates_what. In that convention is_enabled=false MEANS non-binding, and the three graduation outcomes map onto verbs that already exist: graduate-to-binding = the existing `enable` recommendation (classifyFlag staleOffPending branch, lines 116 and 56-60, which deliberately ESCALATES a long-disabled pending flag); extend-with-a-date = the existing `extend` verb via the existing expiry_at column and the pastExpiry branch (line 117); retire = the existing `kill` verb (line 118), fail-safed by buildLiveReaderIndex (KILL downgraded to KEEP at line 126 when a live reader exists). No new verb, no new column, no new digest section is strictly required. PLAN should price P3.2 as row-modelling plus wiring, not as a digest rewrite. NOTE the semantic trap that makes the convention direction load-bearing: if a row were modelled the other way (is_enabled=true meaning "observe mode is on"), the digest would classify it enabled-never-rolled-out and recommend `graduate`, whose established meaning per SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001 is "inline the enabled behavior as the permanent path and remove the flag" — i.e. it would recommend making OBSERVE permanent, the exact opposite of the SD intent. The ENFORCE convention avoids this; the PRD must state it explicitly.',
      },
      {
        id: 'W2-two-competing-registries-must-be-reconciled-not-tripled',
        severity: 'WARNING',
        summary: 'Governance for env-var flags is currently split across TWO registries and -E risks adding a third surface. (1) leo_feature_flags, 26 rows, all 26 with last_reviewed_at stamped (the hourly job touches them), 15 with enablement_criteria, 14 with gates_what, but only 11 of 26 with owner_type/owner_id — notably the two ENFORCE-class siblings have owner NULL. (2) scripts/lint/process-env-feature-flag-allowlist.json, 52 entries, of which 49 carry the identical boilerplate reason "Pre-existing process.env feature flag captured in the FR-4 baseline ... governed via allowlist pending registry-enrollment triage" — i.e. the allowlist is largely an un-triaged backlog masquerading as governance, and only 3 entries claim actual registry enrollment. The SD "owner" requirement also needs a decision: there is no owner column, governance is owner_type+owner_id, and the closest siblings leave it NULL. PLAN should (a) name owner_type/owner_id as the owner field and populate it on the new rows, and (b) state whether the new -E rows are allowlisted, registered, or both — without that, a mechanism can be "governed" in one registry and ungoverned in the other.',
      },
      {
        id: 'W3-P3.1-inventory-is-a-SAMPLE-not-a-census-and-the-SD-does-not-say-which',
        severity: 'WARNING',
        summary: 'The SD names four mechanisms. Nothing in the SD, and no artifact in the repo, establishes that four is the complete set — I found no existing non-binding-mode inventory anywhere (grep for non-binding|nonbinding|non_binding across lib/ scripts/ docs/ returns 9 files, all incidental prose, none an inventory). Given C2, the obvious enumeration tool (the env-flag lint) currently cannot produce that census either. The stated RISK line in the SD ("Registry bloat: only modes that gate or score a venture qualify") is a scoping rule, not a census. PLAN should decide explicitly: either (i) -E registers exactly the four named mechanisms and the lint thereafter prevents NEW ones (a ratchet, defensible and small), or (ii) -E owes a census first. Option (i) matches the established baseline-then-ratchet pattern in this repo and is recommended; it should be written down rather than left implicit, because a reader will otherwise take the registry row count as a completeness claim.',
      },
      {
        id: 'W4-exit-predicate-wording-would-import-a-criterion-that-has-no-precedent-CONFIRMS-the-D-pattern',
        severity: 'WARNING',
        summary: 'INDEPENDENTLY CONFIRMED from the sibling rows: the description clause "every preventive child ships its CI-asserted exit predicate in the same PR (ratification 49656c8c) and closes on two consecutive weekly zero readings, never on a merge" must be split when it reaches the PRD. The same-PR CI-asserted predicate is a real, enforceable child obligation. The two-consecutive-weekly-zero-readings clause is the PARENT tracking obligation — sibling SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (status=completed) established exactly that split, and the parent SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001 is live at status=active/PLAN_VERIFICATION to carry it. If -E writes the weekly clause into its own acceptance criteria it becomes uncloseable by construction on a single PR. Scope -E as: registry rows + CI-asserted lint + digest wiring, in its own PR, and stop.',
      },
      {
        id: 'W5-lint-is-advisory-by-TWO-independent-switches-both-must-flip',
        severity: 'WARNING',
        summary: 'Flipping the lint to blocking requires two changes, not one, and the PRD should name both: .github/workflows/process-env-feature-flag-lint.yml line 37 sets `continue-on-error: true`, AND line 38 invokes the script without --enforce (the script exits 0 unless --enforce is passed, lint file line 98). The workflow header says so explicitly ("Flip to blocking (run with --enforce and drop continue-on-error) once the baseline has settled"). GOOD NEWS, checked and clear: the workflow path filter is NOT a gap here — it triggers on **/*.js, **/*.mjs, **/*.cjs and **/*.ts, so it does fire on lib/eva changes. This SD therefore does NOT inherit the path-filter defect class that produced SD a270ca12 (RLS anon-policy ratchet scanning 1 of 3 auto-applied directories).',
      },
    ],

    recommendations: [
      'LEAD: approve to PLAN with the scope CORRECTED to four FRs, not two — (FR1) registry rows, (FR2) lint registry-read + detector extension, (FR3) enforcement flip, (FR4) digest wiring. C1 and C2 mean "reuse the existing lint" is not available as written; PLAN must price building the registry read and widening the detector.',
      'Model toggleable modes as <MECHANISM>_ENFORCE, lifecycle=disabled / is_enabled=false, mirroring LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE and PATH_INTEGRITY_EXIT_GATE_ENFORCE. Populate gates_what (what the mechanism gates), enablement_criteria (the graduation criteria), owner_type/owner_id, risk_tier. This makes P3.2 need zero new digest verbs (W1).',
      'Model the two hardcoded constants with a [MECHANISM: constant] marker in enablement_criteria plus a ~6-LOC classifier branch mirroring the existing [OPERATOR_HOLD] branch at governance-review.js:135. Zero schema migration, and it prevents the daily false ENABLE/KILL recommendations that cancelled SD-LEO-FEAT-FLAG-GOVERNANCE-KILL-001 (C3).',
      'REUSE, do not rebuild: scripts/enroll-env-var-feature-flags.mjs is an existing, idempotent enrollment script that already sets flagKey, displayName, description, gates_what, enablement_criteria, ownerType, ownerId and riskTier via lib/feature-flags/registry.js createFlag/getFlag — precisely the field set P3.1 requires. Extend its FLAGS array; do not write a new enroller.',
      'Write the CI exit predicate so it would FAIL today: the lint must, on the pre-change tree, name the four mechanisms as ungoverned. A predicate that is green before the fix proves only that the detector is blind (C2). Assert detection of at least one bracket-notation read and one injected-env-param read in the lint own unit test.',
      'Add a chairman-decision fence in the PRD: registering a mode and surfacing it for graduation is in scope; setting is_enabled=true on any high-consequence mode is NOT, per ratification b75ddfff and CLAUDE.md prologue item 12. The [OPERATOR_HOLD] marker convention is the existing, correct mechanism for "awaiting a chairman decision" and should be applied to any row whose graduation is chairman-level.',
      'Split the exit predicate per W4 and precedent -D: the same-PR CI-asserted predicate belongs to -E; the two-consecutive-weekly-zero-readings closure belongs to the parent.',
      'State explicitly in the PRD whether the four mechanisms are a census or a seeded baseline-plus-ratchet (W3). Recommended: baseline-plus-ratchet, matching the FR-4 allowlist precedent.',
    ],

    detailed_analysis: JSON.stringify({
      gate: 'GATE 1 - LEAD Pre-Approval',
      verdict_rationale: 'CONDITIONAL_PASS, not BLOCKED and not clean PASS. Not blocked: the duplicate check is negative across a 159-candidate sweep, the one dependency is already completed, no in-flight sibling touches the same files, the target infrastructure genuinely exists and is reusable, and the scope is feasible and correctly bounded to one child. Not clean: three CRITICAL findings are scope corrections LEAD should absorb BEFORE PLAN prices a PRD — the lint the SD leans on never reads the registry (C1), its detector cannot see any of the four named mechanisms (C2), and the obvious modelling of the two hardcoded constants would manufacture exactly the digest noise that already got a sibling SD cancelled (C3). None of the three is a reason to reject; all three change the shape and size of the work.',
      duplicate_check: 'NEGATIVE. Swept 159 candidate SDs across 13 term families (feature_flag, feature flag, flag governance, flag-governance, non-binding, nonbinding, graduat, WARN mode, observe mode, advisory-only, advisory only, shadow mode, enablement_criteria, leo_feature_flags, registry of flags) over title+description+scope. Four nearest neighbours inspected in full, all COMPLETE or CANCELLED and all COMPLEMENTARY rather than duplicative: SD-LEO-FIX-FLAG-GOVERNANCE-REVIEW-001 (completed 2026-09-12, PR #8781) added the isGraduatedInCode marker readback to the SAME digest -E extends — a precedent for code-side markers, not an overlap; SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001 (completed 2026-07-12) ACTED on digest recommendations for 4 specific flags, a consumer of the digest not a change to it; SD-LEO-FEAT-FLAG-GOVERNANCE-KILL-001 (CANCELLED, premise disproven) is the cautionary precedent quoted in C3; SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 (completed 2026-09-13) flipped three specific rows under ratification b75ddfff and is the reason graduation decisions are fenced out of -E. The metadata.dedup_match_sd_key "route-audit-stage-09" is confirmed a keyword false-positive (unrelated dormant venture-stage-9 route audit). No SD, open or closed, proposes a non-binding-mode registry or a registry-backed lint.',
      existing_infrastructure_reusable: {
        'scripts/enroll-env-var-feature-flags.mjs': 'EXISTS (4266 bytes). Idempotent enroller already setting exactly the P3.1 field set including gates_what + enablement_criteria + ownerType/ownerId/riskTier via lib/feature-flags/registry.js. Extend its FLAGS array.',
        'lib/feature-flags/governance-review.js': 'EXISTS, 208 lines, pure staleness classifier. Verbs enable|graduate|graduated|kill|keep|extend|review|reconcile. Two existing in-band marker branches ([OPERATOR_HOLD] at :135, isGraduatedInCode at :147) are the reusable precedent for C3.',
        'lib/feature-flags/flag-reader-scan.js': 'EXISTS. buildLiveReaderIndex uses file-level SUBSTRING matching over lib/scripts/src/api/app/server with comments stripped, so it does NOT share the lint regex gap — it will correctly see DESIGN_FIDELITY_GATE_MODE and LEO_THESIS_KILL_GATE as live-readered and will not false-KILL them. The gap is in the lint only.',
        'leo_feature_flags columns': 'enablement_criteria, last_reviewed_at, gates_what, owner_type, owner_id, risk_tier, expiry_at, rolled_out_at ALL present. NO mechanism_type column and NO singular owner column. Zero schema migration needed IF the marker-convention path (C3) is taken.',
        'scripts/lint precedent': '86 lint artifacts including allowlist-paired lints, so the lint+allowlist+workflow shape is well-established. The env-flag workflow path filter is broad (**/*.js etc) and does NOT have the path-filter gap class.',
      },
      scope_feasibility: 'FEASIBLE and appropriately bounded as ONE child, with a corrected size. Four FRs (registry rows, lint registry-read + detector widening, enforcement flip, digest wiring). Expect the detector widening and the registry read to dominate; the registry rows themselves are data. Likely to exceed the 100 LOC target and need documented justification under the tiered PR guidance — flagged so PLAN prices it honestly rather than discovering it at EXEC.',
      dependency_and_conflict_check: 'CLEAR. dependencies column = [{sd_id: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D}]; -D is status=completed, so -E is not belt-blocked. Parent e76214ff is active/PLAN_VERIFICATION. Of the 9 siblings, -G and -H are active/EXEC and -A is pending_approval with PR #8916 open; git diff of the in-flight -H branch against main shows ZERO files under lib/feature-flags, scripts/lint or flag-governance. No file-level merge conflict risk on this SD file set.',
      evidence_state: 'SD-E had ZERO sub_agent_execution_results rows before this one (checked by both sd_key and uuid). This row supplies VALIDATION at phase=LEAD. Sibling practice shows LEAD-TO-PLAN also wants an Explore row at phase=LEAD — an Explore due-diligence pass was performed for this SD and its findings are corroborated here, but if it did not write its own row it must be invoked separately before handoff.',
      backlog_note: 'sd_backlog_map count not treated as a GATE 1 block for this SD class: every CAPA-001 child carries 0 backlog rows and three (-D, -F, -I) reached status=completed that way. Requirements live in the PRD and success_criteria. Advisory only, consistent with the sibling precedent recorded on SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G.',
      premises_independently_re_measured: [
        'lib/eva/quality-findings/finding-shape.js:78 — WARN_CAPPED_CATEGORIES Object.freeze, no toggle. CONFIRMED.',
        'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js:246 — const VISION_ABSENCE_SEVERITY = "medium", no toggle. CONFIRMED.',
        'lib/eva/bridge/customer-facing-design-detector.js:87 — resolveDesignFidelityGateMode reads env.DESIGN_FIDELITY_GATE_MODE, defaults observe, fails safe. CONFIRMED; ADDS the param-not-process.env detail.',
        'lib/eva/lifecycle/thesis-kill-gate.js:37-41 — process.env[FLAG_NAME] bracket + indirected const, defaults observe. CONFIRMED; ADDS the bracket-notation detail.',
        'All four ABSENT from the live 26-row leo_feature_flags table. CONFIRMED by direct query.',
        'NEW, not in the prior pass: the lint never queries the registry at all (C1).',
        'NEW, not in the prior pass: _ENFORCE is also outside NAME_SHAPE, so the existing ENFORCE-class rows are invisible to the lint too (C2 corollary).',
        'NEW, not in the prior pass: no mechanism_type column exists, so the constant vs env_flag vs db_flag distinction needs the marker convention or a migration (C3).',
      ],
      files_examined: [
        'lib/eva/quality-findings/finding-shape.js',
        'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js',
        'lib/eva/bridge/customer-facing-design-detector.js',
        'lib/eva/lifecycle/thesis-kill-gate.js',
        'lib/feature-flags/governance-review.js',
        'lib/feature-flags/flag-reader-scan.js',
        'scripts/flag-governance-review.mjs',
        'scripts/enroll-env-var-feature-flags.mjs',
        'scripts/lint/process-env-feature-flag-lint.mjs',
        'scripts/lint/process-env-feature-flag-allowlist.json',
        '.github/workflows/process-env-feature-flag-lint.yml',
      ],
    }),

    metadata: {
      sd_key: SD_KEY,
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_found: false,
      duplicate_candidates_swept: 159,
      dedup_field_false_positive: 'route-audit-stage-09',
      dependency_satisfied: true,
      sibling_file_conflicts: 0,
      backlog_items: 0,
      backlog_zero_is_class_normal: true,
      critical_findings: 3,
      warning_findings: 5,
      schema_migration_required: false,
      validation_mode: 'strategic_intent_review',
    },
    phase: 'LEAD',
    summary: 'CONDITIONAL_PASS (confidence 90) — READY for LEAD-TO-PLAN with a corrected scope, four FRs not two. CLEARANCES: duplicate check NEGATIVE across a 159-candidate sweep on 13 term families, with the four nearest neighbours read in full and all complementary rather than duplicative; the metadata.dedup_match_sd_key "route-audit-stage-09" is confirmed a keyword false-positive. The single dependency -D is status=completed so -E is not belt-blocked. No in-flight sibling (-G, -H, -A) touches lib/feature-flags, scripts/lint or flag-governance. Target infrastructure exists and is genuinely reusable: scripts/enroll-env-var-feature-flags.mjs already enrolls with exactly the P3.1 field set, and leo_feature_flags already carries enablement_criteria, last_reviewed_at, gates_what, owner_type/owner_id, risk_tier and expiry_at — NO schema migration is needed. THREE CRITICAL SCOPE CORRECTIONS LEAD SHOULD ABSORB FIRST. (C1) scripts/lint/process-env-feature-flag-lint.mjs never reads leo_feature_flags — its header and its own failure message both claim the registry contract, but main() consults only the JSON allowlist; grep for supabase|leo_feature_flags|createClient returns 3 lines, all comments or a log string. So "a CI lint fails on a non-binding mechanism outside the registry" means BUILDING the registry read, not adding --enforce. (C2) Even then the detector is blind to every mechanism the SD names: DESIGN_FIDELITY_GATE_MODE is read off an injected env param, ends _MODE and compares to "bind" — three independent misses; LEO_THESIS_KILL_GATE uses process.env[FLAG_NAME] bracket notation and ends _GATE — two misses; and _ENFORCE, the suffix on the two closest sibling rows already in the table, is also outside NAME_SHAPE. Without detector widening, -E ships a green lint that proves nothing — the exact dead-by-construction shape this CAPA programme exists to eliminate. (C3) There is NO mechanism_type column, and registering the two genuinely untoggleable constants (WARN_CAPPED_CATEGORIES, VISION_ABSENCE_SEVERITY) as ordinary is_enabled=false rows would make the staleness classifier emit daily false ENABLE/KILL recommendations for toggles that do not exist — reproducing the defect whose cancel_reason cancelled SD-LEO-FEAT-FLAG-GOVERNANCE-KILL-001. Recommended fix needs no migration: a [MECHANISM: constant] marker in enablement_criteria plus a ~6-LOC classifier branch mirroring the [OPERATOR_HOLD] branch already at governance-review.js:135. ONE SIMPLIFICATION IN THE SD FAVOUR: the missing "retire" verb is a non-issue. Model toggleable modes as <MECHANISM>_ENFORCE with is_enabled=false, exactly like LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE and PATH_INTEGRITY_EXIT_GATE_ENFORCE, and graduate/extend/retire map onto the existing enable/extend/kill verbs with zero digest-vocabulary change — but the direction is load-bearing, since the inverse modelling would make the digest recommend making OBSERVE permanent. Finally, CONFIRMED against sibling -D: split the exit predicate — the same-PR CI-asserted predicate is the child obligation, the two-consecutive-weekly-zero-readings closure is the parent obligation. Scope -E as registry rows + CI-asserted lint + digest wiring in its own PR and stop. Expect >100 LOC; flag the justification at PLAN rather than discovering it at EXEC.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const row = await writeValidation(supabase);
  console.log('VALIDATION row:', row.id, '| verdict:', row.verdict, '| confidence:', row.confidence, '| phase:', row.phase);
  console.log('repo_path:', row.metadata?.repo_path, '| executed_from_cwd:', row.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
