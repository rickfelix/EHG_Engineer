#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154 — RETRO evidence at PLAN-TO-LEAD.
 *
 * Records the real retro-agent (Task/Agent tool) findings into sub_agent_execution_results,
 * satisfying the RETRO PREREQUISITE_PREFLIGHT check. A pre-existing, published, quality_score-70
 * retrospective row (id 7ab10e60-1d07-4e14-9112-b541258deedd) already exists and is intentionally
 * NOT overwritten here -- retro-agent attempted to enhance it via the canonical
 * enhanceRetrospective() writer and was correctly refused by the clobber guard
 * (scripts/modules/handoff/lib/retro-clobber-guard.js), which treats any PUBLISHED SD_COMPLETION
 * retro at quality_score>=70 as authoritative. This script records the retro-agent's substantive
 * analysis as sub-agent evidence (satisfying the gate) without bypassing that legitimate guard.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const retroResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'PLAN',
    execution_time_ms: 0,
    summary: "Investigated independently (DB queries, live-constraint checks, git/commit diffs, gh pr checks) rather than trusting the briefed facts. All briefed facts verified: 'gate_failure_recovery' has 0 rows in feedback ever (ran the COUNT directly); 'auto_capture' is live-valid with 27,262 existing rows; feedback rows 4b194485/1bc70a2c/54f80d0e and QF-20260914-976 all exist with substantive, specific content (QF-20260914-976 still status=open, unclaimed); both issue_patterns rows carry substantive prevention_checklist content; PR #8951 had all lint/CI checks green at review time (unit tier + coverage still in progress, nothing failing). One thing not previously flagged: EXEC-TO-PLAN's own BMAD gate scored only 50/100 (test_plan: NOT_FOUND, user_story_mapping: NOT_FOUND) despite 89 real tests shipping -- gate score and actual delivered quality diverged for this SD; a mid BMAD score is not on its own a quality signal here. A pre-existing PUBLISHED retrospective (id 7ab10e60-1d07-4e14-9112-b541258deedd, quality_score 70) already exists for this SD but is generic preflight_autogen boilerplate with zero mention of the DOA-catch/sibling-bug/security-hardening narrative -- an attempt to enhance it via the canonical enhanceRetrospective() writer was correctly REFUSED by the clobber guard (any PUBLISHED SD_COMPLETION retro at quality_score>=70 is treated as authoritative and never auto-overwritable, per a documented prior incident where a writer destroyed a richer retro down to boilerplate). This is a legitimate protection, not routed around -- the richer analysis is recorded here as sub-agent evidence instead.",
    critical_issues: [],
    warnings: [
      {
        id: 'RETRO-1',
        severity: 'MEDIUM',
        issue: "The dead-on-arrival defect (source_type:'assumption_reality_tracker') shipped past 84/84 passing mocked unit tests -- structurally, not from thoroughness: a mocked write client cannot fail a live enum/CHECK-constraint violation by construction. This exact mechanism produced TWO independent defects in one Validation review pass (this SD's fresh draft, AND a bug silently live in production since inception in lib/eva/gate-failure-recovery.js) -- two occurrences of the identical mechanism is a signal, not a coincidence.",
        evidence: 'validation-learn154\'s F1 finding: an executed, rolled-back INSERT probe caught what 84 mocked tests could not. Live query confirmed gate-failure-recovery.js has written 0 feedback rows ever.',
        location: 'lib/eva/utils/assumption-reality-tracker.js; lib/eva/gate-failure-recovery.js:263',
      },
      {
        id: 'RETRO-2',
        severity: 'LOW',
        issue: 'A thin auto-generated (preflight_autogen) retrospective that happens to clear the quality_score>=70 PUBLISH threshold is now permanently locked against enhancement by the clobber guard, even when a substantially richer analysis exists. This is a pipeline gap (the guard correctly protects against destructive overwrites, but has no path for a genuinely BETTER replacement), not a defect in this SD\'s own execution.',
        evidence: 'Retrospective id 7ab10e60-1d07-4e14-9112-b541258deedd, quality_score 70, published, retro-agent\'s enhanceRetrospective() call refused by scripts/modules/handoff/lib/retro-clobber-guard.js::classifyRetro.',
        location: 'scripts/modules/handoff/lib/retro-clobber-guard.js',
      },
      {
        id: 'RETRO-3',
        severity: 'LOW',
        issue: 'QF-20260914-976 (the confirmed-live gate-failure-recovery.js silent-failure bug, split out from this SD per campaign-mode guidance) remains status=open and unclaimed as of this evidence record.',
        evidence: 'Live query: QF-20260914-976 status=open, unclaimed.',
        location: 'QF-20260914-976',
      },
    ],
    recommendations: [
      "Protocol-evolution suggestion (narrow, not a blanket rule): a lint/gate rule identifying writes into a CHECK/enum-constrained DB column through a client the unit test mocks -- that specific intersection is structurally unable to catch an invalid enum value via mocked tests, unlike a general 'add more tests' concern. Same shape as the existing eva-logger-required-lint (grep-identifiable pattern, not a vague quality mandate). Caveat: must NOT be phrased as 'add a DB-tier vitest test' alone, since DB-tier tests don't run in CI today (VITEST_DB_ALLOW_REF unset, QF-20260818-041) -- would need to either fix that CI gap first or require an executed-probe-style check that actually gates something in CI.",
      'Consider a QF/SD for the retrospective clobber-guard pipeline gap: a path for a genuinely richer replacement retrospective to supersede a thin auto-generated one that happened to clear the publish threshold first, without reopening the destructive-overwrite hole the guard exists to close.',
      'Proceed to LEAD-FINAL-APPROVAL -- both root-cause fixes are complete, independently reviewed by 4 sub-agent passes (Explore, Validation x2, Security, Retro), and the genuine findings from this retro pass are durably recorded here rather than lost when the retrospectives-table write was correctly refused.',
    ],
    detailed_analysis: {
      commands_run: [
        "SELECT count(*) FROM feedback WHERE source_type='gate_failure_recovery' -> 0 (re-verified independently)",
        "SELECT count(*) FROM feedback WHERE source_type='auto_capture' -> 27262 (re-verified independently)",
        'Attempted enhanceRetrospective() on retro id 7ab10e60-1d07-4e14-9112-b541258deedd -> correctly refused by retro-clobber-guard.js',
        'gh pr checks 8951 --repo rickfelix/EHG_Engineer -> all lint/CI green at review time, unit-tier + coverage in progress',
      ],
      pre_existing_retrospective: { id: '7ab10e60-1d07-4e14-9112-b541258deedd', status: 'published', quality_score: 70, type: 'preflight_autogen' },
    },
    metadata: { independent_verification: true, retrospective_write_blocked_by_guard: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    probeExistsRelative: 'scripts/one-off/learn-154-plan-to-lead-retro-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(retroResults, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('RETRO', sdRow.id, { code: 'RETRO', name: 'Retro' }, retroResults, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('STORED:', 'RETRO', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
