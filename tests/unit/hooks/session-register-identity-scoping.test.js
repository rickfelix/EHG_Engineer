/**
 * Unit tests for scripts/hooks/session-register.cjs::getCurrentSessionId
 * SD-LEO-INFRA-FIX-SESSION-REGISTER-001 (Layer 1)
 *
 * RCA 2026-07-12: getCurrentSessionId() previously picked the most-recently
 * -modified file under .claude/session-identity/*.json with NO hostname/pid
 * scoping whenever CLAUDE_SESSION_ID was unset (the normal case for
 * SessionStart:compact). That let one session's compact-hook read an
 * unrelated session's marker and smear its own identity onto that foreign
 * session_id. The fix delegates to lib/hooks/session-id.cjs::resolveSessionId,
 * which checks stdin, then env, then a PID-SCOPED marker (not mtime-newest)
 * before ever falling back to the old unscoped heuristic.
 *
 * These tests exercise the REAL resolveSessionId (via its documented test
 * override env vars, QF297_MARKER_DIR_OVERRIDE / QF297_CCPID_OVERRIDE)
 * rather than mocking it: session-register.cjs and lib/hooks/session-id.cjs
 * are both native CJS modules loaded via createRequire, so vi.mock cannot
 * intercept the nested require() between them -- exercising the real
 * resolution chain is both necessary and the stronger test.
 *
 * Requiring scripts/hooks/session-register.cjs must NOT trigger main()'s live
 * Supabase call (guarded by `if (require.main === module)`); these tests rely
 * on that guard to safely import getCurrentSessionId.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

describe('session-register.cjs require-time safety', () => {
  it('does not export an empty object (main() must not have fired at require time)', () => {
    const mod = require('../../../scripts/hooks/session-register.cjs');
    expect(typeof mod.getCurrentSessionId).toBe('function');
    expect(typeof mod.main).toBe('function');
  });
});

describe('getCurrentSessionId (SD-LEO-INFRA-FIX-SESSION-REGISTER-001 FR-1)', () => {
  const { getCurrentSessionId } = require('../../../scripts/hooks/session-register.cjs');

  let tmpMarkerDir;
  const savedEnv = {};
  const ENV_KEYS = ['CLAUDE_SESSION_ID', 'QF297_MARKER_DIR_OVERRIDE', 'QF297_CCPID_OVERRIDE', 'QF749_DISABLE_NULL_LOG'];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.QF297_MARKER_DIR_OVERRIDE;
    delete process.env.QF297_CCPID_OVERRIDE;
    process.env.QF749_DISABLE_NULL_LOG = '1'; // silence the diagnostic canary during tests
    tmpMarkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-register-marker-test-'));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (tmpMarkerDir && fs.existsSync(tmpMarkerDir)) {
      try { fs.rmSync(tmpMarkerDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  it('returns CLAUDE_SESSION_ID when set, without touching any marker file', async () => {
    process.env.CLAUDE_SESSION_ID = 'own-session-abc';
    const result = await getCurrentSessionId();
    expect(result).toBe('own-session-abc');
  });

  it('regression: a PID-scoped marker wins over a foreign most-recently-modified marker', async () => {
    // This is the exact fixed scenario: a foreign session's marker is the
    // newest by mtime, but this process's own pid-<ccPid>.json marker must
    // still be the one returned -- proving recency alone can no longer win.
    process.env.QF297_MARKER_DIR_OVERRIDE = tmpMarkerDir;
    process.env.QF297_CCPID_OVERRIDE = 'own-pid-111';

    fs.writeFileSync(
      path.join(tmpMarkerDir, 'pid-own-pid-111.json'),
      JSON.stringify({ session_id: 'own-session-id' })
    );
    // Written after the own-pid marker, so it is strictly newer by mtime.
    fs.writeFileSync(
      path.join(tmpMarkerDir, 'pid-foreign-pid-222.json'),
      JSON.stringify({ session_id: 'foreign-session-id' })
    );

    const result = await getCurrentSessionId();
    expect(result).toBe('own-session-id');
    expect(result).not.toBe('foreign-session-id');
  });

  it('falls back to the mtime-newest marker only when this process has no marker of its own (documented residual tier, unaffected by this fix)', async () => {
    process.env.QF297_MARKER_DIR_OVERRIDE = tmpMarkerDir;
    process.env.QF297_CCPID_OVERRIDE = 'own-pid-with-no-marker';

    fs.writeFileSync(
      path.join(tmpMarkerDir, 'pid-someone-else.json'),
      JSON.stringify({ session_id: 'only-marker-present' })
    );

    const result = await getCurrentSessionId();
    expect(result).toBe('only-marker-present');
  });
});
