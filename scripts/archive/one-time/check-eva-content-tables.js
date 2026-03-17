/**
 * Check if EVA Content Catalogue tables exist in EHG database
 * SD-EVA-CONTENT-001
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkTables() {
  console.log('🔍 Checking EVA Content Catalogue Tables in EHG Database\n');

  // Try different connection approaches
  const connections = [
    { name: 'EHG_POOLER_URL', url: process.env.EHG_POOLER_URL },
    { name: 'SUPABASE_POOLER_URL', url: process.env.SUPABASE_POOLER_URL }
  ];

  for (const conn of connections) {
    if (!conn.url) {
      console.log(`❌ ${conn.name} not configured\n`);
      continue;
    }

    console.log(`\n📡 Trying connection: ${conn.name}`);
    console.log(`   Database: ${conn.url.match(/postgres\.([^:]+)/)?.[1]}\n`);

    const client = new Client({
      connectionString: conn.url,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log(`✅ Connected via ${conn.name}\n`);

      const tables = [
        'content_types',
        'screen_layouts',
        'content_catalogue',
        'content_versions',
        'content_layout_assignments',
        'eva_conversations',
        'conversation_content_links',
        'eva_user_settings',
        'content_item_metadata'
      ];

      console.log('🔍 Checking tables:\n');

      for (const table of tables) {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          );
        `, [table]);

        const exists = result.rows[0].exists;
        console.log(`  ${exists ? '✅' : '❌'} ${table}`);
      }

      console.log(`\n✅ Check complete via ${conn.name}\n`);
      await client.end();
      break; // Success, no need to try other connections

    } catch (err) {
      console.error(`❌ Failed via ${conn.name}:`, err.message);
      await client.end().catch(() => {});
    }
  }
}

checkTables();
