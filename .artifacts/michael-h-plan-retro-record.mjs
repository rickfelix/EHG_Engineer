#!/usr/bin/env node
// Records the PLAN-TO-LEAD RETRO evidence for child -H, transcribing retro-agent:a955467c40561ecbe's
// independent verification against the merged PR / live ehg origin/main state.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'RETRO', supabase: db });
  const results = {
    verdict: 'PASS',
    confidence: 96,
    summary: "Independent verification (retro-agent:a955467c40561ecbe) against the merged PR #805 (rickfelix/ehg) and live origin/main pinned at merge commit 0c0ae431, not the worktree or the build summary. Confirmed: PR state=MERGED at 2026-09-07T11:08:30Z; all 8 expected files exist on origin/main; both routes (/admin/michael, /admin/michael/:date) and the nav entry are registered; michaelApi.ts imports and calls authedFetch exclusively (never adminApi's cookie-only apiFetch) -- the single highest-risk item from LEAD/PLAN; EhgPointerCard.tsx renders the pointer verbatim with no derivation; built a FRESH isolated worktree at the exact merged commit and independently re-ran the test suite, getting 12/12 passing (not just trusting the reported figure); all 5 PRD FRs cross-checked 1:1 against origin/main; confirmed zero EHG_Engineer-side files touched (git diff-tree on the merge commit lists only the 10 expected frontend/test files). No material gap found.",
    findings: [
      "PR #805 confirmed MERGED (not just armed) via gh pr view against the ehg repo directly",
      "All 8 new files confirmed present on ehg's origin/main via git cat-file -e",
      "Both routes and the nav entry confirmed registered in the live committed adminRoutes.tsx/AdminLayout.tsx",
      "michaelApi.ts confirmed to use authedFetch exclusively, zero references to adminApi's cookie-only apiFetch anywhere in the new files",
      "EhgPointerCard.tsx confirmed to render frontPage.ehg.pointer with zero derivation logic",
      "Independently re-ran the test suite in a fresh worktree pinned to the exact merge commit: 12/12 passing, matching the build-time report exactly",
      "Confirmed zero dangerouslySetInnerHTML/iframe/format=html usage (only documentation comments referencing the avoided pattern)",
      "Confirmed zero EHG_Engineer-side files (server/routes/michael.js, server/index.js) were touched by this child's diff-tree",
      "Minor non-material note: the local ehg checkout's default branch was several commits behind with unrelated dirty state -- verification correctly used origin/main refs and an isolated pinned-commit worktree instead, flagged for future-session awareness"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-h-plan-retro-record.mjs), family pattern established at children E/F/G',
      producer_note: 'Transcribes the independent findings of Task-tool retro-agent a955467c40561ecbe, which re-verified against the merged cross-repo PR and a freshly pinned worktree rather than trusting the build summary.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('RETRO', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('RETRO evidence stored:', stored.id);
}

main();
