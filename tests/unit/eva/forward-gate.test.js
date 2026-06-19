/**
 * SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001
 *
 * The ADVISORY/log-only chairman-decision forward gate:
 *   - runs the PURE evaluateDecision() over each decision and logs the verdict to audit_log,
 *   - NEVER writes/updates chairman_decisions (authority unchanged — CONST-002),
 *   - is idempotent and fail-open (never blocks/alters decision creation).
 */
import { describe, it, expect } from 'vitest';
import {
  recordForwardGateScore,
  decisionToEngineInput,
  hasForwardGateScore,
  FORWARD_GATE_EVENT,
} from '../../../lib/eva/forward-gate.js';
import { createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';

/** Fake supabase recording every write; select-count awaits to `existingCount`. */
function makeSupabase({ existingCount = 0, insertError = null, insertThrows = false } = {}) {
  const writes = [];
  const sb = {
    writes,
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        update(payload) { writes.push({ table, op: 'update', payload }); return { eq: () => Promise.resolve({ error: null }) }; },
        insert(payload) {
          writes.push({ table, op: 'insert', payload });
          if (insertThrows) throw new Error('insert boom');
          return Promise.resolve({ error: insertError });
        },
        // select-count await (hasForwardGateScore)
        then(resolve) { resolve({ count: existingCount, error: null }); },
      };
      return builder;
    },
  };
  return sb;
}

const sampleDecision = {
  id: 'dec-1',
  lifecycle_stage: 10,
  // health_score is CATEGORICAL in production ('green'/'red'/NULL) — realistic fixture.
  health_score: 'green',
  summary: 'Gate decision for stage 10',
  decision_type: 'stage_gate',
  brief_data: { ventureName: 'Acme', cost: 1200, technologies: ['x'] },
};

describe('decisionToEngineInput', () => {
  it('maps live decision fields into an evaluateDecision input (honest, sparse-tolerant)', () => {
    const input = decisionToEngineInput(sampleDecision);
    expect(input.stage).toBe('10');
    expect(input.description).toBe('Gate decision for stage 10');
    expect(input.cost).toBe(1200);
    expect(input.technologies).toEqual(['x']);
  });

  it('does NOT feed categorical health_score as a numeric visionScore (would be NaN)', () => {
    // Regression guard: health_score 'green'/'red' must never become input.visionScore.
    expect(decisionToEngineInput(sampleDecision)).not.toHaveProperty('visionScore');
    expect(decisionToEngineInput({ id: 'd', lifecycle_stage: 5, health_score: 'red' })).not.toHaveProperty('visionScore');
  });

  it('tolerates a bare decision with no brief_data', () => {
    const input = decisionToEngineInput({ id: 'd', lifecycle_stage: 3 });
    expect(input.stage).toBe('3');
    expect(input).not.toHaveProperty('cost');
  });
});

describe('recordForwardGateScore — TS-1: invokes evaluateDecision and logs advisory score', () => {
  it('writes exactly one audit_log row with score/triggers, severity=info, entity_id=decision.id', async () => {
    const sb = makeSupabase({ existingCount: 0 });
    const res = await recordForwardGateScore(sampleDecision, { supabase: sb });
    expect(res.logged).toBe(true);
    expect(res.verdict).toBeTruthy();
    expect(typeof res.verdict.recommendation).toBe('string'); // engine genuinely ran
    const inserts = sb.writes.filter((w) => w.op === 'insert');
    expect(inserts).toHaveLength(1);
    const row = inserts[0];
    expect(row.table).toBe('audit_log');
    expect(row.payload.event_type).toBe(FORWARD_GATE_EVENT);
    expect(row.payload.entity_type).toBe('chairman_decision');
    expect(row.payload.entity_id).toBe('dec-1');
    expect(row.payload.severity).toBe('info');
    expect(row.payload.metadata.advisory).toBe(true);
    expect(Array.isArray(row.payload.metadata.triggers)).toBe(true);
  });
});

describe('recordForwardGateScore — TS-2: CONST-002 authority is untouched', () => {
  it('issues ZERO writes/updates to chairman_decisions (only audit_log)', async () => {
    const sb = makeSupabase({ existingCount: 0 });
    await recordForwardGateScore(sampleDecision, { supabase: sb });
    const chairmanWrites = sb.writes.filter((w) => w.table === 'chairman_decisions');
    expect(chairmanWrites).toHaveLength(0);
    expect(sb.writes.every((w) => w.table === 'audit_log')).toBe(true);
  });
});

describe('recordForwardGateScore — TS-4: idempotent', () => {
  it('skips (no insert) when a coverage row already exists for the decision', async () => {
    const sb = makeSupabase({ existingCount: 1 });
    const res = await recordForwardGateScore(sampleDecision, { supabase: sb });
    expect(res.logged).toBe(false);
    expect(res.skipped).toBe(true);
    expect(sb.writes.filter((w) => w.op === 'insert')).toHaveLength(0);
  });
});

describe('recordForwardGateScore — fail-open', () => {
  it('returns {logged:false} and never throws when the audit insert errors', async () => {
    const sb = makeSupabase({ existingCount: 0, insertError: { message: 'db down' } });
    const res = await recordForwardGateScore(sampleDecision, { supabase: sb });
    expect(res.logged).toBe(false);
  });

  it('returns {logged:false} and never throws when the audit insert THROWS', async () => {
    const sb = makeSupabase({ existingCount: 0, insertThrows: true });
    await expect(recordForwardGateScore(sampleDecision, { supabase: sb })).resolves.toMatchObject({ logged: false });
  });

  it('returns {logged:false} on missing decision.id or supabase', async () => {
    expect(await recordForwardGateScore(null, { supabase: makeSupabase() })).toMatchObject({ logged: false });
    expect(await recordForwardGateScore({ id: 'x' }, {})).toMatchObject({ logged: false });
  });
});

describe('hasForwardGateScore', () => {
  it('true when count>0, false when 0', async () => {
    expect(await hasForwardGateScore('d', makeSupabase({ existingCount: 3 }))).toBe(true);
    expect(await hasForwardGateScore('d', makeSupabase({ existingCount: 0 }))).toBe(false);
  });
});

describe('TS-3: forward path (createOrReusePendingDecision) proceeds unchanged with the gate wired', () => {
  /** table-aware fake: a decision-creating stage, an existing pending decision, and an audit_log that THROWS. */
  function wiringSupabase() {
    return {
      rpc: async () => ({ data: { creates_decision: true, gate_type: 'kill', review_mode: 'review' }, error: null }),
      from(table) {
        if (table === 'chairman_decisions') {
          return {
            select() { return this; },
            eq() { return this; },
            single: async () => ({ data: { id: 'existing-id' } }),
            update() { return { eq: async () => ({ error: null }) }; },
          };
        }
        // audit_log: hasForwardGateScore awaits → 0; insert rejects to prove fail-open
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) { resolve({ count: 0, error: null }); },
          insert() { return Promise.reject(new Error('audit boom')); },
        };
      },
    };
  }

  it('still returns the decision even when advisory scoring fails (fail-open) — reuse branch', async () => {
    const logger = { log() {}, warn() {}, error() {} };
    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10, supabase: wiringSupabase(), logger,
    });
    expect(result.id).toBe('existing-id');
    expect(result.isNew).toBe(false);
  });

  /** table-aware fake: NO existing decision → new-created branch; audit insert throws (fail-open). */
  function newCreateSupabase() {
    let stageWorkQueried = false;
    return {
      rpc: async () => ({ data: { creates_decision: true, gate_type: 'kill', review_mode: 'review' }, error: null }),
      from(table) {
        if (table === 'chairman_decisions') {
          return {
            select() { return this; },
            eq() { return this; },
            single: async () => ({ data: null }), // none existing → create
            insert() { return { select: () => ({ single: async () => ({ data: { id: 'new-id' }, error: null }) }) }; },
          };
        }
        if (table === 'venture_stage_work') {
          stageWorkQueried = true;
          return {
            select() { return this; },
            eq() { return this; },
            not() { return this; },
            order() { return this; },
            limit() { return this; },
            maybeSingle: async () => ({ data: { health_score: 'green' } }),
          };
        }
        // audit_log: coverage check → 0, insert throws to prove fail-open on the NEW branch
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) { resolve({ count: 0, error: null }); },
          insert() { throw new Error('audit boom (new branch)'); },
        };
      },
      _stageWorkQueried: () => stageWorkQueried,
    };
  }

  it('scores + returns the decision on the NEW-created branch even when scoring throws (fail-open)', async () => {
    const logger = { log() {}, warn() {}, error() {} };
    const sb = newCreateSupabase();
    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 22, supabase: sb, logger,
    });
    expect(result.id).toBe('new-id');
    expect(result.isNew).toBe(true);
  });
});
