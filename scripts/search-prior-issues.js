#!/usr/bin/env node
/**
 * Search Prior Issues Tool
 * Command-line interface for searching the issue knowledge base
 * Returns ranked solutions with success rates and links to documentation
 */

import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const kb = new IssueKnowledgeBase();

/**
 * Search for issues and display results
 */
async function searchIssues(query, options = {}) {
  const results = await kb.search(query, options);

  if (results.length === 0) {
    console.log('\n❌ No matching patterns found.');
    console.log('\nTips:');
    console.log('  - Try different keywords');
    console.log('  - Search for general terms (e.g., "database" instead of specific error)');
    console.log('  - Check manual sources: retrospectives/ and handoffs/ directories\n');
    return;
  }

  console.log(`\n🎯 Found ${results.length} similar issue(s) (ranked by relevance):\n`);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const matchPercent = Math.round(result.similarity * 100);

    console.log(`${i + 1}. [${matchPercent}% match] ${result.issue_summary}`);
    console.log(`   Category: ${result.category} | Severity: ${result.severity}`);
    console.log(`   Occurrences: ${result.occurrence_count} | Success Rate: ${Math.round(result.success_rate)}%`);

    // Show best solution
    if (result.proven_solutions && result.proven_solutions.length > 0) {
      const bestSolution = result.proven_solutions
        .sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))[0];

      console.log(`   Solution: ${bestSolution.solution}`);
      console.log(`   Avg Resolution Time: ${Math.round(bestSolution.avg_resolution_time_minutes || 0)} minutes`);
    }

    // Show prevention checklist
    if (result.prevention_checklist && result.prevention_checklist.length > 0) {
      console.log(`   Prevention: ${result.prevention_checklist[0]}`);
    }

    // Try to find source file
    const sources = await findSourceFiles(result);
    if (sources.length > 0) {
      console.log(`   → View: ${sources[0]}`);
    }

    console.log('');
  }

  // Show statistics
  console.log('─'.repeat(70));
  console.log(`\n💡 ${results.length} pattern(s) found with ${Math.round(results.reduce((sum, r) => sum + r.success_rate, 0) / results.length)}% average success rate\n`);
}

/**
 * Find source files (retrospectives, handoffs) for a pattern
 */
async function findSourceFiles(pattern) {
  const sources = [];

  try {
    // Check retrospectives
    const retroDir = path.join(process.cwd(), 'retrospectives');
    const retroFiles = await fs.readdir(retroDir);

    for (const file of retroFiles) {
      const content = await fs.readFile(path.join(retroDir, file), 'utf-8');
      if (content.toLowerCase().includes(pattern.issue_summary.toLowerCase().substring(0, 30))) {
        sources.push(`retrospectives/${file}`);
      }
    }

    // Check handoffs
    const handoffDir = path.join(process.cwd(), 'handoffs');
    const handoffFiles = await fs.readdir(handoffDir);

    for (const file of handoffFiles) {
      const content = await fs.readFile(path.join(handoffDir, file), 'utf-8');
      if (content.toLowerCase().includes(pattern.issue_summary.toLowerCase().substring(0, 30))) {
        sources.push(`handoffs/${file}`);
      }
    }
  } catch (_error) {
    // Directories might not exist or be readable
  }

  return sources.slice(0, 2); // Return max 2 sources
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       🔍 Issue Knowledge Base Search Tool               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  while (true) {
    const query = await question('\nEnter search query (or "quit" to exit): ');

    if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit' || query.toLowerCase() === 'q') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      break;
    }

    if (!query.trim()) {
      console.log('⚠️  Please enter a search query');
      continue;
    }

    await searchIssues(query.trim());

    const more = await question('Search again? (y/n): ');
    if (more.toLowerCase() !== 'y' && more.toLowerCase() !== 'yes') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      break;
    }
  }
}

/**
 * Show pattern details
 */
async function showPatternDetails(patternId) {
  const pattern = await kb.getPattern(patternId);

  if (!pattern) {
    console.log(`\n❌ Pattern ${patternId} not found\n`);
    return;
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║  Pattern Details: ${patternId}`.padEnd(60) + '║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Issue: ${pattern.issue_summary}`);
  console.log(`Category: ${pattern.category}`);
  console.log(`Severity: ${pattern.severity}`);
  console.log(`Status: ${pattern.status} | Trend: ${pattern.trend}`);
  console.log(`Occurrences: ${pattern.occurrence_count}`);
  console.log(`Success Rate: ${Math.round(pattern.success_rate)}%`);
  console.log('');

  if (pattern.proven_solutions && pattern.proven_solutions.length > 0) {
    console.log('✅ Proven Solutions:');
    pattern.proven_solutions.forEach((sol, i) => {
      console.log(`\n  ${i + 1}. ${sol.solution}`);
      console.log(`     Success Rate: ${Math.round(sol.success_rate || 0)}% (${sol.times_successful}/${sol.times_applied})`);
      console.log(`     Avg Time: ${Math.round(sol.avg_resolution_time_minutes || 0)} minutes`);
    });
  }

  if (pattern.prevention_checklist && pattern.prevention_checklist.length > 0) {
    console.log('\n🛡️  Prevention Checklist:');
    pattern.prevention_checklist.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item}`);
    });
  }

  console.log('');
}

/**
 * List all patterns by category
 */
async function listPatterns() {
  const patterns = await kb.getPatternsByCategory();

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║            📊 All Issue Patterns by Category            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  for (const [category, items] of Object.entries(patterns)) {
    console.log(`\n${category.toUpperCase()} (${items.length} pattern${items.length > 1 ? 's' : ''}):`);
    items.forEach(pattern => {
      const trend = pattern.trend === 'increasing' ? '↑' :
                    pattern.trend === 'decreasing' ? '↓' : '→';
      console.log(`  ${trend} ${pattern.pattern_id}: ${pattern.issue_summary.substring(0, 60)}...`);
      console.log(`    Occurrences: ${pattern.occurrence_count} | Success: ${Math.round(pattern.success_rate)}%`);
    });
  }

  console.log('');
}

/**
 * Show statistics
 */
async function showStatistics(days = 30) {
  const stats = await kb.getStatistics(days);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║     📈 Learning System Statistics (Last ${days} days)`.padEnd(60) + '║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Total Patterns: ${stats.total_patterns}`);
  console.log(`  Active: ${stats.active_patterns}`);
  console.log(`  Obsolete: ${stats.obsolete_patterns}`);
  console.log(`\nRecent Occurrences: ${stats.recent_occurrences}`);
  console.log(`Average Success Rate: ${Math.round(stats.avg_success_rate)}%`);

  console.log('\n📊 By Category:');
  for (const [category, count] of Object.entries(stats.by_category)) {
    console.log(`  ${category}: ${count}`);
  }

  console.log('\n⚠️  By Severity:');
  for (const [severity, count] of Object.entries(stats.by_severity)) {
    console.log(`  ${severity}: ${count}`);
  }

  console.log('');
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       🔍 Issue Knowledge Base Search Tool                ║
╚═══════════════════════════════════════════════════════════╝

Usage:
  node scripts/search-prior-issues.js <query>          Search for issues
  node scripts/search-prior-issues.js --interactive    Interactive mode
  node scripts/search-prior-issues.js --list           List all patterns
  node scripts/search-prior-issues.js --stats [days]   Show statistics
  node scripts/search-prior-issues.js --details <id>   Show pattern details

Examples:
  node scripts/search-prior-issues.js "database schema mismatch"
  node scripts/search-prior-issues.js --interactive
  node scripts/search-prior-issues.js --details PAT-001
  node scripts/search-prior-issues.js --stats 30

Options:
  --category <cat>     Filter by category (database, testing, etc.)
  --limit <n>          Max results to return (default: 10)
  --min-success <n>    Minimum success rate (0-100)
`);
  process.exit(0);
}

// Parse options
const options = {
  limit: 10,
  category: null,
  minSuccessRate: 0
};

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) {
    options.category = args[i + 1];
    i++;
  } else if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--min-success' && args[i + 1]) {
    options.minSuccessRate = parseInt(args[i + 1]);
    i++;
  }
}

// Execute command
(async () => {
  try {
    if (command === '--interactive' || command === '-i') {
      await interactiveMode();
    } else if (command === '--list' || command === '-l') {
      await listPatterns();
    } else if (command === '--stats' || command === '-s') {
      const days = parseInt(args[1]) || 30;
      await showStatistics(days);
    } else if (command === '--details' || command === '-d') {
      const patternId = args[1];
      if (!patternId) {
        console.log('❌ Please provide a pattern ID');
        process.exit(1);
      }
      await showPatternDetails(patternId);
    } else {
      // Treat as search query
      const query = args.join(' ');
      await searchIssues(query, options);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
})();
