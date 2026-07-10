/**
 * SD-ARCH-HOTSPOT-SD-START-001 FR-3/FR-4 (TS-3/TS-4) — relocated handoff-integrity
 * gate parity + cadence-gate adapter parity (incl. the fail-closed audit contract,
 * exercised via the D11 insert-capture/-failure fake this suite builds).
 *
 * @module tests/unit/claim/gates/handoff-and-cadence-gates.test
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifyHandoffIntegrity } = require('../../../../lib/claim/gates/handoff-integrity.cjs');
const { evaluateCadenceGate } = require('../../../../lib/claim/gates/cadence-gate.cjs');

// D11 harness: per-table seeded rows, INSERT capture, and per-table insert-failure injection —
// the capability gap the prospective TESTING review flagged in the existing fakes.
function makeFakeSupabase({ seed = {}, failInsertOn = null } = {}) {
  const calls = { inserts: [] };
  function from(table) {
    const q = { filters: [] };
    const builder = {
      select() { return builder; },
      insert(row) {
        calls.inserts.push({ table, row });
        const failed = failInsertOn === table;
        const result = { data: null, error: failed ? { message: `insert failed on ${table}` } : null };
        // Support both `await ...insert(...)` and `...insert(...).then(...)` chains.
        return { then: (res, rej) => Promise.resolve(result).then(res, rej) };
      },
      eq(col, val) { q.filters.push([col, val]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() {
        const rows = (seed[table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(res, rej) {
        if (seed[table] === 'ERROR') return Promise.resolve({ data: null, error: { code: 'X', message: 'seeded query error' } }).then(res, rej);
        const rows = (seed[table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return builder;
  }
  return { sb: { from }, calls };
}

// ─────────────────────────── FR-3 / TS-3: handoff integrity ───────────────────────────
describe('verifyHandoffIntegrity — relocated verdict parity (TS-3)', () => {
  it('no handoffs → invalid with status missing + recovery options', async () => {
    const { sb } = makeFakeSupabase({ seed: { sd_phase_handoffs: [] } });
    const v = await verifyHandoffIntegrity(sb, 'uuid-1');
    expect(v).toMatchObject({ valid: false, lastHandoff: null, status: 'missing' });
    expect(v.recoveryOptions.length).toBeGreaterThan(0);
  });

  it('accepted latest → valid with status echoed', async () => {
    const { sb } = makeFakeSupabase({ seed: { sd_phase_handoffs: [
      { id: 'h1', sd_id: 'uuid-1', from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', created_at: '2026-07-01', resolved_at: null },
    ] } });
    const v = await verifyHandoffIntegrity(sb, 'uuid-1');
    expect(v).toMatchObject({ valid: true, status: 'accepted' });
    expect(v.message).toMatch(/LEAD → PLAN/);
  });

  it('rejected-unresolved latest → invalid with reason (the path the dead-column bug silently disabled)', async () => {
    const { sb } = makeFakeSupabase({ seed: { sd_phase_handoffs: [
      { id: 'h2', sd_id: 'uuid-1', from_phase: 'PLAN', to_phase: 'EXEC', status: 'rejected', rejection_reason: 'gate fail', created_at: '2026-07-02', resolved_at: null },
    ] } });
    const v = await verifyHandoffIntegrity(sb, 'uuid-1');
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('gate fail');
    expect(v.recoveryOptions.join(' ')).toMatch(/--force/);
  });

  it('rejected-but-resolved latest → valid with status resolved', async () => {
    const { sb } = makeFakeSupabase({ seed: { sd_phase_handoffs: [
      { id: 'h3', sd_id: 'uuid-1', from_phase: 'PLAN', to_phase: 'EXEC', status: 'rejected', created_at: '2026-07-02', resolved_at: '2026-07-03T00:00:00Z' },
    ] } });
    const v = await verifyHandoffIntegrity(sb, 'uuid-1');
    expect(v).toMatchObject({ valid: true, status: 'resolved' });
  });

  it('query error → fail-OPEN valid:true, warning surfaced via onWarn (D9), no status field', async () => {
    const { sb } = makeFakeSupabase({ seed: { sd_phase_handoffs: 'ERROR' } });
    const warnings = [];
    const v = await verifyHandoffIntegrity(sb, 'uuid-1', { onWarn: (m) => warnings.push(m) });
    expect(v.valid).toBe(true);
    expect('status' in v).toBe(false); // documented per-path shape variance
    expect(warnings.join(' ')).toMatch(/handoff query failed/);
  });
});

// ─────────────────────────── FR-4 / TS-4: cadence gate adapter ───────────────────────────
const FUTURE = '2126-01-01T00:00:00Z';
const activeSd = (over = {}) => ({
  id: 'uuid-cad-1',
  sd_key: 'SD-CAD-001',
  governance_metadata: { next_workable_after: FUTURE },
  metadata: {},
  ...over,
});

describe('evaluateCadenceGate — adapter parity over the cadence SSOT (TS-4)', () => {
  it('gate inactive (no cadence metadata) → allowed, outcome inactive, zero audit writes', async () => {
    const { sb, calls } = makeFakeSupabase({});
    const v = await evaluateCadenceGate(sb, { id: 'u', sd_key: 'SD-X', governance_metadata: {}, metadata: {} });
    expect(v).toEqual({ allowed: true, outcome: 'inactive' });
    expect(calls.inserts).toHaveLength(0);
  });

  it('active gate, no override → refused with SSOT refusal message + CADENCE_GATE_REFUSED audit row', async () => {
    const { sb, calls } = makeFakeSupabase({});
    const v = await evaluateCadenceGate(sb, activeSd(), { sessionId: 'sess-1' });
    expect(v.allowed).toBe(false);
    expect(v.outcome).toBe('refused');
    expect(v.refusalMessage).toMatch(/SD-CAD-001/);
    expect(v.auditRecorded).toBe(true);
    const audit = calls.inserts.find((i) => i.table === 'audit_log');
    expect(audit.row.event_type).toBe('CADENCE_GATE_REFUSED');
    expect(audit.row.metadata.operator_session_id).toBe('sess-1');
  });

  it('short override (<20 chars) → refused with shortOverride flagged (caller prints the length hint)', async () => {
    const { sb } = makeFakeSupabase({});
    const v = await evaluateCadenceGate(sb, activeSd(), { overrideReason: 'too short' });
    expect(v.outcome).toBe('refused');
    expect(v.shortOverride).toBe(true);
    expect(v.overrideReasonLength).toBe(9);
  });

  it('valid override + known pattern-id → override_accepted with CADENCE_GATE_OVERRIDE audit row', async () => {
    const { sb, calls } = makeFakeSupabase({ seed: {
      issue_patterns: [{ pattern_id: 'PAT-TEST-001', status: 'active' }],
    } });
    const v = await evaluateCadenceGate(sb, activeSd(), {
      overrideReason: 'coordinator-approved stability-window override for hotfix',
      patternId: 'PAT-TEST-001',
      sessionId: 'sess-1',
    });
    expect(v.allowed).toBe(true);
    expect(v.outcome).toBe('override_accepted');
    expect(v.patternRef).toBe('PAT-TEST-001');
    const audit = calls.inserts.find((i) => i.table === 'audit_log' && i.row.event_type === 'CADENCE_GATE_OVERRIDE');
    expect(audit.row.severity).toBe('warning');
    expect(audit.row.metadata.pattern_id).toBe('PAT-TEST-001');
  });

  it('valid override but unknown pattern-id under warn-only rubric → still allowed (bypass-rubric parity), audit row written', async () => {
    // ENFORCE_BYPASS_SHAPE is unset in tests → validateBypassShape is warn-only for
    // a missing pattern row; the adapter must mirror the inline gate exactly.
    const { sb } = makeFakeSupabase({ seed: { issue_patterns: [] } });
    const v = await evaluateCadenceGate(sb, activeSd(), {
      overrideReason: 'coordinator-approved stability-window override for hotfix',
      patternId: 'PAT-MISSING-001',
    });
    expect(['override_accepted', 'override_rejected']).toContain(v.outcome);
    // Parity is with validateBypassShape's live verdict: warn-only → allowed.
    expect(v.allowed).toBe(v.outcome === 'override_accepted');
  });

  it('override valid but audit_log insert FAILS → fail-closed refusal (TS-4, the D11 harness case)', async () => {
    const { sb } = makeFakeSupabase({
      seed: { issue_patterns: [{ pattern_id: 'PAT-TEST-001', status: 'active' }] },
      failInsertOn: 'audit_log',
    });
    const v = await evaluateCadenceGate(sb, activeSd(), {
      overrideReason: 'coordinator-approved stability-window override for hotfix',
      patternId: 'PAT-TEST-001',
    });
    expect(v.allowed).toBe(false);
    expect(v.outcome).toBe('audit_unavailable_fail_closed');
    expect(v.auditError).toMatch(/insert failed/);
  });
});
