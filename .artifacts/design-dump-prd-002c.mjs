import { createDatabaseClient } from '../lib/supabase-connection.js';
import fs from 'fs';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`SELECT * FROM product_requirements_v2 WHERE id = 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C'`);
const row = r.rows[0];
let out = '';
for (const [k,v] of Object.entries(row)) {
  if (v === null || v === undefined) continue;
  out += `\n\n===== ${k} =====\n`;
  out += typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}
fs.writeFileSync('.artifacts/prd-002c.txt', out);
console.log('bytes', out.length);
await c.end();
