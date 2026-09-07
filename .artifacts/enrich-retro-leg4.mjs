import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = '8fa57b2f-ed34-4da1-ba23-331b0535a769';

const { data: existing, error: fetchErr } = await supabase
  .from('retrospectives')
  .select('key_learnings, action_items, success_patterns, failure_patterns, what_needs_improvement, sub_agents_involved')
  .eq('id', RETRO_ID)
  .single();

if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const newKeyLearnings = [
  {
    learning: "A scoped grep for the removed constant's NAME (HEALTHY_VERDICTS, 8 files) is not sufficient to find every call site that needs updating for a scoring-rule change. CI's full Unit Tier caught a 9th file -- tests/unit/cron/drive-report-sweep.test.js -- that never imported HEALTHY_VERDICTS by name at all; it called the real production wiring (scoreCapacityLeg) end-to-end and hardcoded a literal expected point value (.toBe(0) for SURPLUS) that baked in the OLD behavior with zero textual connection to the constant being replaced.",
    is_boilerplate: false
  },
  {
    learning: "When changing a scoring/behavior rule, grep for hardcoded VALUES the rule produces (e.g. the literal point numbers) in end-to-end/integration tests, not just for the NAME of the constant being replaced -- integration tests exercise the real function and can encode the old behavior as a bare literal.",
    is_boilerplate: false
  },
  {
    learning: "Local `npx vitest run` scoped to the specific files touched is not equivalent to CI's full Unit Tier -- the missed 9th file above passed silently because it was never in the locally-run test scope; only the full-repo CI run surfaced it. For scoring-rule changes with wide production wiring, budget time for CI's full run rather than treating a local targeted run as sufficient sign-off before opening the PR.",
    is_boilerplate: false
  },
  {
    learning: "Chairman ratifications (be6e9d73 under ffebbd68) must be cited verbatim in source comments AND in the runtime citation objects (predicate/limitation fields) -- this SD did both, which made the VALIDATION sub-agent's audit trivial: grep for the hex ID found it in 3 places (JSDoc, points.predicate, points.limitation).",
    is_boilerplate: false
  },
  {
    learning: "Renaming a function parameter to force a loud failure for stale callers does not automatically achieve that outcome -- the `healthy` array param was renamed to `earning` (points map) so a stale caller would 'fail loudly (TypeError)' per the PRD risk register, but JS destructuring silently ignores an unrecognized key: a stale healthy: caller now falls through to the ratified default instead of throwing. Verified benign (zero remaining callers pass healthy:, and the fallback IS the correct ratified value), but the stated failure mode was not actually achieved by the rename alone -- a rename is not a substitute for an explicit unknown-key guard when the goal is fail-loud.",
    is_boilerplate: false
  },
  {
    learning: "A stale worktree (24 commits behind origin/main after an unrelated merge) is normal in a heavily parallel fleet; `git merge origin/main` (fast-forward, no conflicts) before continuing phase work is safe when the incoming unrelated commits (this time: an unrelated michael email/calendar feature) do not touch your SD's files.",
    is_boilerplate: false
  }
];

const newFailurePatterns = [
  "Grepping for a removed constant's NAME finds direct importers but misses integration/end-to-end tests that exercise the changed function's real production wiring and assert a literal VALUE the old rule produced -- those tests have zero textual connection to the constant, so a name-scoped grep silently passes over them until CI's full Unit Tier runs.",
  "A stated risk-mitigation ('rename so a stale caller fails loudly with a TypeError') can read as satisfied by the code change that inspired it (the rename happened) while the actual runtime behavior (silent fallback, not a thrown error) diverges from what the mitigation promised -- verify the claimed failure mode with a runtime probe, not just the presence of the rename."
];

const newSuccessPatterns = [
  "Citing a chairman ratification (be6e9d73 under ffebbd68) verbatim in BOTH the source JSDoc comment AND the runtime citation objects (points.predicate / points.limitation) made the VALIDATION sub-agent's audit trivial: grep for the hex ratification ID found it in exactly the 3 expected places.",
  "Fast-forwarding a worktree that is 24 commits behind origin/main via `git merge origin/main` (clean fast-forward, no conflicts) before continuing phase work is a safe, routine move in a heavily parallel fleet when the incoming unrelated commits do not touch the SD's files."
];

const newActionItems = [
  { action: "For scoring/behavior-rule changes, grep for the literal VALUES the old rule produced (e.g. hardcoded point numbers like .toBe(0)) inside integration/end-to-end test files, not just the NAME of the constant being removed.", category: "testing", is_boilerplate: false },
  { action: "Budget time for CI's full Unit Tier run (not just a locally-scoped vitest run on touched files) before opening a PR for any scoring-rule change with wide production wiring.", category: "process", is_boilerplate: false },
  { action: "Apply database/chairman-gated/20260807_belt_capacity_verdicts.sql (still chairman-gated, unapplied) to unblock the deferred live 10-consecutive-drive_reports-row acceptance read named in this SD's success_criteria[1] and [2].", category: "follow_up", is_boilerplate: false },
  { action: "When a risk-mitigation claims a specific runtime failure mode (e.g. fails loudly with a TypeError), verify it with a runtime probe rather than trusting that the named code change (a parameter rename) achieves it.", category: "process", is_boilerplate: false }
];

const newWhatNeedsImprovement = [
  "A scoped grep for the removed constant's name (HEALTHY_VERDICTS) missed a 9th call site (tests/unit/cron/drive-report-sweep.test.js) that hardcoded the OLD literal point value with zero textual reference to the constant -- only CI's full Unit Tier caught it, not the local targeted test run.",
  "The stale-caller mitigation named in the PRD risk register (rename so a stale caller fails loudly with a TypeError) is not actually achieved by the rename alone -- a stale healthy: caller now silently falls through to the ratified default instead of throwing.",
  "The live 10-consecutive-drive_reports-row acceptance read (ffebbd68 predicate) remains blocked because database/chairman-gated/20260807_belt_capacity_verdicts.sql is still chairman-gated and unapplied -- explicitly disclosed as deferred in this SD's success_criteria, not fabricated as met."
];

const merged = {
  key_learnings: [...newKeyLearnings, ...(existing.key_learnings || [])],
  failure_patterns: [...newFailurePatterns, ...(existing.failure_patterns || [])],
  success_patterns: [...newSuccessPatterns, ...(existing.success_patterns || [])],
  action_items: [...newActionItems, ...(existing.action_items || [])],
  what_needs_improvement: [...newWhatNeedsImprovement, ...(existing.what_needs_improvement || [])],
  sub_agents_involved: [...new Set([...(existing.sub_agents_involved || []), 'RETRO'])],
  description: "SD-LEO-INFRA-DRIVE-SCORE-LEG4-001: Replaced a binary earning rule (HEALTHY_VERDICTS=['TIGHT'], everything else scores 0) in lib/drive-loop/score/leg4-capacity.js's scoreLeg4() with a chairman-ratified graduated points table (EARNING_POINTS, ratification be6e9d73 under ffebbd68): TIGHT=2, DEFICIT=1, SURPLUS=1, DEFICIT-URGENT=0. This closed a defect where nine of the last ten drive_reports rows scored leg4 as 0 despite a graduated ladder (LADDER_DISTANCE) already existing as unused telemetry underneath. Merged via PR #8370 (merge commit c7532b38b43066ec0cc63ea476a0f9bad4d91f2d), with a same-day follow-up commit (43b5d9277c7aadb526373059f41e122a642b1c03) updating tests/unit/cron/drive-report-sweep.test.js after CI's full Unit Tier caught the 9th call site the initial name-scoped grep missed. PLAN_VERIFY evidence: TESTING CONDITIONAL_PASS (50% confidence -- infra SD, no auto-mapped unit test file detected by the tool's heuristic), SECURITY CONDITIONAL_PASS (70% -- unrelated RLS/SECURITY DEFINER catalog-tier warnings, not scoped to this change), VALIDATION PASS (92% -- confirmed exact ratified mapping, injectability, full HEALTHY_VERDICTS removal, leg1/leg2 isolation), REGRESSION PASS (95% -- zero production callers pass the renamed healthy/earning param, zero consumers ever imported HEALTHY_VERDICTS, test count 169 to 175 passing with zero new failures). The live 10-consecutive-drive_reports-row read remains DEFERRED (not claimed as met) because database/chairman-gated/20260807_belt_capacity_verdicts.sql is still chairman-gated and unapplied.",
  business_value_delivered: "Closed a defect where 9 of the last 10 drive_reports rows scored leg4 (capacity) as 0 under a binary earning rule; replaced it with a chairman-ratified (be6e9d73 under ffebbd68) graduated points table, restoring earning signal on an existing but previously-unused LADDER_DISTANCE telemetry field.",
  related_prs: ["https://github.com/rickfelix/EHG_Engineer/pull/8370"],
  related_commits: [
    "933510a6db7bd508e97b25c908cc7bf3a6045955",
    "43b5d9277c7aadb526373059f41e122a642b1c03",
    "c7532b38b43066ec0cc63ea476a0f9bad4d91f2d"
  ],
  related_files: [
    "lib/drive-loop/score/leg4-capacity.js",
    "tests/unit/drive-loop/score/leg4-capacity.test.js",
    "tests/unit/cron/drive-report-sweep.test.js",
    "tests/unit/drive-loop/belt-verdict.test.js",
    "tests/unit/drive-loop/capacity-verdict-store.test.js",
    "tests/unit/drive-loop/drive-score-gradient-historical.test.js"
  ],
  affected_components: ["Strategic Directives", "Drive Score / Leg4 Capacity Scoring", "Coordinator Capacity Forecast"],
  tags: ["drive-score", "leg4-capacity", "chairman-ratification", "scoring-rule-change", "ci-vs-local-testing"],
  bugs_found: 1,
  bugs_resolved: 1,
  technical_debt_addressed: true,
  technical_debt_created: false,
  objectives_met: true,
  performance_impact: "No performance impact -- pure scoring-table lookup change (object property access), no new I/O.",
  updated_at: new Date().toISOString()
};

const { data, error } = await supabase
  .from('retrospectives')
  .update(merged)
  .eq('id', RETRO_ID)
  .select('id, quality_score, status, key_learnings, action_items, updated_at')
  .single();

if (error) {
  console.error('Update failed:', error.message);
  process.exit(1);
}

console.log('Enriched retrospective:', JSON.stringify({
  id: data.id,
  quality_score: data.quality_score,
  status: data.status,
  key_learnings_count: data.key_learnings.length,
  action_items_count: data.action_items.length,
  updated_at: data.updated_at
}, null, 2));
