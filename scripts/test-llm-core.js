#!/usr/bin/env node

/**
 * Core LLM Intelligence for Testing
 * SD-TEST-MGMT-LLM-CORE-001
 *
 * Provides LLM-powered test analysis capabilities:
 * - Test failure root cause analysis
 * - Test generation suggestions
 * - Coverage gap identification
 * - Flakiness pattern diagnosis
 *
 * Usage:
 *   node scripts/test-llm-core.js [command] [options]
 *
 * Commands:
 *   analyze <file>    Analyze test failure and suggest root cause
 *   generate <file>   Generate test suggestions for a source file
 *   coverage          Identify coverage gaps from test metadata
 *   flaky             Diagnose flakiness patterns
 *   report            Generate comprehensive analysis report
 *
 * Options:
 *   --model <model>   Claude model to use (default: claude-sonnet-4-20250514)
 *   --cost-limit <n>  Maximum cost per analysis in cents (default: 10)
 *   --output <path>   Output file for results
 *   --verbose, -v     Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.claude') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

// Cost tracking (approximate)
const MODEL_COSTS = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 }, // per 1K tokens
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
};

let totalCost = 0;

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Get Anthropic client
 */
function getAnthropicClient() {
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is required for LLM analysis');
  }
  return new Anthropic({ apiKey: anthropicKey });
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'help';
  const target = args[1] && !args[1].startsWith('-') ? args[1] : null;
  const options = {
    model: 'claude-sonnet-4-20250514',
    costLimit: 10, // cents
    output: null,
    verbose: false
  };

  for (let i = target ? 2 : 1; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        options.model = args[++i];
        break;
      case '--cost-limit':
        options.costLimit = parseInt(args[++i], 10);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return { command, target, options };
}

/**
 * Estimate cost for API call
 */
function estimateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['claude-sonnet-4-20250514'];
  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;
  return (inputCost + outputCost) * 100; // cents
}

/**
 * Track API cost
 */
function trackCost(model, usage) {
  const cost = estimateCost(model, usage.input_tokens, usage.output_tokens);
  totalCost += cost;
  return cost;
}

/**
 * Call Claude API with cost tracking
 */
async function callClaude(anthropic, model, systemPrompt, userPrompt, options) {
  const costLimitCents = options.costLimit;

  // Check if we're approaching cost limit
  if (totalCost >= costLimitCents) {
    throw new Error(`Cost limit reached: ${totalCost.toFixed(2)} cents`);
  }

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const cost = trackCost(model, response.usage);

  if (options.verbose) {
    console.log(`   API call cost: ${cost.toFixed(3)} cents`);
    console.log(`   Total cost: ${totalCost.toFixed(3)} cents`);
  }

  return {
    content: response.content[0].text,
    usage: response.usage,
    cost
  };
}

/**
 * Analyze test failure root cause
 */
async function analyzeFailure(target, options) {
  console.log('\n  Analyzing Test Failure\n');
  console.log('='.repeat(60));

  const supabase = getSupabaseClient();
  const anthropic = getAnthropicClient();

  // Get recent failures
  let failures;
  if (target) {
    // Search for specific test/file
    const { data } = await supabase
      .from('test_failures')
      .select('*')
      .ilike('target_component', `%${target}%`)
      .order('created_at', { ascending: false })
      .limit(5);
    failures = data || [];
  } else {
    // Get most recent failures
    const { data } = await supabase
      .from('test_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    failures = data || [];
  }

  if (failures.length === 0) {
    console.log('   No test failures found to analyze.');
    return { analysis: null, cost: 0 };
  }

  console.log(`   Found ${failures.length} recent failures\n`);

  // Prepare failure context
  const failureContext = failures.map(f => ({
    component: f.target_component,
    errorType: f.error_type,
    message: f.error_message?.substring(0, 500),
    location: f.code_location,
    timestamp: f.created_at
  }));

  const systemPrompt = `You are an expert software test engineer. Analyze test failures and identify root causes.
Focus on:
1. Pattern recognition across failures
2. Common root causes (async issues, data dependencies, environment)
3. Actionable recommendations
4. Priority ordering of fixes

Be concise and technical. Use markdown formatting.`;

  const userPrompt = `Analyze these test failures and identify root causes:

${JSON.stringify(failureContext, null, 2)}

Provide:
1. **Root Cause Analysis**: Most likely cause(s)
2. **Pattern Detection**: Any common patterns across failures
3. **Recommendations**: Specific fixes in priority order
4. **Risk Assessment**: Impact if not fixed`;

  console.log('   Calling Claude for analysis...\n');

  const result = await callClaude(anthropic, options.model, systemPrompt, userPrompt, options);

  console.log('   Analysis Results:\n');
  console.log(result.content);

  return {
    analysis: result.content,
    failures: failureContext,
    cost: result.cost
  };
}

/**
 * Generate test suggestions for a file
 */
async function generateTests(target, options) {
  console.log('\n  Generating Test Suggestions\n');
  console.log('='.repeat(60));

  if (!target) {
    console.log('   Error: Please specify a source file to generate tests for.');
    return { suggestions: null, cost: 0 };
  }

  const filePath = path.isAbsolute(target) ? target : path.join(PROJECT_ROOT, target);

  if (!fs.existsSync(filePath)) {
    console.log(`   Error: File not found: ${filePath}`);
    return { suggestions: null, cost: 0 };
  }

  const anthropic = getAnthropicClient();
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  console.log(`   Analyzing: ${target}`);
  console.log(`   File size: ${fileContent.length} characters\n`);

  const systemPrompt = `You are an expert test engineer. Generate comprehensive test suggestions for the given code.
Focus on:
1. Unit tests for individual functions
2. Edge cases and error handling
3. Integration points that need testing
4. Security-related test cases

Use the project's testing conventions (Jest/Vitest with describe/it blocks).
Be specific about what to test and why.`;

  const userPrompt = `Generate test suggestions for this file:

File: ${target}

\`\`\`javascript
${fileContent.substring(0, 6000)}
\`\`\`

Provide:
1. **Test Coverage Gaps**: What's missing?
2. **Suggested Test Cases**: Specific tests to add
3. **Edge Cases**: Important edge cases to test
4. **Mock Requirements**: What needs mocking?`;

  console.log('   Calling Claude for suggestions...\n');

  const result = await callClaude(anthropic, options.model, systemPrompt, userPrompt, options);

  console.log('   Test Suggestions:\n');
  console.log(result.content);

  return {
    suggestions: result.content,
    file: target,
    cost: result.cost
  };
}

/**
 * Identify coverage gaps from test metadata
 */
async function analyzeCoverage(options) {
  console.log('\n  Analyzing Coverage Gaps\n');
  console.log('='.repeat(60));

  const supabase = getSupabaseClient();
  const anthropic = getAnthropicClient();

  // Get test suites and their coverage
  const { data: suites } = await supabase
    .from('uat_test_suites')
    .select('suite_name, module, test_type, total_tests, status');

  // Get test cases grouped by type
  const { data: testCases } = await supabase
    .from('uat_test_cases')
    .select('test_type, priority, metadata')
    .limit(500);

  // Get coverage metrics if available
  const { data: coverage } = await supabase
    .from('uat_coverage_metrics')
    .select('*')
    .order('metric_date', { ascending: false })
    .limit(1);

  console.log(`   Test Suites: ${suites?.length || 0}`);
  console.log(`   Test Cases: ${testCases?.length || 0}`);
  console.log(`   Coverage Records: ${coverage?.length || 0}\n`);

  // Analyze distribution
  const typeDistribution = {};
  const priorityDistribution = {};
  const modulesCovered = new Set();

  testCases?.forEach(tc => {
    typeDistribution[tc.test_type] = (typeDistribution[tc.test_type] || 0) + 1;
    priorityDistribution[tc.priority] = (priorityDistribution[tc.priority] || 0) + 1;
  });

  suites?.forEach(s => modulesCovered.add(s.module));

  const systemPrompt = `You are an expert QA engineer analyzing test coverage.
Identify gaps in test coverage and prioritize what needs attention.
Focus on:
1. Missing test types (unit, integration, e2e)
2. Under-tested modules
3. Priority imbalances
4. Critical paths without coverage`;

  const userPrompt = `Analyze this test coverage data and identify gaps:

Test Distribution by Type:
${JSON.stringify(typeDistribution, null, 2)}

Test Distribution by Priority:
${JSON.stringify(priorityDistribution, null, 2)}

Modules with Tests: ${Array.from(modulesCovered).join(', ')}

Coverage Metrics: ${JSON.stringify(coverage?.[0] || 'No coverage data', null, 2)}

Provide:
1. **Coverage Gaps**: What's missing?
2. **Priority Recommendations**: What to add first?
3. **Module Analysis**: Under-tested areas
4. **Target Coverage**: Recommended minimums`;

  console.log('   Calling Claude for coverage analysis...\n');

  const result = await callClaude(anthropic, options.model, systemPrompt, userPrompt, options);

  console.log('   Coverage Analysis:\n');
  console.log(result.content);

  return {
    analysis: result.content,
    distribution: { typeDistribution, priorityDistribution },
    modules: Array.from(modulesCovered),
    cost: result.cost
  };
}

/**
 * Diagnose flakiness patterns
 */
async function diagnoseFlakyTests(options) {
  console.log('\n  Diagnosing Flaky Tests\n');
  console.log('='.repeat(60));

  const supabase = getSupabaseClient();
  const anthropic = getAnthropicClient();

  // Get test runs to analyze pass/fail patterns
  const { data: runs } = await supabase
    .from('test_runs')
    .select('id, passed, failed, success_rate, config, start_time')
    .order('start_time', { ascending: false })
    .limit(20);

  // Get failures grouped by component
  const { data: failures } = await supabase
    .from('test_failures')
    .select('target_component, error_type, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  // Identify repeated failures
  const failureCounts = {};
  failures?.forEach(f => {
    const key = f.target_component || 'unknown';
    if (!failureCounts[key]) {
      failureCounts[key] = { count: 0, errors: [], timestamps: [] };
    }
    failureCounts[key].count++;
    failureCounts[key].errors.push(f.error_message?.substring(0, 100));
    failureCounts[key].timestamps.push(f.created_at);
  });

  // Find tests that fail intermittently
  const potentialFlaky = Object.entries(failureCounts)
    .filter(([_, data]) => data.count >= 2)
    .map(([component, data]) => ({
      component,
      failureCount: data.count,
      uniqueErrors: new Set(data.errors).size,
      recentTimestamps: data.timestamps.slice(0, 3)
    }));

  console.log(`   Test Runs Analyzed: ${runs?.length || 0}`);
  console.log(`   Total Failures: ${failures?.length || 0}`);
  console.log(`   Potential Flaky Tests: ${potentialFlaky.length}\n`);

  if (potentialFlaky.length === 0) {
    console.log('   No flaky test patterns detected.');
    return { analysis: 'No flaky patterns detected', cost: 0 };
  }

  const systemPrompt = `You are an expert at diagnosing flaky tests.
Analyze failure patterns to identify:
1. True flakiness vs environmental issues
2. Common causes (timing, async, state)
3. Specific remediation strategies
4. Priority of fixes based on impact`;

  const userPrompt = `Diagnose these potential flaky tests:

${JSON.stringify(potentialFlaky.slice(0, 10), null, 2)}

Run History (success rates):
${JSON.stringify(runs?.map(r => ({ date: r.start_time, rate: r.success_rate })).slice(0, 10), null, 2)}

Provide:
1. **Flakiness Diagnosis**: Which are truly flaky?
2. **Root Causes**: Common causes identified
3. **Fix Recommendations**: Specific remediation
4. **Priority Order**: What to fix first`;

  console.log('   Calling Claude for flakiness diagnosis...\n');

  const result = await callClaude(anthropic, options.model, systemPrompt, userPrompt, options);

  console.log('   Flakiness Diagnosis:\n');
  console.log(result.content);

  return {
    analysis: result.content,
    flakyTests: potentialFlaky,
    cost: result.cost
  };
}

/**
 * Generate comprehensive report
 */
async function generateReport(options) {
  console.log('\n  Generating Comprehensive Report\n');
  console.log('='.repeat(60));

  const results = {
    timestamp: new Date().toISOString(),
    sections: [],
    totalCost: 0
  };

  // Run all analyses
  console.log('\n   Running failure analysis...');
  const failureResult = await analyzeFailure(null, { ...options, verbose: false });
  results.sections.push({ type: 'failure_analysis', ...failureResult });

  console.log('\n   Running coverage analysis...');
  const coverageResult = await analyzeCoverage({ ...options, verbose: false });
  results.sections.push({ type: 'coverage_analysis', ...coverageResult });

  console.log('\n   Running flakiness diagnosis...');
  const flakyResult = await diagnoseFlakyTests({ ...options, verbose: false });
  results.sections.push({ type: 'flakiness_diagnosis', ...flakyResult });

  results.totalCost = totalCost;

  // Save report
  const reportPath = options.output || path.join(PROJECT_ROOT, 'test-llm-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('\n  Report Summary:\n');
  console.log(`   Sections: ${results.sections.length}`);
  console.log(`   Total Cost: ${results.totalCost.toFixed(3)} cents`);
  console.log(`   Report saved to: ${reportPath}`);

  return results;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Core LLM Intelligence for Testing
SD-TEST-MGMT-LLM-CORE-001

Usage:
  node scripts/test-llm-core.js [command] [options]

Commands:
  analyze [file]    Analyze test failures and suggest root causes
  generate <file>   Generate test suggestions for a source file
  coverage          Identify coverage gaps from test metadata
  flaky             Diagnose flakiness patterns
  report            Generate comprehensive analysis report
  help              Show this help message

Options:
  --model <model>   Claude model to use (default: claude-sonnet-4-20250514)
  --cost-limit <n>  Maximum cost per analysis in cents (default: 10)
  --output <path>   Output file for results
  --verbose, -v     Show detailed output

Examples:
  node scripts/test-llm-core.js analyze
  node scripts/test-llm-core.js generate src/services/auth.js
  node scripts/test-llm-core.js coverage --verbose
  node scripts/test-llm-core.js flaky --model claude-3-haiku-20240307
  node scripts/test-llm-core.js report --output analysis.json
`);
}

/**
 * Main function
 */
async function main() {
  console.log('  Core LLM Intelligence for Testing');
  console.log('   SD-TEST-MGMT-LLM-CORE-001\n');
  console.log('='.repeat(60));

  const { command, target, options } = parseArgs();

  if (command === 'help') {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case 'analyze':
        await analyzeFailure(target, options);
        break;
      case 'generate':
        await generateTests(target, options);
        break;
      case 'coverage':
        await analyzeCoverage(options);
        break;
      case 'flaky':
        await diagnoseFlakyTests(options);
        break;
      case 'report':
        await generateReport(options);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
        return;
    }

    console.log(`\n  Total API Cost: ${totalCost.toFixed(3)} cents`);
    console.log('  Done!\n');

  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run main
main().catch(err => {
  console.error('  Error:', err.message);
  process.exit(1);
});
