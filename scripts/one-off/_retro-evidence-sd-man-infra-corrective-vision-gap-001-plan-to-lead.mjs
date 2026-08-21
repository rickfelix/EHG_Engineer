#!/usr/bin/env node
/**
 * One-off: Write the RETRO sub-agent evidence row for the PLAN-TO-LEAD
 * GATE_SUBAGENT_EVIDENCE check on SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001.
 *
 * scripts/modules/handoff/required-subagents.js declares RETRO required for
 * PLAN-TO-LEAD. No sub_agent_execution_results row with sub_agent_code='RETRO'
 * existed for this SD -- the retro insert that wrote retrospectives.id=
 * aef2d64d-81ae-43b3-9139-6e65581ff926 (quality_score 90, PUBLISHED) did not
 * itself write this evidence row.
 *
 * CONDITIONAL_PASS, not PASS: the published retrospective's narrative fields
 * (what_went_well / key_learnings / what_needs_improvement / improvement_areas)
 * describe the retrospectives table's OWN quality-validation trigger and
 * constraint/trigger interplay -- not this SD's actual FR-1..FR-5 delivery.
 * Zero mention of Adam election, session-tick daemons, the census scheduled
 * task, or live rotation anywhere in it; related_files/related_commits/
 * related_prs/affected_components are all empty arrays; bugs_found=0 and
 * tests_added=0 are stored despite the SD's own 9-row sub-agent trail
 * describing multiple real bugs found+fixed and new hermetic tests added.
 * This is a directly-observed content mismatch, not an inference. This
 * evidence row supplies the SD-specific synthesis the published retrospective
 * is missing, grounded in the live PRD FRs and the full sub_agent_execution_
 * results trail, and carries forward two still-open VALIDATION findings
 * (evidence 8209dab2) as non-blocking conditions.
 *
 * Uses the canonical evidence pipeline per CLAUDE.md prologue rule 11 --
 * resolveSubAgentRepo -> applySubAgentRepoVerdict (lib/sub-agents/
 * resolve-repo.js) -> storeSubAgentResults (lib/sub-agent-executor/
 * results-storage.js). Mirrors scripts/one-off/
 * _retro-evidence-sd-man-infra-venture-crack-gate-001-plan-to-lead.mjs.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '2cdb76f3-6b94-48ed-80af-7d62ff5362ff';
const SD_KEY = 'SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001';
const RETRO_ID = 'aef2d64d-81ae-43b3-9139-6e65581ff926';
const RETRO_QUALITY_SCORE = 90;

const findings = [
  {
    id: 'RETRO-content-gap-generic-vs-sd-specific',
    severity: 'MEDIUM',
    summary: `retrospectives.id=${RETRO_ID} (retro_type=SD_COMPLETION, status=PUBLISHED, quality_score=${RETRO_QUALITY_SCORE}) satisfies the mechanical freshness/quality-score bar, but its narrative content is about the retrospectives table's OWN quality-validation trigger and constraint/trigger interplay --` +
      ` e.g. what_needs_improvement includes "Documentation could better explain the relationship between constraints and trigger functions" and "Error messages from constraint violations should hint at trigger-based recalculation of quality scores"; key_learnings includes "Database constraints work in tandem with trigger functions to ensure data quality at insert time". None of this SD's actual deliverables (Adam election status-awareness, session-tick daemon live-rotation observer, the census scheduled-task registrar, the target SD's success_metrics honesty pass, the daemon-self-check descope) appear anywhere in what_went_well/what_needs_improvement/key_learnings/action_items/success_patterns/improvement_areas. related_files, related_commits, related_prs and affected_components are all empty arrays. Stored numeric columns bugs_found=0 and tests_added=0 are also factually incorrect against this SD's own sub-agent trail (SEC-01, the FR-4 cwd/dotenv defect, and findings N1-N5 are real bugs found+fixed; FR-2a shipped 12 new hermetic unit tests per the PRD). Likely cause: the retro generator hit its own quality-validation-trigger friction while producing THIS retrospective and the resulting content narrates that friction instead of the SD. Not fully disconnected from reality though -- the retro's structured column objectives_met=false is an honest signal (FR-2b is deliberately unexecuted), and on_schedule=true/within_scope=true/business_value_delivered=LOW all track the real state.`
  },
  {
    id: 'RETRO-sd-scorecard-what-went-well',
    severity: 'INFO',
    summary: "FR-1 avoided an easy-to-introduce regression: TESTING's PLAN-TO-EXEC review (evidence d8ad67a2) reshaped the fix from a query-level status filter to a classification-level one specifically because a query-level filter on fetchAllAdamsStrict would have starved decision.retire / resolveRetiredAdamSeats() and silently stranded mail for any rotated-out seat (19 live role=adam_retired rows are ALL status=released, proving the retire path depends on seeing them) -- the shipped fix (commit 1747dce7d3c) keeps fetchAllAdamsStrict's read unfiltered and makes only decideSingleAdamGuard's classification status-aware. FR-2 was disciplined about scope under time/safety pressure: rather than attempting a real /clear-based rotation test unsupervised (which destroys the issuing session's own context and cannot self-report, and risks fleet claim/coordination interference), it shipped FR-2a (the pre-armed observer tooling, scripts/live-verify-session-tick-rotation.mjs, commits c0d4e373145/cca9102637b) and explicitly deferred FR-2b with a documented operational-risk rationale rather than silently dropping it. FR-4 corrected its own delivery venue mid-EXEC after recognizing a GHA scheduled workflow would always see 0 rows (assert-daemon-census.mjs scopes its query to os.hostname(), which never matches a GHA runner's ephemeral hostname) -- landed as a LOCAL Windows scheduled task instead (commits 48d25154093, then 043bdc9180d after TESTING caught the registrar's schtasks cwd=%SystemRoot%\\System32 would break assert-daemon-census.mjs's cwd-relative dotenv load on every real interval). FR-5 is a genuine, well-reasoned descope rather than an omission: it cites session-tick.cjs's own documented history of 5 prior daemon-side self-check attempts all failing on the same false-life/false-death seam, and records that rationale so future vision-scoring classifies the gap as DESCOPED rather than re-flagging it as MISSING."
  },
  {
    id: 'RETRO-sd-scorecard-lessons-and-open-items',
    severity: 'INFO',
    summary: "Real defects were caught and fixed across three independent TESTING passes plus one SECURITY pass, not narrated from commit messages: PLAN-TO-EXEC TESTING (d8ad67a2) rejected the original FR-1 wording outright because claude_sessions.status is CHECK-constrained to exactly active/idle/stale/released (13,110 live rows, 0 others) and the PRD had named completed/terminated/inactive. EXEC-TO-PLAN TESTING (534ab65e) mutation-tested FR-1 as genuinely covered and caught that FR-4's registrar would silently fail every real interval (cwd/dotenv defect, fixed in 043bdc9180d) plus two DB-honesty gaps in the target SD's own success_criteria/success_metrics text. EXEC TESTING re-verification (49098e72) confirmed those fixes via live --dry-run + a purpose-built mutation probe (26/26 tests) and raised 5 new low/medium findings (N1-N5), all addressed in the most recent commit on this branch (427c71670a0). SECURITY (46d5f420) directly measured (not assumed) that claude_sessions.status is not attacker-writable via anon key before ruling out an election-storm path, and found SEC-01 (isStatusFreshEligible fail-open on NULL status), fixed in commit f0857da9f2a. REGRESSION (0838696a) found zero backward-compat impact across 264 targeted files/3291 tests plus a 41,113-test full-suite run. STILL OPEN as of this evidence row: PLAN-phase VALIDATION (8209dab2, CONDITIONAL_PASS 93, the most recent VALIDATION pass) found two real fidelity defects -- FR-3's success_metrics test-count claim is stale against the literal cited command's current output, and FR-5 AC-2's descope rationale is placed in strategic_directives_v2.metadata, which neither of FR-5's own named readers (a future eva_heal_score / corrective_sd_generator pass) can see. No later sub-agent row exists confirming either is resolved; the newest row (VISION_FIDELITY 89fea44b, PASS 100, no summary text) postdates both but does not speak to them directly."
  }
];

const warnings = [
  "retrospectives.id=" + RETRO_ID + "'s narrative content does not reflect this SD's actual work (see finding RETRO-content-gap-generic-vs-sd-specific) -- the RETROSPECTIVE_QUALITY_GATE will still pass on quality_score=90 alone, since that gate is a numeric/freshness check and does not evaluate topical relevance.",
  "VALIDATION evidence 8209dab2's two PLAN-phase fidelity findings (FR-3 stale test-count claim, FR-5 AC-2 placement) have no later sub-agent row confirming resolution -- carried forward as non-blocking conditions on this CONDITIONAL_PASS, not verified fixed."
];

const recommendations = [
  'CONDITIONAL GO for PLAN-TO-LEAD on the RETRO axis -- a published, fresh SD_COMPLETION retrospective exists (satisfies GATE_SUBAGENT_EVIDENCE and RETROSPECTIVE_QUALITY_GATE), and this evidence row supplies the SD-specific lessons/patterns the published retrospective is missing.',
  `Consider running the RETRO sub-agent's enhancement path (or a manual edit) to fold this row's SD-specific findings into retrospectives.id=${RETRO_ID}'s own what_went_well/key_learnings/what_needs_improvement fields so a future reader of the retrospective itself -- not just this evidence row -- sees the real lessons.`,
  'Confirm or explicitly accept VALIDATION evidence 8209dab2\'s two open findings (FR-3 stale test count, FR-5 AC-2 placement) before LEAD-FINAL-APPROVAL.',
  'Ensure FR-2b (the live /clear-based rotation observation this SD explicitly ships without) is tracked as a durable follow-up -- a linked feedback item or follow-up SD -- rather than allowed to go silent once this SD closes.'
];

const conditions = [
  {
    action: "Confirm or explicitly accept VALIDATION evidence 8209dab2's two open PLAN-phase fidelity findings before LEAD-FINAL-APPROVAL: (1) FR-3 AC-1's success_metrics test-count claim is stale versus the literal cited command's current output; (2) FR-5 AC-2's descope rationale is placed in strategic_directives_v2.metadata, a location neither of FR-5's own named readers can see.",
    priority: 'medium',
    blocking: false
  },
  {
    action: 'Track FR-2b (the actual live /clear-based rotation observation, the one deliverable this SD explicitly ships without) as a durable follow-up -- e.g. a linked feedback item or follow-up SD -- rather than letting it go silent once this SD closes.',
    priority: 'medium',
    blocking: false
  },
  {
    action: `Fold this row's SD-specific findings into retrospectives.id=${RETRO_ID}'s narrative fields, which currently describe the retrospectives system's own constraint/trigger mechanics rather than this SD's Adam-election/session-tick-daemon work.`,
    priority: 'low',
    blocking: false
  }
];

const justification = `CONDITIONAL_PASS: a PUBLISHED SD_COMPLETION retrospective (id=${RETRO_ID}, quality_score=${RETRO_QUALITY_SCORE}) exists and satisfies the mechanical freshness/quality-score bar for GATE_SUBAGENT_EVIDENCE and RETROSPECTIVE_QUALITY_GATE, but its narrative content is substantively about the retrospectives system's own constraint/trigger validation rather than this SD's FR-1..FR-5 delivery, and VALIDATION's two PLAN-phase fidelity findings (FR-3 stale count, FR-5 AC-2 placement) are not yet confirmed resolved. See attached conditions.`;

const summary = `RETRO CONDITIONAL_PASS for ${SD_KEY} PLAN-TO-LEAD handoff. A published, fresh SD_COMPLETION retrospective exists (id=${RETRO_ID}, quality_score=${RETRO_QUALITY_SCORE}, status=PUBLISHED) satisfying the mechanical bar both GATE_SUBAGENT_EVIDENCE and RETROSPECTIVE_QUALITY_GATE check -- but its narrative content (what_went_well/key_learnings/what_needs_improvement) is directly observed to describe the retrospectives table's own quality-validation trigger/constraint mechanics rather than this SD's actual work: zero mentions of Adam election, session-tick daemons, the census scheduled task, or live rotation; related_files/related_commits/related_prs/affected_components all empty; bugs_found=0 and tests_added=0 stored despite a real 9-row sub-agent trail (LEAD: VALIDATION dd9feb1d + Explore 5bd66827; PLAN-TO-EXEC: TESTING d8ad67a2; EXEC-TO-PLAN: TESTING 534ab65e; EXEC: TESTING 49098e72 + SECURITY 46d5f420; PLAN_VERIFICATION: REGRESSION 0838696a + VALIDATION 8209dab2 + VISION_FIDELITY 89fea44b) documenting real defects caught and fixed (a DB CHECK-constraint mismatch reshaping FR-1's fix shape pre-EXEC, a cwd/dotenv defect that would have silently failed FR-4's scheduled task every interval, a NULL fail-open in the new status-eligibility guard, 5 further low/medium findings) across FR-1 (Adam status-aware election, retire-chain preserved), FR-2a (live-rotation observer tooling, FR-2b deliberately deferred with documented risk rationale), FR-3 (target-SD metrics honesty), FR-4 (corrected GHA-to-local delivery venue), and FR-5 (a reasoned descope citing 5 prior failed attempts at the same daemon-side self-check design). This evidence row supplies that SD-specific synthesis directly. Two VALIDATION findings (FR-3 stale test count, FR-5 AC-2 placement) remain open with no later confirming row. CONDITIONAL GO -- see conditions, none blocking.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 85,
    findings,
    warnings,
    recommendations,
    conditions,
    justification,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      go_no_go: 'CONDITIONAL_GO',
      retro_contribution: {
        retrospective_id: RETRO_ID,
        retro_type: 'SD_COMPLETION',
        quality_score: RETRO_QUALITY_SCORE,
        status: 'PUBLISHED',
        content_topical_match_to_sd: false,
      },
      fr_summary: {
        'FR-1': 'Adam registration/election made status-aware (decideSingleAdamGuard); fetchAllAdamsStrict kept unfiltered to preserve the retire/mail-forwarding chain. Commit 1747dce7d3c.',
        'FR-2a': 'Live-rotation observer tooling shipped (scripts/live-verify-session-tick-rotation.mjs, 12 hermetic tests). Commits c0d4e373145, cca9102637b.',
        'FR-2b': 'Actual live /clear-based rotation execution deliberately DEFERRED (documented operational-risk rationale), not silently dropped.',
        'FR-3': 'Target SD (SD-LEO-INFRA-SESSION-TICK-DAEMONS-001) success_metrics populated with real cited evidence and an honest 4/5-closed completeness statement.',
        'FR-4': 'Delivery venue corrected mid-EXEC from a GHA workflow (always-0-rows defect) to a local Windows scheduled task. Commits 48d25154093, 043bdc9180d.',
        'FR-5': 'Formal LEAD-level descope of the daemon-side self-check gap, citing 5 prior failed attempts at the same design; documentation-only deliverable, not code.',
      },
      sub_agent_evidence_trail: [
        { phase: 'LEAD', code: 'VALIDATION', id: 'dd9feb1d-b41c-4d2c-9423-756791615771', verdict: 'CONDITIONAL_PASS', confidence: 92 },
        { phase: 'LEAD', code: 'Explore', id: '5bd66827-49ca-4cac-96ad-37832a2ea053', verdict: 'PASS', confidence: 90 },
        { phase: 'PLAN-TO-EXEC', code: 'TESTING', id: 'd8ad67a2-0179-4a2c-81b6-e93f55d27cb9', verdict: 'CONDITIONAL_PASS', confidence: 88 },
        { phase: 'EXEC-TO-PLAN', code: 'TESTING', id: '534ab65e-cd7e-4169-a4e2-b13f8fc57c27', verdict: 'CONDITIONAL_PASS', confidence: 88 },
        { phase: 'EXEC', code: 'TESTING', id: '49098e72-dd7e-4f74-8750-29ba3c437d5e', verdict: 'CONDITIONAL_PASS', confidence: 90 },
        { phase: 'EXEC', code: 'SECURITY', id: '46d5f420-f805-432c-b203-23ba076034e5', verdict: 'CONDITIONAL_PASS', confidence: 92 },
        { phase: 'PLAN_VERIFICATION', code: 'REGRESSION', id: '0838696a-ae66-4ae8-80dd-ace8bc32ccc6', verdict: 'PASS', confidence: 92 },
        { phase: 'PLAN', code: 'VALIDATION', id: '8209dab2-fc02-4351-9804-98847d49f6ce', verdict: 'CONDITIONAL_PASS', confidence: 93 },
        { phase: 'PLAN_VERIFICATION', code: 'VISION_FIDELITY', id: '89fea44b-1a43-4b58-9e6b-48c7006f974e', verdict: 'PASS', confidence: 100 },
      ],
      fixes_confirmed_by_commit_but_not_by_a_later_subagent_row: [
        { finding: 'SEC-01 (isStatusFreshEligible fail-open on NULL status)', source: '46d5f420', fix_commit: 'f0857da9f2a' },
        { finding: 'TESTING N1-N5 (parked-worker test unmask, --timeout-s validation, unquoted /TR, wrapper cleanup)', source: '49098e72', fix_commit: '427c71670a0' },
      ],
      open_findings_no_confirming_row: [
        { finding: 'FR-3 AC-1 success_metrics test-count claim stale vs literal cited command output', source: '8209dab2' },
        { finding: 'FR-5 AC-2 descope rationale placed where its own named readers cannot see it', source: '8209dab2' },
      ],
    },
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
