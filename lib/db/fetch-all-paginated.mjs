/**
 * fetch-all-paginated.mjs — count/truncation discipline primitives
 * (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-2/FR-3/FR-4).
 *
 * Live incident 2026-07-19 (chairman-caught): a gauge read "1000" — exactly the
 * PostgREST max-rows cap — while the true count was 1495. Two-pronged rule this
 * module mechanizes:
 *   (1) GAUGES use { count: 'exact', head: true } — never rows.length. When the
 *       exact count itself fails (missing relation → count=null with error=null),
 *       renderCount() renders 'unavailable', NEVER a healthy-looking 0 (A3).
 *   (2) BULK-PROCESSING reads use fetchAllPaginated() (range-pagination until a
 *       short page) OR carry assertNotCapTruncated() — rows.length === cap is a
 *       runtime-detectable truncation signature, so it fails LOUD (A2).
 */

/** PostgREST default max-rows cap — the silent-truncation boundary. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Fetch ALL rows for a query by range-paginating until a short page.
 * `queryFactory` must return a FRESH query builder per call (supabase builders
 * are single-use); this function applies .range() itself — do not pre-range.
 * Throws on any page error (callers keep their own fail-open policy).
 * @param {() => any} queryFactory e.g. () => sb.from('t').select('col').eq(...)
 * @param {{ pageSize?: number }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function fetchAllPaginated(queryFactory, { pageSize = POSTGREST_MAX_ROWS } = {}) {
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) throw new Error(`fetchAllPaginated: page at offset ${offset} failed: ${error.message}`);
    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}

/**
 * Fail-loud tripwire for bulk sites that cannot paginate: a raw fetch returning
 * EXACTLY the cap is presumed truncated (the incident signature) and throws.
 * Returns the rows unchanged otherwise so it can wrap call sites inline.
 * @param {Array<object>} rows
 * @param {{ cap?: number, site?: string }} [opts]
 * @returns {Array<object>} the same rows, when below the cap
 */
export function assertNotCapTruncated(rows, { cap = POSTGREST_MAX_ROWS, site = 'unknown-site' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === cap) {
    const e = new Error(
      `CAP_TRUNCATION_SUSPECTED at ${site}: fetch returned exactly ${cap} rows (the PostgREST cap) — `
      + 'result is presumed silently truncated; paginate via fetchAllPaginated or use an exact head-count.'
    );
    e.code = 'CAP_TRUNCATION_SUSPECTED';
    throw e;
  }
  return list;
}

/**
 * Render an exact head-count for a gauge. count===null/undefined/NaN means the
 * MEASUREMENT failed (e.g. missing relation returns count=null, error=null) —
 * render 'unavailable', never coerce to 0 (a healthy-looking zero is worse than
 * the cap bug). Numeric counts pass through unchanged.
 * @param {number|null|undefined} count
 * @returns {number|'unavailable'}
 */
export function renderCount(count) {
  return typeof count === 'number' && Number.isFinite(count) ? count : 'unavailable';
}
