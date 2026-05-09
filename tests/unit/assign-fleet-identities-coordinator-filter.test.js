// QF-20260508-648: writer/consumer asymmetry — assign-fleet-identities.cjs must
// filter out coordinator sessions (metadata.is_coordinator=true) so the coordinator
// is not assigned a worker callsign (Alpha-as-worker confusion).
//
// Sibling pattern: lib/coordinator/resolve.cjs setActiveCoordinator() is the writer.
// 10th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { filterOutCoordinators } = require('../../scripts/assign-fleet-identities.cjs');

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
