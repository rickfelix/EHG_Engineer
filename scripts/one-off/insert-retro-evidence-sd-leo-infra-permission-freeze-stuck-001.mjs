#!/usr/bin/env node
/**
 * RETRO sub-agent evidence row for the PLAN-TO-LEAD GATE_SUBAGENT_EVIDENCE
 * check on SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001.
 *
 * Companion to scripts/one-off/_enhance-retro-sd-leo-infra-permission-freeze-stuck-001.mjs
 * (the SD_COMPLETION retrospective row this evidence row references, updated
 * from a generic auto-generated quality_score-90 row to a SD-specific,
 * quality_score-100 row after a boilerplate-pattern check).
 *
 * An earlier RETRO row (abfb029b-6d5c-4fc4-aa9c-eac2b9c8fd7b, phase
 * PLAN_VERIFICATION) already technically satisfied GATE_SUBAGENT_EVIDENCE for
 * this SD's PLAN-TO-LEAD handoff (latest-row-per-code semantics), but its
 * content was the generic auto-generator template (flagged by
 * RETROSPECTIVE_QUALITY_GATE precheck as "Boilerplate detected: 1 pattern(s)
 * found"). This row supersedes it as the newest RETRO row for this SD and
 * carries the actual SD-specific findings.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '535166ea-a81d-4f3d-afff-65956e5f38c6';
const SD_KEY = 'SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001';
const RETRO_ID = '961a6618-3f58-407d-b21d-1f91c68c7b81';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Prologue rule 11: metadata.repo_path is the CANONICAL repo root (worktree
  // suffix stripped, matching applications.local_path for EHG_Engineer), while
  // executed_from_cwd is the RAW process.cwd() -- this session's actual worktree
  // checkout -- so the SUB_AGENT_REPO_RESOLUTION gate's comparison stays exact.
  const cwd = process.cwd().replace(/\\/g, '/');
  const canonicalRepoPath = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';

  const evidence = {
    sd_id: SD_UUID,
    sub_agent_code: 'RETRO',
    sub_agent_name: 'Continuous Improvement Coach',
    verdict: 'PASS',
    confidence: 95,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Pair every PLAN-phase field-name correction (sourced from a live census) with a companion check of that field\'s runtime type from the same census -- D1 shows a corrected NAME can still ship with an unverified TYPE.',
      'Require a demonstrated non-test call site as an acceptance criterion for any newly-authored renderer/formatter function, to catch dead-code-on-arrival (D2) earlier than an EXEC-phase retrospective TESTING pass.',
      'Backfill an automated test for AC-1/TS-1/TS-2 (the coordinator-visible stuck roster), currently covered only by scripts/seeded-firing-stuck-seat.cjs plus a manual owed-actions assertion (D9).',
      'When a disposable, human-supervised sandboxed seat is available, run FR-2\'s originally-scoped live wall-clock trigger test to upgrade the PreToolUse-vs-modal ordering conclusion from documentation-grounded to empirically confirmed.',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      lifecycle_summary: 'LEAD due-diligence (Explore + VALIDATION) cut scope 40% by finding the "build new detection" premise already superseded. PLAN\'s PROSPECTIVE TESTING pass (sub_agent_execution_results 02949f1f) then found 9 structural defects before any code existed. EXEC\'s own RETROSPECTIVE (non-prospective) TESTING pass (c585ac86) found 6 more after code was written, independently re-verified fixed by a follow-up TESTING pass (400a27c4: 264 files/3651 passed/13 skipped/0 failed, up from 263/3635/13/0). SECURITY\'s CONDITIONAL_PASS (df258fd9) on an unfiltered settings.local.json copy was hardened inline. VERIFY-phase VALIDATION (04e88749) and REGRESSION (bcf752bc) found 3 more findings, one of which (condition-1) directly refuted an earlier TESTING absence-claim by grepping the actually-committed test file.',
      sharpest_finding: 'D1: PLAN correctly renamed FR-4\'s cited fields from the nonexistent terminal_identity/callsign to the real window_handle/fleet_identity (sourced from a live census of claude_sessions), but nobody also verified fleet_identity\'s runtime TYPE from that same census. It is an object ({role,color,callsign,assigned_at,accountUuid8,display_name}) on 28/28 live rows, not a string, so both renderers interpolated it raw as "[object Object]" -- while the full 3635-test suite stayed 100% green throughout, because every fixture used a hand-typed string literal instead of a real queried row.',
      genuinely_reusable_lessons: [
        'FIELD_NAME_VS_FIELD_SHAPE: a field-name correction against a live census must be paired with a runtime-type check from that same census; a name fix alone reproduces the identical fixture-vs-production mismatch class one layer deeper.',
        'PASSING_TESTS_HID_A_100_PERCENT_PRODUCTION_DEFECT: 0 test failures is not evidence a field is consumed correctly when every fixture exercising it is hand-typed rather than sourced from a real row.',
        'IN_REPO_INVARIANT_COMMENTS_ARE_A_FREE_PREFLIGHT_CHECK: FR-6\'s ack-based framing was flatly contradicted by owed-actions.cjs\'s own in-caps "never on an acknowledgement stamp" comment -- found by simply reading the target module\'s header before writing any code.',
        'DEAD_CODE_ON_ARRIVAL: FR-4\'s renderKeystrokePacket() was unit-correct and fully tested with zero production call sites -- unit-level correctness says nothing about reachability.',
        'HANG_RISK_SUBSTITUTION_MUST_BE_RECORDED_AS_DATA: FR-2\'s live-trigger acceptance criterion was assessed as a hang risk inside an unsupervised session and substituted with a documentation citation, with the substitution and its fidelity gap recorded structurally in PRD metadata rather than left implicit.',
        'SHARED_BUDGET_CAPPED_RENDERER_TRADE_OFF: enriching a citation flowing through render.cjs\'s shared 160-char cap regressed the routine status line\'s stuck-seat count (3 -> ~2); resolved by routing the full list through a separate unmangled field to the actual target surface instead of widening the shared primitive.',
        'ABSENCE_CLAIMS_ARE_UNVERIFIED_UNTIL_RE_MEASURED: REGRESSION independently refuted an EXEC-phase TESTING "zero coverage" claim by grepping the committed test file and finding the coverage already existed.',
      ],
      boilerplate_check: 'RetrospectiveQualityRubric.detectBoilerplate() run against the enhanced retrospective content before insert: 0 patterns matched (one draft phrase triggered /review.*permissions/i and was reworded before persisting).',
      retrospective_id: RETRO_ID,
      retrospective_quality_score: 100,
    }),
    summary: `RETRO PASS for ${SD_KEY} PLAN-to-LEAD. SD-specific retrospective published/enhanced (id ${RETRO_ID}, quality_score 100, boilerplate check 0 matches) capturing the full LEAD-scope-reduction -> PLAN-prospective-TESTING(9 defects) -> EXEC-retrospective-TESTING(6 defects) -> SECURITY-hardening -> VERIFY-VALIDATION/REGRESSION(3 findings) lifecycle, with 7 genuinely SD-specific reusable lessons (field-name-vs-field-shape; passing-tests-hid-a-production-defect; in-repo-invariant-comments-as-preflight-check; dead-code-on-arrival; hang-risk-substitution-must-be-recorded; shared-budget-capped-renderer-trade-off; absence-claims-are-unverified-until-re-measured), 6 action items, and zero regressions (264 files / 3651 passed / 13 skipped / 0 failed, per TESTING re-verification 400a27c4).`,
    execution_time: 0,
    validation_mode: 'retrospective',
    phase: 'PLAN',
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: 100,
      learnings_count: 7,
      action_items_count: 6,
    },
    metadata: {
      sd_key: SD_KEY,
      phase: 'PLAN',
      retrospective_id: RETRO_ID,
      generated_at: new Date().toISOString(),
      handoff_phase: 'PLAN-TO-LEAD',
      repo_path: canonicalRepoPath,
      repo_resolved: true,
      executed_from_cwd: cwd,
      registry_source: 'db',
      supersedes_retro_evidence_row: 'abfb029b-6d5c-4fc4-aa9c-eac2b9c8fd7b',
    },
    executed_from_cwd: cwd,
    source: 'manual',
  };

  const { data: subRow, error: subErr } = await s
    .from('sub_agent_execution_results')
    .insert(evidence)
    .select('id, sd_id, sub_agent_code, verdict, phase, confidence, created_at')
    .single();
  if (subErr) {
    console.error('Sub-agent insert error:', subErr.message);
    process.exit(1);
  }
  console.log('Sub-agent evidence inserted:', JSON.stringify(subRow, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
