#!/usr/bin/env node
/**
 * Hedge Density Measurement — Module H/I/J baseline + post-rephrase scoring
 * SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001-A (Module H, FR-2/TR-1)
 *
 * Counts hedge tokens (typically/ideally/consider/should/may/could) per file
 * with whole-word matching. Normalizes per 1000 LOC for cross-file comparison.
 * Emits CSV: filename, total_loc, hedge counts per token, aggregate_per_1000_loc.
 * Final row is the aggregate across all input files.
 *
 * Usage:
 *   node scripts/__metrics__/hedge-density.js <glob...>
 *   node scripts/__metrics__/hedge-density.js .claude/agents/*.md
 *   node scripts/__metrics__/hedge-density.js .claude/agents/*.md > baseline.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HEDGES = ['typically', 'ideally', 'consider', 'should', 'may', 'could'];
const __filename = fileURLToPath(import.meta.url);

function countHedges(text) {
  const counts = {};
  for (const h of HEDGES) {
    const re = new RegExp('\\b' + h + '\\b', 'gi');
    counts[h] = (text.match(re) || []).length;
  }
  return counts;
}

function countLOC(text) {
  return text.split(/\r?\n/).length;
}

function measureFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const loc = countLOC(text);
  const counts = countHedges(text);
  const total = HEDGES.reduce((a, h) => a + counts[h], 0);
  const perThousand = loc > 0 ? (total * 1000 / loc) : 0;
  return { filename: filePath, loc, counts, total, perThousand };
}

function emitCSV(results) {
  const header = ['filename', 'total_loc', ...HEDGES.map(h => 'hedge_' + h), 'total_hedges', 'hedges_per_1000_loc'];
  console.log(header.join(','));
  let aggLoc = 0, aggCounts = Object.fromEntries(HEDGES.map(h => [h, 0])), aggTotal = 0;
  for (const r of results) {
    const row = [
      JSON.stringify(r.filename),
      r.loc,
      ...HEDGES.map(h => r.counts[h]),
      r.total,
      r.perThousand.toFixed(2),
    ];
    console.log(row.join(','));
    aggLoc += r.loc;
    for (const h of HEDGES) aggCounts[h] += r.counts[h];
    aggTotal += r.total;
  }
  const aggPerK = aggLoc > 0 ? (aggTotal * 1000 / aggLoc) : 0;
  console.log([
    'AGGREGATE',
    aggLoc,
    ...HEDGES.map(h => aggCounts[h]),
    aggTotal,
    aggPerK.toFixed(2),
  ].join(','));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: hedge-density.js <file...>');
    process.exit(1);
  }
  const results = [];
  for (const arg of args) {
    if (!fs.existsSync(arg)) {
      console.error('Skipping missing: ' + arg);
      continue;
    }
    const stat = fs.statSync(arg);
    if (!stat.isFile()) continue;
    results.push(measureFile(arg));
  }
  emitCSV(results);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}

export { countHedges, countLOC, measureFile };
