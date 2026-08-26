#!/usr/bin/env node
/**
 * Composed apply-time precondition gate for the UAT-stage renumber migration
 * (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, FR-1/FR-2/FR-6). Runs the drift check, the
 * stage-quiescent freeze check, and the parked-venture classifier against the live database
 * and exits non-zero if any of the three refuses to proceed. This script never applies the
 * migration itself -- it is the precondition an operator (or apply-migration.js) runs
 * immediately before invoking the chairman-approved DDL.
 *
 * TR-3: connects via the existing createDatabaseClient('engineer') helper, never an ad hoc
 * connection.
 */
import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { runDriftCheck } from '../../lib/eva/uat-stage-migration/drift-check.mjs';
import { runQuiescenceCheck } from '../../lib/eva/uat-stage-migration/quiescence-check.mjs';
import { runParkedVentureClassification } from '../../lib/eva/uat-stage-migration/parked-venture-classifier.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export async function runPreconditions(client, opts = {}) {
  const drift = await runDriftCheck(client);
  const quiescence = await runQuiescenceCheck(client);
  const parked = await runParkedVentureClassification(client, opts);

  const ok = !drift.drifted && quiescence.quiescent && !parked.blocked;
  return { ok, drift, quiescence, parked };
}

async function main() {
  const override = process.argv.includes('--override-parked-venture-check');
  const client = await createDatabaseClient('engineer');
  try {
    const result = await runPreconditions(client, { override });
    console.log(JSON.stringify(result, null, 2));

    if (result.drift.drifted) {
      console.error('PRECONDITION_FAILED: mechanism drift detected (FR-1) -- see drift.mismatches above');
    }
    if (!result.quiescence.quiescent) {
      console.error(`PRECONDITION_FAILED: ${result.quiescence.inFlightCount} in-flight transition(s) through stage 23-26 (FR-2)`);
    }
    if (result.parked.blocked) {
      console.error(`PRECONDITION_FAILED: ${result.parked.realCount} REAL (non-demo) venture(s) found at a shifted stage (FR-6) -- rerun with --override-parked-venture-check only after explicit chairman review`);
    }

    process.exitCode = result.ok ? 0 : 1;
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
