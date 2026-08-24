#!/usr/bin/env node
// SD-LEO-INFRA-STALE-INDEX-LOCK-001 -- sync ALL structured SD fields to the round-2 PRD design
// (prospective TESTING review dropped FR-2/FR-3/FR-5 worktree-lock-clearing entirely, replaced
// the timer-only fix with a full network-dependency removal). Keeping description/success_criteria/
// strategic_objectives/smoke_test_steps in sync with the PRD -- a prior SD this session left a
// subset of these fields stale after a rescope, caught only by its own later /heal pass.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';

const NEW_DESCRIPTION = `append-fleet-commit-trailer.js's Supabase client + ref'd setTimeout trips Windows libuv assertion, leaves stale worktree index.lock

## Type
infrastructure

**Provenance**: Coordinator consolidated sourcing ask f455bc2c (2026-08-24, worker evidence: Golf-3 R8 reply 8342f9fc, backlog row 0cbf3677, 6x one session, cross-seat confirmed in coordinator shell). Sourced by Adam 0549d739. Re-scoped at LEAD 2026-08-24 (Explore evidence a77e1057) after the submitted "wrong-half coverage" premise was measurement-contradicted. Re-scoped AGAIN at PLAN 2026-08-24 after a prospective TESTING review (3 rounds, live-measured with real probes, not code-reading alone) found the LEAD-scoped fix (unref/clear the setTimeout) was necessary but insufficient, and the "extend clear-stale-index-lock.mjs to worktrees" half was dead by construction (its sole invoker hard-aborts in a worktree) and would have widened an already-known-unsafe safety predicate (no pid check, no age floor on zero-byte -- explicitly SD-LEO-INFRA-JAMMED-GIT-INDEX-001's territory to fix).

## Round 1 finding (LEAD): premise rejected
Neither cited prior SD (SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001, SD-LEO-INFRA-JAMMED-GIT-INDEX-001) shipped hook-wired lock cleanup for either topology -- there was never "wrong-half coverage" of an existing guard, because no synchronous post-commit recovery exists for either topology. Real root cause: .husky/commit-msg runs append-fleet-commit-trailer.js, which races a Supabase query against a ref'd, uncleared 2000ms setTimeout, then calls process.exit(0) unconditionally.

## Round 2 finding (PLAN, prospective TESTING, 3 rounds with live measurement)
- Round 1 finding: the Supabase client itself (not just the timer) is the documented crash source -- index-jam-detector.mjs:158-163 and .husky/commit-msg's own comment both already attribute this exact assertion to "a network client." Fixing only the timer leaves the client's own handle as a crash source, AND clear-stale-index-lock.mjs's sole invoker (safe-root-resync.mjs) hard-aborts in a worktree, making the worktree-widening half of the original design dead code.
- Round 2 finding: the "obvious" alternative -- process.exitCode+return instead of process.exit(0) (proven safe for index-jam-detector.mjs's CRON context) -- was measured (real probe, blackhole IP simulating a network stall) to convert the intermittent crash into a DETERMINISTIC ~50 SECOND HANG on every interactive git commit, because the abandoned in-flight fetch (not the timer) keeps the loop open for the full stall duration. Rejected by measurement.
- Round 3 finding: the correct fix retires the defect class rather than mitigating it -- append-fleet-commit-trailer.js only needs one string (a fleet callsign), which the coordinator ALREADY maintains in a local, always-current cache (scripts/hooks/coordination-inbox.cjs's fleet-identity-<sessionId>.json, written on every SET_IDENTITY message). The script can read that file synchronously instead of querying Supabase at all -- no network client, no timer, no race. Shared-root resolution (needed since the cache lives in the shared checkout's .claude/, not any given worktree's) uses \`git rev-parse --git-common-dir\` (measured worktree-safe, including under real GIT_DIR/GIT_INDEX_FILE env), not a naive __dirname-relative path (measured broken from a worktree).

## Scope (one SD, revised)
- FR-1: Remove the Supabase client, Promise.race, and setTimeout from append-fleet-commit-trailer.js entirely.
- FR-2: Resolve the shared repo root via \`git rev-parse --path-format=absolute --git-common-dir\`, worktree-safe.
- FR-3: Read the coordinator's existing fleet-identity cache synchronously, extract callsign, fail open on any error -- behavior-preserving including role-seat sessions.
- FR-4: Real child_process spawn regression tests (not mocks) covering both topologies and all fail-open cases, with an explicit wall-clock upper bound.
- FR-5: Explicit scope fence -- no changes to clear-stale-index-lock.mjs, index-jam-detector.mjs, safe-root-resync.mjs, coordination-inbox.cjs, or capture-session-id.cjs.

## Out of scope
- Worktree-aware hardening of lib/git/clear-stale-index-lock.mjs's safety predicate -- SD-LEO-INFRA-JAMMED-GIT-INDEX-001's territory, its predicate is already known-unsafe (no pid check, no age floor on zero-byte) independent of worktree-awareness.
- Any synchronous hook-wiring of stale-lock cleanup -- the live-jam-vs-stale-jam ambiguity that SD already identified and punted on applies equally here.
- Hook framework redesign; node/libuv upstream fix.

## Success criteria
- append-fleet-commit-trailer.js contains zero references to Supabase, setTimeout, or Promise.race after this SD.
- The trailer is correctly stamped when a valid identity file exists, in both worktree and shared-checkout invocation contexts, fails open on all missing/malformed/callsign-absent cases, verified by real spawn tests.
- All spawn tests complete in well under 1 second wall-clock, with an explicit assertion catching any future reintroduction of a network call.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'append-fleet-commit-trailer.js contains zero references to Supabase, setTimeout, or Promise.race after this SD.' },
  { measure: '[VERIFIED]', criterion: 'The trailer is correctly stamped when a valid identity file exists, in both worktree and shared-checkout invocation contexts, fails open on all missing/malformed/callsign-absent cases, verified by real spawn tests.' },
  { measure: '[VERIFIED]', criterion: 'All spawn tests complete in well under 1 second wall-clock, with an explicit assertion catching any future reintroduction of a network call.' },
];

const strategic_objectives = [
  'Retire the Windows libuv UV_HANDLE_CLOSING assertion defect class in append-fleet-commit-trailer.js by removing its network dependency entirely, not merely mitigating the timer symptom',
  'Preserve existing trailer-stamping behavior exactly (including role-seat sessions) while eliminating the ~150ms network round-trip on every commit',
];

const smoke_test_steps = [
  { instruction: 'Create a disposable temp git repo, add a worktree of it, write a valid fleet-identity-<sessionId>.json at the shared root, then spawn the rewritten script with CLAUDE_SESSION_ID set and cwd inside the worktree.', expected_outcome: 'The commit message file gets the Fleet-Worker/Claude-Session trailer appended, and the process exits 0 in well under 1 second.' },
  { instruction: 'Repeat the same setup but omit the identity file entirely.', expected_outcome: 'The commit message file is left unmodified, and the process exits 0.' },
  { instruction: 'Repeat with a role-seat identity file (role:true, callsign:"Coordinator").', expected_outcome: 'The trailer is still stamped with "Fleet-Worker: Coordinator" -- no new role-seat exclusion.' },
  { instruction: 'Grep the rewritten script for any remaining import of lib/supabase-client.js, setTimeout, or Promise.race.', expected_outcome: 'Zero matches -- the network/timer defect class is retired by construction, not merely mitigated.' },
];

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
    rescope_note_round2: {
      rescoped_at: new Date().toISOString(),
      reason: 'Prospective TESTING review (3 rounds, live-measured with real probes) found the round-1 LEAD scope (timer-only fix + worktree-widening of clear-stale-index-lock.mjs) insufficient and partly dead-by-construction. Redesigned to remove the network dependency from append-fleet-commit-trailer.js entirely, reading the coordinator\'s existing local fleet-identity cache instead. See PRD revision and the sub_agent_execution_results TESTING evidence for full findings.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      success_criteria,
      strategic_objectives,
      smoke_test_steps,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD fields synced to round-2 design.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
