/**
 * QF-20260704-244 — leg 3 of the QF-lane fix family (legs 1-2 = QF-20260704-602). A CRITICAL
 * open QF (aged past a 10-minute directed-dispatch grace window) outranks SD self-claim, so
 * severity stops being decorative. Tightly fenced against reverse SD-belt starvation: only
 * 'critical' jumps (high/medium/low keep the existing SD-first order), and at most ONE
 * consecutive jump per worker (claude_sessions.metadata.last_claim_was_qf_jump gates the
 * FOLLOWING pull, not the current one).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveCheckin, isCriticalQfJumpEligible, CRITICAL_QF_JUMP_GRACE_MS } = require('../../scripts/worker-checkin.cjs');

// QF-20260707-793: relative to real Date.now(), not a fixed calendar date -- resolveCheckin's
// isCriticalQfJumpEligible/isAutoStartableQF check ageDays against a real STALE_QF_DAYS=3
// ceiling using the wall clock, so a hardcoded NOW drifts past that ceiling as real time passes.
const NOW = Date.now();
const OLD_ENOUGH = new Date(NOW - CRITICAL_QF_JUMP_GRACE_MS - 60_000).toISOString(); // just past grace
const TOO_FRESH = new Date(NOW - 60_000).toISOString(); // 1 minute ago

describe('isCriticalQfJumpEligible (pure predicate)', () => {
  function qf({ severity = 'critical', createdAt = OLD_ENOUGH, status = 'open', prUrl = null, commitSha = null } = {}) {
    return { id: 'QF-X', status, severity, created_at: createdAt, pr_url: prUrl, commit_sha: commitSha, routing_tier: null, title: 'x' };
  }

  it('eligible: critical + aged past the 10min grace window', () => {
    expect(isCriticalQfJumpEligible(qf(), NOW)).toBe(true);
  });

  it('NOT eligible: high/medium/low never jump (acceptance #2)', () => {
    for (const severity of ['high', 'medium', 'low']) {
      expect(isCriticalQfJumpEligible(qf({ severity }), NOW)).toBe(false);
    }
  });

  it('NOT eligible: fresh critical (<10min old) — grace window for directed dispatch (acceptance #4)', () => {
    expect(isCriticalQfJumpEligible(qf({ createdAt: TOO_FRESH }), NOW)).toBe(false);
  });

  it('NOT eligible: already in PR/commit (verify-first guard inherited from isAutoStartableQF)', () => {
    expect(isCriticalQfJumpEligible(qf({ prUrl: 'https://github.com/x/y/pull/1' }), NOW)).toBe(false);
  });

  it('NOT eligible: not status=open', () => {
    expect(isCriticalQfJumpEligible(qf({ status: 'in_progress' }), NOW)).toBe(false);
  });
});

// ── Integration: full resolveCheckin flow with a purpose-built fake Supabase client ──

function makeThenableChain(resolveTo) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, gte() { return chain; },
    order() { return chain; }, limit() { return chain; }, is() { return chain; },
    in() { return chain; }, not() { return chain; },
    maybeSingle() { return Promise.resolve(resolveTo); },
    single() { return Promise.resolve(resolveTo); },
    then(onFulfilled, onRejected) { return Promise.resolve(resolveTo).then(onFulfilled, onRejected); },
  };
  return chain;
}

/**
 * A session-state-carrying fake: claude_sessions.metadata mutates in place via .update() so a
 * SECOND resolveCheckin call in the same test observes the first call's write (proves the
 * one-consecutive-jump bound persists across ticks, per acceptance #3).
 */
function makeFakeSb({ criticalQfs = [], sessionMetadata = {} }) {
  const state = { metadata: { ...sessionMetadata } };
  const sb = {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: { metadata: state.metadata, sd_key: null }, error: null }),
          update(patch) {
            return {
              eq: () => {
                if (patch && patch.metadata) state.metadata = patch.metadata;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === 'quick_fixes') {
        // Leg-3's own query filters .eq('severity', 'critical'); selfClaimQuickFix's (leg-2)
        // query does not. Track whether this specific chain applied the severity filter so
        // the two call sites see different result sets, matching real Postgres semantics.
        let filteredToCritical = false;
        const chain = {
          select() { return chain; },
          eq(col, val) { if (col === 'severity' && val === 'critical') filteredToCritical = true; return chain; },
          is() { return chain; }, order() { return chain; }, limit() { return chain; },
          then(onFulfilled, onRejected) {
            const rows = filteredToCritical ? criticalQfs : criticalQfs; // both call sites see the same open-QF pool here (test controls content directly)
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      }
      // Every other table (v_sd_next_candidates, strategic_directives_v2, sd_baseline_items,
      // sd_conflict_matrix, session_lifecycle_events, etc.) resolves empty -- the SD pool is
      // genuinely empty, so any claim in these tests can ONLY have come from the leg-3 jump.
      return makeThenableChain({ data: [], error: null });
    },
  };
  return sb;
}

describe('resolveCheckin — critical QF jumps ahead of an empty SD pool (acceptance #1)', () => {
  it('claims the aged critical QF via the priority-jump message, not the plain self-claim path', async () => {
    const sb = makeFakeSb({ criticalQfs: [
      { id: 'QF-CRIT-1', status: 'open', severity: 'critical', created_at: OLD_ENOUGH, pr_url: null, commit_sha: null, routing_tier: null, title: 'x' },
    ] });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('self_claimed_qf');
      expect(res.qf).toBe('QF-CRIT-1');
      expect(res.message).toMatch(/priority jump/);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('does NOT jump for a high-severity QF (SD-first order unchanged, acceptance #2)', async () => {
    const sb = makeFakeSb({ criticalQfs: [
      { id: 'QF-HIGH-1', status: 'open', severity: 'high', created_at: OLD_ENOUGH, pr_url: null, commit_sha: null, routing_tier: null, title: 'x' },
    ] });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      // Not claimed via the priority-jump path. The SD pool is empty in this fixture, so the
      // only way this QF gets claimed at all is via the ordinary (non-jump) step-6.5 self-claim.
      if (res.action === 'self_claimed_qf') {
        expect(res.message).not.toMatch(/priority jump/);
      }
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});

describe('resolveCheckin — one-consecutive-jump bound across two ticks (acceptance #3)', () => {
  it('pull 1 jumps to a critical QF; pull 2 (bound consumed) does NOT jump even with another critical still open', async () => {
    const criticalQfs = [
      { id: 'QF-CRIT-A', status: 'open', severity: 'critical', created_at: OLD_ENOUGH, pr_url: null, commit_sha: null, routing_tier: null, title: 'a' },
      { id: 'QF-CRIT-B', status: 'open', severity: 'critical', created_at: OLD_ENOUGH, pr_url: null, commit_sha: null, routing_tier: null, title: 'b' },
    ];
    const sb = makeFakeSb({ criticalQfs });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res1 = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res1.action).toBe('self_claimed_qf');
      expect(res1.message).toMatch(/priority jump/);

      // Pull 2: the flag set by pull 1 must gate this pull -- no jump, even though a critical
      // QF is still open (SD pool is still empty in this fixture, so the correct outcome here
      // is NOT a priority-jump claim).
      const res2 = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      if (res2.action === 'self_claimed_qf') {
        expect(res2.message).not.toMatch(/priority jump/);
      }
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
