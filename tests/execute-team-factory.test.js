/**
 * Unit tests for execute-team-factory.mjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-003)
 *
 * Pure function tests for slot identity assignment. DB-touching functions are
 * exercised by integration tests.
 */

import { describe, test, expect } from 'vitest';
import { buildSlotIdentities, MAX_WORKERS } from '../lib/execute/execute-team-factory.mjs';

describe('execute-team-factory.buildSlotIdentities', () => {
  test('1 worker → Alpha/blue', () => {
    const slots = buildSlotIdentities(1);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ slot: 0, callsign: 'Alpha', color: 'blue' });
  });

  test('3 workers → Alpha/Bravo/Charlie with distinct colors', () => {
    const slots = buildSlotIdentities(3);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.callsign)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const colors = slots.map((s) => s.color);
    expect(new Set(colors).size).toBe(3);
  });

  test('8 workers → all NATO callsigns assigned', () => {
    const slots = buildSlotIdentities(8);
    expect(slots).toHaveLength(8);
    const callsigns = slots.map((s) => s.callsign);
    expect(callsigns).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
  });

  test('rejects 0 workers', () => {
    expect(() => buildSlotIdentities(0)).toThrow(/between 1 and 8/);
  });

  test('rejects > MAX_WORKERS', () => {
    expect(() => buildSlotIdentities(MAX_WORKERS + 1)).toThrow(/between 1 and 8/);
  });

  test('rejects negative workers', () => {
    expect(() => buildSlotIdentities(-1)).toThrow();
  });

  test('callsign at index N stable across calls (slot identity persistence)', () => {
    const a = buildSlotIdentities(3);
    const b = buildSlotIdentities(3);
    expect(a[0].callsign).toBe(b[0].callsign);
    expect(a[1].callsign).toBe(b[1].callsign);
    expect(a[2].callsign).toBe(b[2].callsign);
  });

  test('MAX_WORKERS is exported as 8', () => {
    expect(MAX_WORKERS).toBe(8);
  });
});
