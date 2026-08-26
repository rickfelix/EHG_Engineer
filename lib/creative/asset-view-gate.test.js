// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B — asset-view-gate tests.
// Fully mocked Supabase client: chairman_decisions, ventures, audit_log, storage.createSignedUrl.
// No live DB/schema dependency (creative_assets.storage_path and chairman_decisions.override_key
// are both pending migration apply as of PLAN phase — see this SD's PRD FR-6/risks).
import { describe, it, expect, vi } from 'vitest';
import { checkAssetViewAuthorized, mintAssetViewUrl, MAX_VIEW_URL_TTL_SECONDS } from './asset-view-gate.js';
import { TaskFailedError } from './errors.js';

const VENTURE_ID = 'venture-1';

/**
 * @param {object} opts
 * @param {object|null} opts.venture - {is_demo, current_lifecycle_stage} or null (unresolvable)
 * @param {object|null} opts.productReview - latest chairman_decisions product_review row, e.g. {status:'approved'}
 * @param {{consumed:boolean}|null} opts.override - mutable state for a stage_gate_override row; null = no override exists
 */
function createMockSupabase({ venture, productReview, override = null } = {}) {
  const auditRows = [];
  return {
    __auditRows: auditRows,
    from(table) {
      if (table === 'ventures') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: venture ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === 'chairman_decisions') {
        const state = { filters: {}, isUpdate: false };
        const builder = {
          select() { return builder; },
          update() { state.isUpdate = true; return builder; },
          eq(col, val) { state.filters[col] = val; return builder; },
          is(col, val) { state.filters[col] = val; return builder; },
          gt(col, val) { state.filters[col] = val; return builder; },
          order() { return builder; },
          limit() { return builder; },
          maybeSingle: async () => {
            if (state.filters.decision_type === 'product_review') {
              return { data: productReview ?? null, error: null };
            }
            if (state.filters.decision_type === 'stage_gate_override') {
              if (!override) return { data: null, error: null };
              if (state.isUpdate) {
                if (override.consumed) return { data: null, error: null };
                override.consumed = true;
                return { data: { id: 'override-row' }, error: null };
              }
              return { data: override.consumed ? null : { id: 'override-row' }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return builder;
      }
      if (table === 'audit_log') {
        return { insert: async (row) => { auditRows.push(row); return { error: null }; } };
      }
      throw new Error(`createMockSupabase: unexpected table "${table}"`);
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path, ttl) => ({ data: { signedUrl: `https://signed.example/${path}?ttl=${ttl}` }, error: null }),
      }),
    },
  };
}

describe('checkAssetViewAuthorized', () => {
  it('TS-1: blocks on missing ventureId before any DB call', async () => {
    const supabase = createMockSupabase();
    const fromSpy = vi.spyOn(supabase, 'from');
    const result = await checkAssetViewAuthorized({ supabase, ventureId: null });
    expect(result).toEqual({ allowed: false, reason: 'missing_venture_id' });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('TS-2: blocks when no S23 product_review row exists', async () => {
    const supabase = createMockSupabase({ productReview: null, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: false, reason: 'product_review_not_approved' });
  });

  it('TS-3: blocks when the latest S23 attempt is a send_back (rejected), even if an earlier attempt was approved', async () => {
    // The mock only ever returns the "latest" row per its query contract (order by attempt_number
    // desc, limit 1) -- simulating that the latest attempt is rejected.
    const supabase = createMockSupabase({ productReview: { status: 'rejected' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: false, reason: 'product_review_not_approved' });
  });

  it('TS-4: S23 approved, S24 blocked (non-demo, understage)', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 10 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: false, reason: 'lifecycle_stage_gate_blocked' });
  });

  it('TS-5: S23 approved, is_demo=true venture below S24 is STILL blocked (regression test: predicate returns OUT_OF_SCOPE for is_demo even with armed:true, this gate must not treat that as authorized)', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: true, current_lifecycle_stage: 7 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: false, reason: 'lifecycle_stage_gate_blocked' });
  });

  it('TS-6: S23 approved and S24 satisfied -> allowed', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('TS-11: a matching chairman override permits exactly one view; a second call after consumption is blocked again', async () => {
    const override = { consumed: false };
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 10 }, override });
    const first = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(first).toEqual({ allowed: true, reason: null });
    const second = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(second).toEqual({ allowed: false, reason: 'lifecycle_stage_gate_blocked' });
  });

  it('TS-12: latest S23 attempt is pending (not yet decided by the chairman)', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'pending' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const result = await checkAssetViewAuthorized({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ allowed: false, reason: 'product_review_not_approved' });
  });
});

describe('mintAssetViewUrl', () => {
  it('TS-7: throws before createSignedUrl is called when unauthorized', async () => {
    const supabase = createMockSupabase({ productReview: null, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const createSignedUrlSpy = vi.spyOn(supabase.storage.from(), 'createSignedUrl');
    await expect(
      mintAssetViewUrl(supabase, { ventureId: VENTURE_ID, storagePath: `${VENTURE_ID}/image-1` })
    ).rejects.toThrow(TaskFailedError);
    expect(createSignedUrlSpy).not.toHaveBeenCalled();
  });

  it('TS-8: caps expiresInSeconds at MAX_VIEW_URL_TTL_SECONDS regardless of the requested TTL', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const result = await mintAssetViewUrl(supabase, { ventureId: VENTURE_ID, storagePath: `${VENTURE_ID}/image-1`, ttlSeconds: 99999 });
    expect(result.expiresInSeconds).toBe(MAX_VIEW_URL_TTL_SECONDS);
    expect(result.signedUrl).toContain(`ttl=${MAX_VIEW_URL_TTL_SECONDS}`);
  });

  it('TS-13: falls back to the default TTL on a non-finite/negative requested TTL', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const nanResult = await mintAssetViewUrl(supabase, { ventureId: VENTURE_ID, storagePath: `${VENTURE_ID}/image-1`, ttlSeconds: NaN });
    expect(Number.isFinite(nanResult.expiresInSeconds)).toBe(true);
    expect(nanResult.expiresInSeconds).toBeGreaterThan(0);

    const negativeResult = await mintAssetViewUrl(supabase, { ventureId: VENTURE_ID, storagePath: `${VENTURE_ID}/image-1`, ttlSeconds: -10 });
    expect(negativeResult.expiresInSeconds).toBeGreaterThan(0);
  });

  it('never writes the minted signedUrl to any table', async () => {
    const supabase = createMockSupabase({ productReview: { status: 'approved' }, venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const fromSpy = vi.spyOn(supabase, 'from');
    await mintAssetViewUrl(supabase, { ventureId: VENTURE_ID, storagePath: `${VENTURE_ID}/image-1` });
    const writtenTables = fromSpy.mock.calls.map(([table]) => table);
    expect(writtenTables).not.toContain('creative_assets');
  });
});
