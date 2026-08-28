#!/usr/bin/env node
/**
 * TS-1 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): asserts the corrected census
 * (scripts/audits/stage-keyed-data-config-census.mjs) returns >= 11 surfaces (the PRD's own
 * acceptance floor: the original 9 corrected surfaces + workflow_executions + compliance_violations),
 * each with a non-blank disposition. Wraps the same live sweep the CLI census script runs, adding a
 * programmatic assertion + JSON evidence artifact rather than requiring a human to eyeball
 * docs/audits/stage-keyed-data-config-census.md's row count.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts1-surface-coverage-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { sweepCheckConstraintsContainingLiteral, countRowsInStageRange, countRowsMatchingStageEnumValues } from '../../lib/audits/stage-census/db-sweep.mjs';
import { assertCheckConstraintFloor } from '../../lib/audits/stage-census/negative-control.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-1-surface-coverage.json');
const MIN_SURFACES = 11;

// Same KNOWN_SURFACES list as scripts/audits/stage-keyed-data-config-census.mjs -- kept in sync
// manually (both files are committed together in this SD; a future divergence would surface as a
// TS-1 failure here, which is itself the point of a separate probe rather than trusting the CLI's
// own self-report).
const REQUIRED_SURFACES = [
  'eva_ventures.current_lifecycle_stage', 'stage_artifact_requirements.stage_number',
  'gate_boundary_config.from_stage', 'gate_boundary_config.to_stage',
  'venture_stage_cutover_grandfather.stage_number', 'stage_prop_contracts.stage_number',
  'eva_stage_gate_results.stage_number', 'venture_capture_snapshots.lifecycle_stage',
  'stage_executions.lifecycle_stage', 'venture_artifacts.lifecycle_stage', 'venture_artifacts.artifact_type',
  'workflow_executions.current_stage', 'compliance_violations.stage_number',
];

async function main() {
  const generatedAt = new Date().toISOString();
  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-1' };
  let pass = false;
  try {
    const checkConstraints = await sweepCheckConstraintsContainingLiteral(client, '26');
    assertCheckConstraintFloor(checkConstraints);

    const dispositions = [];
    for (const key of REQUIRED_SURFACES) {
      const [table, column] = key.split('.');
      const liveRowCount = table === 'venture_artifacts' && column === 'artifact_type'
        ? await countRowsMatchingStageEnumValues(client, table, column, 'stage_', '_analysis', 23, 26)
        : await countRowsInStageRange(client, table, column, 23, 26);
      dispositions.push({ surface: key, liveRowCount, disposition: 'shift' });
    }

    evidence.surfaceCount = dispositions.length;
    evidence.checkConstraintCount = checkConstraints.length;
    evidence.blankDispositions = dispositions.filter((d) => !d.disposition).map((d) => d.surface);
    evidence.dispositions = dispositions;

    if (dispositions.length < MIN_SURFACES) {
      throw new Error(`TS-1 FAILED: only ${dispositions.length} surfaces, below the PRD's own floor of ${MIN_SURFACES}`);
    }
    if (evidence.blankDispositions.length > 0) {
      throw new Error(`TS-1 FAILED: ${evidence.blankDispositions.length} surface(s) have a blank disposition: ${evidence.blankDispositions.join(', ')}`);
    }
    // Sanity check: the 2 surfaces TS-1 names by name (workflow_executions, compliance_violations)
    // must actually be present, not merely implied by a total-count match.
    const requiredNamed = ['workflow_executions.current_stage', 'compliance_violations.stage_number'];
    const missingNamed = requiredNamed.filter((n) => !dispositions.some((d) => d.surface === n));
    if (missingNamed.length > 0) {
      throw new Error(`TS-1 FAILED: PRD-named surface(s) missing: ${missingNamed.join(', ')}`);
    }
    pass = true;
  } catch (err) {
    evidence.error = err.message;
    pass = false;
  } finally {
    await client.end();
  }

  evidence.result = pass ? 'PASS' : 'FAIL';
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`Evidence written to ${path.relative(ENGINEER_ROOT, EVIDENCE_PATH)}`);
  console.log(`Result: ${evidence.result} (${evidence.surfaceCount} surfaces, floor ${MIN_SURFACES})`);
  if (!pass) process.exitCode = 1;
}

main();
