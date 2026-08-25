#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001.
 *
 * Written directly (not via the generic derivation in scripts/generate-retrospective.js)
 * because that script's what_went_well/key_learnings arrays are auto-concatenated from
 * raw sub-agent recommendation/warning strings — real per-SD data, but phrased as a flat
 * log rather than distilled insight. This SD's review chain surfaced several genuinely
 * reusable lessons (premise falsification, verify-the-verifier, N-branch shape collision,
 * exhaustive call-site tracing) that are worth stating as lessons, not just quoting the
 * sub-agent line that implies them. Content below is drawn from and cites the actual
 * sub_agent_execution_results rows and commits for this SD (verified via direct DB query
 * and `git show` before writing), not from the SD's own narrative alone.
 *
 * Schema/constraints followed from scripts/generate-retrospective.js:
 * - insert as DRAFT, let auto_validate_retrospective_quality() compute quality_score,
 *   promote to PUBLISHED only if score >= 70.
 * - retro_type='SD_COMPLETION', retrospective_type=null (required by getFilteredRetrospective
 *   / RETROSPECTIVE_QUALITY_GATE filters).
 * - array sizes under the CHECK constraint caps (what_went_well<=25, key_learnings<=30,
 *   action_items<=25, what_needs_improvement<=20).
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveCanonicalAppName } from '../../lib/repo-paths.js';
import { normalizeLearningCategory } from '../../lib/retro/learning-category.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) throw new Error(`Cannot load SD ${SD_KEY}: ${sdErr?.message}`);

  const canonicalTargetApp = await resolveCanonicalAppName(sd.target_application, supabase);
  const learning_category = normalizeLearningCategory('PROCESS_IMPROVEMENT');

  const what_went_well = [
    'LEAD-phase Explore verification (evidence 2a677465) independently re-checked the coordinator-authored, chairman-ratified SD premise against the live DB rather than trusting the SD text, and measurement-falsified 2 of the 4 claimed defects before any PRD or code existed: launch_mode=simulated + launched_at=NULL is the universal unflipped default across all 152 ventures (not AltifyAI-specific), and VENTURE-SCAFFOLD-CODE-001 applyVentureScaffoldModules() only writes CI/deploy files to a git repo with zero DB writes (the real guardrail writer, persistGuardrailDecisions, is different code gated behind a Stage-24 handler AltifyAI cannot reach at stage 19).',
    'The LEAD re-scope to only the 2 confirmed, actionable defects (FR-3/FR-4c: eva_stage_gate_attempts has 0 rows for AltifyAI despite 19 chairman-approved transitions) avoided EXEC effort on unreachable/nonexistent work — the SD shipped ~75% smaller in scope than originally chartered.',
    'A follow-up Principal Systems Analyst pass (evidence 0443c8b7) re-verified the LEAD re-scope independently and caught that the falsification\'s OWN justification text contained a factual error (claiming "no telemetryRowCount data source exists" when lib/eva/external-observation.js has queried a real venture_telemetry table since 2026-07-09) — the final scope decision held, but the stated reasoning for it was corrected before being carried forward.',
    'PLAN-phase TESTING caught a real, deterministic defect in its own prospective PRD review before any implementation code was written (evidence e7445772, FAIL 90): the PRD\'s literal gateType:\'chairman_gate\' value matches no entry in recordGateAttempt()\'s GATE_TYPE_MAP and would violate the eva_stage_gate_attempts CHECK constraint on every real call, and the naive one-call-site design gave no way to distinguish 4 different approval paths that all set approved:true.',
    'PLAN_VERIFICATION\'s VALIDATION sub-agent (evidence c39db537) went beyond the "3 call sites that pass a result context" scope both prior reviewers (TESTING at EXEC-TO-PLAN, REGRESSION at PLAN_VERIFICATION) had inventoried, traced all 7 call sites of _advanceStage(), and found 2 pre-existing production shortcuts (pre_exec_skip at :1187, re_entry at :1245, plus pre_exec_skip_trigger) that reach a genuine chairman-approved advance without ever calling _handleChairmanGate() — reproducing the exact defect the SD existed to fix, undetected by the narrower trace.',
    'Every fix across all 3 review rounds (TESTING FAIL, then CONDITIONAL_PASS catching 2 toEqual-pin breaks, then VALIDATION FAIL) was mutation-verified per commit message: the fix reverted, the corresponding test confirmed to fail for the right reason, then restored — e.g. the VALIDATION fix commit removed one of the 3 new chairmanGateSource occurrences and confirmed 2 of 11 tests failed before restoring it.',
    'Independent full-suite regression checks were run and their numbers checked against commit-message claims rather than trusted at face value — PLAN_VERIFICATION\'s VALIDATION pass ran tests/unit/eva/ directly (569 files, 7401/7440 passed, 1 pre-existing unrelated DB-tier failure) and found the commit message\'s "48 tests" claim for the 6 most-implicated files actually totaled 42.',
  ];

  const key_learnings = [
    'A coordinator-authored, chairman-ratified SD\'s premise can still be measurement-false on specific factual claims even after sign-off. LEAD-phase independent verification against the live DB (not the SD\'s own text) here found 2 of 4 claimed defects were universal system defaults or nonexistent mechanisms, not AltifyAI-specific bugs — chairman ratification approves the INTENT to investigate, not the accuracy of the diagnosis.',
    'The verifier needs its own verification pass. The Principal Systems Analyst\'s re-check of the LEAD re-scope did not overturn the scope decision, but it did catch that the falsification\'s supporting evidence itself contained a stale/false sub-claim (telemetryRowCount "has no data source", contradicted by a 6-week-old commit) and an overstated one ("970 rows across other ventures" was actually 1034 rows on a single venture). Correcting-and-confirming is a distinct, valuable outcome from either "confirm" or "reject".',
    'A function with N return branches that all produce an identical output shape is a design smell that hides which branch fired. _handleChairmanGate()\'s 5 branches (3 automated auto-approvals, 2 genuine chairman decisions) all returned {blocked, killed, approved} with no discriminator; PLAN\'s prospective PRD review caught this before EXEC, and the fix (an explicit `source` field on every branch) is what let the new recordGateAttempt() call downstream tell automated approvals apart from real chairman adjudication.',
    'Finding all consumers of a shared, multi-call-site function requires an exhaustive trace, not a sample of the call sites already touched by the current change. _advanceStage() has 7 call sites; the first implementation instrumented the one reachable via _handleChairmanGate() and two PRIOR reviews (TESTING at EXEC-TO-PLAN, REGRESSION at PLAN_VERIFICATION) both inventoried only "the 3 call sites that pass a result context" — the same narrower frame each time. It took a PLAN_VERIFICATION reviewer explicitly tracing ALL 7 (not re-confirming the 3 already named) to find the 2 additional pre-existing "chairman approved between polls, worker re-enters" shortcuts (pre_exec_skip, re_entry) that never touch _handleChairmanGate() and would still have produced zero ledger rows for real approvals reaching them.',
    'Iterative sub-agent review across LEAD -> PLAN -> PLAN_VERIFICATION each caught a genuinely new class of defect rather than re-litigating the same finding: LEAD caught a false premise (defects that don\'t exist), PLAN-TO-EXEC TESTING caught a deterministic implementation defect before code existed (invalid enum value + branch-shape collision), and PLAN_VERIFICATION VALIDATION caught an incomplete call-site trace in the shipped code. Each phase\'s review looked at a different surface (claims, design, implementation completeness) and each one found something real.',
    'A PRD\'s own literal acceptance criteria can describe a stronger guarantee than the negotiated, shipped test strategy actually provides. FR-1/FR-2 described fixture-based row-count proof against a real _advanceStage() invocation; the actual test (advance-stage-chairman-attempt-recording.test.js) is fs.readFileSync + string-containment only, because _advanceStage() itself (~560 lines, 7+ .from() chains, 4 dynamic imports) was independently assessed as too entangled to unit-test end-to-end. That trade-off was legitimately pre-negotiated at PLAN-TO-EXEC (evidence 56dc6248) — but the acceptance-criteria text was never corrected to match until VALIDATION flagged the mismatch, leaving a stale, stronger-than-actual claim in the PRD for two more review rounds.',
    'A missing chairman-approval decision (the 2026-08-22 ruling to re-enter AltifyAI at Stage 0, decision 97e47923) was material context the SD\'s own problem statement never cited, and was surfaced only because LEAD verification queried the live chairman_decisions data rather than relying on the SD\'s written narrative. SDs written by an upstream coordinator can lag current chairman decisions that materially change the affected system\'s state.',
  ];

  const action_items = [
    'Watch AltifyAI\'s next real chairman kill/promotion approval in production and confirm exactly one eva_stage_gate_attempts row is written per approval, and zero rows for a blocked/non-approved decision — PLAN_VERIFICATION\'s VALIDATION evidence (c39db537) explicitly flagged that static analysis alone cannot fully close this and a live smoke test is the only way to confirm which of the (now 4) instrumented code paths fires in practice.',
    'Correct docs/reference/launch-mode-policy.md, which is stale on the telemetryRowCount claim the LEAD Principal Systems Analyst found factually false (a 6-week-old commit already wired lib/eva/external-observation.js to a real venture_telemetry query) — flagged in evidence 0443c8b7 but left as a follow-up rather than fixed inline since it was out of this SD\'s corrected FR-3/FR-4c scope.',
    'Investigate the ApexNiche AI stage-21 gate as a separate, unrelated live issue: the LEAD Principal Systems Analyst incidentally found 1034 eva_stage_gate_attempts rows all belonging to that single venture, with attempt_number climbing past 518 on a ~30-second cadence and byte-identical chairman-override reasoning dated 2026-07-31 — a pattern consistent with a runaway retry loop, surfaced but out of scope for this SD (recommended via /signal to that venture\'s owner in evidence 0443c8b7).',
    'When a PRD trade-off narrows a test strategy after acceptance criteria are written (as happened here for FR-1/FR-2), update the acceptance-criteria text in the same pass as the trade-off decision rather than leaving the stronger original wording to be caught by a later review round — this SD\'s VALIDATION-fix commit (b25ef69a64e) had to retroactively correct FR-1/FR-2\'s PRD text for exactly this reason.',
  ];

  const what_needs_improvement = [
    'The first EXEC-TO-PLAN pass on _advanceStage() call-site coverage (TESTING, evidence in the EXEC-TO-PLAN chain) made a claim about the universalApproved/isPreExecGate branch "eventually still reaching _handleChairmanGate()" that PLAN_VERIFICATION\'s VALIDATION reviewer directly falsified by reading the branch\'s actual code — the claim held only for the "no artifacts yet" sub-case, not the dominant "artifacts already exist" case. A claim about control flow should be checked against every named sub-case, not the first one that confirms the expected story.',
    'Two independent reviews (TESTING at EXEC-TO-PLAN, REGRESSION at PLAN_VERIFICATION) both scoped their _advanceStage() call-site inventory to "the 3 call sites that pass a result context" without noticing that framing itself excluded 4 other call sites by construction — the same boundary was inherited rather than re-derived twice before a third reviewer traced all 7.',
    'The EXEC-TO-PLAN Chief Security Architect review (evidence 4aa0e4b4, CONDITIONAL_PASS 70) found an unrelated RLS table census could not run (missing get_tables_without_rls function) and 56 SECURITY DEFINER functions callable by anon/authenticated while bypassing RLS — real findings outside this SD\'s scope, tracked here as an incidental finding rather than acted on, per the standard "surface but don\'t scope-creep" pattern.',
  ];

  const retrospective = {
    sd_id: sd.id,
    target_application: canonicalTargetApp,
    project_name: sd.title,
    retro_type: 'SD_COMPLETION',
    retrospective_type: null,
    title: `${sd.sd_key} Retrospective`,
    description: 'Chairman-ratified SD claiming AltifyAI venture-row instrumentation was dishonest (4 claimed defects); LEAD-phase independent DB verification measurement-falsified 2 of 4 and re-scoped to the 2 confirmed, actionable ones (zero eva_stage_gate_attempts rows despite 19 real chairman-approved transitions). PLAN and PLAN_VERIFICATION reviews each caught a distinct, real defect class (invalid enum + branch-shape collision; incomplete call-site coverage across 7 call sites) before/after implementation, all mutation-verified.',
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: [
      'Explore', 'Principal Systems Analyst', 'Senior Design Sub-Agent',
      'Principal Database Architect', 'Risk Assessment Sub-Agent',
      'User Story Context Engineering Sub-Agent', 'QA Engineering Director',
      'Enhanced QA Engineering Director v2.4.0', 'Chief Security Architect',
      'Regression Validator Sub-Agent', 'VALIDATION', 'Continuous Improvement Coach',
      'Vision Fidelity Sub-Agent',
    ],
    human_participants: ['LEAD', 'Chairman'],

    what_went_well,
    key_learnings,
    action_items,
    what_needs_improvement,

    learning_category,
    affected_components: ['lib/eva/stage-execution-worker.js', 'lib/eva/artifact-persistence-service.js', 'eva_stage_gate_attempts'],
    related_files: [
      'lib/eva/stage-execution-worker.js',
      'lib/eva/artifact-persistence-service.js',
    ],
    related_commits: [
      '313884be1ab', // wire chairman-adjudicated stage advances through eva_stage_gate_attempts
      '7bf552b9fdc', // TESTING EXEC-TO-PLAN evidence script
      'b25ef69a64e', // close VALIDATION FAIL — 3 uninstrumented chairman-decision advance paths
    ],
    related_prs: [],
    tags: [sd.sd_key, 'altifyai', 'eva_stage_gate_attempts', 'chairman-gate-instrumentation'],

    team_satisfaction: 8,
    business_value_delivered: 'MEDIUM',
    customer_impact: 'MEDIUM',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 4,
    bugs_resolved: 4,
    tests_added: 6,
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns: [
      'Independent premise verification against live DB before PRD authoring',
      'Prospective PRD review catching implementation defects before code was written',
      'Exhaustive call-site tracing rather than trusting a prior reviewer\'s already-scoped inventory',
      'Mutation-verification of every fix (revert, confirm red, restore, confirm green)',
    ],
    failure_patterns: [
      'Inherited call-site scoping boundary repeated across 2 independent reviews before a 3rd caught it',
      'Stale documentation (launch-mode-policy.md) trusted over a live source file',
    ],
    improvement_areas: ['Cross-reviewer scope inheritance', 'PRD acceptance-criteria drift after negotiated trade-offs'],
    generated_by: 'SUB_AGENT',
    trigger_event: 'SD_STATUS_COMPLETED',

    status: 'DRAFT',
  };

  const { data: inserted, error: insertError } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to insert retrospective: ${insertError.message}`);
  }

  const retroId = inserted.id;
  const calculatedScore = inserted.quality_score;
  console.log(`Inserted retrospective ${retroId}, quality_score=${calculatedScore}`);
  console.log('quality_issues:', JSON.stringify(inserted.quality_issues));

  if (calculatedScore >= 70) {
    const { error: updateError } = await supabase
      .from('retrospectives')
      .update({ status: 'PUBLISHED' })
      .eq('id', retroId);
    if (updateError) {
      console.log(`Failed to publish: ${updateError.message}`);
    } else {
      console.log('Published.');
    }
  } else {
    console.log(`Quality score ${calculatedScore} below 70 — left as DRAFT.`);
  }

  console.log(JSON.stringify({ success: true, retrospective_id: retroId, quality_score: calculatedScore }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
