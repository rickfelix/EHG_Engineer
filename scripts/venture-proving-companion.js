#!/usr/bin/env node
/**
 * Venture Proving Companion CLI
 *
 * Sub-commands:
 *   assess   - Run Plan/Reality/Gap analysis for a stage range
 *   journal  - View journal entries for a venture
 *   persist-specialists - Create Board of Directors entries from run
 *   report   - Generate proving run summary report
 *
 * Usage:
 *   npm run venture:prove assess <venture-id> --from 0 --to-gate 3
 *   npm run venture:prove journal <venture-id>
 *   npm run venture:prove persist-specialists <venture-id>
 *   npm run venture:prove report <venture-id>
 */

import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const subCommand = args[0];
const ventureId = args[1];

if (!subCommand || subCommand === '--help' || subCommand === '-h') {
  showHelp();
  process.exit(0);
}

if (!ventureId && subCommand !== '--help') {
  console.error('Error: venture-id is required');
  showHelp();
  process.exit(1);
}

// Parse flags
const flags = {};
for (let i = 2; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    flags[key] = args[i + 1] || true;
    if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
  }
}

async function main() {
  console.log('\n🔬 VENTURE PROVING COMPANION');
  console.log('═'.repeat(50));

  switch (subCommand) {
    case 'assess':
      await runAssess(ventureId, flags);
      break;
    case 'journal':
      await runJournal(ventureId);
      break;
    case 'persist-specialists':
      await runPersistSpecialists(ventureId);
      break;
    case 'report':
      await runReport(ventureId);
      break;
    default:
      console.error(`Unknown sub-command: ${subCommand}`);
      showHelp();
      process.exit(1);
  }
}

async function preflight() {
  console.log('🛡️  Pre-flight canary — checking path normalization...');
  const { getPlan } = await import('../lib/proving-companion/plan-agent.js');
  const { getReality } = await import('../lib/proving-companion/reality-agent.js');
  const { analyzeGaps } = await import('../lib/proving-companion/gap-analyst.js');

  const planData = await getPlan(1, 3);
  const realityData = await getReality(1, 3);
  const gapAnalysis = analyzeGaps(planData, realityData);

  const missingFileGaps = gapAnalysis.gaps.filter(g => g.type === 'missing_file');
  const stagesWithMissing = new Set(missingFileGaps.map(g => g.stage_number));
  const stagesWithFiles = Object.entries(realityData)
    .filter(([, r]) => r.found_files.length > 0)
    .map(([n]) => parseInt(n));

  // If all checked stages report missing_file gaps but reality found files, abort
  if (stagesWithMissing.size >= 3 && stagesWithFiles.length >= 3) {
    const allContradict = stagesWithFiles.every(s => stagesWithMissing.has(s));
    if (allContradict) {
      console.error('\n❌ Pre-flight FAILED: gap analyst reports missing files that reality agent found.');
      console.error('   Likely path normalization issue. Check scanPattern and matchesPattern.');
      process.exit(1);
    }
  }
  console.log('   ✓ Pre-flight passed\n');
}

async function runAssess(ventureId, flags) {
  const fromStage = parseInt(flags.from || '0');
  const toGate = parseInt(flags['to-gate'] || '3');

  console.log(`\nAssessing stages ${fromStage}-${toGate} for venture ${ventureId}\n`);

  // Run preflight canary before assessment
  await preflight();

  const startTime = Date.now();

  // Step 1: Plan Agent
  console.log('📋 Step 1: Plan Agent — querying vision/arch docs...');
  const { getPlan } = await import('../lib/proving-companion/plan-agent.js');
  const planData = await getPlan(fromStage, toGate);
  const planStages = Object.keys(planData).length;
  console.log(`   ✓ ${planStages} stages planned\n`);

  // Step 2: Reality Agent
  console.log('🔍 Step 2: Reality Agent — scanning EHG app...');
  const { getReality } = await import('../lib/proving-companion/reality-agent.js');
  const realityData = await getReality(fromStage, toGate);
  console.log('   ✓ Scan complete\n');

  // Step 3: Gap Analyst
  console.log('📊 Step 3: Gap Analyst — comparing plan vs reality...');
  const { analyzeGaps } = await import('../lib/proving-companion/gap-analyst.js');
  const gapAnalysis = analyzeGaps(planData, realityData);
  console.log(`   ✓ ${gapAnalysis.summary.total} gaps found`);
  console.log(`   Recommendation: ${gapAnalysis.recommendation} — ${gapAnalysis.recommendation_reason}\n`);

  // Step 4: Enhancement Sourcer
  console.log('💡 Step 4: Enhancement Sourcer — aggregating from 4 adapters...');
  const { getEnhancements } = await import('../lib/proving-companion/enhancement-sourcer.js');
  const enhancements = await getEnhancements(fromStage, toGate, gapAnalysis);
  console.log(`   ✓ ${enhancements.length} enhancements found\n`);

  const durationMs = Date.now() - startTime;

  // Step 5: Journal Capture
  console.log('📝 Step 5: Journal Capture — writing entries...');
  const { writeJournalEntry } = await import('../lib/proving-companion/journal-capture.js');

  for (let stage = fromStage; stage <= toGate; stage++) {
    const stageGaps = gapAnalysis.gaps.filter(g => g.stage_number === stage);
    const stageEnhancements = enhancements.filter(e =>
      e.title?.includes(`Stage ${stage}`) || true // include all for now
    ).slice(0, 5);

    await writeJournalEntry(ventureId, stage, {
      plan: planData[stage] || {},
      reality: realityData[stage] || {},
      gaps: stageGaps,
      enhancements: stageEnhancements,
      decision: null, // Chairman decides later
      notes: null,
      durationMs: Math.round(durationMs / (toGate - fromStage + 1))
    });
  }
  console.log(`   ✓ ${toGate - fromStage + 1} journal entries written\n`);

  // Summary
  console.log('═'.repeat(50));
  console.log('ASSESSMENT COMPLETE');
  console.log(`  Stages: ${fromStage}-${toGate}`);
  console.log(`  Gaps: ${gapAnalysis.summary.total} (${gapAnalysis.summary.by_severity.blocker} blockers)`);
  console.log(`  Enhancements: ${enhancements.length}`);
  console.log(`  Duration: ${durationMs}ms`);
  console.log(`  Recommendation: ${gapAnalysis.recommendation.toUpperCase()}`);
  console.log('═'.repeat(50));
}

async function runJournal(ventureId) {
  console.log(`\nJournal entries for venture ${ventureId}\n`);
  const { getJournalEntries } = await import('../lib/proving-companion/journal-capture.js');
  const entries = await getJournalEntries(ventureId);

  if (entries.length === 0) {
    console.log('No journal entries found. Run "assess" first.');
    return;
  }

  for (const entry of entries) {
    const gaps = entry.gaps || [];
    const decision = entry.chairman_decision || 'pending';
    console.log(`Stage ${String(entry.stage_number).padStart(2)}: ${gaps.length} gaps | decision: ${decision}`);
  }
}

async function runPersistSpecialists(ventureId) {
  console.log(`\nPersisting specialists for venture ${ventureId}\n`);
  const { getJournalEntries } = await import('../lib/proving-companion/journal-capture.js');
  const entries = await getJournalEntries(ventureId);

  if (entries.length === 0) {
    console.log('No journal entries found. Run "assess" first.');
    return;
  }

  const { persistSpecialists } = await import('../lib/proving-companion/specialist-persister.js');
  const result = await persistSpecialists(ventureId, entries);
  console.log(`✓ Persisted ${result.persisted}/${result.total} specialists`);
}

async function runReport(ventureId) {
  const { generateReport } = await import('../lib/proving-companion/report-generator.js');
  const report = await generateReport(ventureId);
  console.log(report);
}

function showHelp() {
  console.log(`
Usage: venture-proving-companion <command> <venture-id> [flags]

Commands:
  assess                Run Plan/Reality/Gap analysis
  journal               View journal entries
  persist-specialists   Create Board of Directors entries
  report                Generate proving run summary

Flags (assess):
  --from <N>           Start stage (default: 0)
  --to-gate <N>        End stage (default: 3)

Examples:
  node scripts/venture-proving-companion.js assess abc-123 --from 0 --to-gate 3
  node scripts/venture-proving-companion.js report abc-123
`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
