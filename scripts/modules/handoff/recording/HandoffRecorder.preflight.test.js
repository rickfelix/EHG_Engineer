/**
 * SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 — integration-level FR-1/FR-2/FR-3
 * tests against the real recordFailure()/createArtifact() wiring, using an
 * in-memory mock Supabase client (no live DB).
 *
 * TS-1: fast-preflight SUBAGENT_EVIDENCE_MISSING rejection persists the full
 *       remediation enumeration in validation_details.preflight_remediation.
 * TS-2: a pre-existing (non-preflight) gate rejection is unaffected —
 *       validation_details carries no preflight_remediation field.
 * TS-5: a handoff SAEM-rejected then later accepted in the same session
 *       carries the FR-3 telemetry stamp (metadata.preflight_remediation).
 * TS-6: a handoff accepted with no prior SAEM rejection carries no stamp.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/claim/claim-identity.js', () => ({
  resolveClaimIdentity: vi.fn(() => ({ sessionId: 'test-session-abc', source: 'env' }))
}));

const { HandoffRecorder } = await import('./HandoffRecorder.js');

/** Minimal in-memory Supabase-like mock supporting the query shapes this file uses. */
function createMockSupabase(seed = {}) {
  const tables = { ...seed };
  function ensure(table) {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = 'select';
      this.payload = null;
      this.limitN = null;
      this._single = false;
    }
    select() { return this; }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(col, val) { this.filters.push(r => r[col] === val); return this; }
    or(expr) {
      const clauses = expr.split(',').map(c => {
        const [col, , val] = c.split('.');
        return r => String(r[col]) === String(val);
      });
      this.filters.push(r => clauses.some(fn => fn(r)));
      return this;
    }
    order() { return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._single = true; return this; }
    then(resolve, reject) {
      this._exec().then(resolve, reject);
    }
    async _exec() {
      const rows = ensure(this.table);
      if (this.op === 'insert') {
        const inserted = Array.isArray(this.payload) ? this.payload : [this.payload];
        inserted.forEach(r => rows.push({ ...r }));
        return { data: inserted, error: null };
      }
      if (this.op === 'update') {
        const matched = rows.filter(r => this.filters.every(f => f(r)));
        matched.forEach(r => Object.assign(r, this.payload));
        return { data: matched, error: null };
      }
      if (this.op === 'delete') {
        tables[this.table] = rows.filter(r => !this.filters.every(f => f(r)));
        return { data: null, error: null };
      }
      let result = rows.filter(r => this.filters.every(f => f(r)));
      if (this.limitN != null) result = result.slice(0, this.limitN);
      if (this._single) {
        return result[0] ? { data: result[0], error: null } : { data: null, error: { message: 'not found' } };
      }
      return { data: result, error: null };
    }
  }

  return {
    tables,
    from(table) { return new QueryBuilder(table); },
    rpc: vi.fn().mockResolvedValue({ error: null })
  };
}

function fakeDeps() {
  return {
    contentBuilder: {
      buildRejection: () => ({}),
      build: () => ({}),
      logElements: () => {}
    },
    validationOrchestrator: {
      preValidateData: async () => ({ valid: true })
    }
  };
}

describe('HandoffRecorder — FR-1/FR-2/FR-3 wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-1: SUBAGENT_EVIDENCE_MISSING preflight rejection persists the remediation enumeration', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [{ id: 'SD-T-001', sd_key: 'SD-T-001' }]
    });
    const recorder = new HandoffRecorder(supabase, fakeDeps());

    const result = {
      reasonCode: 'PREREQUISITE_PREFLIGHT_FAILED',
      message: 'Prerequisite preflight failed: SUBAGENT_EVIDENCE_MISSING',
      preflightIssues: [
        {
          code: 'SUBAGENT_EVIDENCE_MISSING',
          message: 'Missing sub-agent evidence for: TESTING',
          remediation: 'Produce evidence for TESTING.',
          missingAgents: ['TESTING']
        }
      ]
    };

    await recorder.recordFailure('EXEC-TO-PLAN', 'SD-T-001', result, null);

    const row = supabase.tables.sd_phase_handoffs[0];
    expect(row.status).toBe('rejected');
    expect(row.validation_details.preflight_remediation).toEqual([
      { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'Missing sub-agent evidence for: TESTING', remediation: 'Produce evidence for TESTING.' }
    ]);
    expect(row.validation_details.rejecting_identity).toEqual({ sessionId: 'test-session-abc', source: 'env' });
  });

  it('TS-2: a pre-existing gate rejection (no preflightIssues) is unaffected', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [{ id: 'SD-T-002', sd_key: 'SD-T-002' }]
    });
    const recorder = new HandoffRecorder(supabase, fakeDeps());

    const result = {
      reasonCode: 'GATE_FAILED',
      message: 'Gate score below threshold',
      actualScore: 42,
      gateCount: 5
    };

    await recorder.recordFailure('LEAD-TO-PLAN', 'SD-T-002', result, null);

    const row = supabase.tables.sd_phase_handoffs[0];
    expect(row.status).toBe('rejected');
    expect(row.validation_details.preflight_remediation).toBeUndefined();
    expect(row.validation_details.rejecting_identity).toBeUndefined();
    expect(row.validation_details.summary.score).toBe(42);
  });

  it('TS-5: a SAEM-rejected then accepted handoff carries the FR-3 telemetry stamp', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [{ id: 'SD-T-005', sd_key: 'SD-T-005' }]
    });
    const recorder = new HandoffRecorder(supabase, fakeDeps());

    // 1. First rejection (SAEM).
    await recorder.recordFailure('EXEC-TO-PLAN', 'SD-T-005', {
      reasonCode: 'PREREQUISITE_PREFLIGHT_FAILED',
      preflightIssues: [{ code: 'SUBAGENT_EVIDENCE_MISSING', message: 'x', remediation: 'y', missingAgents: ['TESTING'] }]
    }, null);
    const rejectedId = supabase.tables.sd_phase_handoffs[0].id;

    // 2. Later acceptance of the same sd_id + to_phase.
    const acceptedId = await recorder.createArtifact('EXEC-TO-PLAN', 'SD-T-005', { gateResults: {} }, 'exec-id-1');

    const acceptedRow = supabase.tables.sd_phase_handoffs.find(r => r.id === acceptedId);
    expect(acceptedRow.status).toBe('accepted');
    expect(acceptedRow.metadata.preflight_remediation).toBeTruthy();
    expect(acceptedRow.metadata.preflight_remediation.rejectionIds).toEqual([rejectedId]);
  });

  it('TS-6: an accepted handoff with no prior SAEM rejection carries no stamp', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [{ id: 'SD-T-006', sd_key: 'SD-T-006' }]
    });
    const recorder = new HandoffRecorder(supabase, fakeDeps());

    const acceptedId = await recorder.createArtifact('EXEC-TO-PLAN', 'SD-T-006', { gateResults: {} }, 'exec-id-2');

    const acceptedRow = supabase.tables.sd_phase_handoffs.find(r => r.id === acceptedId);
    expect(acceptedRow.status).toBe('accepted');
    expect(acceptedRow.metadata.preflight_remediation).toBeUndefined();
  });
});
