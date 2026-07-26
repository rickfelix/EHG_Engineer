/**
 * SD-...-PROMPT-LIBRARY-001-D FR-1 — pointer-file transport.
 *
 * These tests use a REAL temp directory rather than a mocked fs on purpose: the defect class this
 * SD exists for is "the value looked delivered and was not", and a mocked fs is exactly the seam
 * that hides a write which never happened.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildPointerLine, writeStartupPromptFile, sweepStartupPromptFiles, PROMPT_DIR_REL,
} = require('../../../lib/fleet/startup-prompt-pointer.cjs');
const { assertSingleLinePrompt, MultilinePromptError } = require('../../../lib/fleet/startup-prompt-selection.js');
const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-')); });
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

const dir = () => path.join(root, PROMPT_DIR_REL);

describe('FR-1 — the pointer is single-line even when the prompt is not', () => {
  it('THE WHOLE POINT: a multi-line prompt yields a pointer that survives the tripwire', () => {
    // The live worker directive is multi-line, which is what cmd.exe truncated.
    expect(FLEET_WORKER_STARTUP_PROMPT.split('\n').length).toBeGreaterThan(1);

    const { pointerLine, promptFilePath } = writeStartupPromptFile({
      repoRoot: root, sessionId: 'a1b2c3d4', prompt: FLEET_WORKER_STARTUP_PROMPT,
    });

    // The pointer is safe to put in argv...
    expect(() => assertSingleLinePrompt(pointerLine, { where: 'test' })).not.toThrow();
    expect(pointerLine.split(/[\r\n]/).length).toBe(1);
    // ...while the FULL prompt is preserved on disk, byte for byte.
    expect(fs.readFileSync(promptFilePath, 'utf8')).toBe(FLEET_WORKER_STARTUP_PROMPT);
    // And the prompt itself would still be rejected in argv — the tripwire has not been weakened.
    expect(() => assertSingleLinePrompt(FLEET_WORKER_STARTUP_PROMPT, { where: 't' }))
      .toThrow(MultilinePromptError);
  });

  it('names the file after the session id, so a directive is correlatable to its session', () => {
    const { promptFilePath } = writeStartupPromptFile({ repoRoot: root, sessionId: 'sess-9', prompt: 'x' });
    expect(path.basename(promptFilePath)).toBe('sess-9.txt');
  });

  it('refuses a path-traversing session id rather than sanitising it into something else', () => {
    expect(() => writeStartupPromptFile({ repoRoot: root, sessionId: '../escape', prompt: 'x' })).toThrow(/unsafe sessionId/);
  });

  it('refuses an empty prompt (a pointer to nothing is the dangling case)', () => {
    expect(() => writeStartupPromptFile({ repoRoot: root, sessionId: 'ok', prompt: '' })).toThrow(/non-empty/);
  });
});

describe('FR-1 — dangling-pointer handling fails toward IDLE, never toward claiming', () => {
  it('the pointer instructs a session with a missing file to idle and not claim', () => {
    const line = buildPointerLine('/some/where/x.txt');
    expect(line).toMatch(/does not exist or is empty/i);
    expect(line).toMatch(/not claim or start any work/i);
    expect(line).toMatch(/remain idle/i);
    // Direction matters: "do nothing" is recoverable, "claim something" is the fleet-wide hazard.
    expect(line).not.toMatch(/use your best judg|proceed anyway|fall back to CLAUDE\.md/i);
  });
});

describe('FR-1 — the newline tripwire is REACHABLE from the live launch path', () => {
  // THIS IS THE TEST THE SD'S EXIT CRITERION ASKS FOR
  // (metadata.fr1_exit_criterion_tripwire_must_be_wired). Before FR-1, assertSingleLinePrompt had
  // ZERO production callers: it could have been deleted outright with every test outside its own
  // file still green — "present, correct, and silently removable". Its own passing unit tests were
  // not evidence it guarded anything.
  //
  // So this neuters the guard THROUGH AN INJECTED SEAM rather than by editing the live call site,
  // and asserts buildSessionLaunch itself throws. If someone removes the assertSingleLinePrompt
  // call from the positional path, this goes RED — which is what makes it a guard.
  const { buildSessionLaunch } = require('../../../lib/fleet/build-session-launch.cjs');

  const spec = () => ({
    role: 'worker',
    callsign: 'Charlie',
    cwd: root,
    sessionId: '11111111-2222-4333-8444-555555555555',
    startupPrompt: 'anything',
  });

  it('THROWS when the value destined for argv is multi-line', () => {
    expect(() => buildSessionLaunch(spec(), {
      buildPointerLineFn: () => 'line one\nline two would be LOST to cmd.exe',
    })).toThrow(MultilinePromptError);
  });

  it('and does NOT throw for the real single-line pointer (so the check is not always-on)', () => {
    // Without this arm the test above would pass even if buildSessionLaunch threw unconditionally.
    expect(() => buildSessionLaunch(spec(), {})).not.toThrow();
  });

  it('the real launch path puts a single-line pointer in the trailing positional', () => {
    const inv = buildSessionLaunch(spec(), {});
    const last = inv.args[inv.args.length - 1];
    expect(last.split(/[\r\n]/).length).toBe(1);
    expect(last).toMatch(/follow the instructions in it exactly/);
  });
});

describe('FR-1 — the sweep must not delete a PENDING session\'s pointer', () => {
  const write = (name, ageMs, now) => {
    fs.mkdirSync(dir(), { recursive: true });
    const p = path.join(dir(), name);
    fs.writeFileSync(p, 'x');
    fs.utimesSync(p, new Date(now - ageMs) / 1000, new Date(now - ageMs) / 1000);
    return p;
  };

  it('RETAIN-N ALONE IS UNSAFE: 10 fresh spawns, none swept, because all are inside the live window', () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 10; i++) write(`s${i}.txt`, i * 1000, now); // all seconds old
    const { deleted } = sweepStartupPromptFiles({ repoRoot: root, now });
    // A pure retain-5 sweep would have deleted 5 of these while their sessions were still starting.
    expect(deleted).toEqual([]);
  });

  it('but genuinely old files beyond the retain window ARE swept', () => {
    const now = 1_000_000_000_000;
    const old = 60 * 60 * 1000; // 1h — well past the min age
    for (let i = 0; i < 8; i++) write(`old${i}.txt`, old + i * 1000, now);
    const { deleted, kept } = sweepStartupPromptFiles({ repoRoot: root, now });
    expect(deleted.length).toBe(3); // 8 old files, 5 newest retained
    expect(kept).toBe(5);
  });

  it('never throws when the directory does not exist', () => {
    expect(() => sweepStartupPromptFiles({ repoRoot: path.join(root, 'nope') })).not.toThrow();
  });
});
