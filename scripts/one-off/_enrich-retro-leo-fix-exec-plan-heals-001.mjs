import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = 'ff11eda9-c81d-47ed-9417-6ab5259aa7ce';

const { data: existing, error: fetchErr } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('id', RETRO_ID)
  .single();

if (fetchErr) {
  console.error('Fetch failed:', fetchErr);
  process.exit(1);
}

const what_went_well = [
  ...existing.what_went_well,
  "Shipped healDeliverablesAndStories() in lib/sub-agents/testing/index.js: for POST_IMPLEMENTATION handoff callers only (gated on the existing resolveStoryGateContext().blocking classifier), it reconciles sd_scope_deliverables using ONLY the evidence-gated reconciler (gates/deliverables-completeness.js's reconcileDeliverables, now exported) -- never the zero-evidence autoCompleteDeliverablesForSD fallback tier -- then calls the canonical promoter scripts/auto-validate-user-stories-on-exec-complete.js's autoValidateUserStories(), before TESTING measures user story completeness.",
  "8 unit tests pass (gating behavior, no-fabrication safety property, static import-check); 281/281 broader regression suite passes with zero regressions, including the SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 verdict-acceptance fixture.",
  "This SD's own EXEC-TO-PLAN and PLAN-TO-LEAD handoffs served as live dogfooding of the fix, surfacing two genuine follow-up circularities before merge rather than after."
];

const what_needs_improvement = [
  ...existing.what_needs_improvement,
  "TESTING has a SEPARATE 'scoped non-UI validation' fast-path (in lib/sub-agents/testing/index.js's execute()) that fires for bugfix/exempt-type SDs with a non-UI diff. It runs unit tests + hallucination check and returns a verdict WITHOUT ever reaching Phase 4/4.5 (user story verification) -- so healDeliverablesAndStories(), wired into the main phases-1-through-5 flow, never executes on that path. The fix as shipped only helps SD types/diff-shapes that traverse the full phase pipeline; bugfix-type SDs with non-UI diffs (like this SD itself) do NOT get heal-then-measure behavior from TESTING at all.",
  "USER_STORY_COVERAGE is a SEPARATE, sibling gate (outside TESTING's own verdict, part of the handoff's own gate suite) that independently reads user_stories.status directly and has THE SAME circularity via a different path (STORY_AUTO_VALIDATION gate -> autoValidateUserStories, same executor-internal-only healer problem). This SD's PRD (FR-1/FR-2/FR-3) was scoped specifically to MANDATORY_TESTING_VALIDATION and did not cover USER_STORY_COVERAGE."
];

const key_learnings = [
  ...existing.key_learnings,
  {
    category: "FOLLOW_UP_FINDING",
    evidence: "Live dogfooding during this SD's own EXEC-TO-PLAN handoff",
    learning: "TESTING's scoped non-UI validation fast-path (bugfix/exempt-type SDs with non-UI diffs) returns a verdict without ever reaching Phase 4/4.5, so the new healDeliverablesAndStories() -- wired into the main phases-1-through-5 flow -- never executes on that path. MANDATORY_TESTING_VALIDATION still passed for THIS SD only because the scoped path's PASS verdict doesn't depend on story completeness in the first place.",
    applicability: "Widen resolveStoryGateContext-gated healing to also run inside the scoped-non-UI-validation path, or explicitly document why bugfix/non-UI SDs are exempt from story-completeness checks by design."
  },
  {
    category: "CIRCULARITY_DEFECT_CLASS",
    evidence: "This SD's own EXEC-TO-PLAN handoff hit USER_STORY_COVERAGE_FAILED first",
    learning: "USER_STORY_COVERAGE / STORY_AUTO_VALIDATION is a sibling gate outside TESTING's own verdict that independently reads user_stories.status directly and has the SAME circularity via a different path as the defect this SD fixed for MANDATORY_TESTING_VALIDATION (autoValidateUserStories only runs inside a handoff attempt that the gate itself blocks). Unblocked here by running the canonical scripts/auto-validate-user-stories-on-exec-complete.js CLI directly (real evidence, sanctioned tool, not a bypass) rather than via an in-gate healer, which was out of this SD's PRD scope.",
    applicability: "Deserves its own follow-up SD/QF rather than silently expanding this PR's scope -- same defect class, different gate."
  }
];

const success_patterns = [
  ...existing.success_patterns,
  "Evidence-gated reconciler used exclusively for healing -- the zero-evidence autoCompleteDeliverablesForSD fallback tier was deliberately excluded to preserve the no-fabrication safety property.",
  "Live dogfooding via this SD's own handoffs surfaced two genuine follow-up circularities before merge, avoiding silent scope creep into out-of-PRD gates."
];

const failure_patterns = [
  ...existing.failure_patterns,
  "TESTING's scoped non-UI validation fast-path bypasses Phase 4/4.5 entirely, so the new healer is unreachable for bugfix/non-UI SD types -- found via this SD's own dogfooding, not caught by unit tests (which target the main pipeline).",
  "USER_STORY_COVERAGE / STORY_AUTO_VALIDATION exhibits the same circularity class as the defect this SD fixed, via a separate gate path outside this SD's PRD scope -- this SD's own EXEC-TO-PLAN handoff hit USER_STORY_COVERAGE_FAILED first."
];

const action_items = [
  ...existing.action_items,
  {
    owner: "PLAN (follow-up SD/QF)",
    action: "Widen resolveStoryGateContext-gated healing to also run inside TESTING's scoped-non-UI-validation fast-path, or explicitly document why bugfix/non-UI SDs are exempt from story-completeness checks by design.",
    source: "circularity_scope_gap",
    priority: "medium",
    smart_format: true,
    root_cause: "healDeliverablesAndStories() is wired only into the main phases-1-through-5 flow; the scoped non-UI fast-path returns a verdict before reaching Phase 4/4.5 and never calls it.",
    success_criteria: "Either the scoped fast-path invokes healDeliverablesAndStories() before returning its verdict, or a documented, explicit exemption exists for bugfix/non-UI SD types.",
    verification_query: "Review lib/sub-agents/testing/index.js execute() scoped non-UI branch for a call to healDeliverablesAndStories(), or a code comment / doc citing the exemption rationale."
  },
  {
    owner: "PLAN (new SD/QF)",
    action: "File a follow-up SD/QF for the USER_STORY_COVERAGE / STORY_AUTO_VALIDATION circularity -- same defect class as MANDATORY_TESTING_VALIDATION (autoValidateUserStories only executes inside a handoff attempt the gate itself blocks) -- do not expand this SD's PR scope to cover it.",
    source: "circularity_defect_class",
    priority: "high",
    smart_format: true,
    root_cause: "STORY_AUTO_VALIDATION gate depends on autoValidateUserStories() output that is only produced inside a handoff attempt the same gate suite blocks from starting.",
    success_criteria: "New SD/QF exists in strategic_directives_v2 (or quick_fixes) referencing this retrospective and the USER_STORY_COVERAGE circularity.",
    verification_query: "SELECT id, title FROM strategic_directives_v2 WHERE title ILIKE '%USER_STORY_COVERAGE%' OR title ILIKE '%STORY_AUTO_VALIDATION%'"
  }
];

const related_files = Array.from(new Set([
  ...(existing.related_files || []),
  "lib/sub-agents/testing/index.js",
  "gates/deliverables-completeness.js",
  "scripts/auto-validate-user-stories-on-exec-complete.js"
]));

const related_prs = Array.from(new Set([
  ...(existing.related_prs || []),
  "https://github.com/rickfelix/EHG_Engineer/pull/8166"
]));

const related_commits = Array.from(new Set([
  ...(existing.related_commits || []),
  "722f5aef40d"
]));

const { data: updated, error: updateErr } = await supabase
  .from('retrospectives')
  .update({
    what_went_well,
    what_needs_improvement,
    key_learnings,
    success_patterns,
    failure_patterns,
    action_items,
    related_files,
    related_prs,
    related_commits,
    updated_at: new Date().toISOString()
  })
  .eq('id', RETRO_ID)
  .select('id, status, quality_score, updated_at')
  .single();

if (updateErr) {
  console.error('Update failed:', updateErr);
  process.exit(1);
}

console.log('Retrospective enriched:', JSON.stringify(updated, null, 2));
