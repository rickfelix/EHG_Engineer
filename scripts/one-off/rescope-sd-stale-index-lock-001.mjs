#!/usr/bin/env node
// SD-LEO-INFRA-STALE-INDEX-LOCK-001 -- LEAD-phase re-scope. The SD's as-submitted premise
// ("WRONG-HALF coverage" of a shipped guard) does not hold against measured reality (Explore
// evidence a77e1057). Re-scoping the DB record to the actual, code-verified root cause before
// PLAN. Updates ALL structured fields together (title/description/scope/success_criteria/
// strategic_objectives/metadata) -- a prior SD this session (EXECUTOR-120S-1800S-001) rescoped
// only title/description/scope/smoke_test_steps and left success_criteria/strategic_objectives
// stale, caught only later by its own /heal pass. Not repeating that gap here.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';

const NEW_TITLE = 'append-fleet-commit-trailer.js\'s ref\'d setTimeout + forced process.exit(0) trips Windows libuv assertion, leaves stale worktree index.lock';

const NEW_DESCRIPTION = `append-fleet-commit-trailer.js's ref'd setTimeout + forced process.exit(0) trips Windows libuv assertion, leaves stale worktree index.lock

## Type
infrastructure

**Provenance**: Coordinator consolidated sourcing ask f455bc2c (2026-08-24, worker evidence: Golf-3 R8 reply 8342f9fc, backlog row 0cbf3677, 6x one session, cross-seat confirmed in coordinator shell). Sourced by Adam 0549d739. Re-scoped at LEAD 2026-08-24 after an Explore investigation (evidence a77e1057) found the submitted "wrong-half coverage" premise does NOT hold against measured reality.

## Original premise (REJECTED — measured, not assumed)
The SD as submitted claimed two prior completed SDs (SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001, SD-LEO-INFRA-JAMMED-GIT-INDEX-001) shipped a stale-lock-clearing guard that covers the shared main checkout but is blind to worktree gitdir paths ("WRONG-HALF coverage"). MEASURED AGAINST CURRENT MAIN:
- SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 fixed an UNRELATED site (lib/heartbeat-manager.mjs's ref'd 30s interval, via armUnrefInterval) and never touched lock-clearing.
- SD-LEO-INFRA-JAMMED-GIT-INDEX-001 shipped DETECTION-ONLY (scripts/cron/index-jam-detector.mjs, "STRICTLY OBSERVATIONAL") -- its own retro explicitly cut cleanup at LEAD because a live \`git add\` holds a 0-byte lock for its entire duration, so presence/zero-size alone cannot distinguish a genuine in-progress lock from a stale post-crash one.
- The only lock-DELETING code in the repo, lib/git/clear-stale-index-lock.mjs (path.join(repoRoot, '.git', 'index.lock')), predates BOTH cited SDs and IS genuinely worktree-blind -- but it is invoked ONLY from scripts/safe-root-resync.mjs, gated to the shared root only, as a periodic/manual resync tool. It is not wired into any git hook, for either topology.
- Accurate framing: no synchronous post-commit stale-lock recovery exists for EITHER topology. This is not "wrong-half coverage of an existing guard" -- it's "no coverage at commit time at all."

## Real, measured root cause
.husky/commit-msg runs \`node scripts/append-fleet-commit-trailer.js "$1" || true\` before exec-commit-gate.js. That script's own comment already documents "A known Node/libuv-on-Windows quirk can make a script exit non-zero on shutdown even after process.exit(0) if it opened a network client" -- someone already suspected this site but only guarded the hook chain against it aborting, never fixed the underlying crash.

scripts/append-fleet-commit-trailer.js:28-36 races a Supabase query against \`new Promise((resolve) => setTimeout(() => resolve({data:null,timedOut:true}), 2000))\` -- a REF'D, UNCLEARED setTimeout -- then calls process.exit(0) unconditionally at every exit path. If the query resolves before the 2000ms timeout fires, the losing setTimeout handle is STILL ARMED at the moment process.exit(0) runs. This is the exact defect class already fixed once in lib/heartbeat-manager.mjs (armUnrefInterval, SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001): "a ref'd timer keeps the event loop alive... when the process then exits (e.g. the direct process.exit(0)...) libuv force-closes the timer's async handle while it is already in the closing state, tripping Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)." Same class, different file, setTimeout instead of setInterval, never unref'd. Timing matches: this session's own commit transcripts show the assertion line appearing between "Pre-commit checks passed" and "PASSED: No blacklisted words" -- i.e. during commit-msg, between append-fleet-commit-trailer.js and exec-commit-gate.js.

## Scope (one SD)
- FR-1: Fix the root cause in scripts/append-fleet-commit-trailer.js -- unref (and/or clear on race resolution) the setTimeout at line 35, mirroring the proven armUnrefInterval pattern from lib/heartbeat-manager.mjs, so no ref'd handle remains armed when process.exit(0) runs.
- FR-2: Defense-in-depth: extend lib/git/clear-stale-index-lock.mjs to be worktree-aware (mirroring index-jam-detector.mjs's already-correct resolveGitDir() file-vs-directory .git detection), with the SAME safety predicate as before (age + zero-byte + no live git pid). This does not get wired into a synchronous commit-time hook (that ambiguity problem is exactly what the prior SD explicitly punted on) -- it extends the existing periodic/manual resync tool to also cover worktree gitdirs, since the native crash cannot be caught from JS even after FR-1 lands.
- FR-3: Regression: (a) a test asserting the fixed setTimeout's Timeout.hasRef() === false (mirroring tests/unit/heartbeat-manager-unref-interval.test.js's exact pattern -- no native crash reproduction needed); (b) a worktree-specimen fixture proving the extended clear-stale-index-lock.mjs correctly resolves and clears a stale 0-byte lock under .git/worktrees/<name>/; (c) a fixture proving a LIVE lock (non-zero, fresh, or a real git pid holding it) is never cleared, in both topologies.

## Out of scope
- Hook framework redesign; node/libuv upstream fix.
- Wiring any stale-lock clear synchronously into a commit-time git hook -- the live-jam-vs-stale-jam ambiguity SD-LEO-INFRA-JAMMED-GIT-INDEX-001 already identified and punted on applies equally here; FR-2 stays a periodic/manual tool.

## Success criteria
- scripts/append-fleet-commit-trailer.js's setTimeout no longer holds a ref'd handle when process.exit(0) runs (Timeout.hasRef() === false, test-verified).
- lib/git/clear-stale-index-lock.mjs correctly resolves and clears a stale 0-byte worktree-gitdir lock, with the prior SD's shared-checkout behavior unchanged.
- A live (non-stale) lock is never cleared in either topology, test-verified.
`;

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    rescope_note: {
      rescoped_at: new Date().toISOString(),
      rescoped_from: 'Stale index.lock via libuv hook-child crash RECURS in worktrees after both prior fixes shipped',
      reason: 'Original "wrong-half coverage" premise measurement-contradicted at LEAD -- neither cited prior SD shipped hook-wired lock cleanup for either topology. Real, code-verified root cause: scripts/append-fleet-commit-trailer.js:35 has a ref\'d, uncleared setTimeout racing a forced process.exit(0) -- the exact defect class already fixed once elsewhere (armUnrefInterval, SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001), never applied here. See Explore evidence a77e1057.',
      corroborating_feedback_rows: ['0cbf3677'],
      corroborating_signals: ['f7227a9d', '143b8d3c', '248a91d8'],
    },
    mechanism_verifications: [
      ...(current.metadata?.mechanism_verifications || []),
      {
        claim: 'scripts/append-fleet-commit-trailer.js:35 creates a ref\'d, uncleared setTimeout inside a Promise.race timeout guard, then calls process.exit(0) unconditionally',
        verified_by: 'Explore (premise verification)',
        verified_at: 'scripts/append-fleet-commit-trailer.js:28-48',
      },
      {
        claim: 'lib/git/clear-stale-index-lock.mjs is worktree-blind and is never invoked from any git hook (shared-checkout-only, periodic/manual tool)',
        verified_by: 'Explore (premise verification)',
        verified_at: 'lib/git/clear-stale-index-lock.mjs:34, scripts/safe-root-resync.mjs:329-336',
      },
    ],
  };

  const success_criteria = [
    { measure: '[VERIFIED]', criterion: 'scripts/append-fleet-commit-trailer.js\'s setTimeout no longer holds a ref\'d handle when process.exit(0) runs (Timeout.hasRef() === false, test-verified).' },
    { measure: '[VERIFIED]', criterion: 'lib/git/clear-stale-index-lock.mjs correctly resolves and clears a stale 0-byte worktree-gitdir lock, with the prior SD\'s shared-checkout behavior unchanged.' },
    { measure: '[VERIFIED]', criterion: 'A live (non-stale) lock is never cleared in either topology, test-verified.' },
  ];

  const strategic_objectives = [
    'Root-cause and fix the Windows libuv UV_HANDLE_CLOSING assertion crash triggered by append-fleet-commit-trailer.js\'s ref\'d setTimeout racing a forced process.exit(0)',
    'Extend worktree-awareness to the existing stale-lock-clearing helper as defense-in-depth, without wiring synchronous cleanup into a commit-time hook',
  ];

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      title: NEW_TITLE,
      description: NEW_DESCRIPTION,
      scope: NEW_TITLE,
      success_criteria,
      strategic_objectives,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD re-scoped successfully.');
  console.log('New title:', NEW_TITLE);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
