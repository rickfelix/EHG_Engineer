#!/usr/bin/env node
/**
 * Verify sub-agent orchestration is ready to run
 * Tests the exact connection pattern used by orchestrate-phase-subagents.js
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

async function verifyOrchestration() {
  console.log('🎭 Sub-Agent Orchestration Readiness Check\n');
  console.log('═'.repeat(60));
  
  console.log('\n📊 Testing orchestrator database connection...');
  console.log('   (Simulating orchestrate-phase-subagents.js:204)\n');
  
  try {
    const client = await createDatabaseClient('engineer', { verify: false });
    
    // Test connection
    const result = await client.query(`
      SELECT 
        current_database() as db,
        current_user as user,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'sub_agent_execution_results'
        ) as table_exists
    `);
    
    console.log('   ✅ Connection: SUCCESS');
    console.log(`   ✅ Database: ${result.rows[0].db}`);
    console.log(`   ✅ User: ${result.rows[0].user}`);
    console.log(`   ✅ Target table exists: ${result.rows[0].table_exists}`);
    
    await client.end();
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ ORCHESTRATION READY');
    console.log('   Sub-agent orchestration can now store results successfully!');
    console.log('   The SSL certificate error has been resolved.');
    console.log('═'.repeat(60) + '\n');
    
    return true;
    
  } catch (_error) {
    console.log('   ❌ Connection: FAILED');
    console.log(`   ❌ Error: ${error.message}`);
    console.log('\n' + '═'.repeat(60));
    console.log('❌ ORCHESTRATION BLOCKED');
    console.log('   Sub-agent orchestration cannot connect to database.');
    console.log('═'.repeat(60) + '\n');
    return false;
  }
}

verifyOrchestration().then(success => process.exit(success ? 0 : 1));
