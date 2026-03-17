#!/usr/bin/env node
/**
 * CREATE ISSUE PATTERN
 * Manually create a new pattern in the learning history database
 * Used when discovering new recurring issues
 */

import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const kb = new IssueKnowledgeBase();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createPattern() {
  const args = process.argv.slice(2);
  let fromIssue = null;

  // Check for --from-issue flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-issue') {
      fromIssue = args[i + 1];
      break;
    }
  }

  console.log('\n📋 CREATE NEW ISSUE PATTERN');
  console.log('═'.repeat(60));

  // Interactive mode
  const issueSummary = fromIssue || await question('\n1. Issue summary (clear, searchable description):\n   ');

  if (!issueSummary || issueSummary.trim().length < 10) {
    console.error('❌ Issue summary too short (min 10 characters)');
    rl.close();
    process.exit(1);
  }

  console.log('\n2. Category (choose one):');
  console.log('   - database');
  console.log('   - testing');
  console.log('   - build');
  console.log('   - deployment');
  console.log('   - security');
  console.log('   - protocol');
  console.log('   - code_structure');
  console.log('   - performance');
  console.log('   - over_engineering');

  const category = await question('\n   Category: ');

  const validCategories = ['database', 'testing', 'build', 'deployment', 'security', 'protocol', 'code_structure', 'performance', 'over_engineering'];
  if (!validCategories.includes(category)) {
    console.error(`❌ Invalid category. Must be one of: ${validCategories.join(', ')}`);
    rl.close();
    process.exit(1);
  }

  console.log('\n3. Severity (choose one): critical, high, medium, low');
  const severity = await question('   Severity: ') || 'medium';

  if (!['critical', 'high', 'medium', 'low'].includes(severity)) {
    console.error('❌ Invalid severity. Must be: critical, high, medium, or low');
    rl.close();
    process.exit(1);
  }

  const sdId = await question('\n4. SD ID where this occurred (e.g., uuid or SD-KEY): ');

  if (!sdId || sdId.trim().length === 0) {
    console.error('❌ SD ID is required');
    rl.close();
    process.exit(1);
  }

  const solution = await question('\n5. Solution applied (optional, press Enter to skip): ');
  const resTime = await question('\n6. Resolution time in minutes (optional, press Enter to skip): ');

  rl.close();

  console.log('\n📊 Creating pattern...');

  try {
    const result = await kb.createPattern({
      issue_summary: issueSummary.trim(),
      category: category.trim(),
      severity: severity.trim(),
      sd_id: sdId.trim(),
      solution: solution.trim() || null,
      resolution_time_minutes: resTime ? parseInt(resTime) : null
    });

    console.log('\n✅ Pattern created successfully!');
    console.log(`   ID: ${result.pattern_id}`);
    console.log(`   Category: ${result.category}`);
    console.log(`   Severity: ${result.severity}`);
    console.log(`   Issue: ${result.issue_summary}`);

    if (result.proven_solutions && result.proven_solutions.length > 0) {
      console.log(`   Solution: ${result.proven_solutions[0].solution}`);
    }

    console.log('\n🔍 Search for this pattern:');
    console.log(`   node scripts/search-prior-issues.js "${issueSummary.substring(0, 30)}..."`);

    console.log('\n📝 Record future occurrences:');
    console.log(`   node scripts/record-pattern-success.js --pattern ${result.pattern_id} --sd <SD_ID> --time <MINUTES>`);

  } catch (error) {
    console.error(`\n❌ Error creating pattern: ${error.message}`);
    process.exit(1);
  }
}

// Non-interactive mode for scripted usage
async function createPatternNonInteractive() {
  const args = process.argv.slice(2);

  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--issue') params.issue_summary = args[i + 1];
    if (args[i] === '--category') params.category = args[i + 1];
    if (args[i] === '--severity') params.severity = args[i + 1];
    if (args[i] === '--sd') params.sd_id = args[i + 1];
    if (args[i] === '--solution') params.solution = args[i + 1];
    if (args[i] === '--time') params.resolution_time_minutes = parseInt(args[i + 1]);
  }

  if (!params.issue_summary || !params.category || !params.sd_id) {
    return false; // Fall back to interactive
  }

  const result = await kb.createPattern(params);
  console.log(`✅ Pattern created: ${result.pattern_id}`);
  return true;
}

// Main
(async () => {
  const nonInteractive = await createPatternNonInteractive();
  if (!nonInteractive) {
    await createPattern();
  }
})();
