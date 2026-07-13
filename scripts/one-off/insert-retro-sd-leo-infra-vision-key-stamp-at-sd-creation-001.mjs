#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'de26be15-23a8-4be6-aaa2-9e6e8f9cb4fa';
const SD_KEY = 'SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 92,
  title: `Retrospective: ${SD_KEY} — Closing Loop L7 of the Vision Loop-Completeness Map`,
  description:
    'The VISION_FIDELITY_GATE (PLAN-TO-LEAD) had never executed a single real evaluation in its history: 2142/2142 prior evaluations short-circuited with skipped_reason=no_vision_key, because no SD-creation code path ever stamped sd.metadata.vision_key. This closes loop L7 of the ratified Vision Loop-Completeness Map (f2b64a94). The fix looked like a one-line gap-fill but was actually three independently-broken layers stacked on top of each other, all three of which had to be found and fixed for the gate to produce a real verdict rather than a differently-worded no-op: (1) lib/sd-creation/pipeline.js never stamped metadata.vision_key at the single shared insert convergence point (createSD()) used by every SD-creation lane (direct-args, --from-proposal, --child, --from-plan, --from-feedback, UAT, learn) — fixed by adding a DEFAULT_VISION_KEY constant and a gap-fill stamp that only fires when metadata.vision_key is absent, mirroring the existing FR-3 min_tier_rank gap-fill block already in the same function; (2) lib/sub-agents/vision-fidelity/index.js\'s loadVisionDocument() and loadArchPlan() queried a column literally named "key" on eva_vision_documents / eva_architecture_plans, but neither table has ever had a key or title column — the real FK columns are vision_key and plan_key — confirmed by directly querying the live Postgres schema rather than trusting the sub-agent source code\'s field names; without this second fix, stamping vision_key alone would have just changed the skip reason from no_vision_key to a silent "vision_key not found" advisory-pass, and the gate would still never have produced a real verdict; (3) a pre-existing tool from an earlier SD, scripts/lineage/backfill-vision-key.mjs (built specifically to backfill vision_key onto recent SDs), had an update payload writing smoke_test_passed_at and runtime_observed_at — columns that belong to entirely unrelated tables (scope_completion_chain / bypass_ledger / goal_evaluator_verdicts / contract_chain_links) and do not exist on strategic_directives_v2 — so every backfill write had been silently failing (the script reported success for every processed row) since the tool was written; fixed by removing the two phantom columns and running the corrected tool live against the recent-open-SD cohort (its own built-in 50-item safety cap, respected as-is), confirmed live via error:null on every row and a post-run spot-check showing metadata.vision_key genuinely persisted (906 total SDs now carry vision_key). Coverage: 6 unit tests on the createSD() gap-fill predicate (mirroring the established tier-rank-starvation-durable-fix.test.js FR-3 convention, since createSD() has too many DB/side-effect dependencies for a clean direct unit test) plus 3 real-DB integration tests (HAS_REAL_DB-gated) that confirm the canonical vision_key resolves to a real row, confirm executeVisionFidelity() reaches a genuine PASS/FAIL/WARNING verdict via an injected LLM stub (zero real LLM cost) for a vision_key-carrying fixture SD, and confirm the un-stamped-legacy-SD baseline is unchanged (negative case).',
  affected_components: [
    'lib/sd-creation/pipeline.js',
    'lib/sub-agents/vision-fidelity/index.js',
    'scripts/lineage/backfill-vision-key.mjs',
    'tests/unit/fleet/vision-key-stamp-at-creation.test.js',
    'tests/integration/vision-key-stamp-gate-evaluates.test.js',
  ],
  what_went_well: [
    'Did not stop at the surface-level fix: after stamping metadata.vision_key in createSD() (fix #1), actually ran executeVisionFidelity() end-to-end against the live DB instead of trusting the metadata write alone — that verification step is what surfaced fix #2 (the key vs vision_key/plan_key column mismatch in the gate\'s own document loader), which would otherwise have shipped a fix that LOOKED complete (metadata.vision_key populated) while the gate kept silently no-oping under a different skip reason.',
    'Root-caused the column-name bug by directly querying the live Postgres schema rather than trusting the sub-agent source code\'s field names — caught that .eq(\'key\', visionKey) silently returns null/empty on Supabase rather than throwing, which is exactly the class of bug that produces no error signal at all, only a permanently-empty result.',
    'Discovered a third, unrelated bug (the backfill tool\'s phantom-column update payload) purely as a side effect of trying to use that tool to close the vision_key coverage gap, rather than shipping the createSD() stamp alone and leaving the corpus-backfill problem for later — a live spot-check (not trusting the script\'s own reported success) confirmed zero rows had ever actually been updated by the pre-existing tool before this fix.',
    'Mirrored an existing, directly analogous precedent (the FR-3 min_tier_rank gap-fill block already in createSD()) rather than inventing a new stamping pattern, and mirrored an existing test convention (tier-rank-starvation-durable-fix.test.js) for the same reason — both choices reduced review surface and kept the fix consistent with how the codebase already solves "stamp a default if absent, never overwrite an explicit value."',
    'The FR-4 integration test exercises the full resolve-and-evaluate path against the live DB (real vision_key resolution + a real PASS/FAIL/WARNING verdict via an injected LLM stub) rather than stopping at a metadata-presence assertion — a metadata-presence-only test would have passed both before and after fix #2 was applied, so it would not have caught the actual defect this SD needed to close.',
  ],
  what_needs_improvement: [
    'The backfill tool\'s phantom-column failure mode was completely silent: Supabase\'s .update() with an invalid column name in the payload fails the whole update, but the script only logged the per-row error field into its own results array rather than surfacing or throwing it, so a --dry-run looked identical to a real run that was quietly failing on every single write since the tool was first built.',
    'This SD only closes the forward-looking gap (new SDs from this point forward get stamped) plus a bounded 50-item recent-open-SD backfill; 3312 in-scope SDs still lack vision_key after this batch, and the tool\'s 50-item cap is an intentional safety boundary rather than something this SD chose to widen — a full historical backfill is a separately-scoped, larger decision.',
    'The vision-fidelity gate has now moved from 100%-skipped to live-evaluating, but every one of its 2142 prior evaluations was a skip — there is zero historical signal on what real PASS/FAIL/WARNING/CONDITIONAL_PASS verdict distribution to expect, so the first batch of genuine verdicts needs to be watched deliberately for false-positive noise rather than assumed correct because the gate finally "ran."',
  ],
  action_items: [
    {
      title: 'Verify column names against the live schema, not sibling code\'s field names, for any new Supabase .eq()/.update() call',
      description: 'A wrong column name in a .select()/.eq() filter fails silently on Supabase (returns null/empty) rather than throwing — the loadVisionDocument()/loadArchPlan() key-vs-vision_key bug in this SD produced no error signal for as long as the gate existed. Any future author touching a table they didn\'t just read the live schema for should query the live schema directly before writing the filter.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
    {
      title: 'Require a full resolve-and-evaluate integration test for any gate whose sub-agent depends on a metadata key resolving to a real row',
      description: 'A metadata-presence-only test (asserting metadata.vision_key is set) would not have caught this SD\'s fix #2 defect. tests/integration/vision-key-stamp-gate-evaluates.test.js (FR-4 of this SD) is the pattern to reuse: exercise the full resolve-and-evaluate path against the live DB, not just a presence check, for any future gate with the same shape.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Audit other "collect results with an error field, never throw" writer scripts for the same silent-failure shape',
      description: 'scripts/lineage/backfill-vision-key.mjs reported success for every processed row while writing zero real updates, since it collected the per-row error field into its own results array instead of asserting results.every(r => !r.error) before declaring success. Any future or existing writer script following this same shape should get that assertion added.',
      priority: 'medium',
      owner_role: 'operator',
    },
    {
      title: 'Scope a dedicated full-historical vision_key backfill if the chairman wants full corpus coverage',
      description: '3312 in-scope SDs still lack vision_key after this SD\'s 50-item batch (the tool\'s intentional safety cap, not a bug). Worth a separately-scoped follow-up SD if the chairman wants coverage beyond "recent open SDs."',
      priority: 'low',
      owner_role: 'LEAD',
    },
    {
      title: 'Watch the first batch of real vision-fidelity verdicts for false-positive noise',
      description: 'The gate will now start producing genuine PASS/FAIL/WARNING/CONDITIONAL_PASS verdicts for new SDs going through PLAN-TO-LEAD, with zero prior live traffic to calibrate against (all 2142 prior evaluations were skips). Monitor the first real-verdict batch before trusting its signal at face value.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
  ],
  key_learnings: [
    'A metadata gap-fill that "looks complete" (the field is populated) is not the same as a working gate — this SD would have shipped a fix that looked done after fix #1 alone, but only running executeVisionFidelity() end-to-end against the live DB surfaced that the gate\'s own document loader queried a nonexistent column and would have kept silently no-oping under a different skip_reason string.',
    'Supabase .eq()/.select() filters against a wrong or nonexistent column name do not throw — they silently return null/empty, which produces zero error signal. This is a distinct and more dangerous failure mode than a thrown exception because nothing in normal operation flags it; it can only be caught by directly querying the live schema or by an integration test that asserts a real, non-empty resolved result.',
    'A writer script that "collects results with an error field but never throws or asserts on it" can report success on every row while writing nothing at all — scripts/lineage/backfill-vision-key.mjs did exactly this since the day it was written, and a --dry-run looked identical to a silently-failing real run. Any future writer script in this shape needs an explicit results.every(r => !r.error) assertion before its own summary declares success.',
    'When a fix targets a gate that has literally never produced a real verdict (100% skip rate across 2142 evaluations), the correct verification bar is "did I watch it produce an actual PASS/FAIL/WARNING," not "did the input the gate reads look correct" — the two are not the same thing, and this SD needed to fail that self-check twice (once on the missing stamp, once on the wrong column name) before it actually passed.',
    'Mirroring an existing, already-reviewed pattern in the same function (the FR-3 min_tier_rank gap-fill) for a new gap-fill of the same shape reduces both implementation risk and review burden compared to inventing a new stamping mechanism — the same logic applies to reusing an existing test-file convention when a function has too many side effects for a clean direct unit test.',
  ],
  metadata: {
    sd_key: SD_KEY,
    source: 'manual_insert',
    loop_closed: 'L7 (Vision Loop-Completeness Map, f2b64a94)',
    prior_gate_state: '2142/2142 evaluations skipped (skipped_reason=no_vision_key)',
    backfill_result: '906 total SDs now carry vision_key (50-item cohort cap respected; 3312 in-scope SDs remain unbackfilled)',
    bugs_fixed_count: 3,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing } = await supabase
  .from('retrospectives')
  .select('id')
  .eq('sd_id', SD_UUID)
  .eq('retro_type', 'SD_COMPLETION')
  .maybeSingle();

if (existing) {
  console.log(`[insert-retro] SD_COMPLETION retro already exists: ${existing.id} — skipping (idempotent no-op).`);
  process.exit(0);
}

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select('id, quality_score, created_at')
  .single();

if (insertErr) {
  console.error('[insert-retro] Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`[insert-retro] Inserted retrospective ${inserted.id} (quality_score=${inserted.quality_score}, created_at=${inserted.created_at})`);

if (inserted.quality_score !== retro.quality_score) {
  console.log(`[insert-retro] DB trigger computed quality_score=${inserted.quality_score} (target was ${retro.quality_score}) — keeping trigger's value, no correction needed.`);
}
