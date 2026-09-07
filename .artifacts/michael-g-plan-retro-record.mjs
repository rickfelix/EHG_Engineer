#!/usr/bin/env node
// Records the PLAN-TO-LEAD RETRO evidence for child -G, transcribing retro-agent:aa1bae14bf277e8d9's
// independent verification against the merged PR / live origin/main state.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'RETRO', supabase: db });
  const results = {
    verdict: 'PASS',
    confidence: 96,
    summary: "Independent verification (retro-agent:aa1bae14bf277e8d9) against the merged PR #8464 and live origin/main, not the worktree summary. Confirmed on main: 11 michael-owned gauges in gauge-registry.js; PAYLOAD_KINDS.MICHAEL_HANDOFF + DRAIN_SETS.michael inclusion + declaredAddresseeRole('michael_handoff')->'michael' all live; scripts/michael-inbox.cjs exports drainMichaelOutbound with the .limit(500) lint-fix bound applied; scripts/michael/encode-adam-carveout.mjs is dry-run-by-default, requires --apply, refuses NO_RATIFICATION without an existing chairman_ratifications row, and never creates that row itself. The chairman-gated role_drain_sets migration is present and correctly unapplied by design. 107/107 tests passed against files confirmed byte-identical to origin/main. All PRD acceptance criteria cross-checked 1:1. No gaps found between promised and delivered scope.",
    findings: [
      "PR #8464 confirmed MERGED (mergedAt 2026-09-07T06:58:14Z, merge commit d4266b85d19) via gh pr view, not just armed",
      "11/11 spec gauges confirmed live on origin/main via direct grep of the committed file, not the worktree",
      "michael_handoff kind confirmed fully wired on main across PAYLOAD_KINDS, DRAIN_SETS.michael, and declaredAddresseeRole",
      "the count-truncation-diff-lint follow-up fix (.limit(500)) confirmed present on main as part of the same PR's commit history",
      "encode-adam-carveout.mjs's chairman-ratification-required precondition behaves exactly as promised: inert, dry-run-default, never self-ratifies",
      "107/107 tests passing against content confirmed byte-identical to origin/main (worktree HEAD is behind main by unrelated intervening merges, noted as non-defect drift, not a regression of this SD's own lines)"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-g-plan-retro-record.mjs), family pattern established at children E/F',
      producer_note: 'Transcribes the independent findings of Task-tool retro-agent aa1bae14bf277e8d9, which re-verified against the merged PR and live origin/main rather than trusting the build summary.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('RETRO', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('RETRO evidence stored:', stored.id);
}

main();
