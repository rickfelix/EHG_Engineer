#!/usr/bin/env node
/**
 * Check Avatar Status for CrewAI Agents
 *
 * Verifies that all agents in crewai_agents table have avatars assigned.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkAgentAvatars() {
  console.log('='.repeat(70));
  console.log('CHECKING CREWAI AGENT AVATARS');
  console.log('='.repeat(70));
  console.log('');

  let client;

  try {
    // Connect to EHG database (where crewai_agents table is)
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    // Query all agents with avatar information
    const { rows: agents } = await client.query(`
      SELECT
        id,
        name,
        role,
        agent_key,
        status
      FROM crewai_agents
      ORDER BY name
    `);

    console.log(`Found ${agents.length} agents in crewai_agents table\n`);

    if (agents.length === 0) {
      console.log('⚠️  No agents found in crewai_agents table');
      return;
    }

    // Display all agents
    console.log('📋 Agent List:');
    console.log('');
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.name}`);
      console.log(`   Role: ${agent.role}`);
      console.log(`   Key: ${agent.agent_key}`);
      console.log(`   Status: ${agent.status}`);
      console.log('');
    });

    // Check table schema to see if avatar columns exist
    console.log('Checking table schema for avatar columns...');
    const { rows: columns } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'crewai_agents'
      AND column_name LIKE '%avatar%'
      ORDER BY column_name
    `);

    if (columns.length === 0) {
      console.log('');
      console.log('⚠️  WARNING: No avatar columns found in crewai_agents table');
      console.log('');
      console.log('📝 Table schema does not include avatar columns.');
      console.log('   Expected columns: avatar_url, avatar_path, or similar');
      console.log('');
      console.log('💡 To add avatar support, you may need to:');
      console.log('   1. Create a migration to add avatar columns');
      console.log('   2. Upload avatar images to storage');
      console.log('   3. Update agent records with avatar URLs/paths');
    } else {
      console.log('');
      console.log('✅ Found avatar columns:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });

      // Re-query with avatar columns
      const avatarCols = columns.map(c => c.column_name).join(', ');
      const { rows: agentsWithAvatars } = await client.query(`
        SELECT
          id,
          name,
          role,
          ${avatarCols}
        FROM crewai_agents
        ORDER BY name
      `);

      console.log('');
      console.log('📊 Avatar Status:');
      console.log('');

      let withAvatars = 0;
      let withoutAvatars = 0;

      agentsWithAvatars.forEach(agent => {
        const hasAvatar = columns.some(col => {
          const value = agent[col.column_name];
          return value && value !== null && value !== '';
        });

        if (hasAvatar) {
          withAvatars++;
          console.log(`✅ ${agent.name}`);
          columns.forEach(col => {
            const value = agent[col.column_name];
            if (value) {
              console.log(`   ${col.column_name}: ${value}`);
            }
          });
        } else {
          withoutAvatars++;
          console.log(`❌ ${agent.name} - NO AVATAR`);
        }
        console.log('');
      });

      console.log('='.repeat(70));
      console.log('SUMMARY');
      console.log('='.repeat(70));
      console.log(`Total Agents: ${agents.length}`);
      console.log(`With Avatars: ${withAvatars}`);
      console.log(`Without Avatars: ${withoutAvatars}`);
      console.log('');

      if (withoutAvatars > 0) {
        console.log('⚠️  ACTION REQUIRED: Some agents are missing avatars');
      } else {
        console.log('✅ All agents have avatars assigned!');
      }
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

checkAgentAvatars().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
