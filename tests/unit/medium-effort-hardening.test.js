/**
 * SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 — unit coverage for the 5 FRs.
 *
 * TEST_REQUIRES_DB: false — every supabase access goes through injected fakes
 * (HandoffRecorder DI) or pure functions; no network/DB access occurs.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// ── FR-2: freeze detector (TS-2) ──────────────────────────────────────────────
describe('FR-2: detectFreeze', () => {
  const { detectFreeze } = require('../../lib/fleet/freeze-detector.cjs');
  const NOW = Date.parse('2026-06-11T08:00:00Z');
  const min = (n) => n * 60_000;
  const sess = (id, msAgo, host = 'opsbox') => ({ session_id: id, hostname: host, heartbeat_at: new Date(NOW - msAgo).toISOString() });

  it('3 same-host sessions stopping together => FROZEN, one episode', () => {
    const r = detectFreeze([sess('a', min(18)), sess('b', min(16)), sess('c', min(14))], { now: NOW });
    expect(r.frozen).toBe(true);
    expect(r.episodes).toHaveLength(1);
    expect(r.frozenSessionIds.size).toBe(3);
  });

  it('a lone death is never a freeze', () => {
    const r = detectFreeze([sess('a', min(25))], { now: NOW });
    expect(r.frozen).toBe(false);
  });

  it('different hosts do not cluster together', () => {
    const r = detectFreeze([sess('a', min(15), 'h1'), sess('b', min(15), 'h2')], { now: NOW });
    expect(r.frozen).toBe(false);
  });

  it('heartbeats spread wider than the cluster window do not cluster', () => {
    const r = detectFreeze([sess('a', min(40)), sess('b', min(14))], { now: NOW });
    expect(r.frozen).toBe(false);
  });

  it('episode TTL: an old cluster is treated as real mass death (releases resume)', () => {
    const r = detectFreeze([sess('a', min(50)), sess('b', min(52)), sess('c', min(51))], { now: NOW });
    expect(r.frozen).toBe(false);
  });

  it('sessions without heartbeat timestamps are ignored, not crashed on', () => {
    const r = detectFreeze([{ session_id: 'x' }, sess('a', min(15)), sess('b', min(16))], { now: NOW });
    expect(r.frozen).toBe(true);
    expect(r.frozenSessionIds.has('x')).toBe(false);
  });
});

// ── FR-5: effort recommendation (TS-6) ───────────────────────────────────────
describe('FR-5: recommendEffort', () => {
  const { recommendEffort } = require('../../lib/fleet/effort-recommendation.cjs');

  it('QF => medium', () => {
    expect(recommendEffort({ kind: 'qf' }).effort).toBe('medium');
    expect(recommendEffort({ title: 'QF-20260611-123' }).effort).toBe('medium');
  });

  it('tight single-FR small SD => medium', () => {
    expect(recommendEffort({ kind: 'sd', sd_type: 'bugfix', title: 'Fix one selector', fr_count: 1, loc_estimate: 40 }).effort).toBe('medium');
  });

  it('orchestrator parent => xhigh', () => {
    expect(recommendEffort({ kind: 'sd', sd_type: 'orchestrator', title: 'Parent', fr_count: 1, loc_estimate: 10 }).effort).toBe('xhigh');
  });

  it('multi-FR scope => xhigh', () => {
    expect(recommendEffort({ kind: 'sd', fr_count: 5, loc_estimate: 40 }).effort).toBe('xhigh');
  });

  it('ambiguous/architectural keywords => xhigh', () => {
    expect(recommendEffort({ kind: 'sd', title: 'Refactor the session architecture', fr_count: 1 }).effort).toBe('xhigh');
  });

  it('unknown scope defaults conservative (xhigh)', () => {
    expect(recommendEffort({ kind: 'sd', title: 'Do the thing' }).effort).toBe('xhigh');
  });
});

// ── FR-5: dispatch stamping is advisory + fail-soft ──────────────────────────
describe('FR-5: stampEffortRecommendation', () => {
  const { stampEffortRecommendation } = require('../../lib/coordinator/dispatch.cjs');

  const fakeDb = (sdRow) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: sdRow, error: null }),
        }),
      }),
    }),
  });

  it('stamps a WORK_ASSIGNMENT payload for a QF target without DB lookup', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'QF-20260611-999' } };
    await stampEffortRecommendation(null, row); // null db: QF path never queries
    expect(row.payload.effort_recommendation).toBe('medium');
  });

  it('stamps xhigh for an orchestrator SD via lookup', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-001' } };
    await stampEffortRecommendation(fakeDb({ sd_type: 'orchestrator', title: 'Parent', description: '', metadata: {} }), row);
    expect(row.payload.effort_recommendation).toBe('xhigh');
  });

  it('never overrides a caller-provided recommendation', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'QF-1', effort_recommendation: 'xhigh' } };
    await stampEffortRecommendation(null, row);
    expect(row.payload.effort_recommendation).toBe('xhigh');
  });

  it('non-WORK_ASSIGNMENT rows untouched; lookup errors fail soft', async () => {
    const row = { message_type: 'INFO', payload: {} };
    await stampEffortRecommendation(null, row);
    expect(row.payload.effort_recommendation).toBeUndefined();

    const boom = { from: () => { throw new Error('db down'); } };
    const row2 = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-Y-001' } };
    await expect(stampEffortRecommendation(boom, row2)).resolves.toBeUndefined();
    expect(row2.payload.effort_recommendation).toBeUndefined();
  });
});

// ── FR-3: red-merge detector decision (TS-4) ─────────────────────────────────
describe('FR-3: red-merge decide()', async () => {
  const { decide } = await import('../../scripts/ci/red-merge-detector.mjs');
  const snap = (failed, sha = 'abc123def456') => ({ findings: [{ failed_count: failed, commit_sha: sha, branch: 'main' }] });

  it('red merge (failed count rose) => file_qf with signature', () => {
    const v = decide([snap(105, 'newsha'), snap(100)], []);
    expect(v.action).toBe('file_qf');
    expect(v.signature).toContain('newsha');
    expect(v.newFailed).toBe(105);
  });

  it('green or improving => noop', () => {
    expect(decide([snap(100), snap(100)], []).action).toBe('noop');
    expect(decide([snap(90), snap(100)], []).action).toBe('noop');
  });

  it('idempotent rerun: same signature already open => noop (dedup)', () => {
    const v = decide([snap(105, 'samesha'), snap(100)], [{ id: 'QF-1', description: 'red-merge:ci_test_failure_count:samesha ...' }]);
    expect(v.action).toBe('noop');
    expect(v.reason).toContain('dedup');
  });

  it('storm guard: any open red-merge QF blocks a second filing', () => {
    const v = decide([snap(110, 'othersha'), snap(105)], [{ id: 'QF-1', description: 'red-merge:ci_test_failure_count:somesha' }]);
    expect(v.action).toBe('noop');
    expect(v.reason).toContain('storm guard');
  });

  it('insufficient history => noop', () => {
    expect(decide([snap(105)], []).action).toBe('noop');
  });
});

// ── FR-1: recordFailure routing (TS-1) ───────────────────────────────────────
describe('FR-1: HandoffRecorder.recordFailure routing', async () => {
  const { HandoffRecorder } = await import('../../scripts/modules/handoff/recording/HandoffRecorder.js');

  function makeRecorder() {
    const inserts = []; // {table, row}
    const supabase = {
      from: (table) => ({
        insert: (row) => {
          inserts.push({ table, row });
          return { select: () => Promise.resolve({ data: [row], error: null }) };
        },
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { buildRejection: () => ({ executive_summary: 'r' }) },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    // _resolveToUUID + governance audit hit the DB — stub them.
    recorder._resolveToUUID = async () => '00000000-0000-0000-0000-000000000001';
    recorder._logGovernanceAudit = async () => {};
    return { recorder, inserts };
  }

  it('completion action (LEAD-FINAL-APPROVAL) failure → leo_handoff_executions, NOT sd_phase_handoffs', async () => {
    const { recorder, inserts } = makeRecorder();
    const id = await recorder.recordFailure('LEAD-FINAL-APPROVAL', 'SD-T-001', {
      actualScore: 40, message: 'gate failed', reasonCode: 'WIRE_CHECK_GATE_FAILED', gateCount: 5, issues: [], warnings: []
    });
    expect(id).toBeTruthy();
    const tables = inserts.map((i) => i.table);
    expect(tables).toContain('leo_handoff_executions');
    expect(tables).not.toContain('sd_phase_handoffs');
    const row = inserts.find((i) => i.table === 'leo_handoff_executions').row;
    expect(row.status).toBe('rejected');
    expect(row.rejection_reason).toBe('gate failed');
    expect(row.from_agent).toBe('LEAD');
  });

  it('phase transition (PLAN-TO-EXEC) failure → sd_phase_handoffs unchanged', async () => {
    const { recorder, inserts } = makeRecorder();
    const id = await recorder.recordFailure('PLAN-TO-EXEC', 'SD-T-001', {
      actualScore: 30, message: 'prd missing', reasonCode: 'PRD_MISSING', gateCount: 3, issues: [], warnings: []
    });
    expect(id).toBeTruthy();
    const tables = inserts.map((i) => i.table);
    expect(tables).toContain('sd_phase_handoffs');
    expect(tables).not.toContain('leo_handoff_executions');
    expect(inserts.find((i) => i.table === 'sd_phase_handoffs').row.status).toBe('rejected');
  });

  it('completion-action failure carries per-gate results in validation_details', async () => {
    const { recorder, inserts } = makeRecorder();
    await recorder.recordFailure('LEAD-FINAL-APPROVAL', 'SD-T-001', {
      actualScore: 40, message: 'x', reasonCode: 'Y', gateResults: { GATE_A: { passed: false } }, issues: [], warnings: []
    });
    const row = inserts.find((i) => i.table === 'leo_handoff_executions').row;
    expect(row.validation_details.gate_results).toEqual({ GATE_A: { passed: false } });
    expect(row.validation_details.gate_results_version).toBe(2);
  });
});

// ── FR-4: track-model-usage token flags parse (light contract pin) ───────────
describe('FR-4: track-model-usage token capture', () => {
  it('source carries the explicit-token path, transcript fallback, and fail-soft', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('scripts/track-model-usage.js', 'utf8');
    expect(src).toContain("tokens_source: 'caller'");
    expect(src).toContain("tokens_source: 'agent_transcript_jsonl'");
    expect(src).toContain('--input-tokens');
    expect(src).toContain('attributeAgentTokens');
    // fail-soft: attribution wrapped so identity logging never breaks
    expect(src).toMatch(/catch\s*\{\s*\n?\s*return null/);
  });
});
