#!/usr/bin/env node

/**
 * Load Database Sub-Agent Instructions and Retrospectives
 * Shows accumulated knowledge from past database operations
 */

import { executeSubAgent } from '../lib/sub-agent-executor.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('DATABASE SUB-AGENT INVOCATION');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Task: Apply migration 009_create_profiles_table.sql');
  console.log('SD-ID: SD-USER-PROFILES-FIX-001 (Database access errors fix)');
  console.log('');
  console.log('This will:');
  console.log('1. Load DATABASE sub-agent instructions from database');
  console.log('2. Display accumulated lessons from retrospectives');
  console.log('3. Execute migration with proper validation');
  console.log('4. Store results in sub_agent_execution_results');
  console.log('');

  try {
    const result = await executeSubAgent('DATABASE', 'SD-USER-PROFILES-FIX-001', {
      task: 'apply_migration',
      migration_file: '../ehg/database/migrations/009_create_profiles_table.sql',
      database: 'liapbndqlqxdcgpwntbv',
      app: 'EHG',
      verify_rls: true,
      create_default_data: true
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('EXECUTION COMPLETE');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Verdict:', result.verdict);
    console.log('Confidence:', result.confidence);
    console.log('Recommendations:');
    result.recommendations?.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
