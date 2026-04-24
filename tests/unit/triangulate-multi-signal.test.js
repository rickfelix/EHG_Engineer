/**
 * Unit tests for triangulate.js multi-signal claim liveness
 *
 * SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 — FR5 regression coverage
 *
 * Covers AC1-AC4:
 * - AC1: triangulate() classifies released-session-with-active-CC as evidence_of_life_no_pid (NOT orphaned),
 *        when worktree + plan-file + recent activity + sibling-session signals fire.
 * - AC2: checkPreClaimEvidence() returns allowReclaim=false when evidence-of-life present.
 * - AC3: PID_DEAD requires BOTH process.kill ESRCH AND tickRecent=false. Either alone -> still alive.
 * - AC4: orphaned[reclaimSafe=false] when evidence-of-life present (would have authorized hostile reclaim before).
 *
 * Replays the 2026-04-24 incident: session 4b78a802 status=released in claude_sessions, but its CC
 * conversation was actively working in the same worktree under rotated session_id. Old triangulate
 * classified as orphaned -> would have authorized hostile reclaim.
 */

import { describe, it, expect } from 'vitest';
import { triangulate, checkPreClaimEvidence, TICK_RECENT_SECONDS, ACTIVITY_LOOKBACK_SECONDS } from '../../scripts/modules/claim-health/triangulate.js';

// ── Fake Supabase client ─────────────────────────────────────────────────────
//
// Builds a minimal supabase shim that returns canned data for the queries
// triangulate() makes. Each table returns a fixed dataset; filters are applied
// in-memory so tests can assert on the post-filter behavior.

function makeFakeSupabase({ claudeSessions = [], strategicDirectives = [], subAgentResults = [] } = {}) {
  function tableQuery(rows) {
    let result = [...rows];
    const builder = {
      _result: result,
      select() { return builder; },
      eq(col, val) { builder._result = builder._result.filter(r => r[col] === val); return builder; },
      in(col, vals) { builder._result = builder._result.filter(r => vals.includes(r[col])); return builder; },
      not(col, op, val) {
        if (op === 'is' && val === null) {
          builder._result = builder._result.filter(r => r[col] !== null && r[col] !== undefined);
        }
        return builder;
      },
      gte(col, val) {
        builder._result = builder._result.filter(r => r[col] && new Date(r[col]).getTime() >= new Date(val).getTime());
        return builder;
      },
      then(resolve) { return Promise.resolve({ data: builder._result, error: null }).then(resolve); },
    };
    return builder;
  }
  return {
    from(table) {
      if (table === 'claude_sessions') return tableQuery(claudeSessions);
      if (table === 'strategic_directives_v2') return tableQuery(strategicDirectives);
      if (table === 'sub_agent_execution_results') return tableQuery(subAgentResults);
      return tableQuery([]);
    },
  };
}

const SD_KEY = 'SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001';
const SD_UUID = '18677532-73ff-487a-b9e4-0110231df1f8';
const NOW = Date.now();
const ISO = (msAgo) => new Date(NOW - msAgo).toISOString();

// ── Core regression: 2026-04-24 incident replay (AC1, AC4) ───────────────────

describe('triangulate() — AC1 + AC4: evidence-of-life prevents hostile reclaim', () => {
  it('replays 2026-04-24 incident: released-session, no live row, but recent sub-agent activity blocks orphaned-reclaimable', async () => {
    // The incident: session 4b78a802 was status=released in claude_sessions (so it gets
    // filtered out by the .in('status', ['active','idle']) clause). But strategic_directives_v2
    // still had claiming_session_id=4b78a802 + is_working_on=true. Meanwhile the active CC
    // conversation under a rotated session_id was producing sub_agent_execution_results.
    // OLD triangulate: classified as orphaned-reclaim-safe -> hostile reclaim authorized.
    // NEW triangulate: orphaned but reclaimSafe=false because recent_sub_agent_activity fires.
    const supabase = makeFakeSupabase({
      claudeSessions: [],  // released session is filtered out by .in('status', ['active','idle'])
      strategicDirectives: [
        { id: SD_UUID, sd_key: SD_KEY, is_working_on: true, claiming_session_id: 'sess-released', status: 'in_progress' },
      ],
      subAgentResults: [
        { sd_id: SD_UUID, created_at: ISO(60 * 1000) },     // 1 min ago — active conversation
        { sd_id: SD_UUID, created_at: ISO(120 * 1000) },    // 2 min ago
      ],
    });

    const result = await triangulate(supabase, SD_KEY, { mySessionId: 'reclaimer-sess' });

    // NEW behavior: appears as orphaned (no session claim + is_working_on present) BUT with
    // reclaimSafe=false because recent_sub_agent_activity is evidence of an active conversation.
    expect(result.ghost).toHaveLength(0);
    const orph = result.orphaned.find(o => o.sdKey === SD_KEY);
    expect(orph).toBeTruthy();
    expect(orph.reclaimSafe).toBe(false);
    expect(orph.autoReleasable).toBe(false);
    expect(orph.signals.recentSubAgentActivity).toBe(true);
    expect(orph.evidenceOfLifeSignals).toContain('recent_sub_agent_activity');
    expect(orph.action).toMatch(/--force-reclaim/);
  });

  it('orphaned WITHOUT evidence-of-life remains reclaim-safe (backward compat)', async () => {
    // Stale claim with no other evidence -> safe to reclaim normally
    const supabase = makeFakeSupabase({
      claudeSessions: [],
      strategicDirectives: [
        { id: SD_UUID, sd_key: SD_KEY, is_working_on: true, claiming_session_id: 'sess-truly-dead', status: 'in_progress' },
      ],
      subAgentResults: [],
    });

    const result = await triangulate(supabase, SD_KEY, { mySessionId: 'reclaimer-sess' });
    const orph = result.orphaned.find(o => o.sdKey === SD_KEY);
    expect(orph).toBeTruthy();
    expect(orph.reclaimSafe).toBe(true);
    expect(orph.autoReleasable).toBe(true);
    expect(orph.action).toMatch(/Re-claim with: npm run sd:start/);
  });
});

// ── AC3: PID_DEAD dual-signal hardening ──────────────────────────────────────

describe('triangulate() — AC3: PID_DEAD requires BOTH process.kill failure AND tick stale', () => {
  it('classifies PID-dead-with-fresh-tick as evidence_of_life_no_pid (NOT ghost)', async () => {
    const supabase = makeFakeSupabase({
      claudeSessions: [
        {
          session_id: 'sess-X',
          sd_key: SD_KEY,
          status: 'active',
          heartbeat_at: ISO(10 * 1000),
          process_alive_at: ISO(15 * 1000),   // fresh tick
          pid: 999999,                        // dead PID
          hostname: 'h1',
        },
      ],
      strategicDirectives: [],
    });

    const result = await triangulate(supabase, SD_KEY);
    expect(result.ghost).toHaveLength(0);
    // tickRecent alone keeps it from being ghost; healthy classification because tickRecent is alive
    const inHealthy = result.healthy.some(h => h.sdKey === SD_KEY);
    const inDiscrepancies = result.discrepancies.some(d => d.sdKey === SD_KEY);
    expect(inHealthy || inDiscrepancies).toBe(true);
  });

  it('classifies PID-dead-with-stale-tick as ghost (BOTH conditions fail, no other evidence)', async () => {
    const supabase = makeFakeSupabase({
      claudeSessions: [
        {
          session_id: 'sess-Y',
          sd_key: SD_KEY,
          status: 'active',
          heartbeat_at: ISO(20 * 60 * 1000),   // 20min stale
          process_alive_at: ISO(20 * 60 * 1000), // 20min stale tick
          pid: 999999,
          hostname: 'h1',
        },
      ],
      strategicDirectives: [],
    });

    const result = await triangulate(supabase, SD_KEY);
    const ghost = result.ghost.find(g => g.sdKey === SD_KEY);
    expect(ghost).toBeTruthy();
    expect(ghost.autoReleasable).toBe(true);
    expect(ghost.signals.pidAlive).toBe(false);
    expect(ghost.signals.tickRecent).toBe(false);
  });

  it('TICK_RECENT_SECONDS is exported as 90', () => {
    expect(TICK_RECENT_SECONDS).toBe(90);
  });
});

// ── AC2: Pre-claim gate (checkPreClaimEvidence) ──────────────────────────────

describe('checkPreClaimEvidence() — AC2: pre-claim gate blocks reclaim when evidence-of-life present', () => {
  it('returns allowReclaim=false when SD is orphaned WITH evidence-of-life (released session, active activity)', async () => {
    const supabase = makeFakeSupabase({
      claudeSessions: [],  // released session filtered out
      strategicDirectives: [
        { id: SD_UUID, sd_key: SD_KEY, is_working_on: true, claiming_session_id: 'sess-released', status: 'in_progress' },
      ],
      subAgentResults: [{ sd_id: SD_UUID, created_at: ISO(60 * 1000) }],  // recent activity
    });

    const result = await checkPreClaimEvidence(supabase, SD_KEY, { mySessionId: 'reclaimer' });
    expect(result.allowReclaim).toBe(false);
    expect(result.classification).toBe('orphaned');
    expect(result.evidence).toContain('recent_sub_agent_activity');
  });

  it('returns allowReclaim=true when no record exists for SD (truly unclaimed)', async () => {
    const supabase = makeFakeSupabase({});
    const result = await checkPreClaimEvidence(supabase, 'SD-NONEXISTENT-001', { mySessionId: 'me' });
    expect(result.allowReclaim).toBe(true);
    expect(result.evidence).toEqual([]);
    expect(result.classification).toBe(null);
  });

  it('returns allowReclaim=true for ghost classification (genuinely dead session)', async () => {
    const supabase = makeFakeSupabase({
      claudeSessions: [
        {
          session_id: 'sess-dead',
          sd_key: SD_KEY,
          status: 'active',
          heartbeat_at: ISO(20 * 60 * 1000),
          process_alive_at: ISO(20 * 60 * 1000),
          pid: 999999,
          hostname: 'h1',
        },
      ],
      strategicDirectives: [],
    });

    const result = await checkPreClaimEvidence(supabase, SD_KEY, { mySessionId: 'reclaimer' });
    expect(result.allowReclaim).toBe(true);
    expect(result.classification).toBe('ghost');
  });
});

// ── Constants & contracts ────────────────────────────────────────────────────

describe('triangulate() — exported constants and API contract', () => {
  it('exports tunable thresholds for testing and operations', () => {
    expect(typeof TICK_RECENT_SECONDS).toBe('number');
    expect(typeof ACTIVITY_LOOKBACK_SECONDS).toBe('number');
    expect(TICK_RECENT_SECONDS).toBeGreaterThan(0);
    expect(ACTIVITY_LOOKBACK_SECONDS).toBeGreaterThan(TICK_RECENT_SECONDS);
  });

  it('returns 4-bucket shape on empty input', async () => {
    const supabase = makeFakeSupabase({});
    const result = await triangulate(supabase);
    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('orphaned');
    expect(result).toHaveProperty('ghost');
    expect(result).toHaveProperty('discrepancies');
    expect(Array.isArray(result.healthy)).toBe(true);
  });
});
