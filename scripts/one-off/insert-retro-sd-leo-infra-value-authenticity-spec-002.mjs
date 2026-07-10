#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-stage-quality-analyzer-fr-f-001.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '56edd407-9a78-4347-bc73-d2aeceec7a9d';
const SD_KEY = 'SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'APPLICATION_ISSUE',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — L3 spec-production panel + L4 triangulation engine`,
  description: 'Third SD of the value-authenticity family (docs/design/value-authenticity-system-design.md SSOT §1-L3/L4), sourced behind the coupled pair SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001 (merged, PR #5761). Built the spec-production panel (L3: diverse-lens panel assembly, bounded iterative review, cost-tiering) and the triangulation grounding core (L4: typed 3-way divergence router, stakes-weighted non-monotonic convergence, weakest-link evidence propagation) — reusing provider-adapters.js, research-engine.js, decision-binding.js and SPEC-001s classifyTriggerPredicate as-is, per the SDs explicit no-rebuild scope constraint.',
  affected_components: [
    'lib/value-authenticity/weakest-link.js',
    'lib/value-authenticity/divergence-router.js',
    'lib/value-authenticity/panel-assembly.js',
    'database/migrations/20260710_value_authenticity_criteria_selections.sql',
    'tests/unit/value-authenticity/weakest-link.test.js',
    'tests/unit/value-authenticity/divergence-router.test.js',
    'tests/unit/value-authenticity/panel-assembly.test.js',
  ],
  what_went_well: [
    'computeWeakestLinkGrade() in lib/value-authenticity/weakest-link.js implements true MIN-across-domain-claims semantics (E0<E1<E2<E3 ordinal), and the new value_authenticity_criteria_selections table persists canonical_grade alongside computed_weakest_link_grade AND effective_grade = MIN(both) as three separate columns — so a caller can never accidentally read canonical_grade and believe it is the effective grade. The weakest link is never laundered upward, by construction of the schema itself, not just by convention in application code.',
    'evaluateConvergence() in divergence-router.js is genuinely non-monotonic: raising stakesLevel from low to high at CONSTANT raw agreement lowers trustLevel and can flip suspiciousUnanimity to true on perfect (100%) agreement. This directly encodes SSOT L4s "convergence != correctness" qualifier as executable logic rather than a comment, and the 3 seeded fixtures (non-unanimous/low-stakes, perfect-unanimity/high-stakes shared-corpus-misconception, and the stakes-rising-at-constant-agreement case) all assert the non-monotonic direction, not just a threshold crossing.',
    'Cost-tiering (shouldRunFullPanel in panel-assembly.js) imports classifyTriggerPredicate directly from scripts/modules/handoff/validation/validator-registry/gates/value-authenticity-spec-gate.js (the SPEC-001 L2 predicate) rather than re-implementing an equivalent classifier — verified by a static-import test, not just a behavioral one, so a future refactor that swaps the import for a local copy would fail CI immediately.',
    'runIterativeReview() bounds iteration correctly: a persistent-divergence fixture is force-routed to decision-binding chairman escalation at exactly round 3 (maxRounds default), never attempting round 4, and a fixture converging at round 2 stops immediately without running round 3 — both directions were asserted, not just the round-cap direction.',
    'Rather than falsely claiming research-engine.js runResearch() provides a "cited external primary source with freshness check" (the SSOT design docs assumption), inspection of the actual return shape (confidence_score, consensus strength, no source URLs or timestamps anywhere) led to redesigning isTerminated()s primary-source branch to require an EXPLICIT, structurally-verified primarySource: { url, checkedAt } object supplied by the caller — never inferred from runResearch()s synthesis output. This is the exact class of defect (decorative grounding) this whole system exists to prevent, caught before it shipped.',
    '85 tests passing on first full EXEC run (52 new across 3 new test files + 33 sibling SPEC-001 regression tests still green), confirming no L3/L4 addition broke the pair-half A criteria-library contract it builds on top of.',
  ],
  what_needs_improvement: [
    'The SSOT design doc (docs/design/value-authenticity-system-design.md) described research-engine.js as providing "cited external primary source with freshness check" for the L4 termination base case, but this was an assumption never verified against the actual function signature/return shape before PLAN wrote it into the PRD. The gap was only caught mid-EXEC by reading lib/research/research-engine.js directly (grep for confidence_score/consensus/source found zero source-URL or freshness fields). Root cause: SSOT docs describe INTENDED integration points at a level of abstraction that does not encode return-shape contracts, and PLAN did not cross-check the doc claim against the reuse targets actual code before scoping FR-9 around it.',
    'The round-cap chairman escalation (FR-6 AC-3) initially built the decision-binding disposition row with only the bare escalated question in its subject/answerPayload — the VALIDATION sub-agent at PLAN_VERIFICATION had to catch that a chairman reading the row would see no context on what was tried across the prior rounds. Root cause: the PRD acceptance criterion said "includes the full round history as context" but the implementation defaulted to the minimal idempotent-dedup shape (subject={question} only) without a second field for the non-key context, so the AC was technically unmet on the first pass despite the round-history data existing in memory at escalation time.',
    'The fix for the round-history gap (commit 7dc0df63b3) required distinguishing recordDispositions dedup KEY (subject, which must stay minimal — {question} only — so repeated escalations of the same logical question correctly collapse to one row) from its CONTEXT (answerPayload, which can and should carry the full roundHistoryDigest). This subject-vs-payload split is not obvious from the decision-binding API surface alone and cost a second commit instead of landing correctly in the first pass.',
    'No live-LLM integration smoke test exists yet for assemblePanel() against real multi-family provider adapters — all 52 new tests are fixture-based unit tests (seeded panel responses, seeded convergence fixtures). The first real diverse-lens panel run against live providers (e.g. via the MarketLens L3 replay named in the SDs own success criterion 3) will be the first environment where provider response-shape drift (e.g. a provider returning claims without a sources array) gets exercised outside the fixtures.',
  ],
  key_learnings: [
    'Verify a reuse targets ACTUAL return shape (grep the function body, not just its exported name or the SSOT docs description of it) before designing new logic against an SSOT documents assumption about what that function provides. research-engine.js runResearch() sounds like it should ground a "cited primary source" claim from its name and docstring context, but its real return shape (confidence_score + consensus, zero source/freshness fields) could not satisfy that base case. This is a reusable check, not a one-off: L1/APA and L5 (the remaining value-authenticity layers) will each cite existing capabilities as reuse targets from the same SSOT doc, and the same verify-before-design step should run for each before FRs are scoped around them.',
    'A grading/propagation engine (weakest-link.js) is more defensible when the "never launder upward" invariant is enforced by the DATA MODEL (three separate persisted columns: canonical_grade, computed_weakest_link_grade, effective_grade) rather than only by a code comment or a single computed field a caller could bypass by reading the wrong column. The schema itself makes the wrong read structurally awkward, not just discouraged.',
    'Non-monotonic trust logic (evaluateConvergence) needs its test fixtures to assert the DIRECTION of change (trustLevel goes down as stakes rises at constant agreement), not just a pass/fail threshold — a naive test that only checks "converged == true/false" at one stakes level would pass even if the non-monotonicity were silently removed by a future refactor.',
    'decision-binding.js recordDisposition has an implicit two-part contract: subject is the idempotent DEDUP KEY (must stay minimal and stable across repeated escalations of the same logical question) while answerPayload is free-form CONTEXT (safe to enrich with round history, prior classifications, etc.) without affecting dedup. Any future FR that escalates to chairman via decision-binding should default to putting context in answerPayload, not subject, from the first implementation pass — this SD had to learn that the hard way via a VALIDATION-agent finding and a second commit.',
    'A "coupled pair, sourced behind" sequencing pattern (SPEC-001 -> SPEC-002, same relationship the SD itself is a third layer behind) lets the dependent SD explicitly reuse the predecessors L2 trigger predicate (classifyTriggerPredicate) and shared infrastructure (provider-adapters.js, decision-binding.js, research-engine.js) rather than rebuilding a second version of any of them — the "no second classifier" scope constraint in the PRD was honored end-to-end and verified by a static-import test, not just a promise in the PRD text.',
  ],
  action_items: [
    {
      title: 'Verify reuse-target return shapes before scoping L1/APA FRs against SSOT assumptions',
      description: 'Before PLAN scopes FRs for the L1/APA layer (the next value-authenticity family SD), grep the actual return shape of every capability the SSOT doc claims is reusable (e.g. any APA evidence-gathering or adjudication function referenced in docs/design/value-authenticity-system-design.md) rather than trusting the docs description of what it provides. This SD lost EXEC time to research-engine.js not matching its assumed "cited source" shape — the same class of gap is likely to recur in L1/APA and L5 given they cite the same SSOT doc pattern.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Track the real citation-yielding research upgrade as a tracked follow-up',
      description: 'lib/value-authenticity/panel-assembly.js (top-of-file comment) explicitly defers "a real citation-yielding research upgrade" to research-engine.js as out of scope for this SD. File that as a scoped follow-up SD/QF once a concrete need for auto-terminating on cited sources (vs. always requiring an explicit caller-supplied primarySource) becomes a blocker for a downstream consumer.',
      priority: 'medium',
      owner_role: 'LEAD',
    },
    {
      title: 'Default decision-binding escalations to context-in-answerPayload, key-in-subject from the first pass',
      description: 'Any future FR that calls decision-binding.js recordDisposition for a chairman escalation should structure subject as the minimal idempotent dedup key and put all contextual history/digests in answerPayload from the initial implementation, per the pattern fixed in commit 7dc0df63b3 for FR-6 AC-3 — avoids a repeat VALIDATION-agent finding and second commit on the next SD that escalates via decision-binding.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
    {
      title: 'Run a live-provider integration smoke test before the MarketLens L3 replay',
      description: 'All 52 new tests are fixture-based; assemblePanel() has not yet been exercised against real multi-family provider adapters. Before or during the SDs own success criterion 3 (MarketLens L3 replay), run one live assemblePanel() invocation against actual provider-adapters.js output to catch response-shape drift (e.g. a provider omitting the sources array) that fixtures cannot surface.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
  ],
  improvement_areas: [
    {
      area: 'SSOT-doc-assumption vs actual reuse-target return shape (research-engine.js)',
      analysis: 'The SSOT design doc described runResearch() as providing a "cited external primary source with freshness check" for the L4 termination base case. This description was written when SPEC-001/SPEC-002 were designed at the architecture level, one layer removed from the actual function signature. PLAN carried the description into the PRD FR-9 acceptance criteria without a grep-verification step against lib/research/research-engine.js. The gap was only caught mid-EXEC when the implementer needed to wire isTerminated() to a real return value and found confidence_score/consensus but no source/freshness fields.',
      prevention: 'Add a PLAN-phase step (documented here as a reusable checklist item, not just this SDs anecdote) for any FR whose acceptance criteria assumes a specific return shape from an existing reuse-target function: grep the function body and its actual return statement before finalizing the FR, not just the SSOT docs prose description of it. This generalizes directly to the L1/APA and L5 value-authenticity layers, which cite the same SSOT doc and are likely to name reuse targets the same way.',
    },
    {
      area: 'Round-cap chairman escalation missing context on first implementation pass (FR-6 AC-3)',
      analysis: 'The PRD acceptance criterion explicitly required the round-cap escalation to include full round history as context, but the first implementation defaulted to the minimal decision-binding subject shape ({question} only) without adding a second context field. The underlying cause is that decision-bindings idempotent-dedup contract (subject must stay minimal and stable) and its context-carrying capacity (answerPayload) were not both surfaced to the implementer at once — the dedup requirement was salient, the context requirement was not, until the VALIDATION sub-agent flagged it at PLAN_VERIFICATION.',
      prevention: 'Fixed for this SD via commit 7dc0df63b3 (roundHistoryDigest added to answerPayload, subject kept minimal). Documented as key_learnings item above so the subject-vs-payload split is explicit for the next FR that escalates via decision-binding, rather than relying on a second VALIDATION-agent catch.',
    },
  ],
  success_patterns: [
    'Verify a reuse targets actual code (grep return shape/signature) before designing new logic against an SSOT documents assumption about what that reuse target provides — caught research-engine.js not matching the "cited primary source" assumption before it shipped as decorative grounding.',
    'Enforce a never-launder-upward invariant via the DATA MODEL (separate canonical_grade / computed_weakest_link_grade / effective_grade columns) rather than only via application-code convention.',
    'Reuse the predecessor SDs L2 trigger predicate via a verified static import (classifyTriggerPredicate) instead of building a second classifier — matches the coupled-pair, sourced-behind sequencing pattern shared with SPEC-001.',
  ],
  failure_patterns: [
    'Round-cap chairman escalation shipped without full round-history context on the first pass (FR-6 AC-3) — caught by the VALIDATION sub-agent at PLAN_VERIFICATION, fixed in a second commit (7dc0df63b3) rather than in the original implementation.',
  ],
  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002',
    commits: ['5299ac7a22', '7dc0df63b3'],
    tests_run: 85,
    tests_passing: 85,
    tests_new: 52,
    tests_sibling_regression: 33,
    loc_source_files: ['lib/value-authenticity/weakest-link.js', 'lib/value-authenticity/divergence-router.js', 'lib/value-authenticity/panel-assembly.js'],
    predecessor_sd: 'SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001',
    predecessor_pr: 5761,
    pr_number: null,
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
