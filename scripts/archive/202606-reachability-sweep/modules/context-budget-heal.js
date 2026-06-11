/**
 * Context Budget Heal Loop
 * SD-LEO-INFRA-OPTIMIZE-PROTOCOL-FILE-001 (FR-006)
 *
 * Measures digest file token consumption, scores against budget targets,
 * diagnoses overages, and suggests corrections.
 *
 * Usage: node scripts/modules/context-budget-heal.js [--verbose] [--json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Budget targets (bytes) — includes ~3% margin for metadata/formatting overhead
const BUDGET = {
  'CLAUDE_CORE_DIGEST.md':  10500,  // ~10KB + metadata
  'CLAUDE_PLAN_DIGEST.md':  10500,
  'CLAUDE_EXEC_DIGEST.md':  10500,
  'CLAUDE_LEAD_DIGEST.md':  10500,
  'CLAUDE_DIGEST.md':        8500,  // ~8KB (router should be small)
};

const TOTAL_BUDGET = 40000; // ~39KB total digest corpus (5 files + overhead)
const CHARS_PER_TOKEN = 4;  // Approximate

/**
 * Phase 1: MEASURE — read file sizes and calculate token consumption
 */
function measure() {
  const results = {};
  let totalBytes = 0;
  let totalTokens = 0;

  for (const [filename, budget] of Object.entries(BUDGET)) {
    const filePath = path.join(PROJECT_ROOT, filename);
    let bytes = 0;
    let exists = false;

    try {
      const stat = fs.statSync(filePath);
      bytes = stat.size;
      exists = true;
    } catch {
      exists = false;
    }

    const tokens = Math.ceil(bytes / CHARS_PER_TOKEN);
    totalBytes += bytes;
    totalTokens += tokens;

    results[filename] = {
      exists,
      bytes,
      tokens,
      budget,
      overBudget: bytes > budget,
      overage: Math.max(0, bytes - budget),
      utilizationPct: budget > 0 ? Math.round((bytes / budget) * 100) : 0,
    };
  }

  return { files: results, totalBytes, totalTokens, totalBudget: TOTAL_BUDGET };
}

/**
 * Phase 2: SCORE — evaluate against budget targets
 */
function score(measurements) {
  const { files, totalBytes, totalBudget } = measurements;
  const overBudgetFiles = Object.entries(files).filter(([, f]) => f.overBudget);
  const missingFiles = Object.entries(files).filter(([, f]) => !f.exists);

  let status;
  if (missingFiles.length > 0) {
    status = 'MISSING_FILES';
  } else if (overBudgetFiles.length === 0 && totalBytes <= totalBudget) {
    status = 'PASS';
  } else if (overBudgetFiles.length > 0) {
    status = 'NEEDS_CORRECTION';
  } else if (totalBytes > totalBudget) {
    status = 'TOTAL_OVER_BUDGET';
  } else {
    status = 'PASS';
  }

  // Score 0-100 (higher = better)
  const fileScores = Object.entries(files).map(([, f]) => {
    if (!f.exists) return 0;
    if (f.bytes <= f.budget) return 100;
    // Linear penalty: 100 at budget, 0 at 2x budget
    return Math.max(0, Math.round(100 - ((f.bytes - f.budget) / f.budget) * 100));
  });

  const avgScore = Math.round(fileScores.reduce((a, b) => a + b, 0) / fileScores.length);
  const totalScore = totalBytes <= totalBudget ? 100 :
    Math.max(0, Math.round(100 - ((totalBytes - totalBudget) / totalBudget) * 100));

  const compositeScore = Math.round(avgScore * 0.7 + totalScore * 0.3);

  return {
    status,
    compositeScore,
    avgFileScore: avgScore,
    totalScore,
    overBudgetCount: overBudgetFiles.length,
    missingCount: missingFiles.length,
    overBudgetFiles: overBudgetFiles.map(([name]) => name),
  };
}

/**
 * Phase 3: DIAGNOSE — identify sections causing overages
 */
function diagnose(measurements, scoreResult) {
  if (scoreResult.status === 'PASS') {
    return { diagnosis: 'All files within budget', corrections: [] };
  }

  const corrections = [];

  for (const filename of scoreResult.overBudgetFiles) {
    const file = measurements.files[filename];
    const overageBytes = file.overage;
    const overagePct = Math.round((overageBytes / file.budget) * 100);

    corrections.push({
      file: filename,
      currentBytes: file.bytes,
      budgetBytes: file.budget,
      overageBytes,
      overagePct,
      suggestion: overagePct > 50
        ? 'Remove sections from digest mapping or reduce maxChars cap'
        : 'Tighten formatSectionCompact compression or remove 1 section',
      nextCommand: 'node scripts/generate-claude-md-from-db.js',
    });
  }

  if (measurements.totalBytes > TOTAL_BUDGET) {
    corrections.push({
      file: 'TOTAL',
      currentBytes: measurements.totalBytes,
      budgetBytes: TOTAL_BUDGET,
      overageBytes: measurements.totalBytes - TOTAL_BUDGET,
      overagePct: Math.round(((measurements.totalBytes - TOTAL_BUDGET) / TOTAL_BUDGET) * 100),
      suggestion: 'Reduce overall digest corpus by removing reference sections from mapping',
      nextCommand: 'Edit scripts/section-file-mapping-digest.json',
    });
  }

  return {
    diagnosis: `${corrections.length} correction(s) needed`,
    corrections,
  };
}

/**
 * Phase 4: REPORT — output results
 */
function report(measurements, scoreResult, diagnosisResult, options = {}) {
  const { verbose, json } = options;

  if (json) {
    console.log(JSON.stringify({
      healStatus: scoreResult.status,
      compositeScore: scoreResult.compositeScore,
      measurements: measurements.files,
      totalBytes: measurements.totalBytes,
      totalTokens: measurements.totalTokens,
      totalBudget: TOTAL_BUDGET,
      scoreResult,
      diagnosis: diagnosisResult,
    }, null, 2));
    return;
  }

  // Human-readable output
  console.log('');
  console.log('=== CONTEXT BUDGET HEAL ===');
  console.log('');

  // File-by-file
  for (const [filename, file] of Object.entries(measurements.files)) {
    const indicator = !file.exists ? '  MISSING' :
      file.overBudget ? '  OVER' : '  OK';
    const bar = file.exists
      ? `${(file.bytes / 1024).toFixed(1)}KB / ${(file.budget / 1024).toFixed(0)}KB (${file.utilizationPct}%)`
      : 'not found';
    console.log(`${indicator}  ${filename.padEnd(28)} ${bar}`);
  }

  console.log('');
  console.log(`  TOTAL: ${(measurements.totalBytes / 1024).toFixed(1)}KB / ${(TOTAL_BUDGET / 1024).toFixed(0)}KB (${Math.round((measurements.totalBytes / TOTAL_BUDGET) * 100)}%)`);
  console.log(`  Tokens: ~${measurements.totalTokens}`);
  console.log('');

  // Score
  const statusEmoji = scoreResult.status === 'PASS' ? '  PASS' : '  FAIL';
  console.log(`  HEAL_STATUS=${scoreResult.status}`);
  console.log(`  ${statusEmoji}  Score: ${scoreResult.compositeScore}/100`);
  console.log('');

  // Corrections
  if (diagnosisResult.corrections.length > 0 && verbose) {
    console.log('  CORRECTIONS NEEDED:');
    for (const c of diagnosisResult.corrections) {
      console.log(`    ${c.file}: ${(c.overageBytes / 1024).toFixed(1)}KB over (${c.overagePct}%)`);
      console.log(`      Suggestion: ${c.suggestion}`);
      console.log(`      Next: ${c.nextCommand}`);
    }
    console.log('');
  }

  // Machine-actionable output
  if (scoreResult.status === 'NEEDS_CORRECTION') {
    console.log('  HEAL_NEXT_CMD=node scripts/generate-claude-md-from-db.js');
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const json = args.includes('--json');

  const measurements = measure();
  const scoreResult = score(measurements);
  const diagnosisResult = diagnose(measurements, scoreResult);

  report(measurements, scoreResult, diagnosisResult, { verbose, json });

  // Exit code: 0 for PASS, 1 for NEEDS_CORRECTION
  process.exit(scoreResult.status === 'PASS' ? 0 : 1);
}

main();
