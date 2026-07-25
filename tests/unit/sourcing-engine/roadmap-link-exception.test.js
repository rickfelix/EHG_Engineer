/**
 * SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 — the counted, reasoned roadmap-link exception.
 *
 * TS-4 NOTE (why the coverage test is shaped the way it is): a test that merely records an
 * exception and then asserts coverage is unchanged is a TAUTOLOGY — computeWaveLinkageCoverage
 * never reads the exception record at all, so that assertion passes for ANY implementation,
 * including the wrong one that stores it in metadata.wave_disposition. The only form that can
 * fail is one that feeds the recorded metadata THROUGH the real coverage function and separately
 * asserts the wave_disposition key is absent. Both are done below.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRoadmapLinkException,
  countRoadmapLinkExceptions,
  NO_REASON_MARKER,
} from '../../../lib/sourcing-engine/roadmap-link-exception.js';
import { computeWaveLinkageCoverage } from '../../../lib/roadmap/wave-linkage-coverage.js';

const NOW = '2026-07-25T22:00:00.000Z';

describe('buildRoadmapLinkException — FR-3 (record unconditionally, operator reason kept distinct)', () => {
  it('records a supplied operator reason verbatim and flags it as supplied', () => {
    const ex = buildRoadmapLinkException('SD-X-001', '  urgent revenue false-gate, sourced in minutes  ', NOW);
    expect(ex.operator_reason).toBe('urgent revenue false-gate, sourced in minutes');
    expect(ex.reason_supplied).toBe(true);
    expect(ex.sd_key).toBe('SD-X-001');
    expect(ex.recorded_at).toBe(NOW);
  });

  it('records an EXPLICIT marker when no reason is supplied — never null, so the gap is countable', () => {
    for (const missing of [null, undefined, '', '   ']) {
      const ex = buildRoadmapLinkException('SD-X-001', missing, NOW);
      expect(ex.operator_reason).toBe(NO_REASON_MARKER);
      expect(ex.reason_supplied).toBe(false);
    }
  });

  it('never produces a wave_disposition key — that field is read as LINKED by the coverage gauge', () => {
    const ex = buildRoadmapLinkException('SD-X-001', 'a reason', NOW);
    expect(ex).not.toHaveProperty('wave_disposition');
    expect(Object.keys(ex).sort()).toEqual(['operator_reason', 'reason_supplied', 'recorded_at', 'sd_key']);
  });
});

describe('countRoadmapLinkExceptions — FR-5 (the count must be READ, split so zero is drivable)', () => {
  it('splits with_reason from without_reason so the drive-to-zero target is readable', () => {
    const rows = [
      { metadata: { roadmap_link_exception: buildRoadmapLinkException('a', 'because', NOW) } },
      { metadata: { roadmap_link_exception: buildRoadmapLinkException('b', null, NOW) } },
      { metadata: { roadmap_link_exception: buildRoadmapLinkException('c', null, NOW) } },
    ];
    expect(countRoadmapLinkExceptions(rows)).toEqual({ total: 3, with_reason: 1, without_reason: 2 });
  });

  it('ignores rows with no exception, and tolerates absent/!malformed metadata', () => {
    const rows = [{}, { metadata: null }, { metadata: {} }, null, { metadata: { roadmap_link_exception: null } }];
    expect(countRoadmapLinkExceptions(rows)).toEqual({ total: 0, with_reason: 0, without_reason: 0 });
    expect(countRoadmapLinkExceptions(null)).toEqual({ total: 0, with_reason: 0, without_reason: 0 });
  });
});

describe('TS-4 — a recorded exception must NOT raise plan-linkage coverage', () => {
  /** Mirrors the paginated-builder fake in tests/unit/wave-linkage-coverage.test.js:12-30 —
   *  computeWaveLinkageCoverage goes through fetchAllPaginated, so .not() must return a
   *  chainable builder whose .range() resolves, not a bare Promise. */
  function fakeSupabase(sdRows) {
    function terminal(data) {
      const builder = { order: () => builder, range: async () => ({ data, error: null }) };
      return builder;
    }
    return {
      from: (table) => ({
        strategic_directives_v2: { select: () => ({ not: () => terminal(sdRows) }) },
        roadmap_wave_items: { select: () => ({ not: () => terminal([]) }) },
      })[table],
    };
  }

  it('feeding the RECORDED metadata through the REAL coverage function does not increase linked', async () => {
    const ex = buildRoadmapLinkException('SD-UNLINKED-001', 'harness upkeep, no wave yet', NOW);
    const withException = [{ sd_key: 'SD-UNLINKED-001', sd_type: 'infrastructure', status: 'draft', metadata: { roadmap_link_exception: ex } }];
    const withoutException = [{ sd_key: 'SD-UNLINKED-001', sd_type: 'infrastructure', status: 'draft', metadata: {} }];

    const a = await computeWaveLinkageCoverage(fakeSupabase(withException));
    const b = await computeWaveLinkageCoverage(fakeSupabase(withoutException));

    // The exception must be INERT to the gauge — identical linked count either way.
    expect(a.linked).toBe(b.linked);
    expect(a.coverage).toBe(b.coverage);
  });

  it('MUTATION GUARD: storing the same record under wave_disposition WOULD inflate linked', async () => {
    // This is the wrong implementation FR-4 forbids. Asserting it genuinely inflates proves the
    // test above is measuring something real rather than passing vacuously.
    const ex = buildRoadmapLinkException('SD-UNLINKED-001', 'harness upkeep', NOW);
    const correct = [{ sd_key: 'SD-UNLINKED-001', sd_type: 'infrastructure', status: 'draft', metadata: { roadmap_link_exception: ex } }];
    const wrong = [{ sd_key: 'SD-UNLINKED-001', sd_type: 'infrastructure', status: 'draft', metadata: { wave_disposition: { kind: 'no_wave', reason: 'harness upkeep' } } }];

    const good = await computeWaveLinkageCoverage(fakeSupabase(correct));
    const bad = await computeWaveLinkageCoverage(fakeSupabase(wrong));

    expect(good.linked).toBe(0);
    expect(bad.linked).toBe(1); // wave-linkage-coverage.js:69 Boolean(wave_disposition)
    expect(bad.linked).toBeGreaterThan(good.linked);
  });
});
