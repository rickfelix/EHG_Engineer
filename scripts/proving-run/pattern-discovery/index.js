#!/usr/bin/env node

/**
 * Pattern Discovery Agent — Entry Point
 *
 * Scans git history and codebase across both EHG_Engineer and EHG app repos
 * to produce structured pattern data for the Automated Proving Run Engine.
 *
 * Outputs:
 *   1. Per-stage reference maps (17 stages x 5 dimensions)
 *   2. Categorized pattern templates with coverage matrix
 *
 * Usage:
 *   node scripts/proving-run/pattern-discovery/index.js [options]
 *
 * Options:
 *   --venture-id <id>   Venture context (for filtering, optional)
 *   --output <path>     Write JSON output to file (default: stdout)
 *   --engineer-path     Override EHG_Engineer repo path
 *   --app-path          Override EHG app repo path
 *   --json              Output JSON only (no progress messages)
 *
 * Part of: SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B
 */

import { loadStageMap } from './stage-mapper.js';
import { scanAllStages } from './git-scanner.js';
import { analyzeAllStages, discoverFilesWithMetadata } from './codebase-analyzer.js';
import { classifyPatterns } from './pattern-classifier.js';
import { formatOutput } from './output-formatter.js';
import { writeFileSync } from 'fs';
import path from 'path';

const EHG_APP_DEFAULT = path.resolve(process.cwd(), '..', 'ehg');

/**
 * Run the full pattern discovery pipeline.
 * @param {object} options
 * @param {string} [options.engineerPath] - EHG_Engineer repo path
 * @param {string} [options.appPath] - EHG app repo path
 * @param {boolean} [options.quiet] - Suppress progress output
 * @returns {Promise<PatternDiscoveryOutput>}
 */
export async function runPatternDiscovery(options = {}) {
  const startTime = Date.now();
  const engineerPath = options.engineerPath || process.cwd();
  const appPath = options.appPath || EHG_APP_DEFAULT;
  const log = options.quiet ? () => {} : (msg) => process.stderr.write(`[pattern-discovery] ${msg}\n`);

  log('Starting pattern discovery...');

  // Step 1: Load stage configuration
  log('Loading stage config...');
  const { stages, maxStage } = loadStageMap();
  log(`Loaded ${Object.keys(stages).length} stages (max: ${maxStage})`);

  // Step 2: Scan git history for both repos
  log('Scanning git history...');
  const gitHistory = scanAllStages(stages, { engineerPath, appPath });
  log(`Git scan complete: ${Object.keys(gitHistory).length} stages`);

  // Step 3: Analyze current codebase
  log('Analyzing codebase...');
  const codebaseAnalysis = analyzeAllStages(stages, { engineerPath, appPath });
  log(`Codebase analysis complete: ${Object.keys(codebaseAnalysis).length} stages`);

  // Step 4: Collect all files for pattern classification
  log('Classifying patterns...');
  const allFiles = [];
  for (const analysis of Object.values(codebaseAnalysis)) {
    for (const dim of ['code', 'db', 'service', 'tests']) {
      const found = analysis[dim]?.found || [];
      allFiles.push(...found.map(f => ({ relativePath: f })));
    }
  }
  const patternClassification = classifyPatterns(codebaseAnalysis, allFiles);
  log(`Pattern classification: ${patternClassification.summary.activeCategories} categories, ${patternClassification.summary.totalReferenceFiles} reference files`);

  // Step 5: Format output
  const durationMs = Date.now() - startTime;
  log(`Formatting output (${durationMs}ms elapsed)...`);
  const output = formatOutput({
    stageMap: stages,
    gitHistory,
    codebaseAnalysis,
    patternClassification,
    durationMs,
  });

  log(`Pattern discovery complete in ${durationMs}ms`);
  return output;
}

// CLI entry point
const isMain = process.argv[1]?.endsWith('pattern-discovery/index.js') ||
               process.argv[1]?.endsWith('pattern-discovery\\index.js');

if (isMain) {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;
  const engineerIdx = args.indexOf('--engineer-path');
  const engineerPath = engineerIdx >= 0 ? args[engineerIdx + 1] : undefined;
  const appIdx = args.indexOf('--app-path');
  const appPath = appIdx >= 0 ? args[appIdx + 1] : undefined;

  runPatternDiscovery({ engineerPath, appPath, quiet: jsonOnly })
    .then(output => {
      const json = JSON.stringify(output, null, 2);

      if (outputPath) {
        writeFileSync(outputPath, json);
        if (!jsonOnly) console.error(`[pattern-discovery] Output written to ${outputPath}`);
      } else {
        console.log(json);
      }
    })
    .catch(err => {
      console.error(`[pattern-discovery] ERROR: ${err.message}`);
      process.exit(1);
    });
}
