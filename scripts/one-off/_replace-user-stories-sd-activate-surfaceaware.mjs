#!/usr/bin/env node
/**
 * Replace the 4 auto-generated boilerplate user stories on
 * SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 with 3 FR-mapped quality
 * stories that pass the LEO user-story quality rubric (feature SD = STRICT, 55% threshold).
 *
 * Rubric dimensions (scripts/modules/rubrics/user-story-quality-rubric.js):
 *  - acceptance_criteria_clarity_testability (50%) — concrete pass/fail; feature SDs
 *    need >=1 HUMAN-VERIFIABLE (user-observable) criterion or the dimension caps at 6/10.
 *  - story_independence_implementability (30%) — real implementation_context w/ file paths + steps.
 *  - benefit_articulation (15%) — benefit tied to a chairman-observable outcome.
 *  - given_when_then_format (5%) — GWT read from acceptance_criteria objects (given/when/then fields).
 *
 * Shape: acceptance_criteria are OBJECTS with { id, criterion, given, when, then, testable,
 * human_verifiable } so formatAcceptanceCriteria shows the criterion text AND
 * extractGwtFromAcceptanceCriteria surfaces the GWT scenarios.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '00d9049a-a0f8-42d8-b222-22979d56f2e0';
const SD_KEY = 'SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001';
const PRD_ID = `PRD-${SD_KEY}`;
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Apply the wireframe_screens surface migration and backfill existing rows',
    user_role: 'EHG platform engineer activating the surface-aware wireframe pipeline',
    user_want: 'to apply the additive, reversible wireframe_screens migration (surface + page_type columns) via the database-agent and then run scripts/backfill-wireframe-screen-surfaces.mjs (dry-run for sign-off, then apply) so every existing wireframe screen is classified marketing, auth, or app',
    user_benefit: 'so that the chairman reviewing a venture’s wireframes sees each screen correctly labelled as marketing, auth, or app, and the Stage 18 marketing-copy generator has a trustworthy surface signal to ground copy on — closing the schema/data half of the built-but-never-wired gap',
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-1-1',
        criterion: 'After the migration applies, wireframe_screens has a surface TEXT column with CHECK (surface IN (\'marketing\',\'auth\',\'app\')) and a nullable page_type TEXT column; existing rows are preserved (no data loss).',
        given: 'A database where wireframe_screens exists without the surface/page_type columns',
        when: 'The database-agent applies database/migrations/20260520_add_surface_columns_to_wireframe_screens.sql',
        then: 'information_schema shows both columns present, the surface CHECK constraint is enforced, and SELECT COUNT(*) FROM wireframe_screens is unchanged',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-1-2',
        criterion: 'The backfill --dry-run prints a marketing|auth|app classification summary and a sample of proposed updates and writes nothing.',
        given: 'The migration has applied and rows exist with surface IS NULL',
        when: 'An operator runs node scripts/backfill-wireframe-screen-surfaces.mjs --dry-run',
        then: 'The console prints the per-class counts and a 10-row sample, and a follow-up query confirms zero rows changed',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-1-3',
        criterion: 'A non-technical reviewer opening a venture’s wireframe screens after the backfill sees every screen tagged with exactly one of marketing, auth, or app and none left blank.',
        given: 'The backfill has been applied for a venture that has wireframe screens',
        when: 'A reviewer looks at that venture’s wireframe screens',
        then: 'Each screen shows a single surface label (marketing, auth, or app) and there are no blank/unlabelled screens',
        testable: true,
        human_verifiable: true
      },
      {
        id: 'AC-1-4',
        criterion: 'After apply, 100% of wireframe_screens rows have a non-null surface, with indeterminate screen names defaulting to app (most restrictive).',
        given: 'Rows with ambiguous screen names that match neither the marketing nor auth classifier rules',
        when: 'The backfill applies classifySurface() to those rows',
        then: 'Those rows are assigned surface=app and a final SELECT COUNT(*) WHERE surface IS NULL returns 0',
        testable: true,
        human_verifiable: false
      }
    ],
    implementation_context: '## Implementation\n\n**Files (already shipped on main; this story APPLIES them, no new surface logic):**\n- `database/migrations/20260520_add_surface_columns_to_wireframe_screens.sql` — ADD COLUMN IF NOT EXISTS surface (CHECK marketing|auth|app) + page_type; reversible DROP COLUMN down-block.\n- `database/migrations/20260520_backfill_wireframe_surface_rollback.sql` — documented reset-to-NULL rollback.\n- `scripts/backfill-wireframe-screen-surfaces.mjs` — reuses canonical classifySurface(); --dry-run / --limit; idempotent upsert in batches of 100; indeterminate → app.\n\n**Steps:**\n1. Apply the migration via the database-agent sub-agent (additive + reversible; do not hand-edit the SQL).\n2. Run the backfill with --dry-run; review the marketing|auth|app summary and sample diff; record sign-off.\n3. Apply the backfill (no --dry-run); confirm zero null surface rows afterwards.\n\n**Out-of-scope:** Any change to classifySurface() or the surface enum — that logic shipped in children B/C. This story only activates schema + data.',
    metadata: { fr_mapping: 'FR-1,FR-2', source: 'manual_replacement_post_quality_gate' }
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Wire the Stage 15 marketing wireframe into Stage 18 copy generation behind the flag',
    user_role: 'EVA venture operator running a venture through Stage 18 marketing copy',
    user_want: 'the EVA stage runner to thread the surface-tagged Stage 15 wireframe_screens artifact into analyzeStage18MarketingCopy as stage15WireframeData (instead of the current null), gated on EVA_SURFACE_AWARE_ENABLED, so the marketing wireframe actually shapes the generated copy at runtime',
    user_benefit: 'so that, with the flag on, the marketing copy for a venture is visibly grounded in that venture’s own landing/marketing wireframe (hero, sections, CTAs) rather than generic copy — a difference the chairman can read directly — while flag-off leaves every existing venture’s copy byte-for-byte unchanged',
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-2-1',
        criterion: 'The Stage 18 invocation in the EVA runner passes the surface-tagged wireframe_screens artifact as stage15WireframeData (no longer null).',
        given: 'A venture that has a stored surface-tagged wireframe_screens artifact from the Stage 15 post-hook',
        when: 'The EVA stage runner invokes the Stage 18 analysis step for that venture',
        then: 'analyzeStage18MarketingCopy receives a non-null stage15WireframeData argument (verified via test/log instrumentation)',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-2-2',
        criterion: 'With EVA_SURFACE_AWARE_ENABLED=true and a marketing screen present, the Stage 18 prompt context includes the marketing wireframe key_components and ascii_layout plus conversion-copy directives.',
        given: 'The flag is on and stage15WireframeData contains a surface=marketing screen',
        when: 'analyzeStage18MarketingCopy builds the LLM prompt',
        then: 'resolveMarketingWireframe returns that screen and its key_components + ascii_layout are injected into the prompt context block',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-2-3',
        criterion: 'A reviewer reading the Stage 18 marketing copy for a venture that has a marketing wireframe sees the copy reference that wireframe’s hero/sections when the flag is on, and sees the prior generic copy when the flag is off.',
        given: 'The same venture run once with the flag on and once with the flag off',
        when: 'A reviewer reads the generated landing_hero / app_store_desc sections from each run',
        then: 'The flag-on copy reflects the venture’s marketing wireframe content while the flag-off copy matches the pre-activation output',
        testable: true,
        human_verifiable: true
      },
      {
        id: 'AC-2-4',
        criterion: 'With EVA_SURFACE_AWARE_ENABLED=false (or no marketing screen present), the Stage 18 prompt is identical to the pre-activation baseline (flag-off parity / graceful fallback).',
        given: 'The flag is off, or the flag is on but stage15WireframeData has no marketing screen',
        when: 'analyzeStage18MarketingCopy builds the prompt',
        then: 'No surface-aware context is injected and the prompt string equals the baseline prompt for the same inputs',
        testable: true,
        human_verifiable: false
      }
    ],
    implementation_context: '## Implementation\n\n**Files to touch (EHG_Engineer, forked from main in this worktree):**\n- `lib/eva/stage-templates/stage-18.js` — TEMPLATE.analysisStep = analyzeStage18MarketingCopy; the runner that invokes analysisStep assembles its params here / in the worker.\n- `lib/eva/stage-execution-worker.js` — the EVA stage runner. Its S15 post-hook already stores the surface-tagged wireframe_screens artifact (flag-gated). This story threads that artifact into the Stage 18 analysisStep call as stage15WireframeData.\n- `lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js` — analyzeStage18MarketingCopy already accepts stage15WireframeData (default null) and injects context when EVA_SURFACE_AWARE_ENABLED===\'true\' via resolveMarketingWireframe(). No change needed here beyond confirming the contract.\n\n**Steps:**\n1. Locate where the Stage 18 analysisStep params are assembled in the runner/worker (search for the stage-18 template invocation).\n2. Read the venture’s wireframe_screens artifact (the surface-tagged one written by the S15 post-hook) and pass it as stage15WireframeData.\n3. Add a unit/integration test asserting (a) non-null stage15WireframeData reaches S18, (b) flag-on injects the marketing block, (c) flag-off prompt parity.\n\n**Out-of-scope:** Flipping the flag (separate, human-gated step). resolveMarketingWireframe / classifySurface logic (already shipped).',
    metadata: { fr_mapping: 'FR-3,FR-6', source: 'manual_replacement_post_quality_gate' }
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Validate surface tagging end-to-end on Cron Canary + 3 archetype fixtures with flag-off parity',
    user_role: 'LEAD operator validating the activation before and after the flag flip',
    user_want: 'to validate surface tagging on the Cron Canary venture (09b7037e) and the three archetype fixtures (SaaS, marketplace, content), asserting at least one marketing surface and zero null surface on each, and to confirm flag-off parity and full reversibility before declaring the pipeline live',
    user_benefit: 'so that the chairman has confidence the activation works across diverse venture archetypes (not just the single live venture), produces no regression for existing ventures when the flag is off, and can be reverted instantly if anything looks wrong',
    priority: 'high',
    acceptance_criteria: [
      {
        id: 'AC-3-1',
        criterion: 'Running the Cron Canary venture 09b7037e through Stage 15 then Stage 18 with the flag on yields at least one marketing surface and zero null surface.',
        given: 'EVA_SURFACE_AWARE_ENABLED=true and the Cron Canary venture 09b7037e',
        when: 'The venture is run through Stage 15 then Stage 18',
        then: 'Its wireframe screens contain >=1 surface=marketing and 0 surface IS NULL',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-3-2',
        criterion: 'Each of the three archetype fixtures (SaaS, marketplace, content) passes the surface invariant: >=1 marketing surface and 0 null surface.',
        given: 'The three archetype fixtures with the flag on',
        when: 'Each fixture is run through the surface invariant checks',
        then: 'All three report >=1 marketing surface and 0 null surface',
        testable: true,
        human_verifiable: false
      },
      {
        id: 'AC-3-3',
        criterion: 'A reviewer comparing the marketing copy produced with the flag off against the pre-activation baseline for the same venture sees no differences (parity), confirming no regression for existing ventures.',
        given: 'A venture run with EVA_SURFACE_AWARE_ENABLED=false after activation',
        when: 'A reviewer compares its Stage 18 marketing copy to the pre-activation baseline output',
        then: 'The two outputs are equivalent — the reviewer can confirm nothing changed for flag-off ventures',
        testable: true,
        human_verifiable: true
      },
      {
        id: 'AC-3-4',
        criterion: 'Activation is fully reversible: the backfill resets via the rollback SQL and the feature reverts by setting EVA_SURFACE_AWARE_ENABLED=false, and marketing-safe context retains CSRF/validation/rate-limit/CAPTCHA/OAuth-allowlist guidance.',
        given: 'The activated pipeline with the flag on',
        when: 'An operator sets EVA_SURFACE_AWARE_ENABLED=false (and, if needed, runs 20260520_backfill_wireframe_surface_rollback.sql)',
        then: 'Stage 18 returns to baseline behavior with no code change, and the marketing-surface context (when on) still includes the security guidance directives',
        testable: true,
        human_verifiable: false
      }
    ],
    implementation_context: '## Implementation\n\n**Validation targets:**\n- Cron Canary venture id `09b7037e-cf6e-4057-9143-910c25c70788` (the sole live venture).\n- Three archetype fixtures: SaaS, marketplace, content (validate at the surface enum boundary, NOT only the single live venture).\n\n**Files / harness:**\n- `lib/eva/wireframe-surface-normalizer.js` — canonical surface tagging + marketing-survival invariant used by the assertions.\n- Existing surface-invariant tests under `tests/` (the children B/C/E shipped these); extend or run them with the flag toggled.\n\n**Steps:**\n1. With the flag ON, run Cron Canary S15→S18 and assert >=1 marketing surface and 0 null surface.\n2. Run the 3 archetype fixtures through the invariant checks; assert the same per fixture.\n3. With the flag OFF, re-run the same inputs and diff Stage 18 output against the pre-activation baseline (assert parity).\n4. Confirm reversibility: document the rollback SQL path and the flag-off revert; confirm marketing-safe security guidance is retained in the injected context.\n\n**Out-of-scope:** Authoring new surface logic; the flag flip itself (human-gated). This story is validation + reversibility evidence.',
    metadata: { fr_mapping: 'FR-4,FR-5', source: 'manual_replacement_post_quality_gate' }
  }
];

(async () => {
  // Step 1: delete the auto-generated boilerplate stories
  const { error: dErr } = await supabase.from('user_stories').delete().eq('sd_id', SD_UUID);
  if (dErr) { console.error('delete failed:', dErr.message); process.exit(1); }
  console.log('Deleted existing user_stories for', SD_KEY);

  // Step 2: insert the 3 quality stories. GWT lives inside acceptance_criteria objects;
  // also mirror into given_when_then column for any consumer that reads it.
  const rows = stories.map((s) => ({
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: s.story_key,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    priority: s.priority,
    status: 'ready',
    acceptance_criteria: s.acceptance_criteria,
    given_when_then: s.acceptance_criteria.map(ac => ({ given: ac.given, when: ac.when, then: ac.then })),
    implementation_context: s.implementation_context,
    implementation_status: 'pending',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    story_points: s.priority === 'critical' ? 5 : 3,
    metadata: s.metadata
  }));

  const { data: inserted, error: iErr } = await supabase.from('user_stories').insert(rows).select('id, story_key');
  if (iErr) { console.error('insert failed:', iErr.message); process.exit(1); }

  console.log('Inserted', inserted.length, 'quality user stories:');
  inserted.forEach(r => console.log('  ' + r.story_key + ' (id: ' + r.id.slice(0, 8) + '...)'));
})();
