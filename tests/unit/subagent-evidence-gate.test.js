/**
 * Unit Tests: Sub-Agent Evidence Gate (SD-LEO-INFRA-OPUS-MODULE-SUB-001)
 *
 * Covers: validateSubagentEvidence, createSubagentEvidenceGate factory,
 * REQUIRED_SUBAGENTS map, phase-start timestamp resolver, kill-switch,
 * and the 4 freshness scenarios from the PRD (TS-1..TS-4 + TS-7).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSubagentEvidence,
  createSubagentEvidenceGate,
  REQUIRED_SUBAGENTS
} from '../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SD_UUID = 'cd86796e-c55b-4891-a179-408918a8ab64';
const SD_KEY = 'SD-TEST-001';
const PHASE_START_ISO = '2026-04-24T20:00:00.000Z';

function makeSD() {
  return { id: SD_UUID, sd_key: SD_KEY };
}

/**
 * Supabase stub supporting the 3 query shapes used by the gate:
 *   - sd_phase_handoffs (phase-start resolver, primary path)
 *   - strategic_directives_v2 (phase-start resolver, fallback)
 *   - sub_agent_execution_results (evidence query)
 *   - audit_log (kill-switch writer)
 */
function makeSupabase({ phaseStart, sdCreatedAt, evidenceRows = [], auditInsertSpy = null } = {}) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        const q = {
          select: () => q,
          eq: () => q,
          not: () => q,
          order: () => q,
          limit: () => Promise.resolve({
            data: phaseStart ? [{ accepted_at: phaseStart }] : []
          })
        };
        return q;
      }
      if (table === 'strategic_directives_v2') {
        const q = {
          select: () => q,
          eq: () => q,
          single: () => Promise.resolve({
            data: sdCreatedAt ? { created_at: sdCreatedAt } : null
          })
        };
        return q;
      }
      if (table === 'sub_agent_execution_results') {
        const q = {
          select: () => q,
          eq: () => q,
          gte: () => Promise.resolve({ data: evidenceRows, error: null })
        };
        return q;
      }
      if (table === 'audit_log') {
        return {
          insert: (row) => {
            if (auditInsertSpy) auditInsertSpy(row);
            return Promise.resolve({ data: null, error: null });
          }
        };
      }
      return { select: () => ({}) };
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('REQUIRED_SUBAGENTS map', () => {
  it('includes all 5 handoff types', () => {
    expect(REQUIRED_SUBAGENTS).toHaveProperty('LEAD-TO-PLAN');
    expect(REQUIRED_SUBAGENTS).toHaveProperty('PLAN-TO-EXEC');
    expect(REQUIRED_SUBAGENTS).toHaveProperty('EXEC-TO-PLAN');
    expect(REQUIRED_SUBAGENTS).toHaveProperty('PLAN-TO-LEAD');
    expect(REQUIRED_SUBAGENTS).toHaveProperty('LEAD-FINAL-APPROVAL');
  });

  it('each value is an array of sub-agent codes', () => {
    for (const [_handoff, codes] of Object.entries(REQUIRED_SUBAGENTS)) {
      expect(Array.isArray(codes)).toBe(true);
    }
  });

  it('LEAD-FINAL-APPROVAL has empty required set (passes trivially)', () => {
    expect(REQUIRED_SUBAGENTS['LEAD-FINAL-APPROVAL']).toEqual([]);
  });
});

describe('createSubagentEvidenceGate factory', () => {
  it('returns a gate definition with required:true (blocking)', () => {
    const gate = createSubagentEvidenceGate(makeSupabase());
    expect(gate.name).toBe('GATE_SUBAGENT_EVIDENCE');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
    expect(gate.remediation).toBeTruthy();
  });
});

describe('validateSubagentEvidence', () => {
  beforeEach(() => {
    delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
  });

  afterEach(() => {
    delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
  });

  // TS-1: Empty evidence → FAIL
  it('TS-1: empty sub_agent_execution_results → FAIL with correct missing list', async () => {
    const supabase = makeSupabase({ phaseStart: PHASE_START_ISO, evidenceRows: [] });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_MISSING');
    expect(result.details.missing).toContain('TESTING');
    expect(result.issues[0]).toMatch(/SUBAGENT_EVIDENCE_MISSING/);
  });

  // TS-2: Partial match → FAIL listing only missing
  it('TS-2: partial match (1 of 2 required) → FAIL listing only missing', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' }]
    });
    const ctx = { sd: makeSD(), handoffType: 'EXEC-TO-PLAN' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.missing).toEqual(['SECURITY']);
    expect(result.details.present).toContain('TESTING');
  });

  // TS-3: Full match → PASS
  it('TS-3: all required agents fresh → PASS', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [
        { sub_agent_code: 'VALIDATION', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
        { sub_agent_code: 'Explore', created_at: '2026-04-24T21:05:00Z', verdict: 'PASS' }
      ]
    });
    const ctx = { sd: makeSD(), handoffType: 'LEAD-TO-PLAN' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.missing).toEqual([]);
    expect(result.score).toBe(100);
  });

  // TS-4: Stale row (created before phase start) treated as missing
  it('TS-4: stale row (created before phase start) → FAIL treating stale as missing', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      // Query filter is created_at >= phaseStartedAt. Simulate by returning empty when stale-only.
      evidenceRows: []
    });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.missing).toContain('TESTING');
  });

  // TS-5: Kill-switch env var bypasses gate with audit_log write
  it('TS-5: LEO_DISABLE_SUBAGENT_EVIDENCE_GATE bypasses with audit_log write', async () => {
    process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE = '1';
    const auditSpy = vi.fn();
    const supabase = makeSupabase({ phaseStart: PHASE_START_ISO, evidenceRows: [], auditInsertSpy: auditSpy });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
    expect(result.warnings[0]).toMatch(/BYPASSED/);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'warning',
      action: 'gate_bypass',
      metadata: expect.objectContaining({ gate: 'GATE_SUBAGENT_EVIDENCE' })
    }));
  });

  // LEAD-FINAL-APPROVAL has empty required set → always passes
  it('empty required set (LEAD-FINAL-APPROVAL) → PASS trivially', async () => {
    const supabase = makeSupabase({ evidenceRows: [] });
    const ctx = { sd: makeSD(), handoffType: 'LEAD-FINAL-APPROVAL' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.required).toEqual([]);
  });

  // TS-7: LEAD fallback to strategic_directives_v2.created_at
  it('TS-7: no prior handoff → falls back to strategic_directives_v2.created_at', async () => {
    const supabase = makeSupabase({
      phaseStart: null,
      sdCreatedAt: '2026-04-20T00:00:00Z',
      evidenceRows: [
        { sub_agent_code: 'VALIDATION', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
        { sub_agent_code: 'Explore', created_at: '2026-04-24T21:05:00Z', verdict: 'PASS' }
      ]
    });
    const ctx = { sd: makeSD(), handoffType: 'LEAD-TO-PLAN' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
    // Phase-start resolved from sd created_at (not null)
    expect(result.details.phase_started_at).toBe('2026-04-20T00:00:00.000Z');
  });

  it('normalizes sub_agent_code casing (VALIDATION matches validation-agent)', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [
        { sub_agent_code: 'validation-agent', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
        { sub_agent_code: 'Explore', created_at: '2026-04-24T21:05:00Z', verdict: 'PASS' }
      ]
    });
    const ctx = { sd: makeSD(), handoffType: 'LEAD-TO-PLAN' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
  });

  it('missing context (no supabase, no sd.id) → FAIL with MISSING_CONTEXT', async () => {
    const ctx = { sd: {}, handoffType: 'LEAD-TO-PLAN' };
    const result = await validateSubagentEvidence(ctx, null);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('MISSING_CONTEXT');
  });
});
