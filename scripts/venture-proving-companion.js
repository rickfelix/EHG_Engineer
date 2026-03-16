#!/usr/bin/env node
/**
 * Venture Proving Companion CLI
 *
 * Sub-commands:
 *   assess   - Run process compliance checks for a stage range
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

async function runAssess(ventureId, flags) {
  const fromStage = parseInt(flags.from || '1');
  const toGate = parseInt(flags['to-gate'] || '3');

  console.log(`\nProcess compliance check: stages ${fromStage}-${toGate} for venture ${ventureId}\n`);

  const startTime = Date.now();

  // Step 1: Artifact Integrity
  console.log('📦 Step 1: Artifact Integrity — checking venture_artifacts...');
  const { checkArtifactIntegrity } = await import('../lib/proving-companion/artifact-integrity-checker.js');
  const artifactResults = await checkArtifactIntegrity(ventureId, fromStage, toGate);
  const artifactFails = Object.values(artifactResults).reduce((sum, r) => sum + r.fail_count, 0);
  console.log(`   ✓ ${Object.keys(artifactResults).length} stages checked, ${artifactFails} findings\n`);

  // Step 2: Gate Discipline
  console.log('🚪 Step 2: Gate Discipline — checking chairman decisions...');
  const { checkGateDiscipline } = await import('../lib/proving-companion/gate-discipline-checker.js');
  const gateResults = await checkGateDiscipline(ventureId, fromStage, toGate);
  const gateFails = Object.values(gateResults).reduce((sum, r) => sum + r.fail_count, 0);
  console.log(`   ✓ ${Object.keys(gateResults).length} stages checked, ${gateFails} findings\n`);

  // Step 3: Transition Correctness
  console.log('🔗 Step 3: Transition Correctness — checking stage ordering...');
  const { checkTransitionCorrectness } = await import('../lib/proving-companion/transition-correctness-checker.js');
  const transitionResults = await checkTransitionCorrectness(ventureId, fromStage, toGate);
  const transitionFails = Object.values(transitionResults).reduce((sum, r) => sum + r.fail_count, 0);
  console.log(`   ✓ ${Object.keys(transitionResults).length} stages checked, ${transitionFails} findings\n`);

  // Step 4: Pipeline Status
  console.log('⚙️  Step 4: Pipeline Status — checking worker and execution state...');
  const { checkPipelineStatus } = await import('../lib/proving-companion/pipeline-status-checker.js');
  const pipelineResults = await checkPipelineStatus(ventureId, fromStage, toGate);
  const pipelineFails = Object.values(pipelineResults).reduce((sum, r) => sum + r.fail_count, 0);
  console.log(`   ✓ ${Object.keys(pipelineResults).length} stages checked, ${pipelineFails} findings\n`);

  const durationMs = Date.now() - startTime;
  const totalFindings = artifactFails + gateFails + transitionFails + pipelineFails;

  // Step 5: Journal Capture
  console.log('📝 Step 5: Journal Capture — writing entries...');
  const { writeJournalEntry } = await import('../lib/proving-companion/journal-capture.js');

  for (let stage = fromStage; stage <= toGate; stage++) {
    const stageKey = String(stage);
    const artifact = artifactResults[stageKey] || { checks: [] };
    const gate = gateResults[stageKey] || { checks: [] };
    const transition = transitionResults[stageKey] || { checks: [] };
    const pipeline = pipelineResults[stageKey] || { checks: [] };

    const allChecks = [...artifact.checks, ...gate.checks, ...transition.checks, ...pipeline.checks];
    const gaps = allChecks.filter(c => !c.pass).map(c => ({
      stage_number: stage,
      type: 'process_compliance',
      severity: 'minor',
      description: `[${c.name}] ${c.detail}`
    }));

    await writeJournalEntry(ventureId, stage, {
      plan: { compliance_checks: allChecks.length },
      reality: { pass_count: allChecks.filter(c => c.pass).length, fail_count: allChecks.filter(c => !c.pass).length },
      gaps,
      enhancements: [],
      decision: null,
      notes: null,
      durationMs: Math.round(durationMs / (toGate - fromStage + 1))
    });
  }
  console.log(`   ✓ ${toGate - fromStage + 1} journal entries written\n`);

  // Summary
  console.log('═'.repeat(50));
  console.log('PROCESS COMPLIANCE CHECK COMPLETE');
  console.log(`  Stages: ${fromStage}-${toGate}`);
  console.log(`  Findings: ${totalFindings} (${artifactFails} artifact, ${gateFails} gate, ${transitionFails} transition, ${pipelineFails} pipeline)`);
  console.log(`  Duration: ${durationMs}ms`);
  console.log('  Mode: Advisory (non-blocking)');
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
