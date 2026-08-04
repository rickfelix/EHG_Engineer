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
  classifyVerdict,
  resolveSubagentVerdictMode,
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
    // QF-20260509-AUDIT-LOG-SHAPE: canonical audit_log shape is event_type
    // (NOT action — audit_log has no `action` column). Pin the current shape.
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'warning',
      event_type: 'gate_bypass',
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

// ─── FR-2: WAIT verdict on race-window write-lag ─────────────────────────────
// SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001
describe('validateSubagentEvidence — FR-2 WAIT branch', () => {
  beforeEach(() => { delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE; });
  afterEach(() => { delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE; });

  // 5s elapsed → WAIT (phase started within the 30s race window; agent mid-write)
  it('5s elapsed, missing evidence → WAIT (not FAIL)', async () => {
    const phaseStart = new Date(Date.now() - 5_000).toISOString();
    const supabase = makeSupabase({ phaseStart, evidenceRows: [] });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_WRITE_LAG');
    expect(result.wait_reason).toMatch(/TESTING/);
    expect(result.issues).toEqual([]); // waits carry no issues
  });

  // 35s elapsed → FAIL (outside the 30s race window; unchanged behavior)
  it('35s elapsed, missing evidence → FAIL (outside race window)', async () => {
    const phaseStart = new Date(Date.now() - 35_000).toISOString();
    const supabase = makeSupabase({ phaseStart, evidenceRows: [] });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_MISSING');
  });

  // No prior handoff AND no SD created_at → epoch anchor → outside window → FAIL (safe default)
  it('no prior handoff (epoch anchor), missing evidence → FAIL (safe default, not WAIT-forever)', async () => {
    const supabase = makeSupabase({ phaseStart: null, sdCreatedAt: null, evidenceRows: [] });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_MISSING');
  });

  // Evidence row present (even inside the race window) → PASS (unchanged)
  it('evidence row present within race window → PASS (unchanged)', async () => {
    const phaseStart = new Date(Date.now() - 5_000).toISOString();
    const supabase = makeSupabase({
      phaseStart,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: new Date().toISOString(), verdict: 'PASS' }]
    });
    const ctx = { sd: makeSD(), handoffType: 'PLAN-TO-EXEC' };
    const result = await validateSubagentEvidence(ctx, supabase);
    expect(result.passed).toBe(true);
    expect(result.wait).toBeUndefined();
  });
});

// ─── SD-FDBK-FIX-GATE-SUBAGENT-EVIDENCE-001: verdict is honoured, not discarded ─
// The gate used to SELECT verdict and throw it away: a crashed sub-agent's error
// row (verdict=FAIL) satisfied the gate identically to a genuine PASS.

describe('classifyVerdict — verdict policy', () => {
  it.each(['PASS', 'CONDITIONAL_PASS', 'WARNING'])('accepts %s', (v) => {
    expect(classifyVerdict(v)).toBe('accept');
  });

  // QF-20260804-569: PENDING left this list — it is now `nonevidence` (the run never
  // finished, so no check was performed). Its own classification is pinned in the
  // QF-20260804-569 describe block below. FAIL/BLOCKED/MANUAL_REQUIRED are unchanged.
  it.each(['FAIL', 'BLOCKED', 'MANUAL_REQUIRED'])('rejects %s', (v) => {
    expect(classifyVerdict(v)).toBe('reject');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(classifyVerdict(' pass ')).toBe('accept');
    expect(classifyVerdict('fail')).toBe('reject');
  });

  // 0 NULL / 0 empty verdicts measured across all 27,694 rows — this branch guards
  // a FUTURE unmodelled writer, and fails OPEN rather than manufacturing a block.
  it.each([null, undefined, '', '   ', 'SOMETHING_NEW'])('treats %p as unknown (accepted with warning)', (v) => {
    expect(classifyVerdict(v)).toBe('unknown');
  });
});

describe('resolveSubagentVerdictMode', () => {
  it('defaults to advisory when unset — a presence-only gate must not start blocking silently', () => {
    expect(resolveSubagentVerdictMode({})).toBe('advisory');
    expect(resolveSubagentVerdictMode({ SUBAGENT_VERDICT_MODE: '' })).toBe('advisory');
    expect(resolveSubagentVerdictMode({ SUBAGENT_VERDICT_MODE: 'advisory' })).toBe('advisory');
    expect(resolveSubagentVerdictMode({ SUBAGENT_VERDICT_MODE: 'BLOCK' })).toBe('advisory'); // exact match only
  });

  it('promotes to block on SUBAGENT_VERDICT_MODE=block', () => {
    expect(resolveSubagentVerdictMode({ SUBAGENT_VERDICT_MODE: 'block' })).toBe('block');
  });
});

describe('validateSubagentEvidence — verdict enforcement (block mode)', () => {
  // PLAN-TO-EXEC requires exactly ['TESTING'] — a single-agent required set keeps
  // these cases about the verdict, not about which agents are present.
  const ctx = () => ({ sd: makeSD(), handoffType: 'PLAN-TO-EXEC' });
  const rows = (...rs) => makeSupabase({ phaseStart: PHASE_START_ISO, evidenceRows: rs });

  beforeEach(() => {
    delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
    process.env.SUBAGENT_VERDICT_MODE = 'block';
  });
  afterEach(() => { delete process.env.SUBAGENT_VERDICT_MODE; });

  // (1) THE DEFECT: a crashed sub-agent's error row must NOT satisfy the gate.
  it('FAIL verdict does NOT satisfy a required agent', async () => {
    const supabase = rows({ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'FAIL' });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_BAD_VERDICT');
    expect(result.issues[0]).toMatch(/SUBAGENT_EVIDENCE_BAD_VERDICT/);
    expect(result.details.failing).toEqual([
      expect.objectContaining({ agent: 'TESTING', verdict: 'FAIL' })
    ]);
    // Distinct from absence — a row that says FAIL is not a missing row.
    expect(result.details.missing).toEqual([]);
    expect(result.wait).toBe(false);
  });

  // (2) A genuine PASS still satisfies.
  it('PASS verdict satisfies', async () => {
    const supabase = rows({ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.failing).toEqual([]);
  });

  // (3) CONDITIONAL_PASS is 23% of recent evidence and semantically a pass;
  // WARNING is an agent that completed with non-blocking concerns.
  it.each(['CONDITIONAL_PASS', 'WARNING'])('%s satisfies', async (verdict) => {
    const supabase = rows({ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(true);
    expect(result.details.failing).toEqual([]);
  });

  // QF-20260804-569: PENDING still DOES NOT SATISFY — it now blocks unconditionally via the
  // non-evidence path rather than via verdict mode, and is asserted there instead.
  it.each(['BLOCKED', 'MANUAL_REQUIRED'])('%s does not satisfy', async (verdict) => {
    const supabase = rows({ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_BAD_VERDICT');
  });

  // (4) Latest-row-per-agent. The old code flattened every row into a presence Set
  // despite a comment claiming "keep MAX(created_at)"; verdict-checking makes that
  // load-bearing, since FAIL-then-PASS and PASS-then-FAIL are otherwise ambiguous.
  it('older FAIL followed by newer PASS SATISFIES (re-run after fixing)', async () => {
    const supabase = rows(
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'FAIL' },
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T22:00:00Z', verdict: 'PASS' }
    );
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(true);
    expect(result.details.latest_verdicts).toEqual([{ agent: 'TESTING', verdict: 'PASS' }]);
  });

  it('older PASS followed by newer FAIL does NOT satisfy', async () => {
    const supabase = rows(
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T22:00:00Z', verdict: 'FAIL' }
    );
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(false);
    expect(result.details.latest_verdicts).toEqual([{ agent: 'TESTING', verdict: 'FAIL' }]);
  });

  it('latest-wins is order-independent (newest row returned first by the query)', async () => {
    const supabase = rows(
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T22:00:00Z', verdict: 'PASS' },
      { sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'FAIL' }
    );
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(true);
  });

  // Grouping is on the NORMALIZED code: 'Explore' and 'EXPLORE' are the same agent
  // to the presence check, so they must collapse the same way for verdicts.
  // Real-world case: the mis-invoked `--code EXPLORE` CLI writes a loader tombstone,
  // then the worker persists a real Task-tool 'Explore' row.
  it('normalized grouping: EXPLORE tombstone superseded by a newer Explore PASS', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [
        { sub_agent_code: 'VALIDATION', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
        { sub_agent_code: 'EXPLORE', created_at: '2026-04-24T21:10:00Z', verdict: 'FAIL' },
        { sub_agent_code: 'Explore', created_at: '2026-04-24T21:20:00Z', verdict: 'PASS' }
      ]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'LEAD-TO-PLAN' }, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.failing).toEqual([]);
  });

  it('normalized grouping: a newer EXPLORE tombstone supersedes an older Explore PASS', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [
        { sub_agent_code: 'VALIDATION', created_at: '2026-04-24T21:00:00Z', verdict: 'PASS' },
        { sub_agent_code: 'Explore', created_at: '2026-04-24T21:10:00Z', verdict: 'PASS' },
        { sub_agent_code: 'EXPLORE', created_at: '2026-04-24T21:20:00Z', verdict: 'FAIL' }
      ]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'LEAD-TO-PLAN' }, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.failing).toEqual([
      expect.objectContaining({ agent: 'Explore', verdict: 'FAIL' })
    ]);
  });

  // A bad verdict is NOT absence: it must never be excused by the FR-2 race window.
  it('FAIL verdict inside the race window still fails (not WAIT — the row exists)', async () => {
    const phaseStart = new Date(Date.now() - 5_000).toISOString();
    const supabase = makeSupabase({
      phaseStart,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: new Date().toISOString(), verdict: 'FAIL' }]
    });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_BAD_VERDICT');
  });

  // Absence still outranks a bad verdict — the MISSING contract is unchanged.
  it('missing agent + failing agent → still SUBAGENT_EVIDENCE_MISSING, with failing surfaced', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'FAIL' }]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'EXEC-TO-PLAN' }, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('SUBAGENT_EVIDENCE_MISSING');
    expect(result.details.missing).toEqual(['SECURITY']);
    expect(result.details.failing).toEqual([
      expect.objectContaining({ agent: 'TESTING', verdict: 'FAIL' })
    ]);
  });

  // Unknown verdicts fail OPEN, but loudly — never silently re-hollowing the gate.
  it.each([null, 'SOMETHING_NEW'])('unknown verdict %p passes but warns (even in block mode)', async (verdict) => {
    const supabase = rows({ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict });
    const result = await validateSubagentEvidence(ctx(), supabase);
    expect(result.passed).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/SUBAGENT_VERDICT_UNKNOWN/);
    expect(result.details.unknown_verdicts).toEqual([expect.objectContaining({ agent: 'TESTING' })]);
  });
});

// (5) THE CONTROL: the default must be safe. Without this, the change is
// fleet-fatal on day one — every SD whose latest evidence row is a tombstone
// would suddenly be unable to hand off.
describe('validateSubagentEvidence — advisory mode is the DEFAULT and does not block', () => {
  beforeEach(() => {
    delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
    delete process.env.SUBAGENT_VERDICT_MODE;
  });
  afterEach(() => { delete process.env.SUBAGENT_VERDICT_MODE; });

  it('FAIL verdict warns but PASSES when SUBAGENT_VERDICT_MODE is unset', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'FAIL' }]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'PLAN-TO-EXEC' }, supabase);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.warnings[0]).toMatch(/\[ADVISORY\].*SUBAGENT_EVIDENCE_BAD_VERDICT/);
    expect(result.warnings.join(' ')).toMatch(/SUBAGENT_VERDICT_MODE=block/);
    expect(result.details.verdict_mode).toBe('advisory');
    // The violation is still recorded — advisory means "surfaced", not "ignored".
    expect(result.details.failing).toEqual([
      expect.objectContaining({ agent: 'TESTING', verdict: 'FAIL' })
    ]);
  });

  it('explicit SUBAGENT_VERDICT_MODE=advisory also passes', async () => {
    process.env.SUBAGENT_VERDICT_MODE = 'advisory';
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'BLOCKED' }]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'PLAN-TO-EXEC' }, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.verdict_mode).toBe('advisory');
  });

  it('a passing verdict produces no advisory noise', async () => {
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'CONDITIONAL_PASS' }]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'PLAN-TO-EXEC' }, supabase);
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });
// ── SD-FDBK-FIX-GATE-SUBAGENT-EVIDENCE-001: gaps found reviewing the fix itself ──────────────

  it('REGRESSION: ERROR is a REJECTING verdict, not an unknown one', async () => {
    // ERROR is legal per the valid_verdict CHECK constraint — its migration comment reads
    // "When execution errors occur" — but it has ZERO rows, so measuring the TABLE could never
    // surface it. Only reading the constraint could. Left unclassified it fell through to
    // `unknown`, which this gate ACCEPTS with a warning: a verdict named for execution errors
    // would have satisfied the gate. That is this SD's own defect surviving inside its own fix.
    // THE POPULATION IS NOT THE DOMAIN.
    process.env.SUBAGENT_VERDICT_MODE = 'block';
    const supabase = makeSupabase({
      phaseStart: PHASE_START_ISO,
      evidenceRows: [{ sub_agent_code: 'TESTING', created_at: '2026-04-24T21:00:00Z', verdict: 'ERROR' }]
    });
    const result = await validateSubagentEvidence({ sd: makeSD(), handoffType: 'PLAN-TO-EXEC' }, supabase);
    expect(result.passed).toBe(false);
    // QF-20260804-569: ERROR now lands in `non_evidence` rather than `failing`. The original
    // intent of this regression — an execution-error verdict must NOT satisfy the gate, and must
    // NOT be swallowed as `unknown` — is preserved and STRENGTHENED: non-evidence blocks
    // unconditionally, where `failing` was subject to SUBAGENT_VERDICT_MODE (advisory by default).
    expect(result.details.non_evidence).toEqual([
      expect.objectContaining({ agent: 'TESTING', verdict: 'ERROR' })
    ]);
    expect(result.details.failing).toEqual([]);
    // And it must NOT be reported as an unknown verdict — that would mean it was accepted.
    expect(result.details.unknown_verdicts).toEqual([]);
  });

  it('every value in the valid_verdict CHECK domain is classified, none falls through', () => {
    // The gate accepts unknown verdicts by design (fail-open + warn). That is defensible ONLY if
    // every value the writer is ALLOWED to emit is classified — otherwise "unknown" quietly
    // becomes the accept path for a legal value, which is how ERROR slipped through above.
    const DOMAIN = ['PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS', 'WARNING', 'MANUAL_REQUIRED', 'PENDING', 'ERROR'];
    const unclassified = DOMAIN.filter((v) => classifyVerdict(v) === 'unknown');
    expect(unclassified).toEqual([]);
  });

  it('CONTROL: a genuinely unmodelled verdict still classifies as unknown', () => {
    // The test above must not pass by making classifyVerdict return 'reject' for everything —
    // the fail-open branch is deliberate and must still exist for values outside the constraint.
    expect(classifyVerdict('SOMETHING_INVENTED_LATER')).toBe('unknown');
    expect(classifyVerdict(null)).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// QF-20260804-569 — a crashed run is NOT evidence.
//
// ERROR (executor crashed) and PENDING (run never finished) used to sit in REJECT_VERDICTS, which
// made them subject to SUBAGENT_VERDICT_MODE — advisory by default. So a crashed run bought the
// same passage as a real one: "a row exists" was read as "the check ran". Measured on two separate
// SDs before this fix.
//
// The fix is a PREDICATE change, so these tests pin BOTH halves: the new class, and the fact that
// every other verdict is untouched. A change that quietly made FAIL stricter would be a different
// (and unrequested) behaviour change.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('QF-20260804-569: ERROR/PENDING are non-evidence, not rejections', () => {
  it('classifies a crashed run as nonevidence', () => {
    expect(classifyVerdict('ERROR')).toBe('nonevidence');
  });

  it('classifies a never-finished run as nonevidence', () => {
    expect(classifyVerdict('PENDING')).toBe('nonevidence');
  });

  it('is case- and whitespace-insensitive, like every other verdict path', () => {
    expect(classifyVerdict('  error ')).toBe('nonevidence');
    expect(classifyVerdict('Pending')).toBe('nonevidence');
  });

  it('TWO-SIDED: a genuine rejection is STILL a rejection, not non-evidence', () => {
    // The half that matters. If FAIL became nonevidence, this would silently convert an advisory
    // warning into a hard block for every SD in the fleet — a policy change nobody asked for.
    expect(classifyVerdict('FAIL')).toBe('reject');
    expect(classifyVerdict('BLOCKED')).toBe('reject');
    expect(classifyVerdict('MANUAL_REQUIRED')).toBe('reject');
  });

  it('TWO-SIDED: passing verdicts are untouched', () => {
    expect(classifyVerdict('PASS')).toBe('accept');
    expect(classifyVerdict('CONDITIONAL_PASS')).toBe('accept');
    expect(classifyVerdict('WARNING')).toBe('accept');
  });

  it('TWO-SIDED: unrecognised and empty verdicts still fail open as unknown', () => {
    expect(classifyVerdict('SOMETHING_NEW')).toBe('unknown');
    expect(classifyVerdict('')).toBe('unknown');
    expect(classifyVerdict(null)).toBe('unknown');
  });

  it('CONTROL: nonevidence is a DISTINCT class — not an alias for reject or unknown', () => {
    // Without this, the whole change could be satisfied by returning 'reject' (the old behaviour)
    // or 'unknown' (which fails OPEN and would be strictly worse than before).
    const ne = classifyVerdict('ERROR');
    expect(ne).not.toBe(classifyVerdict('FAIL'));
    expect(ne).not.toBe(classifyVerdict('SOMETHING_NEW'));
    expect(ne).not.toBe(classifyVerdict('PASS'));
  });
});
