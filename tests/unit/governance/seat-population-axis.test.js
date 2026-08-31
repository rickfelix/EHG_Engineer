/**
 * QF-20260831-313: seat-population axis for the orphan registry.
 *
 * Root-cause: chairman ruling f48e0abf / Solomon 3792b3ec -- three oversight layers each
 * audited did-the-layer-below-ACT, none audited the full registered-seat DENOMINATOR. A seat
 * in no gauge population is a dormant third state (not ticking, not holding, not
 * dead-and-reaped) = orphan capacity.
 *
 * ACCEPTANCE (from the QF text): registry rows for all seats; a fixture dormant seat appears
 * as reader:NONE; the weekly count includes capacity orphans; NEGATIVE -- a live gauge-covered
 * seat never counts.
 */
import { describe, it, expect } from 'vitest';
import {
  computeSeatPopulationRows,
  buildSeatOrphanEntries,
  seatDenominatorCheck,
  ENTRY_TYPES,
} from '../../../lib/governance/orphan-writers-registry.js';

describe('computeSeatPopulationRows', () => {
  it('ACCEPTANCE: a fixture dormant seat (in zero gauge populations) appears as reader:NONE', () => {
    const rows = computeSeatPopulationRows(
      ['dormant-seat'],
      [{ name: 'stale-session-sweep', seatIds: new Set(['other-seat']) }]
    );
    expect(rows).toEqual([{ seat_id: 'dormant-seat', reader: 'NONE', orphan: true }]);
  });

  it('a seat covered by a gauge population names that gauge, not NONE', () => {
    const rows = computeSeatPopulationRows(
      ['covered-seat'],
      [{ name: 'stale-session-sweep', seatIds: new Set(['covered-seat']) }]
    );
    expect(rows).toEqual([{ seat_id: 'covered-seat', reader: ['stale-session-sweep'], orphan: false }]);
  });

  it('a seat covered by MULTIPLE gauge populations names all of them', () => {
    const rows = computeSeatPopulationRows(
      ['multi-covered'],
      [
        { name: 'stale-session-sweep', seatIds: new Set(['multi-covered']) },
        { name: 'fleet-dashboard', seatIds: new Set(['multi-covered']) },
      ]
    );
    expect(rows[0].reader).toEqual(['stale-session-sweep', 'fleet-dashboard']);
    expect(rows[0].orphan).toBe(false);
  });

  it('registry rows for ALL seats: one row per seat, mixed coverage in one call', () => {
    const rows = computeSeatPopulationRows(
      ['a', 'b', 'c'],
      [{ name: 'g1', seatIds: new Set(['a']) }]
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.seat_id)).toEqual(['a', 'b', 'c']);
    expect(rows.find((r) => r.seat_id === 'a').orphan).toBe(false);
    expect(rows.find((r) => r.seat_id === 'b').orphan).toBe(true);
    expect(rows.find((r) => r.seat_id === 'c').orphan).toBe(true);
  });

  it('empty seats / gaugePopulations never throw', () => {
    expect(computeSeatPopulationRows([], [])).toEqual([]);
    expect(computeSeatPopulationRows(null, null)).toEqual([]);
  });
});

describe('buildSeatOrphanEntries', () => {
  it('produces registry-shaped (validateOrphanEntry-compatible) rows for orphan seats only', () => {
    const rows = computeSeatPopulationRows(
      ['dormant', 'covered'],
      [{ name: 'g1', seatIds: new Set(['covered']) }]
    );
    const entries = buildSeatOrphanEntries(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry_type).toBe('seat-population-orphan');
    expect(entries[0].reader).toEqual({ kind: 'none', description: expect.any(String) });
    expect(entries[0].writer).toEqual({ kind: 'seat', seat_id: 'dormant' });
    expect(entries[0].predicate.description).toContain('dormant');
    expect(entries[0].known_orphan).toBe(true);
  });

  it('NEGATIVE: a live gauge-covered seat never counts -- zero orphan entries when every seat is covered', () => {
    const rows = computeSeatPopulationRows(
      ['covered-1', 'covered-2'],
      [{ name: 'g1', seatIds: new Set(['covered-1', 'covered-2']) }]
    );
    expect(buildSeatOrphanEntries(rows)).toEqual([]);
  });

  it('seat-population-orphan is a registered ENTRY_TYPE', () => {
    expect(ENTRY_TYPES).toContain('seat-population-orphan');
  });
});

describe('seatDenominatorCheck (Solomon daily audit)', () => {
  it('THE WEEKLY COUNT INCLUDES CAPACITY ORPHANS: reports orphanCount and the uncovered seat ids', () => {
    const result = seatDenominatorCheck(
      ['a', 'b', 'c', 'd'],
      [{ name: 'g1', seatIds: new Set(['a', 'b']) }]
    );
    expect(result).toEqual({ totalSeats: 4, orphanCount: 2, orphanSeatIds: ['c', 'd'] });
  });

  it('full coverage: orphanCount is 0, not vacuously wrong', () => {
    const result = seatDenominatorCheck(['a', 'b'], [{ name: 'g1', seatIds: new Set(['a', 'b']) }]);
    expect(result.orphanCount).toBe(0);
    expect(result.orphanSeatIds).toEqual([]);
  });
});
