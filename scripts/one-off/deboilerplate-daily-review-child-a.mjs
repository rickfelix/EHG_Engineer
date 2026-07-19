import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-A';

const key_changes = [
  {
    change: 'Add lib/eva/daily-review/doc-data-generator.js exporting generateDailyReviewContent(supabase, opts) — composes the canonical roadmap (roadmap_waves + roadmap_wave_items, same resolveCanonicalRoadmap() source plan-check-status.js uses) into a plan-of-record section (per-wave item counts, calibrated probability = confidence_score, overall %, and an optimistic/expected/pessimistic forecast date range from recent completion velocity) plus a narrative section (SDs completed since a configurable window + SDs currently in_progress).',
    impact: 'Gives siblings B (SMS text), C (Drive Doc), D (MMS-Gantt) one shared, tested data contract instead of each re-deriving roadmap/SD queries independently.',
  },
  {
    change: 'Add formatDailyReviewText(content) rendering the structured output into the chairman-facing PLAN CHECK-style text block (Slipped/Committing/Done tone, per CLAUDE_ADAM.md format) for consumers that need plain text (SMS, Doc body) rather than raw JSON.',
    impact: 'Removes duplicate formatting logic from downstream children — one canonical rendering, testable independent of delivery mechanism.',
  },
  {
    change: 'Reuse lib/roadmap/plan-check-status.js::computePlanCheckStatus() and lib/roadmap/canonical-roadmap.js::resolveCanonicalRoadmap() rather than re-querying roadmap_waves/roadmap_wave_items from scratch — inherits the already-fixed "done ≠ stamped" correctness fix and single-canonical-roadmap scoping.',
    impact: 'Avoids re-introducing bugs (e.g. counting cancelled-SD-linked items as done) that were already found and fixed in the shared roadmap-status module.',
  },
];

const strategic_objectives = [
  'Produce a single, tested, reusable data/content generator for the 5:45 AM chairman daily-review automation that all 3 delivery-mechanism children (B/C/D) can consume without re-deriving roadmap or SD-delta queries themselves.',
  'Keep the generator a pure data/content function with zero delivery-mechanism coupling (no SMS/Drive/MMS calls) so it is buildable and testable now, independent of the still-pending Drive-provisioning decision for sibling C.',
];

const success_criteria = [
  {
    criterion: 'generateDailyReviewContent() returns a plan-of-record section with, per canonical-roadmap wave: item counts (total + promoted), calibrated probability (roadmap_waves.confidence_score), progress_pct, and an overall percentage across all waves.',
    measure: 'Unit test asserts the returned shape against a seeded fake-Supabase fixture with 2+ waves and mixed item dispositions.',
  },
  {
    criterion: 'generateDailyReviewContent() returns a forecast date range (optimistic/expected/pessimistic) derived from actual SD completion velocity over a configurable lookback window, with an explicit "insufficient_data" state when velocity is zero or remaining count is zero.',
    measure: 'Unit test covers both the velocity>0 and velocity=0 branches and asserts optimistic <= expected <= pessimistic when a forecast is produced.',
  },
  {
    criterion: 'generateDailyReviewContent() returns a narrative section listing SDs completed within a configurable window (default 24h) and SDs currently status=in_progress, sourced directly from strategic_directives_v2 (not scoped to only roadmap-linked SDs).',
    measure: 'Unit test seeds SDs with completion_date inside/outside the window and asserts correct inclusion/exclusion; asserts in_progress SDs appear regardless of roadmap linkage.',
  },
  {
    criterion: 'formatDailyReviewText() renders the structured content into a plain-text block usable as-is by an SMS body or a Doc body, with no delivery-mechanism-specific formatting (no HTML, no MMS media references).',
    measure: 'Unit test snapshots the formatted text against a fixed seeded content object and asserts key sections (plan-of-record, narrative) are present.',
  },
];

const implementation_guidelines = [
  'Reuse resolveCanonicalRoadmap() and the roadmap_waves/roadmap_wave_items query shape already established in lib/roadmap/plan-check-status.js — do not re-derive canonical-roadmap resolution logic.',
  'Query strategic_directives_v2 directly for the narrative section (completed_since / in_flight) rather than scoping through roadmap_wave_items — the child SD description explicitly asks for "SDs completed + in-flight", not just roadmap-linked ones.',
  'Velocity/forecast calculation must not depend on sd_execution_baselines (the older baseline-snapshot system used by scripts/sd-burnrate.js) being populated — compute velocity directly from strategic_directives_v2.completion_date over a lookback window so the generator has no external-state dependency beyond the two tables it already reads.',
  'All Supabase queries must use the injected service-role client (RLS silently returns zero rows under anon/authenticated — same caveat documented in plan-check-status.js).',
  'Keep the module free of any Twilio/Google Drive/SMS import — those belong to children B/C/D, not this data-generator.',
];

const success_metrics = [
  { metric: 'Test coverage', target: '≥80% coverage on lib/eva/daily-review/doc-data-generator.js' },
  { metric: 'Zero regressions', target: '0 existing tests broken (full-repo regression pass)' },
  { metric: 'Shared reuse', target: 'Both computePlanCheckStatus() and resolveCanonicalRoadmap() imported and reused, not reimplemented' },
];

const smoke_test_steps = [
  {
    instruction: 'Run generateDailyReviewContent(supabase) against a live Supabase service-role client (canonical roadmap present).',
    expected_outcome: 'Returns an object with plan_of_record.waves (array) and narrative.completed_since/in_flight (arrays) populated or empty — never throws.',
  },
  {
    instruction: 'Run `npx vitest run tests/unit/eva/daily-review-doc-data-generator.test.js`.',
    expected_outcome: 'All test cases pass, including the velocity=0/no-canonical-roadmap edge cases.',
  },
  {
    instruction: 'Call formatDailyReviewText() on the live-query result from step 1.',
    expected_outcome: 'Returns a non-empty plain-text string containing both a plan-of-record section and a narrative section, with no HTML or delivery-mechanism-specific markup.',
  },
];

const risks = [
  {
    risk: 'No canonical roadmap exists yet (resolveCanonicalRoadmap returns null) in some environments/tests.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'generateDailyReviewContent() returns plan_of_record.available=false with a reason string instead of throwing, so downstream children can render a graceful "no roadmap" state rather than crashing the whole daily-review run.',
  },
  {
    risk: 'Forecast velocity is noisy with very few recent completions (e.g. 1 completed SD in the lookback window produces an unstable date range).',
    impact: 'low',
    likelihood: 'medium',
    mitigation: 'Mirrors the existing confidence-tiering pattern from scripts/sd-burnrate.js (low/medium/high by completedCount thresholds) so callers can decide whether to surface a shaky forecast.',
  },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      success_criteria,
      implementation_guidelines,
      success_metrics,
      smoke_test_steps,
      risks,
    })
    .eq('sd_key', SD_KEY);
  if (error) { console.error(error); process.exit(1); }
  console.log(`De-boilerplated ${SD_KEY}.`);
}

main();
