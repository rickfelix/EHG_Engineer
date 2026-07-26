/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 — audit_log mirror (FR-5).
 * buildAuditRows is pure, so none of this touches the DB.
 */

import { describe, it, expect } from 'vitest';
import { buildAuditRows, decisionFingerprint } from '../../scripts/mirror-migration-dispositions-to-audit.mjs';

const entry = (over = {}) => ({
  disposition: 'DEFERRED', reason: 'blocked on chairman sign-off', owner: 'chairman',
  sd_key: 'SD-X', recorded_at: '2026-07-25T00:00:00.000Z', source: 'auto:test', ...over,
});

describe('column contract — live audit_log columns only', () => {
  it('emits exactly the columns that exist on the live table', () => {
    // Live schema: id, event_type, entity_type, entity_id, old_value, new_value, metadata,
    // severity, created_by, created_at. We write the subset we own.
    const { rows } = buildAuditRows({ 'a.sql': entry() });
    expect(Object.keys(rows[0]).sort()).toEqual(['created_by', 'entity_id', 'entity_type', 'event_type', 'metadata', 'severity']);
  });

  it('records the ACTOR, not just the auto-derived owner role', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry() }, new Map(), 'codestreetlabs@gmail.com');
    expect(rows[0].created_by).toBe('codestreetlabs@gmail.com');
    expect(rows[0].metadata.owner).toBe('chairman'); // role, a different thing
  });

  it('an unavailable actor degrades to null rather than blocking the mirror', () => {
    expect(buildAuditRows({ 'a.sql': entry() }).rows[0].created_by).toBeNull();
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
  it('skips an entity already mirrored with the SAME decision', () => {
    const e = entry();
    const { rows, skipped } = buildAuditRows({ 'a.sql': e }, new Map([['a.sql', decisionFingerprint(e)]]));
    expect(rows).toHaveLength(0);
    expect(skipped).toEqual(['a.sql']);
  });

  it('WRITES A NEW ROW when a human re-adjudicates, so the trail shows the change', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry({ disposition: 'RETIRED' }) }, new Map([['a.sql', decisionFingerprint(entry())]]));
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.disposition).toBe('RETIRED');
  });

  it('WRITES A NEW ROW when only the REASON changed — keying on disposition alone lost this', () => {
    // Observed for real: all three reasons were rewritten to add the self-assertion
    // disclosure while every disposition stayed DEFERRED. A disposition-keyed check skipped
    // them, so the trail would have kept the superseded text indefinitely.
    const before = entry();
    const after = entry({ reason: `${before.reason} — now discloses self-asserted provenance` });
    const { rows } = buildAuditRows({ 'a.sql': after }, new Map([['a.sql', decisionFingerprint(before)]]));
    expect(rows).toHaveLength(1);
  });

  it('re-seeding alone does NOT churn rows — recorded_at is excluded from the fingerprint', () => {
    const a = entry({ recorded_at: '2026-01-01T00:00:00.000Z' });
    const b = entry({ recorded_at: '2026-09-09T00:00:00.000Z' });
    expect(decisionFingerprint(a)).toBe(decisionFingerprint(b));
  });

  it('carries provenance and expiry into the trail as queryable FIELDS, not just prose', () => {
    const { rows } = buildAuditRows({ 'a.sql': entry({ corroborated: false, review_by: '2026-10-01T00:00:00.000Z' }) });
    expect(rows[0].metadata.corroborated).toBe(false);
    expect(rows[0].metadata.review_by).toBe('2026-10-01T00:00:00.000Z');
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
