/**
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001 — FR-5 negative test.
 *
 * THE REQUIRED NEGATIVE TEST: a non-chairman principal self-promotes by writing
 * its OWN user_metadata, then a gated derivation is asked whether it is chairman.
 * Against UNFIXED code this returns TRUE (escalation succeeds) and this script
 * exits 1. After the fix it returns FALSE and the script exits 0.
 *
 * WHY THIS SHAPE, AND WHY IT IS NOT A SIMULATION:
 *   Supabase's auth.updateUser({ data: {...} }) writes exactly ONE column:
 *   auth.users.raw_user_meta_data. This script performs that same write, so the
 *   attack primitive is reproduced faithfully rather than approximated. It then
 *   sets request.jwt.claims so auth.uid() resolves to the attacker, which is how
 *   fn_is_chairman() identifies the caller in real RLS evaluation.
 *
 * WHY IT PERSISTS NOTHING:
 *   The whole thing runs inside a transaction that ALWAYS rolls back, including
 *   on error. Creating a real confirmed auth user to run this would leave behind
 *   exactly the kind of standing privileged-ish account this SD exists to remove.
 *
 * A test that only checks "a real chairman still gets through" would PASS against
 * the vulnerable code and prove nothing. This one is directional on purpose.
 */
require('dotenv').config();
const { Client } = require('pg');

const ATTACK = '{"role":"chairman"}';

(async () => {
  const CONN = process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL;
  if (!CONN) { console.error('NO_CONN: set DATABASE_URL or SUPABASE_POOLER_URL'); process.exit(2); }
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let escalated = null, legitOk = null, victimId = null;
  try {
    await client.query('BEGIN');

    // Pick a principal that is NOT privileged by either half — the attacker.
    const victim = await client.query(`
      SELECT id, split_part(email,'@',2) AS domain
      FROM auth.users
      WHERE COALESCE(raw_user_meta_data->>'role','') NOT IN ('chairman','admin','owner')
        AND COALESCE(raw_app_meta_data ->>'role','') NOT IN ('chairman','admin','owner')
      ORDER BY created_at
      LIMIT 1;`);
    if (!victim.rowCount) throw new Error('no unprivileged principal available to act as the attacker');
    victimId = victim.rows[0].id;
    console.log(`attacker principal: ${String(victimId).slice(0,8)}… (@${victim.rows[0].domain}) — privileged by neither half at start`);

    // THE ATTACK: exactly what auth.updateUser({data:{role:'chairman'}}) writes.
    await client.query(
      `UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb) || $1::jsonb WHERE id = $2;`,
      [ATTACK, victimId]
    );

    // Become that principal the way RLS sees it, then ask the gated derivation.
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true);`, [victimId]);
    const r = await client.query('SELECT public.fn_is_chairman() AS is_chairman;');
    escalated = r.rows[0].is_chairman;

    // Control: the legitimate holder (trusted half) must still resolve TRUE, so a
    // FALSE above cannot be dismissed as "the function just returns false now".
    const legit = await client.query(`
      SELECT id FROM auth.users
      WHERE raw_app_meta_data->>'role' IN ('chairman','admin','owner')
      ORDER BY last_sign_in_at DESC NULLS LAST LIMIT 1;`);
    if (legit.rowCount) {
      await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true);`, [legit.rows[0].id]);
      const lr = await client.query('SELECT public.fn_is_chairman() AS is_chairman;');
      legitOk = lr.rows[0].is_chairman;
    }
  } finally {
    await client.query('ROLLBACK');           // nothing above is ever persisted
    await client.end();
  }

  console.log('');
  console.log('  self-promoted via user_metadata -> fn_is_chairman() =', escalated);
  console.log('  legitimate holder (app_metadata) -> fn_is_chairman() =', legitOk);
  console.log('');

  if (escalated === true) {
    console.error('RED — VULNERABLE: a principal granted itself chairman by writing its own user_metadata.');
    process.exit(1);
  }
  if (legitOk === false || legitOk === null) {
    console.error('FAIL — the escalation is closed but the LEGITIMATE holder also lost access (lockout).');
    process.exit(1);
  }
  console.log('GREEN — self-promotion refused, legitimate holder retained. Escalation closed without lockout.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
