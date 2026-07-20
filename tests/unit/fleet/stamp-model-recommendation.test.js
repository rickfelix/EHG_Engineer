/**
 * lib/coordinator/dispatch.cjs's stampModelRecommendation — SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001
 * (FR-2/FR-3/FR-4).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stampModelRecommendation } = require('../../../lib/coordinator/dispatch.cjs');

/**
 * Minimal fake Supabase client routing by table name. sdRow is returned for
 * strategic_directives_v2 selects; evidenceRows for sub_agent_execution_results selects.
 * updateSpy records every .update(...) payload passed for strategic_directives_v2.
 */
function fakeSb({ sdRow, evidenceRows = [], updateSpy = vi.fn(), throwOnSelect = false }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => (throwOnSelect ? Promise.reject(new Error('db down')) : Promise.resolve({ data: sdRow, error: null })),
            }),
          }),
          update: (payload) => ({
            eq: () => { updateSpy(payload); return Promise.resolve({ data: null, error: null }); },
          }),
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                limit: () => Promise.resolve({ data: evidenceRows, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('stampModelRecommendation (FR-2)', () => {
  it('AC-2-1: plain-Sonnet-shaped SD with no door_class gets model_recommendation="sonnet"', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-001' } };
    await stampModelRecommendation(fakeSb({ sdRow: { title: 'Fix a bug', description: 'small fix', metadata: {} } }), row);
    expect(row.payload.model_recommendation).toBe('sonnet');
    expect(row.payload.model_recommendation_criterion).toBeNull();
  });

  it('AC-2-2: a one_way-door SD gets model_recommendation="fable", criterion="R5"', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-002' } };
    await stampModelRecommendation(fakeSb({ sdRow: { title: 'x', description: 'y', metadata: { door_class: { door: 'one_way', reasons: ['migration_file'] } } }, evidenceRows: [{ id: 'r1' }] }), row);
    expect(row.payload.model_recommendation).toBe('fable');
    expect(row.payload.model_recommendation_criterion).toBe('R5');
  });

  it('AC-2-3 / TS-4: a target-SD lookup that throws leaves payload unchanged and does not propagate', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-003' } };
    await expect(stampModelRecommendation(fakeSb({ sdRow: null, throwOnSelect: true }), row)).resolves.toBeUndefined();
    expect(row.payload.model_recommendation).toBeUndefined();
  });

  it('AC-2-4: a caller-preset model_recommendation is never overwritten', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-004', model_recommendation: 'fable' } };
    await stampModelRecommendation(fakeSb({ sdRow: { title: 'Fix a bug', metadata: {} } }), row);
    expect(row.payload.model_recommendation).toBe('fable');
  });

  it('non-WORK_ASSIGNMENT rows and QF targets are untouched', async () => {
    const infoRow = { message_type: 'INFO', payload: {} };
    await stampModelRecommendation(fakeSb({ sdRow: {} }), infoRow);
    expect(infoRow.payload.model_recommendation).toBeUndefined();

    const qfRow = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'QF-20260707-001' } };
    await stampModelRecommendation(fakeSb({ sdRow: {} }), qfRow);
    expect(qfRow.payload.model_recommendation).toBeUndefined();
  });
});

describe('stampModelRecommendation (FR-3) — evidence-first enforcement', () => {
  it('AC-3-1 / TS-5: fable-tier with no evidence_packet and no recent sub_agent_execution_results row sets the missing flag', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-005' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'architecture decomposition of the SD tree', metadata: {} }, evidenceRows: [] }), row);
    expect(row.payload.model_recommendation).toBe('fable');
    expect(row.payload.model_recommendation_evidence_missing).toBe(true);
  });

  it('AC-3-2: fable-tier with payload.evidence_packet present does NOT set the missing flag', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-006', evidence_packet: 'Explore run 2026-07-07' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'architecture decomposition of the SD tree', metadata: {} }, evidenceRows: [] }), row);
    expect(row.payload.model_recommendation).toBe('fable');
    expect(row.payload.model_recommendation_evidence_missing).toBeUndefined();
  });

  it('AC-3-2b: fable-tier with a recent sub_agent_execution_results row does NOT set the missing flag', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-007' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'architecture decomposition of the SD tree', metadata: {} }, evidenceRows: [{ id: 'row-1' }] }), row);
    expect(row.payload.model_recommendation_evidence_missing).toBeUndefined();
  });

  it('AC-3-3: sonnet-tier never checks or sets the evidence-missing flag', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-008' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'plain small fix', metadata: {} }, evidenceRows: [] }), row);
    expect(row.payload.model_recommendation).toBe('sonnet');
    expect('model_recommendation_evidence_missing' in row.payload).toBe(false);
  });
});

describe('stampModelRecommendation (FR-4) — tier-decision audit trail', () => {
  // QF-20260720-597: the audit-trail write now goes through mergeMetadataKeys (atomic JSONB
  // partial-merge, lib/coordinator/safe-metadata-merge.mjs) instead of a read-spread-write
  // supabase .update({metadata}) — injected as the 4th param so these tests never touch a
  // live DB connection.
  it('AC-4-1: a fable/R1 decision appends one entry to metadata.model_tier_decisions', async () => {
    const mergeSpy = vi.fn(async () => ({ merged: true }));
    const row = { id: 'row-abc', message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-009' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'architecture decision', metadata: {} }, evidenceRows: [{ id: 'e1' }] }), row, console, mergeSpy);
    expect(mergeSpy).toHaveBeenCalledTimes(1);
    const [sdKey, patch] = mergeSpy.mock.calls[0];
    expect(sdKey).toBe('SD-X-009');
    expect(patch.model_tier_decisions).toHaveLength(1);
    expect(patch.model_tier_decisions[0]).toMatchObject({ criterion: 'R1', tier: 'fable', dispatch_row_id: 'row-abc' });
    expect(typeof patch.model_tier_decisions[0].at).toBe('string');
  });

  it('AC-4-2 / TS-6: metadata.model_tier_decisions is FIFO-capped at 20 entries', async () => {
    const mergeSpy = vi.fn(async () => ({ merged: true }));
    const existing = Array.from({ length: 20 }, (_, i) => ({ at: `t${i}`, criterion: 'R1', tier: 'fable', reason: 'x', dispatch_row_id: `old-${i}` }));
    const row = { id: 'row-new', message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-010' } };
    await stampModelRecommendation(fakeSb({ sdRow: { description: 'architecture decision', metadata: { model_tier_decisions: existing } }, evidenceRows: [{ id: 'e1' }] }), row, console, mergeSpy);
    const [, patch] = mergeSpy.mock.calls[0];
    expect(patch.model_tier_decisions).toHaveLength(20);
    expect(patch.model_tier_decisions[0].dispatch_row_id).toBe('old-1'); // oldest (old-0) dropped
    expect(patch.model_tier_decisions[19].dispatch_row_id).toBe('row-new');
  });

  it('AC-4-3: a metadata write failure is swallowed and never propagates', async () => {
    const mergeSpy = vi.fn(async () => { throw new Error('write failed'); });
    const sb = fakeSb({ sdRow: { description: 'architecture decision', metadata: {} }, evidenceRows: [{ id: 'e1' }] });
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-011' } };
    await expect(stampModelRecommendation(sb, row, console, mergeSpy)).resolves.toBeUndefined();
    // The dispatch-relevant fields still landed even though the audit-trail write failed.
    expect(row.payload.model_recommendation).toBe('fable');
  });

  it('QF-20260720-597: the write is a targeted key-merge, never a full-metadata-blob spread (the resurrection vector)', async () => {
    const mergeSpy = vi.fn(async () => ({ merged: true }));
    // The read snapshot carries a hold flag a concurrent coordinator clear may have already
    // flipped false in the DB — the merge call must NEVER re-send it.
    const row = { id: 'row-xyz', message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X-012' } };
    await stampModelRecommendation(
      fakeSb({ sdRow: { description: 'architecture decision', metadata: { needs_coordinator_review: true, requires_human_action: true } }, evidenceRows: [{ id: 'e1' }] }),
      row, console, mergeSpy
    );
    const [, patch] = mergeSpy.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['model_tier_decisions']);
    expect(patch.needs_coordinator_review).toBeUndefined();
    expect(patch.requires_human_action).toBeUndefined();
  });
});
