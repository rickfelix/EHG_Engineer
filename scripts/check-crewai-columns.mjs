#!/usr/bin/env node

/**
 * Check which columns exist in CrewAI tables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumn(table, column) {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .limit(0);

  if (error) {
    if (error.message && error.message.toLowerCase().includes('does not exist')) {
      return { exists: false, error: error.message };
    }
    return { exists: false, error: error.message, unknownError: true };
  }

  return { exists: true };
}

async function checkColumns() {
  console.log('=== CHECKING CREWAI_AGENTS COLUMNS ===\n');

  const agentColumns = [
    'id',
    'verbose',
    'memory_enabled',
    'reasoning_enabled',
    'multimodal_enabled',
    'max_rpm',
    'max_iter',
    'memory_config_id',
    'allow_delegation',
    'cache_enabled'
  ];

  for (const col of agentColumns) {
    const result = await checkColumn('crewai_agents', col);
    if (result.exists) {
      console.log(`✓ ${col.padEnd(30)} EXISTS`);
    } else if (result.unknownError) {
      console.log(`? ${col.padEnd(30)} UNKNOWN (error: ${result.error})`);
    } else {
      console.log(`✗ ${col.padEnd(30)} MISSING`);
    }
  }

  console.log('\n=== CHECKING CREWAI_CREWS COLUMNS ===\n');

  const crewColumns = [
    'id',
    'crew_type',
    'process_type',
    'verbose',
    'planning_enabled',
    'memory_enabled'
  ];

  for (const col of crewColumns) {
    const result = await checkColumn('crewai_crews', col);
    if (result.exists) {
      console.log(`✓ ${col.padEnd(30)} EXISTS`);
    } else if (result.unknownError) {
      console.log(`? ${col.padEnd(30)} UNKNOWN (error: ${result.error})`);
    } else {
      console.log(`✗ ${col.padEnd(30)} MISSING`);
    }
  }

  console.log('\n=== CHECKING CREWAI_TASKS COLUMNS ===\n');

  const taskColumns = [
    'id',
    'async_execution',
    'expected_output',
    'human_input'
  ];

  for (const col of taskColumns) {
    const result = await checkColumn('crewai_tasks', col);
    if (result.exists) {
      console.log(`✓ ${col.padEnd(30)} EXISTS`);
    } else if (result.unknownError) {
      console.log(`? ${col.padEnd(30)} UNKNOWN (error: ${result.error})`);
    } else {
      console.log(`✗ ${col.padEnd(30)} MISSING`);
    }
  }

  console.log('\n=== CHECKING NEW TABLES ===\n');

  const memResult = await checkColumn('agent_memory_configs', 'id');
  console.log(`agent_memory_configs: ${memResult.exists ? '✓ EXISTS' : '✗ MISSING'}`);

  const deployResult = await checkColumn('agent_code_deployments', 'id');
  console.log(`agent_code_deployments: ${deployResult.exists ? '✓ EXISTS' : '✗ MISSING'}`);
}

checkColumns();
