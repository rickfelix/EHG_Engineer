#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 Board Members Migration: EHG_Engineer → EHG App');
  console.log('════════════════════════════════════════════════════════════════\n');

  // EHG_Engineer database (source) - use pooler URL
  const sourceClient = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL ||
      'postgresql://postgres.dedlbzhpgkmetvhbkyzq:Fl%21M32DaM00n%211@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  // EHG App database (destination) - use pooler URL
  const destClient = new Client({
    connectionString: process.env.EHG_POOLER_URL ||
      'postgresql://postgres.liapbndqlqxdcgpwntbv:Fl%21M32DaM00n%211@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Connect to both databases
    console.log('📡 Connecting to source database (EHG_Engineer)...');
    await sourceClient.connect();
    console.log('✅ Connected to EHG_Engineer\n');

    console.log('📡 Connecting to destination database (EHG App)...');
    await destClient.connect();
    console.log('✅ Connected to EHG App\n');

    // Step 1: Query source database
    console.log('Step 1: Querying EHG_Engineer database...');
    const sourceResult = await sourceClient.query(`
      SELECT * FROM board_members ORDER BY created_at ASC
    `);

    console.log(`✅ Found ${sourceResult.rows.length} board members in source\n`);

    if (sourceResult.rows.length === 0) {
      console.log('⚠️  No board members to migrate!');
      return;
    }

    // Step 2: Check destination
    console.log('Step 2: Checking EHG App database...');
    const countResult = await destClient.query(`
      SELECT COUNT(*) as count FROM board_members
    `);
    console.log(`📊 Current count in EHG App: ${countResult.rows[0].count} board members\n`);

    // Step 3: Migrate members
    console.log('Step 3: Migrating board members...\n');

    let migrated = 0;
    for (const member of sourceResult.rows) {
      const memberName = member.metadata?.name || 'Unknown';
      console.log(`   Migrating: ${memberName} - ${member.board_role}`);

      try {
        await destClient.query(`
          INSERT INTO board_members (
            id,
            agent_id,
            position,
            voting_weight,
            expertise_domains,
            appointed_at,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            position = EXCLUDED.position,
            voting_weight = EXCLUDED.voting_weight,
            expertise_domains = EXCLUDED.expertise_domains,
            appointed_at = EXCLUDED.appointed_at,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
        `, [
          member.id,
          member.agent_id,
          member.board_role,  // board_role → position
          member.voting_weight,
          member.expertise_domains,
          member.appointment_date,  // appointment_date → appointed_at
          member.status,
          member.created_at,
          member.updated_at
        ]);
        migrated++;
      } catch (error) {
        console.error(`   ❌ Failed to migrate ${memberName}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully migrated ${migrated} out of ${sourceResult.rows.length} board members!\n`);

    // Step 4: Verify
    console.log('Step 4: Verifying migration...');
    const verifyResult = await destClient.query(`
      SELECT id, position, status, voting_weight, expertise_domains
      FROM board_members
      ORDER BY created_at ASC
    `);

    console.log(`✅ Verification complete: ${verifyResult.rows.length} members in EHG App\n`);

    verifyResult.rows.forEach((member, i) => {
      console.log(`   ${i + 1}. ${member.position} (${member.status}) - Weight: ${member.voting_weight}`);
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ Migration Complete!');
    console.log('════════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  } finally {
    // Clean up connections
    await sourceClient.end();
    await destClient.end();
  }
}

main();
