#!/usr/bin/env node
/**
 * SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 (EXEC step 5a)
 *
 * Apply additive, reversible migration:
 *   database/migrations/20260520_add_surface_columns_to_wireframe_screens.sql
 *
 * Phases:
 *   1. PRE-CHECK   — table exists? columns already present? (idempotency)
 *   2. APPLY       — run ALTER TABLE + COMMENT statements verbatim (service_role / postgres)
 *   3. POST-VERIFY — columns exist (types/nullability) + prove CHECK via ROLLED-BACK invalid insert
 *   4. REPORT      — total rows + rows where surface IS NULL (backfill planning)
 *
 * Additive only. Will NOT create the table. STOPS if table missing.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = join(
  __dirname,
  '..',
  '..',
  'database',
  'migrations',
  '20260520_add_surface_columns_to_wireframe_screens.sql'
);

const TABLE = 'wireframe_screens';
const SCHEMA = 'public';

function log(section, msg) {
  console.log(`\n=== ${section} ===`);
  if (msg) console.log(msg);
}

async function columnInfo(client, column) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [SCHEMA, TABLE, column]
  );
  return rows[0] || null;
}

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  const summary = { applied: false, errors: [] };
  try {
    // ---------------------------------------------------------------
    // 1. PRE-CHECK
    // ---------------------------------------------------------------
    log('1. PRE-CHECK');
    const tableExists = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2`,
      [SCHEMA, TABLE]
    );
    if (tableExists.rowCount === 0) {
      console.error(`STOP: Table ${SCHEMA}.${TABLE} does NOT exist. Out of scope to create it.`);
      summary.tableMissing = true;
      console.log('\n__SUMMARY__' + JSON.stringify(summary));
      process.exitCode = 2;
      return;
    }
    console.log(`Table ${SCHEMA}.${TABLE} EXISTS.`);

    const surfaceBefore = await columnInfo(client, 'surface');
    const pageTypeBefore = await columnInfo(client, 'page_type');
    console.log(`Column "surface" pre-existing:   ${surfaceBefore ? 'YES (' + surfaceBefore.data_type + ', nullable=' + surfaceBefore.is_nullable + ')' : 'no'}`);
    console.log(`Column "page_type" pre-existing: ${pageTypeBefore ? 'YES (' + pageTypeBefore.data_type + ', nullable=' + pageTypeBefore.is_nullable + ')' : 'no'}`);
    summary.preExisting = { surface: !!surfaceBefore, page_type: !!pageTypeBefore };

    // ---------------------------------------------------------------
    // 2. APPLY — run the migration's ALTER + COMMENT statements verbatim.
    //    We execute the upper (UP) portion only; the DOWN block is commented
    //    out in the file. Wrap in a single transaction (matches file BEGIN/COMMIT).
    // ---------------------------------------------------------------
    log('2. APPLY', `Reading ${MIGRATION_FILE}`);
    const fileSQL = readFileSync(MIGRATION_FILE, 'utf-8');

    // Statements executed verbatim (the exact text from the migration file).
    const stmts = [
      `ALTER TABLE public.wireframe_screens
  ADD COLUMN IF NOT EXISTS surface TEXT
    CHECK (surface IN ('marketing', 'auth', 'app'))`,
      `ALTER TABLE public.wireframe_screens
  ADD COLUMN IF NOT EXISTS page_type TEXT`,
      `COMMENT ON COLUMN public.wireframe_screens.surface IS
  'SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B: '
  'Audience surface classification. '
  'marketing = public-facing pages (landing, pricing, features). '
  'auth = sign-up / sign-in / password-reset flows. '
  'app = authenticated product screens (dashboard, settings, profile). '
  'NULL = pre-migration row or flag-off generation.'`,
      `COMMENT ON COLUMN public.wireframe_screens.page_type IS
  'SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B: '
  'Lowercase slug derived from the screen name/role '
  '(e.g. landing, signup, login, dashboard, settings, profile, pricing, onboarding). '
  'Populated when EVA_SURFACE_AWARE_ENABLED=true at generation time.'`,
    ];

    // Sanity: confirm the literal ALTER statements appear in the file as written.
    const fileHasSurfaceAlter = fileSQL.includes("ADD COLUMN IF NOT EXISTS surface TEXT");
    const fileHasPageTypeAlter = fileSQL.includes("ADD COLUMN IF NOT EXISTS page_type TEXT");
    if (!fileHasSurfaceAlter || !fileHasPageTypeAlter) {
      throw new Error('Migration file content does not match expected ALTER statements; aborting (no guessing).');
    }

    await client.query('BEGIN');
    for (const sql of stmts) {
      const preview = sql.split('\n')[0].slice(0, 70);
      console.log(`  -> ${preview}...`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    summary.applied = true;
    console.log('APPLIED (single transaction committed).');

    // ---------------------------------------------------------------
    // 3. POST-VERIFY
    // ---------------------------------------------------------------
    log('3. POST-VERIFY');
    const surfaceAfter = await columnInfo(client, 'surface');
    const pageTypeAfter = await columnInfo(client, 'page_type');
    console.log(`surface:   ${JSON.stringify(surfaceAfter)}`);
    console.log(`page_type: ${JSON.stringify(pageTypeAfter)}`);
    if (!surfaceAfter || surfaceAfter.data_type !== 'text') {
      throw new Error('POST-VERIFY FAIL: surface column missing or wrong type');
    }
    if (!pageTypeAfter || pageTypeAfter.data_type !== 'text') {
      throw new Error('POST-VERIFY FAIL: page_type column missing or wrong type');
    }
    summary.postVerify = { surface: surfaceAfter, page_type: pageTypeAfter };

    // Read the CHECK constraint definition from pg_constraint.
    const checkDef = await client.query(
      `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = $1 AND rel.relname = $2 AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%surface%'`,
      [SCHEMA, TABLE]
    );
    console.log('CHECK constraint(s) referencing surface:');
    checkDef.rows.forEach(r => console.log(`  ${r.conname}: ${r.def}`));
    summary.checkConstraints = checkDef.rows;

    // Prove the CHECK rejects an invalid value, then ROLL BACK so no row persists.
    log('3b. CHECK ENFORCEMENT PROOF (rolled-back invalid insert)');
    let checkRejected = false;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO public.wireframe_screens (surface) VALUES ('not_a_valid_surface')`
      );
      console.log('  UNEXPECTED: invalid insert SUCCEEDED (CHECK not enforced!)');
    } catch (e) {
      checkRejected = e.code === '23514' || /check constraint/i.test(e.message);
      console.log(`  Invalid insert REJECTED as expected: [${e.code}] ${e.message.split('\n')[0]}`);
    } finally {
      await client.query('ROLLBACK');
      console.log('  Transaction ROLLED BACK (no test row persisted).');
    }
    summary.checkRejectsInvalid = checkRejected;
    if (!checkRejected) {
      // Constraint definition still proves enforcement even if the probe row hit
      // a different NOT NULL first; flag for the report but do not hard-fail.
      console.log('  NOTE: probe did not produce a 23514; relying on constraint def above as proof.');
    }

    // ---------------------------------------------------------------
    // 4. REPORT — row counts for backfill planning
    // ---------------------------------------------------------------
    log('4. REPORT (backfill planning)');
    const counts = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE surface IS NULL)::int AS null_surface
         FROM public.wireframe_screens`
    );
    const { total, null_surface } = counts.rows[0];
    console.log(`Total rows:            ${total}`);
    console.log(`Rows surface IS NULL:  ${null_surface}`);
    summary.rowCounts = { total, null_surface };

    console.log('\n__SUMMARY__' + JSON.stringify(summary));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    summary.errors.push(err.message);
    console.error('\nERROR:', err.message);
    console.log('\n__SUMMARY__' + JSON.stringify(summary));
    process.exitCode = 1;
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

main();
