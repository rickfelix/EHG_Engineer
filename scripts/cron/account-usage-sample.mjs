#!/usr/bin/env node
/**
 * Account quota sampler — SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-4 armed cadence).
 *
 * WHY A CADENCE AND NOT THE PANEL. Snapshot writes began life as a side effect of rendering the
 * fleet panel, which means history existed only while somebody was watching — and the fleet going
 * down is precisely when nobody is. The reading that explains an outage would be missing from
 * exactly the window that needed it. Sampling on its own schedule makes the record independent of
 * an audience, which is the whole point of retaining it.
 *
 * HOSTED LOCALLY, NOT IN GITHUB ACTIONS. The meters are read with credentials that live in this
 * host's config directories. A GHA runner has no account to read and would report the fleet as
 * uniformly not_configured — a green cron manufacturing a false record.
 *
 * OBSERVATIONAL ONLY. It reads meters and appends rows. It never spawns, throttles, or routes.
 * Persistence is fail-soft end to end (see lib/fleet/account-usage-snapshot-writer.cjs): a missing
 * table — the migration is chairman-gated — is an EXPECTED state, not an error.
 *
 * NO CREDENTIAL MATERIAL IS PRINTED. Output is names, states and percentages only.
 *
 * Usage: node scripts/cron/account-usage-sample.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

const require_ = createRequire(import.meta.url);
const { getAccountUsage, resolveDisplayIdentities } = require_('../../lib/fleet/account-usage-reader.cjs');
const { persistReadings } = require_('../../lib/fleet/account-usage-snapshot-writer.cjs');

const PROCESS_KEY = 'standard_loop:account-usage-sample';

async function main() {
  const asJson = process.argv.includes('--json');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const readings = await getAccountUsage();
  // Display-keyed to match the names the readings carry — a raw-registry-keyed map misses every
  // lookup and writes account_uuid8 NULL exactly when identity mapping is configured.
  const result = await persistReadings(readings, { supabase, identities: resolveDisplayIdentities({}) });

  // Stamp AFTER the work, so a run that dies mid-sample does not advertise itself as healthy.
  await stampLastFired(supabase, PROCESS_KEY).catch(() => {});

  const summary = {
    event: 'account_usage.sampled',
    accounts: readings.length,
    // States only — never a number keyed to an account here; the DB is the record, this is a log.
    states: readings.map((r) => (r.state === 'ok' ? 'ok' : r.reason)),
    written: result.written,
    skipped: result.skipped,
    error: result.error,
  };
  // eslint-disable-next-line no-console
  console.log(asJson ? JSON.stringify(summary) : JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'account_usage.sample_failed', error: String(err?.message || err).slice(0, 200) }));
  process.exit(1);
});
