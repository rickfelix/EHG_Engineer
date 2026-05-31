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

describe('checkBranchFreshness (QF-20260511-228 — closes feedback acd4e5ab)', () => {
  // Early-return paths don't shell out, so they're safe to exercise behaviorally.
  // The git-touching path is asserted via static-guard at the bottom of this block.
  let checkBranchFreshness;
  beforeEach(() => { ({ checkBranchFreshness } = loadHookExports()); });

  it('no longer early-returns on "main" (QF-20260531-948: the defect that hid stale local main)', () => {
    // 'main' used to early-return null, so a stale main was never warned. The guard now only
    // skips empty/unknown branches; 'main' falls through to the fetch-first check.
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    const fnStart = src.indexOf('function checkBranchFreshness(');
    const guard = src.slice(fnStart, fnStart + 200);
    expect(guard).toMatch(/if \(!branch \|\| branch === 'unknown'\) return null;/);
    expect(guard).not.toMatch(/branch === 'main'/);
  });
  it('returns null when branch is "unknown" (getBranch fallback)', () => {
    expect(checkBranchFreshness('unknown')).toBeNull();
  });
  it('returns null for empty/missing branch', () => {
    expect(checkBranchFreshness('')).toBeNull();
    expect(checkBranchFreshness(undefined)).toBeNull();
    expect(checkBranchFreshness(null)).toBeNull();
  });

  it('static-guard: hook source fetches origin/main FIRST, then rev-list at threshold default 1', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    // QF-20260531-948 defect #2: must fetch the origin/main ref BEFORE counting, else the count
    // is vs a stale ref. Fail-open with a hard timeout so SessionStart is never blocked.
    expect(src).toMatch(/git fetch --quiet --no-tags origin main/);
    expect(src).toMatch(/timeout:\s*4000/);
    // Counts against origin/main (not main, not @{upstream})
    expect(src).toMatch(/git rev-list --count HEAD\.\.origin\/main/);
    // Threshold configurable via STALE_BRANCH_WARN_THRESHOLD, default now 1 (was 10 — defect #3)
    expect(src).toMatch(/STALE_BRANCH_WARN_THRESHOLD\b/);
    expect(src).toMatch(/\|\|\s*['"]1['"]/);
    // Loud warning banner must be emitted
    expect(src).toMatch(/STALE BRANCH WARNING/);
    // Telemetry event name must match dotted convention used elsewhere
    expect(src).toMatch(/session\.stale_branch_warning/);
  });

  it('static-guard: main() runs checkBranchFreshness BEFORE the worktree + supabase bails', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    // QF-20260531-948 defects #4/#5: the call must precede both bails so it fires on main and
    // inside worktrees regardless of DB availability.
    const callIdx = src.indexOf('checkBranchFreshness(getBranch())');
    expect(callIdx).toBeGreaterThan(0);
    const worktreeBailIdx = src.indexOf('if (isInsideWorktree()) {');
    const supabaseBailIdx = src.indexOf('if (!supabase) {');
    expect(worktreeBailIdx).toBeGreaterThan(callIdx);
    expect(supabaseBailIdx).toBeGreaterThan(callIdx);
  });
});

describe('unlinkNodeModulesJunction (f4028ef8 — pre-unlink before git worktree remove)', () => {
  let unlinkNodeModulesJunction;
  beforeEach(() => { ({ unlinkNodeModulesJunction } = loadHookExports()); });

  // Build a worktree whose node_modules is a link to a shared target
  // (junction on Windows, symlink on POSIX) — the shape that bricks the shared
  // store when git follows it during `worktree remove --force`.
  function makeWtWithLinkedNm() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nm-'));
    const shared = path.join(root, 'shared_node_modules');
    fs.mkdirSync(shared);
    fs.writeFileSync(path.join(shared, 'sentinel.txt'), 'keep me');
    const wt = path.join(root, 'wt');
    fs.mkdirSync(wt);
    const nm = path.join(wt, 'node_modules');
    fs.symlinkSync(shared, nm, process.platform === 'win32' ? 'junction' : 'dir');
    return { root, shared, wt, nm };
  }

  it('unlinks a node_modules junction and leaves the shared target intact', () => {
    const { root, shared, wt, nm } = makeWtWithLinkedNm();
    try {
      unlinkNodeModulesJunction(wt);
      expect(fs.existsSync(nm)).toBe(false);                                // link removed
      expect(fs.existsSync(path.join(shared, 'sentinel.txt'))).toBe(true);  // target preserved
    } finally { cleanupTemp(root); }
  });

  it('does NOT touch a real (isolated) node_modules directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nm-'));
    const nm = path.join(root, 'wt', 'node_modules');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(path.join(nm, 'pkg.txt'), 'real dep');
    try {
      unlinkNodeModulesJunction(path.join(root, 'wt'));
      expect(fs.existsSync(path.join(nm, 'pkg.txt'))).toBe(true);           // real dir untouched
    } finally { cleanupTemp(root); }
  });

  it('is a no-op when node_modules is absent (does not throw)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nm-'));
    const wt = path.join(root, 'wt');
    fs.mkdirSync(wt);
    try {
      expect(() => unlinkNodeModulesJunction(wt)).not.toThrow();
    } finally { cleanupTemp(root); }
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

// ─── QF-20260531-948: stale-main freshness repair ────────────────────────────
// The decision (warn vs none) is extracted as a pure function so the threshold
// behaviour is testable without mocking git. The key regression these guard:
// the prior hook warned only when behind > 10, so the common "a few commits
// behind origin/main" case (e.g. 6 behind, witnessed) passed SILENTLY and
// already-shipped code read as "missing".
describe('decideFreshnessAction (QF-20260531-948 stale-main repair)', () => {
  let decideFreshnessAction;
  beforeEach(() => { ({ decideFreshnessAction } = loadHookExports()); });

  it('warns at the default threshold of 1 (1–9 behind used to pass silently)', () => {
    expect(decideFreshnessAction(1, 1)).toBe('warn');
    expect(decideFreshnessAction(6, 1)).toBe('warn'); // the exact case witnessed this session
  });

  it('does not warn when up to date', () => {
    expect(decideFreshnessAction(0, 1)).toBe('none');
  });

  it('honors a custom higher threshold via STALE_BRANCH_WARN_THRESHOLD', () => {
    expect(decideFreshnessAction(3, 5)).toBe('none');
    expect(decideFreshnessAction(5, 5)).toBe('warn');
  });

  it('returns none for a non-finite count (git failure path)', () => {
    expect(decideFreshnessAction(NaN, 1)).toBe('none');
  });
});
