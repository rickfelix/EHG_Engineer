#!/usr/bin/env node

/**
 * Create Test Strategic Directive for OpenAI Codex Integration
 * LEAD Agent creating a small, focused SD for testing the complete workflow
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestSD() {
  console.log(chalk.cyan('🎯 LEAD AGENT: Creating Strategic Directive'));
  console.log(chalk.gray('─'.repeat(60)));

  const sdId = `SD-TEST-CODEX-${Date.now()}`;

  const strategicDirective = {
    id: sdId,
    title: 'Add Timestamp Utility Function',
    description: 'Create a utility function that returns formatted timestamps for logging purposes',
    status: 'active',
    priority: 'medium',
    category: 'feature',

    // Strategic fields
    strategic_intent: 'Improve application logging consistency',
    rationale: 'Current logging lacks consistent timestamp formatting, making debugging difficult',
    scope: 'Create a new utility module that provides timestamp formatting functionality',

    key_changes: JSON.stringify([
      'Add new timestamp utility module',
      'Standardize timestamp format across application',
      'Update existing logging to use new utility'
    ]),

    strategic_objectives: JSON.stringify([
      'Improve debugging efficiency',
      'Standardize logging format',
      'Enable better log analysis'
    ]),

    success_criteria: JSON.stringify([
      'All logs use consistent timestamp format',
      'Timezone handling is correct',
      'No performance degradation'
    ]),

    success_metrics: JSON.stringify([
      'Function returns consistent ISO 8601 timestamps',
      'Function accepts optional format parameter',
      'Function handles timezone correctly',
      'All tests pass'
    ]),

    implementation_guidelines: JSON.stringify([
      'Use built-in Date API only',
      'Follow existing code style',
      'Include comprehensive tests'
    ]),

    dependencies: JSON.stringify([
      'No external npm packages',
      'Node.js built-in Date API'
    ]),

    risks: JSON.stringify([
      'Timezone handling complexity',
      'Date formatting edge cases'
    ]),

    stakeholders: JSON.stringify(['Engineering Team']),

    created_by: 'LEAD',
    approved_by: 'LEAD',
    approval_date: new Date().toISOString(),
    effective_date: new Date().toISOString()
  };

  try {
    // Insert SD into database
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) throw error;

    console.log(chalk.green('✅ Strategic Directive created successfully!\n'));

    console.log(chalk.yellow('Strategic Directive Details:'));
    console.log(`  ID: ${chalk.white(data.id)}`);
    console.log(`  Title: ${chalk.white(data.title)}`);
    console.log(`  Priority: ${chalk.white(data.priority)}`);
    console.log(`  Status: ${chalk.white(data.status)}`);

    console.log(chalk.yellow('\nStrategic Intent:'));
    console.log(`  ${chalk.white(data.strategic_intent)}`);

    console.log(chalk.yellow('\nScope:'));
    console.log(`  ${chalk.white(data.scope)}`);

    console.log(chalk.yellow('\nKey Changes:'));
    JSON.parse(data.key_changes).forEach(d => {
      console.log(`  - ${chalk.white(d)}`);
    });

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('📋 LEAD-to-PLAN HANDOFF READY'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════'));

    console.log(chalk.green('\nNext Step (PLAN Agent):'));
    console.log(chalk.white('  Create PRD from this SD'));

    return data;

  } catch (error) {
    console.error(chalk.red('❌ Error creating SD:'), error.message);
    throw error;
  }
}

// Execute
createTestSD()
  .then(sd => {
    console.log(chalk.gray('\n[LEAD Agent work complete]'));
    process.exit(0);
  })
  .catch(error => {
    process.exit(1);
  });