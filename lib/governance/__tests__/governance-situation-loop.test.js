/**
 * SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 — TS-1..TS-5.
 * Situation capture convention + reopen semantics · registry-driven probe
 * evaluation (both predicate types, zero per-probe scripts) · graceful
 * pre-apply degradation · loop closure-predicate validity.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  captureGovernanceSituation, situationFingerprint, SITUATION_CLASSES, CATCH_LAYERS,
} from '../situation-capture.js';
import { evaluateProbe, loadActiveProbes, runProbeRegistry } from '../probe-runner.mjs';
import { assertLoopRegistrationHasPredicate } from '../../loop-governance/governance.js';

function makeDb({ existing = null, tableMissing = false } = {}) {
  const writes = { inserts: [], updates: [] };
  const db = {
    writes,
    from(table) {
      return {
        select: () => ({
          eq: (col, val) => {
            if (table === 'governance_probe_registry') {
              return Promise.resolve(tableMissing
                ? { data: null, error: { message: 'relation "governance_probe_registry" does not exist' } }
                : { data: existing || [], error: null });
            }
            return { maybeSingle: async () => ({ data: existing, error: null }) };
          },
        }),
        insert: vi.fn(async (row) => { writes.inserts.push({ table, row }); return { error: null }; }),
        update: vi.fn((row) => ({ eq: async () => { writes.updates.push({ table, row }); return { error: null }; } })),
      };
    },
  };
  return db;
}

describe('TS-1: capture inserts the convention row on issue_patterns (no new table)', () => {
  it('writes class/catch_layer/hardening_ref metadata with a deterministic GOV- id', async () => {
    const db = makeDb();
    const r = await captureGovernanceSituation(db, {
      situationClass: 'chairman_correction',
      summary: 'Chairman build-vs-instantiate correction on PORTFOLIO-C scope',
      catchLayer: 'chairman',
      situationRef: 'sd:SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-C',
    });
    expect(r.captured).toBe(true);
    expect(r.id).toBe(situationFingerprint('chairman_correction', 'Chairman build-vs-instantiate correction on PORTFOLIO-C scope'));
    const ins = db.writes.inserts[0];
    expect(ins.table).toBe('issue_patterns');
    expect(ins.row.category).toBe('governance_situation');
    expect(ins.row.metadata.class).toBe('chairman_correction');
    expect(ins.row.metadata.catch_layer).toBe('chairman');
    expect(ins.row.occurrence_count).toBe(1);
  });

  it('rejects unknown class and layer (closed vocabularies)', async () => {
    const db = makeDb();
    expect((await captureGovernanceSituation(db, { situationClass: 'vibe', summary: 'x', catchLayer: 'chairman' })).captured).toBe(false);
    expect((await captureGovernanceSituation(db, { situationClass: 'near_miss', summary: 'x', catchLayer: 'ops' })).captured).toBe(false);
    expect(SITUATION_CLASSES).toHaveLength(4);
    expect(CATCH_LAYERS).toEqual(['chairman', 'solomon', 'probe']);
  });
});

describe('TS-2: recurrence increments; resolved rows auto-reopen', () => {
  it('increments occurrence_count on re-capture', async () => {
    const db = makeDb({ existing: { id: 'GOV-x', occurrence_count: 2, status: 'active', metadata: { class: 'near_miss' } } });
    const r = await captureGovernanceSituation(db, { situationClass: 'near_miss', summary: 'same summary', catchLayer: 'solomon' });
    expect(r.captured).toBe(true);
    expect(r.reopened).toBe(false);
    expect(db.writes.updates[0].row.occurrence_count).toBe(3);
  });

  it('reopens a resolved row (prior hardening did not hold) and clears stale SD attribution', async () => {
    const db = makeDb({ existing: { id: 'GOV-y', occurrence_count: 1, status: 'resolved', metadata: { reopen_count: 0 } } });
    const r = await captureGovernanceSituation(db, { situationClass: 'adherence_drift', summary: 'drift again', catchLayer: 'probe' });
    expect(r.reopened).toBe(true);
    const upd = db.writes.updates[0].row;
    expect(upd.status).toBe('active');
    expect(upd.assigned_sd_id).toBeNull();
    expect(upd.metadata.reopened_at).toBeTruthy();
    expect(upd.metadata.reopen_count).toBe(1);
  });
});

describe('TS-3: registry-driven probe evaluation — rows, not scripts', () => {
  const NOW = new Date('2026-07-17T12:00:00Z');
  const factProbe = {
    probe_key: 'inbox_drained', target_role: 'adam', predicate_type: 'adherence_fact',
    predicate_config: { fact: 'unreadInboundCount', expect: 'equals', value: 0 },
  };
  const closureProbe = {
    probe_key: 'adherence_ledger_fresh', target_role: 'adam', predicate_type: 'closure_predicate',
    predicate_config: { predicate_type: 'witness_recent', closure_predicate: { window_seconds: 604800, authorized_writer: 'adam-self-adherence-review' } },
  };

  it('evaluates both predicate types from rows via ONE runner', async () => {
    const db = makeDb({ existing: [factProbe, closureProbe] });
    const facts = {
      unreadInboundCount: 0,
      adherence_ledger_fresh: { witnessAt: '2026-07-16T12:00:00Z', upstreamFiredAt: '2026-07-16T12:00:00Z' },
    };
    const run = await runProbeRegistry(db, { resolveFacts: async () => facts, now: NOW });
    expect(run.degraded).toBe(false);
    expect(run.results).toHaveLength(2);
    expect(run.results.find((r) => r.probe_key === 'inbox_drained').verdict).toBe('pass');
    expect(run.results.find((r) => r.probe_key === 'adherence_ledger_fresh').verdict).toBe('pass');
  });

  it('fails loud: unresolved fact is unknown, stale witness is fail', () => {
    expect(evaluateProbe(factProbe, {}, NOW).verdict).toBe('unknown');
    const stale = evaluateProbe(closureProbe, { adherence_ledger_fresh: { witnessAt: '2026-06-01T00:00:00Z', upstreamFiredAt: '2026-06-01T00:00:00Z' } }, NOW);
    expect(stale.verdict).toBe('fail');
  });
});

describe('TS-4: graceful degradation while the STAGED table is unapplied', () => {
  it('reports degraded (never throws, never fake-passes) when the table is absent', async () => {
    const db = makeDb({ tableMissing: true });
    const loaded = await loadActiveProbes(db);
    expect(loaded.degraded).toBe(true);
    expect(loaded.reason).toMatch(/chairman-gated STAGED/);
    const run = await runProbeRegistry(db, {});
    expect(run.degraded).toBe(true);
    expect(run.results).toEqual([]);
  });
});

describe('TS-5: the loop closure predicate passes the registration gate', () => {
  it('GOVERNANCE-SITUATION-LOOP predicate is machine-checkable with provenance', () => {
    const gate = assertLoopRegistrationHasPredicate({
      predicate_type: 'edge_freshness',
      closure_predicate: { window_seconds: 14 * 86400, authorized_writer: 'governance-situation-loop' },
    });
    expect(gate.ok).toBe(true);
  });
});
