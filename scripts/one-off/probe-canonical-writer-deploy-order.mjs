// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — deploy-order and role-surface measurement.
//
// Two claims from the EXEC-phase SECURITY review, re-measured here rather than restated, because
// both are load-bearing in migration headers a future reader will trust:
//
//   F1  Does a PostgREST UPDATE whose payload names a column absent from the schema cache return
//       PGRST204 -- even when the predicate matches ZERO rows? If so, merging the stamped code
//       before the column migration applies takes every handoff transition down, AND PGRST204 is
//       not SDCW1, so isCanonicalWriteRejection() returns false and the two compensation paths
//       silently swallow it. This is why the stamp column ships as its own separate migration.
//
//   F3  Does `authenticated` genuinely hold UPDATE on strategic_directives_v2 behind a PERMISSIVE
//       policy? If so, TR-4's non-coverage disclosure must name it alongside service_role rather
//       than implying a boundary that does not exist.
//
// ZERO-WRITE BY CONSTRUCTION: every probe UPDATE uses a predicate matching no row, and the control
// case proves the shape is otherwise valid ({data: [], error: null}). A post-probe count confirms no
// row was created. Read-only catalog queries otherwise.
//
// Usage: node scripts/one-off/probe-canonical-writer-deploy-order.mjs
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import fs from 'node:fs';

const out = { measured_at: new Date().toISOString() };

// ── F1 ────────────────────────────────────────────────────────────────────────────────────────
const supabase = createSupabaseServiceClient();
const NO_SUCH = 'SD-NO-SUCH-ROW-PGRST204-PROBE';

// (a) payload names the not-yet-existing column, predicate matches zero rows
{
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ lifecycle_write_token: 'handoff.js', status: 'draft' })
    .eq('id', NO_SUCH)
    .select('id');
  out.f1_missing_column_zero_row_predicate = {
    data, error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
  };
}

// (b) control: same predicate, payload of only columns that DO exist. Proves the PGRST204 above is
//     about the column and not about the probe shape.
{
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ status: 'draft' })
    .eq('id', NO_SUCH)
    .select('id');
  out.f1_control_existing_columns_only = {
    data, error: error ? { code: error.code, message: error.message } : null,
  };
}

// (c) does PGRST204 satisfy isCanonicalWriteRejection()? (it keys on code === 'SDCW1')
out.f1_pgrst204_is_mistaken_for_sdcw1 =
  out.f1_missing_column_zero_row_predicate.error?.code === 'SDCW1';

// ── F3 ────────────────────────────────────────────────────────────────────────────────────────
const pg = await createDatabaseClient('engineer', { verify: false });
const { rows: policies } = await pg.query(`
  SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
  ORDER BY cmd, policyname`);
out.f3_policies = policies;

const { rows: grants } = await pg.query(`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='strategic_directives_v2'
    AND grantee IN ('anon','authenticated','service_role','PUBLIC')
    AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  ORDER BY grantee, privilege_type`);
out.f3_grants = grants;

// Does the row still exist untouched? (no row matched, so nothing should have changed anywhere)
const { rows: probeRow } = await pg.query(
  'SELECT count(*)::int AS n FROM strategic_directives_v2 WHERE id = $1', [NO_SUCH]);
out.f1_probe_row_created_by_accident = probeRow[0].n;

await pg.end();

fs.mkdirSync('database/evidence/canonical-writer-choke', { recursive: true });
fs.writeFileSync(
  'database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json',
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 1));
