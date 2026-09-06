/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-4 (Population B).
 *
 * scripts/reconcile-unlinked-tier3-qfs.mjs backfills quick_fixes rows Tier-3, terminal
 * (completed/closed), with no SD link (escalated_to_sd_id AND resolution_sd_id both null).
 * Mirrors the mocking pattern established by
 * tests/unit/scripts/reconcile-escalated-completed-sd-quick-fixes.test.js: the script loads
 * lib/quick-fix/status-writer.cjs via a real (non-mocked) require, so the REAL
 * setQuickFixStatus() runs against a supabase mock — exercising the script's actual
 * integration with the canonical writer, not a bypassable mock boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let supabaseInstance;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseInstance),
}));

/**
 * @param {object[]} quickFixes rows carry: id, status, routing_tier, escalated_to_sd_id,
 *   resolution_sd_id, disposition_reason_code.
 */
function makeSupabaseMock(quickFixes) {
  const updateCalls = [];
  const from = vi.fn((table) => {
    // table === 'quick_fixes' in every call this script makes.
    let isUpdate = false;
    let lastEqId = null;
    let pendingUpdate = null;
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col, val) => {
      if (col === 'id') {
        lastEqId = val;
        if (pendingUpdate) pendingUpdate.id = val;
      }
      return builder;
    });
    builder.in = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.update = vi.fn((payload) => {
      isUpdate = true;
      pendingUpdate = { id: null, payload };
      updateCalls.push(pendingUpdate);
      return builder;
    });
    // findTargetRows's read terminates on the bare (thenable) builder — no .maybeSingle()/.range().
    builder.then = (resolve) => {
      if (!isUpdate) {
        resolve({ data: quickFixes, error: null });
      }
      // The write path never reaches .then() — it terminates via .maybeSingle() below.
    };
    // setQuickFixStatus's internal lookup + update both terminate on .maybeSingle().
    builder.maybeSingle = vi.fn(async () => {
      if (isUpdate) {
        const row = quickFixes.find((r) => r.id === lastEqId);
        return { data: { id: lastEqId, status: pendingUpdate.payload.status ?? row?.status }, error: null };
      }
      const row = quickFixes.find((r) => r.id === lastEqId);
      return { data: { status: row?.status ?? null, escalation_reason: row?.escalation_reason ?? null }, error: null };
    });
    return builder;
  });
  return { from, _calls: { updateCalls } };
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://test.supabase';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

async function importScript() {
  vi.resetModules();
  return await import('../../../scripts/reconcile-unlinked-tier3-qfs.mjs');
}

describe('findTargetRows — three-way split: already-explained / known-manifest / unknown', () => {
  it('a row with an existing disposition_reason_code is classified alreadyExplained, not written', async () => {
    const quickFixes = [
      { id: 'QF-EXPLAINED', status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: 'reopened_false_positive_keyword_escalation: already explained' },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.alreadyExplained.map((r) => r.id)).toEqual(['QF-EXPLAINED']);
    expect(result.known).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('a row with disposition_reason_code=null AND present in DISPOSITIONS is classified known', async () => {
    const { DISPOSITIONS } = await importScript();
    const anyKnownId = Object.keys(DISPOSITIONS)[0];
    const quickFixes = [
      { id: anyKnownId, status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: null },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.known.map((r) => r.id)).toEqual([anyKnownId]);
    expect(result.unknown).toEqual([]);
  });

  it('a row with disposition_reason_code=null and NOT in DISPOSITIONS is classified unknown, never guessed at', async () => {
    const quickFixes = [
      { id: 'QF-BRAND-NEW-UNSEEN', status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: null },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.unknown.map((r) => r.id)).toEqual(['QF-BRAND-NEW-UNSEEN']);
    expect(result.known).toEqual([]);
  });
});

describe('TS-dry-run: dry-run performs zero writes', () => {
  it('reports the target population without calling update', async () => {
    const { DISPOSITIONS } = await importScript();
    const anyKnownId = Object.keys(DISPOSITIONS)[0];
    const quickFixes = [
      { id: anyKnownId, status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: null },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: false, log: () => {} });

    expect(result.known.map((r) => r.id)).toEqual([anyKnownId]);
    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });
});

describe('TS-live: live mode writes disposition_reason_code/disposed_by/disposed_at at the SAME status (no status change)', () => {
  it('writes via setQuickFixStatus with status unchanged, never the unrelated disposition enum column', async () => {
    const { DISPOSITIONS } = await importScript();
    const anyKnownId = Object.keys(DISPOSITIONS)[0];
    const quickFixes = [
      { id: anyKnownId, status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: null },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: true, log: () => {} });

    expect(result.backfilled.length).toBe(1);
    expect(supabaseInstance._calls.updateCalls.length).toBe(1);
    const { id, payload } = supabaseInstance._calls.updateCalls[0];
    expect(id).toBe(anyKnownId);
    expect(payload.status).toBe('completed'); // unchanged
    expect(payload.disposition_reason_code).toContain(DISPOSITIONS[anyKnownId].code);
    expect(payload.disposed_by).toContain('reconcile-unlinked-tier3-qfs.mjs');
    expect(payload.disposed_at).toBeTruthy();
    expect(payload).not.toHaveProperty('disposition');
  });

  it('never writes to a row already self-explained (existing disposition_reason_code)', async () => {
    const quickFixes = [
      { id: 'QF-EXPLAINED-2', status: 'closed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null, disposition_reason_code: 'some prior explanation' },
    ];
    supabaseInstance = makeSupabaseMock(quickFixes);

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: true, log: () => {} });

    expect(result.known).toEqual([]);
    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });
});

describe('DISPOSITIONS manifest integrity', () => {
  it('every manifest entry has a non-empty code and note', async () => {
    const { DISPOSITIONS } = await importScript();
    for (const [id, d] of Object.entries(DISPOSITIONS)) {
      expect(typeof id).toBe('string');
      expect(d.code).toBeTruthy();
      expect(d.note).toBeTruthy();
    }
  });

  it('the manifest has exactly 11 entries (measured live 2026-09-04: 16 total, 5 already self-explained)', async () => {
    const { DISPOSITIONS } = await importScript();
    expect(Object.keys(DISPOSITIONS).length).toBe(11);
  });
});
