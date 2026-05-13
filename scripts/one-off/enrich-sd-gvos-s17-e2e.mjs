import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-GVOS-S17-E2E-PLAYWRIGHT-ORCH-001';
const PARENT_KEY = 'SD-GVOS-S17-PROMPT-QUALITY-ORCH-001';

const description = 'Adds Playwright E2E test coverage for the three GVOS panels shipped by SD-GVOS-S17 (ArchetypeDisplayPanel + ComposerPreviewPanel + WireframeArtifactCapture in Stage17BlueprintReview). Closes the TESTING sub-agent CRIT-1 gap flagged during SD-GVOS-S17 EXEC and populates user_stories.e2e_test_path for the 7 user stories shipped by the parent.';

const scope = `SCOPE:
1) Playwright E2E specs under tests/e2e/stage17/gvos-*.spec.ts:
   - gvos-archetype-display.spec.ts — venture with assigned archetype renders the panel; rationale collapsible opens; locked-badge state
   - gvos-composer-preview.spec.ts — panel default-collapsed; expanding reveals 3 tabs; quality badge color matches threshold; copy button works
   - gvos-wireframe-artifact-capture.spec.ts — radio toggling between github_sync/zip_upload/inline_html; save flow + success Alert; red-band block via blocked prop
   - gvos-s17-integration.spec.ts — Stage17BlueprintReview renders all 3 GVOS sections above existing fidelity flow; legacy ventures without venture_gvos_profile see no sections (DESIGN #3 verification)

2) Test fixtures:
   - Seed a test venture with venture_gvos_profile + at least 1 gvos_archetype assignment
   - Mock or seed lovable_artifact data for capture display assertions
   - Reuse existing playwright fixtures (auth, page-object) — match existing tests/e2e/stage17/ patterns

3) user_stories.e2e_test_path population:
   - For each of the 7 user stories of SD-GVOS-S17 (US-001 through US-007), set e2e_test_path to the matching spec
   - Validates the feature SD profile's requires_e2e_in_acceptance_criteria=true requirement

OUT OF SCOPE:
- E2E for the parent SD-GVOS-COMPOSER (separate concern, paused-pending)
- Visual regression / screenshot diffing (deferred to follow-up if needed)
- Performance benchmarks (FR-8 of parent, separately deferred)
- Lovable MCP integration (chairman uses manual copy/paste workflow)`;

const key_changes = [
  { title: 'Playwright E2E specs (4 files)', detail: 'New tests/e2e/stage17/gvos-*.spec.ts covering the 3 GVOS panels independently plus 1 integration spec for Stage17BlueprintReview composition.' },
  { title: 'Test data seeding', detail: 'Seed/mock helper to populate venture_gvos_profile + gvos_archetypes assignment for a test venture, enabling reliable per-test setup.' },
  { title: 'user_stories.e2e_test_path backfill', detail: 'Populate e2e_test_path on the 7 user stories of SD-GVOS-S17 (parent) to satisfy requires_e2e_in_acceptance_criteria=true gate at PLAN.' },
  { title: 'CI integration', detail: 'Confirm the new specs run under the existing tests/e2e/ workflow; no new GitHub Actions workflow needed.' },
];

const strategic_objectives = [
  { title: 'Close TESTING CRIT-1 from SD-GVOS-S17', detail: 'The retro recorded a deferred CRIT for E2E gap. This SD is the explicit follow-up.' },
  { title: 'Catch Stage17 integration regressions', detail: 'Unit tests mock the 3 sub-components; only E2E catches actual Stage17 wiring + responsive layout + Radix Tabs/Collapsible state regressions.' },
  { title: 'Validate DESIGN condition #3 empirically', detail: 'Verify legacy ventures (no venture_gvos_profile) see zero GVOS sections — DESIGN sub-agent flagged this for explicit empirical confirmation.' },
  { title: 'Backfill PLAN-side e2e_test_path gap', detail: 'Parent SD-GVOS-S17 shipped without e2e_test_path populated (TESTING sub-agent CRIT-2). This SD closes that loop.' },
];

const success_criteria = [
  { title: 'E2E spec count', target: '4 spec files committed under tests/e2e/stage17/gvos-*.spec.ts, each with at least 3 test cases covering happy + edge + degraded paths.' },
  { title: 'All E2E specs pass in CI', target: 'tests/e2e/ workflow green on the merge PR; no flaky retries needed.' },
  { title: 'Legacy-venture path empirically verified', target: 'gvos-s17-integration.spec.ts has at least 1 test asserting NO GVOS sections render when venture lacks venture_gvos_profile.' },
  { title: 'e2e_test_path populated on parent stories', target: 'user_stories.e2e_test_path set on all 7 stories of SD-GVOS-S17-PROMPT-QUALITY-ORCH-001.' },
  { title: 'No regression on existing tests/e2e/stage17/', target: 'stage17-review-panel.spec.ts (from SD-LEO-INFRA-S17-PLAYWRIGHT-COVERAGE-001) still passes unchanged.' },
];

const dependencies = [
  { sd_id: PARENT_KEY, reason: 'Parent SD-GVOS-S17 is the SD this work tests. Status=completed; merged into main; all 3 GVOS panels live. This SD is the explicit follow-up the parent retro called out (TESTING CRIT-1 deferred).' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'cd to ehg repo and run: npx playwright test tests/e2e/stage17/gvos-archetype-display.spec.ts', expected_outcome: 'All test cases pass. ArchetypeDisplayPanel renders correctly for ventures with assigned archetype; hides for legacy ventures.' },
  { step_number: 2, instruction: 'Run: npx playwright test tests/e2e/stage17/gvos-composer-preview.spec.ts', expected_outcome: 'Default-collapsed state verified; tab switching works; quality badge color matches severity threshold; copy button populates clipboard.' },
  { step_number: 3, instruction: 'Run: npx playwright test tests/e2e/stage17/gvos-wireframe-artifact-capture.spec.ts', expected_outcome: 'Radio toggling renders correct form per source type; save flow shows success Alert with file count; blocked=true disables save button.' },
  { step_number: 4, instruction: 'Run: npx playwright test tests/e2e/stage17/gvos-s17-integration.spec.ts', expected_outcome: 'Stage17BlueprintReview renders all 3 GVOS sections above existing fidelity flow when venture has venture_gvos_profile; renders no GVOS sections for legacy ventures (DESIGN #3).' },
  { step_number: 5, instruction: 'Query DB: SELECT story_key, e2e_test_path FROM user_stories WHERE story_key LIKE \'SD-GVOS-S17-PROMPT-QUALITY-ORCH-001:%\' ORDER BY story_key;', expected_outcome: 'All 7 stories (US-001 through US-007) have e2e_test_path populated pointing to a spec file under tests/e2e/stage17/gvos-*.spec.ts.' },
  { step_number: 6, instruction: 'Run the full existing tests/e2e/stage17/ suite: npx playwright test tests/e2e/stage17/', expected_outcome: 'Pre-existing stage17-review-panel.spec.ts and any other stage17 specs still pass — no regression from new specs.' },
];

const { data: parent } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', PARENT_KEY).single();
console.log('Parent UUID:', parent?.id);

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ description, scope, key_changes, strategic_objectives, success_criteria, dependencies, smoke_test_steps, sd_type: 'enhancement' })
  .eq('sd_key', KEY);
if (error) { console.error('UPDATE failed:', error); process.exit(1); }

const { data: v } = await supabase.from('strategic_directives_v2').select('sd_type, current_phase, status, description, scope, key_changes, strategic_objectives, success_criteria, dependencies, smoke_test_steps').eq('sd_key', KEY).single();
console.log('Enriched SD-GVOS-S17-E2E-PLAYWRIGHT-ORCH-001:');
console.log('  sd_type:', v.sd_type, '| phase:', v.current_phase, '| status:', v.status);
console.log('  description len:', v.description.length);
console.log('  scope len:', v.scope.length);
console.log('  key_changes:', v.key_changes.length);
console.log('  strategic_objectives:', v.strategic_objectives.length);
console.log('  success_criteria:', v.success_criteria.length);
console.log('  dependencies:', v.dependencies.length);
console.log('  smoke_test_steps:', v.smoke_test_steps.length);
