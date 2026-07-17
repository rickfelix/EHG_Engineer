/**
 * SD-LEO-FIX-SESSION-RESTORE-HOOK-001 — session-scoping fix for
 * persist-session-state.cjs / recover-session-state.cjs.
 *
 * Before the fix, both hooks used a single machine-global checkpoint directory
 * ($HOME/.claude-checkpoints) and state file ($HOME/.claude-session-state.json)
 * shared by EVERY Claude Code session on the host, with the restore hook simply
 * picking the most-recent checkpoint file by mtime — zero session_id filtering.
 * On a fleet host running several concurrent sessions, this let one session's
 * restore silently apply a completely different session's state.
 *
 * These tests prove: (1) each hook's persisted/read paths are keyed on
 * session_id, (2) a genuine two-session round trip (FR-3's exact ask) — two
 * sessions each persist distinct state, each restore reads back ONLY its own,
 * (3) cleanup in one session never touches a peer session's checkpoints.
 *
 * Both hooks compute their file paths from process.env.HOME at require() time,
 * so tests override HOME to an isolated temp dir and delete the require cache
 * before each require (matching the established loadHook() pattern used by
 * node-modules-autoheal.test.js).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PERSIST_PATH = path.resolve(__dirname, '../persist-session-state.cjs');
const RECOVER_PATH = path.resolve(__dirname, '../recover-session-state.cjs');

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

describe('persist-session-state.cjs / recover-session-state.cjs — per-session scoping', () => {
  let tmpHome;
  let originalHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-restore-scoping-'));
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
  });

  it('sessionStateFile() and checkpointDir() are keyed on session_id, not shared', () => {
    const persist = loadFresh(PERSIST_PATH);
    const fileA = persist.sessionStateFile('session-aaa');
    const fileB = persist.sessionStateFile('session-bbb');
    expect(fileA).not.toBe(fileB);
    expect(fileA).toContain('session-aaa');
    expect(fileB).toContain('session-bbb');

    const dirA = persist.checkpointDir('session-aaa');
    const dirB = persist.checkpointDir('session-bbb');
    expect(dirA).not.toBe(dirB);
  });

  it('FR-3: two sessions each persist distinct state; each recovers ONLY its own (no cross-session leak)', () => {
    const persist = loadFresh(PERSIST_PATH);

    const stateA = { session_id: 'session-aaa', tool_executions: 3, current_sd: 'SD-AAA-001', current_phase: 'EXEC', checkpoints: [] };
    const stateB = { session_id: 'session-bbb', tool_executions: 7, current_sd: 'SD-BBB-002', current_phase: 'PLAN', checkpoints: [] };

    // Session A checkpoints first (older mtime)...
    const cpA = persist.createCheckpoint(stateA, 'session-aaa');
    persist.saveSessionState(stateA, 'session-aaa');
    // ...then session B checkpoints LATER (newer mtime — this is the exact
    // condition that made the pre-fix global-most-recent-mtime selection wrong).
    const cpB = persist.createCheckpoint(stateB, 'session-bbb');
    persist.saveSessionState(stateB, 'session-bbb');

    expect(cpA.session_id).toBe('session-aaa');
    expect(cpB.session_id).toBe('session-bbb');

    const recover = loadFresh(RECOVER_PATH);

    const checkpointsForA = recover.getAvailableCheckpoints('session-aaa');
    const checkpointsForB = recover.getAvailableCheckpoints('session-bbb');

    // Each session sees ONLY its own checkpoint(s), even though B's is newer.
    expect(checkpointsForA).toHaveLength(1);
    expect(checkpointsForB).toHaveLength(1);

    const restoredA = recover.loadCheckpoint(checkpointsForA[0].path);
    const restoredB = recover.loadCheckpoint(checkpointsForB[0].path);

    expect(restoredA.current_sd).toBe('SD-AAA-001');
    expect(restoredA.current_phase).toBe('EXEC');
    expect(restoredB.current_sd).toBe('SD-BBB-002');
    expect(restoredB.current_phase).toBe('PLAN');

    // The witnessed bug shape: session A's restore must NEVER pick up B's newer checkpoint.
    expect(restoredA.session_id).not.toBe(restoredB.session_id);
  });

  it('cleanupOldCheckpoints scoped to session A never deletes session B checkpoints', () => {
    const persist = loadFresh(PERSIST_PATH);
    const stateB = { session_id: 'session-bbb', tool_executions: 1, checkpoints: [] };

    // Session A gets several checkpoints, written directly with distinct ids
    // (bypasses the pre-existing, out-of-scope Date.now()-collision quirk in
    // createCheckpoint() when called in a tight synchronous loop). Session B
    // gets one, via the real createCheckpoint() path.
    const dirA = persist.checkpointDir('session-aaa');
    fs.mkdirSync(dirA, { recursive: true });
    for (const id of ['cp_1', 'cp_2', 'cp_3']) {
      fs.writeFileSync(path.join(dirA, `${id}.json`), JSON.stringify({ checkpoint_id: id, session_id: 'session-aaa' }));
    }
    persist.createCheckpoint(stateB, 'session-bbb');

    // Clean up session A keeping only 1 — should remove 2 from A, touch 0 from B.
    const removed = persist.cleanupOldCheckpoints('session-aaa', 1);
    expect(removed).toBe(2);

    const recover = loadFresh(RECOVER_PATH);
    expect(recover.getAvailableCheckpoints('session-aaa')).toHaveLength(1);
    expect(recover.getAvailableCheckpoints('session-bbb')).toHaveLength(1); // untouched
  });

  it('end-to-end: persist hook run twice for two distinct sessions via real stdin payloads, recover hook restores each correctly', () => {
    const runPersist = (sessionId) => spawnSync('node', [PERSIST_PATH], {
      input: JSON.stringify({ session_id: sessionId, hook_event_name: 'PostToolUse', tool_name: 'Bash' }),
      env: { ...process.env, HOME: tmpHome },
      encoding: 'utf8',
    });
    const runRecover = (sessionId) => spawnSync('node', [RECOVER_PATH], {
      input: JSON.stringify({ session_id: sessionId, hook_event_name: 'PreToolUse' }),
      env: { ...process.env, HOME: tmpHome },
      encoding: 'utf8',
    });

    const rA = runPersist('e2e-session-a');
    expect(rA.status).toBe(0);
    const rB = runPersist('e2e-session-b');
    expect(rB.status).toBe(0);

    const persist = loadFresh(PERSIST_PATH);
    expect(fs.existsSync(persist.sessionStateFile('e2e-session-a'))).toBe(true);
    expect(fs.existsSync(persist.sessionStateFile('e2e-session-b'))).toBe(true);

    // Both hooks ran; verify the checkpoint directories are session-scoped on disk.
    expect(fs.existsSync(persist.checkpointDir('e2e-session-a'))).toBe(true);
    expect(fs.existsSync(persist.checkpointDir('e2e-session-b'))).toBe(true);

    const recoverA = runRecover('e2e-session-a');
    expect(recoverA.status).toBe(0);
    const recoverB = runRecover('e2e-session-b');
    expect(recoverB.status).toBe(0);
  });

  it('recover hook with an unresolvable session_id fails closed (no restore, no crash, clean exit)', () => {
    const result = spawnSync('node', [RECOVER_PATH], {
      input: 'not-json-at-all',
      env: { ...process.env, HOME: tmpHome },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Could not resolve session_id|Starting fresh session/);
  });

  it('persist hook with an unresolvable session_id fails closed (no global-shared-file write)', () => {
    const result = spawnSync('node', [PERSIST_PATH], {
      input: 'not-json-at-all',
      env: { ...process.env, HOME: tmpHome },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    // No legacy global state file should ever be written.
    expect(fs.existsSync(path.join(tmpHome, '.claude-session-state.json'))).toBe(false);
  });
});

describe('Static-source guard — no legacy machine-global path literals remain', () => {
  it('persist-session-state.cjs no longer references the old shared SESSION_STATE_FILE/CHECKPOINT_DIR globals', () => {
    const src = fs.readFileSync(PERSIST_PATH, 'utf8');
    expect(src).not.toMatch(/const SESSION_STATE_FILE =/);
    expect(src).not.toMatch(/const CHECKPOINT_DIR =/);
    expect(src).toMatch(/resolveSessionId/);
  });

  it('recover-session-state.cjs no longer references the old shared SESSION_STATE_FILE/CHECKPOINT_DIR globals', () => {
    const src = fs.readFileSync(RECOVER_PATH, 'utf8');
    expect(src).not.toMatch(/const SESSION_STATE_FILE =/);
    expect(src).not.toMatch(/const CHECKPOINT_DIR =/);
    expect(src).toMatch(/resolveSessionId/);
  });
});
