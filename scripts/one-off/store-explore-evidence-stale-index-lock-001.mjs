#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-INFRA-STALE-INDEX-LOCK-001. The SD's
// as-submitted "WRONG-HALF coverage" premise (a shipped guard covers the shared
// checkout but misses worktrees) is PARTIALLY WRONG -- see detailed_analysis below.
// Written before re-scoping the SD's DB record.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';
const SD_KEY = 'SD-LEO-INFRA-STALE-INDEX-LOCK-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (premise verification)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    critical_issues: [],
    warnings: [
      'SD premise ("shipped guard has WRONG-HALF coverage, shared-checkout-only") is overstated -- ' +
        'no hook-wired synchronous cleanup exists for EITHER topology',
    ],
    recommendations: [
      'Re-scope FR-2 to a code-verified root cause: scripts/append-fleet-commit-trailer.js:35 creates a ' +
        'ref\'d, uncleared setTimeout inside a Promise.race timeout guard, then forces process.exit(0) -- ' +
        'the exact defect class already fixed once in lib/heartbeat-manager.mjs (armUnrefInterval, ' +
        'SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001), just in a different file with a setTimeout instead of a ' +
        'setInterval',
    ],
    detailed_analysis:
      'MEASURED, not assumed. (a) The SD\'s premise: two prior completed SDs -- SD-LEO-FEAT-WINDOWS-LIBUV-' +
      'ASSERTION-001 and SD-LEO-INFRA-JAMMED-GIT-INDEX-001 -- left "WRONG-HALF coverage": a shipped guard ' +
      'that clears shared-checkout locks but is blind to worktree gitdir paths. MEASURED FALSE in this exact ' +
      'framing: SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 fixed an UNRELATED site (lib/heartbeat-manager.mjs\'s ' +
      'ref\'d 30s interval, via armUnrefInterval) and never touched lock-clearing at all. SD-LEO-INFRA-JAMMED-' +
      'GIT-INDEX-001 shipped DETECTION-ONLY (scripts/cron/index-jam-detector.mjs, header comment line 5: ' +
      '"STRICTLY OBSERVATIONAL") -- its own retro explicitly cut cleanup at LEAD because a live `git add` ' +
      'holds a 0-byte lock for its entire duration, so presence/zero-size alone cannot distinguish a genuine ' +
      'in-progress lock from a stale post-crash one. The only lock-DELETING code in the repo, ' +
      'lib/git/clear-stale-index-lock.mjs:34 (`path.join(repoRoot, \'.git\', \'index.lock\')`), predates BOTH ' +
      'cited SDs (from an even earlier SD, SD-REFILL-00KUKQVS) and is genuinely worktree-blind (in a worktree ' +
      '.git is a pointer FILE, not a directory, so this path always ENOENTs there) -- but it is invoked ONLY ' +
      'from scripts/safe-root-resync.mjs, itself gated to run in the shared root only, as a periodic/manual ' +
      'resync tool. It is not wired into any git hook. So the accurate framing is not "wrong-half coverage of ' +
      'an existing guard" but "no synchronous post-commit stale-lock recovery exists for EITHER topology; a ' +
      'pre-existing helper for a DIFFERENT purpose (periodic resync) happens to also be worktree-blind, but ' +
      'fixing its path resolution alone would not address this specimen since it is never invoked at commit ' +
      'time." (b) Root cause, code-verified (not previously identified by either prior SD): .husky/commit-msg ' +
      'runs `node scripts/append-fleet-commit-trailer.js "$1" || true` BEFORE `exec-commit-gate.js` (whose own ' +
      'comment already documents "A known Node/libuv-on-Windows quirk can make a script exit non-zero on ' +
      'shutdown even after process.exit(0) if it opened a network client" -- someone already suspected this ' +
      'site but never fixed it, only guarded the hook chain against it aborting). ' +
      'scripts/append-fleet-commit-trailer.js:28-36 races a Supabase query against ' +
      '`new Promise((resolve) => setTimeout(() => resolve({data:null,timedOut:true}), 2000))` -- a REF\'D, ' +
      'UNCLEARED setTimeout, then calls process.exit(0) unconditionally at every exit path (lines 22, 39, 43, ' +
      '48). If the Supabase query resolves before the 2000ms timeout fires, the losing setTimeout handle is ' +
      'STILL ARMED (never cleared, never unref\'d) at the moment process.exit(0) runs -- exactly the mechanism ' +
      'lib/heartbeat-manager.mjs:42-50 already documents and fixed for a ref\'d setInterval: "a ref\'d timer ' +
      'keeps the event loop alive... when the process then exits (e.g. the direct process.exit(0)...) libuv ' +
      'force-closes the timer\'s async handle while it is already in the closing state, tripping Assertion ' +
      'failed: !(handle->flags & UV_HANDLE_CLOSING)". Same defect class, different file, setTimeout instead of ' +
      'setInterval, and this one is NOT unref\'d at all (the sibling fix\'s armUnrefInterval() pattern was ' +
      'never applied here). This matches the specimen timing exactly: my own commit transcripts this session ' +
      'show the assertion line interleaved BETWEEN "Pre-commit checks passed" and "PASSED: No blacklisted ' +
      'words in commit message(s)" -- i.e. during commit-msg, between append-fleet-commit-trailer.js and ' +
      'exec-commit-gate.js, not in post-commit. (c) Specimens: feedback backlog row 0cbf3677 (7 occurrences ' +
      'across >=2 worktrees + coordinator shell, escalating), corroborating signals f7227a9d/143b8d3c/248a91d8 ' +
      '(all mine, this session). Could not locate provenance-cited evidence ID 8342f9fc under this topic in ' +
      'feedback or session_coordination -- likely a mis-citation, not blocking. ' +
      'CONCLUSION: the recurrence is real and worth fixing, but not for the SD\'s stated "wrong-half coverage" ' +
      'reason. The real, higher-leverage fix is the exact armUnrefInterval-family pattern already proven for ' +
      'this defect class, applied to append-fleet-commit-trailer.js\'s setTimeout -- root-causing the crash ' +
      'rather than only building a worktree-aware cleanup for its aftermath. A worktree-aware, safety-gated ' +
      'stale-lock clear (extending clear-stale-index-lock.mjs, mirroring index-jam-detector.mjs\'s already-' +
      'correct resolveGitDir() file-vs-directory .git detection) remains worthwhile as defense-in-depth, since ' +
      'the crash is a native libuv assertion that cannot be caught from JS even after the root-cause fix.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'SD as submitted framed this as a coverage gap in an existing guard; measured reality shows no hook-' +
      'wired guard exists for either topology, and the actual crash site (append-fleet-commit-trailer.js\'s ' +
      'ref\'d, uncleared setTimeout racing a forced process.exit(0)) was never previously identified by either ' +
      'cited prior SD -- the SD record needs re-scoping to the actually-measured root cause before PLAN work ' +
      'proceeds, matching this session\'s established pattern of re-scoping to match reality rather than ' +
      'building to a stated-but-unverified premise.',
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
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
