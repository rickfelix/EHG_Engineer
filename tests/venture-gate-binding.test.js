/**
 * SD-LEO-FIX-MAKE-VENTURE-STAGE-001 — binding venture stage gates.
 * Offline: enforcement matrix for checkGateDebt/advanceStage, registry pins,
 * evaluated_by provenance, migration static pins.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { GATE_ENFORCEMENT, classifyGateRow } = await import('../lib/eva/gate-enforcement.js');
const { checkGateDebt, recordGateResult } = await import('../lib/eva/artifact-persistence-service.js');

/** Minimal mock: gateRows returned for eva_stage_gate_results, decisions for chairman_decisions. */
function mockDb({ gateRows = [], decisions = [], gateErr = null } = {}) {
  return {
    from(table) {
      const ctx = {};
      const b = {
        select() { return b; },
        eq() { return b; },
        limit() { return b; },
        upsert(row) {
          ctx.upserted = row;
          calls.upserts.push({ table, row });
          return { select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }) };
        },
        then(resolve) {
          if (table === 'eva_stage_gate_results') return resolve({ data: gateRows, error: gateErr });
          if (table === 'chairman_decisions') return resolve({ data: decisions, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return b;
    },
  };
}
const calls = { upserts: [] };

describe('registry — blocking vs advisory', () => {
  it('kill and exit are blocking; entry advisory; unknown defaults advisory', () => {
    expect(GATE_ENFORCEMENT.kill).toBe('blocking');
    expect(GATE_ENFORCEMENT.exit).toBe('blocking');
    expect(GATE_ENFORCEMENT.entry).toBe('advisory');
    expect(classifyGateRow({ gate_type: 'kill' })).toBe('blocking');
    expect(classifyGateRow({ gate_type: 'entry' })).toBe('advisory');
    expect(classifyGateRow({ gate_type: 'something_new' })).toBe('advisory');
    expect(classifyGateRow(null)).toBe('advisory');
  });

  it('stage-gates.js re-exports the registry (single conventional surface)', async () => {
    const sg = await import('../lib/agents/modules/venture-state-machine/stage-gates.js');
    expect(sg.GATE_ENFORCEMENT).toBe(GATE_ENFORCEMENT);
    expect(sg.classifyGateRow).toBe(classifyGateRow);
  });
});

describe('checkGateDebt — enforcement matrix', () => {
  it('TS-1: failed blocking gate + no decision → blocked, gate named', async () => {
    const db = mockDb({ gateRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }] });
    const debt = await checkGateDebt(db, { ventureId: 'v1', fromStage: 5 });
    expect(debt.blocked).toBe(true);
    expect(debt.failedGates[0].gate_type).toBe('kill');
  });

  it('TS-2: failed blocking gate + approved override decision → not blocked', async () => {
    const db = mockDb({
      gateRows: [{ gate_type: 'exit', passed: false }],
      decisions: [{ id: 'd1', decision: 'override', status: 'approved' }],
    });
    const debt = await checkGateDebt(db, { ventureId: 'v1', fromStage: 17 });
    expect(debt.blocked).toBe(false);
  });

  it('TS-3: failed ADVISORY gate only → not blocked', async () => {
    const db = mockDb({ gateRows: [{ gate_type: 'entry', passed: false }] });
    const debt = await checkGateDebt(db, { ventureId: 'v1', fromStage: 9 });
    expect(debt.blocked).toBe(false);
  });

  it('TS-4: passed blocking gates → not blocked (latest-evaluation semantics: the row IS the latest via upsert)', async () => {
    const db = mockDb({ gateRows: [{ gate_type: 'kill', passed: true }, { gate_type: 'exit', passed: true }] });
    const debt = await checkGateDebt(db, { ventureId: 'v1', fromStage: 5 });
    expect(debt.blocked).toBe(false);
  });

  it('TS-5: query error → fail-open (never strands the pipeline) with loud guard log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = mockDb({ gateErr: { code: 'XX000', message: 'transient blip' } });
    const debt = await checkGateDebt(db, { ventureId: 'v1', fromStage: 5 });
    expect(debt.blocked).toBe(false);
    expect(debt.error).toContain('blip');
    errSpy.mockRestore();
  });

  it('no gate rows at all → not blocked', async () => {
    const debt = await checkGateDebt(mockDb(), { ventureId: 'v1', fromStage: 2 });
    expect(debt.blocked).toBe(false);
  });
});

describe('recordGateResult — evaluated_by provenance', () => {
  it('new rows always carry non-null evaluated_by (explicit, source fallback, default)', async () => {
    calls.upserts.length = 0;
    const db = mockDb();
    await recordGateResult(db, { ventureId: 'v1', stageNumber: 5, gateType: 'kill', passed: true, evaluatedBy: 'worker-7' });
    await recordGateResult(db, { ventureId: 'v1', stageNumber: 5, gateType: 'exit', passed: true, source: 'stage-21' });
    await recordGateResult(db, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true });
    const evals = calls.upserts.map((u) => u.row.evaluated_by);
    expect(evals).toEqual(['worker-7', 'stage-21', 'eva-orchestrator']);
    expect(evals.every(Boolean)).toBe(true);
  });
});

describe('advanceStage wiring + migration pins (static)', () => {
  const svc = fs.readFileSync(path.join(ROOT, 'lib/eva/artifact-persistence-service.js'), 'utf8');

  it('advanceStage runs checkGateDebt before the RPC and throws GATE_BLOCKED with remediation', () => {
    expect(svc).toMatch(/const debt = await checkGateDebt\(supabase, \{ ventureId, fromStage \}\)/);
    expect(svc).toMatch(/err\.code = 'GATE_BLOCKED'/);
    expect(svc).toMatch(/decision='override'/);
    // debt check appears BEFORE the RPC call
    expect(svc.indexOf('checkGateDebt(supabase')).toBeLessThan(svc.indexOf("supabase.rpc('fn_advance_venture_stage'"));
  });

  it('migration is additive-only with scaffolding flag + debt view', () => {
    const up = fs.readFileSync(path.join(ROOT, 'database/migrations/20260610_gate_debt_view_and_scaffolding_flag.sql'), 'utf8');
    expect(up).toMatch(/ADD COLUMN IF NOT EXISTS is_scaffolding boolean NOT NULL DEFAULT false/);
    expect(up).toMatch(/CREATE OR REPLACE VIEW v_venture_gate_debt/);
    expect(up).toMatch(/gate_type IN \('kill', 'exit'\)/);
    expect(up).toMatch(/is_scaffolding IS DISTINCT FROM true/);
    expect(up).toMatch(/is_demo IS DISTINCT FROM true/);
    // additive only: no destructive statements
    expect(up).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(up).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(up).not.toMatch(/\bUPDATE\s+ventures\b/i);
  });

  it('DOWN drops view + column', () => {
    const down = fs.readFileSync(path.join(ROOT, 'database/migrations/20260610_gate_debt_view_and_scaffolding_flag_DOWN.sql'), 'utf8');
    expect(down).toMatch(/DROP VIEW IF EXISTS v_venture_gate_debt/);
    expect(down).toMatch(/DROP COLUMN IF EXISTS is_scaffolding/);
  });
});
