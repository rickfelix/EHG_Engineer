// QF-20260508-648: writer/consumer asymmetry — assign-fleet-identities.cjs must
// filter out coordinator sessions (metadata.is_coordinator=true) so the coordinator
// is not assigned a worker callsign (Alpha-as-worker confusion).
//
// Sibling pattern: lib/coordinator/resolve.cjs setActiveCoordinator() is the writer.
// 10th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  filterOutCoordinators,
  filterOutGhostSessions,
  isTestSessionId,
  dedupeAssignedCallsigns
} = require('../../scripts/assign-fleet-identities.cjs');

describe('filterOutCoordinators (QF-20260508-648)', () => {
  it('excludes a coordinator row (metadata.is_coordinator=true)', () => {
    const rows = [
      { session_id: 'coord-1', metadata: { is_coordinator: true } },
      { session_id: 'worker-1', metadata: { fleet_identity: { callsign: 'Bravo' } } }
    ];
    const out = filterOutCoordinators(rows);
    expect(out.map(r => r.session_id)).toEqual(['worker-1']);
  });

  it('retains workers whose metadata is missing entirely', () => {
    const rows = [
      { session_id: 'worker-1' },
      { session_id: 'worker-2', metadata: null },
      { session_id: 'worker-3', metadata: {} }
    ];
    const out = filterOutCoordinators(rows);
    expect(out.map(r => r.session_id)).toEqual(['worker-1', 'worker-2', 'worker-3']);
  });

  it('retains workers with is_coordinator=false (idle workers explicitly cleared)', () => {
    const rows = [
      { session_id: 'worker-1', metadata: { is_coordinator: false } }
    ];
    expect(filterOutCoordinators(rows).map(r => r.session_id)).toEqual(['worker-1']);
  });

  it('handles null/undefined input without throwing', () => {
    expect(filterOutCoordinators(null)).toEqual([]);
    expect(filterOutCoordinators(undefined)).toEqual([]);
    expect(filterOutCoordinators([])).toEqual([]);
  });

  it('filters mixed roster correctly (coordinator + multiple workers)', () => {
    const rows = [
      { session_id: 'worker-a' },
      { session_id: 'coord-x', metadata: { is_coordinator: true, fleet_identity: { callsign: 'Alpha' } } },
      { session_id: 'worker-b', metadata: { is_coordinator: false } },
      { session_id: 'coord-y', metadata: { is_coordinator: true } },
      { session_id: 'worker-c', metadata: { fleet_identity: { callsign: 'Charlie' } } }
    ];
    const out = filterOutCoordinators(rows);
    expect(out.map(r => r.session_id)).toEqual(['worker-a', 'worker-b', 'worker-c']);
  });

  it('safely handles rows with null entries (does not throw on optional chain)', () => {
    const rows = [null, undefined, { session_id: 'worker-1' }];
    expect(filterOutCoordinators(rows).map(r => r.session_id)).toEqual(['worker-1']);
  });
});

// QF-20260528-581 (Bug B): filter test/ghost sessions that consume the NATO pool.
// Mirrors the dashboard/coaching "active worker" cohort (sd_key IS NOT NULL),
// while retaining real workers momentarily between SDs.
describe('filterOutGhostSessions (QF-20260528-581 / Bug B)', () => {
  it('drops drain_test_* and test_execute_* ghost session_ids', () => {
    const rows = [
      { session_id: 'drain_test_123', sd_key: 'SD-A' },          // ghost despite sd_key
      { session_id: 'test_execute_stop_999', sd_key: 'SD-B' },   // ghost despite sd_key
      { session_id: 'real-worker-1', sd_key: 'SD-C' }
    ];
    const out = filterOutGhostSessions(rows, new Set(['real-worker-1']));
    expect(out.map(r => r.session_id)).toEqual(['real-worker-1']);
  });

  it('drops test-session-* / test_session_* prefixes', () => {
    const rows = [
      { session_id: 'test-session-A', sd_key: 'SD-A' },
      { session_id: 'test_session_B', sd_key: 'SD-B' },
      { session_id: 'worker-keep', sd_key: 'SD-C' }
    ];
    expect(filterOutGhostSessions(rows).map(r => r.session_id)).toEqual(['worker-keep']);
  });

  it('drops never-claimed sessions (no sd_key, not in claimed set, no fleet_identity)', () => {
    const rows = [
      { session_id: 'ghost-never-claimed' },                                  // drop
      { session_id: 'worker-claiming', sd_key: 'SD-A' }                       // keep
    ];
    const out = filterOutGhostSessions(rows, new Set(['worker-claiming']));
    expect(out.map(r => r.session_id)).toEqual(['worker-claiming']);
  });

  it('KEEPS a real worker between SDs (null sd_key) that is in the claimed cohort', () => {
    const rows = [
      { session_id: 'between-sds', sd_key: null }   // momentarily idle, but currently-claimed cohort
    ];
    const out = filterOutGhostSessions(rows, new Set(['between-sds']));
    expect(out.map(r => r.session_id)).toEqual(['between-sds']);
  });

  it('KEEPS a real worker between SDs that already has a fleet_identity (claimed before)', () => {
    const rows = [
      { session_id: 'prev-worker', sd_key: null, metadata: { fleet_identity: { callsign: 'Bravo' } } }
    ];
    // Empty claimed set — relies on the fleet_identity signal alone.
    const out = filterOutGhostSessions(rows, new Set());
    expect(out.map(r => r.session_id)).toEqual(['prev-worker']);
  });

  it('keeps normal active workers and drops ghosts in a mixed roster', () => {
    const rows = [
      { session_id: 'worker-a', sd_key: 'SD-1' },
      { session_id: 'drain_test_x', sd_key: 'SD-2' },
      { session_id: 'ghost-idle' },                                               // never claimed → drop
      { session_id: 'worker-b-idle', sd_key: null, metadata: { fleet_identity: { callsign: 'Echo' } } },
      { session_id: 'worker-c', sd_key: 'SD-3' }
    ];
    const out = filterOutGhostSessions(rows, new Set(['worker-a', 'worker-c']));
    expect(out.map(r => r.session_id)).toEqual(['worker-a', 'worker-b-idle', 'worker-c']);
  });

  it('accepts a plain array for claimedSessionIds (not just a Set)', () => {
    const rows = [{ session_id: 'between', sd_key: null }];
    expect(filterOutGhostSessions(rows, ['between']).map(r => r.session_id)).toEqual(['between']);
  });

  it('handles null/undefined/empty input without throwing', () => {
    expect(filterOutGhostSessions(null)).toEqual([]);
    expect(filterOutGhostSessions(undefined)).toEqual([]);
    expect(filterOutGhostSessions([])).toEqual([]);
    expect(filterOutGhostSessions([null, undefined])).toEqual([]);
  });

  it('isTestSessionId recognizes ghost prefixes and not real ids', () => {
    expect(isTestSessionId('drain_test_1')).toBe(true);
    expect(isTestSessionId('test_execute_team_factory_1')).toBe(true);
    expect(isTestSessionId('test-session-abc')).toBe(true);
    expect(isTestSessionId('test_session_x')).toBe(true);
    expect(isTestSessionId('win-cc-1234')).toBe(false);
    expect(isTestSessionId(null)).toBe(false);
    expect(isTestSessionId(undefined)).toBe(false);
  });
});

// QF-20260528-581 (Bug A): dedup duplicate callsigns within the already-assigned set.
// Input is heartbeat-DESC (most recent first) → first occurrence of a callsign wins.
describe('dedupeAssignedCallsigns (QF-20260528-581 / Bug A)', () => {
  const mk = (id, callsign, color = 'blue') => ({
    session_id: id,
    metadata: { fleet_identity: { callsign, color } }
  });

  it('two workers share a callsign → keeps the most-recent (first) and demotes the other', () => {
    const assigned = [
      mk('sess-newer', 'Alpha'),  // heartbeat-DESC: most recent first → kept
      mk('sess-older', 'Alpha')   // duplicate → demoted
    ];
    const { kept, demoted } = dedupeAssignedCallsigns(assigned);
    expect(kept.map(w => w.session_id)).toEqual(['sess-newer']);
    expect(demoted.map(w => w.session_id)).toEqual(['sess-older']);
  });

  it('no collision → all kept, none demoted', () => {
    const assigned = [mk('s1', 'Alpha'), mk('s2', 'Bravo'), mk('s3', 'Charlie')];
    const { kept, demoted } = dedupeAssignedCallsigns(assigned);
    expect(kept.map(w => w.session_id)).toEqual(['s1', 's2', 's3']);
    expect(demoted).toEqual([]);
  });

  it('3-way collision on the same callsign → 1 kept, 2 demoted', () => {
    const assigned = [
      mk('s-newest', 'Alpha'),
      mk('s-mid', 'Alpha'),
      mk('s-oldest', 'Alpha')
    ];
    const { kept, demoted } = dedupeAssignedCallsigns(assigned);
    expect(kept.map(w => w.session_id)).toEqual(['s-newest']);
    expect(demoted.map(w => w.session_id)).toEqual(['s-mid', 's-oldest']);
  });

  it('multiple distinct collisions resolved independently', () => {
    const assigned = [
      mk('a1', 'Alpha'), mk('b1', 'Bravo'),
      mk('a2', 'Alpha'), mk('b2', 'Bravo'),
      mk('c1', 'Charlie')
    ];
    const { kept, demoted } = dedupeAssignedCallsigns(assigned);
    expect(kept.map(w => w.session_id)).toEqual(['a1', 'b1', 'c1']);
    expect(demoted.map(w => w.session_id)).toEqual(['a2', 'b2']);
  });

  it('rows without a callsign are demoted (treated as needing assignment)', () => {
    const assigned = [
      mk('s1', 'Alpha'),
      { session_id: 's2', metadata: {} },        // no fleet_identity
      { session_id: 's3', metadata: { fleet_identity: {} } } // identity but no callsign
    ];
    const { kept, demoted } = dedupeAssignedCallsigns(assigned);
    expect(kept.map(w => w.session_id)).toEqual(['s1']);
    expect(demoted.map(w => w.session_id)).toEqual(['s2', 's3']);
  });

  it('handles null/undefined/empty input and null entries without throwing', () => {
    expect(dedupeAssignedCallsigns(null)).toEqual({ kept: [], demoted: [] });
    expect(dedupeAssignedCallsigns(undefined)).toEqual({ kept: [], demoted: [] });
    expect(dedupeAssignedCallsigns([])).toEqual({ kept: [], demoted: [] });
    const { kept, demoted } = dedupeAssignedCallsigns([null, mk('s1', 'Alpha'), undefined]);
    expect(kept.map(w => w.session_id)).toEqual(['s1']);
    expect(demoted).toEqual([]);
  });
});
