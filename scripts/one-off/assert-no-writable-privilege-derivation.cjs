/**
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001 — TS-3 / FR-2 durable assertion.
 *
 * Fails if ANY privilege derivation in the live database reads the
 * CLIENT-WRITABLE metadata half. Exit 0 = clean, exit 1 = a derivation is back.
 *
 * WHY THE MATCH IS ON raw_user_meta_data AND user_metadata BOTH:
 *   An earlier sweep reported "0 policies reference user_metadata" and was read as
 *   proof the defect was middleware-only. That zero was a SUBSTRING FALSE NEGATIVE:
 *   'user_metadata' is not a substring of 'raw_user_meta_data' (there is an
 *   underscore between meta and data). The table-column idiom and the JWT idiom are
 *   spelled differently and BOTH have to be matched or the sweep lies by omission.
 *
 * WHY A CONTROL IS PRINTED:
 *   A sweep that reports zero because it is looking in the wrong place is
 *   indistinguishable from a sweep that reports zero because the system is clean.
 *   The app_metadata counts are the control: they must be NON-zero, which proves the
 *   query can see privilege derivations at all.
 */
require('dotenv').config();
const { Client } = require('pg');

const WRITABLE = `(COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%raw_user_meta_data%'
                OR (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%user_metadata%'`;

(async () => {
  const CONN = process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL;
  if (!CONN) { console.error('NO_CONN: set DATABASE_URL or SUPABASE_POOLER_URL'); process.exit(2); }
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const pols = await client.query(`
    SELECT schemaname, tablename, policyname FROM pg_policies WHERE ${WRITABLE} ORDER BY 1,2,3;`);

  const fns = await client.query(`
    SELECT n.nspname, p.proname, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind IN ('f','p')
      AND pg_get_functiondef(p.oid) ILIKE '%raw_user_meta_data%'
    ORDER BY 1,2;`);

  // Control: the sweep must be able to SEE privilege derivations at all.
  const ctl = await client.query(`
    SELECT
      (SELECT count(*) FROM pg_policies
        WHERE (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%app_metadata%') AS app_policies,
      (SELECT count(*) FROM pg_policies)                                            AS total_policies;`);

  await client.end();

  const c = ctl.rows[0];
  console.log(`control: ${c.app_policies} of ${c.total_policies} policies derive from the TRUSTED half (must be > 0, else this sweep is blind)`);
  console.log(`policies reading the client-writable half: ${pols.rowCount}`);
  pols.rows.forEach(r => console.log(`   ✗ ${r.schemaname}.${r.tablename} :: ${r.policyname}`));
  console.log(`functions reading the client-writable half: ${fns.rowCount}`);
  fns.rows.forEach(r => console.log(`   ✗ ${r.nspname}.${r.proname}()${r.prosecdef ? ' SECURITY DEFINER' : ''}`));

  if (Number(c.app_policies) === 0) {
    console.error('\nINCONCLUSIVE — the control is zero, so this sweep cannot see privilege derivations. Do not read the result as clean.');
    process.exit(2);
  }
  const total = pols.rowCount + fns.rowCount;
  if (total > 0) {
    console.error(`\nFAIL — ${total} privilege derivation(s) still read the client-writable metadata half.`);
    process.exit(1);
  }
  console.log('\nPASS — no privilege derivation reads the client-writable metadata half.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
