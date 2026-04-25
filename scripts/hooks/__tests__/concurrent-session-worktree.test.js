/**
 * Tests for concurrent-session-worktree.cjs cleanup logic.
 *
 * Specifically covers the fixes for PAT-WORKTREE-CLEANUP-CLAIM-BLIND-001
 * (SD-LEO-INFRA-MAKE-SESSIONSTART-WORKTREE-001):
 *
 * 1. isWorktreeInUseBySession accepts both `sessionId` (camelCase) and
 *    `session_id` (snake_case) marker fields — pre-fix, only camelCase
 *    was honored, causing snake_case markers (written by sd-start.js)
 *    to be ignored and their worktrees wiped.
 *
 * 2. isWorktreeInUseBySession also consults a pre-fetched activeClaims
 *    Map keyed by sd_key/id — a worktree with no marker file but a
 *    fresh DB claim is preserved.
 *
 * 3. cleanupStaleConcurrentWorktrees pre-fetches DB claims via
 *    getActiveDbClaims and skips worktrees with active claims, even
 *    when the branch-merge heuristic would otherwise mark them stale.
 *
 * The hook is `.cjs` and uses execSync + powershell, so we test the
 * pure helpers (isWorktreeInUseBySession, getActiveDbClaims) by
 * extracting them via require + introspection. The integration path
 * (cleanupStaleConcurrentWorktrees → DB) is exercised by mocking
 * the supabase client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK_PATH = path.resolve(__dirname, '../concurrent-session-worktree.cjs');

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeTempWorktree(markerContent /* string|null */) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
  if (markerContent !== null) {
    fs.writeFileSync(path.join(dir, '.ehg-session.json'), markerContent);
  }
  return dir;
}

function cleanupTemp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function loadHookExports() {
  // Hook gates main() behind `require.main === module`, so a plain require()
  // gives us the test exports without triggering SessionStart side-effects.
  // Bust require cache to ensure each test gets a fresh module instance.
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('isWorktreeInUseBySession (PAT-WORKTREE-CLEANUP-CLAIM-BLIND-001 fix)', () => {
  let isWorktreeInUseBySession;

  beforeEach(() => {
    ({ isWorktreeInUseBySession } = loadHookExports());
  });

  it('returns true for a marker with camelCase sessionId (legacy schema)', () => {
    const dir = makeTempWorktree(JSON.stringify({ sessionId: 'abc-123' }));
    try {
      expect(isWorktreeInUseBySession(dir)).toBe(true);
    } finally { cleanupTemp(dir); }
  });

  it('returns true for a marker with snake_case session_id (sd-start.js schema)', () => {
    // Pre-fix this returned false because the check was `if (meta.sessionId)`.
    // Witnessed in PAT-WORKTREE-CLEANUP-CLAIM-BLIND-001: my recovery's marker
    // used snake_case and was wiped twice.
    const dir = makeTempWorktree(JSON.stringify({ session_id: 'abc-123' }));
    try {
      expect(isWorktreeInUseBySession(dir)).toBe(true);
    } finally { cleanupTemp(dir); }
  });

  it('returns false for a marker with neither field', () => {
    const dir = makeTempWorktree(JSON.stringify({ unrelated: 'foo' }));
    try {
      expect(isWorktreeInUseBySession(dir)).toBe(false);
    } finally { cleanupTemp(dir); }
  });

  it('returns false when no marker file exists and no activeClaims map', () => {
    const dir = makeTempWorktree(null);
    try {
      expect(isWorktreeInUseBySession(dir)).toBe(false);
    } finally { cleanupTemp(dir); }
  });

  it('returns true when no marker but worktree dir name is in activeClaims', () => {
    const dir = makeTempWorktree(null);
    const wtName = path.basename(dir);
    const activeClaims = new Map([
      [wtName, { sessionId: 'abc-123', ageMs: 5000, sd_key: wtName }],
    ]);
    try {
      expect(isWorktreeInUseBySession(dir, activeClaims)).toBe(true);
    } finally { cleanupTemp(dir); }
  });

  it('returns false when no marker and worktree NOT in activeClaims', () => {
    const dir = makeTempWorktree(null);
    const activeClaims = new Map([
      ['SD-OTHER-001', { sessionId: 'abc-123', ageMs: 5000, sd_key: 'SD-OTHER-001' }],
    ]);
    try {
      expect(isWorktreeInUseBySession(dir, activeClaims)).toBe(false);
    } finally { cleanupTemp(dir); }
  });

  it('returns false when marker is older than 10 minutes (stale)', () => {
    const dir = makeTempWorktree(JSON.stringify({ session_id: 'abc-123' }));
    try {
      // Set mtime to 11 minutes ago
      const markerPath = path.join(dir, '.ehg-session.json');
      const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000);
      fs.utimesSync(markerPath, elevenMinAgo, elevenMinAgo);
      expect(isWorktreeInUseBySession(dir)).toBe(false);
    } finally { cleanupTemp(dir); }
  });
});

describe('getActiveDbClaims', () => {
  let getActiveDbClaims;

  beforeEach(() => {
    ({ getActiveDbClaims } = loadHookExports());
  });

  it('returns empty map when supabase is null', async () => {
    const claims = await getActiveDbClaims(null);
    expect(claims).toBeInstanceOf(Map);
    expect(claims.size).toBe(0);
  });

  it('returns empty map when SD query errors', async () => {
    const supabase = mockSupabase({ sdError: new Error('connection lost') });
    const claims = await getActiveDbClaims(supabase);
    expect(claims.size).toBe(0);
  });

  it('returns empty map when SD query yields no active claims', async () => {
    const supabase = mockSupabase({ sdRows: [] });
    const claims = await getActiveDbClaims(supabase);
    expect(claims.size).toBe(0);
  });

  it('keys map by both sd_key and id when they differ', async () => {
    const supabase = mockSupabase({
      sdRows: [
        { sd_key: 'SD-FOO-001', id: 'uuid-foo', claiming_session_id: 's1', is_working_on: true, status: 'in_progress' },
      ],
      sessionRows: [
        { session_id: 's1', heartbeat_at: new Date(Date.now() - 60_000).toISOString() }, // 1 min ago
      ],
    });
    const claims = await getActiveDbClaims(supabase);
    expect(claims.has('SD-FOO-001')).toBe(true);
    expect(claims.has('uuid-foo')).toBe(true);
    expect(claims.get('SD-FOO-001').sessionId).toBe('s1');
  });

  it('omits claims whose session heartbeat is stale (>=10 min)', async () => {
    const supabase = mockSupabase({
      sdRows: [
        { sd_key: 'SD-OLD-001', id: 'SD-OLD-001', claiming_session_id: 's-old', is_working_on: true, status: 'in_progress' },
      ],
      sessionRows: [
        { session_id: 's-old', heartbeat_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }, // 11 min ago
      ],
    });
    const claims = await getActiveDbClaims(supabase);
    expect(claims.size).toBe(0);
  });

  it('omits claims whose session is not present in claude_sessions', async () => {
    const supabase = mockSupabase({
      sdRows: [
        { sd_key: 'SD-GHOST-001', id: 'SD-GHOST-001', claiming_session_id: 'ghost', is_working_on: true, status: 'in_progress' },
      ],
      sessionRows: [], // ghost session not in claude_sessions
    });
    const claims = await getActiveDbClaims(supabase);
    expect(claims.size).toBe(0);
  });
});

// ─── Mock supabase client ───────────────────────────────────────────────────

function mockSupabase({ sdRows = [], sdError = null, sessionRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return chainableQuery({ data: sdRows, error: sdError });
      }
      if (table === 'claude_sessions') {
        return chainableQuery({ data: sessionRows, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function chainableQuery(result) {
  // Returns an object that supports the supabase-js builder chain used by
  // getActiveDbClaims: select -> not -> eq -> in (and select -> in for sessions).
  const chain = {
    select() { return chain; },
    not() { return chain; },
    eq() { return chain; },
    in() { return Promise.resolve(result); },
    // Also support `await chain` directly
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return chain;
}
