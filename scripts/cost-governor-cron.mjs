#!/usr/bin/env node
/**
 * Cost governor CRON entrypoint (the ARMED CADENCE firing mechanism).
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-2, operator-contract ARMED CADENCE)
 *
 * Runs the governor in OBSERVE mode on a schedule (see .github/workflows/cost-governor-cron.yml):
 *   1. --tune  : self-tune thresholds from recent cost_governor_log outcomes (advisory; never fails the run)
 *   2. stamp   : record last_fired_at on the periodic_process_registry cadence row (ARMED→ACTIVATED witness)
 *   3. --check : fail-LOUD anomaly surface — a breach exits 1 so the GHA run goes RED (the loud signal)
 *
 * OBSERVE-ONLY: neither step enforces (no --enforce). Enforce-mode activation is a deliberate
 * shadow-validated follow-on. The stamp runs BEFORE --check so a firing is always recorded even
 * when an anomaly reddens the run.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, 'cost-governor.mjs');
const PROCESS_KEY = 'g3-armed-sd-leo-infra-cost-token-governance-001';

const run = (args) => spawnSync(process.execPath, [CLI, ...args], { stdio: 'inherit' });

// 1. self-tune (advisory — never fail the run on tuning)
run(['--tune']);

// 2. stamp the cadence witness (non-fatal) — proves the armed cadence genuinely fires
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key && !key.startsWith('encrypted:')) {
  try { await stampLastFired(createClient(url, key), PROCESS_KEY); }
  catch (e) { console.warn('[cost-governor-cron] cadence stamp failed (non-fatal):', e?.message || e); }
}

// 3. fail-LOUD anomaly check LAST — exit 1 on a breach reddens the GHA run
const check = run(['--check']);
process.exitCode = check.status === 1 ? 1 : 0;
