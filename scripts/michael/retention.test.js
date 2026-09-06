// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-6, TS-10 — prose ages out; rules never do.
import { describe, it, expect } from 'vitest';
import { runRetention, cutoffEtDate, RETENTION_TARGETS, NEVER_TOUCHED, renderRetention, DEFAULT_DAYS } from './retention.mjs';

// 2026-09-06 09:00Z = 05:00 ET on 2026-09-06 -> cutoff 2026-08-07 at 30 days.
const NOW = new Date('2026-09-06T09:00:00.000Z');
const MISSING = { count: null, data: null, error: { code: '42P01', message: 'relation does not exist' } };

/**
 * Recording stub: counts come from `counts[table]`, reads from `tables[table]`, mutations recorded
 * in `writes`; `froms` records every table touched.
 */
function stub({ counts = {}, tables = {}, missing = false, writeError = null } = {}) {
  const writes = [];
  const froms = [];
  const client = {
    writes, froms,
    from(table) {
      froms.push(table);
      const ops = [];
      let mutating = false;
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => {
              if (missing) return Promise.resolve(MISSING).then(res, rej);
              if (mutating) { writes.push({ table, ops: [...ops] }); return Promise.resolve(writeError ? { data: null, error: writeError } : { data: ops.some((o) => o.op === 'single') ? { id: 'stamp-1' } : null, error: null }).then(res, rej); }
              const sel = ops.find((o) => o.op === 'select');
              if (sel && sel.args[1] && sel.args[1].head) return Promise.resolve({ count: counts[table] ?? 0, error: null }).then(res, rej);
              return Promise.resolve({ data: tables[table] || [], error: null }).then(res, rej);
            };
          }
          return (...args) => { if (['insert', 'update', 'upsert', 'delete'].includes(prop)) mutating = true; ops.push({ op: prop, args }); return q; };
        },
      });
      return q;
    },
  };
  return client;
}

describe('cutoffEtDate', () => {
  it('is today-ET minus N days, on the ET calendar (05:00 ET on 09-06 -> 08-07 at 30 days)', () => {
    expect(cutoffEtDate(NOW, 30)).toBe('2026-08-07');
    expect(cutoffEtDate(NOW, 1)).toBe('2026-09-05');
    // 02:00Z on 09-06 is still 09-05 ET, so the cutoff moves with the ET day, not the UTC day.
    expect(cutoffEtDate(new Date('2026-09-06T02:00:00.000Z'), 30)).toBe('2026-08-06');
    expect(DEFAULT_DAYS).toBe(30);
  });
});

describe('runRetention', () => {
  it('dry run: counts eligible rows per target with a STRICT lt(cutoff), writes no table, and still stamps feeder_runs (venue gha)', async () => {
    const sb = stub({ counts: { michael_brief_runs: 4, michael_gmail_triage_items: 9, michael_calendar_day: 12, michael_feeder_runs: 5, michael_staged_items: 2 } });
    const r = await runRetention({ sb, argv: [], now: NOW });
    expect(r).toMatchObject({ ok: true, tables_absent: false, mode: 'dry_run', days: 30, cutoff: '2026-08-07', stamped: true, attempt: 1 });
    expect(r.per_table.map((t) => [t.table, t.eligible])).toEqual([['michael_brief_runs', 4], ['michael_gmail_triage_items', 9], ['michael_calendar_day', 12], ['michael_feeder_runs', 5], ['michael_staged_items', 2]]);
    const mutated = sb.writes.map((w) => w.table);
    expect(mutated).toEqual(['michael_feeder_runs']);
    const stamp = sb.writes[0].ops[0].args[0];
    expect(stamp).toMatchObject({ feeder: 'retention', et_date: '2026-09-06', attempt: 1, venue: 'gha', status: 'ok' });
    expect(stamp.counts.mode).toBe('dry_run');
  });
  it('apply: nulls exactly the prose columns and deletes calendar rows, both strictly older than the cutoff (boundary row at cutoff untouched)', async () => {
    const sb = stub({ counts: { michael_brief_runs: 2, michael_gmail_triage_items: 0, michael_calendar_day: 3, michael_feeder_runs: 1 } });
    const r = await runRetention({ sb, argv: ['--apply'], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('apply');
    const feederWrites = sb.writes.filter((x) => x.table === 'michael_feeder_runs');
    expect(feederWrites.map((x) => x.ops[0].op)).toEqual(['update', 'insert']); // log_md nulling, then the stamp
    expect(feederWrites[0].ops[0].args[0]).toEqual({ log_md: null });
    const w = sb.writes.filter((x) => x.table !== 'michael_feeder_runs');
    expect(w.map((x) => [x.table, x.ops[0].op])).toEqual([['michael_brief_runs', 'update'], ['michael_calendar_day', 'delete']]);
    expect(w[0].ops[0].args[0]).toEqual({ rendered_html: null, brief_md: null });
    for (const x of w) {
      const lt = x.ops.find((o) => o.op === 'lt');
      expect(lt.args).toEqual(['et_date', '2026-08-07']);
      expect(x.ops.some((o) => o.op === 'lte' || o.op === 'gte')).toBe(false);
    }
    expect(w[0].ops.find((o) => o.op === 'or').args[0]).toBe('rendered_html.not.is.null,brief_md.not.is.null');
    expect(r.per_table[0].applied).toBe(2);
    expect(r.per_table[1].applied).toBeUndefined();
    expect(r.per_table[3].applied).toBe(1);
  });
  it('never touches rules, closures, the ledger, snapshots, labels or credentials', async () => {
    const sb = stub({ counts: { michael_brief_runs: 1, michael_gmail_triage_items: 1, michael_calendar_day: 1 } });
    await runRetention({ sb, argv: ['--apply'], now: NOW });
    const touched = new Set(sb.froms);
    for (const t of NEVER_TOUCHED) expect(touched.has(t), t).toBe(false);
    expect(RETENTION_TARGETS.map((t) => t.table)).toEqual(['michael_brief_runs', 'michael_gmail_triage_items', 'michael_calendar_day', 'michael_feeder_runs', 'michael_staged_items']);
  });
  it('child D: empties the payload of DISPOSITIONED staged rows strictly older than the cutoff instant and leaves undispositioned rows untouched (TS-19)', async () => {
    const sb = stub({ counts: { michael_staged_items: 3 } });
    await runRetention({ sb, argv: ['--apply'], now: NOW });
    const w = sb.writes.find((x) => x.table === 'michael_staged_items');
    expect(w.ops.map((o) => o.op)).toEqual(['update', 'lt', 'in', 'neq']);
    expect(w.ops[0].args[0]).toEqual({ payload: {} });
    // the filter is on dispositioned_at (an instant), so a NULL dispositioned_at never matches lt()
    expect(w.ops[1].args).toEqual(['dispositioned_at', '2026-08-07T00:00:00.000Z']);
    // only task_route (prose): tasks_cleanup is the bridged-item ledger (ids only) and rulings, proposals,
    // captures and rule edits keep their payload as evidence
    expect(w.ops[2].args).toEqual(['kind', ['task_route']]);
    expect(w.ops[3].args).toEqual(['payload', '{}']);
    expect(JSON.stringify(w.ops)).not.toContain('et_date');
  });
  it('the stamp attempt increments from the newest retention row of the same ET day', async () => {
    const sb = stub({ tables: { michael_feeder_runs: [{ attempt: 3 }] } });
    const r = await runRetention({ sb, argv: [], now: NOW });
    expect(r.attempt).toBe(4);
    expect(sb.writes[0].ops[0].args[0].attempt).toBe(4);
  });
  it('absent tables: inert (ok, tables_absent=true), no writes, no stamp attempted', async () => {
    const sb = stub({ missing: true });
    const r = await runRetention({ sb, argv: ['--apply'], now: NOW });
    expect(r).toMatchObject({ ok: true, tables_absent: true, stamped: false });
    expect(sb.writes).toHaveLength(0);
    expect(renderRetention(r).join('\n')).toMatch(/not applied yet/);
  });
  it('--days validates; a failed stamp makes the run not ok', async () => {
    expect((await runRetention({ sb: stub(), argv: ['--days', '0'], now: NOW })).refusal).toBe('DAYS_INVALID');
    const sb = stub({ writeError: { code: '23514', message: 'check violation' } });
    const r = await runRetention({ sb, argv: [], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.stamped).toBe(false);
  });
});
