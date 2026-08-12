#!/usr/bin/env node
/**
 * FR-1 (SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001): reconcile the apply-ledger
 * entry for database/migrations/20260711_orchestrator_terminal_status_sql_parity.sql
 * so MIGRATION_APPLY_PROD_FAIL_TAMPERED stops firing on it.
 *
 * WHY NOT A GENUINE APPLY ROW (TR-2): the DDL body was never re-run and did not need to
 * be -- sections (a)/(b) get_progress_breakdown are already ahead of this file's round-2
 * content via a later, independent migration (20260724_fix_get_progress_breakdown_deferred_terminal.sql,
 * QF-20260724-212); sections (d)/(e) already match round-2 exactly, live-verified. Inserting a
 * prod_deploy=true row would misrepresent that a deploy happened. This row is explicitly
 * dry_run=true, prod_deploy=false -- honest that no DDL executed via this record -- while
 * still being success=true with the CURRENT file's sha256, which is all readAuditLatestForPath()
 * (scripts/apply-migration.js) checks: it filters WHERE success = true only, not on dry_run.
 *
 * Idempotent: re-running after this SD's first successful run is a no-op (the sha already matches).
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createDatabaseClient } from './lib/supabase-connection.js';

// TWO distinct paths, deliberately kept separate:
//  - CONTENT_PATH: co-located with THIS script (import.meta.url-relative), so it always
//    reads the file from whichever checkout this script itself lives in (worktree or
//    main tree) regardless of the invoking CWD.
//  - LEDGER_PATH_KEY: repoRoot (git rev-parse --show-toplevel from the invoking CWD) +
//    the relative migration path -- matches apply-migration.js's OWN path resolution
//    exactly, so a future genuine invocation from the main repo root looks up the same
//    key this script writes. Run this script from the MAIN repo root so this resolves
//    to the canonical (non-worktree-specific) path.
const MIGRATION_PATH_REL = 'database/migrations/20260711_orchestrator_terminal_status_sql_parity.sql';
const CONTENT_PATH = new URL(`../${MIGRATION_PATH_REL}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const LEDGER_PATH_KEY = path.join(REPO_ROOT.replace(/\//g, path.sep), ...MIGRATION_PATH_REL.split('/'));
const SD_KEY = 'SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001';

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function gitUserEmail() {
  try { return execSync('git config --get user.email', { encoding: 'utf8' }).trim(); }
  catch { return process.env.GIT_USER_EMAIL || 'unknown'; }
}

async function main() {
  const sql = fs.readFileSync(CONTENT_PATH, 'utf8');
  const sha = sha256(sql);
  const client = await createDatabaseClient('engineer', { verify: true });
  try {
    const { rows } = await client.query(
      `SELECT id, migration_sha256, applied_at FROM public.schema_migrations_applied
        WHERE migration_path = $1 AND success = true ORDER BY applied_at DESC LIMIT 1`,
      [LEDGER_PATH_KEY]
    );
    const prior = rows[0] || null;
    if (prior && prior.migration_sha256 === sha) {
      console.log(`ALREADY_RECONCILED: latest ledger row (id=${prior.id}, applied_at=${prior.applied_at}) already matches the current file's sha256=${sha}. No-op.`);
      return;
    }

    const reconciliation_note = {
      kind: 'ledger_reconciliation',
      sd_key: SD_KEY,
      no_ddl_executed: true,
      reason: "sections (a)/(b) get_progress_breakdown already superseded-forward by 20260724_fix_get_progress_breakdown_deferred_terminal.sql (QF-20260724-212); sections (d)/(e) try_auto_complete_parent_orchestrator + trg_auto_complete_parent_orchestrator already match this file's round-2 content exactly. Section (c) complete_orchestrator_sd is out of scope, owned by 20260712_orchestrator_ghost_complete_lead_final.sql.",
      verified_via: 'direct pg_proc.prosrc + pg_get_triggerdef catalog query over the pooler, LEAD phase 2026-08-12, corroborated by an independent Explore file-read pass',
      mechanism_verifications_ref: `strategic_directives_v2.metadata.mechanism_verifications for ${SD_KEY}`,
    };

    const cols = {
      migration_path: LEDGER_PATH_KEY,
      migration_sha256: sha,
      applied_by: gitUserEmail(),
      prod_deploy: false,
      dry_run: true,
      statement_count: 0,
      object_diffs: JSON.stringify(reconciliation_note),
      success: true,
    };
    const colNames = Object.keys(cols);
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO public.schema_migrations_applied (${colNames.join(', ')}) VALUES (${placeholders}) RETURNING id, applied_at`;
    const { rows: inserted } = await client.query(insertSql, colNames.map((c) => cols[c]));
    console.log(`RECONCILED: inserted ledger row id=${inserted[0].id} applied_at=${inserted[0].applied_at} sha256=${sha} (dry_run=true, prod_deploy=false -- no DDL executed).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
