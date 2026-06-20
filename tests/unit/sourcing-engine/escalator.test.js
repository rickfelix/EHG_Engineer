// SD-LEO-INFRA-SOURCING-ENGINE-CHAIRMAN-QUEUE-001 (FR-4)
// Guards the chairman decision-queue escalator: per-lane row building, the idempotent fail-soft upsert,
// the migration-file content, and the FR-3 integration with the shipped routeCandidate. Hermetic — the
// DORMANT live table probe lives in escalator.db.test.js so the unit tier stays DB-free.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQueueRow,
  escalateToChairmanQueue,
  DEFAULT_SLA_HOURS,
  QUEUE_LANES,
} from '../../../lib/sourcing-engine/escalator.js';
import { LANE } from '../../../lib/sourcing-engine/lane.js';
import { routeCandidate } from '../../../lib/sourcing-engine/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SQL = readFileSync(path.join(REPO_ROOT, 'database/migrations/20260620_sourcing_chairman_queue.sql'), 'utf8');

// A recording supabase stub: from().upsert().select() resolves to `result`; records the upsert call.
function recordingSupabase(result = { data: [{ id: 'q1' }], error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table };
      const api = {
        upsert(row, opts) { q.op = 'upsert'; q.row = row; q.opts = opts; calls.push(q); return api; },
        select(cols) { q.select = cols; return api; },
        then(resolve) { return resolve(result); },
      };
      return api;
    },
  };
}

// --- FR-2/FR-3: buildQueueRow (pure) ---------------------------------------------------------------
describe('buildQueueRow (FR-2)', () => {
  it('a chairman-gated routed candidate produces a pending row with the authority + a 72h SLA', () => {
    const item = { source_id: 'src-1', title: 'needs a credential' };
    const routed = { lane: LANE.CHAIRMAN_GATED, rung: 'V1', disposition: 'BUILD', escalation: { to: 'chairman', reason: 'credential' } };
    const row = buildQueueRow(item, routed);
    expect(row).toMatchObject({
      source_id: 'src-1', title: 'needs a credential',
      lane: 'chairman-gated', gate_type: 'chairman-gated',
      escalation_type: 'credential', sla_hours: 72, state: 'pending',
    });
    expect(row.context).toMatchObject({ rung: 'V1', disposition: 'BUILD', escalation: { reason: 'credential' } });
  });

  it('an outcome-gated routed candidate escalates with type=outcome, its enablers, and a 168h SLA', () => {
    const routed = { lane: LANE.OUTCOME_GATED, rung: 'V2', enablers: ['SD-X-001'] };
    const row = buildQueueRow({ source_id: 'src-2' }, routed);
    expect(row).toMatchObject({ lane: 'outcome-gated', gate_type: 'outcome-gated', escalation_type: 'outcome', sla_hours: 168, state: 'pending' });
    expect(row.context.enablers).toEqual(['SD-X-001']);
    expect(row.context.rung).toBe('V2');
  });

  it('returns null for non-queue lanes (belt-ready / dedup / blocked-on / decline)', () => {
    for (const lane of [LANE.BELT_READY, LANE.DEDUP, LANE.DECLINE, 'blocked-on', undefined]) {
      expect(buildQueueRow({ source_id: 's' }, { lane })).toBeNull();
    }
  });

  it('an explicit slaHours overrides the per-lane default', () => {
    const row = buildQueueRow({ source_id: 's' }, { lane: LANE.CHAIRMAN_GATED }, { slaHours: 24 });
    expect(row.sla_hours).toBe(24);
  });

  it('QUEUE_LANES + DEFAULT_SLA_HOURS only cover the two gated lanes', () => {
    expect(QUEUE_LANES).toEqual(['chairman-gated', 'outcome-gated']);
    expect(DEFAULT_SLA_HOURS['chairman-gated']).toBe(72);
    expect(DEFAULT_SLA_HOURS['outcome-gated']).toBe(168);
  });
});

// --- FR-2: escalateToChairmanQueue (IO, fail-soft, idempotent) -------------------------------------
describe('escalateToChairmanQueue (FR-2)', () => {
  it('not_a_gated_lane for a belt-ready candidate (no write attempted)', async () => {
    const sb = recordingSupabase();
    const r = await escalateToChairmanQueue({ source_id: 's' }, { lane: LANE.BELT_READY }, { supabase: sb });
    expect(r).toEqual({ escalated: false, reason: 'not_a_gated_lane' });
    expect(sb.calls).toHaveLength(0);
  });

  it('no_client when no supabase is injected', async () => {
    const r = await escalateToChairmanQueue({ source_id: 's' }, { lane: LANE.CHAIRMAN_GATED }, {});
    expect(r).toEqual({ escalated: false, reason: 'no_client' });
  });

  it('no_source_id (no write) when source_id is missing/empty — null defeats the upsert idempotency key', async () => {
    const sb = recordingSupabase();
    for (const item of [{ title: 't' }, { source_id: null }, { source_id: '' }]) {
      const r = await escalateToChairmanQueue(item, { lane: LANE.CHAIRMAN_GATED }, { supabase: sb });
      expect(r).toEqual({ escalated: false, reason: 'no_source_id' });
    }
    expect(sb.calls).toHaveLength(0); // never reaches the DB
  });

  it('idempotent-upserts on (source_id, gate_type) with a computed sla_due_at and state=pending', async () => {
    const sb = recordingSupabase({ data: [{ id: 'qid' }], error: null });
    const r = await escalateToChairmanQueue(
      { source_id: 'src-9', title: 't' },
      { lane: LANE.CHAIRMAN_GATED, escalation: { reason: 'rls' } },
      { supabase: sb, nowIso: '2026-06-20T00:00:00.000Z' },
    );
    expect(r.escalated).toBe(true);
    expect(r.id).toBe('qid');
    const call = sb.calls[0];
    expect(call.table).toBe('sourcing_chairman_queue');
    expect(call.opts).toMatchObject({ onConflict: 'source_id,gate_type', ignoreDuplicates: true });
    expect(call.row.state).toBe('pending');
    expect(call.row.escalation_type).toBe('rls');
    // 72h after 2026-06-20T00:00:00Z
    expect(call.row.sla_due_at).toBe('2026-06-23T00:00:00.000Z');
  });

  it('a conflict (already queued) returns escalated:true, deduped:true — no duplicate', async () => {
    const sb = recordingSupabase({ data: [], error: null }); // ignoreDuplicates => empty on conflict
    const r = await escalateToChairmanQueue({ source_id: 'dup' }, { lane: LANE.OUTCOME_GATED }, { supabase: sb });
    expect(r.escalated).toBe(true);
    expect(r.deduped).toBe(true);
  });

  it('fail-soft (degraded) when the table is absent / DORMANT (PGRST205), never throws', async () => {
    const sb = recordingSupabase({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } });
    const r = await escalateToChairmanQueue({ source_id: 's' }, { lane: LANE.CHAIRMAN_GATED }, { supabase: sb });
    expect(r).toMatchObject({ escalated: false, reason: 'table_absent_dormant', degraded: true });
  });

  it('a thrown transport error degrades, never throws', async () => {
    const sb = { from() { return { upsert() { return { select() { throw new Error('socket hang up'); } }; } }; } };
    const r = await escalateToChairmanQueue({ source_id: 's' }, { lane: LANE.CHAIRMAN_GATED }, { supabase: sb });
    expect(r.escalated).toBe(false);
    expect(r.degraded).toBe(true);
  });
});

// --- FR-3: integration with the shipped routeCandidate --------------------------------------------
describe('routeCandidate -> escalator integration (FR-3)', () => {
  it('a chairman-authority candidate routes to chairman-gated and builds a valid queue row', () => {
    const routed = routeCandidate({ source_id: 'i', title: 'grant me', authority: 'grant' });
    expect(routed.lane).toBe('chairman-gated');
    const row = buildQueueRow({ source_id: 'i', title: 'grant me' }, routed);
    expect(row).not.toBeNull();
    expect(row.gate_type).toBe('chairman-gated');
    expect(row.escalation_type).toBe('grant');
  });

  it('a needsOutcome candidate routes to outcome-gated and builds an outcome queue row', () => {
    const routed = routeCandidate({ source_id: 'o', needsOutcome: true, targetRung: 'V2', enablers: ['e1'] });
    expect(routed.lane).toBe('outcome-gated');
    const row = buildQueueRow({ source_id: 'o' }, routed);
    expect(row.escalation_type).toBe('outcome');
    expect(row.context.enablers).toEqual(['e1']);
  });

  it('a belt-ready candidate is NOT queued', () => {
    const routed = routeCandidate({ source_id: 'b', title: 'plain buildable' });
    expect(routed.lane).toBe('belt-ready');
    expect(buildQueueRow({ source_id: 'b' }, routed)).toBeNull();
  });
});

// --- FR-1: migration file content ------------------------------------------------------------------
describe('sourcing_chairman_queue migration (FR-1)', () => {
  it('creates the table idempotently with the state CHECK enum and the idempotency UNIQUE key', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS\s+sourcing_chairman_queue/i);
    expect(SQL).toMatch(/state\s+text[\s\S]*CHECK\s*\(\s*state IN \('pending', 'decided', 'deferred_until', 'escalated'\)\s*\)/i);
    expect(SQL).toMatch(/UNIQUE\s*\(\s*source_id,\s*gate_type\s*\)/i);
  });

  it('declares the gate columns (lane, gate_type, escalation_type) + SLA + context jsonb', () => {
    for (const col of ['lane', 'gate_type', 'escalation_type', 'sla_hours', 'sla_due_at', 'context']) {
      expect(SQL).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(SQL).toMatch(/jsonb/i);
  });

  it('documents the DORMANT apply path (Adam / additive-DDL delegation)', () => {
    expect(SQL).toMatch(/DORMANT/);
    expect(SQL.toLowerCase()).toMatch(/adam|additive-ddl/);
  });
});
