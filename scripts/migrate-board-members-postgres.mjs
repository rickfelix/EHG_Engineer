#!/usr/bin/env node
import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 Board Members Migration: EHG_Engineer → EHG App (PostgreSQL)');
  console.log('════════════════════════════════════════════════════════════════\n');

  let sourceClient, destClient;

  try {
    // Connect to both databases
    console.log('📡 Connecting to databases...');
    sourceClient = await createDatabaseClient('engineer');
    destClient = await createDatabaseClient('app');
    console.log('✅ Connected to both databases\n');

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

    // Step 3: Prepare and insert members
    console.log('Step 3: Migrating board members...\n');

    for (const member of sourceResult.rows) {
      const memberName = member.metadata?.name || 'Unknown';
      console.log(`   Migrating: ${memberName} - ${member.board_role}`);

      // Insert with mapped fields
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
    }

    console.log(`\n✅ Successfully migrated ${sourceResult.rows.length} board members!\n`);

    // Step 4: Verify
    console.log('Step 4: Verifying migration...');
    const verifyResult = await destClient.query(`
      SELECT id, position, status, voting_weight
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
    console.error('   Stack:', error.stack);
    process.exit(1);
  } finally {
    // Clean up connections
    if (sourceClient) await sourceClient.end();
    if (destClient) await destClient.end();
  }
}

main();
