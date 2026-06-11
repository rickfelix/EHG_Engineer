import { describe, it, expect } from 'vitest';
import { orderByRankMap } from '../../scripts/worker-checkin.cjs';

// QF-20260610-986: baselined + un-baselined draft candidates are rank-sorted in ONE
// merged pool, so a fresh coordinator dispatch_rank can lift a draft above baselined
// candidates. These tests pin the ordering semantics the merged step-6 tier relies on
// (orderByRankMap stability + Infinity default), using the exact merged-entry shape.

const entry = (kind, key) => ({ kind, key });

describe('merged claim pool ordering (QF-20260610-986)', () => {
  it('rank-0 draft beats rank-5 baselined (the witnessed live failure)', () => {
    const merged = [
      entry('baselined', 'SD-BASE-MED-001'),   // rank 5
      entry('baselined', 'SD-BASE-MED-002'),   // rank 6
      entry('draft', 'SD-MAN-INFRA-CRITICAL-001'), // rank 0
    ];
    const ranks = new Map([
      ['SD-BASE-MED-001', 5],
      ['SD-BASE-MED-002', 6],
      ['SD-MAN-INFRA-CRITICAL-001', 0],
    ]);
    const out = orderByRankMap(merged, (x) => x.key, ranks);
    expect(out[0].key).toBe('SD-MAN-INFRA-CRITICAL-001');
    expect(out[0].kind).toBe('draft');
  });

  it('no fresh ranks -> input order preserved (baselined still strictly beats drafts)', () => {
    const merged = [
      entry('baselined', 'SD-B1'),
      entry('baselined', 'SD-B2'),
      entry('draft', 'SD-D1'),
      entry('draft', 'SD-D2'),
    ];
    const out = orderByRankMap(merged, (x) => x.key, new Map());
    expect(out.map((x) => x.key)).toEqual(['SD-B1', 'SD-B2', 'SD-D1', 'SD-D2']);
  });

  it('partially ranked: ranked rows lead, unranked keep input order after them', () => {
    const merged = [
      entry('baselined', 'SD-B1'), // unranked
      entry('baselined', 'SD-B2'), // rank 2
      entry('draft', 'SD-D1'),     // rank 1
      entry('draft', 'SD-D2'),     // unranked
    ];
    const out = orderByRankMap(merged, (x) => x.key, new Map([['SD-B2', 2], ['SD-D1', 1]]));
    expect(out.map((x) => x.key)).toEqual(['SD-D1', 'SD-B2', 'SD-B1', 'SD-D2']);
  });
});

describe('merged pool construction invariants (source-pinned)', () => {
  it('runCheckin builds ONE merged pool and rank-sorts it across kinds', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../scripts/worker-checkin.cjs', import.meta.url), 'utf8');
    // The merged tier exists and the old sequential 6.25 call inside runCheckin is gone.
    expect(src).toMatch(/ONE merged SD pool/);
    expect(src).toMatch(/sortByDispatchRank\(sb, merged, \(x\) => x\.key\)/);
    // selfClaimDraftSd survives as an exported wrapper but runCheckin no longer calls it.
    const runCheckinBody = src.slice(src.indexOf('async function runCheckin'), src.indexOf('async function main'));
    expect(runCheckinBody).not.toMatch(/selfClaimDraftSd\(/);
    // Dedup: baselined entry wins when both pools surface one SD (seen-set built baselined-first).
    expect(runCheckinBody).toMatch(/seen\.has\(c\.sd_id\)/);
    expect(runCheckinBody).toMatch(/seen\.has\(d\.sd_key\)/);
  });
});
