import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const r = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name='strategic_directives_v2'
        AND column_name IN ('id','sd_key','uuid_id')
      ORDER BY ordinal_position
    `);
    console.log('strategic_directives_v2 key columns:');
    console.log(JSON.stringify(r.rows, null, 2));

    const pk = await client.query(`
      SELECT a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'strategic_directives_v2'::regclass AND i.indisprimary
    `);
    console.log('\nPK columns:');
    console.log(JSON.stringify(pk.rows, null, 2));

    // Sample value to confirm
    const sample = await client.query(`
      SELECT id, sd_key FROM strategic_directives_v2 WHERE sd_key='SD-LEO-INFRA-REQUIRE-END-END-001' LIMIT 1
    `);
    console.log('\nSample row:');
    console.log(JSON.stringify(sample.rows, null, 2));
  } finally {
    await client.end();
  }
})();
