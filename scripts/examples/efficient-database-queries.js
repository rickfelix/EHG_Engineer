#!/usr/bin/env node

/**
 * Efficient Database Query Examples
 * Demonstrates before/after patterns for context-efficient queries
 *
 * Run: node scripts/examples/efficient-database-queries.js
 */

import { createSupabaseClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseClient();

// Helper to estimate tokens
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

console.log('\n' + '='.repeat(60));
console.log('EFFICIENT DATABASE QUERY EXAMPLES');
console.log('Context Management Best Practices');
console.log('='.repeat(60) + '\n');

// ==============================================================================
// Example 1: Select Specific Columns
// ==============================================================================

console.log('📊 Example 1: Select Specific Columns Only\n');

async function example1_selectColumns() {
  console.log('❌ BAD: select(\'*\')');
  console.log('─'.repeat(40));

  const { data: sdBad } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const badOutput = JSON.stringify(sdBad, null, 2);
  console.log('Output preview:', badOutput.substring(0, 200) + '...');
  console.log(`Tokens: ~${estimateTokens(badOutput)}`);
  console.log();

  console.log('✅ GOOD: select(\'specific, columns\')\n');
  console.log('─'.repeat(40));

  const { data: sdGood } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const goodOutput = `${sdGood.id}: ${sdGood.title} (status: ${sdGood.status}, priority: ${sdGood.priority}, progress: ${sdGood.progress}%)`;
  console.log('Output:', goodOutput);
  console.log(`Tokens: ~${estimateTokens(goodOutput)}`);
  console.log();

  const savings = estimateTokens(badOutput) - estimateTokens(goodOutput);
  console.log(`💰 Token Savings: ${savings} tokens (${Math.round(savings / estimateTokens(badOutput) * 100)}% reduction)\n`);
}

// ==============================================================================
// Example 2: Limit Results with Pagination
// ==============================================================================

console.log('📊 Example 2: Limit Results and Paginate\n');

async function example2_limitResults() {
  console.log('❌ BAD: Fetch all rows');
  console.log('─'.repeat(40));

  const { data: allSDs, count: _totalCount } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact' });

  const badOutput = JSON.stringify(allSDs, null, 2);
  console.log(`Fetched: ${allSDs.length} records`);
  console.log(`Tokens: ~${estimateTokens(badOutput)}`);
  console.log();

  console.log('✅ GOOD: Limit with summary');
  console.log('─'.repeat(40));

  const { data: topSDs, count } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority', { count: 'exact' })
    .in('status', ['active', 'in_progress'])
    .order('priority', { ascending: false })
    .limit(5);

  let goodOutput = `Found ${count} active SDs, showing top 5 by priority:\n`;
  topSDs.forEach((sd, i) => {
    goodOutput += `  ${i+1}. ${sd.id}: ${sd.title} (priority: ${sd.priority})\n`;
  });
  goodOutput += '\nFull list: http://localhost:3000/strategic-directives';

  console.log(goodOutput);
  console.log(`Tokens: ~${estimateTokens(goodOutput)}`);
  console.log();

  const savings = estimateTokens(badOutput) - estimateTokens(goodOutput);
  console.log(`💰 Token Savings: ${savings} tokens (${Math.round(savings / estimateTokens(badOutput) * 100)}% reduction)\n`);
}

// ==============================================================================
// Example 3: Summarize Instead of Dump
// ==============================================================================

console.log('📊 Example 3: Summarize Large Results\n');

async function example3_summarize() {
  console.log('❌ BAD: JSON.stringify full object');
  console.log('─'.repeat(40));

  const { data: prdBad } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (prdBad) {
    const badOutput = JSON.stringify(prdBad, null, 2);
    console.log('Output preview:', badOutput.substring(0, 200) + '...');
    console.log(`Tokens: ~${estimateTokens(badOutput)}`);
    console.log();

    console.log('✅ GOOD: Summarize key fields');
    console.log('─'.repeat(40));

    const { data: prdGood } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status, objectives, acceptance_criteria')
      .eq('id', prdBad.id)
      .single();

    let goodOutput = `PRD: ${prdGood.title}\n`;
    goodOutput += `Status: ${prdGood.status}\n`;
    goodOutput += `Objectives: ${prdGood.objectives?.length || 0} defined\n`;
    goodOutput += `Acceptance Criteria: ${prdGood.acceptance_criteria?.length || 0} items\n`;
    goodOutput += `\nFull PRD: http://localhost:3000/prd/${prdGood.id}`;

    console.log(goodOutput);
    console.log(`Tokens: ~${estimateTokens(goodOutput)}`);
    console.log();

    const savings = estimateTokens(badOutput) - estimateTokens(goodOutput);
    console.log(`💰 Token Savings: ${savings} tokens (${Math.round(savings / estimateTokens(badOutput) * 100)}% reduction)\n`);
  } else {
    console.log('⚠️  No PRDs found in database\n');
  }
}

// ==============================================================================
// Example 4: Count Instead of Fetch
// ==============================================================================

console.log('📊 Example 4: Count Instead of Fetch\n');

async function example4_count() {
  console.log('❌ BAD: Fetch to count');
  console.log('─'.repeat(40));

  const { data: retrospectives } = await supabase
    .from('retrospectives')
    .select('*');

  const badOutput = `Total retrospectives: ${retrospectives.length}`;
  console.log(badOutput);
  console.log(`Tokens for fetching all: ~${estimateTokens(JSON.stringify(retrospectives))}`);
  console.log();

  console.log('✅ GOOD: Use count');
  console.log('─'.repeat(40));

  const { count } = await supabase
    .from('retrospectives')
    .select('*', { count: 'exact', head: true });

  const goodOutput = `Total retrospectives: ${count}`;
  console.log(goodOutput);
  console.log(`Tokens: ~${estimateTokens(goodOutput)}`);
  console.log();

  const savings = estimateTokens(JSON.stringify(retrospectives)) - estimateTokens(goodOutput);
  console.log(`💰 Token Savings: ${savings} tokens (${Math.round(savings / estimateTokens(JSON.stringify(retrospectives)) * 100)}% reduction)\n`);
}

// ==============================================================================
// Run All Examples
// ==============================================================================

async function runExamples() {
  try {
    await example1_selectColumns();
    await example2_limitResults();
    await example3_summarize();
    await example4_count();

    console.log('='.repeat(60));
    console.log('✅ All examples completed');
    console.log('='.repeat(60) + '\n');

    console.log('📋 Key Takeaways:');
    console.log('1. Select only needed columns (90% savings)');
    console.log('2. Limit results and paginate (98% savings)');
    console.log('3. Summarize instead of JSON dump (95% savings)');
    console.log('4. Use count for totals (99% savings)');
    console.log('\n💡 Apply these patterns in all agent workflows!\n');

  } catch (error) {
    console.error('❌ Error running examples:', error.message);
    process.exit(1);
  }
}

runExamples();
