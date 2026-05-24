/**
 * SD-FDBK-ENH-SESSION-STATE-SCOPING-001 — canonical session-state resolver.
 *
 * Validates the extracted ~/.claude-sessions mechanism (per-session filename when a
 * registry entry matches process.ppid||pid; legacy fallback otherwise) and the
 * existsSync read-fallback. The ESM named import from the .cjs resolver below also
 * exercises the ESM↔CJS interop the SD relies on (R1).
 *
 * Hermetic: uses CLAUDE_SESSIONS_DIR_OVERRIDE + a tmp project dir; never touches the
 * real ~/.claude-sessions or repo .claude.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getSessionIdForSync,
  getSessionScopedStateFileName,
  getSessionStateFilePath,
  getLegacyStateFilePath,
  resolveStateReadPath,
  LEGACY_STATE_FILE_NAME
} from '../../scripts/hooks/lib/session-state-resolver.cjs';

const MATCH_PID = process.ppid || process.pid; // what getSessionIdForSync matches on

let sessionsDir;
let projectDir;
let savedSessionsOverride;
let savedProjectDir;

function writeSession(file, obj) {
  fs.writeFileSync(path.join(sessionsDir, file), JSON.stringify(obj));
}

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sss-test-'));
  sessionsDir = path.join(base, 'claude-sessions');
  projectDir = path.join(base, 'project');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
  savedSessionsOverride = process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
  savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = sessionsDir;
  process.env.CLAUDE_PROJECT_DIR = projectDir;
});

afterEach(() => {
  if (savedSessionsOverride === undefined) delete process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
  else process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = savedSessionsOverride;
  if (savedProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
});

describe('session-state-resolver (SD-FDBK-ENH-SESSION-STATE-SCOPING-001)', () => {
  it('TS-1: per-session filename when a registry entry matches the PID', () => {
    writeSession('s.json', { pid: MATCH_PID, session_id: 'sess-AAA' });
    expect(getSessionIdForSync()).toBe('sess-AAA');
    expect(getSessionScopedStateFileName()).toBe('unified-session-state.sess-AAA.json');
  });

  it('TS-2: legacy filename when no registry entry matches the PID (byte-identical)', () => {
    writeSession('other.json', { pid: 999999, session_id: 'sess-OTHER' });
    expect(getSessionIdForSync()).toBeNull();
    expect(getSessionScopedStateFileName()).toBe(LEGACY_STATE_FILE_NAME);
  });

  it('TS-3: legacy filename when the sessions registry dir does not exist', () => {
    process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = path.join(projectDir, 'no-such-sessions-dir');
    expect(getSessionScopedStateFileName()).toBe(LEGACY_STATE_FILE_NAME);
  });

  it('TS-4: getSessionStateFilePath builds the scoped absolute path under <project>/.claude', () => {
    writeSession('s.json', { pid: MATCH_PID, session_id: 'sess-BBB' });
    expect(getSessionStateFilePath()).toBe(path.join(projectDir, '.claude', 'unified-session-state.sess-BBB.json'));
  });

  it('TS-5: read-fallback returns the scoped file when it exists on disk', () => {
    writeSession('s.json', { pid: MATCH_PID, session_id: 'sess-CCC' });
    const scoped = path.join(projectDir, '.claude', 'unified-session-state.sess-CCC.json');
    fs.writeFileSync(scoped, '{}');
    expect(resolveStateReadPath()).toBe(scoped);
  });

  it('TS-6: read-fallback returns the legacy file when the scoped file is absent (fresh session)', () => {
    writeSession('s.json', { pid: MATCH_PID, session_id: 'sess-DDD' });
    // scoped filename resolves, but the scoped file was never written
    expect(resolveStateReadPath()).toBe(getLegacyStateFilePath());
  });
});
