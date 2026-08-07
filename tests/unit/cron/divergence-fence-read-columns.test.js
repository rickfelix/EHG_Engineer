/**
 * QF-20260807-447 — readColumns' catalog query, the untested part of the drift detector.
 *
 * Follow-through from SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 completion flag 0af4cb6f.
 *
 * ── THE DEFECT CLASS, MEASURED NOT ARGUED ─────────────────────────────────────────────────────
 * The whole view-vs-base column-parity detector rests on one catalog query, and nothing exercised
 * it. Measured on PG 17.4 against the live catalog:
 *   issue_patterns          → 29 columns WITH the filters, 35 WITHOUT (six system columns)
 *   v_patterns_with_decay   → 30 columns either way (views carry no system columns)
 * So dropping `attnum > 0` or `NOT attisdropped` adds SIX to every BASE side and ZERO to every
 * VIEW side — every pair looks permanently drifted, across all ~185 views. A detector that fires
 * on everything is exactly as useless as one that fires on nothing, and it is the failure mode
 * that trains readers to ignore the alert.
 *
 * Verified before this file existed: both mutations stayed GREEN across the entire unit project.
 *
 * ── WHAT A UNIT TEST CAN AND CANNOT PROVE HERE, STATED RATHER THAN GLOSSED ────────────────────
 * THE FILTERS EXECUTE SERVER-SIDE. A fake client returns whatever it is handed, so no injected
 * double can demonstrate that Postgres excluded a system column — the filtering is not in the JS.
 * That bounds the honest claim, so the assertions split into two kinds and each says which it is:
 *
 *   BEHAVIOURAL (real, runs here): parameterisation, the returned mapping, and attnum ordering.
 *   SHAPE (a text assertion, deliberately): that BOTH filters are present in the query.
 *
 * The shape assertions are not a lazy substitute for a database test — a database test would be
 * WORSE. The vitest `db` project is DISABLED in this repo (no designated non-production target),
 * so tests/integration/** resolves to ZERO FILES and a DB-backed test would SKIP AND REPORT GREEN.
 * A test that cannot run is not stronger than a text assertion that can; it is weaker, because it
 * looks stronger. The measured numbers above are recorded here so the next reader can re-derive
 * the class without re-discovering it.
 */

import { describe, it, expect } from 'vitest';
import { readColumns } from '../../../scripts/severity-pair-divergence-fence.mjs';

/** Records the SQL and params instead of connecting. */
function fakeClient(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => { calls.push({ sql, params }); return { rows }; },
  };
}

describe('readColumns — BEHAVIOURAL (these genuinely execute)', () => {
  it('binds the relation name as a PARAMETER, never string-concatenated', async () => {
    // The one security-relevant property, and the only one a double can actually witness.
    const c = fakeClient([]);
    await readColumns(c, "feedback'; drop table x; --");
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].params, 'the relation name must arrive as a bound parameter').toEqual(["feedback'; drop table x; --"]);
    expect(c.calls[0].sql, 'and must NOT be interpolated into the SQL text').not.toContain('drop table');
    expect(c.calls[0].sql).toMatch(/\$1/);
  });

  it('returns the attnames, in the order the catalog returned them', async () => {
    // ORDER IS LOAD-BEARING and not decoration: the query orders by attnum so the two sides of a
    // parity comparison are read in a stable, comparable order.
    const c = fakeClient([{ attname: 'id' }, { attname: 'severity' }, { attname: 'created_at' }]);
    expect(await readColumns(c, 'feedback')).toEqual(['id', 'severity', 'created_at']);
  });

  it('an empty catalog read returns [] — and the comparator turns THAT into UNREADABLE', async () => {
    // readColumns must NOT invent a fallback. Returning [] is what lets compareViewBaseParity
    // report UNREADABLE rather than a vacuous AGREES over an empty base list.
    expect(await readColumns(fakeClient([]), 'nope')).toEqual([]);
  });
});

describe('readColumns — SHAPE (text assertions, and here is why that is the strongest available)', () => {
  /** The SQL the function actually issues, captured through the injected client. */
  async function capturedSql() {
    const c = fakeClient([]);
    await readColumns(c, 'anything');
    return c.calls[0].sql;
  }

  it('filters attnum > 0 — WITHOUT IT every base table gains its six system columns', async () => {
    // Measured: issue_patterns 29 -> 35. Views gain none, so the base side inflates alone and
    // EVERY pair reports DIVERGED forever.
    expect(await capturedSql(), 'system columns (ctid, xmin, …) would inflate every BASE side only')
      .toMatch(/attnum\s*>\s*0/);
  });

  it('filters NOT attisdropped — WITHOUT IT a dropped-but-unvacuumed column reads as present', async () => {
    // The subtler half: a column DROPped from the base but not yet vacuumed still has a
    // pg_attribute row. Counting it makes the base side claim a column the view could not
    // possibly expose — a divergence that describes a ghost.
    expect(await capturedSql()).toMatch(/not\s+a?\.?attisdropped/i);
  });

  it('scopes to the public schema and joins through pg_class/pg_namespace', async () => {
    // Without the namespace join, a same-named relation in another schema can answer for this one —
    // and the parity verdict would then describe a table nobody asked about.
    const sql = await capturedSql();
    expect(sql).toMatch(/pg_attribute/);
    expect(sql).toMatch(/pg_class/);
    expect(sql).toMatch(/pg_namespace/);
    expect(sql).toMatch(/nspname\s*=\s*'public'/);
  });

  it('orders by attnum, so both sides of a parity read are comparable', async () => {
    expect(await capturedSql()).toMatch(/order\s+by\s+a?\.?attnum/i);
  });
});
