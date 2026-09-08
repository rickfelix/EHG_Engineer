// QF-20260907-930: an absent target table used to short-circuit runRetention BEFORE any present
// table was enforced and BEFORE the michael_feeder_runs liveness stamp -- a total no-op that still
// reported ok:true and printed "nothing to do". These pin the fixed contract: present targets are
// still enforced, the stamp always fires, and the run's status reflects partial vs total absence.
import { describe, it, expect } from 'vitest';
import { runRetention, renderRetention, RETENTION_TARGETS } from '../../../scripts/michael/retention.mjs';

function makeFakeSb({ absentTables = new Set(), eligibleCounts = {} } = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      const chain = {
        select(_cols, opts) { chain._wantsCount = !!(opts && opts.count === 'exact'); return chain; },
        lt: () => chain,
        or: () => chain,
        in: () => chain,
        neq: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => chain,
        update: () => chain,
        delete: () => chain,
        insert(row) { inserts.push({ table, row }); chain._inserted = true; return chain; },
        then(resolve) {
          if (absentTables.has(table)) return resolve({ data: null, count: null, error: { code: '42P01', message: 'relation does not exist' } });
          if (chain._inserted) return resolve({ data: { id: 'stamp-row-1' }, error: null });
          if (chain._wantsCount) return resolve({ data: null, count: eligibleCounts[table] ?? 0, error: null });
          return resolve({ data: [], error: null }); // e.g. michael_feeder_runs' prior-attempt lookup
        },
      };
      return chain;
    },
  };
}

describe('runRetention: partial table absence (QF-20260907-930)', () => {
  it('present targets are still enforced and the stamp still fires when some tables are absent', async () => {
    const absentTables = new Set(['michael_health_daily', 'michael_check_in_journal']);
    const sb = makeFakeSb({ absentTables, eligibleCounts: { michael_brief_runs: 3 } });
    const r = await runRetention({ sb, argv: [], now: new Date('2026-09-08T12:00:00Z') });

    expect(r.ok).toBe(true);
    expect(r.tables_absent).toBe(true);
    expect(r.stamped).toBe(true); // the headline fix: absence no longer suppresses the liveness stamp

    const presentCount = RETENTION_TARGETS.length - absentTables.size;
    const enforcedEntries = r.per_table.filter((t) => !t.tables_absent);
    const absentEntries = r.per_table.filter((t) => t.tables_absent);
    expect(enforcedEntries).toHaveLength(presentCount); // present targets were NOT skipped wholesale
    expect(absentEntries.map((t) => t.table).sort()).toEqual([...absentTables].sort());
    expect(enforcedEntries.find((t) => t.table === 'michael_brief_runs').eligible).toBe(3);

    const stampInsert = sb.inserts.find((i) => i.table === 'michael_feeder_runs');
    expect(stampInsert.row.status).toBe('degraded'); // partial, not the old silent no-op
    expect(stampInsert.row.counts.enforced).toBe(presentCount);
    expect(stampInsert.row.counts.total).toBe(RETENTION_TARGETS.length);
  });

  it('no absent tables: unchanged status=ok behavior (regression guard)', async () => {
    const sb = makeFakeSb({ absentTables: new Set() });
    const r = await runRetention({ sb, argv: [], now: new Date('2026-09-08T12:00:00Z') });
    expect(r.tables_absent).toBe(false);
    expect(r.stamped).toBe(true);
    const stampInsert = sb.inserts.find((i) => i.table === 'michael_feeder_runs');
    expect(stampInsert.row.status).toBe('ok');
  });

  it('every OTHER target absent (michael_feeder_runs itself present): fully inert but still stamped (status=degraded)', async () => {
    const absentTables = new Set(RETENTION_TARGETS.map((t) => t.table).filter((t) => t !== 'michael_feeder_runs'));
    const sb = makeFakeSb({ absentTables });
    const r = await runRetention({ sb, argv: [], now: new Date('2026-09-08T12:00:00Z') });
    expect(r.tables_absent).toBe(true);
    expect(r.stamped).toBe(true); // there IS somewhere to stamp -- the old code still skipped writing it
    const stampInsert = sb.inserts.find((i) => i.table === 'michael_feeder_runs');
    expect(stampInsert.row.status).toBe('degraded');
    expect(stampInsert.row.counts.enforced).toBe(1); // only michael_feeder_runs itself
  });

  it('michael_feeder_runs itself absent (pre-first-migration state): cannot stamp anywhere -- stamped stays false', async () => {
    const sb = makeFakeSb({ absentTables: new Set(RETENTION_TARGETS.map((t) => t.table)) });
    const r = await runRetention({ sb, argv: [], now: new Date('2026-09-08T12:00:00Z') });
    expect(r.tables_absent).toBe(true);
    expect(r.stamped).toBe(false); // no relation exists to write the liveness row into
    expect(r.ok).toBe(false);
  });

  it('renderRetention names each absent table explicitly instead of the old blanket "nothing to do"', () => {
    const lines = renderRetention({
      mode: 'dry_run', days: 30, cutoff: '2026-08-09', stamped: true, attempt: 1,
      per_table: [
        { table: 'michael_brief_runs', action: 'null', eligible: 2 },
        { table: 'michael_health_daily', action: 'delete', eligible: null, tables_absent: true },
      ],
    });
    expect(lines.some((l) => l.includes('michael_health_daily') && l.includes('ABSENT'))).toBe(true);
    expect(lines.some((l) => l.includes('nothing to do'))).toBe(false);
  });
});
