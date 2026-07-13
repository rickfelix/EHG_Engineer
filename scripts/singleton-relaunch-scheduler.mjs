#!/usr/bin/env node
/**
 * Periodic driver for the quiescent-window singleton-relaunch trigger
 * (SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-A).
 *
 * No fixed cron — invocation cadence is owned by whatever wires it into a coordinator tick loop
 * (mirrors scripts/gauge-runner.mjs's own cadence contract). Gated OFF by default per the parent
 * PRD's rollout requirement: "flag defaulting OFF; first live cycle run supervised before
 * enabling autonomous triggering." With the flag off, every tick still evaluates and logs the
 * decision (dry-run) but writes no schedule record.
 *
 * Usage: node scripts/singleton-relaunch-scheduler.mjs
 * Env:   SINGLETON_RELAUNCH_SCHEDULING_ENABLED=true   (arm real scheduling; default unset/false)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { evaluateAllSingletons } from '../lib/coordinator/singleton-relaunch-trigger.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const ENABLED = process.env.SINGLETON_RELAUNCH_SCHEDULING_ENABLED === 'true';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!ENABLED) {
    console.log('[singleton-relaunch-scheduler] SINGLETON_RELAUNCH_SCHEDULING_ENABLED is not "true" — running in dry-run/report-only mode (evaluates, does not write).');
  }

  const results = await evaluateAllSingletons(supabase, {
    senderSession: process.env.CLAUDE_SESSION_ID || 'singleton-relaunch-scheduler',
    enabled: ENABLED,
  });

  for (const r of results) {
    const behind = r.freshness ? r.freshness.behind : '?';
    console.log(`[singleton-relaunch-scheduler] role=${r.role} scheduled=${r.scheduled} reason=${r.reason} behind=${behind} loop_state=${r.loopState}`);
    if (r.error) console.error(`[singleton-relaunch-scheduler] role=${r.role} write error: ${r.error}`);
  }

  try {
    await stampLastFired(supabase, 'standard_loop:singleton-relaunch');
  } catch (err) {
    console.error(`[singleton-relaunch-scheduler] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

main().catch((e) => {
  console.error('[singleton-relaunch-scheduler] fatal:', e && e.message ? e.message : e);
  process.exit(1);
});
