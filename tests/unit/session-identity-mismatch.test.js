/**
 * SD-FDBK-INFRA-HARNESS-F22-STALE-001 — detectEnvAmbientMismatch (the F22 guard).
 *
 * Verifies the non-blocking session-id-mismatch detector reads the pid-keyed marker
 * DIRECTLY (the flag-independent ambient source) and compares it to the env
 * CLAUDE_SESSION_ID — flagging a stale/hardcoded "reaped ghost" id, staying silent
 * when sources match or the ambient is unresolvable.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectEnvAmbientMismatch, getIdentityDir } from '../../lib/session-identity-sot.js';

function tmpRepoWithPidMarker(ccPid, sessionId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f22-'));
  const dir = getIdentityDir(root);
  fs.mkdirSync(dir, { recursive: true });
  if (sessionId !== undefined) {
    fs.writeFileSync(path.join(dir, `pid-${ccPid}.json`), JSON.stringify({ session_id: sessionId, cc_pid: ccPid }));
  }
  return root;
}

describe('detectEnvAmbientMismatch (F22 reaped-ghost guard)', () => {
  it('returns mismatch when env CLAUDE_SESSION_ID differs from the pid-marker ambient', () => {
    const root = tmpRepoWithPidMarker(12345, 'AMBIENT-uuid');
    const r = detectEnvAmbientMismatch({ ccPid: 12345, env: { CLAUDE_SESSION_ID: 'STALE-uuid' }, repoRoot: root });
    expect(r).toEqual({ mismatch: true, envId: 'STALE-uuid', ambientId: 'AMBIENT-uuid' });
  });

  it('returns null (silent) when env matches the ambient', () => {
    const root = tmpRepoWithPidMarker(12345, 'SAME-uuid');
    expect(detectEnvAmbientMismatch({ ccPid: 12345, env: { CLAUDE_SESSION_ID: 'SAME-uuid' }, repoRoot: root })).toBeNull();
  });

  it('returns null (silent) when no pid marker exists (ambient unresolvable)', () => {
    const root = tmpRepoWithPidMarker(99999, undefined); // dir exists, no pid-12345 marker
    expect(detectEnvAmbientMismatch({ ccPid: 12345, env: { CLAUDE_SESSION_ID: 'X' }, repoRoot: root })).toBeNull();
  });

  it('returns null when env unset or ccPid missing (non-blocking, no false positive)', () => {
    expect(detectEnvAmbientMismatch({ ccPid: 1, env: {} })).toBeNull();
    expect(detectEnvAmbientMismatch({ env: { CLAUDE_SESSION_ID: 'X' } })).toBeNull();
  });
});
