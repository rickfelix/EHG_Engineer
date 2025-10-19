#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  // Check for requirements tables
  const { rows: reqTables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE '%requirement%'
    ORDER BY table_name;
  `);

  console.log('Tables matching "requirement":', reqTables.length);
  reqTables.forEach(r => console.log('  -', r.table_name));

  // Check for strategic_directives table
  const { rows: sdTables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE '%directive%'
    ORDER BY table_name;
  `);

  console.log('\nTables matching "directive":', sdTables.length);
  sdTables.forEach(r => console.log('  -', r.table_name));

  await client.end();
})();
