#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 — full end-to-end dry run of the UP + DOWN migration
 * bodies, inside ONE transaction that always ROLLBACKs. Safe to re-run against production any
 * time before the real ceremony: Postgres DDL is transactional, so no other session ever sees
 * the intermediate state, and the ROLLBACK fully undoes everything -- nothing is persisted.
 *
 * Exists because a DATABASE sub-agent review (evidence 8c3ed611) found the migration as
 * originally authored would abort at ceremony time: 10 of the 15 target columns are referenced
 * by 12 dependent views/matviews (2 in the `governance` schema; re-censused 2026-08-22 after the
 * original 11-object list missed public.v_plan_item_position and the 2026-08-22 ceremony
 * attempt failed-and-rolled-back exactly on that gap), which `ALTER COLUMN TYPE` cannot touch
 * without first dropping them. This script proves the corrected drop/recreate envelope actually
 * works end-to-end -- both directions -- against the live schema, not just that the SQL parses.
 *
 * Run before the chairman ceremony (and again if the schema has changed since) to catch any
 * drift between this file's assumptions and the live view/matview definitions before the real
 * apply.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractBody(sql) {
  const start = sql.indexOf('BEGIN;');
  const end = sql.lastIndexOf('COMMIT;');
  if (start === -1 || end === -1) throw new Error('Could not find BEGIN;/COMMIT; markers');
  return sql.slice(start + 'BEGIN;'.length, end);
}

const TARGET_COLUMN_QUERY = `
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('quick_fixes','sd_phase_handoffs','strategic_directives_v2','user_stories')
      AND column_name IN ('completed_at','created_at','started_at','accepted_at','rejected_at','approval_date','archived_at','effective_date','expiry_date','updated_at')
    ORDER BY table_name, column_name
  `;

export async function runDryRun(client) {
  const upSql = readFileSync(`${__dirname}/20260817_four_audit_critical_timestamptz.sql`, 'utf-8');
  const downSql = readFileSync(`${__dirname}/20260817_four_audit_critical_timestamptz_DOWN.sql`, 'utf-8');
  const upBody = extractBody(upSql);
  const downBody = extractBody(downSql);

  const log = [];
  await client.query('BEGIN');
  try {
    await client.query(upBody);
    log.push('UP applied without error');

    const afterUp = await client.query(TARGET_COLUMN_QUERY);
    const allAware = afterUp.rows.length === 15 && afterUp.rows.every(r => r.data_type === 'timestamp with time zone');
    log.push(`All 15 columns timestamptz after UP: ${allAware}`);

    await client.query('SELECT count(*) FROM public.v_active_sessions');
    await client.query('SELECT count(*) FROM governance.v_governance_overview');
    await client.query('SELECT count(*) FROM public.v_plan_item_position');
    log.push('Recreated views queryable post-UP');

    await client.query(downBody);
    log.push('DOWN applied without error');

    const afterDown = await client.query(TARGET_COLUMN_QUERY);
    const allNaiveAgain = afterDown.rows.length === 15 && afterDown.rows.every(r => r.data_type === 'timestamp without time zone');
    log.push(`All 15 columns naive again after DOWN: ${allNaiveAgain}`);

    await client.query('ROLLBACK');
    return { pass: allAware && allNaiveAgain, log };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be aborted */ }
    return { pass: false, log: [...log, `ERROR: ${err.message}`] };
  }
}

if (isMainModule(import.meta.url)) {
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const result = await runDryRun(client);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exit(1);
  } finally {
    await client.end();
  }
}
