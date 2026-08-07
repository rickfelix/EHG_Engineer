/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-4 backfill.
 *
 * The self-adherence loop wrote category='solomon_self_adherence' while the
 * authoritative contract (leo_protocol_sections id=611) mandates
 * 'solomon_adherence_drift'. The loop has been aligned; these are the rows it
 * already wrote under the drifted spelling.
 *
 * WHY BACKFILL AT ALL: an analytics discontinuity inside a SCORECARD is a silent
 * lie — a future reader computing an adherence trend across the rename gets a
 * wrong answer with no warning that anything happened.
 *
 * WHY STAMP EACH ROW: rewriting history invisibly is the failure mode to avoid;
 * rewriting it legibly is fine. Every migrated row records what it was renamed
 * from and by which SD, so nobody later concludes the old category never existed.
 *
 * Dry-run by default. Idempotent: re-running finds nothing left to move, and
 * already-stamped rows are never double-stamped. The population is LIVE (it grew
 * from 16 to 17 between planning and execution), so the script counts what is
 * actually there rather than assuming a fixed number.
 *
 *   node scripts/one-off/backfill-solomon-adherence-category.mjs           # preview
 *   node scripts/one-off/backfill-solomon-adherence-category.mjs --apply   # write
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const OLD = 'solomon_self_adherence';
const NEW = 'solomon_adherence_drift';
const SD = 'SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001';

const apply = process.argv.includes('--apply');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await supabase
  .from('feedback')
  .select('id, category, created_at, metadata')
  .eq('category', OLD)
  .order('created_at', { ascending: true });

if (error) { console.error('read failed:', error.message); process.exit(1); }

console.log(`${OLD} -> ${NEW}`);
console.log(`rows to migrate: ${rows.length}${apply ? '' : '  (dry run — pass --apply to write)'}`);
if (rows.length) {
  console.log(`  oldest: ${rows[0].created_at}`);
  console.log(`  newest: ${rows[rows.length - 1].created_at}`);
}

if (!apply || rows.length === 0) {
  const { count: already } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('category', NEW);
  console.log(`already under ${NEW}: ${already ?? 0}`);
  process.exit(0);
}

let migrated = 0;
const failures = [];
for (const row of rows) {
  const md = (row.metadata && typeof row.metadata === 'object') ? { ...row.metadata } : {};
  // Never double-stamp: an earlier partial run must be safe to resume.
  if (!md.category_rename) {
    md.category_rename = {
      from: OLD,
      to: NEW,
      sd: SD,
      reason: 'loop drifted from the contract; contract (leo_protocol_sections id=611) is authoritative',
      renamed_at: new Date().toISOString(),
    };
  }
  const { error: upErr } = await supabase
    .from('feedback')
    .update({ category: NEW, metadata: md })
    .eq('id', row.id);
  if (upErr) failures.push({ id: row.id, error: upErr.message });
  else migrated += 1;
}

console.log(`migrated: ${migrated}/${rows.length}`);
if (failures.length) {
  console.error(`FAILURES (${failures.length}):`);
  failures.forEach((f) => console.error(`  ${f.id}: ${f.error}`));
  process.exit(1);
}

// Verify at ground truth rather than trusting the update calls.
const { count: remaining } = await supabase
  .from('feedback').select('id', { count: 'exact', head: true }).eq('category', OLD);
const { count: total } = await supabase
  .from('feedback').select('id', { count: 'exact', head: true }).eq('category', NEW);
console.log(`verified: ${remaining ?? 0} left under ${OLD}, ${total ?? 0} now under ${NEW}`);
if ((remaining ?? 0) !== 0) { console.error('INCOMPLETE — rows remain under the old category'); process.exit(1); }
