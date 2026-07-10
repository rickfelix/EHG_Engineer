#!/usr/bin/env node
/**
 * Funnel-gauge synthetic-visit liveness probe — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-4.
 *
 * Distinct from scripts/canary/run-canary-probe.mjs (which drives an isolated
 * synthetic VENTURE through stage machinery). This probe targets a REAL,
 * instrumented venture's /v1/metrics endpoint via the existing pull mechanism
 * (scripts/venture-telemetry-pull.mjs pullVenture) and asserts the resulting
 * funnel gauge reads 'live' — proving a synthetic visit registers end-to-end
 * before the gauge is trusted, per docs/design/venture-demand-distribution-engine.md.
 *
 * Gated by leo_feature_flags FUNNEL_GAUGE_CANARY_V1 (ships OFF), mirroring the
 * flag-gating convention in scripts/canary/canary-core.mjs.
 *
 * Usage: node scripts/canary/run-gauge-liveness-probe.mjs --application-id <uuid> [--force-local]
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { pullVenture, persistResult } from '../venture-telemetry-pull.mjs';
import { computeGaugeState } from '../../lib/telemetry/funnel-gauge.mjs';
import { assertGaugeLivenessProof } from '../../lib/telemetry/canary-gauge-liveness.mjs';

config();

export const GAUGE_CANARY_FLAG = 'FUNNEL_GAUGE_CANARY_V1';

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const FORCE_LOCAL = args.includes('--force-local');
const APPLICATION_ID = argVal('--application-id');

async function flagEnabled(supabase) {
  const { data } = await supabase.from('leo_feature_flags').select('is_enabled').eq('flag_key', GAUGE_CANARY_FLAG).maybeSingle();
  return data?.is_enabled === true;
}

/**
 * Run the probe against one application row. Injectable deps for testing;
 * defaults are the real pull mechanism + real gauge computation.
 * @param {{supabase: object, application: object, now?: Date, cadenceHours?: number, fetchFn?: Function}} opts
 * @returns {Promise<{passed: boolean, reason: string}>}
 */
export async function runGaugeLivenessProbe({ supabase, application, now = new Date(), cadenceHours, fetchFn }) {
  const pullResult = await pullVenture(application, { fetchFn, now });
  await persistResult(supabase, application, pullResult);

  const { data: telemetryRow } = await supabase
    .from('venture_telemetry').select('kpis, pulled_at, ingest_status').eq('application_id', application.id).maybeSingle();
  const gaugeOpts = { telemetryRow: telemetryRow || null, now };
  if (typeof cadenceHours === 'number') gaugeOpts.cadenceHours = cadenceHours;
  const gaugeState = computeGaugeState(gaugeOpts);

  return assertGaugeLivenessProof({ pullResult, gaugeState });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  (async () => {
    if (!FORCE_LOCAL && !(await flagEnabled(supabase))) {
      console.log(`[gauge-liveness-probe] flag ${GAUGE_CANARY_FLAG} is disabled — quiet refusal (enable it or pass --force-local)`);
      process.exit(0);
    }
    if (!APPLICATION_ID) {
      console.error('[gauge-liveness-probe] --application-id <uuid> is required');
      process.exit(1);
    }
    const { data: application, error } = await supabase
      .from('applications').select('id, name, venture_id, metrics_base_url, metrics_api_key_ref, metrics_cadence_hours').eq('id', APPLICATION_ID).maybeSingle();
    if (error || !application) {
      console.error(`[gauge-liveness-probe] application ${APPLICATION_ID} not found: ${error?.message ?? 'no row'}`);
      process.exit(1);
    }
    const result = await runGaugeLivenessProbe({ supabase, application, cadenceHours: application.metrics_cadence_hours ?? undefined });
    console.log(JSON.stringify(result));
    process.exit(result.passed ? 0 : 1);
  })();
}

export default { GAUGE_CANARY_FLAG, runGaugeLivenessProbe };
