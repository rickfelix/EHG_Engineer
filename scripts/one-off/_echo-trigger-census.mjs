// TR-3 / TS-12: close the trigger census against the LIVE catalog.
// The LEAD census never enumerated pg_trigger, and a trigger is a release writer no grep can see.
// The JS client has no SQL RPC under the service-role key, so this uses the raw pg seam.
import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const client = await createDatabaseClient();
try {
  const trg = await client.query(`
    SELECT t.tgname, p.proname, t.tgenabled,
           CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE c.relname = 'strategic_directives_v2' AND NOT t.tgisinternal
    ORDER BY t.tgname`);
  console.log(`TRIGGERS ON strategic_directives_v2: ${trg.rows.length}`);
  for (const r of trg.rows) console.log(`  ${r.tgname}  -> ${r.proname}()  [${r.timing}, enabled=${r.tgenabled}]`);

  // Does any trigger body touch the claim columns? That is the FR-1 question.
  const CLAIM_COLS = ['claiming_session_id', 'active_session_id', 'is_working_on'];
  console.log('\nWHICH TRIGGER FUNCTIONS WRITE THE CLAIM COLUMNS:');
  for (const r of trg.rows) {
    const src = await client.query('SELECT prosrc FROM pg_proc WHERE proname = $1 LIMIT 1', [r.proname]);
    const body = src.rows[0]?.prosrc || '';
    const hits = CLAIM_COLS.filter((c) => new RegExp(`${c}\\s*(:?=|,)`).test(body) || body.includes(`NEW.${c}`) || body.includes(`${c} =`));
    const phaseAware = /current_phase|status/.test(body);
    if (hits.length) {
      console.log(`  ${r.proname}: writes [${hits.join(', ')}]  phase/status-aware=${phaseAware}`);
    }
  }

  // Is the suspect trigger live, and does it reference a column that does not exist?
  console.log('\nSUSPECT: sync_is_working_on_with_session');
  const suspect = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'sync_is_working_on_with_session' LIMIT 1");
  if (!suspect.rows.length) {
    console.log('  FUNCTION DOES NOT EXIST — never installed or since dropped.');
  } else {
    const body = suspect.rows[0].prosrc;
    const installed = trg.rows.some((r) => r.proname === 'sync_is_working_on_with_session');
    console.log('  function exists; attached to strategic_directives_v2 as a trigger:', installed);
    console.log('  references OLD.sd_id:', body.includes('OLD.sd_id'), '| references OLD.sd_key:', body.includes('OLD.sd_key'));
  }

  // Ground truth for the column it references.
  const col = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_name='claude_sessions' AND column_name IN ('sd_id','sd_key') ORDER BY column_name`);
  console.log('  claude_sessions has:', col.rows.map((r) => r.column_name).join(', ') || '(neither)');
} finally {
  await client.end?.();
}
