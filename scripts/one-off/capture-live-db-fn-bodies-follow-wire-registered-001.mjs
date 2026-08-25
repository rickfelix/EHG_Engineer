import fs from 'node:fs';
import path from 'node:path';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const OUT = 'database/evidence/canonical-writer-choke';

const FUNCTIONS = [
  'complete_business_evaluation',
  'request_business_evaluation',
  'fn_rollback_sd_hierarchy',
  'delete_venture',
  'kill_venture',
];

async function main() {
  const client = await createDatabaseClient('engineer', { verbose: false });
  try {
    for (const name of FUNCTIONS) {
      const { rows } = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
        [name]
      );
      if (rows.length === 0) {
        console.error(`${name}: NOT FOUND in pg_proc`);
        continue;
      }
      if (rows.length > 1) {
        console.error(`${name}: ${rows.length} overloads found -- ambiguous, needs manual disambiguation`);
        continue;
      }
      const captureTs = new Date().toISOString();
      const header =
        `-- CAPTURED LIVE via pg_get_functiondef() at ${captureTs}\n` +
        `-- SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2 -- BEFORE artifact.\n` +
        `-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale\n` +
        `-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD\n` +
        `-- this session -- see the choke file's own section 4 provenance note).\n--\n`;
      const outPath = path.join(OUT, `${name}.before.sql`);
      fs.writeFileSync(outPath, header + rows[0].def + '\n');
      console.log(`${name}: wrote ${outPath} (${rows[0].def.length} bytes)`);
    }
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
