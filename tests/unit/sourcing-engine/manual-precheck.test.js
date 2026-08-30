/**
 * SD-LEO-INFRA-KILL-DUPLICATE-WORK-001 (LEG B) — checkAlreadyBuilt() regression tests.
 *
 * The dry-run replay named in the SD's own success criteria: given the exact 2026-08-29
 * distance-to-broke ask, checkAlreadyBuilt must return ALREADY-BUILT citing
 * SD-EHG-COCKPIT-DTB-BUILD-001 — the class of re-mint this SD exists to prevent.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/vision/vdr-registry.js', () => ({
  computeBuildGauge: vi.fn(async () => ({
    components: [{ capability: 'See distance-to-broke', status: 'built' }],
  })),
}));

import { checkAlreadyBuilt } from '../../../lib/sourcing-engine/manual-precheck.js';

function makeSupabaseMock(sds) {
  const from = (table) => {
    const b = {
      select() { return b; },
      order() { return b; },
      range() { return b; },
      then(resolve, reject) {
        return Promise.resolve(table === 'strategic_directives_v2' ? { data: sds, error: null } : { data: [], error: null })
          .then(resolve, reject);
      },
    };
    return b;
  };
  return { from };
}

describe('checkAlreadyBuilt', () => {
  it('replays the 2026-08-29 distance-to-broke ask: returns ALREADY-BUILT citing SD-EHG-COCKPIT-DTB-BUILD-001', async () => {
    const supabase = makeSupabaseMock([
      {
        sd_key: 'SD-EHG-COCKPIT-DTB-BUILD-001',
        title: 'Realize the distance-to-broke read: cash burn survivability cockpit',
        status: 'completed',
        metadata: { delivers_capabilities: ['See distance-to-broke'] },
      },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Realize the distance-to-broke read: from code-presence to a rendered cockpit survivability tile',
      description: 'Build the distance-to-broke cash burn survivability cockpit read',
    });

    expect(result.predicate).toBe('was-this-built');
    expect(result.result).toBe('ALREADY-BUILT');
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-DTB-BUILD-001');
    expect(result.re_emit).toBe(false);
  });

  it('returns NOT-FOUND when no existing SD matches (genuinely unbuilt)', async () => {
    const supabase = makeSupabaseMock([
      { sd_key: 'SD-UNRELATED-001', title: 'Something totally different', status: 'completed', metadata: {} },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Build a brand new capability nobody has touched',
      description: 'Genuinely novel work',
    });

    expect(result.result).toBe('NOT-FOUND');
    expect(result.citedSdKey).toBeNull();
  });

  it('shipped-but-outcome-unrealized: NOT-FOUND (do not hard-block), but flags re_emit and cites the SD', async () => {
    const supabase = makeSupabaseMock([
      {
        sd_key: 'SD-EHG-COCKPIT-VENTPERF-BUILD-001',
        title: 'Venture performance read cockpit surface',
        status: 'completed',
        metadata: { delivers_capabilities: ['Venture-performance read'] },
      },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Venture performance read cockpit surface',
      description: 'Reconcile the venture performance read',
    });

    // Capability 'Venture-performance read' has no gauge entry in this test's mocked
    // computeBuildGauge (only 'See distance-to-broke' is 'built') -- so it is NOT realized.
    expect(result.result).toBe('NOT-FOUND');
    expect(result.re_emit).toBe(true);
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-VENTPERF-BUILD-001');
  });
});
