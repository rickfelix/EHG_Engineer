#!/usr/bin/env node
/**
 * Stage 21-26 census + negative-control instrument.
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A.
 *
 * Sweeps 2 filesystem repos (EHG_Engineer, ehg) + 1 shared Postgres database for every literal
 * reference to stage numbers 21-26, asserts the known-live stage 21/22 component_path swap as a
 * hard negative control (non-zero exit if either row is missing), classifies each finding
 * generated-from-SSOT or hand-written, and commits the result under docs/audits/.
 *
 * Re-run: node scripts/audits/stage-21-26-census.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRepoPath } from '../../lib/repo-paths.cjs';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { walkRepoForStageLiterals } from '../../lib/audits/stage-census/corpus-walker.mjs';
import { resolveRepoOrThrow } from '../../lib/audits/stage-census/repo-resolve.mjs';
import {
  sweepComponentPathMismatches,
  sweepStageBearingColumns,
  sweepJsonbMetadataPaths,
  sweepPgProcBodies,
  sweepViewsAndMatviews,
  sweepArrayColumns,
} from '../../lib/audits/stage-census/db-sweep.mjs';
import { assertNegativeControl } from '../../lib/audits/stage-census/negative-control.mjs';
import { classifyFinding } from '../../lib/audits/stage-census/classify.mjs';
import { renderCensusReport } from '../../lib/audits/stage-census/report-writer.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_PATH = path.resolve(ENGINEER_ROOT, 'docs/audits/stage-21-26-census.md');

function classifyCodeFinding(f) {
  // Any component_path filename literal in a *.tsx file under an EHG-style stages directory is
  // a hand-written reference (no SSOT regen script covers component filenames).
  return classifyFinding({ file: f.file });
}

async function main() {
  const generatedAt = new Date().toISOString();

  // --- Filesystem sweep: 2 repos ---
  const ehgPath = resolveRepoOrThrow('ehg', { resolveRepoPath, existsSync: fs.existsSync });
  const [engineerFindings, ehgFindings] = await Promise.all([
    walkRepoForStageLiterals(ENGINEER_ROOT, { repoLabel: 'EHG_Engineer' }),
    walkRepoForStageLiterals(ehgPath, { repoLabel: 'ehg' }),
  ]);
  const codeFindings = [...engineerFindings, ...ehgFindings].map((f) => ({
    ...f,
    classification: classifyCodeFinding(f),
  }));

  // --- Database sweep: 1 shared instance, one connection ---
  // Sequential, not Promise.all: a single pg.Client (not Pool) does not support concurrent
  // queries -- pg queues them internally today but flags this a deprecation, removed in pg@9.
  const client = await createDatabaseClient('engineer', { verify: false });
  let dbFindings;
  let componentPathMismatches;
  try {
    const columns = await sweepStageBearingColumns(client);
    const jsonbPaths = await sweepJsonbMetadataPaths(client);
    const pgProc = await sweepPgProcBodies(client);
    const views = await sweepViewsAndMatviews(client);
    const arrayCols = await sweepArrayColumns(client);
    const mismatches = await sweepComponentPathMismatches(client);
    componentPathMismatches = mismatches;
    dbFindings = [
      { surface: 'information_schema stage-bearing columns', rows: columns },
      { surface: 'jsonb metadata paths (eva_stage_gate_attempts)', rows: jsonbPaths },
      { surface: 'pg_proc function bodies', rows: pgProc, classification: 'hand-written' },
      { surface: 'views/matviews', rows: views, classification: 'hand-written' },
      { surface: 'array-typed columns', rows: arrayCols, classification: 'hand-written' },
      { surface: 'venture_stages.component_path mismatches (negative control source)', rows: mismatches, classification: 'hand-written' },
    ];
  } finally {
    await client.end();
  }

  // --- Negative control: hard, non-zero-exit assertion ---
  let negativeControl;
  try {
    negativeControl = assertNegativeControl(componentPathMismatches);
  } catch (err) {
    console.error(`NEGATIVE CONTROL FAILED: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const report = renderCensusReport({ generatedAt, codeFindings, dbFindings, negativeControl });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, report, 'utf8');

  console.log(`Census written to ${path.relative(ENGINEER_ROOT, OUTPUT_PATH)}`);
  console.log(`Code findings: ${codeFindings.length} (EHG_Engineer: ${engineerFindings.length}, ehg: ${ehgFindings.length})`);
  console.log(`Negative control: PASS (${negativeControl.matched.length}/2 known-live rows detected)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
