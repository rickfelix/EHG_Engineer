require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveSubAgentRepo, applySubAgentRepoVerdict } = require('../../lib/sub-agents/resolve-repo.js');
const { storeSubAgentResults } = require('../../lib/sub-agent-executor/results-storage.js');
const { buildTestExecution } = require('../../lib/sub-agents/testing/test-execution-record.js');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '4003f694-8f38-4c3f-9f6e-c11655bfcfdc';
const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

const FINDINGS = [
  {
    id: 'F1',
    severity: 'HIGH',
    title: 'FR-3 mock-venture fixture did not specify how to call resolveVentureRoles() for a synthetic venture',
    detail: 'resolveVentureRoles(baseRows, overlayRows, pins, ventureId, budgetDistribution) is a pure function requiring explicit baseRows/overlayRows/pins arrays -- it cannot be invoked with just a venture id, and does not read the database itself. The PRD did not specify how EXEC should obtain these for a purely synthetic mock venture.',
    fix: 'FR-3 now specifies the exact in-memory build path: baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE), pins = one {role_key, base_version:1, overlay_version:null} entry per row, overlayRows = [], matching the proven pattern already used in tests/unit/org/role-registry-equivalence.test.mjs (buildPinsForAllRoles). Applied to FR-3.requirement + new FR-3.AC-3.'
  },
  {
    id: 'F2',
    severity: 'HIGH',
    title: "FR-2's organization-object shape was underspecified and its own illustrative example used fields that do not exist in the real resolver output",
    detail: "resolveVentureRoles() returns FLAT per-role objects (mergeRoleLayers flattens structure/function/norms) limited to the 11 fields in ROLE_FIELD_KEYS. FR-2's original FM-1.2 example ('function.workflows step contradicts structure.mandate') referenced a 'workflows'/'mandate' vocabulary that exists only in the Solomon design doc's aspirational description of the base_versions JSONB columns, not in the live resolver or any live base row. This would have forced EXEC to guess a shape mid-build. Also, MAST modes about tasks/handoffs (FC2/FC3) have no corresponding concept anywhere in the live schema.",
    fix: 'FR-2 description now pins the exact real, flat 11-field role shape, corrects the FM-1.2 example to use real fields (post_stage_mandate vs stage_ownership on one role), and defines a documented synthetic-extension convention (organization.tasks[]/organization.handoffs[]) for task/handoff-level fixtures, with a docblock requirement (AC-2) to label real vs synthetic fields per fixture.'
  },
  {
    id: 'F3',
    severity: 'MEDIUM',
    title: 'Cross-entity MAST checks (FM-2.4, FM-2.5) risked a single-candidate fixture that can only prove filtering, not comparison',
    detail: "This session's established gotcha (hit twice already): a fixture set with only ONE candidate can prove a check detects presence/absence, never that it correctly discriminates a broken entity from a correct one in a comparison. FM-2.4 (information withholding) and FM-2.5 (ignored other agent's input) are inherently cross-entity by definition.",
    fix: 'Added FR-2.AC-4: any fixture whose failure mode is inherently a cross-entity comparison must include >=2 roles/tasks/handoffs, at least one well-formed, so the check is proven to discriminate rather than merely detect.'
  },
  {
    id: 'F4',
    severity: 'HIGH',
    title: "FR-4's stated mechanism ('query information_schema directly') does not work with this repo's available tooling",
    detail: "Verified live during this review: PostgREST (the @supabase/supabase-js client) 404s (PGRST205) on any .from('information_schema...') read -- information_schema is not exposed. This repo's own existing check_column_exists RPC (referenced by lib/validation/schema-dependency-checker.js's fallback chain) also does not exist live (PGRST202). Also verified live: a plain `.select(column).limit(1)` against a genuinely-absent column returns Postgres error code 42703, which IS usable proof of column absence via the existing service-role client. RLS grants cannot be read via PostgREST at all -- this repo's own proven pattern for live RLS assertions (e.g. tests/integration/creative-asset-variant-scores-rls.db.test.js) uses a raw pg client via scripts/lib/supabase-connection.js's createDatabaseClient(), gated by the DB_TIER *.db.test.js convention (tests/helpers/db-available.js).",
    fix: 'FR-4 description, TR-5, system_architecture (checks/integrity technology + data_flow + integration_points), and TS-5 now specify the concrete, verified-working mechanism: select-and-42703-check (service-role client) for column absence, raw pg client (createDatabaseClient()) under the DB_TIER-gated *.db.test.js convention for RLS grants.'
  },
  {
    id: 'F5',
    severity: 'HIGH',
    title: "TR-3's 'canonical JSON.stringify (sorted keys)' wording is ambiguous and its natural literal reading is a confirmed-broken implementation",
    detail: 'Verified live: `JSON.stringify(obj, Object.keys(obj).sort())` -- the most natural first-pass reading of "sorted keys" -- silently drops ALL nested object content (the array-form replacer only allow-lists top-level keys; any nested object serializes as `{}`). Since the organization input is deeply nested (roles nested inside ceo/executives/crews), this bug would make content_hash trivially pass a shallow determinism check while failing to actually incorporate nested organization data, undermining FR-1 AC-3 and the A4 non-replayability guarantee it exists to prove. This repo already has two private (unexported) recursive sorted-keys stringify implementations for this exact purpose: lib/sub-agent-executor/evidence-provenance.js stableStringify() (used for this very content_hash chain on sub_agent_execution_results) and lib/gvos/snapshot-locker.js sortKeys()/canonicalJSON().',
    fix: 'TR-3 reworded to require a genuinely recursive sorted-keys stringify; new TR-6 spells out the exact broken alternative to avoid (with the live-verified repro) and directs EXEC to export/reuse the existing stableStringify() (preferred, already wired to this results chain) or canonicalJSON()/sortKeys() rather than hand-rolling a third copy.'
  }
];

const summary = `PLAN-TO-EXEC TESTING review of ${SD_KEY} (PRD-${SD_KEY}), a pre-implementation review since no code has been written yet. Reviewed the PRD content against the live resolveVentureRoles() resolver (lib/org/role-registry-resolver.mjs), the live org_role_base_versions/org_role_venture_overlays schema (database/chairman-gated/20260914_org_role_registry_*.sql, verified live against the database), the existing tests/unit/org/role-registry-equivalence.test.mjs and role-registry-migration-shape.test.mjs conventions, and live-probed the DB directly for information_schema/RPC/column-existence/canonical-JSON claims the PRD made. Found 5 concrete, EXEC-blocking or EXEC-risking gaps (2 HIGH-severity shape/mechanism gaps that would have forced mid-EXEC guessing, 1 HIGH-severity confirmed-broken hashing footgun, 1 HIGH-severity nonexistent-tooling claim, 1 MEDIUM single-candidate mutation-testing risk) and applied concrete fixes directly to both scripts/one-off/org-acceptance-suite-prd-content.json and the product_requirements_v2 DB row (functional_requirements, technical_requirements [added TR-6], system_architecture, test_scenarios, integration_operationalization). No blocking gaps remain unresolved; the PRD is ready for EXEC.`;

const results = {
  verdict: 'PASS',
  confidence_score: 90,
  summary,
  critical_issues: [],
  warnings: [
    'Several MAST fixtures (FM-1.4, FM-2.1, FM-1.3) remain definitional proxies for live-runtime behaviors, by design and explicitly labeled per FR-2 -- not a gap this review is closing, just carried forward as documented scope.',
  ],
  recommendations: FINDINGS.map((f) => `[${f.severity}] ${f.title} -- FIX APPLIED: ${f.fix}`),
  detailed_analysis: {
    review_type: 'PLAN-phase prospective review (pre-implementation) -- no code exists yet to execute',
    findings: FINDINGS,
    files_reviewed: [
      'lib/org/role-registry-resolver.mjs',
      'database/chairman-gated/20260914_org_role_registry_base.sql',
      'database/chairman-gated/20260914_org_role_registry_overlay_pin.sql',
      'tests/unit/org/role-registry-equivalence.test.mjs',
      'lib/validation/schema-dependency-checker.js',
      'lib/sub-agent-executor/evidence-provenance.js',
      'lib/gvos/snapshot-locker.js',
      'scripts/lib/supabase-connection.js',
      'tests/helpers/db-available.js',
      'tests/integration/creative-asset-variant-scores-rls.db.test.js',
    ],
    live_probes_run: [
      "org_role_base_versions / org_role_venture_overlays / org_role_venture_pins confirmed to EXIST live (contra the base migration file's own 'NOT applied to any environment by this SD' header, which was scoped to the SD that authored the file, not the current live state)",
      "sb.from('information_schema.columns')... -> PGRST205 (not exposed via PostgREST)",
      "sb.rpc('check_column_exists', ...) -> PGRST202 (function does not exist live, despite being referenced by lib/validation/schema-dependency-checker.js's fallback chain)",
      "sb.from('org_role_base_versions').select('venture_id').limit(1) -> error 42703 'column does not exist' (usable live proof of absence)",
      "sb.from('org_role_venture_overlays').select('norms').limit(1) -> error 42703 (usable live proof of absence)",
      "JSON.stringify({b:1,c:{y:2}}, Object.keys({b:1,c:{y:2}}).sort()) -> '{\"b\":1,\"c\":{}}' (confirms the array-replacer canonical-JSON footgun drops nested content)",
    ],
    prd_edits_applied: [
      'scripts/one-off/org-acceptance-suite-prd-content.json: FR-2, FR-3, FR-4 requirement/description/AC text; TR-3 reworded; new TR-6 added; system_architecture (overview, components, data_flow, integration_points); test_scenarios TS-1/TS-5/TS-8; integration_operationalization.dependencies',
      'product_requirements_v2 row PRD-SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001: functional_requirements, technical_requirements, system_architecture, test_scenarios, integration_operationalization columns updated to match the content file 1:1 (verified by re-read after write)',
    ],
  },
  metadata: {
    // No code exists yet (PLAN-phase prospective review) -- there is nothing to run tests
    // against, so this is an honest "nothing to measure" row, not an unmeasured claim of a
    // measured run. measured:false is the required explicit declaration (see
    // lib/sub-agent-executor/testing-verdict-guard.js).
    measured: false,
    test_execution: buildTestExecution({
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      runner: 'N/A (PLAN-phase prospective review, no code written yet)',
      source: 'PRD content + live resolver/schema/test-convention review + live DB probes (information_schema/RPC/column-absence/canonical-JSON) -- see detailed_analysis.live_probes_run',
    }),
  },
};

(async () => {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    fallback: 'EHG_Engineer',
    supabase: sb,
  });
  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { code: 'TESTING', name: 'Testing' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' }
  );

  console.log('Stored sub_agent_execution_results row:', JSON.stringify({
    id: stored?.id,
    sd_id: stored?.sd_id,
    sub_agent_code: stored?.sub_agent_code,
    verdict: stored?.verdict,
    phase: stored?.phase,
    source: stored?.source,
  }, null, 2));
})().catch((err) => {
  console.error('STORE ERROR', err);
  process.exit(1);
});
