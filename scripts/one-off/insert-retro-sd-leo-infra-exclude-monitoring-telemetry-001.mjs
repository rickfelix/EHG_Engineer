#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-value-authenticity-spec-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp. Content is sourced from
 * the actual PRD (product_requirements_v2), the SD row, and the sub_agent_execution_results
 * rows for this sd_id (TESTINGx3, VALIDATION, RISKx3, DESIGNx2, Explore, SECURITY,
 * VISION_FIDELITY) plus plan_critiques and feedback (harness-bug signals) — not
 * generic phase-completion boilerplate.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'a675216c-335c-47bd-80ff-474c4e5fd0d1';
const SD_KEY = 'SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001';

export const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — exclude 11 non-code-fixable monitoring/telemetry categories from /leo assist Phase 1`,
  description: 'A LEAD-phase dryRun AssistEngine pass measured that classifyIssue() in lib/quality/assist-engine.js does pure LOC-threshold bucketing with zero category awareness, so /leo assist Phase 1\'s autonomous-fix loop would attempt thousands of nonsensical code fixes against automated monitoring/governance OUTPUT rows (gauge findings, comms-framing flags, verification-ledger records, Adam drift telemetry, chairman rulings) that have no single-row code fix. This is explicitly the third iteration of the same class of fix (harness_backlog -> completion_flag via QF-20260704-993 -> these 11 categories): a new lib/governance/non-code-fixable-categories.cjs module (NON_CODE_FIXABLE_CATEGORIES Set + filterIssuesExcludingNonCodeFixable) was chained — not run in parallel — after the existing filterIssuesExcludingNeedsDecision stage inside loadInboxItems(), gated by a LEO_ASSIST_NONCODE_FILTER rollback env var.',
  affected_components: [
    'lib/governance/non-code-fixable-categories.cjs',
    'lib/quality/assist-engine.js',
    'tests/unit/assist-engine-non-code-fixable-filter.test.js',
    'lib/governance/feedback-terminal-categories.cjs',
  ],
  what_went_well: [
    'A prospective testing-agent invocation at LEAD phase — commissioned BEFORE the PRD was even written — caught a genuine defect class (DEF-1) in the SD\'s own original scope: both the existing filterIssuesExcludingNeedsDecision and the newly-proposed filter take `enriched` and both return a key literally named `issues`; loadInboxItems() keeps only ONE `issues` binding. The original scope described wiring the two filters "alongside" each other (independently/in parallel); had that shipped, the new filter\'s output would have silently reverted QF-20260704-993, reintroducing all 253 open completion_flag rows into the autonomous-fix loop. The correction (explicit chained-wiring code shape) was written directly into the LEAD-amended scope and PRD FR-2 before EXEC ever started, not discovered mid-implementation.',
    'Every population count was re-measured against the live feedback table at each phase rather than reused from an earlier estimate, and the numbers genuinely drifted because the table accrues rows continuously: LEAD-phase dryRun measured 6197 rows post-existing-filters (5415 invariant_gauge_finding + 917 more across 10 sibling categories); the RISK sub-agent\'s own differential replay over 19899 live rows measured open_issues_before=6534/after=69 (6465 removed, 98.9%); the PLAN-phase TESTING sub-agent measured 6787 unlinked issue rows against v_feedback_with_sensemaking; and the final EXEC-phase post-fix measurement (4 alternating enabled/disabled runs to control for drift) found filter-enabled issues=20 with 0 leaked across all 11 categories, versus filter-disabled issues=6231 with all 11 categories present (invariant_gauge_finding 5417, comms_quality 396, verification_ledger 199, adam_adherence_drift 90, feedback_sla_breach 74, relay_drop 18, adam_doc_drift 12, adam_solomon_health 2, adam_morning_brief 1, chairman_ruling 1, sms_relay 1) — a net 6211 rows (99.7%) removed from Phase 1.',
    'Real mutation testing, not just a green suite, proved the two integration tests (T4, T8) are load-bearing rather than passing for the wrong reason. Applying the EXACT DEF-1 regression as a literal source mutation (passing `enriched` instead of `decisionFiltered` into the new filter — i.e. reverting to the original scope\'s parallel wiring) produced exactly 2 failures, T4 and T8, and ZERO failures across all 7 pure-function unit tests. That is empirical, not asserted, confirmation that pure-function tests of each filter in isolation would have shipped the DEF-1 defect silently. Three further mutations (neutering the exclusion predicate, ignoring the LEO_ASSIST_NONCODE_FILTER env gate, dropping sms_relay from the Set) were also applied and caught, each by the expected subset of tests.',
    'An Explore sub-agent mechanism-verification pass, commissioned specifically to satisfy the gate\'s file:line citation requirement, caught a real inaccuracy in the worker\'s own PRD draft before EXEC began: TR-2 originally claimed NON_CODE_FIXABLE_CATEGORIES "matches TERMINAL_CATEGORIES\'s own Set implementation," but reading lib/governance/feedback-terminal-categories.cjs:14 showed TERMINAL_CATEGORIES is actually `Object.freeze([...])`, a frozen Array using `.includes()`, not a Set with `.has()`. Corrected in the PRD before implementation rather than shipped as a false claim.',
    'The EXEC-phase SECURITY sub-agent treated the choice of a real Set (rather than a plain object-literal membership map) as a deliberate, verifiable hardening decision, not a style preference: it probed the live module directly and confirmed `NON_CODE_FIXABLE_CATEGORIES.has("__proto__")`, `.has("constructor")`, `.has("toString")`, `.has("hasOwnProperty")`, and `.has("valueOf")` all return false — closing the exact prototype-chain membership-bypass class a `MAP[category]` object-literal lookup would have been silently vulnerable to (a feedback row with category="constructor" would have wrongly matched).',
    'A sub-agent finding that was genuinely out of this SD\'s scope was correctly filed separately instead of chased inline: the EXEC-phase TESTING sub-agent noticed assist-engine\'s CAPA-5 stale-untriaged filter is discarding 8096-8098 rows on every /leo assist Phase 1 dryRun (the documented signature of the hourly clockwork-auto-triage workflow failing its grace window), confirmed it was unrelated to this SD\'s own filter (correct on both sides of that backlog), and filed it as an independent harness-bug feedback row (short-id 6c074c56) rather than expanding this SD\'s scope to fix an unrelated upstream workflow.',
    'A real harness bug in the PRE_PLAN_ADVERSARIAL_CRITIQUE gate itself (lib/eva/devils-advocate.js:28 hardcodes MAX_ANALYSIS_CHARS=8000 and truncates PRD content — line 438 — before the critique LLM ever sees it) was diagnosed rather than worked around by editing the PRD to dodge it: this SD\'s serialized PRD content was 15673 chars, so the critique saw a truncated document and reported a hallucinated "acceptance_criteria is truncated" BLOCK finding, verified false by a direct read of the complete field in product_requirements_v2. Filed as harness-bug feedback (short-id 3c10c032) and worked around twice via the documented critique-override.js escape hatch, each override bound to that run\'s exact findings fingerprint (plan_critiques rows 2511c0d9 and 77e93bf8).',
  ],
  what_needs_improvement: [
    'A full phase-handoff step was skipped mid-session: after LEAD-phase sub-agent work and PRD authoring, the worker proceeded straight into PLAN-TO-EXEC precheck without ever running `handoff.js execute LEAD-TO-PLAN` — the SD was still status=\'draft\'/current_phase=\'LEAD\' with zero rows in sd_phase_handoffs despite a fully-written PRD existing. PRD creation and phase-handoff execution are two different actions in this harness; completing one does not imply the other ran. The gap was caught only by PLAN-TO-EXEC precheck\'s own ERR_CHAIN_INCOMPLETE guard ("No accepted LEAD-TO-PLAN handoff for sd_id=a675216c...", .artifacts/precheck-plan-to-exec.txt:405/485/583), not by the worker noticing on its own.',
    'The SD\'s ORIGINAL scope (before the LEAD amendment) described wiring the two exclusion filters "alongside" each other — an independent/parallel composition that, as DEF-1 established, would have silently clobbered the pre-existing filterIssuesExcludingNeedsDecision output via a duplicate `issues` destructure key and reintroduced 253 open completion_flag rows. This was caught by commissioning a prospective testing-agent pass before PRD authoring, not by the scope text itself calling out the shared-key hazard — filter-composition changes touching an existing multi-stage pipeline do not yet default to naming the exact destructure shape at scope-authoring time.',
    'FR-1\'s own stated rationale (a shared module reusable standalone by future consumers) was not self-certified on the first EXEC pass: no test required() lib/governance/non-code-fixable-categories.cjs directly — only the assist-engine.js re-export path was exercised (grep found exactly one importer repo-wide). The EXEC-phase TESTING sub-agent\'s conditional-pass finding forced a second commit (1abe8f0c8fd) to close FR-1 AC5; the "future consumer can require() this standalone" guarantee rode on a one-off manual check until that second pass, rather than being CI-enforced from the first commit.',
    'The same PRE_PLAN_ADVERSARIAL_CRITIQUE truncation false-positive (BLOCK severity) recurred across two consecutive gate runs with the identical claim, requiring two separately-authored overrides (plan_critiques 2511c0d9 and 77e93bf8) rather than one — a genuine harness defect, not a defect in this SD\'s own plan, but it still cost two rounds of override-writing instead of one before LEAD-TO-PLAN could proceed.',
    'The exported NON_CODE_FIXABLE_CATEGORIES Set is mutable at runtime — `.add()`/`.delete()` both succeed and `Object.isFrozen()` is false — a gap the PLAN-phase TESTING sub-agent (finding F5) and the EXEC-phase SECURITY sub-agent (finding S3) independently flagged from two different phases. The precedent module\'s `Object.freeze([...])` pattern does not actually transfer meaningfully to a Set (freeze governs own properties, not a Set\'s internal add/delete slots), so genuine tamper-hardening would need an exported predicate function instead; rated low-severity/non-blocking (requires in-process code execution) and deferred rather than fixed in this pass.',
  ],
  key_learnings: [
    'When two filter functions in the same synchronous pipeline both destructure their return value under the key name `issues`, chained-vs-parallel composition is not a style choice — it is the entire difference between "extends an existing exclusion" and "silently reverts it." Any future exclusion-filter addition built on this file\'s `{issues, skippedX}` convention should have its exact destructure shape written into the FR text before implementation, the way FR-2 ultimately was here, rather than described only at the behavioural level.',
    'Pure-function unit tests of a filter, however thorough (7 of the 12 new tests target the filter function in isolation and all stayed green under the DEF-1 mutation), cannot see a wiring defect that only exists at the orchestrating call site. Only an integration test that drives the real orchestrating function itself (here, the actual loadInboxItems(), not a re-implementation of what it should do) can catch it — and this was proven empirically via mutation testing, not just argued from principle.',
    'A claim about a sibling module\'s implementation detail ("TERMINAL_CATEGORIES is a Set") should be verified by reading the actual declaration, not inferred from the sibling\'s role or naming. Here the wrong assumption only cost a PRD rationale sentence (TR-2), caught before EXEC by a commissioned Explore pass — but the same category of unverified assumption against a reused function\'s actual return shape (rather than its docstring) is a documented recurring defect class in this codebase\'s history and can cost a mid-EXEC redesign instead of a one-line correction.',
    'A hardcoded, per-file category-exclusion list is a single-representation violation that reliably recurs: this SD is explicitly the third iteration of the same fix (harness_backlog -> completion_flag -> these 11 categories), and the LEAD-phase RISK sub-agent\'s own CONDITIONAL_PASS flagged that the 11-category set is already measurably incomplete relative to ~28 near-miss rows in sibling categories (chairman_decision_capture, solomon_adherence_drift, solomon_trend_candidate, g2_apply_evidence). Landing the set in a new shared lib/governance/ file — rather than inline in assist-engine.js as originally scoped — is what keeps a fourth iteration cheap instead of another rewrite plus a fourth hardcoded list for ~20 other consumers (fleet-dashboard, gauge-registry, feedback-sla-gauge, sd-from-feedback, drain-inventory) to individually adopt.',
    'A rollback lever is only as trustworthy as its own observability. The PLAN-phase TESTING sub-agent\'s F2 finding established that under the naive mirror of the existing skip-count convention (both branches guarded by `if (skipped > 0)`), an operator would see IDENTICAL output — nothing — whether the filter was disabled or simply matched zero rows. TS-9/T8 closed this by requiring the disabled state to emit its own distinguishable log line; a toggle that cannot prove it fired is not actually a working rollback lever.',
    'Treating a sub-agent\'s out-of-scope finding as a signal to file elsewhere, rather than as an invitation to expand scope, protects both the current SD\'s boundary and the finding itself. The CAPA-5 stale-untriaged discovery and the devils-advocate truncation-bug discovery were both filed as independent harness-bug feedback rows instead of being folded into this SD\'s implementation — keeping them visible for someone to pick up without making a monitoring-category exclusion SD responsible for fixing an unrelated critique-gate truncation bug or an unrelated auto-triage cron failure.',
  ],
  action_items: [
    {
      action: 'When a PRD FR claims a new lib/governance/ module is reusable standalone by future consumers via require(), require a direct require() test in that FR\'s acceptance criteria from the first draft — not only an assist-engine.js re-export test. This SD needed a second EXEC commit (1abe8f0c8fd) to close FR-1 AC5 after the EXEC-phase TESTING sub-agent caught the gap.',
      owner: 'PLAN',
      priority: 'medium',
      status: 'open',
    },
    {
      action: 'Export an isNonCodeFixable(category) predicate function from lib/governance/non-code-fixable-categories.cjs (or otherwise document/harden the immutability asymmetry versus the Object.freeze() precedent), closing the finding independently raised by the PLAN-phase TESTING sub-agent (F5) and the EXEC-phase SECURITY sub-agent (S3) on the mutable exported Set.',
      owner: 'EXEC',
      priority: 'low',
      status: 'open',
    },
    {
      action: 'File a tracked follow-up SD/QF for the ~28-row near-miss category gap (chairman_decision_capture 16, solomon_adherence_drift 2, solomon_trend_candidate 9, g2_apply_evidence 1) per the LEAD-phase RISK sub-agent\'s CONDITION D, rather than leaving it only as deferred text inside this SD\'s risk register.',
      owner: 'LEAD',
      priority: 'medium',
      status: 'open',
    },
    {
      action: 'Fix the PRE_PLAN_ADVERSARIAL_CRITIQUE false-positive at lib/eva/devils-advocate.js:28 (MAX_ANALYSIS_CHARS=8000 truncates PRD content before the critique LLM sees it, producing a hallucinated truncation BLOCK on any PRD over 8000 chars) — chunk the content or raise the cap, and stamp truncation provenance into the prompt so the LLM cannot mistake cap-truncation for artifact-truncation. Tracked as harness-bug feedback (short-id 3c10c032).',
      owner: 'LEO-INFRA',
      priority: 'medium',
      status: 'open',
    },
    {
      action: 'Investigate assist-engine\'s CAPA-5 stale-untriaged filter discarding 8096-8098 rows on every /leo assist Phase 1 dryRun — the documented signature of the hourly clockwork-auto-triage workflow failing its 1-hour grace window. Unrelated to this SD (filter behavior confirmed correct on both sides of that backlog); tracked as harness-bug feedback (short-id 6c074c56).',
      owner: 'LEO-INFRA',
      priority: 'medium',
      status: 'open',
    },
  ],
  improvement_areas: [
    {
      area: 'A completed PRD was mistaken for a completed phase handoff mid-session (missed LEAD-TO-PLAN execution)',
      analysis: 'PRD authoring (add-prd-to-database.js / inline PRD write) and phase-handoff execution (handoff.js execute LEAD-TO-PLAN) are two separate actions in this harness, and nothing in the authoring flow itself signals that the second action has not yet run. The SD sat at status=\'draft\', current_phase=\'LEAD\', with a fully-written PRD and zero sd_phase_handoffs rows until PLAN-TO-EXEC precheck\'s own ERR_CHAIN_INCOMPLETE guard caught the gap ("No accepted LEAD-TO-PLAN handoff for sd_id=a675216c..., Found 0 non-accepted record(s).").',
      prevention: 'The precheck guard worked exactly as designed here and should stay as the safety net, but it is a net, not a substitute for noticing at the time — PRD-authoring completion and phase-handoff-execution completion should be treated and visibly tracked as two separately-confirmed steps rather than one implying the other.',
    },
    {
      area: 'Original SD scope proposed a parallel (not chained) filter composition that would have silently reverted a shipped fix',
      analysis: 'The initial scope\'s mental model treated the new exclusion filter as an independent, additive pass over the same `enriched` input rather than as a second stage layered onto an existing pipeline that already returns a same-named `issues` key. Nothing in the original scope text flagged the shared destructure key as a hazard until a prospective testing-agent pass was specifically commissioned to stress-test the plan before PRD authoring — the defect (DEF-1) was real and would have reintroduced 253 open completion_flag rows into the autonomous-fix loop had it shipped as originally scoped.',
      prevention: 'Fixed for this SD by LEAD-amending the scope with the exact chained-wiring code shape (FR-2) and a permanent composition-test regression guard (TS-4) through the real pipeline. Documented here as the reusable check: when an FR modifies or extends an existing multi-stage filter/pipeline function, name the exact destructuring/variable-binding shape in the scope text itself, not just the intended behaviour.',
    },
  ],
  success_patterns: [
    'Commissioning a prospective testing-agent pass BEFORE PRD authoring — not just after implementation — catches filter/pipeline wiring-composition defects that code review after the fact is unlikely to catch reliably, because the defect is invisible until someone asks "what does the destructure actually bind at the call site?"',
    'Mutation testing that applies the EXACT regression a prior defect finding warned about (here, DEF-1\'s parallel-vs-chained wiring, reproduced as a literal source mutation) is the test-quality evidence that distinguishes "the tests would have caught this" from "the tests happen to be green" — proven by M2 catching it via T4/T8 alone while all 7 pure-function tests stayed green.',
    'Extending an established exclusion-filter precedent (lib/governance/feedback-terminal-categories.cjs, and the harness_backlog -> completion_flag lineage already in assist-engine.js) into a new shared file — rather than inlining a 4th hardcoded category list — is what keeps the next iteration of the same recurring fix class cheap instead of another rewrite.',
  ],
  failure_patterns: [
    'Original SD scope described a parallel (independent) filter composition that would have silently reverted an already-shipped fix (QF-20260704-993) by clobbering a shared `issues` destructure key — caught only by a prospective sub-agent pass commissioned specifically to find this class of defect, not by the scope authoring itself.',
    'A fully-authored PRD was mistaken for a completed LEAD-TO-PLAN handoff mid-session; the SD progressed through PLAN-phase artifact creation while the database still recorded it as status=draft/current_phase=LEAD with zero handoff rows, caught only by a downstream PLAN-TO-EXEC precheck guard rather than being noticed at the time it happened.',
  ],
  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001',
    commits: ['bb72a5835d0', '1abe8f0c8fd'],
    tests_new_file: 'tests/unit/assist-engine-non-code-fixable-filter.test.js',
    tests_new_count: 12,
    tests_full_regression_suite_run: 31,
    tests_full_regression_suite_files: 5,
    tests_regressions: 0,
    mutation_tests_applied: 4,
    mutation_tests_caught: 4,
    live_data_filter_enabled_issues: 20,
    live_data_filter_disabled_issues: 6231,
    live_data_rows_suppressed: 6211,
    live_data_categories_leaked: 0,
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    handoff_validation_scores: { LEAD_TO_PLAN: 94, PLAN_TO_EXEC: 94, EXEC_TO_PLAN: 88 },
    sub_agent_execution_ids: {
      lead_testing_prospective: '6049bbfd-e9b6-4ae9-8fc5-a6e86d193a92',
      exec_testing_mutation: '618534fe-797e-4142-bd81-0303f511ca74',
      lead_explore: '6a30607e-3302-4c31-86ad-6ff00d076b0e',
      exec_security: 'cac4fc5c-4103-4f98-848b-0b4479560af8',
      lead_risk_conditional_pass: 'ae66d257-132c-459b-9133-16dff5172efc',
      plan_verification_vision_fidelity: 'e0b294a9-cf60-41c0-bca9-df2b27ad10fe',
    },
    plan_critiques_pre_plan_adversarial: {
      total_runs: 4,
      overridden_runs: 2,
      overridden_ids: ['2511c0d9-9175-433d-9d2f-52ae0f3e0023', '77e93bf8-b795-463d-8311-615692aea3c7'],
      root_cause: 'lib/eva/devils-advocate.js:28 MAX_ANALYSIS_CHARS=8000 truncates prdContent (line 438) before the critique LLM sees it',
    },
    harness_bug_signals_filed: [
      { short_id: '3c10c032', feedback_row_id: 'e3545956-6d05-4a72-831b-fc104ba123e4', topic: 'PRE_PLAN_ADVERSARIAL_CRITIQUE MAX_ANALYSIS_CHARS truncation false-positive' },
      { short_id: '6c074c56', feedback_row_id: '3a19c476-b06c-4259-90c0-eccf9916f6ed', topic: 'assist-engine CAPA-5 stale-untriaged filter discarding 8096-8098 rows/run' },
    ],
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

  // Guard against double-insert (mirrors generate-comprehensive-retrospective.js dedup check)
  const { data: existing } = await s
    .from('retrospectives')
    .select('id')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);
  if (existing && existing.length > 0) {
    console.log('SD_COMPLETION retrospective already exists:', existing[0].id, '— not inserting a duplicate.');
    process.exit(0);
  }

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

import { fileURLToPath } from 'url';
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
