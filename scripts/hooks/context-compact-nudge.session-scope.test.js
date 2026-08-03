// SD-LEO-INFRA-COMPACT-NUDGE-RACES-001 — the post-handoff compact nudge must
// reach the session that EARNED it, and only that session.
//
// WHY THIS FILE EXISTS SEPARATELY FROM context-compact-nudge.handoff-flag.test.js:
// that suite's runHook() sets CLAUDE_SESSION_ID in the child environment. Real
// hooks do not get that variable — capture-session-id.cjs persists it via
// CLAUDE_ENV_FILE so BASH TOOL children inherit it, and a hook is not a Bash
// tool invocation. So a "fix" that keyed the flag off process.env would have
// passed every test in that file while changing nothing in production, because
// the harness supplies the exact precondition production lacks.
//
// Every runHook() below therefore DELETES CLAUDE_SESSION_ID from the child env
// and passes identity only the way Claude Code actually passes it: JSON on stdin.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { getHandoffFlagPath } from '../modules/handoff/cli/compact-after-handoff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(__dirname, 'context-compact-nudge.js');

const TEST_FLAG_DIR = path.join(os.tmpdir(), `leo-compact-scope-test-${process.pid}`);
// Isolated from the shared leo-context-nudge dir. The unidentified-session path
// writes to session-default.json, which on a real machine is the live file every
// session shares — pointing at it would both corrupt it and let its real
// cooldown suppress the run before the code under test is reached.
const STATE_DIR = path.join(os.tmpdir(), `leo-compact-scope-state-${process.pid}`);

// Distinct, sanitizer-safe ids standing in for two live workers and one role session.
const EARNER = `scope-earner-${process.pid}`;
const BYSTANDER = `scope-bystander-${process.pid}`;
const ROLE_SESSION = `scope-adam-${process.pid}`;
const SECOND_EARNER = `scope-earner2-${process.pid}`;

const flagFor = (sid) => getHandoffFlagPath({ LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR }, sid);
const stateFor = (sid) => path.join(STATE_DIR, `session-${sid}.json`);

/**
 * Runs the hook the way Claude Code does: identity on stdin, and CLAUDE_SESSION_ID
 * deliberately ABSENT. `delete` (not '') because an empty string is a different
 * failure mode and would let an `|| 'default'` fallback look like it works.
 */
function runHook({ sessionId, stdin, extraArgs = [] } = {}) {
  const env = {
    ...process.env,
    LEO_COMPACT_NUDGE_ENABLED: 'true',
    LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR,
    LEO_COMPACT_STATE_DIR: STATE_DIR
  };
  delete env.CLAUDE_SESSION_ID;

  const payload = stdin !== undefined
    ? stdin
    : JSON.stringify({ session_id: sessionId, hook_event_name: 'UserPromptSubmit' });

  return execFileSync('node', [HOOK_SCRIPT, ...extraArgs], {
    env,
    input: payload,
    encoding: 'utf8'
  });
}

function writeFlagFor(sessionId, overrides = {}) {
  fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
  const target = flagFor(sessionId);
  fs.writeFileSync(target, JSON.stringify({
    sd_id: `SD-FOR-${sessionId}`,
    session_id: sessionId,
    handoff_type: 'LEAD-FINAL-APPROVAL',
    tier: 'strong',
    mode: 'nudge',
    timestamp: new Date().toISOString(),
    ...overrides
  }, null, 2));
  return target;
}

function cleanup() {
  fs.rmSync(TEST_FLAG_DIR, { recursive: true, force: true });
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
}

beforeEach(cleanup);
afterEach(cleanup);

describe('identity comes from stdin, not the environment', () => {
  it('THE RED TEST: resolves its session from stdin with CLAUDE_SESSION_ID absent', () => {
    writeFlagFor(EARNER);
    const stdout = runHook({ sessionId: EARNER });
    expect(stdout).toContain('LEAD-FINAL-APPROVAL complete');
    expect(stdout).toContain(`SD-FOR-${EARNER}`);
  });

  it('writes its state to a file named for the stdin session, not to session-default', () => {
    runHook({ sessionId: EARNER });
    expect(fs.existsSync(stateFor(EARNER))).toBe(true);
    // The pre-fix behaviour was every session aggregating into one shared file.
    const state = JSON.parse(fs.readFileSync(stateFor(EARNER), 'utf8'));
    expect(state.userTurnCount).toBe(1);
  });

  it('consumes only its OWN flag file, leaving another session\'s untouched', () => {
    const mine = writeFlagFor(EARNER);
    const theirs = writeFlagFor(BYSTANDER);
    runHook({ sessionId: EARNER });
    expect(fs.existsSync(mine)).toBe(false);
    expect(fs.existsSync(theirs)).toBe(true);
  });

  it('does not consume a handoff flag at all when identity is unresolvable', () => {
    const orphan = writeFlagFor(EARNER);
    // Malformed stdin, no env var: the hook has no idea who it is.
    const stdout = runHook({ stdin: 'not json' });
    expect(stdout).not.toContain('complete');
    // Fail-closed. Falling back to a shared name here is the original defect.
    expect(fs.existsSync(orphan)).toBe(true);
  });

  // This test exists because a mutant survived without it. Asserting only that
  // an unidentified session leaves the SCOPED files alone is satisfied just as
  // well by a reader that falls back to an unscoped name no test ever creates.
  // The distinguishing assertion has to put a flag at the shared path.
  it('ignores a flag at the legacy shared path instead of falling back to it', () => {
    fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
    const legacy = path.join(TEST_FLAG_DIR, 'compact-after-handoff.json');
    fs.writeFileSync(legacy, JSON.stringify({
      sd_id: 'SD-LEGACY-SHARED',
      handoff_type: 'LEAD-FINAL-APPROVAL',
      tier: 'strong',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    }));

    expect(runHook({ stdin: 'not json' })).not.toContain('SD-LEGACY-SHARED');
    // An identified session must not pick it up either — the shared file is
    // exactly what this SD removes, whoever is asking.
    expect(runHook({ sessionId: EARNER })).not.toContain('SD-LEGACY-SHARED');
  });

  it('sweeps the stale legacy shared file so it is not left behind forever', () => {
    fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
    const legacy = path.join(TEST_FLAG_DIR, 'compact-after-handoff.json');
    fs.writeFileSync(legacy, '{}');
    const old = new Date(Date.now() - 120 * 60 * 1000);
    fs.utimesSync(legacy, old, old);

    runHook({ sessionId: EARNER });
    // Nothing reads this path after the fix, so without the sweep it would be
    // permanent litter on every machine that ever ran the old code.
    expect(fs.existsSync(legacy)).toBe(false);
  });
});

describe('PRIMARY: worker-to-worker — the majority population', () => {
  // Measured on the live fleet while this SD was in LEAD: 7 workers to 3 role
  // sessions. A fix that only filtered role sessions would leave all 7 racing.
  it('a bystander worker prompting first does not steal the earner\'s nudge', () => {
    writeFlagFor(EARNER);

    const bystanderOut = runHook({ sessionId: BYSTANDER });
    expect(bystanderOut).not.toContain('complete');
    expect(bystanderOut).not.toContain(`SD-FOR-${EARNER}`);

    const earnerOut = runHook({ sessionId: EARNER });
    expect(earnerOut).toContain('LEAD-FINAL-APPROVAL complete');
    expect(earnerOut).toContain(`SD-FOR-${EARNER}`);
  });
});

describe('SECONDARY: role sessions — satisfied by construction, not by role detection', () => {
  it('a role session never matches, because it never runs handoffs', () => {
    writeFlagFor(EARNER);
    expect(runHook({ sessionId: ROLE_SESSION })).not.toContain('complete');
    expect(runHook({ sessionId: EARNER })).toContain('LEAD-FINAL-APPROVAL complete');
  });
});

describe('two concurrent earners each receive their own nudge', () => {
  // Pre-fix this was a single-slot writeFileSync: the second handoff overwrote
  // the first session's pending flag, and nobody received it. Observed live on
  // SD-LEO-INFRA-FLEET-DOWN-PAGER-001 — a flag written at 05:33 was overwritten
  // at 05:41 and gone by 05:47, with no race involved at all.
  it('neither flag overwrites the other', () => {
    writeFlagFor(EARNER, { handoff_type: 'EXEC-TO-PLAN', tier: 'medium' });
    writeFlagFor(SECOND_EARNER, { handoff_type: 'LEAD-TO-PLAN', tier: 'soft' });

    const first = runHook({ sessionId: EARNER });
    expect(first).toContain('EXEC-TO-PLAN complete');

    const second = runHook({ sessionId: SECOND_EARNER });
    expect(second).toContain('LEAD-TO-PLAN complete');
    expect(second).toContain(`SD-FOR-${SECOND_EARNER}`);
  });
});

describe('TS-8: one session\'s nudge no longer suppresses the whole fleet', () => {
  // This is FR-3(a), and it is a DIFFERENT guard from the compaction cooldown.
  // context-compact-nudge.js:227 gates on state.lastNudgeTime, which lived in
  // the shared session-default.json; :220 gates on the compaction marker from a
  // different file entirely. Only the first is fixed by scoping state, and the
  // measured live suppressor at the time of writing was this one — a flag sat
  // unconsumed for 20 minutes behind a lastNudgeTime 22 minutes old.
  it('a bystander that just nudged does not silence the earner', () => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFor(BYSTANDER), JSON.stringify({
      userTurnCount: 5,
      toolCallCount: 0,
      startTime: new Date().toISOString(),
      lastNudgeTime: new Date().toISOString(), // one minute ago, well inside cooldown
      nudgeCount: 1,
      lastCompactionTime: null
    }));

    writeFlagFor(EARNER);
    const stdout = runHook({ sessionId: EARNER });
    expect(stdout).toContain('LEAD-FINAL-APPROVAL complete');
  });
});

describe('stale per-session flags are swept', () => {
  // Per-session filenames removed the old self-healing: previously any session
  // could unlink the ONE known stale path. Now a session that runs a handoff
  // and then never prompts again (crash, session end, one-shot CLI) leaves a
  // file whose name no other session can construct.
  it('an orphan from a session that never came back is removed by a live session', () => {
    const orphan = writeFlagFor(BYSTANDER);
    const old = new Date(Date.now() - 120 * 60 * 1000);
    fs.utimesSync(orphan, old, old);

    runHook({ sessionId: EARNER });
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('a fresh flag belonging to another live session survives the sweep', () => {
    const theirs = writeFlagFor(BYSTANDER);
    runHook({ sessionId: EARNER });
    expect(fs.existsSync(theirs)).toBe(true);
  });
});
