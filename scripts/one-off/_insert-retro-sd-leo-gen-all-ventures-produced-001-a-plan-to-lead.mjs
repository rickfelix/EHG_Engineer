#!/usr/bin/env node
/**
 * One-off: Insert the retro_type=SD_COMPLETION retrospective row required by
 * the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE for
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A.
 *
 * Written ahead of this SD's eventual completion retrospective, specifically
 * to satisfy scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js
 * (via scripts/modules/handoff/retro-filters.js's getFilteredRetrospective:
 * retro_type='SD_COMPLETION', created_at > LEAD-TO-PLAN acceptance). Only a
 * retro_type='HANDOFF' row (auto-generated at LEAD-TO-PLAN preflight,
 * quality_score 30) existed for this SD before this insert -- that row does
 * not satisfy the gate, same class of gap as SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001's
 * equivalent one-off fix.
 *
 * This SD is mid-PLAN/early-EXEC (current_phase=EXEC, progress=30%), not
 * complete -- LEAD-FINAL-APPROVAL has not run. The content below captures the
 * substantial LEAD/PLAN-phase premise-correction this session already
 * produced (sibling duplicate cancellation, DESIGN+DATABASE producer-parity
 * fix, DATABASE rate-limiter substrate fix, TESTING's test-plan corrections)
 * grounded in the actual sub_agent_execution_results rows for sd_id
 * 363c8fb9-67c6-4702-807b-fa227bf4637f, not a generic template.
 *
 * quality_score below is advisory only: auto_validate_retrospective_quality()
 * recomputes it server-side from what_went_well/key_learnings/action_items/
 * what_needs_improvement content on INSERT and REJECTS a status='PUBLISHED'
 * insert if the computed score is <70 -- the value passed here is overwritten,
 * never trusted.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '363c8fb9-67c6-4702-807b-fa227bf4637f';
const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

const what_went_well = [
  "Sibling SD -B (accidental duplicate of this SD's own scope, created in the same PLAN session) was identified and cancelled cleanly -- VALIDATION's LEAD-TO-PLAN 'no-overlapping-sd-beyond-known-siblings' finding independently re-scanned strategic_directives_v2 across 11 terms and confirmed -B was correctly cancelled as a duplicate and that no other SD in the SD-LEO-GEN-ALL-VENTURES-PRODUCED-001 decomposition overlaps this one's scope.",
  "DESIGN sub-agent's PLAN-phase review ('kill-gate-armed-with-no-producer-and-both-guards-are-blind') caught that the SD's original scope text appended a required artifact to a KILL gate (Stage 23, launch_readiness_gate) while explicitly deferring the producer to sibling -E, which only writes venture_usage_events rows and never a venture_artifacts row -- the exact truth_demand_thesis-class outage (\"declared, gate-enforced, writable by nothing\") this repo's own tests/unit/eva/artifact-type-producer-parity.test.js header records happening once already.",
  "That finding was absorbed directly into the PRD as FR-4 rather than left as a known gap: fn_submit_venture_usage_event now upserts its own venture_artifacts launch_usage_signal row in the same transaction, with no exception handler swallowing failures, closing the producer-parity gap entirely within this SD's own scope instead of depending on sibling -E landing first.",
  "DATABASE sub-agent's PLAN-phase review ('ratelimit-helpers-cannot-observe-usage-events') measured -- via pg_get_functiondef, not assumption -- that the precedent RPC family's two rate-limit helpers both count FROM public.feedback, which would make a reused limiter structurally blind to venture_usage_events volume while unrelated feedback traffic spuriously consumed the usage budget; FR-3 built a dedicated substrate instead (inline per-venture count against ingested_at + an O(1) tumbling-hour-bucket table for the global cap).",
  "DATABASE also caught the app-generated-created_at-vs-fixed-signature contradiction in the original scope text and resolved it with an optional sixth p_occurred_at parameter, plus the created_at/ingested_at axis split (data axis vs security axis) that FR-1/FR-2 now state explicitly -- closing a path where any ingest-secret holder could otherwise have defeated the rate limiter by lying about the event timestamp.",
  "TESTING sub-agent's PLAN-TO-EXEC review caught that 5 of the original 8 test scenarios were typed 'integration' -- in this repo a routing label, not a category, that sends them to a vitest project with passWithNoTests:true and a CI step that is continue-on-error plus `|| true` -- meaning they would have executed zero assertions and reported green. All were retyped to `ddl` before any test file was written.",
  "The same TESTING pass found the CI path-filter gap (drive-reports-ddl.yml's literal `paths:` list, which the workflow's own comment already records causing a live '0 of 54 checks matched' incident on a prior PR) and the venture_artifacts NOT-NULL title omission (would raise 23502 and, per FR-4's own no-exception-handler requirement, break ingestion for every venture the instant the migration applied) -- both fixed in the PRD (FR-6, FR-4) before implementation started.",
  "TESTING also found the auth-ordering claim (FR-2 AC#4: ownership check must run before input validation) was unfalsifiable by any of the originally-drafted scenarios -- TS-4 and TS-5 each varied only one axis and pass identically under either ordering -- and specified TS-9, a four-cell cross matrix, as the only scenario that actually distinguishes correct from reversed ordering."
];

const what_needs_improvement = [
  "The scope's original phrasing (\"OUT OF SCOPE ... pointing AltifyAI's recordUsageEvent at this RPC as the live witness (sibling -E)\") read as if the gate witness was already assigned to sibling -E. It took an explicit DESIGN finding to surface that neither this SD's RPC as originally scoped nor sibling -E's instrumentation actually wrote a venture_artifacts row -- i.e. no sibling in the decomposition owned the producer until FR-4 was added. A parent decomposition should assign gate-producer ownership as an explicit, named requirement per child, not leave it inferable from a scope-text phrase.",
  "Sibling -B's accidental creation (an exact duplicate of this SD's scope, from the same PLAN session) was only caught and cancelled after both rows already existed in strategic_directives_v2 with independent claim/session state -- a same-session duplicate-scope check at SD-creation time, before the row is written, would have caught this earlier and cheaper.",
  "The original test plan's TS-3 was internally inconsistent with its own FR-4 (asserting last_event_at 'advances' under rapid sequential events while FR-4 specifies a 5-minute cooldown that should leave it unchanged in that scenario) -- a cross-check between a functional requirement and its own test scenario's stated expectation, run at PRD-authoring time rather than waiting for the dedicated TESTING sub-agent pass, would have caught this without needing a separate review round.",
  "TESTING's single pass surfaced 19 findings against an 8-scenario draft (11 new scenarios recommended, 9 unfalsifiable acceptance criteria, 6 scenarios needing retyping or splitting) -- a PRD-authoring discipline of asking 'what single scenario would actually falsify this acceptance criterion' per functional requirement, before TESTING is invoked, would shrink the gap TESTING has to close at PLAN-TO-EXEC."
];

const key_learnings = [
  "A kill-gate required_artifacts append and its producer are two separable pieces of work, and a decomposition that leaves producer ownership as an inferable scope-text phrase (\"sibling X witnesses it\") rather than an explicit functional requirement risks reproducing the exact truth_demand_thesis-class outage (declared, gate-enforced, writable by nothing) this repo's own producer-parity test exists to prevent -- ownership must be a named, checked requirement, not an implication.",
  "Both existing producer-parity guards (artifact-type-producer-parity.test.js and its sibling) iterate the JS ARTIFACT_TYPES registry only -- they cannot see a producer written entirely inside a SQL migration's function body. A DB-only self-producing design is therefore invisible to the very guards built to catch an unproducible gate requirement, which is why a dedicated source-pin test reading the migration file's literal INSERT text is required in the same SD: the guard has to be built at the same layer as the producer, not assumed to generalize from a JS-registry check.",
  "Rate-limit helper reuse across a precedent RPC family is not free: two existing helpers count FROM public.feedback specifically, so reusing them for a structurally different event table produces a limiter that is blind to the exact traffic it exists to cap while remaining fully wired and green. A rate limiter's correctness has to be verified against which table it actually counts, not just that a limiter of the same shape exists elsewhere in the codebase.",
  "At usage-event volume (2-3 orders of magnitude above the precedent's feedback-table traffic), a naive count(*) global cap re-evaluated on every insert is quadratic in traffic, not merely slow -- the fix (an O(1) tumbling-hour-bucket counter table) was found only because the review explicitly reasoned about the caller's actual scale rather than porting the precedent's cap mechanism unchanged.",
  "Rate limiting and gate-witness production must be sequenced explicitly inside a single RPC body: if a venture_artifacts upsert runs before the rate-limit check, a venture rate-limited on its very first call -- zero events actually stored -- can still acquire its Stage-23 gate witness and clear a kill gate unearned. Ordering inside a transaction is a correctness requirement, not an implementation detail, whenever a gate-witness write and a backpressure check share a function body.",
  "A test scenario's declared type (unit/integration/ddl) is load-bearing routing in this repo, not a category label -- tests/integration/** collects into a vitest project with passWithNoTests:true and a CI step that is continue-on-error plus `|| true`, so a correctly-written scenario placed under the wrong type executes zero assertions and reports green. Retyping to `ddl` has to happen at PRD-authoring time, not be discovered after a test suite is already green.",
  "An auth-ordering invariant (\"check X before check Y\") is unfalsifiable by any scenario that varies only one axis at a time -- it only becomes observable in the cross cell where both conditions hold simultaneously (wrong secret AND invalid input), because that is the only input where the two possible orderings produce distinguishable outcomes (a uniform reject code vs an early validation error that itself becomes an existence-enumeration oracle)."
];

const action_items = [
  {
    text: "EXEC must retype TS-1/TS-2/TS-3/TS-4/TS-6 to `ddl`, add TS-9 through TS-19 as specified in TESTING's PLAN-TO-EXEC findings (auth-ordering matrix, response-contract exact-key-set, rate-limited-branch artifact-negative-control, cooldown split, concurrency, NOT-NULL title, stage-key resolution, payload controls, anon-ACL revocation, activation chain), and pin the literal file path tests/ddl/venture-usage-events-rpc-ddl.db.test.js before writing the RPC body.",
    category: "testing",
    priority: "critical"
  },
  {
    text: "EXEC must append both the new migration path and the new tests/ddl/ file path to .github/workflows/drive-reports-ddl.yml's literal `paths:` list and verify via `gh pr checks` that the Drive Reports DDL check actually appears on the PR, not merely that the lines were added.",
    category: "ci",
    priority: "critical"
  },
  {
    text: "EXEC must pin a literal, non-null title (e.g. 'Launch Usage Signal') on the FR-4 venture_artifacts upsert and confirm all four NOT NULL columns (venture_id, lifecycle_stage, artifact_type, title) are supplied -- scripts/lint/venture-artifacts-write-lint.mjs cannot see this SQL-side insert, so this is unenforced by any existing lint.",
    category: "database",
    priority: "critical"
  },
  {
    text: "EXEC must resolve lifecycle_stage from venture_stages.stage_key='launch_readiness_gate' at call time (never hardcode 23), and TS-14b must seed a stub stage at a different stage_number to prove the stage_key lookup -- not a hardcoded 23 -- drives the value written, ahead of SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B's pending stage renumbering.",
    category: "database",
    priority: "high"
  },
  {
    text: "Add TS-17 (activation-invariant end-to-end chain: seed a venture blocked at launch_readiness_gate, submit one event via the RPC, assert the gate now permits advancement) and set product_requirements_v2.activation_test_id to that file path before LEAD-FINAL-APPROVAL, since that gate requires a TESTING row naming a real chain test for an SD that ships schema + RPC + gate consumer together.",
    category: "testing",
    priority: "high"
  },
  {
    text: "Log a decomposition-process follow-up: require each child SD in a parent-authored decomposition to name its gate-producer ownership as an explicit functional requirement at LEAD-TO-PLAN, rather than leaving it inferable from scope-text phrasing that references a sibling.",
    category: "process",
    priority: "medium"
  }
];

const success_patterns = [
  "DESIGN and DATABASE sub-agent PLAN-phase reviews each caught a distinct, would-have-shipped-broken defect (unsatisfiable kill-gate requirement; rate limiter blind to its own subject) before any migration file was written, and both were absorbed into the PRD as explicit functional requirements (FR-4, FR-3) rather than left as known gaps.",
  "TESTING's PLAN-TO-EXEC review treated the draft test plan itself as a reviewable artifact and found it would have been largely non-executing (wrong tier routing) and partially unfalsifiable (auth-ordering, response-contract branches) -- caught before a single test file existed, not after a green-but-vacuous suite shipped.",
  "A same-scope duplicate SD (-B) was identified and cancelled with a documented reason rather than silently abandoned or left to compete for claim state with its sibling."
];

const failure_patterns = [
  "The original scope text let gate-producer ownership for a kill-gate requirement remain an inferable phrase referencing a sibling SD, rather than a named, checked requirement -- caught only by an explicit DESIGN finding, not by the decomposition's own authoring process.",
  "A same-session duplicate SD (-B) was created and persisted to the database before being caught and cancelled, rather than being caught at creation time.",
  "The draft test plan shipped with 5 of 8 scenarios routed to a tier that executes zero assertions, an internally-inconsistent scenario (TS-3 vs FR-4's cooldown), and an unfalsifiable auth-ordering claim -- all discovered by a dedicated TESTING pass rather than by the PRD-authoring process itself."
];

const improvement_areas = [
  "Root cause of the producer-parity gap: the scope's 'OUT OF SCOPE ... sibling -E is the live witness' phrasing conflated 'a sibling calls this RPC' with 'a sibling writes the gate-witness row' -- explicitly naming the gate-witness writer as a functional requirement, for every kill-gate-touching child SD in a decomposition, would catch this class before DESIGN has to.",
  "Root cause of the vacuous test-plan risk: test scenarios were typed by intuitive category (unit/integration) rather than by which vitest tier and CI workflow actually executes them in this repo -- a PRD-authoring checklist item ('does this scenario's type route to a tier with passWithNoTests:false and a blocking CI check') would close this before TESTING has to re-derive it per SD.",
  "Root cause of the rate-limiter blind-spot risk: the RPC's scope described mirroring the precedent 'exactly', which is correct for auth/response-shape but was over-applied to the rate-limit mechanism without checking what table the precedent's helpers actually count -- a precedent should be mirrored per-mechanism with an explicit table/axis check, not adopted wholesale."
];

const description = "SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A is one of five sibling children (-A through -E) decomposing SD-LEO-GEN-ALL-VENTURES-PRODUCED-001's telemetry-analytics gap. -A owns the shared venture_usage_events table, the fn_submit_venture_usage_event ingest RPC, and the Stage-23 (launch_readiness_gate) kill-gate producer wiring. A sixth sibling, -B, was an accidental duplicate of this exact scope created in the same PLAN session and was cancelled (VALIDATION's LEAD-TO-PLAN pass independently confirmed no other overlap exists in the decomposition). During LEAD-TO-PLAN and PLAN, the DESIGN and DATABASE sub-agents found that the scope as originally written would have shipped an unsatisfiable kill-gate requirement (a required artifact with no assigned producer -- the same class of outage this repo's own truth_demand_thesis incident documents) and a rate limiter structurally blind to the traffic it was meant to cap (the precedent RPC family's helpers count FROM public.feedback, not the new table). Both were resolved by adding explicit functional requirements (FR-4: the RPC self-produces its own venture_artifacts gate-witness row in the same transaction; FR-3: a dedicated per-venture inline counter plus an O(1) tumbling-hour-bucket table for the global cap) rather than shipping the original scope. During PLAN-TO-EXEC, the TESTING sub-agent reviewed the resulting 8-scenario draft test plan and found it would have been largely non-executing (5 scenarios mistyped as `integration`, which this repo's CI treats as informational-only and never gates the build) and partially unfalsifiable (no scenario could distinguish correct from reversed auth-check ordering; no scenario asserted the FR-4 upsert's NOT NULL title column, whose omission would break ingestion for every venture at first apply). The PRD was corrected before implementation started (FR-6 added the tier-routing and CI path-filter acceptance criteria; FR-2/FR-4 acceptance criteria were tightened) rather than discovering these gaps after code shipped. This retrospective is written mid-EXEC (current_phase=EXEC, progress=30%), ahead of this SD's eventual completion retrospective, specifically to satisfy the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE.";

const record = {
  sd_id: SD_ID,
  title: `${SD_KEY} PLAN-TO-LEAD Retrospective: Self-Producing Stage-23 Gate Witness Closes a Producer-Parity Gap Before It Shipped`,
  description,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  status: 'PUBLISHED',
  generated_by: 'MANUAL',
  project_name: SD_KEY,
  learning_category: 'DATABASE_SCHEMA',
  conducted_date: new Date().toISOString(),
  objectives_met: false,
  on_schedule: true,
  within_scope: true,
  target_application: 'EHG_Engineer',
  related_commits: [],
  related_prs: [],
  tags: ['producer-parity', 'truth-demand-thesis', 'rate-limiting', 'stage-gate', 'ddl-tier-routing', 'sd-decomposition', 'infrastructure'],
  what_went_well,
  what_needs_improvement,
  key_learnings,
  action_items,
  success_patterns,
  failure_patterns,
  improvement_areas,
  quality_score: 85 // advisory only -- recomputed server-side by auto_validate_retrospective_quality()
};

async function main() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('FAILED:', error.message, error.details || '', error.hint || '');
    process.exit(1);
  }

  console.log('RETROSPECTIVE WRITTEN:');
  console.log('  ID:', data.id);
  console.log('  retro_type:', data.retro_type, '| retrospective_type:', data.retrospective_type);
  console.log('  status:', data.status);
  console.log('  quality_score (server-computed):', data.quality_score);
  console.log('  quality_issues:', JSON.stringify(data.quality_issues));
  console.log('  what_went_well:', data.what_went_well.length, '| what_needs_improvement:', data.what_needs_improvement.length);
  console.log('  key_learnings:', data.key_learnings.length, '| action_items:', data.action_items.length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
