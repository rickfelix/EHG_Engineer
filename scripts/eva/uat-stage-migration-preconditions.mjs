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

/**
 * Each check is isolated: one throwing (e.g. a transient connection blip) must not prevent the
 * operator from seeing the other two checks' verdicts (found by adversarial TESTING review --
 * a sequential await chain meant one failing check silently hid the other two, leaving the
 * operator with only a raw stack trace instead of a composed verdict).
 */
async function runIsolated(label, fn) {
  try {
    return { label, ok: true, result: await fn() };
  } catch (err) {
    return { label, ok: false, error: err.message };
  }
}

export async function runPreconditions(client, opts = {}) {
  // Sequential, not Promise.all: a plain pg.Client (not a Pool) serves one query at a time --
  // concurrent client.query() calls on the same client are deprecated and queue anyway (same
  // fix already applied once in this repo, lib/audits/stage-census/db-sweep.mjs). Isolation here
  // means one check's error doesn't hide the other two's results, not that they run concurrently.
  const driftOutcome = await runIsolated('drift', () => runDriftCheck(client));
  const quiescenceOutcome = await runIsolated('quiescence', () => runQuiescenceCheck(client));
  const parkedOutcome = await runIsolated('parked', () => runParkedVentureClassification(client, opts));

  const drift = driftOutcome.ok ? driftOutcome.result : { drifted: true, error: driftOutcome.error };
  const quiescence = quiescenceOutcome.ok ? quiescenceOutcome.result : { quiescent: false, error: quiescenceOutcome.error };
  const parked = parkedOutcome.ok ? parkedOutcome.result : { blocked: true, error: parkedOutcome.error };

  const ok = driftOutcome.ok && quiescenceOutcome.ok && parkedOutcome.ok
    && !drift.drifted && quiescence.quiescent && !parked.blocked;
  return { ok, drift, quiescence, parked };
}

async function main() {
  const override = process.argv.includes('--override-parked-venture-check');
  const client = await createDatabaseClient('engineer');
  try {
    const result = await runPreconditions(client, { override });
    console.log(JSON.stringify(result, null, 2));

    if (result.drift.error) {
      console.error(`PRECONDITION_ERROR: drift check threw (${result.drift.error}) -- treated as blocking`);
    } else if (result.drift.drifted) {
      console.error('PRECONDITION_FAILED: mechanism drift detected (FR-1) -- see drift.mismatches above');
    }
    if (result.quiescence.error) {
      console.error(`PRECONDITION_ERROR: quiescence check threw (${result.quiescence.error}) -- treated as blocking`);
    } else if (!result.quiescence.quiescent) {
      console.error(`PRECONDITION_FAILED: ${result.quiescence.inFlightCount} in-flight transition(s) through stage 23-26 (FR-2)`);
    }
    if (result.parked.error) {
      console.error(`PRECONDITION_ERROR: parked-venture check threw (${result.parked.error}) -- treated as blocking`);
    } else if (result.parked.blocked) {
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
