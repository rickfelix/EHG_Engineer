/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 — audit_log mirror (FR-5).
 * buildAuditRows is pure, so none of this touches the DB.
 */

import { describe, it, expect } from 'vitest';
import { buildAuditRows } from '../../scripts/mirror-migration-dispositions-to-audit.mjs';

const entry = (over = {}) => ({
  disposition: 'DEFERRED', reason: 'blocked on chairman sign-off', owner: 'chairman',
  sd_key: 'SD-X', recorded_at: '2026-07-25T00:00:00.000Z', source: 'auto:test', ...over,
});

describe('column contract — live audit_log columns only', () => {
  it('emits exactly the columns that exist on the live table', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry() });
    expect(Object.keys(rows[0]).sort()).toEqual(['entity_id', 'entity_type', 'event_type', 'metadata', 'severity']);
  });

  it('never emits the action/details columns that caused a prior runtime break', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry() });
    expect(rows[0]).not.toHaveProperty('action');
    expect(rows[0]).not.toHaveProperty('details');
  });

  it('uses the convention keys from recordTierAudit', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry() });
    expect(rows[0]).toMatchObject({ event_type: 'MIGRATION_DISPOSITION', entity_type: 'migration', entity_id: 'a.sql' });
    expect(rows[0].metadata).toMatchObject({
      disposition: 'DEFERRED', owner: 'chairman', sd_key: 'SD-X', decided_at: '2026-07-25T00:00:00.000Z',
    });
  });
});

describe('idempotence — by disposition, not by mere presence', () => {
  it('skips an entity already mirrored with the SAME disposition', () => {
    const { rows, skipped } = buildAuditRows({ 'a.sql': entry() }, new Map([['a.sql', 'DEFERRED']]));
    expect(rows).toHaveLength(0);
    expect(skipped).toEqual(['a.sql']);
  });

  it('WRITES A NEW ROW when a human re-adjudicates, so the trail shows the change', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry({ disposition: 'RETIRED' }) }, new Map([['a.sql', 'DEFERRED']]));
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.disposition).toBe('RETIRED');
  });

  it('an empty ledger writes nothing', () => {
    expect(buildAuditRows({}).rows).toHaveLength(0);
    expect(buildAuditRows(null).rows).toHaveLength(0);
  });
});

describe('suppresses_gate distinguishes a gate-changing decision from a documented fact', () => {
  it('is true for RETIRED and DEFERRED', () => {
    expect(buildAuditRows({ 'a.sql': entry({ disposition: 'RETIRED' }) }).rows[0].metadata.suppresses_gate).toBe(true);
    expect(buildAuditRows({ 'a.sql': entry({ disposition: 'DEFERRED' }) }).rows[0].metadata.suppresses_gate).toBe(true);
  });

  it('is FALSE for APPLIED — a legitimate record that never suppresses (FR-2b)', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry({ disposition: 'APPLIED' }) });
    expect(rows[0].metadata.suppresses_gate).toBe(false);
    expect(rows[0].metadata.disposition).toBe('APPLIED'); // still recorded, just not suppressing
  });

  it('is false when the reason is missing, matching the ledger reader', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry({ reason: '   ' }) });
    expect(rows[0].metadata.suppresses_gate).toBe(false);
  });
});

describe('malformed entries are reported, never written', () => {
  it.each([['unknown disposition', { disposition: 'APPLY', reason: 'x' }], ['null', null], ['string', 'nope'], ['no disposition', { reason: 'x' }]])(
    'routes %s to invalid rather than rows',
    (_label, bad) => {
      const { rows, invalid } = buildAuditRows({ 'a.sql': bad });
      expect(rows).toHaveLength(0);
      expect(invalid).toEqual(['a.sql']);
    }
  );

  it('one malformed entry does not block the valid ones', () => {
    const { rows, invalid } = buildAuditRows({ 'bad.sql': { disposition: 'APPLY' }, 'good.sql': entry() });
    expect(rows.map((r) => r.entity_id)).toEqual(['good.sql']);
    expect(invalid).toEqual(['bad.sql']);
  });
});
