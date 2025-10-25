#!/usr/bin/env node
/**
 * RECORD PATTERN SUCCESS/FAILURE
 * Updates issue pattern database when a solution is applied
 * Tracks success rates and resolution times
 */

import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import dotenv from 'dotenv';

dotenv.config();

const kb = new IssueKnowledgeBase();

async function recordOutcome() {
  const args = process.argv.slice(2);

  // Parse arguments
  let patternId, sdId, wasSuccessful = true, resolutionTime = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pattern' || args[i] === '-p') {
      patternId = args[i + 1];
      i++;
    } else if (args[i] === '--sd' || args[i] === '-s') {
      sdId = args[i + 1];
      i++;
    } else if (args[i] === '--failed' || args[i] === '-f') {
      wasSuccessful = false;
    } else if (args[i] === '--time' || args[i] === '-t') {
      resolutionTime = parseInt(args[i + 1]);
      i++;
    }
  }

  if (!patternId || !sdId) {
    console.error('Usage: node record-pattern-success.js --pattern PAT-XXX --sd SD-ID [--failed] [--time MINUTES]');
    console.error('');
    console.error('Examples:');
    console.error('  # Success:');
    console.error('  node record-pattern-success.js --pattern PAT-001 --sd SD-2025-001 --time 15');
    console.error('');
    console.error('  # Failure:');
    console.error('  node record-pattern-success.js --pattern PAT-001 --sd SD-2025-001 --failed');
    console.error('');
    process.exit(1);
  }

  console.log(`\n📝 Recording outcome for pattern ${patternId}...`);
  console.log(`   SD: ${sdId}`);
  console.log(`   Success: ${wasSuccessful ? 'YES' : 'NO'}`);
  if (resolutionTime) console.log(`   Time: ${resolutionTime} minutes`);

  try {
    // Get the pattern to find the solution description
    const pattern = await kb.getPattern(patternId);

    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const solutionApplied = pattern.proven_solutions?.[0]?.solution || 'Solution from pattern database';

    // Record the occurrence
    const result = await kb.recordOccurrence({
      pattern_id: patternId,
      sd_id: sdId,
      solution_applied: solutionApplied,
      resolution_time_minutes: resolutionTime || 0,
      was_successful: wasSuccessful,
      found_via_search: true
    });

    console.log('\n✅ Outcome recorded!');
    console.log(`   Pattern: ${result.pattern_id}`);
    console.log(`   Total occurrences: ${result.occurrence_count}`);
    console.log(`   Success rate: ${result.success_rate}%`);

    if (wasSuccessful) {
      console.log('\n🎉 Great! This solution worked. Pattern database updated.');
    } else {
      console.log('\n⚠️  Solution failed. Try next highest-rated solution.');
      console.log('   Search again: node scripts/search-prior-issues.js "<issue>"');
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

recordOutcome();
