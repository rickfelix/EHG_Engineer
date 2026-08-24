#!/usr/bin/env node
// SD-LEO-INFRA-STALE-INDEX-LOCK-001 -- PLAN-phase PRD revision after prospective TESTING review.
// Round 1 (original PRD): FR-1 fixed only the setTimeout ref/clear lifecycle; FR-2/FR-3/FR-5
// widened lib/git/clear-stale-index-lock.mjs to worktrees. Reviewer found: (a) FR-1 alone is
// insufficient -- the Supabase client itself is the documented crash source elsewhere in this
// exact repo (index-jam-detector.mjs:158-163, .husky/commit-msg's own comment); (b) FR-2's sole
// invoker (safe-root-resync.mjs) hard-aborts in a worktree, making it dead by construction; (c)
// the PRD misstated the existing safety predicate (no pid check, no age floor on zero-byte --
// already known-unsafe and explicitly deferred to SD-LEO-INFRA-JAMMED-GIT-INDEX-001).
// Round 2 (this revision): dropped FR-2/FR-3/FR-5 entirely -- that hardening belongs to a
// different SD. Replaced FR-1 with a design that RETIRES the defect class rather than mitigating
// it: append-fleet-commit-trailer.js no longer opens a network client at all. It reads the
// fleet-identity cache the coordinator already maintains (scripts/hooks/coordination-inbox.cjs's
// fleet-identity-<sessionId>.json), resolving the shared root via `git rev-parse --git-common-dir`
// (measured worktree-safe, including under the real GIT_DIR/GIT_INDEX_FILE env a commit-msg hook
// actually runs with) rather than reusing IDENTITY_DIR's __dirname-relative resolution (measured
// broken from a worktree -- CLAUDE_PROJECT_DIR is empty in a git-hook context).
// The reviewer also measured that the "obvious" alternative -- replacing process.exit(0) with
// process.exitCode+return (the pattern already proven for a CRON context) -- converts an
// intermittent crash into a DETERMINISTIC ~50s hang on every commit, because the abandoned
// in-flight Supabase fetch (not just the timer) keeps the event loop open. That alternative is
// explicitly rejected, not adopted.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { updatePRDWithLLMContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-STALE-INDEX-LOCK-001';
const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';
const SD_KEY = 'SD-LEO-INFRA-STALE-INDEX-LOCK-001';

const llmContent = {
  executive_summary: 'Eliminate append-fleet-commit-trailer.js\'s Supabase client + timer (the measured crash source) by reading the coordinator\'s existing local fleet-identity cache instead.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Remove the network dependency from scripts/append-fleet-commit-trailer.js entirely: delete the `import(\'../lib/supabase-client.js\')`, the `Promise.race`, and the `setTimeout` guard. This is the measured root cause (Supabase client handle + timer both contribute to the libuv assertion) -- removing the network call retires the defect class rather than mitigating it.',
      acceptance_criteria: [
        'No `import(\'../lib/supabase-client.js\')`, `createSupabaseServiceClient`, `setTimeout`, or `Promise.race` remains anywhere in the script.',
        'Grep-verified: zero matches for `supabase` (case-insensitive) in the rewritten file.'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Resolve the shared repo root reliably from any invocation context (shared checkout OR worktree) via `execSync(\'git rev-parse --path-format=absolute --git-common-dir\')` then `path.dirname()` of the result. Measured worktree-safe, including under the real GIT_DIR/GIT_INDEX_FILE env vars git sets during commit-msg execution. Do NOT reuse IDENTITY_DIR\'s `path.resolve(__dirname, \'../../.claude\')` pattern (measured broken from a worktree: CLAUDE_PROJECT_DIR is empty in a git-hook context, and __dirname resolves to the invoking worktree\'s own -- empty -- .claude/ directory, not the shared root).',
      acceptance_criteria: [
        'Invoked from a worktree cwd, the resolved shared root matches the actual shared checkout path, not the worktree\'s own path.',
        'Invoked from the shared checkout directly, the resolved root is unchanged/correct (no regression for the original invocation context).'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Read `<sharedRoot>/.claude/fleet-identity-<sessionId>.json` synchronously via fs.readFileSync, parse it, extract `callsign`. Fail open (exit 0, no trailer stamped, commit message left unmodified) on any error: file missing, unreadable, malformed JSON, or no callsign field -- matching the original script\'s existing fail-open contract exactly. Behavior-preserving: stamp the trailer for ANY session type with a callsign present in its identity file (worker or role-seat, e.g. callsign "Coordinator"), matching the original script\'s behavior of stamping whatever callsign the DB query returned regardless of session type -- do not introduce a new role-seat exclusion that was not present in the original.',
      acceptance_criteria: [
        'Given a valid identity file with a callsign present, the trailer is correctly appended to the commit message file.',
        'Given a missing, unreadable, or malformed identity file (including one with no callsign field), the script exits 0 and the commit message is left unmodified.',
        'A role-seat identity file (role:true, callsign present, e.g. "Coordinator") still gets the trailer stamped -- no new exclusion introduced.',
        'The already-stamped case (message already contains "Fleet-Worker:") still exits 0 without double-stamping, matching existing behavior.'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Regression tests must measure the actual observable outcome (process exits promptly, commit message correctly modified or left alone), not merely pin an implementation detail. Use real child_process spawns of the rewritten script against fixture identity files in a temp directory (not the shared .claude/, to avoid polluting the 530 real production identity files already there) and a temp git repo INCLUDING a worktree of it, so the shared-root resolution is exercised from a genuine worktree cwd, not simulated.',
      acceptance_criteria: [
        'A spawn test from a worktree cwd (created via `git worktree add` in a disposable temp repo) with a valid identity file at the resolved shared root correctly stamps the trailer -- this is the specific path-resolution trap identified in prospective review (a naive __dirname-relative resolver would silently resolve to the worktree\'s own empty .claude/ instead).',
        'A spawn test with the identity file entirely absent exits 0 with the commit message unmodified.',
        'A spawn test with a malformed (non-JSON) identity file exits 0 with the commit message unmodified, not a crash.',
        'A spawn test with an identity file present but no callsign field exits 0 with the commit message unmodified.',
        'All spawn tests complete in well under 1 second wall-clock (the entire point of removing the network round-trip) -- assert an explicit upper bound so a future regression that reintroduces a network call is caught by a timing failure, not just left undetected.'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Explicit, documented scope fence: this SD does not modify lib/git/clear-stale-index-lock.mjs, scripts/cron/index-jam-detector.mjs, scripts/safe-root-resync.mjs, scripts/hooks/coordination-inbox.cjs, or scripts/hooks/capture-session-id.cjs. Worktree-aware stale-lock cleanup (the original SD premise) is a separate, already-owned concern (SD-LEO-INFRA-JAMMED-GIT-INDEX-001\'s territory) with its own known-unsafe safety predicate that needs independent hardening -- not bundled here, to keep this fix\'s blast radius to exactly the measured root cause.',
      acceptance_criteria: [
        'Git diff for this SD touches only scripts/append-fleet-commit-trailer.js and its new test file(s).',
        'A code comment or PR description explicitly states the deferred-scope rationale, citing SD-LEO-INFRA-JAMMED-GIT-INDEX-001 by name.'
      ]
    }
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Scope fence: this SD touches scripts/append-fleet-commit-trailer.js and its new regression tests only. It does not modify lib/git/clear-stale-index-lock.mjs, scripts/cron/index-jam-detector.mjs, scripts/safe-root-resync.mjs, scripts/hooks/coordination-inbox.cjs, or scripts/hooks/capture-session-id.cjs -- the identity cache these already write/maintain is read-only consumed, not modified. Worktree-aware lock-clearing hardening (the original SD premise) is explicitly deferred to SD-LEO-INFRA-JAMMED-GIT-INDEX-001\'s territory, not built here.'
    },
    {
      id: 'TR-2',
      requirement: 'Do NOT adopt the process.exitCode+return pattern (proven safe for index-jam-detector.mjs\'s cron context) as a substitute fix. Measured: it converts the intermittent crash into a deterministic ~50s hang on every interactive `git commit` because the abandoned in-flight Supabase fetch (not the timer) keeps the event loop open for the duration of the network stall the original 2000ms race guard existed to survive. This alternative is rejected by measurement, not merely unconsidered.'
    },
    {
      id: 'TR-3',
      requirement: 'The shared-root resolution must use `git rev-parse` (not a reimplementation of git\'s commondir-file parsing, and not CLAUDE_PROJECT_DIR, which is empty in a git-hook execution context) -- confirmed the only reliable instrument available synchronously inside a git hook, at a measured ~39ms cost, acceptable against the ~139-205ms Supabase round-trip being eliminated.'
    }
  ],
  test_scenarios: [
    { scenario: 'Valid fleet-identity file present in the shared root, worker session, invoked from a worktree cwd -- trailer correctly stamped.', type: 'happy_path' },
    { scenario: 'Valid fleet-identity file present, invoked from the shared checkout cwd directly (non-worktree) -- trailer correctly stamped, confirming no regression for the original invocation context.', type: 'happy_path' },
    { scenario: 'Role-seat identity file (role:true, callsign present, e.g. "Coordinator") -- trailer still stamped, matching original behavior.', type: 'happy_path' },
    { scenario: 'Identity file entirely absent (fresh session, no callsign assigned yet) -- exit 0, no trailer, commit message unmodified.', type: 'edge_case' },
    { scenario: 'Identity file present but contains no callsign field -- exit 0, no trailer.', type: 'edge_case' },
    { scenario: 'Identity file present but malformed (invalid JSON) -- exit 0, no crash, no trailer.', type: 'error_handling' },
    { scenario: 'Commit message already contains a Fleet-Worker trailer (amend/retry case) -- script exits 0 without double-stamping, matching existing behavior.', type: 'edge_case' },
    { scenario: 'Missing CLAUDE_SESSION_ID or missing commit-msg-file argument -- exit 0 immediately, matching existing behavior, before any fs/git work.', type: 'edge_case' }
  ],
  risks: [
    {
      risk: 'The coordinator-maintained fleet-identity cache could be stale or not yet written for a brand-new session (race between session start and the coordinator\'s SET_IDENTITY assignment).',
      mitigation: 'This is identical to the original script\'s own race (a brand-new session queried against claude_sessions may also not yet have a callsign) -- the fail-open behavior (no trailer, not a block) is unchanged and appropriate; a missing trailer on an SD\'s very first commit is cosmetic, not a defect this SD needs to solve.'
    },
    {
      risk: 'Shelling out to `git rev-parse` on every commit-msg invocation adds a ~39ms subprocess cost that a pure-fs parse of the .git pointer file + commondir file could avoid (measured ~390x cheaper).',
      mitigation: 'Deliberately not adopted: reimplementing git\'s own commondir resolution logic independently (rather than delegating to git itself) trades a well-tested, git-maintained algorithm for a hand-rolled one, for a savings that is immaterial against the ~150ms network round-trip being eliminated. Revisit only if commit-msg hook latency becomes a measured problem.'
    },
    {
      risk: 'Removing the DB query changes the trailer to reflect a LOCAL cache that could theoretically diverge from claude_sessions.metadata.fleet_identity.callsign if the coordinator\'s write to the local file and its DB write are not atomic together.',
      mitigation: 'Measured: coordination-inbox.cjs writes the local identity file as PART OF handling every SET_IDENTITY message (the same message that drives the DB update), and re-affirms it on every reassignment/demotion path -- the two are not independently maintained, so divergence risk is equivalent to the existing DB-write path\'s own consistency guarantees, not a new risk this SD introduces.'
    }
  ],
  system_architecture: {
    components: [
      'scripts/append-fleet-commit-trailer.js (rewritten: fs + git subprocess only, no network client)',
      'scripts/hooks/coordination-inbox.cjs (unmodified -- existing writer of the fleet-identity cache this SD now reads)',
      '.claude/fleet-identity-<sessionId>.json (shared-root identity cache, read-only consumed by this SD)'
    ],
    data_flow: 'git commit triggers .husky/commit-msg, which runs the rewritten append-fleet-commit-trailer.js. The script resolves the shared root via a git subprocess, reads the local JSON identity cache the coordinator already maintains (written independently of and prior to this hook firing), extracts the callsign, and stamps the commit message -- entirely synchronous, no network round-trip, no timers, no async handles to leak.'
  },
  acceptance_criteria: [
    'append-fleet-commit-trailer.js contains no Supabase client, setTimeout, or Promise.race after this SD.',
    'The rewritten script correctly stamps the trailer when a valid identity file exists, in both worktree and shared-checkout invocation contexts, and fails open (no trailer, exit 0, message unmodified) on any missing/malformed/callsign-absent case.',
    'All regression tests use real child_process spawns against real (temp, non-production) fixtures -- not mocks -- so the tests measure the actual observable outcome.'
  ],
  smoke_test_steps: [
    { instruction: 'Create a disposable temp git repo, add a worktree of it, write a valid fleet-identity-<sessionId>.json at the shared root, then spawn the rewritten script with CLAUDE_SESSION_ID set and cwd inside the worktree.', expected_outcome: 'The commit message file gets the Fleet-Worker/Claude-Session trailer appended, and the process exits 0 in well under 1 second.' },
    { instruction: 'Repeat the same setup but omit the identity file entirely.', expected_outcome: 'The commit message file is left unmodified, and the process exits 0.' },
    { instruction: 'Repeat with a role-seat identity file (role:true, callsign:"Coordinator").', expected_outcome: 'The trailer is still stamped with "Fleet-Worker: Coordinator" -- no new role-seat exclusion.' },
    { instruction: 'Grep the rewritten script for any remaining import of lib/supabase-client.js, setTimeout, or Promise.race.', expected_outcome: 'Zero matches -- the network/timer defect class is retired by construction, not merely mitigated.' }
  ],
};

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`SD fetch failed: ${sdErr.message}`);

  await updatePRDWithLLMContent(supabase, PRD_ID, SD_UUID, sdData, llmContent);
  console.log('PRD revised for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
