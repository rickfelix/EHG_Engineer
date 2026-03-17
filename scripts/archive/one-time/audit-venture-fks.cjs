/**
 * audit-venture-fks.js
 *
 * Audits actual database FK constraints referencing ventures(id)
 * against the VENTURE_FK_REGISTRY defined in fk-registry.cjs.
 *
 * Reports: mismatches, missing FKs, and unregistered FKs.
 */
require('dotenv').config();
const { Client } = require('pg');
const { VENTURE_FK_REGISTRY } = require('./modules/venture-lifecycle/fk-registry.cjs');

// Map PostgreSQL confdeltype codes to human-readable names
const CONFDELTYPE_MAP = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

function normPolicy(policy) {
  // Normalize to uppercase without underscores for comparison
  if (!policy) return '';
  return policy.toUpperCase().replace(/_/g, ' ');
}

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error('ERROR: SUPABASE_DB_PASSWORD not set in .env');
    process.exit(1);
  }

  const connStr =
    'postgresql://postgres:' +
    password +
    '@db.dedlbzhpgkmetvhbkyzq.supabase.co:5432/postgres';

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to database.\n');

  // Query all FK constraints that reference ventures(id) in public schema
  const fkQuery = `
    SELECT
      c.conname AS constraint_name,
      child_tbl.relname AS child_table,
      child_att.attname AS child_column,
      parent_tbl.relname AS parent_table,
      c.confdeltype AS delete_action
    FROM pg_constraint c
    JOIN pg_class child_tbl ON c.conrelid = child_tbl.oid
    JOIN pg_class parent_tbl ON c.confrelid = parent_tbl.oid
    JOIN pg_namespace child_ns ON child_tbl.relnamespace = child_ns.oid
    JOIN pg_namespace parent_ns ON parent_tbl.relnamespace = parent_ns.oid
    JOIN pg_attribute child_att ON child_att.attrelid = c.conrelid
      AND child_att.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND parent_tbl.relname = 'ventures'
      AND parent_ns.nspname = 'public'
      AND child_ns.nspname = 'public'
    ORDER BY child_tbl.relname, child_att.attname;
  `;

  const result = await client.query(fkQuery);
  const dbConstraints = result.rows;

  console.log('=== DATABASE FK CONSTRAINTS REFERENCING ventures(id) ===');
  console.log('Total found:', dbConstraints.length);
  console.log('');

  // Build a map of DB constraints keyed by table+column
  const dbMap = new Map();
  for (const row of dbConstraints) {
    const key = row.child_table + '.' + row.child_column;
    dbMap.set(key, {
      constraintName: row.constraint_name,
      table: row.child_table,
      column: row.child_column,
      deleteAction: CONFDELTYPE_MAP[row.delete_action] || row.delete_action,
    });
  }

  // Build a map of registry entries keyed by table+column
  const regMap = new Map();
  for (const entry of VENTURE_FK_REGISTRY) {
    const key = entry.table + '.' + entry.column;
    regMap.set(key, entry);
  }

  // Analyze
  const mismatches = [];
  const missing = [];
  const unregistered = [];
  const matched = [];

  // Check registry entries against DB
  for (const [key, regEntry] of regMap) {
    const dbEntry = dbMap.get(key);
    if (!dbEntry) {
      missing.push(regEntry);
    } else {
      const regPolicy = normPolicy(regEntry.policy);
      const dbPolicy = normPolicy(dbEntry.deleteAction);
      if (regPolicy !== dbPolicy) {
        mismatches.push({
          table: regEntry.table,
          column: regEntry.column,
          constraintName: dbEntry.constraintName,
          expected: regPolicy,
          actual: dbPolicy,
          category: regEntry.category,
        });
      } else {
        matched.push({
          table: regEntry.table,
          column: regEntry.column,
          policy: regPolicy,
          constraintName: dbEntry.constraintName,
        });
      }
    }
  }

  // Check DB entries not in registry
  for (const [key, dbEntry] of dbMap) {
    if (!regMap.has(key)) {
      unregistered.push(dbEntry);
    }
  }

  // Report
  console.log('=== AUDIT RESULTS ===\n');

  console.log('--- MATCHED (correct) ---');
  if (matched.length === 0) {
    console.log('  (none)');
  } else {
    for (const m of matched) {
      console.log('  OK  ' + m.table + '.' + m.column + ' -> ' + m.policy + ' (' + m.constraintName + ')');
    }
  }
  console.log('Count:', matched.length, '\n');

  console.log('--- MISMATCHES (wrong ON DELETE policy) ---');
  if (mismatches.length === 0) {
    console.log('  (none)');
  } else {
    for (const m of mismatches) {
      console.log(
        '  MISMATCH  ' + m.table + '.' + m.column +
        '  expected=' + m.expected +
        '  actual=' + m.actual +
        '  constraint=' + m.constraintName +
        '  category=' + m.category
      );
    }
  }
  console.log('Count:', mismatches.length, '\n');

  console.log('--- MISSING FKs (in registry but not in DB) ---');
  if (missing.length === 0) {
    console.log('  (none)');
  } else {
    for (const m of missing) {
      console.log('  MISSING  ' + m.table + '.' + m.column + '  policy=' + m.policy + '  category=' + m.category);
    }
  }
  console.log('Count:', missing.length, '\n');

  console.log('--- UNREGISTERED FKs (in DB but not in registry) ---');
  if (unregistered.length === 0) {
    console.log('  (none)');
  } else {
    for (const u of unregistered) {
      console.log(
        '  UNREGISTERED  ' + u.table + '.' + u.column +
        '  current=' + u.deleteAction +
        '  constraint=' + u.constraintName
      );
    }
  }
  console.log('Count:', unregistered.length, '\n');

  console.log('=== SUMMARY ===');
  console.log('Registry entries:', VENTURE_FK_REGISTRY.length);
  console.log('DB constraints:  ', dbConstraints.length);
  console.log('Matched:         ', matched.length);
  console.log('Mismatches:      ', mismatches.length);
  console.log('Missing:         ', missing.length);
  console.log('Unregistered:    ', unregistered.length);

  await client.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
