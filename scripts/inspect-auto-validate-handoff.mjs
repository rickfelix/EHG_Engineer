#!/usr/bin/env node
/**
 * Read auto_validate_handoff() function source and its trigger attachment
 * to determine whether PCVP_EMERGENCY_BYPASS can be allow-listed there too.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  const fn = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('auto_validate_handoff','enforce_handoff_on_phase_transition','enforce_handoff_system','enforce_is_working_on_for_handoffs')
    ORDER BY p.proname
  `);

  for (const r of fn.rows) {
    console.log('=====================================================');
    console.log('FUNCTION:', r.proname);
    console.log('=====================================================');
    console.log(r.def);
    console.log('');
  }

  const trig = await client.query(`
    SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relname IN ('sd_phase_handoffs','strategic_directives_v2')
    ORDER BY c.relname, t.tgname
  `);

  console.log('=====================================================');
  console.log('TRIGGERS on sd_phase_handoffs + strategic_directives_v2');
  console.log('=====================================================');
  for (const r of trig.rows) {
    console.log(`[${r.table_name}] ${r.tgname}`);
    console.log(`  ${r.def}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
