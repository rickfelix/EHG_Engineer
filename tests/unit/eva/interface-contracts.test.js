/**
 * Unit tests for inter-SD interface contracts.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 4 (FR-008)
 */
import { describe, it, expect } from 'vitest';
import { checkContractConsistency, checkTreeContracts } from '../../../lib/eva/bridge/interface-contracts.js';

describe('checkContractConsistency', () => {
  it('is consistent when every consumed item is produced', () => {
    const r = checkContractConsistency(['getConnection', 'enqueueJob'], ['getConnection']);
    expect(r.consistent).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('reports consumed-but-not-produced items', () => {
    const r = checkContractConsistency(['getConnection'], ['getConnection', 'streamRows']);
    expect(r.consistent).toBe(false);
    expect(r.missing).toEqual(['streamRows']);
  });

  it('tolerates empty / non-array input', () => {
    expect(checkContractConsistency().consistent).toBe(true);
    expect(checkContractConsistency(null, ['x']).missing).toEqual(['x']);
  });
});

describe('checkTreeContracts', () => {
  it('integrates when the engine consumes what the DB SD produces', () => {
    const r = checkTreeContracts([
      { key: 'db', produces: ['readOnlyConnection'], consumes: [] },
      { key: 'engine', produces: ['distilledDump'], consumes: ['readOnlyConnection'] },
    ]);
    expect(r.consistent).toBe(true);
    expect(r.unmet).toEqual([]);
  });

  it('flags an SD that consumes something no sibling produces (integration gap)', () => {
    const r = checkTreeContracts([
      { key: 'db', produces: ['readOnlyConnection'] },
      { key: 'engine', consumes: ['readOnlyConnection', 'maskingPolicy'] }, // maskingPolicy produced by nobody
    ]);
    expect(r.consistent).toBe(false);
    expect(r.unmet).toEqual([{ key: 'engine', missing: ['maskingPolicy'] }]);
  });

  it('tolerates empty / non-array input', () => {
    expect(checkTreeContracts().consistent).toBe(true);
    expect(checkTreeContracts([]).unmet).toEqual([]);
  });
});
