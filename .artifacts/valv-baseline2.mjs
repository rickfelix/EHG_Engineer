import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('ehg');
try {
  const r = await c.query(`
    SELECT c.table_name, c.column_name, t.table_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema='public' AND c.data_type='boolean'
      AND (c.column_name LIKE '%\_evaluated' OR c.column_name LIKE '%\_passed' OR c.column_name LIKE '%\_verified')
      AND t.table_type='BASE TABLE'
    ORDER BY c.column_name, c.table_name`);
  const byName = new Map();
  for (const x of r.rows) { if(!byName.has(x.column_name)) byName.set(x.column_name, []); byName.get(x.column_name).push(x.table_name); }
  console.log('BASE TABLE boolean *_evaluated/*_passed/*_verified NAMES:', byName.size, '| column instances:', r.rows.length);
  for (const [n, t] of [...byName].sort()) console.log(`  ${n}: ${t.join(', ')}`);
  const BASE=['conformance_passed','content_lint_passed','gate_passed','subagent_verified','test_passed','uat_verified','validation_passed'];
  console.log('\nlive-but-NOT-in-baseline:', [...byName.keys()].filter(n=>!BASE.includes(n)).join(', ')||'NONE');
  console.log('baseline-but-NOT-live:', BASE.filter(n=>!byName.has(n)).join(', ')||'NONE');
  const q = await c.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('subagent_verified','test_passed')`);
  console.log('\nsubagent_verified / test_passed anywhere (any type):', q.rows.length ? JSON.stringify(q.rows) : 'NONE IN public SCHEMA');
} finally { await c.end(); }
