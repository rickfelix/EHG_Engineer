#!/usr/bin/env node
/**
 * Check Workflow Coordinator agent status
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkWorkflowCoordinator() {
  console.log('🔍 Checking Workflow Coordinator agent...\n');

  let client;

  try {
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    const { rows: agents } = await client.query(`
      SELECT id, name, role, agent_key, status, created_at, updated_at
      FROM crewai_agents
      WHERE name ILIKE '%workflow%coordinator%' OR agent_key LIKE '%workflow%'
      ORDER BY created_at
    `);

    if (agents.length === 0) {
      console.log('❌ No Workflow Coordinator found in database\n');
      return;
    }

    agents.forEach(agent => {
      console.log(`Agent: ${agent.name}`);
      console.log(`  ID: ${agent.id}`);
      console.log(`  Role: ${agent.role}`);
      console.log(`  Key: ${agent.agent_key}`);
      console.log(`  Status: ${agent.status}`);
      console.log(`  Created: ${agent.created_at}`);
      console.log(`  Updated: ${agent.updated_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

checkWorkflowCoordinator().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
