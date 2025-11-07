#!/usr/bin/env node

/**
 * Temporary script to query EHG application database schema
 * for CrewAI tables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://liapbndqlqxdcgpwntbv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzI4MzcsImV4cCI6MjA3MTk0ODgzN30.YlzzH17RYHsFs3TBmKlbmZPJYfUEWU71cAURwTsu8-M';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function querySchema() {
  try {
    console.log('=== QUERYING CREWAI_AGENTS TABLE SCHEMA ===\n');

    // Fetch one row to see what columns exist
    const { data: sampleRow, error: sampleError } = await supabase
      .from('crewai_agents')
      .select('*')
      .limit(1)
      .single();

    if (sampleError && sampleError.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching sample row:', sampleError);
    }

    if (sampleRow) {
      console.log('Columns found in crewai_agents:');
      Object.keys(sampleRow).forEach((col, idx) => {
        const value = sampleRow[col];
        const type = typeof value;
        console.log(`  ${(idx + 1).toString().padStart(2)}. ${col.padEnd(30)} (${type})`);
      });
      console.log(`\nTotal columns: ${Object.keys(sampleRow).length}`);

      // Check for specific columns we're interested in
      const checkColumns = [
        'verbose',
        'memory_enabled',
        'reasoning_enabled',
        'multimodal_enabled',
        'max_rpm',
        'max_iter',
        'memory_config_id'
      ];

      console.log('\nColumn existence check:');
      checkColumns.forEach(col => {
        const exists = col in sampleRow;
        console.log(`  ${col.padEnd(30)}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
      });
    } else {
      console.log('No rows found in crewai_agents table (table might be empty)');
      console.log('Attempting to get column names from empty table...\n');

      // Try to get columns from empty result
      const { data, error } = await supabase
        .from('crewai_agents')
        .select('*')
        .limit(0);

      if (error) {
        console.error('Error:', error);
      } else {
        console.log('Table exists but is empty.');
      }
    }

    console.log('\n=== QUERYING CREWAI_CREWS TABLE SCHEMA ===\n');

    const { data: crewRow, error: crewError } = await supabase
      .from('crewai_crews')
      .select('*')
      .limit(1)
      .single();

    if (crewError && crewError.code !== 'PGRST116') {
      console.error('Error fetching crews:', crewError);
    }

    if (crewRow) {
      console.log('Columns found in crewai_crews:');
      Object.keys(crewRow).forEach((col, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2)}. ${col}`);
      });

      const crewCheckColumns = ['crew_type', 'process_type', 'verbose', 'planning_enabled', 'memory_enabled'];
      console.log('\nColumn existence check:');
      crewCheckColumns.forEach(col => {
        const exists = col in crewRow;
        console.log(`  ${col.padEnd(30)}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
      });
    } else {
      console.log('No rows found in crewai_crews table (table might be empty)');
    }

    console.log('\n=== QUERYING CREWAI_TASKS TABLE SCHEMA ===\n');

    const { data: taskRow, error: taskError } = await supabase
      .from('crewai_tasks')
      .select('*')
      .limit(1)
      .single();

    if (taskError && taskError.code !== 'PGRST116') {
      console.error('Error fetching tasks:', taskError);
    }

    if (taskRow) {
      console.log('Columns found in crewai_tasks:');
      Object.keys(taskRow).forEach((col, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2)}. ${col}`);
      });

      const taskCheckColumns = ['async_execution', 'expected_output', 'human_input'];
      console.log('\nColumn existence check:');
      taskCheckColumns.forEach(col => {
        const exists = col in taskRow;
        console.log(`  ${col.padEnd(30)}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
      });
    } else {
      console.log('No rows found in crewai_tasks table (table might be empty)');
    }

    console.log('\n=== CHECKING NEW TABLES ===\n');

    const { data: memoryData, error: memoryError } = await supabase
      .from('agent_memory_configs')
      .select('*')
      .limit(0);

    console.log(`agent_memory_configs: ${memoryError ? '✗ DOES NOT EXIST' : '✓ EXISTS'}`);

    const { data: deployData, error: deployError } = await supabase
      .from('agent_code_deployments')
      .select('*')
      .limit(0);

    console.log(`agent_code_deployments: ${deployError ? '✗ DOES NOT EXIST' : '✓ EXISTS'}`);

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

querySchema();
