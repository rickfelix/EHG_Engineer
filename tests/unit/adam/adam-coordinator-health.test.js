/**
 * SD-LEO-INFRA-ADAM-COORDINATOR-HEALTH-001 — unit tests for the 3-KPI coordinator-health
 * probe. DB-free (in-memory fake Supabase), matching TS-1..TS-8 from the PRD.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  computeUtilization,
  computePlanAdherence,
  computeFailLoudIntegrity,
  classifyBreach,
  buildCoordinatorHealthAdvisoryRows,
  pushCoordinatorHealthAdvisory,
  persistReading,
  runProbe,
} from '../../../scripts/adam-coordinator-health.mjs';
import * as waveLinkage from '../../../lib/roadmap/wave-linkage-coverage.js';
import * as genuineWorker from '../../../lib/fleet/genuine-worker.mjs';
import * as coordinatorResolve from '../../../lib/coordinator/resolve.cjs';

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Minimal fake Supabase: select().eq()/.in()/.not()/.order()/.limit() over seeded tables; insert() logs rows.
 * capAt: { tableName: n } simulates PostgREST's default page cap (QF-20260720-161 regression coverage) —
 * applied post-filter/post-sort like the real server-side default, so an unordered query truncates to an
 * arbitrary slice while an explicitly-ordered one keeps the correct (e.g. freshest) rows within the cap.
 */
function makeFakeSupabase(tables, { onInsert, capAt } = {}) {
  return {
    from(tableName) {
      const filters = [];
      let orderCol = null;
      let orderAsc = true;
      let limitN = null;
      // FR-6 batch 9: exact-head-count gauge mode ({count:'exact', head:true}) — no rows body,
      // just the filtered count (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001).
      let countMode = false;
      const builder = {
        select(_cols, opts) { if (opts && opts.count === 'exact') countMode = true; return builder; },
        eq(col, val) { filters.push((r) => r[col] === val); return builder; },
        in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
        is(col, val) { filters.push((r) => (r[col] ?? null) === val); return builder; },
        not(col, op, val) { filters.push((r) => r[col] !== val); return builder; },
        order(col, { ascending } = {}) { orderCol = col; orderAsc = ascending !== false; return builder; },
        limit(n) { limitN = n; return builder; },
        range(from, to) { limitN = to - from + 1; return builder; },
        then(resolve) {
          let rows = (tables[tableName] || []).filter((r) => filters.every((f) => f(r)));
          if (orderCol) rows = [...rows].sort((a, b) => (orderAsc ? 1 : -1) * (a[orderCol] > b[orderCol] ? 1 : -1));
          const effectiveLimit = limitN != null ? limitN : capAt?.[tableName];
          if (effectiveLimit != null) rows = rows.slice(0, effectiveLimit);
          if (countMode) { resolve({ data: null, count: rows.length, error: null }); return; }
          resolve({ data: rows, error: null });
        },
        insert(row) {
          onInsert?.(tableName, row);
          return Promise.resolve({ data: [row], error: null });
        },
      };
      return builder;
    },
  };
}

describe('computeUtilization (TS-1, TS-2)', () => {
  it('does not misclassify a cross-repo claimant as idle', async () => {
    const supabase = makeFakeSupabase({
      claude_sessions: [
        { session_id: 's1', sd_key: 'SD-EHG-FEAT-001', claimed_at: '2026-01-01', status: 'active', heartbeat_at: minutesAgo(1), metadata: {}, commits_since_claim: 0 },
      ],
      strategic_directives_v2: [],
    });
    const result = await computeUtilization(supabase, { nowMs: Date.now() });
    expect(result.claimed).toBe(1);
    expect(result.idle).toBe(0);
  });

  it('counts a released (unclaimed) live worker as idle', async () => {
    const supabase = makeFakeSupabase({
      claude_sessions: [
        { session_id: 's2', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 3, status: 'idle', heartbeat_at: minutesAgo(1), metadata: {} },
      ],
      strategic_directives_v2: [{ id: 'x', status: 'draft', claiming_session_id: null }],
    });
    const result = await computeUtilization(supabase);
    expect(result.idle).toBe(1);
    expect(result.dispatchable_backlog_size).toBe(1);
  });

  it('excludes an already-claimed draft SD from the dispatchable backlog count (no false-positive breach signal)', async () => {
    const supabase = makeFakeSupabase({
      claude_sessions: [],
      strategic_directives_v2: [
        { id: 'x', status: 'draft', claiming_session_id: null },
        { id: 'y', status: 'draft', claiming_session_id: 'some-worker-session' },
      ],
    });
    const result = await computeUtilization(supabase);
    expect(result.dispatchable_backlog_size).toBe(1);
  });

  it('calls liveFleetWorkers directly (structural reuse-proof, TS-7) rather than recomputing the classification', async () => {
    const spy = vi.spyOn(genuineWorker, 'liveFleetWorkers');
    const supabase = makeFakeSupabase({
      claude_sessions: [{ session_id: 's3', sd_key: 'SD-X', status: 'active', heartbeat_at: minutesAgo(1), metadata: {} }],
      strategic_directives_v2: [],
    });
    await computeUtilization(supabase);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('excludes adam/coordinator roles from the live-worker count', async () => {
    const supabase = makeFakeSupabase({
      claude_sessions: [
        { session_id: 'adam1', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 1, status: 'active', heartbeat_at: minutesAgo(1), metadata: { role: 'adam' } },
        { session_id: 'coord1', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 1, status: 'active', heartbeat_at: minutesAgo(1), metadata: { is_coordinator: true } },
      ],
      strategic_directives_v2: [],
    });
    const result = await computeUtilization(supabase);
    expect(result.live_workers).toBe(0);
  });

  it('QF-20260720-161: keeps the freshest session inside a simulated PostgREST page cap via explicit heartbeat ordering', async () => {
    const supabase = makeFakeSupabase(
      {
        claude_sessions: [
          { session_id: 'stale1', sd_key: 'SD-OLD-1', status: 'active', heartbeat_at: '2025-12-01T00:00:00Z', metadata: {} },
          { session_id: 'stale2', sd_key: 'SD-OLD-2', status: 'active', heartbeat_at: '2025-12-02T00:00:00Z', metadata: {} },
          { session_id: 'fresh', sd_key: 'SD-NEW', status: 'active', heartbeat_at: minutesAgo(1), metadata: {} },
        ],
        strategic_directives_v2: [],
      },
      { capAt: { claude_sessions: 2 } },
    );
    // Without explicit ordering, an unordered query capped at 2 rows returns [stale1, stale2] in
    // insertion order and silently drops 'fresh' — this would report live_workers=0.
    const result = await computeUtilization(supabase);
    expect(result.live_workers).toBe(1);
    expect(result.claimed).toBe(1);
  });
});

describe('computePlanAdherence (TS-2)', () => {
  it('reports unmeasurable_until_linkage when coverage is null (vacuous, not off-plan)', async () => {
    vi.spyOn(waveLinkage, 'computeWaveLinkageCoverage').mockResolvedValueOnce({ coverage: null, linked: 0, total: 0, starved: false, unlinkedKeys: [] });
    const supabase = makeFakeSupabase({ strategic_directives_v2: [] });
    const result = await computePlanAdherence(supabase);
    expect(result.status).toBe('unmeasurable_until_linkage');
    expect(result.coverage).toBeNull();
  });

  it('reports a real coverage percentage and in-flight-filtered unlinked keys when measured', async () => {
    vi.spyOn(waveLinkage, 'computeWaveLinkageCoverage').mockResolvedValueOnce({
      coverage: 0.5, linked: 5, total: 10, starved: true, unlinkedKeys: ['SD-A-001', 'SD-B-001'],
    });
    const supabase = makeFakeSupabase({
      strategic_directives_v2: [
        { sd_key: 'SD-A-001', status: 'in_progress' },
        { sd_key: 'SD-B-001', status: 'draft' },
      ],
    });
    const result = await computePlanAdherence(supabase);
    expect(result.status).toBe('measured');
    expect(result.coverage).toBe(0.5);
    expect(result.starved).toBe(true);
    expect(result.in_flight_unlinked).toEqual(['SD-A-001']);
  });
});

describe('computeFailLoudIntegrity (TS-3)', () => {
  it('fails loud (never null-coalesces to 0) on a query error in the recompute path', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    const result = await computeFailLoudIntegrity(supabase, {});
    expect(result.integrity_ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('fails loud on an error from the self-reported (computeClaimableLeaves) source, never coalescing to 0', async () => {
    const supabase = makeFakeSupabase({ strategic_directives_v2: [] });
    const claimableLeavesFn = vi.fn().mockResolvedValue({ error: { message: 'ranker failed' }, claimable: [] });
    const result = await computeFailLoudIntegrity(supabase, { claimableLeavesFn });
    expect(result.integrity_ok).toBe(false);
    expect(result.error).toBe('ranker failed');
  });

  it('flags a seeded self-report OVER-count (self_reported > recomputed) as a genuine integrity violation', async () => {
    const supabase = makeFakeSupabase({ strategic_directives_v2: [{ id: '1', status: 'draft', claiming_session_id: null }] });
    const result = await computeFailLoudIntegrity(supabase, { selfReportedCounts: { dispatchable_count: 5 } });
    expect(result.integrity_ok).toBe(false);
    expect(result.divergent_fields).toEqual(['dispatchable_count']);
  });

  it('does NOT flag a self-reported UNDER-count as a violation (ranker narrowing the raw set is healthy, not a divergence)', async () => {
    const supabase = makeFakeSupabase({ strategic_directives_v2: [{ id: '1', status: 'draft', claiming_session_id: null }, { id: '2', status: 'draft', claiming_session_id: null }] });
    const result = await computeFailLoudIntegrity(supabase, { selfReportedCounts: { dispatchable_count: 0 } });
    expect(result.integrity_ok).toBe(true);
  });

  it('by default calls a genuinely SEPARATE source (computeClaimableLeaves), not a diff against itself — the CRITICAL fix', async () => {
    const supabase = makeFakeSupabase({ strategic_directives_v2: [{ id: '1', status: 'draft', claiming_session_id: null }] });
    const claimableLeavesFn = vi.fn().mockResolvedValue({ claimable: [{ sd_key: 'SD-A', status: 'draft' }, { sd_key: 'SD-B', status: 'draft' }] });
    const result = await computeFailLoudIntegrity(supabase, { claimableLeavesFn });
    expect(claimableLeavesFn).toHaveBeenCalledTimes(1);
    // recomputed=1 (one draft, unclaimed row) vs self_reported=2 (from the injected separate source) -> a REAL divergence
    expect(result.integrity_ok).toBe(false);
    expect(result.recomputed.dispatchable_count).toBe(1);
    expect(result.self_reported.dispatchable_count).toBe(2);
  });

  it('agrees (integrity_ok=true) when the two independent sources genuinely match', async () => {
    const supabase = makeFakeSupabase({ strategic_directives_v2: [{ id: '1', status: 'draft', claiming_session_id: null }] });
    const claimableLeavesFn = vi.fn().mockResolvedValue({ claimable: [{ sd_key: 'SD-A', status: 'draft' }] });
    const result = await computeFailLoudIntegrity(supabase, { claimableLeavesFn });
    expect(result.integrity_ok).toBe(true);
  });

  // QF-20260720-161
  it('does NOT flag instrument_suspect when a wide self-reported/recomputed gap is explained by human-action holds (live-verified: 3 vs 20, 11 held)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, status: 'draft', claiming_session_id: null }));
    const supabase = makeFakeSupabase({ strategic_directives_v2: rows });
    const claimableLeavesFn = vi.fn().mockResolvedValue({
      claimable: Array.from({ length: 3 }, (_, i) => ({ sd_key: `SD-${i}`, status: 'draft' })),
      humanActionHolds: Array.from({ length: 11 }, (_, i) => ({ sd_key: `SD-HELD-${i}`, provenance: null })),
    });
    const result = await computeFailLoudIntegrity(supabase, { claimableLeavesFn });
    expect(result.human_action_held).toBe(11);
    expect(result.instrument_suspect).toBe(false);
    expect(result.integrity_ok).toBe(true);
  });

  it('flags instrument_suspect when the gap is NOT substantially explained by known human-action holds', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, status: 'draft', claiming_session_id: null }));
    const supabase = makeFakeSupabase({ strategic_directives_v2: rows });
    const claimableLeavesFn = vi.fn().mockResolvedValue({
      claimable: [{ sd_key: 'SD-0', status: 'draft' }],
      humanActionHolds: [{ sd_key: 'SD-HELD-0', provenance: null }],
    });
    const result = await computeFailLoudIntegrity(supabase, { claimableLeavesFn });
    expect(result.human_action_held).toBe(1);
    expect(result.instrument_suspect).toBe(true);
    expect(result.integrity_ok).toBe(false);
    expect(result.divergent_fields).toContain('dispatchable_count_unexplained_gap');
  });
});

describe('classifyBreach + advisory (TS-4, TS-8)', () => {
  const okIntegrity = { integrity_ok: true };
  const unmeasurable = { status: 'unmeasurable_until_linkage', coverage: null };

  it('does not breach on idle workers alone when backlog is empty (no false positive)', () => {
    const result = classifyBreach({ utilization: { idle: 3, dispatchable_backlog_size: 0 }, planAdherence: unmeasurable, integrity: okIntegrity });
    expect(result.breach).toBe(false);
  });

  it('breaches on idle workers + non-empty backlog together', () => {
    const result = classifyBreach({ utilization: { idle: 2, dispatchable_backlog_size: 5 }, planAdherence: unmeasurable, integrity: okIntegrity });
    expect(result.breach).toBe(true);
    expect(result.idleWithBacklog).toBe(true);
  });

  it('emits exactly one propose-only advisory naming the breached KPI, never a dispatch call', async () => {
    const inserted = [];
    const supabase = makeFakeSupabase({}, { onInsert: (t, r) => inserted.push({ t, r }) });
    const reading = {
      timestamp: '2026-07-16T00:00:00Z',
      utilization: { idle: 2, dispatchable_backlog_size: 5 },
      plan_adherence: unmeasurable,
      integrity: okIntegrity,
      breach: { breach: true, idleWithBacklog: true, integrityBreach: false, planBreach: false },
    };
    await pushCoordinatorHealthAdvisory(supabase, reading, { coordinatorId: 'c1' });
    expect(inserted.length).toBe(1);
    expect(inserted[0].t).toBe('session_coordination');
    expect(inserted[0].r.subject).toContain('idle workers');
    expect(inserted[0].r.payload.kind).toBe('adam_advisory');
  });

  it('advisory row builder never references a claim/dispatch function name', () => {
    const reading = {
      timestamp: 't', utilization: {}, plan_adherence: unmeasurable, integrity: okIntegrity,
      breach: { breach: true, idleWithBacklog: true },
    };
    const { coordinatorRow } = buildCoordinatorHealthAdvisoryRows(reading, { coordinatorId: 'c1' });
    expect(coordinatorRow.message_type).toBe('INFO');
    expect(JSON.stringify(coordinatorRow)).not.toMatch(/claim_sd|sd-start/);
  });
});

describe('persistReading (TS-6)', () => {
  it('produces two distinct rows across two consecutive runs', async () => {
    const inserted = [];
    const supabase = makeFakeSupabase({ codebase_health_snapshots: [] }, { onInsert: (t, r) => inserted.push({ t, r }) });
    const reading1 = { breach: { breach: false } };
    const reading2 = { breach: { breach: true } };
    await persistReading(supabase, reading1);
    await persistReading(supabase, reading2);
    expect(inserted.length).toBe(2);
    expect(inserted[0].r.dimension).toBe('adam_coordinator_health');
    expect(inserted[0].r.score).not.toBe(inserted[1].r.score);
  });
});

describe('runProbe integration (TS-1..TS-5 wired end-to-end)', () => {
  // SD-LEO-FIX-ADAM-COORDINATOR-HEALTH-001: runProbe's raw-SQL recompute creates its
  // OWN pg client (createDatabaseClient) OUTSIDE the injected supabase; without an
  // injectable seam the test's pass/fail flipped on ambient DB reachability. Inject a
  // stub that forces the pre-existing recompute-unavailable path (recompute_ok=null,
  // no breach) — deterministic, no live connection.
  const pgDisabled = async () => { throw new Error('pg-disabled-in-unit'); };

  it('runs all three KPIs, persists a reading, and skips the advisory when there is no breach', async () => {
    vi.spyOn(waveLinkage, 'computeWaveLinkageCoverage').mockResolvedValueOnce({ coverage: null, linked: 0, total: 0, starved: false, unlinkedKeys: [] });
    const inserted = [];
    const supabase = makeFakeSupabase(
      { claude_sessions: [], strategic_directives_v2: [], codebase_health_snapshots: [] },
      { onInsert: (t, r) => inserted.push({ t, r }) },
    );
    const reading = await runProbe(supabase, { makePgClient: pgDisabled });
    expect(reading.recompute.recompute_ok).toBeNull(); // pg seam stubbed — no live recompute, deterministic
    expect(reading.utilization).toBeDefined();
    expect(reading.plan_adherence.status).toBe('unmeasurable_until_linkage');
    expect(reading.integrity.integrity_ok).toBe(true);
    expect(inserted.some((i) => i.t === 'codebase_health_snapshots')).toBe(true);
    expect(inserted.some((i) => i.t === 'session_coordination')).toBe(false);
  });

  it('on a real breach, resolves the live coordinator session id (not the broadcast fallback)', async () => {
    vi.spyOn(waveLinkage, 'computeWaveLinkageCoverage').mockResolvedValueOnce({ coverage: null, linked: 0, total: 0, starved: false, unlinkedKeys: [] });
    vi.spyOn(coordinatorResolve, 'getActiveCoordinatorId').mockResolvedValueOnce('live-coordinator-session-1');
    const inserted = [];
    const supabase = makeFakeSupabase(
      {
        claude_sessions: [{ session_id: 'idle1', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 1, status: 'idle', heartbeat_at: minutesAgo(1), metadata: {} }],
        strategic_directives_v2: [{ id: 'x', status: 'draft', claiming_session_id: null }],
        codebase_health_snapshots: [],
      },
      { onInsert: (t, r) => inserted.push({ t, r }) },
    );
    await runProbe(supabase, { makePgClient: pgDisabled });
    const advisory = inserted.find((i) => i.t === 'session_coordination');
    expect(advisory).toBeDefined();
    expect(advisory.r.target_session).toBe('live-coordinator-session-1');
  });

  it('a divergent recompute via the INJECTED pg seam drives a breach + advisory (runProbe->recomputeBreach glue)', async () => {
    // Covers the recompute-breach glue the pg stub otherwise bypasses: an injected
    // fake pg that "connects" and returns finite raw counts diverges from the empty
    // fake-supabase-derived probe -> recompute_ok=false -> breach -> advisory.
    vi.spyOn(waveLinkage, 'computeWaveLinkageCoverage').mockResolvedValueOnce({ coverage: null, linked: 0, total: 0, starved: false, unlinkedKeys: [] });
    const inserted = [];
    const supabase = makeFakeSupabase(
      { claude_sessions: [], strategic_directives_v2: [], codebase_health_snapshots: [] },
      { onInsert: (t, r) => inserted.push({ t, r }) },
    );
    const fakePg = { query: async () => ({ rows: [{ n: 7 }] }), end: async () => {} };
    const reading = await runProbe(supabase, { makePgClient: async () => fakePg, recipients: { coordinatorId: 'c-test' } });
    expect(reading.recompute.recompute_ok).toBe(false);
    expect(reading.breach.recomputeBreach).toBe(true);
    expect(inserted.some((i) => i.t === 'session_coordination')).toBe(true);
  });
});
