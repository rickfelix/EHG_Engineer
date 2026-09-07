#!/usr/bin/env node
// Records the PLAN-TO-LEAD RETRO evidence for child -I, transcribing retro-agent:a51d0b6bfc3d02f4c's
// independent verification against the merged PR / live origin/main state.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'RETRO', supabase: db });
  const results = {
    verdict: 'PASS',
    confidence: 95,
    summary: "Independent verification (retro-agent:a51d0b6bfc3d02f4c) against the merged PR #8505 (rickfelix/EHG_Engineer, mergeCommit abdac488797be40d694a2d819be19c6d135cbb52) via a fresh, isolated pinned worktree, not the shared/local checkout or the build-time report. Confirmed: PR state=MERGED; all 9 claimed files present on origin/main; the retirement-window streak logic genuinely breaks (not skips) on any gap, directly read against its cited witness-adoption.mjs model to confirm the semantics are truly inverted; no-literal-home-path-lint passes clean (0 ungoverned violations) run from the isolated pinned worktree; the full 97-test suite independently re-run from a contamination-free worktree, 97/97 passing (a first pass in the SHARED worktree showed 2 failures caused by unrelated parallel-session untracked contamination, correctly root-caused rather than accepted at face value); setup-michael-host-tasks.mjs's own 10-test suite unaffected by the shared builder change; zero Google Drive write calls anywhere in the new code (grep-verified); michael_feedback_ledger confirmed read-only (readRows only, no mutation path) in the new step-4 code. No material gap found.",
    findings: [
      "PR #8505 confirmed MERGED via gh pr view, mergeCommit abdac488797be40d694a2d819be19c6d135cbb52, all 9 claimed files present via git ls-tree at that exact commit",
      "retirement-window.mjs's break-on-gap semantics independently confirmed against a direct read of both this file and its cited witness-adoption.mjs model -- genuinely opposite, not a cosmetic claim",
      "no-literal-home-path-lint run from a freshly built isolated worktree pinned to the merge commit: 0 ungoverned violations, 13 grandfathered entries confirmed unrelated to any michael/cowork file",
      "Full test suite re-run from a contamination-free isolated worktree: 97/97 passing across all 5 new/changed test files, plus 10/10 on setup-michael-host-tasks.mjs's own suite",
      "A first re-run attempt in the SHARED worktree showed 2 spurious failures from unrelated parallel-session untracked files -- correctly root-caused as environmental contamination (confirmed via git status/git ls-tree) rather than accepted as a real defect",
      "Zero Google Drive write calls (drive.files.create/update/delete/copy) anywhere in scripts/michael or lib/michael via git grep; google-clients.mjs confirmed untouched by this PR's diff",
      "michael_feedback_ledger's only reference in a DB-call context is readRows (strict select+limit, no mutation path) inside runStep4",
      "setup-alarm-cron-tasks.mjs's diff is a pure 4-line buildDisableArgs addition; setup-michael-host-tasks.mjs imports only pre-existing, untouched exports"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-i-plan-retro-record.mjs), family pattern established at children E/F/G/H',
      producer_note: 'Transcribes the independent findings of Task-tool retro-agent a51d0b6bfc3d02f4c, which built a fresh isolated worktree pinned to the exact merge commit and independently re-ran the full test suite and the lint script rather than trusting the build-time report.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('RETRO', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('RETRO evidence stored:', stored.id);
}

main();
