/**
 * v2-readiness precondition (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-6).
 *
 * v1's own Node preconditions script (scripts/eva/uat-stage-migration-preconditions.mjs) checks
 * drift/quiescence/parked-venture against v1's own 23-26 shift range only. v2
 * (database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql) shifts a DIFFERENT,
 * later range (24-27, the post-v1 live range) and has its own inline DO-block precondition -- but
 * an operator running the pre-existing Node CLI before attempting a v2 apply had no visibility
 * into that until the DDL transaction itself aborted mid-apply. This check surfaces the SAME
 * verdict v2's own preflight will compute, ahead of time, via the shared
 * fn_parked_venture_preflight() function (FR-5) once it exists -- or a clear "not applicable yet"
 * result if v1 has not been applied (v2 cannot be meaningfully checked before then).
 */
'use strict';

import { runParkedVentureClassification } from './parked-venture-classifier.mjs';

/**
 * @param {{query: Function}} client
 * @param {{override?:boolean}} [opts]
 */
export async function runV2ReadinessCheck(client, opts = {}) {
  const { rows: v1Rows } = await client.query(
    `SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat'`
  );
  const v1Applied = v1Rows.length > 0;

  if (!v1Applied) {
    return { v1Applied: false, applicable: false, blocked: false };
  }

  const parked = await runParkedVentureClassification(client, { ...opts, range: { min: 24, max: 27 } });
  return { v1Applied: true, applicable: true, ...parked };
}
