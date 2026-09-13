import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('ehg');
try {
  const r = await c.query(`
    SELECT table_name, column_name, is_generated
    FROM information_schema.columns
    WHERE table_schema='public' AND data_type='boolean'
      AND (column_name LIKE '%\_evaluated' OR column_name LIKE '%\_passed' OR column_name LIKE '%\_verified')
    ORDER BY column_name, table_name`);
  const byName = new Map();
  for (const x of r.rows) { if(!byName.has(x.column_name)) byName.set(x.column_name, []); byName.get(x.column_name).push(x.table_name); }
  console.log('LIVE boolean *_evaluated/*_passed/*_verified column NAMES:', byName.size);
  for (const [n, tables] of [...byName].sort()) console.log(`  ${n}  (${tables.length} table(s)): ${tables.join(', ')}`);
  const BASE = ['conformance_passed','content_lint_passed','gate_passed','subagent_verified','test_passed','uat_verified','validation_passed'];
  const extra = [...byName.keys()].filter(n => !BASE.includes(n));
  const missing = BASE.filter(n => !byName.has(n));
  console.log('\nNOT in lint baseline (would be flagged if re-added):', extra.length ? extra.join(', ') : 'NONE');
  console.log('In baseline but NOT live:', missing.length ? missing.join(', ') : 'NONE');
  const cpe = await c.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='control_pack_evaluated'`);
  console.log('control_pack_evaluated as a real COLUMN:', cpe.rows.length ? JSON.stringify(cpe.rows) : 'NONE (jsonb key only, as FR-3 states)');
} finally { await c.end(); }
