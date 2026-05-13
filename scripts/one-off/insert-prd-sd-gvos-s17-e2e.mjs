import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-GVOS-S17-E2E-PLAYWRIGHT-ORCH-001';
const SD_ID = '88369ad8-a419-4212-bbde-025a4df5b64e';
const PRD_ID = 'PRD-' + SD_KEY;

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Playwright E2E specs for the 3 GVOS panels (4 spec files)',
    description: '4 new files under tests/e2e/stage17/gvos-*.spec.ts. Cover happy path + 1 edge case per component + 1 Stage17 integration spec verifying composition + DESIGN #3 legacy-venture hide.',
    acceptance_criteria: [
      'gvos-archetype-display.spec.ts: at least 3 test cases (renders with archetype, rationale collapse toggles, locked vs draft badge state)',
      'gvos-composer-preview.spec.ts: at least 3 test cases (default-collapsed, expand reveals 3 tabs, copy button populates clipboard)',
      'gvos-wireframe-artifact-capture.spec.ts: at least 3 test cases (radio source toggle, save success flow, blocked=true disables save)',
      'gvos-s17-integration.spec.ts: at least 2 test cases (composed sections render above existing fidelity flow; legacy venture without venture_gvos_profile sees NO GVOS sections per DESIGN #3)',
      'All assertions pin to data-testid (RISK-1 mitigation) — no class/text-based selectors for stable contracts',
    ],
  },
  {
    id: 'FR-2',
    title: 'Test data seeding helper',
    description: 'Helper under tests/e2e/fixtures/gvos-seed.ts that creates/cleans up venture_gvos_profile + gvos_archetypes rows for a test venture. Per-spec beforeEach/afterEach with tracked ids; cleanup runs in finally().',
    acceptance_criteria: [
      'seedGvosTestVenture(supabase) returns {ventureId, archetypeId} and inserts rows in correct dependency order',
      'cleanupGvosTestVenture(supabase, ids) idempotent — safe to call even if seeding partially failed',
      'No leakage between specs (each test inserts + cleans its own venture row)',
    ],
  },
  {
    id: 'FR-3',
    title: 'Backfill user_stories.e2e_test_path for parent SD-GVOS-S17',
    description: 'One-off script under scripts/one-off/backfill-e2e-test-path-gvos-s17.mjs that sets e2e_test_path on all 7 user stories of SD-GVOS-S17-PROMPT-QUALITY-ORCH-001, mapping each story to the spec file that covers it.',
    acceptance_criteria: [
      'Script invokes once + is idempotent (UPDATE ... WHERE e2e_test_path IS NULL)',
      'All 7 user stories (US-001 through US-007) have e2e_test_path populated post-run',
      'Mapping documented in script comments: FR-1 stories → component specs; FR-5 story → integration spec; FR-6 hook story → integration spec',
      'Smoke query in handoff verifies coverage',
    ],
  },
];

const technical_requirements = [
  { id: 'TR-1', title: 'data-testid contract stability', detail: 'All assertions reference data-testid values defined by the parent SD (DESIGN condition #5). No text/CSS-class assertions allowed (RISK-1 mitigation).' },
  { id: 'TR-2', title: 'Fixture isolation', detail: 'beforeEach/afterEach hooks per spec; cleanup runs in finally() even on test failure (RISK-2 mitigation).' },
  { id: 'TR-3', title: 'Playwright timing', detail: 'Use page.getByRole + explicit waitFor — avoid implicit timing assumptions for Radix Tabs/Collapsible state transitions (RISK-3 mitigation).' },
];

const test_scenarios = [
  { id: 'TS-1', name: 'Archetype panel renders for venture with assigned archetype', steps: 'Seed venture with archetype_id set on venture_gvos_profile. Navigate to S17. Assert archetype-display-panel renders with display_name + prompt_token + good_for_subtitle.', expected: 'All 3 fields visible; lock badge shows Draft (no locked_at); collapsible rationale opens on click.' },
  { id: 'TS-2', name: 'Composer Preview expands + copies', steps: 'Click composer-preview-panel trigger. Click composer-tab-lovable. Click composer-copy-lovable.', expected: 'Tabs visible; Lovable JSON shown in pre; clipboard contains expected JSON.' },
  { id: 'TS-3', name: 'Wireframe artifact capture happy path (github_sync)', steps: 'Select artifact-source-github. Fill artifact-repo-url with valid github.com URL. Click artifact-save-button.', expected: 'artifact-success Alert shows; venture_wireframe_artifact row created in DB.' },
  { id: 'TS-4', name: 'Red-band paste block', steps: 'Seed a venture with sparse lovablePayload (no negative_prompts, no reference_urls) so quality score lands in red band. Verify artifact-save-button is disabled.', expected: 'Save button disabled with "Blocked (red band)" label.' },
  { id: 'TS-5', name: 'Legacy venture hides all GVOS sections (DESIGN #3)', steps: 'Navigate to S17 for a venture WITHOUT a venture_gvos_profile row.', expected: 'No archetype-display-panel, composer-preview-panel, or wireframe-artifact-capture in DOM. Existing fidelity scoring/gate banner/screen grid still works.' },
  { id: 'TS-6', name: 'No regression on existing tests/e2e/stage17/', steps: 'Run the full existing stage17 spec suite.', expected: 'stage17-review-panel.spec.ts passes unchanged.' },
];

const acceptance_criteria = [
  { id: 'AC-1', statement: '4 spec files committed under tests/e2e/stage17/gvos-*.spec.ts with explicit data-testid assertions', from: 'FR-1' },
  { id: 'AC-2', statement: 'Test data seeding helper exists with documented teardown contract', from: 'FR-2' },
  { id: 'AC-3', statement: 'All 7 parent SD user stories have populated e2e_test_path', from: 'FR-3' },
  { id: 'AC-4', statement: 'All E2E specs pass in CI without retry', from: 'TR-3 + RISK-3' },
  { id: 'AC-5', statement: 'No regression on stage17-review-panel.spec.ts', from: 'TS-6' },
];

const risks = [
  { id: 'R-1', domain: 'integration', severity: 'medium', description: 'Tests couple to parent SD-GVOS-S17 component contracts. Refactors break tests.', mitigation: 'Pin to data-testid (DESIGN #5 already populated by parent). No CSS/text selectors.' },
  { id: 'R-2', domain: 'data', severity: 'medium', description: 'venture_gvos_profile + gvos_archetypes seeding teardown leakage.', mitigation: 'Per-spec beforeEach/afterEach; cleanup in finally(); track ids per test.' },
  { id: 'R-3', domain: 'technical', severity: 'low', description: 'Radix Tabs needed userEvent in jsdom unit tests. Playwright on real Chromium should be fine but verify.', mitigation: 'Use page.getByRole + waitFor; no implicit timing.' },
];

const system_architecture = `4 Playwright spec files under tests/e2e/stage17/gvos-*.spec.ts target the just-shipped GVOS components in Stage17BlueprintReview.tsx. Test data seeded via shared helper tests/e2e/fixtures/gvos-seed.ts. Backfill of user_stories.e2e_test_path via one-off script scripts/one-off/backfill-e2e-test-path-gvos-s17.mjs. Reuses existing playwright fixtures (auth + page-object) from tests/e2e/stage17/stage17-review-panel.spec.ts pattern.`;

const integration_operationalization = {
  consumers: [
    { name: 'CI pipeline', role: 'automated', usage: 'Runs Playwright specs on PR merge gate' },
    { name: 'Future SD-GVOS-S17 refactors', role: 'downstream', usage: 'Tests verify contract stability when components evolve' },
  ],
  dependencies: {
    upstream: ['SD-GVOS-S17-PROMPT-QUALITY-ORCH-001 (parent, completed) — provides the 3 GVOS components + data-testid attributes'],
    downstream: ['Future Stage17 refactor SDs will run these as regression gate'],
    failure_handling: 'Test data seeding failure → per-spec cleanup in finally() block; Playwright flake → automated retry once; CI failure → block merge.',
  },
  data_contracts: {
    venture_gvos_profile_seed: '{ venture_id, archetype_id, archetype_selection_method, archetype_selection_confidence, archetype_selection_rationale }',
    cleanup_invariant: 'DELETE removes only the test row by tracked id; never affects production data',
  },
  runtime_config: { env_vars: [], feature_flags: [], notes: 'No new env vars; uses existing Playwright + Supabase test config.' },
  observability_rollout: {
    metrics: ['e2e_pass_rate per spec, e2e_runtime per spec'],
    sentry: [],
    rollout_plan: 'Ship behind no feature flag. Specs run on every PR via existing tests/e2e workflow.',
    rollback_plan: 'Specs can be quarantined via .skip() if found flaky; no production impact.',
  },
};

const prdPayload = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_ID,
  title: 'PRD: GVOS S17 E2E Playwright Coverage',
  version: '1.0.0',
  status: 'in_progress',
  category: 'enhancement',
  priority: 'high',
  executive_summary: 'Adds 4 Playwright E2E spec files covering the 3 GVOS panels shipped by SD-GVOS-S17 (parent, completed). Closes TESTING sub-agent CRIT-1 from the parent retrospective. Backfills user_stories.e2e_test_path on the parent SD\'s 7 stories. Scope ~300 LOC; EHG repo only.',
  business_context: 'Parent SD-GVOS-S17 shipped 6 EXEC PRs adding the GVOS Composer S17 UI with 119 unit tests but no E2E coverage. TESTING sub-agent at EXEC flagged this as CRIT-1 (deferred to follow-up). This SD is that follow-up — adds Playwright specs that catch integration-level regressions unit tests cannot (RLS, routing, Radix state, Stage17 wiring).',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria,
  risks,
  system_architecture,
  integration_operationalization,
  phase: 'planning',
  document_type: 'prd',
};

const { error } = await supabase.from('product_requirements_v2').insert(prdPayload);
if (error) { console.error('INSERT failed:', error); process.exit(1); }

const { data: v } = await supabase
  .from('product_requirements_v2')
  .select('id, status, category, phase, functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks')
  .eq('id', PRD_ID)
  .single();
console.log('PRD created:', v.id);
console.log('  status:', v.status, '/ category:', v.category, '/ phase:', v.phase);
console.log('  FRs:', v.functional_requirements.length, '/ TRs:', v.technical_requirements.length);
console.log('  test_scenarios:', v.test_scenarios.length, '/ acceptance_criteria:', v.acceptance_criteria.length, '/ risks:', v.risks.length);
