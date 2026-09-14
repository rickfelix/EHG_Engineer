#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-014 — Explore + Validation evidence at LEAD-TO-PLAN.
 *
 * Records the findings from the real Explore and Validation sub-agent runs (Task/Agent tool)
 * into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE -- neither agent has
 * direct DB write access itself.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-014';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently verified the staleness conclusion for PAT-LES-2484eb3fe7bf rather than trusting the summary. (1) PAT-AUTO-9cfec62d (the one issue_patterns row still status=active from the same Feb 2026 incident window) confirmed NOT a live open variant -- single occurrence from a DIFFERENT, already-completed SD (SD-MAN-INFRA-TELEGRAM-ADAPTER-VISION-001), dedup_fingerprint never recurred across ~7 months and thousands of subsequent SDs through the same gate; status=active/resolution_date=null reflects nobody ran a bookkeeping close-out, not a live defect (closed during this SD as a result). (2) Git log dates verified real: spot-checked commit 6448b82f (2026-02-19, 'ensure action items always include verification field'), its diff adds exactly the actionItemsWithDefaults block byte-identical to what is live today at scripts/modules/handoff/executors/exec-to-plan/retrospective.js:338-343. All 4 cited commits real and in git log --follow. (3) NEW FINDING beyond the original ask: retro-filters.js's getFilteredRetrospective() filters on retro_type='SD_COMPLETION', and the rich EXEC-TO-PLAN retro is deliberately written with retro_type='HANDOFF' (SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001) -- so EXEC-phase content is genuinely never reused/promoted into the completion retro. BUT PLAN-TO-LEAD does not silently discard-and-block: its own preflight auto-generates a fresh, genuinely SD-specific completion retro inline (generateRetrospective() in generators.js pulls real PRD FR text, sub-agent pass/fail sequences, handoff timeline, test pass rates) via a SEPARATE, independently-shipped mechanism (SD-LEO-INFRA-PLAN-LEAD-RETRO-001). Two independent fixes close two readings of the pattern's root cause; neither reuses the other's content, but both independently satisfy 'SD-specific, not boilerplate.' (4) Tests: 8/8 pass (5 existing from sibling SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-153 + 3 new specificity assertions this SD added) against unmodified production code. (5) Bonus finding: traced a current burst of ~970 PAT-LES-* 'gate failed' patterns (created 2026-09-12 through today) to .github/workflows/retro-pattern-extraction-cron.yml (QF-20260911-299) catching up on a 7-month-old backlog of unstamped historical retrospectives -- spot-checked 3 recent rows, all trace to the same narrow already-fixed Feb 2026 window. Routed to harness_backlog as a systemic false-positive source.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Mark PAT-AUTO-9cfec62d resolved as part of this SD\'s closure (done).',
      '"Verify-stale + add regression test coverage" is sufficient and correct closure for this SD -- no behavior fix needed anywhere in the live retrospective path.',
    ],
    detailed_analysis: {
      commands_run: [
        "git log --follow scripts/modules/handoff/executors/exec-to-plan/retrospective.js -> confirmed 6448b82f/12c19da2/31156113 real, correctly dated",
        "npx vitest run tests/unit/handoff/executors/exec-to-plan/retrospective.test.js -> 8/8 passed",
        "SELECT on issue_patterns for PAT-AUTO-9cfec62d, PAT-LES-* burst rows -> traced to retro-pattern-extraction-cron.yml backlog catchup",
      ],
    },
    metadata: { independent_verification: true },
  };

  const validationResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently re-derived every load-bearing claim rather than trusting the summary (2 review passes: initial CONDITIONAL_PASS with one critical issue C1 later self-retracted after further investigation, one critical issue C2 that stood and was addressed). PASS-1 (CONDITIONAL_PASS): confirmed staleness at TIMESTAMP resolution -- SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001's 3 retrospective rows were CREATED 2026-02-19T02:00/02:05/02:23 but UPDATED 2026-09-12T23:52:02/09/14, and PAT-LES-2484eb3fe7bf itself was created 2026-09-12T23:52:12.75 -- interleaved inside that same 3-second update window, direct evidence of the backlog cron minting a September pattern from February retrospective text, not an inference from first_seen_sd_id alone. Confirmed all 3 commits (6448b82f, 12c19da2, 31156113) are merge-base --is-ancestor of HEAD (not stranded). Confirmed the fixes are still live BY READING the current file, not grepping. Confirmed PLAN-TO-LEAD's inline auto-generation (runPreflightRetroCheck -> executeSubAgent('RETRO',...) -> re-query in the SAME execute() call, no retry) structurally closes the 'discovered as a blocker' half. MUTATION-TESTED all 3 new regression tests against production code (removing the verification default, swapping the SD-specificity string, disabling the git-derived-learning branch) -- one-to-one mutation-to-test mapping confirmed, no cross-contamination, tests are real regression guards not dead-by-construction. Found a near-identical, just-completed precedent (SD-LEARN-FIX-ADDRESS-PAT-LES-013, completed 2026-09-14T03:32, same defect class, same closure shape) that strongly validated the approach but revealed two gaps. C1 (source pattern still status=assigned): SELF-RETRACTED after independently reading database/migrations/20260704_pattern_closure_prevention_gate.sql -- resolve_completed_sd_patterns() is a Postgres TRIGGER that auto-resolves any assigned_sd_id pattern when the SD reaches status=completed (confirmed via PAT-LES-f04ca2cf73c6's own resolution_notes: 'Auto-resolved: assigned SD ... reached completed (closure-loop)', written only by that SQL function per a git grep with zero JS matches, and its resolution_date landing ~4min BEFORE the SD's own updated_at, proving the trigger fires on completion, not a manual pre-step). No action needed; the pattern resolves itself when this SD completes. C2 (SD description still /learn's boilerplate, asserting the pattern as a live critical defect, contradicting the closure finding) STOOD and was addressed: rewrote strategic_directives_v2.description with a '## Verified Finding' section mirroring PAT-LES-013's exact precedent format, citing commit SHAs, the Feb 2026 trace, and the cron-minting explanation. W1 (the harness_backlog remedy as originally phrased was under-diagnosed and would regress a deliberate fix -- lib/quality/filter.mjs's SINGLE_SD_SEVERITY_BYPASS lets critical/high patterns bypass checkSingleSDClosedSource BY DESIGN per SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001/FR-6, and checkSingleSDStaleOpenSource's existing age threshold returns null for closed sources -- an age floor already exists and is structurally unreachable for exactly this pattern's class) was corrected via a new feedback row (append-only table) rather than editing the original.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: 'GATE 1 nominally wants >=1 backlog item; sd_backlog_map=0 for this SD. Not blocking -- sibling precedent SDs (LEARN-013, LEARN-151) in this same batch shipped the identical shape (a verification-only SD with no code-behavior deliverable), so this is the expected shape for a verified-stale closure, not a gap.',
        evidence: 'sd_backlog_map query returned 0 rows for this SD; same true for precedent SD-LEARN-FIX-ADDRESS-PAT-LES-013.',
        location: 'sd_backlog_map',
      },
    ],
    recommendations: [
      'Proceed to PLAN -- C1 retracted (auto-resolves via DB trigger on SD completion, no action needed), C2 addressed (description rewritten with the Verified Finding section), W1 corrected (new feedback row ed01aa4e amends the original 5a29f109 with the precise root cause: extend the existing closed-source age-threshold gap in lib/quality/filter.mjs, not add a new floor from scratch).',
    ],
    detailed_analysis: {
      commands_run: [
        'Read database/migrations/20260704_pattern_closure_prevention_gate.sql directly -> confirmed resolve_completed_sd_patterns() trigger mechanism',
        'Mutation-tested all 3 new tests against production code, verified 1:1 kill mapping, restored production (git diff HEAD -- scripts/ lib/ empty)',
        'Compared against precedent SD-LEARN-FIX-ADDRESS-PAT-LES-013 (completed hours earlier, same defect class)',
      ],
      precedent_sd: 'SD-LEARN-FIX-ADDRESS-PAT-LES-013',
    },
    metadata: { independent_verification: true, review_passes: 2 },
  };

  for (const [code, name, results] of [['EXPLORE', 'Explore', exploreResults], ['VALIDATION', 'Validation', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/les014-lead-to-plan-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name }, results, { sdKey: SD_KEY, phase: 'LEAD' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
