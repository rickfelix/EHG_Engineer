/**
 * Check leo_sub_agents table schema
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Get column information
    const query = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'leo_sub_agents'
      ORDER BY ordinal_position;
    `;

    const result = await client.query(query);

    console.log('📋 leo_sub_agents table schema:\n');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name} (${col.data_type})`);
    });

    // Get a sample row
    console.log('\n📄 Sample sub-agent record:\n');
    const sampleQuery = 'SELECT * FROM leo_sub_agents WHERE code = \'DATABASE\' OR name ILIKE \'%database%\' LIMIT 1;';
    const sampleResult = await client.query(sampleQuery);

    if (sampleResult.rows.length > 0) {
      console.log(JSON.stringify(sampleResult.rows[0], null, 2));
    } else {
      console.log('No Database sub-agent found');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

checkSchema();
