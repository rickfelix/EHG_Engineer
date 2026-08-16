/**
 * A genuinely-filtering in-memory Supabase double (SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001,
 * FR-6/TR-5).
 *
 * The repo's existing test doubles for this code path (`makeSb` at
 * tests/unit/coordinator/adam-reply-target-integrity.test.js, `stub`/`regStub` at
 * tests/unit/coordination/adam-singleton.test.js, the watchdog test's fixture, and
 * tests/helpers/supabase-chain-mock.js) all implement `.eq()/.is()/.in()/.gte()` as no-op
 * passthroughs that return the chain unchanged — a test using them can catch a wrong UPDATE
 * PATCH shape, but not a wrong or missing FILTER, which is exactly the class of bug this SD
 * exists to fix (two movers with silently-too-narrow predicates). This double actually applies
 * every filter against an in-memory row array, including `col->>key` JSON-path accessors
 * (metadata->>role, payload->>kind) and the null-safe `.or('col.is.null,col.not.in.(a,b,c)')`
 * form used by the shared successor-inherit predicate. Unrecognized filter calls throw (no
 * method is defined as a silent no-op), so a caller using a filter this double doesn't model
 * fails loudly instead of passing vacuously.
 *
 * Built from the partial engines already in this repo rather than from scratch:
 *  - the preds[]+getCol('->>') engine at tests/unit/worker-checkin-ranked-window.test.js:25
 *  - the or-string parser at tests/unit/chairman/sms-outbound-reconcile.test.js:39-70
 *  - range/pagination semantics from tests/unit/roadmap/plan-check-uncapped-pagination.test.js
 */

/** Resolve `col` or `col->>key` against a row. Plain columns are a direct property read. */
function getPath(row, col) {
  const m = /^([\w]+)->>(.+)$/.exec(col);
  if (!m) return row[col];
  const obj = row[m[1]];
  if (obj == null || typeof obj !== 'object') return null;
  const v = obj[m[2]];
  return v === undefined ? null : v;
}

/** Split a PostgREST `.or()` string on top-level commas (parens can nest a value list). */
function splitOrExpr(str) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Parse one `.or()` clause token, e.g. `payload->>kind.not.in.(a,b,c)` or `col.is.null`. */
function parseOrClause(token) {
  let m = /^(.*)\.not\.in\.\((.*)\)$/.exec(token);
  if (m) return { col: m[1], op: 'not.in', val: m[2].length ? m[2].split(',') : [] };
  m = /^(.*)\.in\.\((.*)\)$/.exec(token);
  if (m) return { col: m[1], op: 'in', val: m[2].length ? m[2].split(',') : [] };
  m = /^(.*)\.is\.(null|true|false)$/.exec(token);
  if (m) return { col: m[1], op: 'is', val: m[2] === 'null' ? null : m[2] === 'true' };
  m = /^(.*)\.eq\.(.*)$/.exec(token);
  if (m) return { col: m[1], op: 'eq', val: m[2] };
  throw new Error(`postgrest-fixture-store: unsupported .or() clause "${token}"`);
}

function evalOrClause(row, clause) {
  const v = getPath(row, clause.col);
  if (clause.op === 'is') return v === clause.val;
  if (clause.op === 'eq') return v === clause.val;
  if (clause.op === 'in') return clause.val.includes(v);
  if (clause.op === 'not.in') return v != null && !clause.val.includes(v);
  throw new Error(`postgrest-fixture-store: unhandled .or() op "${clause.op}"`);
}

class FixtureQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.filters = [];
    this.orClauses = null;
    this.mode = 'select';
    this.patch = null;
    this.orderCol = null;
    this.orderAsc = true;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.singleMode = null; // null | 'single' | 'maybeSingle'
  }

  select() { return this; }
  update(patch) { this.mode = 'update'; this.patch = patch; return this; }
  eq(col, val) { this.filters.push({ type: 'eq', col, val }); return this; }
  is(col, val) { this.filters.push({ type: 'is', col, val }); return this; }
  in(col, arr) { this.filters.push({ type: 'in', col, val: arr }); return this; }
  gte(col, val) { this.filters.push({ type: 'gte', col, val }); return this; }
  lte(col, val) { this.filters.push({ type: 'lte', col, val }); return this; }
  or(str) { this.orClauses = splitOrExpr(str).map(parseOrClause); return this; }
  order(col, opts = {}) { this.orderCol = col; this.orderAsc = opts.ascending !== false; return this; }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }

  _matches(row) {
    for (const f of this.filters) {
      const v = getPath(row, f.col);
      if (f.type === 'eq' && v !== f.val) return false;
      if (f.type === 'is' && v !== f.val) return false;
      if (f.type === 'in' && !f.val.includes(v)) return false;
      if (f.type === 'gte' && !(v >= f.val)) return false;
      if (f.type === 'lte' && !(v <= f.val)) return false;
    }
    if (this.orClauses && !this.orClauses.some((c) => evalOrClause(row, c))) return false;
    return true;
  }

  async _run() {
    if (this.store.errorOnTable === this.table) {
      return { data: null, error: { message: this.store.errorMessage || 'simulated error' } };
    }
    const rows = this.store.rows(this.table);
    let matched = rows.filter((r) => this._matches(r));
    if (this.mode === 'update') {
      matched.forEach((r) => Object.assign(r, this.patch));
      return { data: matched.map((r) => ({ id: r.id })), error: null };
    }
    if (this.orderCol) {
      matched = matched.slice().sort((a, b) => {
        const av = getPath(a, this.orderCol);
        const bv = getPath(b, this.orderCol);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.rangeFrom != null) matched = matched.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.singleMode === 'single') {
      return matched.length ? { data: matched[0], error: null } : { data: null, error: { message: 'no rows' } };
    }
    if (this.singleMode === 'maybeSingle') {
      return { data: matched[0] || null, error: null };
    }
    return { data: matched, error: null };
  }

  then(resolve, reject) {
    this._run().then(resolve, reject);
  }
}

/**
 * @param {Object<string, Array<object>>} seed table name -> array of fixture rows (mutated in place by updates)
 * @returns {{ from: (table:string) => FixtureQuery, table: (name:string) => object[], setError: (table:string, message?:string) => void }}
 */
export function createFixtureSupabase(seed = {}) {
  const store = {
    _tables: seed,
    errorOnTable: null,
    errorMessage: null,
    rows(table) { return store._tables[table] || (store._tables[table] = []); },
  };
  return {
    from: (table) => new FixtureQuery(store, table),
    table: (name) => store.rows(name),
    setError: (table, message = 'simulated error') => { store.errorOnTable = table; store.errorMessage = message; },
    clearError: () => { store.errorOnTable = null; store.errorMessage = null; },
  };
}

export default createFixtureSupabase;
