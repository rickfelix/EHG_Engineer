#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-INFRA-SESSION-TICK-CLEAR-001. The SD arrives with a
// fully folded-in RCA (Solomon advisory a58e7151) that instructs EXEC to build against it, not
// re-diagnose. This evidence documents direct code verification of that RCA's three core claims
// before LEAD approval, plus the concrete fix-shape decision made from it.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '7eee0052-1da3-4bfb-9509-a090c52b0d25';
const SD_KEY = 'SD-LEO-INFRA-SESSION-TICK-CLEAR-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (premise verification)',
    verdict: 'PASS',
    confidence: 92,
    critical_issues: [],
    warnings: [
      'The RCA\'s Fix Shape B references an existing terminal_identity column on claude_sessions and an RPC-driven auto-release mechanism in lib/session-manager.mjs (dbResult.terminal_identity) -- investigated and found to be a DIFFERENT, seemingly-adjacent mechanism (not populated by session-register.cjs, not obviously related to the tick-daemon /clear-rotation problem this SD targets). Decided NOT to repurpose it without a deeper audit of its own semantics/RPC. Instead, the fix stamps a new metadata.cc_parent_pid field (JSONB, no schema migration) -- functionally equivalent to Shape B\'s intent (a DB-column join independent of marker files) without coupling to an unrelated, not-fully-understood mechanism.',
    ],
    recommendations: [
      'PLAN should keep the existing marker-file-based closure path as a redundant first pass (cheap, already-tested) and add the metadata.cc_parent_pid DB join as the fix for the case markers cannot cover -- not a full rewrite.',
      'PLAN must design the acceptance-gate test the RCA explicitly requires: seed two daemon markers for the same cc_parent_pid, delete one marker, run closure, assert the corresponding row is STILL released via the new DB-join path.',
    ],
    detailed_analysis:
      'Directly verified all three code claims in the folded-in RCA (Solomon advisory a58e7151) against the current tree, not assumed from the SD description: ' +
      '(1) lib/sessions/rotation-closure.cjs\'s readTickMarkers() (line 75) builds its candidate session_id set ENTIRELY from currently-existing `.claude/pids/tick-*.json` files -- a session_id whose marker was already deleted by a sibling daemon is not merely mis-joined, it is never even a candidate (scripts/hooks/session-register.cjs:344-345, `candidateIds = [...markers.keys()]`). ' +
      '(2) session-tick.cjs\'s deleteMarker() (line 109-111) unconditionally fs.unlinkSync()s the SHARED marker path with no tick_pid===process.pid ownership check, and cleanupAndExit() (line 519-529, wired to SIGINT/SIGTERM/uncaughtException) calls it unconditionally on every exit -- confirming ANY sibling daemon exiting deletes the marker key that OTHER siblings for the same session (across compaction-resume-spawned daemons) still depend on for future closure eligibility. ' +
      '(3) scripts/hooks/session-register.cjs:369-376 confirms cc_parent_pid is NOT a claude_sessions column (only `session_id,status` are selected from the DB; cc_parent_pid is attached post-query via `markers.get(r.session_id)`) -- so the marker file is CURRENTLY THE ONLY join key available, with zero DB-native fallback when it is missing. This exactly matches the RCA\'s claimed mechanism: the marker is a "destructible join key" shared across all siblings of one session\'s lifetime, unlinked by the first to exit. ' +
      'DECISION: implement RCA Fix Shape B (durable, marker-independent closure) via an ADDITIVE metadata.cc_parent_pid stamp (JSONB, no migration) written by session-register.cjs at every SessionStart, with closeRotatedOutSessions extended to also query claude_sessions directly by that field -- rather than Shape A alone (explicitly insufficient per the RCA: "residual: owner-exits-first still deletes while older sibling lives") or coupling to the pre-existing, differently-scoped terminal_identity/session-manager.mjs mechanism (flagged as a warning above, not adopted).',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'This SD carries an unusually thorough, pre-validated RCA (2 named advisories, a two-leg premise check already run by Adam\'s pre-mint gate, and an explicit "do not re-diagnose" instruction). LEAD verification here re-confirms the 3 core mechanism claims against the live tree (not the RCA prose) before approving, and resolves the one open design choice the RCA left to EXEC (which of 3 fix shapes to build) with a concrete, minimal-blast-radius decision.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (premise verification)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
