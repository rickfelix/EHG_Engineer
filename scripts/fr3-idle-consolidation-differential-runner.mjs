#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-3 AC#1: runner-produced evidence artifact.
 *
 * Executes the frozen-population differential (lib/fleet/fr3-idle-consolidation-differential.mjs)
 * and writes a JSON artifact recording the population, the pre/post verdict for each of the four
 * consumers on each session, whether each change matches the per-consumer x per-reason matrix,
 * and the commit sha this run was produced at. Per CLAUDE.md's gate-evidence provenance rule,
 * this artifact must be produced by RUNNING this script -- never hand-written.
 *
 * Exit code is non-zero if any row fails to match the matrix (AC#4).
 *
 * Usage: node scripts/fr3-idle-consolidation-differential-runner.mjs [--out <path>]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { runDifferential, FROZEN_POPULATION, MATRIX, CONSUMERS } from '../lib/fleet/fr3-idle-consolidation-differential.mjs';

function getCommitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function main() {
  const outArgIdx = process.argv.indexOf('--out');
  const outPath = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : '.artifacts/fr3-idle-consolidation-differential.json';

  const commitSha = getCommitSha();
  const results = runDifferential(FROZEN_POPULATION);
  const mismatches = results.filter((r) => !r.matches);

  const artifact = {
    sd: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D',
    fr: 'FR-3',
    producedBy: 'scripts/fr3-idle-consolidation-differential-runner.mjs',
    generatedAt: new Date().toISOString(),
    commitSha,
    consumers: CONSUMERS,
    matrix: MATRIX,
    populationSize: FROZEN_POPULATION.length,
    populationIds: FROZEN_POPULATION.map((f) => f.id),
    rowCount: results.length,
    mismatchCount: mismatches.length,
    verdict: mismatches.length === 0 ? 'PASS' : 'FAIL',
    results,
  };
  artifact.contentSha256 = createHash('sha256').update(JSON.stringify(artifact.results)).digest('hex');

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  console.log(`[FR-3 differential] ${results.length} rows, ${mismatches.length} mismatches, verdict=${artifact.verdict}`);
  console.log(`[FR-3 differential] artifact written: ${outPath} (sha256:${artifact.contentSha256.slice(0, 8)}, commit:${commitSha?.slice(0, 8) ?? 'unknown'})`);
  if (mismatches.length > 0) {
    console.error('[FR-3 differential] MISMATCHES:');
    for (const m of mismatches) console.error(`  ${m.fixtureId} x ${m.consumer}: pre=${m.pre} post=${m.post} changed=${m.changed} matrixExpected=${m.matrixExpected}`);
    process.exitCode = 1;
  }
}

main();
