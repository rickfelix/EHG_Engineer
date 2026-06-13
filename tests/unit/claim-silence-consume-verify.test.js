/**
 * SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001 — CONSUME-side armed-silence pins.
 * A parked /loop worker arms claude_sessions.expected_silence_until; every peer-release reader
 * must honor a within-cap window so a legitimately-silent holder is never reaped mid-silence.
 * Seams: (1) lib/claim-validity-gate.js assertValidClaim orphan-release, (2) coordinator-cold-
 * recovery isSessionStale. Shared predicate: lib/fleet/silence-cap.cjs isWithinArmedSilenceWindow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const { isWithinArmedSilenceWindow, SILENCE_HARD_CAP_MS } = require('../../lib/fleet/silence-cap.cjs');
const NOW = 1_700_000_000_000;
const iso = (ms) => new Date(ms).toISOString();

describe('isWithinArmedSilenceWindow — shared CONSUME-side predicate (FR-3)', () => {
  it('future + within-cap → true', () => {
    expect(isWithinArmedSilenceWindow(iso(NOW + 10 * 60 * 1000), NOW)).toBe(true);
  });
  it('exactly at the cap boundary → true (<= cap)', () => {
    expect(isWithinArmedSilenceWindow(iso(NOW + SILENCE_HARD_CAP_MS), NOW)).toBe(true);
  });
  it('1ms beyond the cap → false', () => {
    expect(isWithinArmedSilenceWindow(iso(NOW + SILENCE_HARD_CAP_MS + 1), NOW)).toBe(false);
  });
  it('expired (past) → false', () => {
    expect(isWithinArmedSilenceWindow(iso(NOW - 1), NOW)).toBe(false);
  });
  it('null / undefined / unparseable → false (fail toward release)', () => {
    expect(isWithinArmedSilenceWindow(null, NOW)).toBe(false);
    expect(isWithinArmedSilenceWindow(undefined, NOW)).toBe(false);
    expect(isWithinArmedSilenceWindow('not-a-date', NOW)).toBe(false);
  });
});

describe('sweep parity — helper matches stale-session-sweep inline formula (FR-3c)', () => {
  // Byte-equivalent replica of scripts/stale-session-sweep.cjs evaluateSourceSideSignals (L654-659).
  const sweepInline = (esu, nowMs) => {
    if (!esu) return false;
    const endMs = Date.parse(esu);
    const deltaMs = endMs - nowMs;
    return deltaMs > 0 && deltaMs <= SILENCE_HARD_CAP_MS;
  };
  const cases = [null, 'garbage', iso(NOW - 5000), iso(NOW + 1000), iso(NOW + 10 * 60 * 1000),
    iso(NOW + SILENCE_HARD_CAP_MS), iso(NOW + SILENCE_HARD_CAP_MS + 1), iso(NOW + 60 * 60 * 1000)];
  it('agrees with the sweep across the full matrix (writer<=reader parity, same cap constant)', () => {
    for (const c of cases) {
      expect(isWithinArmedSilenceWindow(c, NOW)).toBe(sweepInline(c, NOW));
    }
    expect(SILENCE_HARD_CAP_MS).toBe(30 * 60 * 1000);
  });
});

describe('coordinator-cold-recovery isSessionStale — SEAM 2 (FR-2)', () => {
  const { __test__ } = require('../../scripts/coordinator-cold-recovery.cjs');
  const isSessionStale = (__test__ && __test__.isSessionStale) || require('../../scripts/coordinator-cold-recovery.cjs').isSessionStale;
  const TTL = 15 * 60 * 1000;
  it('within-cap silenced holder (lapsed heartbeat) → NOT stale', () => {
    const row = { status: 'active', heartbeat_at: iso(NOW - 60 * 60 * 1000), expected_silence_until: iso(NOW + 10 * 60 * 1000) };
    expect(isSessionStale(row, NOW, TTL)).toBe(false);
  });
  it('expired silence + old heartbeat → stale (today behavior, no regression)', () => {
    const row = { status: 'active', heartbeat_at: iso(NOW - 60 * 60 * 1000), expected_silence_until: iso(NOW - 1000) };
    expect(isSessionStale(row, NOW, TTL)).toBe(true);
  });
  it('explicit terminal status → stale even if silence is armed (silence never resurrects)', () => {
    const row = { status: 'released', heartbeat_at: iso(NOW), expected_silence_until: iso(NOW + 10 * 60 * 1000) };
    expect(isSessionStale(row, NOW, TTL)).toBe(true);
  });
  it('no silence + fresh heartbeat → not stale', () => {
    expect(isSessionStale({ status: 'active', heartbeat_at: iso(NOW - 60 * 1000) }, NOW, TTL)).toBe(false);
  });
});

// ── SEAM 1: assertValidClaim (FR-1, PRIMARY) ───────────────────────────────
vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, realpathSync: vi.fn((p) => p), existsSync: vi.fn(() => false), readdirSync: vi.fn(() => []) };
});
vi.mock('../../lib/resolve-own-session.js', () => ({ resolveOwnSession: vi.fn() }));

const { resolveOwnSession } = await import('../../lib/resolve-own-session.js');
const { assertValidClaim, ClaimIdentityError } = await import('../../lib/claim-validity-gate.js');

const SDKEY = 'SD-SILENCE-TEST-001';
function fakeSupabase({ owner, onRelease }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: { sd_key: SDKEY, claiming_session_id: 'foreign-session', worktree_path: null, current_phase: 'EXEC' }, error: null }) }) }),
          update: () => ({ eq: () => ({ eq: async () => { onRelease(); return { error: null }; } }) }),
        };
      }
      if (table === 'claude_sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: owner, error: null }) }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };
}

describe('assertValidClaim — SEAM 1 orphan-release honors armed silence (FR-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'my-session', metadata: {} } });
  });

  it('dead-looking foreign holder WITHIN an armed silence window → throws foreign_claim, NO release', async () => {
    let released = false;
    const sb = fakeSupabase({
      owner: { status: 'stale', is_alive: false, sd_key: SDKEY, expected_silence_until: iso(Date.now() + 10 * 60 * 1000) },
      onRelease: () => { released = true; },
    });
    await expect(assertValidClaim(sb, SDKEY, { operation: 'handoff' }))
      .rejects.toMatchObject({ reason: 'foreign_claim' });
    expect(released).toBe(false); // the LIVE silenced claim was NOT cleared
  });

  it('dead foreign holder with EXPIRED silence → releases as today (no regression)', async () => {
    let released = false;
    const sb = fakeSupabase({
      owner: { status: 'stale', is_alive: false, sd_key: SDKEY, expected_silence_until: iso(Date.now() - 1000) },
      onRelease: () => { released = true; },
    });
    const res = await assertValidClaim(sb, SDKEY, { operation: 'handoff' });
    expect(released).toBe(true);
    expect(res.ownership).toBe('unclaimed');
  });
});

// ── SEAM: claimGuard stale-release (adversarial-review finding #2) ──────────
// claimGuard is a heavy multi-query acquisition path (db-clock, terminal detection); the silence
// DECISION logic is isWithinArmedSilenceWindow (behaviorally pinned above). A source-contract pin
// (same pattern as claim-validity-gate-sd-key-drift.test.js) guarantees the guard is wired: import,
// SELECT column, a claimed_by_silenced_session HARD-STOP, and that it precedes the release reap.
describe('claim-guard.mjs — stale-release honors armed silence (source-contract)', () => {
  const cg = readFileSync(resolve(__dirname, '../..', 'lib/claim-guard.mjs'), 'utf8');
  it('imports isWithinArmedSilenceWindow from the shared silence-cap module', () => {
    expect(cg).toMatch(/import\s*\{\s*isWithinArmedSilenceWindow\s*\}\s*from\s*['"]\.\/fleet\/silence-cap\.cjs['"]/);
  });
  it('enriches the claim row with expected_silence_until', () => {
    expect(cg).toMatch(/expected_silence_until/);
    expect(cg).toMatch(/\.select\(['"][^'"]*heartbeat_at[^'"]*expected_silence_until[^'"]*['"]\)/);
  });
  it('HARD-STOPs with claimed_by_silenced_session when the holder is within an armed window', () => {
    expect(cg).toMatch(/isWithinArmedSilenceWindow\(\s*claim\.expected_silence_until/);
    expect(cg).toMatch(/claimed_by_silenced_session/);
  });
  it('the silence HARD-STOP precedes the stale-release PID path (never releases a silenced holder)', () => {
    // Anchor on the stale-release path marker (release_sd appears on several paths; this pins the
    // Case-2 stale-release path specifically). The silence HARD-STOP must come before it.
    const silenceIdx = cg.indexOf('claimed_by_silenced_session');
    const stalePathIdx = cg.indexOf('check PID liveness before releasing');
    expect(silenceIdx).toBeGreaterThan(-1);
    expect(stalePathIdx).toBeGreaterThan(-1);
    expect(silenceIdx).toBeLessThan(stalePathIdx);
  });
});
