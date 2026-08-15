/**
 * Regression test for QF-20260812-223.
 *
 * The RETRO auto-generator's PRD lookup filtered product_requirements_v2 by
 * directive_id alone. add-prd-to-database.js writes the SD's UUID into sd_id
 * and the sd_key TEXT into directive_id, and callers of this module (per
 * gatherSDMetadata's own UUID-or-sd_key acceptance) may pass either format as
 * sdId. A UUID sdId therefore never matched directive_id, silently returning
 * "no PRD" and capping every such retro's quality_score at 60 — measured live
 * on PRD-SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-A (signal 63129ac5).
 *
 * The fix (fetchPrdForSd) queries sd_id OR directive_id so either format
 * resolves correctly.
 */

import { describe, it, expect } from 'vitest';
import { fetchPrdForSd } from './db-operations.js';

// Mock supabase that captures the exact .or() filter string fetchPrdForSd
// builds and resolves the .from().select().or().maybeSingle() chain it uses.
function makeMockSupabase(mockResult) {
  const calls = { orFilter: null };
  const supabase = {
    from() {
      return {
        select() {
          return {
            or(filter) {
              calls.orFilter = filter;
              return {
                maybeSingle: async () => mockResult,
              };
            },
          };
        },
      };
    },
  };
  return { supabase, calls };
}

const UUID_SD_ID = '29d24771-78d0-4438-940d-c122401cf416';
const SD_KEY = 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-A';

describe('fetchPrdForSd — sd_id/directive_id format mismatch (QF-20260812-223)', () => {
  it('queries BOTH sd_id and directive_id, not directive_id alone', async () => {
    const { supabase, calls } = makeMockSupabase({ data: null, error: null });
    await fetchPrdForSd(supabase, UUID_SD_ID);
    expect(calls.orFilter).toContain(`sd_id.eq.${UUID_SD_ID}`);
    expect(calls.orFilter).toContain(`directive_id.eq.${UUID_SD_ID}`);
  });

  it('finds a PRD whose row only matches via sd_id (the exact defect this fixes)', async () => {
    // Simulates a PRD row keyed by sd_id=UUID with a directive_id that does NOT
    // equal the UUID sdId being queried -- the pre-fix .eq('directive_id', sdId)
    // would have returned no row here.
    const row = { id: 'PRD-' + SD_KEY, directive_id: SD_KEY, title: 'Test PRD' };
    const { supabase } = makeMockSupabase({ data: row, error: null });
    const result = await fetchPrdForSd(supabase, UUID_SD_ID);
    expect(result.found).toBe(true);
    expect(result.prd).toEqual(row);
  });

  it('still finds a PRD when sdId is passed as the sd_key (directive_id match)', async () => {
    const row = { id: 'PRD-' + SD_KEY, directive_id: SD_KEY, title: 'Test PRD' };
    const { supabase, calls } = makeMockSupabase({ data: row, error: null });
    const result = await fetchPrdForSd(supabase, SD_KEY);
    expect(calls.orFilter).toContain(`sd_id.eq.${SD_KEY}`);
    expect(calls.orFilter).toContain(`directive_id.eq.${SD_KEY}`);
    expect(result.found).toBe(true);
    expect(result.prd).toEqual(row);
  });

  it('returns found=false with the error message when genuinely no PRD exists', async () => {
    const { supabase } = makeMockSupabase({ data: null, error: { message: 'no rows' } });
    const result = await fetchPrdForSd(supabase, UUID_SD_ID);
    expect(result.found).toBe(false);
    expect(result.error).toBe('no rows');
  });
});
