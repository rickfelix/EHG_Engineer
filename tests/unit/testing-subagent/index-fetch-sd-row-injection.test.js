/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F
 *
 * SECURITY finding (EXEC-phase review, MEDIUM): fetchSdRowForRepoResolution's original
 * `.or(\`id.eq.${sdId},sd_key.eq.${sdId}\`)` was not parameterized -- a comma/`)` in sdId
 * could inject additional filter clauses and resolve an UNRELATED SD's row. Fixed with two
 * sequential .eq() lookups (mirrors lib/supabase-client.js fetchSD's canonical pattern).
 *
 * This test calls the REAL exported fetchSdRowForRepoResolution() against an injected mock
 * client (adversarial /ship review finding: an earlier version of this test re-implemented
 * the query shape against a hand-rolled mock instead of calling the shipped function, which
 * would not have caught a future regression reintroducing a template-string filter).
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchSdRowForRepoResolution } from '../../../lib/sub-agents/testing/index.js';

function makeMockSupabase({ idMatches = {}, sdKeyMatches = {} } = {}) {
  const calls = [];
  return {
    _calls: calls,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => {
          calls.push({ col, val });
          return {
            maybeSingle: vi.fn(async () => {
              const table = col === 'id' ? idMatches : sdKeyMatches;
              return { data: table[val] || null, error: null };
            })
          };
        })
      }))
    }))
  };
}

describe('fetchSdRowForRepoResolution() — real function, .eq()-only, immune to .or() template injection', () => {
  it('a crafted sdId (comma-injection shape) resolves to null, never an unrelated SD row', async () => {
    const injectionAttempt = 'SD-DOES-NOT-EXIST,sd_key.eq.SD-VISION-V2-011';
    const mockSupabase = makeMockSupabase({
      sdKeyMatches: { 'SD-VISION-V2-011': { id: 'uuid-1', sd_key: 'SD-VISION-V2-011' } }
    });

    const result = await fetchSdRowForRepoResolution(injectionAttempt, mockSupabase);

    expect(result).toBeNull(); // NOT SD-VISION-V2-011 -- the literal crafted string never matches
    // Confirms the real function issues exactly two literal .eq() calls, no comma-splitting
    // or expression parsing: both received the exact injectionAttempt string, unmodified.
    expect(mockSupabase._calls).toEqual([
      { col: 'id', val: injectionAttempt },
      { col: 'sd_key', val: injectionAttempt }
    ]);
  });

  it('a legitimate sd_key resolves correctly via the fallback .eq() lookup', async () => {
    const mockSupabase = makeMockSupabase({
      sdKeyMatches: { 'SD-REAL-001': { id: 'uuid-2', sd_key: 'SD-REAL-001', target_application: 'EHG', metadata: {} } }
    });

    const result = await fetchSdRowForRepoResolution('SD-REAL-001', mockSupabase);

    expect(result).toEqual({ id: 'uuid-2', sd_key: 'SD-REAL-001', target_application: 'EHG', metadata: {} });
  });

  it('a legitimate uuid id resolves via the first .eq() lookup without a fallback query', async () => {
    const mockSupabase = makeMockSupabase({
      idMatches: { 'uuid-3': { id: 'uuid-3', sd_key: 'SD-REAL-002' } }
    });

    const result = await fetchSdRowForRepoResolution('uuid-3', mockSupabase);

    expect(result).toEqual({ id: 'uuid-3', sd_key: 'SD-REAL-002' });
    expect(mockSupabase._calls).toEqual([{ col: 'id', val: 'uuid-3' }]); // no sd_key fallback needed
  });
});
