import { describe, it, expect } from 'vitest';
import { findDefectRows, buildRestamp } from '../../scripts/tier-stamp-rebaseline.mjs';

describe('findDefectRows', () => {
  it('flags a row with tier_rank set and model+effort both unset', () => {
    const rows = [{ session_id: 'a', metadata: { tier_rank: 4 } }];
    expect(findDefectRows(rows)).toHaveLength(1);
  });

  it('does NOT flag a row with tier_rank set and model+effort both present', () => {
    const rows = [{ session_id: 'a', metadata: { tier_rank: 1, model: 'sonnet', effort: 'low' } }];
    expect(findDefectRows(rows)).toHaveLength(0);
  });

  it('does NOT flag a row with no tier_rank at all (non-worker seat)', () => {
    const rows = [{ session_id: 'a', metadata: {} }];
    expect(findDefectRows(rows)).toHaveLength(0);
  });

  it('does NOT flag a row with only ONE of model/effort set (partial signal, different defect class)', () => {
    const rows = [{ session_id: 'a', metadata: { tier_rank: 4, model: 'sonnet' } }];
    expect(findDefectRows(rows)).toHaveLength(0);
  });

  it('handles a null/missing metadata object without throwing', () => {
    const rows = [{ session_id: 'a', metadata: null }, { session_id: 'b' }];
    expect(findDefectRows(rows)).toHaveLength(0);
  });
});

describe('buildRestamp', () => {
  it('sets tier_rank to the confirmed sonnet/medium rank and tags tier_rank_source', () => {
    const row = { session_id: 'x', metadata: { tier_rank: 4 } };
    const out = buildRestamp(row);
    expect(out.session_id).toBe('x');
    expect(out.metadata.tier_rank).not.toBe(4);
    expect(out.metadata.tier_rank_source).toMatch(/^bulk_rebaseline:SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001$/);
  });

  it('preserves other existing metadata keys additively', () => {
    const row = { session_id: 'x', metadata: { tier_rank: 4, sd_key: 'SD-KEEP-001', callsign: 'Zulu' } };
    const out = buildRestamp(row);
    expect(out.metadata.sd_key).toBe('SD-KEEP-001');
    expect(out.metadata.callsign).toBe('Zulu');
  });
});
