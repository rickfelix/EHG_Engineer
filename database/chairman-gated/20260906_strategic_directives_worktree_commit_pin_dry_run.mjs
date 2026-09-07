#!/usr/bin/env node
/**
 * Dry-run proof for 20260906_strategic_directives_worktree_commit_pin.sql
 * (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B, FR-1).
 *
 * Runs the REAL UP file's body (ADD COLUMN, ADD CONSTRAINT, and the file's own DO $verify$
 * shape-regex proofs), asserts the column+constraint exist with the right shape, then runs the
 * REAL DOWN file's body and asserts they are gone again -- all inside ONE transaction that ALWAYS
 * ROLLBACKs, so nothing is ever persisted. Safe to re-run against production any time before the
 * real ceremony.
 *
 * Usage: node database/chairman-gated/20260906_strategic_directives_worktree_commit_pin_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260906_strategic_directives_worktree_commit_pin.sql');
const DOWN_FILE = join(__dirname, '20260906_strategic_directives_worktree_commit_pin_DOWN.sql');

const COLUMN_QUERY = `
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2'
    AND column_name = 'worktree_commit_pin'
`;

const CONSTRAINT_QUERY = `
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'public.strategic_directives_v2'::regclass
    AND conname = 'ck_strategic_directives_worktree_commit_pin_provenance'
`;

export async function runDryRun(client) {
  const upSql = readFileSync(UP_FILE, 'utf8');
  const downSql = readFileSync(DOWN_FILE, 'utf8');
  const log = [];

  await client.query('BEGIN');
  try {
    await client.query(upSql);
    log.push('UP applied without error (including its own DO $verify$ shape-regex proofs)');

    const afterUp = await client.query(COLUMN_QUERY);
    const columnExists = afterUp.rows.length === 1 && afterUp.rows[0].is_nullable === 'YES';
    log.push(`worktree_commit_pin exists + nullable after UP: ${columnExists}`);

    const constraintAfterUp = await client.query(CONSTRAINT_QUERY);
    const constraintExists = constraintAfterUp.rows.length === 1;
    log.push(`CHECK constraint exists after UP: ${constraintExists}`);

    // Prove the constraint actually rejects a bare unpinned value (FR-6's underlying claim,
    // proven here pre-ceremony) -- a real INSERT is heavier than needed; a scoped UPDATE inside
    // this same rolled-back transaction against one arbitrary existing row proves the same thing.
    let constraintRejects = false;
    try {
      await client.query(
        `UPDATE strategic_directives_v2 SET worktree_commit_pin = '/bare/unpinned/path' WHERE false`
      );
      // WHERE false touches zero rows, so this alone proves nothing about the constraint --
      // run the real probe against an actual row inside a SAVEPOINT so a failure doesn't abort
      // the rest of the dry run.
      await client.query('SAVEPOINT probe');
      await client.query(
        `UPDATE strategic_directives_v2 SET worktree_commit_pin = '/bare/unpinned/path'
         WHERE id = (SELECT id FROM strategic_directives_v2 LIMIT 1)`
      );
      await client.query('ROLLBACK TO SAVEPOINT probe');
      constraintRejects = false; // reached here without the constraint raising -- BAD
    } catch (err) {
      constraintRejects = /ck_strategic_directives_worktree_commit_pin_provenance/.test(err.message)
        || err.code === '23514';
      await client.query('ROLLBACK TO SAVEPOINT probe').catch(() => {});
    }
    log.push(`CHECK constraint rejects a bare unpinned value: ${constraintRejects}`);

    await client.query(downSql);
    log.push('DOWN applied without error');

    const afterDown = await client.query(COLUMN_QUERY);
    const columnGone = afterDown.rows.length === 0;
    log.push(`worktree_commit_pin gone after DOWN: ${columnGone}`);

    const constraintAfterDown = await client.query(CONSTRAINT_QUERY);
    const constraintGone = constraintAfterDown.rows.length === 0;
    log.push(`CHECK constraint gone after DOWN: ${constraintGone}`);

    await client.query('ROLLBACK');
    log.push('[ROLLBACK] Transaction rolled back -- no live state changed.');

    const pass = columnExists && constraintExists && constraintRejects && columnGone && constraintGone;
    return { pass, log };
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
    if (!result.pass) process.exitCode = 1;
  } finally {
    await client.end();
  }
}
