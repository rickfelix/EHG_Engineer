/**
 * DB size / table-bloat monitor — SD-LEO-INFRA-DB-RETENTION-GOVERNANCE-AUDIT-LOG-001 (FR-5).
 *
 * Alerts BEFORE the next 90% auto-expand (the 8GB→12GB expand that triggered this SD). Pure verdict
 * (evaluateSizeAlert) + a read-only SQL probe (SIZE_QUERY) + an injectable-IO runner so it is unit-
 * testable without a live DB. Read-only: it NEVER writes — it only measures and returns an exit-worthy
 * verdict for a cron alert.
 *
 * @module lib/db-retention/size-monitor
 */

const GB = 1024 * 1024 * 1024;

/** Default provisioned-disk cap (GB) — current Supabase tier after the 8→12 auto-expand. Override via env. */
export const DEFAULT_CAP_GB = 12;
/** Warn/critical fractions of the cap. Critical fires BELOW the 90% auto-expand so we act first. */
export const WARN_FRACTION = 0.75;
export const CRITICAL_FRACTION = 0.85;
/** A single table this big is worth surfacing as a bloat offender (informational). */
export const TABLE_BLOAT_BYTES = 1 * GB;

/** Read-only probe: total DB size + the largest tables (name, total bytes incl. indexes+TOAST). */
export const SIZE_QUERY = `
  SELECT
    (SELECT pg_database_size(current_database()))::bigint AS db_bytes,
    (SELECT json_agg(t) FROM (
      SELECT
        (schemaname || '.' || relname) AS table_name,
        pg_total_relation_size(relid)::bigint AS total_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15
    ) t) AS top_tables;
`;

/**
 * PURE verdict. No IO.
 * @param {{ dbBytes:number, topTables?:Array<{table_name:string,total_bytes:number}> }} state
 * @param {{ capGB?:number, warnFraction?:number, criticalFraction?:number, tableBloatBytes?:number }} [opts]
 * @returns {{ level:'ok'|'warn'|'critical', dbBytes:number, capBytes:number, dbPct:number, offenders:Array, reason:string }}
 */
export function evaluateSizeAlert(state, opts = {}) {
  const capGB = Number.isFinite(Number(opts.capGB)) ? Number(opts.capGB) : DEFAULT_CAP_GB;
  const warnFrac = Number.isFinite(Number(opts.warnFraction)) ? Number(opts.warnFraction) : WARN_FRACTION;
  const critFrac = Number.isFinite(Number(opts.criticalFraction)) ? Number(opts.criticalFraction) : CRITICAL_FRACTION;
  const bloatBytes = Number.isFinite(Number(opts.tableBloatBytes)) ? Number(opts.tableBloatBytes) : TABLE_BLOAT_BYTES;
  const capBytes = capGB * GB;
  const dbBytes = Number(state && state.dbBytes) || 0;
  const dbPct = capBytes > 0 ? Math.round((1000 * dbBytes) / capBytes) / 10 : 0; // 1-decimal %
  const offenders = (Array.isArray(state && state.topTables) ? state.topTables : [])
    .filter((t) => Number(t && t.total_bytes) >= bloatBytes)
    .map((t) => ({ table: t.table_name, gb: Math.round((100 * Number(t.total_bytes)) / GB) / 100 }));
  let level = 'ok';
  if (dbBytes >= capBytes * critFrac) level = 'critical';
  else if (dbBytes >= capBytes * warnFrac) level = 'warn';
  const reason = level === 'ok'
    ? `db ${dbPct}% of ${capGB}GB cap — under ${Math.round(warnFrac * 100)}% warn`
    : `db ${dbPct}% of ${capGB}GB cap — at/above ${Math.round((level === 'critical' ? critFrac : warnFrac) * 100)}% (${level}); act before the 90% auto-expand`;
  return { level, dbBytes, capBytes, dbPct, offenders, reason };
}

/** Map verdict level → process exit code (0 ok, 1 warn, 2 critical) for cron alerting. */
export function levelToExitCode(level) {
  return level === 'critical' ? 2 : level === 'warn' ? 1 : 0;
}

/**
 * IO runner. FAIL-SOFT: a query error returns { ok:false, error } (caller decides). Injectable
 * querySql(sql) => rows so it unit-tests without a live DB.
 * @returns {{ ok:boolean, verdict?:object, error?:string }}
 */
export async function runMonitor(opts = {}) {
  const { querySql, capGB, log = () => {} } = opts;
  if (typeof querySql !== 'function') return { ok: false, error: 'no querySql' };
  try {
    const rows = await querySql(SIZE_QUERY);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { ok: false, error: 'no rows from size query' };
    const verdict = evaluateSizeAlert(
      { dbBytes: Number(row.db_bytes), topTables: row.top_tables || [] },
      { capGB },
    );
    log(`[db-size-monitor] ${verdict.level.toUpperCase()} — ${verdict.reason}`);
    for (const o of verdict.offenders) log(`[db-size-monitor]   offender: ${o.table} ${o.gb}GB`);
    return { ok: true, verdict };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

export default { DEFAULT_CAP_GB, WARN_FRACTION, CRITICAL_FRACTION, TABLE_BLOAT_BYTES, SIZE_QUERY, evaluateSizeAlert, levelToExitCode, runMonitor };
