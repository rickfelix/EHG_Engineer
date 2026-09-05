/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B1/FR-B3): HandoffRecorder joins a bypass_ledger
 * row back to whichever sd_phase_handoffs row it produced -- proven from BOTH the accepted
 * path (createArtifact, via recordSuccess) and the rejected path (recordFailure), since a
 * bypass attempt can end in either outcome.
 */
import { describe, it, expect } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';

const SD_UUID = '00000000-0000-0000-0000-000000000001';

/**
 * A generic, permissive Supabase stub that also records every insert/update call by table,
 * so assertions can inspect exactly what was written without hand-rolling per-table chains.
 */
function makeTrackingSupabase({ sdRow = { id: SD_UUID, sd_key: 'SD-POC-003' } } = {}) {
  const calls = { inserts: [], updates: [] };

  function chainFor(table) {
    const state = { table };
    const chain = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => (table === 'strategic_directives_v2' ? { data: sdRow, error: null } : { data: null, error: null }),
      single: async () => (table === 'strategic_directives_v2' ? { data: sdRow, error: null } : { data: null, error: null }),
      insert: (row) => {
        calls.inserts.push({ table, row });
        return {
          select: () => Promise.resolve({ data: [row], error: null }),
          ...chain,
        };
      },
      update: (patch) => {
        return {
          eq: (col, val) => {
            calls.updates.push({ table, patch, eq: { col, val } });
            const term = Promise.resolve({ data: null, error: null });
            // The real code chains .eq(...).is('handoff_id', null) (write-once guard) --
            // support that continuation while still resolving like a terminal thenable.
            return { then: term.then.bind(term), catch: term.catch.bind(term), is: () => term };
          },
        };
      },
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return chain;
  }

  const supabase = {
    from: (table) => chainFor(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { supabase, calls };
}

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B FR-B1: bypass_ledger.handoff_id join-back', () => {
  it('createArtifact (accepted path) joins bypass_ledger.handoff_id to the newly-minted sd_phase_handoffs row', async () => {
    const { supabase, calls } = makeTrackingSupabase();
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { build: () => ({ executive_summary: 'ok' }), logElements: () => {} },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    recorder._resolveToUUID = async () => SD_UUID;

    const result = {
      success: true,
      normalizedScore: 90,
      bypassed: true,
      bypassLedgerId: 'ledger-row-accepted-1',
      bypassReason: 'legitimate override',
      bypassedGates: ['SOME_GATE'],
      gateResults: {},
      warnings: [],
    };

    const handoffId = await recorder.createArtifact('EXEC-TO-PLAN', 'SD-POC-003', result, 'exec-1');
    expect(handoffId).toBeTruthy();

    const insertedHandoff = calls.inserts.find((i) => i.table === 'sd_phase_handoffs');
    expect(insertedHandoff).toBeTruthy();

    const ledgerJoin = calls.updates.find((u) => u.table === 'bypass_ledger');
    expect(ledgerJoin).toBeTruthy();
    expect(ledgerJoin.patch).toEqual({ handoff_id: insertedHandoff.row.id });
    expect(ledgerJoin.eq).toEqual({ col: 'id', val: 'ledger-row-accepted-1' });
  });

  it('createArtifact does NOT touch bypass_ledger when the result was not bypassed', async () => {
    const { supabase, calls } = makeTrackingSupabase();
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { build: () => ({ executive_summary: 'ok' }), logElements: () => {} },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    recorder._resolveToUUID = async () => SD_UUID;

    const result = { success: true, normalizedScore: 95, gateResults: {}, warnings: [] };
    await recorder.createArtifact('EXEC-TO-PLAN', 'SD-POC-003', result, 'exec-2');

    expect(calls.updates.find((u) => u.table === 'bypass_ledger')).toBeUndefined();
  });

  it('recordFailure (rejected path) joins bypass_ledger.handoff_id to the rejected sd_phase_handoffs row', async () => {
    const { supabase, calls } = makeTrackingSupabase();
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { buildRejection: () => ({ executive_summary: 'r' }) },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    recorder._resolveToUUID = async () => SD_UUID;
    recorder._logGovernanceAudit = async () => {};

    const result = {
      success: false,
      failedGate: 'GATE_BYPASS_SELF_AUTHORED_REFUSED',
      issues: ['refused'],
      warnings: [],
      bypassed: true,
      bypassLedgerId: 'ledger-row-rejected-1',
    };

    await recorder.recordFailure('EXEC-TO-PLAN', 'SD-POC-003', result);

    const insertedHandoff = calls.inserts.find((i) => i.table === 'sd_phase_handoffs');
    expect(insertedHandoff).toBeTruthy();

    const ledgerJoin = calls.updates.find((u) => u.table === 'bypass_ledger');
    expect(ledgerJoin).toBeTruthy();
    expect(ledgerJoin.patch).toEqual({ handoff_id: insertedHandoff.row.id });
    expect(ledgerJoin.eq).toEqual({ col: 'id', val: 'ledger-row-rejected-1' });
  });

  it('recordFailure does NOT touch bypass_ledger when the rejection was unrelated to a bypass attempt', async () => {
    const { supabase, calls } = makeTrackingSupabase();
    const recorder = new HandoffRecorder(supabase, {
      contentBuilder: { buildRejection: () => ({ executive_summary: 'r' }) },
      validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
    });
    recorder._resolveToUUID = async () => SD_UUID;
    recorder._logGovernanceAudit = async () => {};

    const result = { success: false, failedGate: 'SOME_GATE', issues: ['x'], warnings: [] };
    await recorder.recordFailure('EXEC-TO-PLAN', 'SD-POC-003', result);

    expect(calls.updates.find((u) => u.table === 'bypass_ledger')).toBeUndefined();
  });
});
