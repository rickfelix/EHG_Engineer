/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-2): lib/roadmap/plan-check-status.js
 * computeAdmissionsByLinkage — TS-4.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeAdmissionsByLinkage } from '../../../lib/roadmap/plan-check-status.js';

const NOW = Date.now();
const cutoffMs = NOW - 48 * 3_600_000;
const inWindow = new Date(NOW - 1 * 3_600_000).toISOString();
const beforeWindow = new Date(cutoffMs - 10 * 3_600_000).toISOString();

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: computeAdmissionsByLinkage
// now paginates via fetchAllPaginated, so .or(...) must return a chainable builder
// (.order() returns itself, .range() resolves the page) rather than a bare Promise.
function fakeSupabase(rows) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => {
          const builder = {
            order: vi.fn(() => builder),
            range: vi.fn(async () => ({ data: rows, error: null })),
          };
          return builder;
        }),
      })),
    })),
  };
}

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: computeAdmissionsByLinkage', () => {
  it('TS-4: 2 linked (different waves) + 1 unlinked admission in-window -> correct by_wave/unlinked counts', async () => {
    const rows = [
      { sd_key: 'SD-A-001', metadata: { plan_linkage: { linked: true, wave_id: 'w1', wave_title: 'Wave 1' } }, created_at: inWindow, updated_at: inWindow },
      { sd_key: 'SD-B-001', metadata: { plan_linkage: { linked: true, wave_id: 'w2', wave_title: 'Wave 2' } }, created_at: inWindow, updated_at: inWindow },
      { sd_key: 'SD-C-001', metadata: { plan_linkage: { linked: false, unlinked_reason: 'emergent-fix' } }, created_at: inWindow, updated_at: inWindow },
    ];
    const result = await computeAdmissionsByLinkage(fakeSupabase(rows), { cutoffMs });
    expect(result.by_wave).toHaveLength(2);
    expect(result.by_wave.find((w) => w.wave_id === 'w1').count).toBe(1);
    expect(result.by_wave.find((w) => w.wave_id === 'w2').count).toBe(1);
    expect(result.unlinked).toEqual([{ reason: 'emergent-fix', count: 1 }]);
  });

  it('returns an empty-but-present shape (never undefined) when there are no admissions', async () => {
    const result = await computeAdmissionsByLinkage(fakeSupabase([]), { cutoffMs });
    expect(result).toEqual({ by_wave: [], unlinked: [], fence_lifts: [] });
  });

  it('rows with no plan_linkage stamp at all are skipped, not counted as unlinked', async () => {
    const rows = [{ sd_key: 'SD-OLD-001', metadata: {}, created_at: inWindow, updated_at: inWindow }];
    const result = await computeAdmissionsByLinkage(fakeSupabase(rows), { cutoffMs });
    expect(result.by_wave).toHaveLength(0);
    expect(result.unlinked).toHaveLength(0);
  });

  it('a still-fenced SD (needs_coordinator_review=true) is excluded from admissions even if created in-window', async () => {
    const rows = [{
      sd_key: 'SD-FENCED-001',
      metadata: { needs_coordinator_review: true, plan_linkage: { linked: false, unlinked_reason: 'emergent-fix' } },
      created_at: inWindow, updated_at: inWindow,
    }];
    const result = await computeAdmissionsByLinkage(fakeSupabase(rows), { cutoffMs });
    expect(result.unlinked).toHaveLength(0);
  });

  it('a pre-window SD that was recently un-fenced appears in fence_lifts with its linkage reason', async () => {
    const rows = [{
      sd_key: 'SD-LIFTED-001',
      metadata: { needs_coordinator_review: false, plan_linkage: { linked: false, unlinked_reason: 'venture-ops' } },
      created_at: beforeWindow, updated_at: inWindow,
    }];
    const result = await computeAdmissionsByLinkage(fakeSupabase(rows), { cutoffMs });
    expect(result.fence_lifts).toEqual([{ sd_key: 'SD-LIFTED-001', reason: 'venture-ops', lifted_at: inWindow }]);
  });
});
