#!/usr/bin/env node
// DB size / bloat monitor CLI — SD-LEO-INFRA-DB-RETENTION-GOVERNANCE-AUDIT-LOG-001 (FR-5).
//
// Read-only. Alerts BEFORE the next 90% Supabase auto-expand: exit 0 (ok) / 1 (warn ≥75%) /
// 2 (critical ≥85%). Cron this (e.g. daily) and alert on a non-zero exit.
//
// Usage:
//   node scripts/db-retention/db-size-monitor.mjs                 # uses DB_SIZE_CAP_GB or 12
//   DB_SIZE_CAP_GB=12 node scripts/db-retention/db-size-monitor.mjs
//
// Connection: reuses the pg pooler URL the repo already uses for raw SQL (EHG_POOLER_URL /
// SUPABASE_DB_URL / DATABASE_URL). Read-only single SELECT; never writes.
import 'dotenv/config';
import pg from 'pg';
import { SIZE_QUERY, runMonitor, levelToExitCode } from '../../lib/db-retention/size-monitor.mjs';

function resolveConnString() {
  return process.env.EHG_POOLER_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

async function main() {
  const conn = resolveConnString();
  if (!conn) { console.error('[db-size-monitor] no DB connection string (EHG_POOLER_URL/SUPABASE_DB_URL/DATABASE_URL)'); process.exit(0); /* fail-soft: don't alert on config gap */ }
  const capGB = process.env.DB_SIZE_CAP_GB ? Number(process.env.DB_SIZE_CAP_GB) : undefined;
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  let querySql;
  try {
    await client.connect();
    querySql = async (sql) => (await client.query(sql)).rows;
  } catch (e) {
    console.error('[db-size-monitor] connect failed (fail-soft, no alert):', e.message);
    process.exit(0);
  }
  try {
    const res = await runMonitor({ querySql, capGB, log: (m) => console.log(m) });
    if (!res.ok) { console.error('[db-size-monitor] query failed (fail-soft):', res.error); process.exit(0); }
    const v = res.verdict;
    console.log(`\n  DB: ${(v.dbBytes / (1024 ** 3)).toFixed(2)}GB / ${(v.capBytes / (1024 ** 3)).toFixed(0)}GB = ${v.dbPct}%  → ${v.level.toUpperCase()}`);
    process.exit(levelToExitCode(v.level));
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error('[db-size-monitor] fatal (fail-soft):', e?.message || e); process.exit(0); });

export { SIZE_QUERY };
