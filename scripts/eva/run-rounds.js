#!/usr/bin/env node
/**
 * run-rounds.js - CLI for Rounds Scheduler
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-002: FR-002
 *
 * Usage:
 *   node scripts/eva/run-rounds.js                  # List available rounds
 *   node scripts/eva/run-rounds.js vision_rescore   # Execute a specific round
 *   node scripts/eva/run-rounds.js --all            # Execute all rounds
 */

import { listRounds, runRound } from '../../lib/eva/rounds-scheduler.js';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const roundType = args[0];

if (!roundType || roundType === '--help') {
  const rounds = listRounds();
  console.log('\n📋 EVA Rounds Scheduler');
  console.log('═'.repeat(50));

  if (rounds.length === 0) {
    console.log('   No rounds registered.');
  } else {
    for (const round of rounds) {
      console.log(`\n   ${round.type}`);
      console.log(`   ${round.description}`);
      console.log(`   Cadence: ${round.cadence}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('Usage:');
  console.log('   node scripts/eva/run-rounds.js <round_type>');
  console.log('   node scripts/eva/run-rounds.js --all');
  console.log('');
  process.exit(0);
}

(async () => {
  if (roundType === '--all') {
    const rounds = listRounds();
    console.log(`\n🔄 Running all ${rounds.length} rounds...`);
    for (const round of rounds) {
      await runRound(round.type);
    }
    console.log('\n✅ All rounds complete.');
  } else {
    await runRound(roundType);
  }
})().catch(err => {
  console.error(`\n❌ Round failed: ${err.message}`);
  process.exit(1);
});
