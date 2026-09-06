/**
 * Vitest specs for acceptance-artifact-gate.
 * SD-LEO-INFRA-LEAD-FINAL-APPROVAL-001-B.
 *
 * Fixture grounding (live specimens, verified against the DB directly):
 *   - Fixture A mirrors SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001's real venture_artifacts
 *     row 54aa3ec6 (self-reports {"applies":true,"satisfied":false,...}) -> ARTIFACT_UNSATISFIED.
 *   - Fixture B mirrors SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001's state AT THE MOMENT
 *     it passed LEAD-FINAL-APPROVAL (2026-09-06T01:08Z): zero uat_test_runs rows existed for it
 *     then (the real row on file, b29e63cc, was written 06:20:43Z -- 5h12m AFTER completion, so
 *     asserting a pass_rate failure against it would misdescribe what the gate would have caught
 *     at completion time) -> ARTIFACT_MISSING, not ARTIFACT_UNSATISFIED.
 *   - Fixture D separately demonstrates the numeric_threshold path using that same real
 *     pass_rate=14.29 value, grounded but NOT asserted against the live WALKER SD.
 */
import { describe, it, expect } from 'vitest';
import {
  createAcceptanceArtifactGate,
  validateDeclaration,
  evaluateSatisfied,
  isBindingEnabled,
} from './acceptance-artifact-gate.js';

function chainable(terminal, calls) {
  const obj = {
    select(cols) { calls.select = cols; return obj; },
    match(m) { calls.match = m; return obj; },
    order(col, opts) { calls.order = { col, ...opts }; return obj; },
    limit: async (n) => { calls.limit = n; return terminal; },
  };
  return obj;
}

// `calls` is captured by reference so a test can inspect exactly what the gate asked for
// (TESTING F8: the original mock ignored its own arguments, so the header's "static select
// literal" and "order+limit(1) determinism" claims were documented but unfenced by any test).
function mockSupabase({ rows = [], error = null, throws = null } = {}, calls = {}) {
  return {
    calls,
    from(table) {
      calls.table = table;
      return chainable(throws ? Promise.reject(throws) : { data: rows, error }, calls);
    },
  };
}

const NO_DECLARATION_SD = { id: 'sd-no-declaration', metadata: {} };

const FIXTURE_A_SD = {
  id: 'sd-eleven-001',
  metadata: {
    acceptance_artifact: {
      table: 'venture_artifacts',
      match: { venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9', artifact_type: 'launch_uat_report', is_current: true },
      satisfied: { kind: 'self_reported_verdict', field: 'content' },
    },
  },
};
const FIXTURE_A_ROW = {
  id: '54aa3ec6-b9ae-450b-b46f-eec62876bc49',
  venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
  artifact_type: 'launch_uat_report',
  is_current: true,
  source: 'stage-23-dedicated-venture-uat',
  content: JSON.stringify({ applies: true, satisfied: false, reason: 'no UAT run recorded for venture at stage 23' }),
  created_at: '2026-08-30T18:25:39Z',
};

const FIXTURE_B_SD = {
  id: 'sd-walker-overrides-001',
  metadata: {
    acceptance_artifact: {
      table: 'uat_test_runs',
      match: { sd_id: 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001', status: 'completed' },
      satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op: 'gte', value: 100 },
    },
  },
};

const FIXTURE_D_ROW = {
  id: 'b29e63cc-56b6-47ef-bc5e-2eef0d185e09',
  sd_id: 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001',
  status: 'completed',
  pass_rate: 14.29,
  metadata: { evidence_hash: 'abc123' },
  created_at: '2026-09-06T06:20:43Z',
};

describe('createAcceptanceArtifactGate', () => {
  it('Fixture C: an SD with no declared acceptance_artifact passes cleanly and queries nothing', async () => {
    let queried = false;
    const supabase = { from() { queried = true; return chainable({ data: [], error: null }, {}); } };
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: NO_DECLARATION_SD });
    expect(result.passed).toBe(true);
    expect(result.details.declared).toBe(false);
    expect(queried).toBe(false);
  });

  it('Fixture A observe-only (default): passes with a warning naming ARTIFACT_UNSATISFIED, never blocks', async () => {
    const supabase = mockSupabase({ rows: [FIXTURE_A_ROW] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_A_SD });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.reason_code).toBe('ARTIFACT_UNSATISFIED');
    expect(result.warnings[0]).toMatch(/ARTIFACT_UNSATISFIED|does not satisfy/);
  });

  it('Fixture B (WALKER-at-completion-time): a declared pointer resolving to zero rows is ARTIFACT_MISSING', async () => {
    const supabase = mockSupabase({ rows: [] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_B_SD });
    expect(result.details.reason_code).toBe('ARTIFACT_MISSING');
    expect(result.passed).toBe(true); // observe-only default
  });

  it('Fixture D: numeric_threshold path on a real pass_rate=14.29 row REFUSES as ARTIFACT_UNSATISFIED', async () => {
    const supabase = mockSupabase({ rows: [FIXTURE_D_ROW] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_B_SD });
    expect(result.details.reason_code).toBe('ARTIFACT_UNSATISFIED');
    expect(result.details.row_id).toBe(FIXTURE_D_ROW.id);
  });

  it('a row lacking the minimum provenance field is ARTIFACT_PROVENANCE_ABSENT, not ARTIFACT_MISSING/UNSATISFIED', async () => {
    const noProvenanceRow = { ...FIXTURE_A_ROW, source: null };
    const supabase = mockSupabase({ rows: [noProvenanceRow] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_A_SD });
    expect(result.details.reason_code).toBe('ARTIFACT_PROVENANCE_ABSENT');
  });

  it('a malformed declaration (bad table) is DECLARATION_INVALID and passes without querying', async () => {
    let queried = false;
    const supabase = { from() { queried = true; return chainable({ data: [], error: null }, {}); } };
    const badSd = { id: 'sd-bad', metadata: { acceptance_artifact: { table: 'strategic_directives_v2', match: { id: 'x' }, satisfied: { kind: 'row_exists' } } } };
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: badSd });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBe('DECLARATION_INVALID');
    expect(queried).toBe(false);
  });

  it('a DB error during resolution fails open (passes with a warning, never blocks)', async () => {
    const supabase = mockSupabase({ throws: new Error('connection reset') });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_A_SD });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings[0]).toMatch(/lookup failed/);
  });

  it('BINDING mode actually blocks: ARTIFACT_MISSING becomes passed:false/score:0', async () => {
    const prevEnv = process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING;
    process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING = 'true';
    try {
      const supabase = mockSupabase({ rows: [] });
      const gate = createAcceptanceArtifactGate(supabase);
      const result = await gate.validator({ sd: FIXTURE_B_SD });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues[0]).toMatch(/zero rows/);
    } finally {
      if (prevEnv === undefined) delete process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING;
      else process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING = prevEnv;
    }
  });

  it('TESTING F5: the green path — a resolved row WITH provenance that satisfies its criterion passes cleanly', async () => {
    const calls = {};
    const supabase = mockSupabase({ rows: [FIXTURE_D_ROW] }, calls);
    const satisfiedSd = { id: 'sd-satisfied', metadata: { acceptance_artifact: { table: 'uat_test_runs', match: { sd_id: FIXTURE_D_ROW.sd_id }, satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op: 'lt', value: 100 } } } };
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: satisfiedSd });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBeUndefined();
    expect(result.details.row_id).toBe(FIXTURE_D_ROW.id);
    expect(result.warnings).toEqual([]);
  });

  it('TESTING F5: row_exists at the gate level is satisfied by mere resolution (no field check)', async () => {
    const rowExistsSd = { id: 'sd-row-exists', metadata: { acceptance_artifact: { table: 'venture_artifacts', match: { id: FIXTURE_A_ROW.id }, satisfied: { kind: 'row_exists' } } } };
    const supabase = mockSupabase({ rows: [FIXTURE_A_ROW] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: rowExistsSd });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBeUndefined();
  });

  it('TESTING F6: a query-level {data:null, error} object (never a throw -- supabase-js\'s real failure shape) fails open', async () => {
    const supabase = mockSupabase({ rows: null, error: { message: 'PGRST116: schema cache miss' } });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_A_SD });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings[0]).toMatch(/lookup failed/);
  });

  it('TESTING F8: the gate selects only the static per-table literal, applies match, and orders+limits(1) by default', async () => {
    const calls = {};
    const supabase = mockSupabase({ rows: [FIXTURE_A_ROW] }, calls);
    const gate = createAcceptanceArtifactGate(supabase);
    await gate.validator({ sd: FIXTURE_A_SD });
    expect(calls.table).toBe('venture_artifacts');
    expect(calls.select).toBe('id,venture_id,artifact_type,is_current,source,content,quality_score,created_at');
    expect(calls.match).toEqual(FIXTURE_A_SD.metadata.acceptance_artifact.match);
    expect(calls.order).toEqual({ col: 'created_at', ascending: false });
    expect(calls.limit).toBe(1);
  });

  it('TESTING F3: an explicit order_by is honored verbatim (ascending when desc:false)', async () => {
    const calls = {};
    const explicitSd = { id: 'sd-explicit-order', metadata: { acceptance_artifact: { table: 'venture_artifacts', match: { venture_id: 'v1' }, order_by: { column: 'quality_score', desc: false }, satisfied: { kind: 'row_exists' } } } };
    const supabase = mockSupabase({ rows: [FIXTURE_A_ROW] }, calls);
    const gate = createAcceptanceArtifactGate(supabase);
    await gate.validator({ sd: explicitSd });
    expect(calls.order).toEqual({ col: 'quality_score', ascending: true });
  });

  it('TESTING F1/F2: a prototype-pollution-shaped table name ("constructor") is DECLARATION_INVALID, never resolves', async () => {
    let queried = false;
    const supabase = { from() { queried = true; return chainable({ data: [], error: null }, {}); } };
    const evilSd = { id: 'sd-evil-table', metadata: { acceptance_artifact: { table: 'constructor', match: { id: 'x' }, satisfied: { kind: 'row_exists' } } } };
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: evilSd });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBe('DECLARATION_INVALID');
    expect(queried).toBe(false);
  });

  it('TESTING F1: a prototype-pollution-shaped numeric op ("constructor") is DECLARATION_INVALID even bound, never blocks', async () => {
    const prevEnv = process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING;
    process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING = 'true';
    try {
      const evilSd = { id: 'sd-evil-op', metadata: { acceptance_artifact: { table: 'uat_test_runs', match: { sd_id: 'x' }, satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op: 'constructor', value: 1 } } } };
      const supabase = mockSupabase({ rows: [FIXTURE_D_ROW] });
      const gate = createAcceptanceArtifactGate(supabase);
      const result = await gate.validator({ sd: evilSd });
      expect(result.passed).toBe(true);
      expect(result.details.reason_code).toBe('DECLARATION_INVALID');
    } finally {
      if (prevEnv === undefined) delete process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING;
      else process.env.ACCEPTANCE_ARTIFACT_GATE_BINDING = prevEnv;
    }
  });

  it('TESTING F2: a throw AFTER the query resolves (outside the inner DB try/catch) still fails open, via the outer defense-in-depth catch', async () => {
    // A Proxy standing in for a resolved row that throws on property access -- simulates any
    // unexpected post-query failure (e.g. a provenance predicate or field accessor throwing)
    // that the inner try/catch (scoped to the query itself) cannot see.
    const poisonedRow = new Proxy({}, { get() { throw new Error('unexpected row shape'); } });
    const supabase = mockSupabase({ rows: [poisonedRow] });
    const gate = createAcceptanceArtifactGate(supabase);
    const result = await gate.validator({ sd: FIXTURE_A_SD });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings[0]).toMatch(/unexpected error/);
  });
});

describe('isBindingEnabled', () => {
  it('is false unless the env flag is the literal string "true"', () => {
    expect(isBindingEnabled({})).toBe(false);
    expect(isBindingEnabled({ ACCEPTANCE_ARTIFACT_GATE_BINDING: 'yes' })).toBe(false);
    expect(isBindingEnabled({ ACCEPTANCE_ARTIFACT_GATE_BINDING: 'true' })).toBe(true);
  });
});

describe('validateDeclaration', () => {
  it('accepts a well-formed venture_artifacts self_reported_verdict declaration', () => {
    expect(validateDeclaration(FIXTURE_A_SD.metadata.acceptance_artifact).valid).toBe(true);
  });

  it('accepts a well-formed uat_test_runs numeric_threshold declaration', () => {
    expect(validateDeclaration(FIXTURE_B_SD.metadata.acceptance_artifact).valid).toBe(true);
  });

  it('rejects a non-allowlisted table', () => {
    const r = validateDeclaration({ table: 'sub_agent_execution_results', match: { id: 'x' }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('rejects a missing/empty/non-object match', () => {
    expect(validateDeclaration({ table: 'venture_artifacts', satisfied: { kind: 'row_exists' } }).valid).toBe(false);
    expect(validateDeclaration({ table: 'venture_artifacts', match: {}, satisfied: { kind: 'row_exists' } }).valid).toBe(false);
    expect(validateDeclaration({ table: 'venture_artifacts', match: ['x'], satisfied: { kind: 'row_exists' } }).valid).toBe(false);
  });

  it('rejects a non-allowlisted match column', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { created_by: 'x' }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('rejects a non-scalar match value', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { venture_id: { nested: true } }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('rejects an unknown satisfied.kind', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { venture_id: 'x' }, satisfied: { kind: 'always_true' } });
    expect(r.valid).toBe(false);
  });

  it('rejects numeric_threshold with a non-allowlisted op', () => {
    const r = validateDeclaration({ table: 'uat_test_runs', match: { sd_id: 'x' }, satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op: 'between', value: 1 } });
    expect(r.valid).toBe(false);
  });

  it('rejects numeric_threshold with a non-numeric value', () => {
    const r = validateDeclaration({ table: 'uat_test_runs', match: { sd_id: 'x' }, satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op: 'gte', value: '100' } });
    expect(r.valid).toBe(false);
  });

  it('TESTING F4: rejects a null match value (PostgREST eq.<value> can never match a real SQL NULL)', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { is_current: null }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('TESTING F3: rejects order_by with column but no desc (an omitted desc used to silently mean ascending)', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { venture_id: 'x' }, order_by: { column: 'created_at' }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('TESTING F3: rejects order_by.desc as a non-boolean (the string "false" is truthy)', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { venture_id: 'x' }, order_by: { column: 'created_at', desc: 'false' }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(false);
  });

  it('accepts a well-formed explicit order_by (column + boolean desc)', () => {
    const r = validateDeclaration({ table: 'venture_artifacts', match: { venture_id: 'x' }, order_by: { column: 'quality_score', desc: false }, satisfied: { kind: 'row_exists' } });
    expect(r.valid).toBe(true);
  });

  it('TESTING F1/F2: rejects every Object.prototype-shaped table name (constructor/toString/__proto__/hasOwnProperty/valueOf)', () => {
    for (const table of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const r = validateDeclaration({ table, match: { id: 'x' }, satisfied: { kind: 'row_exists' } });
      expect(r.valid, `table="${table}" should be rejected`).toBe(false);
    }
  });

  it('TESTING F1: rejects every Object.prototype-shaped numeric_threshold op', () => {
    for (const op of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      const r = validateDeclaration({ table: 'uat_test_runs', match: { sd_id: 'x' }, satisfied: { kind: 'numeric_threshold', field: 'pass_rate', op, value: 1 } });
      expect(r.valid, `op="${op}" should be rejected`).toBe(false);
    }
  });
});

describe('evaluateSatisfied', () => {
  it('self_reported_verdict: applies:true + satisfied:false REFUSES', () => {
    const r = evaluateSatisfied(FIXTURE_A_ROW, { kind: 'self_reported_verdict', field: 'content' });
    expect(r.satisfied).toBe(false);
  });

  it('self_reported_verdict: applies:false is treated as satisfied (criterion does not apply)', () => {
    const row = { content: JSON.stringify({ applies: false, satisfied: false }) };
    const r = evaluateSatisfied(row, { kind: 'self_reported_verdict', field: 'content' });
    expect(r.satisfied).toBe(true);
  });

  it('self_reported_verdict: no parseable verdict at all is treated as satisfied (no opinion, not a defect)', () => {
    const row = { content: 'not json' };
    const r = evaluateSatisfied(row, { kind: 'self_reported_verdict', field: 'content' });
    expect(r.satisfied).toBe(true);
  });

  it('row_exists: always satisfied once a row is resolved', () => {
    expect(evaluateSatisfied({}, { kind: 'row_exists' }).satisfied).toBe(true);
  });

  it('numeric_threshold: 14.29 gte 100 is not satisfied', () => {
    const r = evaluateSatisfied(FIXTURE_D_ROW, { kind: 'numeric_threshold', field: 'pass_rate', op: 'gte', value: 100 });
    expect(r.satisfied).toBe(false);
  });

  it('numeric_threshold: a non-numeric field value is not satisfied', () => {
    const r = evaluateSatisfied({ pass_rate: null }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'gte', value: 100 });
    expect(r.satisfied).toBe(false);
  });

  it('TESTING F7: every numeric_threshold op is actually exercised (gt/lte/lt/eq, not just gte)', () => {
    expect(evaluateSatisfied({ pass_rate: 14.29 }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'gt', value: 14 }).satisfied).toBe(true);
    expect(evaluateSatisfied({ pass_rate: 14.29 }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'lte', value: 14.29 }).satisfied).toBe(true);
    expect(evaluateSatisfied({ pass_rate: 14.29 }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'lt', value: 100 }).satisfied).toBe(true);
    expect(evaluateSatisfied({ pass_rate: 14.29 }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'eq', value: 14.29 }).satisfied).toBe(true);
    expect(evaluateSatisfied({ pass_rate: 14.29 }, { kind: 'numeric_threshold', field: 'pass_rate', op: 'eq', value: 100 }).satisfied).toBe(false);
  });
});
