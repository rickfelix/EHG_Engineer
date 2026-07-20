/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 — chairman-decision SLA sweep (TS-2/TS-3/TS-4).
 *
 * The sweep is the producer-agnostic backstop: most chairman_decisions producers insert
 * directly (bypassing recordPendingDecision), so only a scheduled scan can guarantee a
 * blocking pending decision reaches the chairman. These tests pin: notify-only invariant
 * (blocking column never mutated), blocking-row grace escalation with dedup, telemetry +
 * fixture exclusion, and the go-live cutoff.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseArgs,
  selectBlockingSweepRows,
  DEFAULT_GO_LIVE_CUTOFF,
} from '../../../scripts/cron/chairman-decision-sla-sweep.mjs';
import { enforceDecisionSLAs, DEFAULT_SLA_MATRIX } from '../../../lib/eva/chairman-sla-enforcer.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-11T15:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

/** Minimal fake supabase covering the sweep's reads (+ the enforcer's own pending read/update paths). */
function makeSupabase({ decisions = [], ventures = [] } = {}) {
  const updates = [];
  function table(name) {
    const rows = name === 'chairman_decisions' ? decisions : name === 'ventures' ? ventures : [];
    const ctx = { filters: [], op: 'select' };
    const api = {
      select() { return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      in(col, vals) { ctx.filters.push((r) => vals.includes(r[col])); return api; },
      // FR-6 batch 7: the real enforcer's pending read is paginated (fetchAllPaginated
      // appends .order().range()); both are pass-through — the thenable below serves the
      // full filtered set as one short page.
      order() { return api; },
      range() { return api; },
      update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
      insert(vals) { ctx.op = 'insert'; ctx.vals = vals; return api; },
      upsert(vals) { ctx.op = 'upsert'; ctx.vals = vals; return api; },
      maybeSingle: async () => ({ data: rows.filter((r) => ctx.filters.every((f) => f(r)))[0] || null, error: null }),
      then(resolve) {
        if (ctx.op === 'update') {
          const hit = rows.filter((r) => ctx.filters.every((f) => f(r)));
          hit.forEach((r) => { updates.push({ table: name, id: r.id, vals: ctx.vals }); Object.assign(r, ctx.vals); });
          resolve({ data: null, error: null });
        } else if (ctx.op === 'insert' || ctx.op === 'upsert') {
          resolve({ data: null, error: null });
        } else {
          resolve({ data: rows.filter((r) => ctx.filters.every((f) => f(r))), error: null });
        }
      },
    };
    return api;
  }
  return { from: table, _updates: updates };
}

const baseEnv = { ESCALATION_GO_LIVE_CUTOFF: '2026-07-10T00:00:00Z' };

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('selectBlockingSweepRows (pure selection for the blocking pass)', () => {
  const base = { status: 'pending', blocking: true, venture_id: null, brief_data: {} };

  it('selects a blocking stage_gate row past the grace period (the ready-venture pause shape)', () => {
    const rows = [{ ...base, id: 'd1', decision_type: 'stage_gate', created_at: iso(2 * HOUR) }];
    const due = selectBlockingSweepRows(rows, { cutoffIso: baseEnv.ESCALATION_GO_LIVE_CUTOFF, graceMs: 30 * 60 * 1000, nowMs: NOW });
    expect(due.map((r) => r.id)).toEqual(['d1']);
  });

  it('respects the grace period (fresh blocking rows are left to the on-creation path)', () => {
    const rows = [{ ...base, id: 'd1', decision_type: 'stage_gate', created_at: iso(5 * 60 * 1000) }];
    expect(selectBlockingSweepRows(rows, { cutoffIso: baseEnv.ESCALATION_GO_LIVE_CUTOFF, graceMs: 30 * 60 * 1000, nowMs: NOW })).toEqual([]);
  });

  it('excludes telemetry types even when blocking (TS-4 core)', () => {
    const rows = [
      { ...base, id: 't1', decision_type: 'flag_review', created_at: iso(2 * HOUR) },
      { ...base, id: 't2', decision_type: 'flag_enablement', created_at: iso(2 * HOUR) },
    ];
    expect(selectBlockingSweepRows(rows, { cutoffIso: baseEnv.ESCALATION_GO_LIVE_CUTOFF, graceMs: 0, nowMs: NOW })).toEqual([]);
  });

  it('excludes rows created before the go-live cutoff (no backlog flood)', () => {
    const rows = [{ ...base, id: 'old', decision_type: 'stage_gate', created_at: '2026-07-01T00:00:00Z' }];
    expect(selectBlockingSweepRows(rows, { cutoffIso: baseEnv.ESCALATION_GO_LIVE_CUTOFF, graceMs: 0, nowMs: NOW })).toEqual([]);
  });

  it('excludes fixture ventures and already-emailed rows', () => {
    const rows = [
      { ...base, id: 'fix', decision_type: 'stage_gate', created_at: iso(2 * HOUR), venture_id: 'v-fixture' },
      { ...base, id: 'sent', decision_type: 'stage_gate', created_at: iso(2 * HOUR), brief_data: { escalation_email_sent_at: iso(HOUR) } },
    ];
    const due = selectBlockingSweepRows(rows, { fixtureVentureIds: new Set(['v-fixture']), cutoffIso: baseEnv.ESCALATION_GO_LIVE_CUTOFF, graceMs: 0, nowMs: NOW });
    expect(due).toEqual([]);
  });

  it('default cutoff constant is the SD go-live date', () => {
    expect(DEFAULT_GO_LIVE_CUTOFF).toBe('2026-07-10T00:00:00Z');
  });
});

describe('main — sweep passes (TS-2/TS-3/TS-4)', () => {
  it('TS-3: a due blocking row is escalated via the seam exactly once; second run dedups', async () => {
    const decisions = [{ id: 'd1', decision_type: 'stage_gate', status: 'pending', blocking: true, created_at: iso(2 * HOUR), venture_id: null, brief_data: {} }];
    const sb = makeSupabase({ decisions });
    const escalate = vi.fn(async (supabase, id) => {
      const row = decisions.find((d) => d.id === id);
      if (row.brief_data.escalation_email_sent_at) return { escalated: false, deduped: true };
      row.brief_data = { ...row.brief_data, escalation_email_sent_at: new Date(NOW).toISOString() };
      return { escalated: true };
    });
    const enforce = vi.fn(async () => ({ checked: 0, escalated: 0, blocked: 0, skipped: 0, errors: [] }));
    const deps = { supabase: sb, escalate, enforce, env: baseEnv, nowMs: NOW, stampLastFired: vi.fn(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } };

    const r1 = await main(['node', 's', '--once'], deps);
    expect(r1.exitCode).toBe(0);
    expect(r1.summary.blocking_escalated).toBe(1);
    expect(escalate).toHaveBeenCalledTimes(1);

    const r2 = await main(['node', 's', '--once'], deps);
    expect(r2.summary.blocking_due).toBe(0); // marker now present — not even selected
    expect(escalate).toHaveBeenCalledTimes(1);
  });

  it('TS-2: enforcer runs NOTIFY-ONLY (blockOnViolation:false) with the actionable filter', async () => {
    const decisions = [
      { id: 'a1', decision_type: 'chairman_approval', status: 'pending', blocking: false, created_at: iso(30 * HOUR), venture_id: null, brief_data: {} },
      { id: 'noise', decision_type: 'flag_review', status: 'pending', blocking: false, created_at: iso(30 * HOUR), venture_id: null, brief_data: {} },
    ];
    const sb = makeSupabase({ decisions });
    let enforceOpts;
    const enforce = vi.fn(async (supabase, opts) => { enforceOpts = opts; return { checked: 2, escalated: 1, blocked: 0, skipped: 1, errors: [] }; });
    const deps = { supabase: sb, escalate: vi.fn(), enforce, env: baseEnv, nowMs: NOW, stampLastFired: vi.fn(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } };

    const r = await main(['node', 's', '--once'], deps);
    expect(r.exitCode).toBe(0);
    expect(enforceOpts.blockOnViolation).toBe(false); // notify-only invariant (TR-2)
    expect(enforceOpts.filter({ id: 'a1' })).toBe(true);      // actionable row admitted
    expect(enforceOpts.filter({ id: 'noise' })).toBe(false);  // telemetry row rejected (TS-4)
  });

  it('TS-4: real enforcer + filter never mutates blocking and skips telemetry (integration of the two modules)', async () => {
    // enforceDecisionSLAs computes age against the REAL wall clock (Date.now(), not injectable) —
    // so created_at must be aged relative to actual now, not the test's fixed NOW fixture constant.
    const realAged = new Date(Date.now() - 30 * HOUR).toISOString(); // past the 24h fallback SLA
    const decisions = [
      { id: 'noise', decision_type: 'flag_review', status: 'pending', blocking: false, created_at: realAged, venture_id: null, brief_data: {} },
      { id: 'a1', decision_type: 'chairman_approval', status: 'pending', blocking: false, created_at: realAged, venture_id: null, brief_data: {} },
    ];
    const sb = makeSupabase({ decisions });
    // main()'s own cutoff/actionable-filter logic uses deps.nowMs — keep that aligned with real time.
    // Cutoff pinned far in the past so a real-clock-aged fixture always clears it regardless of
    // when this suite actually runs.
    const deps = { supabase: sb, escalate: vi.fn(async () => ({ escalated: true })), enforce: enforceDecisionSLAs, env: { ESCALATION_GO_LIVE_CUTOFF: '2000-01-01T00:00:00Z' }, nowMs: Date.now(), stampLastFired: vi.fn(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } };

    const r = await main(['node', 's', '--once'], deps);
    expect(r.exitCode).toBe(0);
    const noise = decisions.find((d) => d.id === 'noise');
    expect(noise.brief_data.escalation).toBeUndefined(); // telemetry untouched
    expect(noise.blocking).toBe(false);
    const a1 = decisions.find((d) => d.id === 'a1');
    expect(a1.brief_data.escalation).toBeTruthy();       // SLA notify action recorded
    expect(a1.blocking).toBe(false);                    // NEVER mutated (blockOnViolation:false)
  });

  it('dry-run performs no escalation, no stamp, no enforcement', async () => {
    const decisions = [{ id: 'd1', decision_type: 'stage_gate', status: 'pending', blocking: true, created_at: iso(2 * HOUR), venture_id: null, brief_data: {} }];
    const sb = makeSupabase({ decisions });
    const escalate = vi.fn();
    const enforce = vi.fn();
    const stamp = vi.fn();
    const r = await main(['node', 's', '--once', '--dry-run'], { supabase: sb, escalate, enforce, env: baseEnv, nowMs: NOW, stampLastFired: stamp, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    expect(r.action).toBe('dry_run');
    expect(r.summary.blocking_due).toBe(1); // reports intent
    expect(escalate).not.toHaveBeenCalled();
    expect(enforce).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });
});

describe('SLA matrix (feedback 3acb9cdd)', () => {
  it('DEFAULT_SLA_MATRIX carries the stage_gate key', () => {
    expect(DEFAULT_SLA_MATRIX.stage_gate).toBe(4 * HOUR);
  });
});
