/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-2.
 *
 * checkScreenDispositions is a pure VERIFIER (never a classifier) over
 * venture_screen_dispositions rows -- see module header for why: no structural
 * signal exists anywhere in the journeys schema to auto-verify an ENTRY_POINT
 * classification (measured against AltifyAI's live data during EXEC).
 */
import { describe, it, expect } from 'vitest';
import { checkScreenDispositions, recordScreenDisposition, DISPOSITION_CLASSES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-15-coverage-disposition-reader.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ unreachableScreens = [], dispositionRows = [], existingDisposition = null, insertShouldFail = false } = {}) {
  const upserts = [];
  return {
    _upserts: upserts,
    from(table) {
      if (table === 'venture_artifacts') {
        return {
          select() {
            return {
              eq() { return this; },
              maybeSingle: () => Promise.resolve({
                data: { artifact_data: { coverage_selfcheck: { unreachable_screens: unreachableScreens } } },
                error: null,
              }),
            };
          },
        };
      }
      if (table === 'venture_screen_dispositions') {
        return {
          select() {
            return {
              eq() { return this; },
              in() { return { limit: () => Promise.resolve({ data: dispositionRows, error: null }) }; },
              maybeSingle: () => Promise.resolve({ data: existingDisposition, error: null }),
            };
          },
          update(row) {
            upserts.push({ op: 'update', row });
            return { eq: () => Promise.resolve({ error: null }) };
          },
          insert(row) {
            upserts.push({ op: 'insert', row });
            if (insertShouldFail) {
              return { select() { return this; }, single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }) };
            }
            return { select() { return this; }, single: () => Promise.resolve({ data: { id: 'new-disp-1' }, error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('checkScreenDispositions', () => {
  it('reports allDisposed:true when unreachable_screens is empty', async () => {
    const supabase = buildMockSupabase({ unreachableScreens: [] });
    const result = await checkScreenDispositions({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.allDisposed).toBe(true);
    expect(result.dispositions).toEqual([]);
  });

  it('AltifyAI-shaped: 5 unreachable screens, all disposed -> allDisposed:true', async () => {
    const dispositionRows = [
      { screen_id: 'screen-0', disposition_class: 'ENTRY_POINT', disposition_status: 'COMPLETE', reason: 'landing page entry point', evidence_ref: 'marketing_landing_hero' },
      { screen_id: 'screen-1', disposition_class: 'ENTRY_POINT', disposition_status: 'COMPLETE', reason: 'signup entry point', evidence_ref: null },
      { screen_id: 'screen-6', disposition_class: 'D2_RETIRE', disposition_status: 'COMPLETE', reason: 'retired per chairman ruling', evidence_ref: '978b0c19-2b25-4af4-862a-b9fb2d67f9e2' },
      { screen_id: 'screen-7', disposition_class: 'D2_BUILD_THIRD_PARTY', disposition_status: 'OPEN', reason: 'build via auth provider profile component', evidence_ref: '978b0c19-2b25-4af4-862a-b9fb2d67f9e2' },
      { screen_id: 'screen-8', disposition_class: 'D2_BUILD_THIRD_PARTY', disposition_status: 'OPEN', reason: 'build via Stripe customer portal', evidence_ref: '978b0c19-2b25-4af4-862a-b9fb2d67f9e2' },
    ];
    const supabase = buildMockSupabase({ unreachableScreens: ['screen-0', 'screen-1', 'screen-6', 'screen-7', 'screen-8'], dispositionRows });
    const result = await checkScreenDispositions({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.allDisposed).toBe(true);
    expect(result.undisposedScreenIds).toEqual([]);
    expect(result.dispositions).toHaveLength(5);
    expect(result.dispositions.filter((d) => d.disposition_status === 'OPEN').map((d) => d.screen_id)).toEqual(['screen-7', 'screen-8']);
  });

  it('fails with the specific undisposed screen_id named, never a generic message', async () => {
    const dispositionRows = [
      { screen_id: 'screen-6', disposition_class: 'D2_RETIRE', disposition_status: 'COMPLETE', reason: 'retired', evidence_ref: '978b0c19' },
    ];
    const supabase = buildMockSupabase({ unreachableScreens: ['screen-6', 'screen-9-new'], dispositionRows });
    const result = await checkScreenDispositions({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.allDisposed).toBe(false);
    expect(result.undisposedScreenIds).toEqual(['screen-9-new']);
  });

  it('does not throw when supabase or ventureId is missing', async () => {
    await expect(checkScreenDispositions({ supabase: null, ventureId: 'v1' })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
    await expect(checkScreenDispositions({ supabase: buildMockSupabase(), ventureId: null })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
  });
});

describe('recordScreenDisposition', () => {
  it('rejects an invalid disposition_class', async () => {
    const supabase = buildMockSupabase();
    const result = await recordScreenDisposition({
      supabase, ventureId: 'v1', screenId: 'screen-0', dispositionClass: 'MADE_UP_CLASS', reason: 'x', logger: silentLogger,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid_disposition_class/);
  });

  it('rejects an empty or whitespace-only reason (mirrors the FR-3 override hatch pattern)', async () => {
    const supabase = buildMockSupabase();
    const empty = await recordScreenDisposition({ supabase, ventureId: 'v1', screenId: 'screen-0', dispositionClass: 'ENTRY_POINT', reason: '', logger: silentLogger });
    const whitespace = await recordScreenDisposition({ supabase, ventureId: 'v1', screenId: 'screen-0', dispositionClass: 'ENTRY_POINT', reason: '   ', logger: silentLogger });
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe('empty_or_whitespace_reason');
    expect(whitespace.ok).toBe(false);
    expect(whitespace.reason).toBe('empty_or_whitespace_reason');
  });

  it('D2_RETIRE is always forced to COMPLETE regardless of the passed dispositionStatus', async () => {
    const supabase = buildMockSupabase();
    const result = await recordScreenDisposition({
      supabase, ventureId: 'v1', screenId: 'screen-6', dispositionClass: 'D2_RETIRE', dispositionStatus: 'OPEN', reason: 'retired', evidenceRef: '978b0c19', logger: silentLogger,
    });
    expect(result.ok).toBe(true);
    expect(supabase._upserts[0].row.disposition_status).toBe('COMPLETE');
  });

  it('D2_BUILD_THIRD_PARTY defaults to OPEN unless the caller explicitly passes COMPLETE', async () => {
    const supabase = buildMockSupabase();
    const openResult = await recordScreenDisposition({
      supabase, ventureId: 'v1', screenId: 'screen-7', dispositionClass: 'D2_BUILD_THIRD_PARTY', reason: 'build via auth provider', evidenceRef: '978b0c19', logger: silentLogger,
    });
    expect(openResult.ok).toBe(true);
    expect(supabase._upserts[0].row.disposition_status).toBe('OPEN');

    const supabase2 = buildMockSupabase();
    const completeResult = await recordScreenDisposition({
      supabase: supabase2, ventureId: 'v1', screenId: 'screen-7', dispositionClass: 'D2_BUILD_THIRD_PARTY', dispositionStatus: 'COMPLETE', reason: 'auth provider surface verified live', evidenceRef: 'https://altifyai.rickfelix2000.workers.dev/settings', logger: silentLogger,
    });
    expect(completeResult.ok).toBe(true);
    expect(supabase2._upserts[0].row.disposition_status).toBe('COMPLETE');
  });

  it('updates (not duplicates) an existing disposition row', async () => {
    const supabase = buildMockSupabase({ existingDisposition: { id: 'existing-1' } });
    const result = await recordScreenDisposition({
      supabase, ventureId: 'v1', screenId: 'screen-0', dispositionClass: 'ENTRY_POINT', reason: 'landing page', evidenceRef: 'marketing_landing_hero', logger: silentLogger,
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBe('existing-1');
    expect(supabase._upserts[0].op).toBe('update');
  });

  it('DISPOSITION_CLASSES exports exactly the 3 documented classes', () => {
    expect(DISPOSITION_CLASSES).toEqual(['D2_RETIRE', 'D2_BUILD_THIRD_PARTY', 'ENTRY_POINT']);
  });
});
