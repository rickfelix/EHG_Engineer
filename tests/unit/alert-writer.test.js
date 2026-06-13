/**
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-B — recordSystemAlert write-contract pins.
 * Uses a FAKE supabase — zero live system_alerts writes. Verifies: legal alert_type (via the
 * child-A toAlertType) + metadata.break_class + legal severity + all NOT-NULL columns; unknown
 * break-class loud reject; OPEN-alert dedup; fail-loud on query/insert error.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordSystemAlert, buildAlertRow } = require('../../lib/breakage/alert-writer.cjs');
const { BREAK_CLASSES, LEGAL_SEVERITIES, LEGAL_ALERT_TYPES } = require('../../lib/coordinator/break-class-taxonomy.cjs');

// Fake supabase: dedup path (from().select().eq().eq().is().limit()) resolves `existing`;
// insert path (from().insert(row).select().single()) captures the row + resolves `insertResult`.
function fakeSupabase({ existing = [], dedupError = null, insertError = null, onInsert } = {}) {
  const dedupChain = {
    select() { return dedupChain; },
    eq() { return dedupChain; },
    is() { return dedupChain; },
    limit() { return Promise.resolve({ data: existing, error: dedupError }); },
  };
  return {
    from() {
      return {
        select: dedupChain.select,
        eq: dedupChain.eq,
        is: dedupChain.is,
        limit: dedupChain.limit,
        insert(row) {
          if (onInsert) onInsert(row);
          return { select() { return { single() {
            return Promise.resolve({ data: insertError ? null : { id: 'new-alert-id' }, error: insertError });
          } }; } };
        },
      };
    },
  };
}

describe('recordSystemAlert — canonical system_alerts write-contract (child B)', () => {
  it('builds a legal row: alert_type via toAlertType, metadata.break_class, legal severity, all NOT-NULL cols', async () => {
    let row = null;
    const sb = fakeSupabase({ existing: [], onInsert: (r) => { row = r; } });
    const res = await recordSystemAlert(sb, { breakClass: 'schema-drift', sourceService: 'schema-lint' });
    expect(res).toEqual({ id: 'new-alert-id', deduped: false });
    expect(LEGAL_ALERT_TYPES).toContain(row.alert_type);
    expect(LEGAL_SEVERITIES).toContain(row.severity);
    expect(row.metadata.break_class).toBe('schema-drift');
    expect(row.source_service).toBe('schema-lint');
    // NOT-NULL columns all present + truthy
    for (const col of ['alert_type', 'severity', 'title', 'message', 'source_service']) {
      expect(row[col]).toBeTruthy();
    }
  });

  it('every break class produces a legal alert_type + severity (buildAlertRow, pure)', () => {
    for (const bc of BREAK_CLASSES) {
      const r = buildAlertRow({ breakClass: bc, sourceService: 'x' });
      expect(LEGAL_ALERT_TYPES).toContain(r.alert_type);
      expect(LEGAL_SEVERITIES).toContain(r.severity);
      expect(r.metadata.break_class).toBe(bc);
    }
  });

  it('an illegal caller severity falls back to a legal default', () => {
    const r = buildAlertRow({ breakClass: 'row-growth-anomaly', sourceService: 'x', severity: 'CATASTROPHIC' });
    expect(LEGAL_SEVERITIES).toContain(r.severity);
  });

  it('unknown break class → loud reject (throws), no IO', async () => {
    const sb = fakeSupabase({});
    await expect(recordSystemAlert(sb, { breakClass: 'not-a-class', sourceService: 'x' })).rejects.toThrow(/unknown break class/i);
  });

  it('missing sourceService (NOT NULL) → loud reject', async () => {
    const sb = fakeSupabase({});
    await expect(recordSystemAlert(sb, { breakClass: 'schema-drift' })).rejects.toThrow(/sourceService/i);
  });

  it('duplicate OPEN alert (same break_class + source) → deduped, no second insert', async () => {
    let inserted = false;
    const sb = fakeSupabase({ existing: [{ id: 'existing-open' }], onInsert: () => { inserted = true; } });
    const res = await recordSystemAlert(sb, { breakClass: 'gate-pipeline-down', sourceService: 'canary' });
    expect(res).toEqual({ id: 'existing-open', deduped: true });
    expect(inserted).toBe(false);
  });

  it('dedup query error → fail-loud (throws)', async () => {
    const sb = fakeSupabase({ dedupError: { message: 'conn lost' } });
    await expect(recordSystemAlert(sb, { breakClass: 'schema-drift', sourceService: 'x' })).rejects.toThrow(/dedup query failed/i);
  });

  it('insert error → fail-loud (throws, not swallowed)', async () => {
    const sb = fakeSupabase({ existing: [], insertError: { message: 'check violation' } });
    await expect(recordSystemAlert(sb, { breakClass: 'schema-drift', sourceService: 'x' })).rejects.toThrow(/insert failed/i);
  });
});
