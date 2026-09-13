#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001,
 * EXEC_TO_PLAN phase.
 *
 * Records the security review of the stable-dimension-id change set: backfill script
 * mutation gating + query construction, the relaxed dynamic-import filename pattern in
 * scripts/eva/evidence-rubrics/index.js, slug-generation injection/pollution surface, and
 * the additive/read-mostly claim (no endpoint, no credential handling, no RLS/schema change).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001';

const findings = [
  {
    id: 'backfill-mutation-gating-correct',
    severity: 'INFO',
    summary: "scripts/one-off/backfill-dimension-ids-vision-architecture-001.mjs: EVERY mutation is inside `if (EXECUTE)` (line 81); the dry-run path performs only .select(). The update is targeted by primary key (.eq('id', row.id)) -- no mass/unfiltered update. keyCol is NOT user input: it comes from the module-level TABLES constant (vision_key / plan_key, lines 23-26), never from argv/env/DB, so the template-literal select `id, ${keyCol}, extracted_dimensions, addendums` cannot be influenced by an attacker. All other filters use the PostgREST builder (.not/.eq), not string SQL. Service-role client use is appropriate for a maintenance one-off and the write appends an audit entry to the row's existing append-only addendums column.",
  },
  {
    id: 'rubric-loader-import-before-validate',
    severity: 'LOW',
    summary: "scripts/eva/evidence-rubrics/index.js RUBRIC_FILE_PATTERN relaxed from /^(V\\d{2}|A\\d{2}|T\\d{2})-/ to /^[a-z][a-z0-9-]*\\.js$/ and loadAllRubrics() does `await import()` on every match. The import EXECUTES module top-level code BEFORE validateRubric() runs, so validation is not a containment boundary -- any lowercase kebab .js dropped into that directory is executed. Net surface is mixed, not purely wider: the new pattern forbids dots, so *.test.js / *.bak.js / *.mjs no longer match (the old pattern + endsWith('.js') would have imported V01-foo.test.js). Exploitation requires write access to a source directory inside the repo, which already implies arbitrary code execution (index.js itself is editable), so there is no privilege gain. All 20 restored rubric files verified to be pure declarative data objects: zero import/require/eval/child_process/fs/fetch/Function statements (grep across scripts/eva/evidence-rubrics/*.js). Accepted as LOW.",
  },
  {
    id: 'slugify-injection-surface-clean',
    severity: 'INFO',
    summary: "slugifyDimensionName (lib/eva/dimension-ids.js:24) emits strictly [a-z0-9-] with leading/trailing dashes stripped and a 'dim' fallback for empty. Probed with hostile dimension names: '../../etc/passwd'->'etc-passwd' (no traversal), '$(rm -rf /)'->'rm-rf' (no shell metachars), \"a'; DROP TABLE x;--\"->'a-drop-table-x' (no quote/semicolon), NUL-prefixed input -> NUL stripped, '__proto__'->'proto'. No slug can ever contain / \\ . ' \" ; or NUL, so it cannot be used for path traversal, argv injection, or SQL fragment injection. Confirmed no prototype pollution: assignDimensionIds uses object spread (CreateDataProperty semantics, no __proto__ setter invocation) -- a JSON-parsed dimension carrying a literal __proto__ key left Object.prototype clean and the output object's prototype intact. No slug is used to build a file path anywhere in the change set (grep) and no slug reaches disk: generated rubrics persist to eva_vision_rubric_cache (DB), not to files.",
  },
  {
    id: 'slug-reserved-key-latent-hazard',
    severity: 'LOW',
    summary: "slugifyDimensionName CAN emit 'constructor', 'prototype' and 'valueof' (a dimension named 'Constructor' slugs to 'constructor'; the dangerous '__proto__' is NOT reachable because underscores become dashes and are then trimmed). Not exploitable today: every stable-id lookup in the change set goes through Map.get (rubrics Map, existingByName Map), which is prototype-safe, and every plain-object key that is persisted (eva_vision_scores.dimension_scores in vision-scorer.js / vision-heal.js / vision-evidence-scorer.js) remains the positional V0x/A0x code. Recorded so a FUTURE consumer that does obj[stableId] on a plain object uses a Map or Object.create(null) instead.",
  },
  {
    id: 'cross-surface-stable-id-collision',
    severity: 'MEDIUM',
    summary: "INTEGRITY REGRESSION (not a vulnerability) -- the stable id introduces a FLAT namespace shared by vision and architecture dimensions, where the positional V0x/A0x codes it replaces were disjoint BY CONSTRUCTION. lib/eva/rubric-generator.js generateVentureRubrics() builds ONE Map and calls rubrics.set(dimId, rubric) in the vision loop then the arch loop, so a colliding arch rubric SILENTLY OVERWRITES the vision one; scripts/eva/vision-evidence-scorer.js then resolves BOTH dimensions via rubrics.get(dbDim.stableId) to the same surviving rubric. MEASURED AGAINST LIVE DATA (read-only, 301 vision rows / 227 arch rows, 3477 dimensions, 0 missing ids post-backfill): 51 of 227 vision<->architecture pairs (22%) already share at least one stable id. Concrete specimen VISION-VENTURE-FUNDAMENTALS-L2-001 <-> ARCH-VENTURE-FUNDAMENTALS-001, 8 dims each, 3 collisions: id='exit-readiness' is vision V02 (weight 0.20) AND arch A04 (weight 0.15); also 'operational-standards' (V03 w=0.15 / A05 w=0.10) and 'vendor-portability' (V08 w=0.05 / A08 w=0.10) -- distinct scoring targets on distinct surfaces with distinct weights collapsing onto one rubric. This is the SAME defect class the SD exists to fix (one code silently meaning a different dimension), re-expressed across the vision/arch boundary, and it lands on GATE-READ evidence: eva_vision_scores.dimension_scores -> total_score -> threshold_action, consumed by lib/handoff/threshold-resolver.js identifyRubric() at LEAD-TO-PLAN / PLAN-TO-LEAD. Existing cached rubric maps are NOT retro-poisoned (pre-change entries are positionally keyed and still hit the `|| rubrics.get(dbDim.id)` fallback); the exposure is forward-looking, on newly generated maps. FIX IS AT THE MAP LAYER ONLY, no re-backfill needed: namespace the rubric-map key by surface (e.g. v:<stableId> / a:<stableId>) in rubric-generator.js and mirror it in vision-evidence-scorer.js's lookup. The persisted extracted_dimensions[].id needs no change -- it is unique within its own row.",
  },
  {
    id: 'additive-read-mostly-confirmed',
    severity: 'INFO',
    summary: "Change-set claim CONFIRMED against the staged diff (39 files, +1160/-44). NO database/migrations/*.sql, NO policy/RLS file, NO 'ENABLE ROW LEVEL SECURITY' / 'CREATE POLICY' / 'GRANT' line. NO new external-facing surface: zero app.get/post/put/delete, router., express(, createServer. NO new code-execution primitive: zero child_process, execSync, spawn(, eval(, new Function, innerHTML, dangerouslySetInnerHTML. NO new credential handling: the backfill reuses the existing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars via the standard createClient pattern and hard-codes nothing. Secret scan of the full staged diff (sk-*, eyJ* JWT, inline SERVICE_ROLE_KEY/api_key/password literals) returned zero hits. Persisted-surface compatibility preserved: eva_vision_scores.dimension_scores keys stay positional, stable_id/id_kind are additive fields only.",
  },
];

const warnings = [
  "MEDIUM integrity finding cross-surface-stable-id-collision is the one item that should not ship unaddressed: 22% of live vision/arch pairs already collide, and the affected score feeds a handoff gate. Security-specific questions (1-4) all pass; this is scoring integrity, not a vulnerability, hence CONDITIONAL_PASS rather than BLOCKED.",
  "loadAllRubrics() executes matched files before validating them. Safe under the current all-trusted-source-files model; revisit if generated/LLM-authored rubrics are ever written to that directory on disk.",
];

const recommendations = [
  "Namespace the rubric-map key by surface in lib/eva/rubric-generator.js (rubrics.set with a v:/a: prefix) and mirror it in scripts/eva/vision-evidence-scorer.js's lookup chain. Map-layer only; extracted_dimensions[].id and the persisted dimension_scores format are unaffected, so no re-backfill and no schema change.",
  "Add a regression test asserting that a vision dimension and an architecture dimension sharing a name resolve to DIFFERENT rubrics (specimen: VISION-VENTURE-FUNDAMENTALS-L2-001 'Exit Readiness' V02 vs ARCH-VENTURE-FUNDAMENTALS-001 'Exit Readiness' A04).",
  "Optional hardening for the rubric loader: require an explicit suffix (*.rubric.js) or a checked-in manifest, so an unrelated .js landing in scripts/eva/evidence-rubrics/ is not auto-imported.",
  "If any future consumer indexes a plain object by stable id, use a Map or Object.create(null): 'constructor'/'prototype'/'valueof' are reachable slug values ('__proto__' is not).",
];

const summary = "SECURITY review of the stable-dimension-id change set: CONDITIONAL_PASS. No vulnerability found. Backfill mutation is correctly gated behind --execute with a PK-targeted update and a fixed internal keyCol (no injection vector); slug charset [a-z0-9-] forecloses path traversal, shell/SQL injection and prototype pollution (verified by hostile-input probe); the relaxed rubric filename regex is LOW risk (import-before-validate, but requires repo write access that already implies code execution, and all 20 restored files are inert declarative data); additive/read-mostly claim confirmed -- no endpoint, no credential handling, no RLS/schema change, no secrets. ONE MEDIUM INTEGRITY REGRESSION: the stable id creates a flat vision+architecture namespace where V0x/A0x were disjoint by construction, so a colliding arch rubric silently overwrites the vision rubric in generateVentureRubrics and both dimensions score against the same rubric. Measured live: 51/227 vision-arch pairs (22%) already collide (specimen: 'exit-readiness' = vision V02 w=0.20 AND arch A04 w=0.15). This feeds eva_vision_scores -> threshold_action, read by lib/handoff/threshold-resolver.js at LEAD-TO-PLAN/PLAN-TO-LEAD. Fix is map-layer only (surface-prefix the rubric key); no re-backfill required.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      review_scope: 'staged change set, 39 files, +1160/-44',
      checks_performed: [
        'backfill --execute mutation gating + PK-targeted update + keyCol provenance',
        'PostgREST query construction / string-interpolation injection review',
        'dynamic import() filename-pattern surface in evidence-rubrics/index.js',
        'static analysis of all 20 restored rubric files for executable side effects',
        'hostile-input probe of slugifyDimensionName (traversal/shell/SQL/NUL/__proto__)',
        'prototype-pollution probe of assignDimensionIds with JSON __proto__ key',
        'stable-id usage audit: path construction, plain-object indexing, SQL fragments',
        'live read-only cross-surface stable-id collision measurement (528 rows, 3477 dims)',
        'secret scan of full staged diff',
        'new-external-surface scan (routes/servers/exec primitives/RLS/migrations)',
      ],
      artifacts_read: [
        'scripts/one-off/backfill-dimension-ids-vision-architecture-001.mjs',
        'lib/eva/dimension-ids.js',
        'scripts/eva/evidence-rubrics/index.js',
        'scripts/eva/evidence-rubrics/ (20 restored rubric files)',
        'scripts/eva/vision-evidence-scorer.js',
        'lib/eva/rubric-generator.js',
        'lib/eva/rubric-cache.js',
        'scripts/eva/vision-scorer.js',
        'scripts/eva/vision-heal.js',
        'lib/eva/vision-upsert.js',
        'lib/eva/archplan-upsert.js',
        'lib/eva/vision-dimensions-extractor.js',
        'lib/eva/feedback-dimension-classifier.js',
        'lib/eva/cli-authority-tracker.js',
        'lib/eva/cli-write-gate.js',
        'lib/eva/compute-posture-scorer.js',
        'lib/eva/data-contract-scorer.js',
        'scripts/one-off/vision-architecture-dimension-001-lead-explore-evidence.mjs',
      ],
      live_measurement: {
        method: 'read-only select on eva_vision_documents + eva_architecture_plans',
        vision_rows: 301,
        arch_rows: 227,
        dimensions_total: 3477,
        dimensions_missing_id: 0,
        vision_arch_pairs_checked: 227,
        pairs_with_colliding_stable_ids: 51,
        specimen: "VISION-VENTURE-FUNDAMENTALS-L2-001 <-> ARCH-VENTURE-FUNDAMENTALS-001: exit-readiness (V02 w=0.20 / A04 w=0.15), operational-standards (V03 w=0.15 / A05 w=0.10), vendor-portability (V08 w=0.05 / A08 w=0.10)",
      },
      security_checklist: {
        new_authentication_surface: false,
        new_authorization_surface: false,
        rls_changes: false,
        schema_migration: false,
        new_external_endpoint: false,
        new_credential_handling: false,
        hardcoded_secrets: false,
        injection_vector_introduced: false,
        privilege_escalation_path: false,
        data_exposure_introduced: false,
      },
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
