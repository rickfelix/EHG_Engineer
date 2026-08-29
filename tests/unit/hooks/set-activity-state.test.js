/**
 * SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001 — the Node port of the activity-state hook must be
 * a DROP-IN for the PowerShell original it replaces.
 *
 * THE DEFECT BEING FIXED: `.claude/set-activity-state.ps1` spawned a fresh PowerShell
 * interpreter on every PreToolUse / UserPromptSubmit / Stop event — measured 914-1054ms per
 * invocation, breaching the hook framework's own 2000ms timeout cap ~2,076 times over 19 days
 * fleet-wide. It was ported to scripts/hooks/set-activity-state.cjs (Node; p50 35.3ms /
 * p95 77.6ms / max 122.5ms over 100 runs, 0 timeouts) and the 3 invocation sites in
 * .claude/settings.json were rewired.
 *
 * WHAT THE LATENCY NUMBER DOES NOT PROVE, AND THIS FILE DOES: the port is fast. Fast is not
 * correct. The hook is a READ-MODIFY-WRITE against a file it does not own — `.claude/logs/
 * .context-state.json` is written by `.claude/statusline.cjs`, which stores context/token
 * accounting there (last_context_used, last_percent, last_output_tokens, last_input_tokens,
 * session_id, role, ...) and reads back only three keys: activity_state, last_active_epoch,
 * hook_triggered. A port that clobbered the file with a fresh 3-key object instead of merging
 * would still post ~35ms and still satisfy every statusline read — the loss would surface only
 * as silently wrong context/token rendering, with nothing to attribute it to. The merge is the
 * part that can break invisibly, so the merge is what is asserted here.
 *
 * SCOPE — these tests exercise the SHIPPED file (scripts/hooks/set-activity-state.cjs) by
 * spawning it exactly as .claude/settings.json does (`node <hook> <state>`), redirected at a
 * per-test tmpdir via LEO_ACTIVITY_STATE_FILE. They deliberately do NOT re-read a rewritten
 * copy of the source: a copy proves things about the copy. The env override is inert in
 * production (settings.json passes no env; the hardcoded default applies).
 *
 * The real state file is NEVER touched: every case sets LEO_ACTIVITY_STATE_FILE to an
 * os.tmpdir() path, and each assertion below re-reads only that path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOOK_PATH = path
  .resolve(__dirname, '../../../scripts/hooks/set-activity-state.cjs')
  .replace(/\\/g, '/');

/** The three keys the hook owns. Everything else in the file belongs to statusline.cjs. */
const HOOK_OWNED_KEYS = ['activity_state', 'last_active_epoch', 'hook_triggered'];

/**
 * A realistic statusline-authored payload. Keys and shapes taken from the newState object
 * .claude/statusline.cjs writes (see its writeFileSync near the end of that file) — not
 * invented, so a future statusline field rename shows up here as a stale fixture rather than
 * as a passing test about nothing.
 */
function statuslinePayload() {
  return {
    last_context_used: 412_337,
    last_percent: 41,
    last_output_tokens: 9_812,
    last_input_tokens: 402_525,
    session_id: '78a073be-f6e0-45bc-8ae5-db640a41b0fc',
    role: 'EXEC',
    last_active_epoch: 1_700_000_000,
    activity_state: 'idle',
    hook_triggered: false,
  };
}

let tmpDir;
let stateFile;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-state-'));
  stateFile = path.join(tmpDir, 'logs', '.context-state.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Invoke the hook exactly as .claude/settings.json does, pointed at the tmp state file. */
function runHook(state, { file = stateFile } = {}) {
  execFileSync('node', [HOOK_PATH, state], {
    env: { ...process.env, LEO_ACTIVITY_STATE_FILE: file },
    stdio: 'pipe',
  });
}

function seed(obj, { file = stateFile } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
}

function readState({ file = stateFile } = {}) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('set-activity-state.cjs — merge semantics (statusline keys are not the hook\'s to touch)', () => {
  it('running -> idle changes ONLY the three hook-owned keys; every statusline key stays byte-identical', () => {
    const seeded = statuslinePayload();
    seed(seeded);

    runHook('running');
    const afterRunning = readState();
    runHook('idle');
    const afterIdle = readState();

    // The foreign keys survive BOTH transitions untouched. Compared against the seed (not
    // against the previous read), so a key corrupted on the first call cannot be laundered
    // into "unchanged" by the second.
    const foreignKeys = Object.keys(seeded).filter((k) => !HOOK_OWNED_KEYS.includes(k));
    expect(foreignKeys.length).toBeGreaterThan(0); // fixture sanity: there IS something to preserve
    for (const key of foreignKeys) {
      expect(afterRunning[key], `${key} after running`).toStrictEqual(seeded[key]);
      expect(afterIdle[key], `${key} after idle`).toStrictEqual(seeded[key]);
    }

    // No key was invented or dropped: the key SET is exactly the seed's.
    expect(Object.keys(afterIdle).sort()).toStrictEqual(Object.keys(seeded).sort());

    // ...and the hook-owned keys did move, in the direction asked for. Without this the test
    // above would also pass against a hook that did nothing at all.
    expect(afterRunning.activity_state).toBe('running');
    expect(afterIdle.activity_state).toBe('idle');
    expect(afterIdle.hook_triggered).toBe(true);
    expect(afterIdle.last_active_epoch).toBeGreaterThan(seeded.last_active_epoch);
  });

  it('preserves keys the hook has no knowledge of (forward-compatible with future statusline fields)', () => {
    // The preservation must be structural (merge into the parsed object), not an allowlist of
    // today's statusline keys — otherwise the next field statusline adds is silently dropped.
    seed({ ...statuslinePayload(), some_future_field: { nested: [1, 2, 3] }, another: 'keep-me' });

    runHook('running');
    const after = readState();

    expect(after.some_future_field).toStrictEqual({ nested: [1, 2, 3] });
    expect(after.another).toBe('keep-me');
  });

  it('writes last_active_epoch as UNIX SECONDS, which is the unit statusline.cjs subtracts against', () => {
    // statusline.cjs computes idle duration as (Date.now()/1000) - last_active_epoch. Writing
    // milliseconds here would still "work" (valid JSON, key present) but render an idle time
    // ~1.7 billion seconds in the past. A unit mismatch is exactly the kind of port defect a
    // latency measurement cannot see.
    seed(statuslinePayload());
    const before = Math.floor(Date.now() / 1000);
    runHook('running');
    const after = Math.floor(Date.now() / 1000);

    const epoch = readState().last_active_epoch;
    expect(Number.isInteger(epoch)).toBe(true);
    expect(epoch).toBeGreaterThanOrEqual(before);
    expect(epoch).toBeLessThanOrEqual(after);
  });
});

describe('set-activity-state.cjs — degraded inputs must not throw (it runs on EVERY tool call)', () => {
  it('creates the log directory and the state file when neither exists', () => {
    expect(fs.existsSync(path.dirname(stateFile))).toBe(false);

    expect(() => runHook('running')).not.toThrow();

    expect(fs.existsSync(stateFile)).toBe(true);
    expect(readState()).toStrictEqual({
      activity_state: 'running',
      last_active_epoch: expect.any(Number),
      hook_triggered: true,
    });
  });

  it('falls back to a fresh object when the state file contains invalid JSON', () => {
    seed('{ this is not json at all ,,,');

    expect(() => runHook('idle')).not.toThrow();

    const after = readState(); // must now be parseable — the corruption is repaired, not propagated
    expect(after.activity_state).toBe('idle');
    expect(after.hook_triggered).toBe(true);
    expect(Object.keys(after).sort()).toStrictEqual([...HOOK_OWNED_KEYS].sort());
  });

  it('falls back to a fresh object when the state file holds valid JSON that is not an object', () => {
    // JSON.parse succeeds here, so the try/catch never fires — only the explicit
    // typeof/null guard saves this. An array would otherwise be written back as an ARRAY
    // with three named properties, which serialises to "[]" and destroys the file.
    for (const junk of ['"a string"', '[1,2,3]', 'null', '42']) {
      seed(junk);
      expect(() => runHook('running'), `payload ${junk}`).not.toThrow();
      const after = readState();
      expect(Array.isArray(after), `payload ${junk} produced an array`).toBe(false);
      expect(after.activity_state, `payload ${junk}`).toBe('running');
      expect(after.hook_triggered, `payload ${junk}`).toBe(true);
    }
  });

  it('treats an empty state file as absent rather than as a parse failure', () => {
    seed('');
    expect(() => runHook('idle')).not.toThrow();
    expect(readState().activity_state).toBe('idle');
  });

  it('defaults to "idle" when invoked with no state argument', () => {
    // Matches the PowerShell original's -State default. No settings.json site relies on this
    // today, but the fallback is load-bearing if one is ever added without an argument.
    seed(statuslinePayload());
    execFileSync('node', [HOOK_PATH], {
      env: { ...process.env, LEO_ACTIVITY_STATE_FILE: stateFile },
      stdio: 'pipe',
    });
    expect(readState().activity_state).toBe('idle');
  });

  it('exits 0 and stays silent even when the write target is unwritable', () => {
    // The hook is wired to PreToolUse. A nonzero exit or stray stdout from a best-effort
    // telemetry write would surface as tool-call noise (or worse) on every single tool use,
    // so failure must be TOTALLY silent. Target a path whose parent is an existing FILE, which
    // makes mkdirSync fail on every platform.
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, 'not a directory', 'utf8');
    const impossible = path.join(blocker, 'logs', '.context-state.json');

    const out = execFileSync('node', [HOOK_PATH, 'running'], {
      env: { ...process.env, LEO_ACTIVITY_STATE_FILE: impossible },
      stdio: 'pipe',
    });
    expect(out.toString()).toBe(''); // execFileSync itself throws on a nonzero exit
  });
});

// NOTE (SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001 split, coordinator disposition on signals
// 119ef20b/54a68258): a "settings.json wiring" test lived here, asserting all 3 hook sites
// call this file and no PowerShell invocation remains. .claude/settings.json is path-wide
// reserved to SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001's chairman-gated ceremony lock
// (ceremony-scope-lock-lint, FR-3/FR-4), so this PR does not touch it -- the wiring and its
// test both live in follow-up/SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001-settings-wiring (PR
// #7665, held pending the chairman's ruling). This file alone is a writer without a wired
// consumer until #7665 lands -- documented, not silently absorbed.
