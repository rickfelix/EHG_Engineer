/**
 * Drive the ACTUAL exported buildScratchQfInsertPayload() through the live quick_fixes
 * triggers/constraints inside a transaction that is ALWAYS rolled back. Zero durable writes.
 */
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
import { buildScratchQfInsertPayload } from '../scripts/verify-quick-fixes-metadata-activation.mjs';

const payload = buildScratchQfInsertPayload('QF-VERIFYACT-LIVEPROBE-TEST', 'verify-activation-probe-test');
console.log('PAYLOAD=' + JSON.stringify(payload, null, 1));

const cols = Object.keys(payload);
const vals = cols.map((_, i) => '$' + (i + 1));
const c = await createDatabaseClient('engineer', { verify: false });
try {
  await c.query('BEGIN');
  const res = await c.query(
    `INSERT INTO quick_fixes (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id, status, claiming_session_id, target_application, pr_url, commit_sha`,
    cols.map((k) => payload[k])
  );
  console.log('INSERT_ACCEPTED=true');
  console.log('ROW=' + JSON.stringify(res.rows[0]));

  // Belt auto-start predicate (lib/fleet/belt-depth.cjs:227) against the row as actually stored.
  const belt = await c.query(
    `SELECT count(*)::int AS n FROM quick_fixes
     WHERE id=$1 AND status='open' AND pr_url IS NULL AND commit_sha IS NULL AND claiming_session_id IS NULL`,
    [payload.id]
  );
  console.log('BELT_AUTO_STARTABLE_MATCHES=' + belt.rows[0].n + ' (must be 0)');

  // Prove the CAS predicate mergeQfMetadataKeys uses would match this row (rowCount=1),
  // i.e. no false cas_lost once the metadata column lands.
  const cas = await c.query(
    `SELECT count(*)::int AS n FROM quick_fixes WHERE id=$1 AND claiming_session_id=$2`,
    [payload.id, payload.claiming_session_id]
  );
  console.log('CAS_PREDICATE_MATCHES=' + cas.rows[0].n + ' (must be 1)');
} catch (e) {
  console.log('INSERT_ACCEPTED=false');
  console.log('ERROR_CODE=' + e.code + ' MESSAGE=' + e.message);
} finally {
  await c.query('ROLLBACK');
  const gone = await c.query('SELECT count(*)::int AS n FROM quick_fixes WHERE id=$1', [payload.id]);
  console.log('ROLLED_BACK=true REMAINING_ROWS=' + gone.rows[0].n + ' (must be 0)');
  await c.end();
}
