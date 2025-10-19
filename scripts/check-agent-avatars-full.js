#!/usr/bin/env node
/**
 * Full Avatar Status Check
 *
 * Checks:
 * 1. If avatar tables exist (agent_avatars, avatar_generation_queue)
 * 2. Which agents have avatars generated
 * 3. Avatar generation status for each agent
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkFullAvatarStatus() {
  console.log('='.repeat(70));
  console.log('FULL AVATAR STATUS CHECK');
  console.log('='.repeat(70));
  console.log('');

  let client;

  try {
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    // Step 1: Check if avatar tables exist
    console.log('Step 1: Checking if avatar tables exist...\n');

    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('agent_avatars', 'avatar_generation_queue', 'avatar_diversity_config', 'avatar_background_settings')
      ORDER BY table_name
    `);

    if (tables.length === 0) {
      console.log('❌ Avatar tables DO NOT exist');
      console.log('');
      console.log('📝 Migration not applied yet.');
      console.log('   File: /mnt/c/_EHG/ehg/database/migrations/20251010000001_agent_avatars_automation.sql');
      console.log('');
      console.log('💡 To apply migration:');
      console.log('   Run the migration SQL file against the database');
      return;
    }

    console.log('✅ Found avatar tables:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('');

    // Step 2: Get all agents
    console.log('Step 2: Getting all agents from crewai_agents...\n');

    const { rows: agents } = await client.query(`
      SELECT id, name, role, agent_key, status
      FROM crewai_agents
      ORDER BY name
    `);

    console.log(`Found ${agents.length} agents\n`);

    // Step 3: Check avatar status for each agent
    console.log('Step 3: Checking avatar status for each agent...\n');

    const { rows: avatarStats } = await client.query(`
      SELECT
        ca.id,
        ca.name,
        ca.role,
        ca.status as agent_status,
        COUNT(aa.id) as avatar_count,
        STRING_AGG(aa.generation_status::text, ', ') as avatar_statuses,
        STRING_AGG(aa.variant_number::text, ', ') as variants
      FROM crewai_agents ca
      LEFT JOIN agent_avatars aa ON ca.id = aa.agent_id
      GROUP BY ca.id, ca.name, ca.role, ca.status
      ORDER BY ca.name
    `);

    let withAvatars = 0;
    let withoutAvatars = 0;
    let totalAvatarImages = 0;

    avatarStats.forEach(agent => {
      const hasAvatars = parseInt(agent.avatar_count) > 0;
      const expectedAvatars = 3; // System generates 3 per agent

      if (hasAvatars) {
        withAvatars++;
        totalAvatarImages += parseInt(agent.avatar_count);
        const status = parseInt(agent.avatar_count) === expectedAvatars ? '✅' : '⚠️';
        console.log(`${status} ${agent.name}`);
        console.log(`   Role: ${agent.role}`);
        console.log(`   Avatars: ${agent.avatar_count}/${expectedAvatars}`);
        if (agent.avatar_statuses) {
          console.log(`   Status: ${agent.avatar_statuses}`);
          console.log(`   Variants: ${agent.variants}`);
        }
      } else {
        withoutAvatars++;
        console.log(`❌ ${agent.name}`);
        console.log(`   Role: ${agent.role}`);
        console.log(`   Avatars: 0/${expectedAvatars} - MISSING`);
      }
      console.log('');
    });

    // Step 4: Check generation queue
    console.log('Step 4: Checking avatar generation queue...\n');

    const { rows: queueStats } = await client.query(`
      SELECT status, COUNT(*) as count
      FROM avatar_generation_queue
      GROUP BY status
      ORDER BY status
    `);

    if (queueStats.length > 0) {
      console.log('📊 Queue status:');
      queueStats.forEach(s => {
        console.log(`   ${s.status}: ${s.count}`);
      });
    } else {
      console.log('ℹ️  Queue is empty');
    }
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Agents: ${agents.length}`);
    console.log(`With Avatars: ${withAvatars}`);
    console.log(`Without Avatars: ${withoutAvatars}`);
    console.log(`Total Avatar Images: ${totalAvatarImages} (expected: ${agents.length * 3})`);
    console.log('');

    if (withoutAvatars > 0) {
      console.log('⚠️  ACTION REQUIRED: Some agents are missing avatars');
      console.log('');
      console.log('💡 To generate missing avatars:');
      console.log('   1. Ensure avatar generation service is running');
      console.log('   2. Process items in avatar_generation_queue');
      console.log('   3. Or manually trigger avatar generation');
    } else if (totalAvatarImages < agents.length * 3) {
      console.log('⚠️  WARNING: Some agents have incomplete avatar sets (< 3 variants)');
    } else {
      console.log('✅ All agents have complete avatar sets!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

checkFullAvatarStatus().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
