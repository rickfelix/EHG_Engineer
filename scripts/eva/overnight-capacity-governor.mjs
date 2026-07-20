#!/usr/bin/env node
/**
 * SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001: coordinator-facing CLI for the
 * data-calibrated overnight cycle-down governor. Coordinator-behavioral --
 * this CLI computes and reports; it never claims/parks/blocks a session itself.
 *
 * Usage:
 *   node scripts/eva/overnight-capacity-governor.mjs seed-ledger
 *   node scripts/eva/overnight-capacity-governor.mjs record-event <account> <event_type> <fleet_size> <limit_hit_at_iso> [session_hours_burned]
 *   node scripts/eva/overnight-capacity-governor.mjs project [--fleet-size N] [--burn-multiplier X]
 *   node scripts/eva/overnight-capacity-governor.mjs verdict [--window-hours N] [--window-entry ISO]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  projectTimeToWall,
  getCalibratedBudget,
  getCurrentBurnRate,
  getFleetRoster,
  computeVerdict,
  resolveAccountLabel,
  CONSTANTS,
} from '../../lib/eva/capacity-governor.js';
import { getAccountIdentity } from '../../lib/fleet/account-identity.cjs';

// QF-20260720-706: resolve the account label ONCE per CLI invocation, from the CURRENTLY
// active identity -- never hand-typed, so project/verdict can never drift from record-event's
// free-text scheme. null (identity unavailable) falls back to getCalibratedBudget's
// pre-fix pooled-average behavior, byte-identical -- never a hard failure.
const currentAccount = resolveAccountLabel(getAccountIdentity());

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEED_EVENTS = [
  {
    account: 'codestreetlabs',
    event_type: 'weekly_cap_hit',
    fleet_size: null,
    window_started_at: null,
    limit_hit_at: '2026-07-05T13:30:00-04:00',
    session_hours_burned: null,
    notes: 'Weekly usage cap hit; triggered the chairman-directed account switch.',
  },
  {
    account: 'rickfelix2000',
    event_type: 'session_window_exhausted',
    fleet_size: 6,
    window_started_at: '2026-07-05T13:30:00-04:00',
    limit_hit_at: '2026-07-05T18:50:00-04:00',
    session_hours_burned: 32,
    notes: 'Fresh session window exhausted after ~5.3h at ~6 concurrent sessions.',
  },
];

async function seedLedger() {
  let inserted = 0;
  for (const evt of SEED_EVENTS) {
    const { data: existing } = await supabase
      .from('capacity_limit_events')
      .select('id')
      .eq('account', evt.account)
      .eq('event_type', evt.event_type)
      .eq('limit_hit_at', new Date(evt.limit_hit_at).toISOString());
    if (existing && existing.length > 0) continue;
    const { error } = await supabase.from('capacity_limit_events').insert(evt);
    if (error) {
      console.error(`Failed to seed ${evt.account}/${evt.event_type}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    inserted++;
  }
  console.log(`Seeded ${inserted} new event(s) (${SEED_EVENTS.length - inserted} already present).`);
}

async function recordEvent(args) {
  const [account, eventType, fleetSizeArg, limitHitAtArg, sessionHoursArg] = args;
  if (!account || !eventType || !limitHitAtArg) {
    console.error('Usage: record-event <account> <event_type> <fleet_size|-> <limit_hit_at_iso> [session_hours_burned]');
    process.exitCode = 1;
    return;
  }
  const row = {
    account,
    event_type: eventType,
    fleet_size: fleetSizeArg && fleetSizeArg !== '-' ? Number(fleetSizeArg) : null,
    limit_hit_at: new Date(limitHitAtArg).toISOString(),
    session_hours_burned: sessionHoursArg ? Number(sessionHoursArg) : null,
    notes: 'Recorded via overnight-capacity-governor.mjs record-event',
  };
  const { error } = await supabase.from('capacity_limit_events').insert(row);
  if (error) {
    console.error(`Failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Recorded: ${JSON.stringify(row)}`);
}

function parseFlag(args, name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

async function project(args) {
  const { budgetSessionHours, source, eventCount } = await getCalibratedBudget(supabase, { account: currentAccount });
  const fleetSize = Number(parseFlag(args, 'fleet-size', 6));
  const burnMultiplier = Number(parseFlag(args, 'burn-multiplier', 1));
  const burnRate = CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR * burnMultiplier;

  const result = projectTimeToWall({
    budgetSessionHours,
    fleetSize,
    burnRatePerSessionPerHour: burnRate,
    referenceBurnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
  });

  console.log(JSON.stringify({
    budgetSessionHours,
    budgetSource: source,
    calibrationEventCount: eventCount,
    fleetSize,
    burnMultiplier,
    hoursToWall: result.hoursToWall,
    hoursToWallHuman: Number.isFinite(result.hoursToWall) ? `${result.hoursToWall.toFixed(2)}h` : 'infinite',
  }, null, 2));
}

async function verdict(args) {
  const { budgetSessionHours, eventCount } = await getCalibratedBudget(supabase, { account: currentAccount });
  const roster = await getFleetRoster(supabase);
  const fleetSize = roster.length || 1;
  const burnRate = await getCurrentBurnRate(supabase, { windowHours: 1, fleetSize });

  const { hoursToWall } = projectTimeToWall({
    budgetSessionHours,
    fleetSize,
    burnRatePerSessionPerHour: burnRate || CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
    referenceBurnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
  });

  const windowHours = Number(parseFlag(args, 'window-hours', 6));
  const windowEntryIso = parseFlag(args, 'window-entry', null);

  const result = computeVerdict({
    fleetRoster: roster,
    projectedHoursToWall: hoursToWall,
    unattendedWindowHours: windowHours,
    eventCount,
    windowEntryIso,
  });

  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case 'seed-ledger':
      await seedLedger();
      break;
    case 'record-event':
      await recordEvent(args);
      break;
    case 'project':
      await project(args);
      break;
    case 'verdict':
      await verdict(args);
      break;
    default:
      console.log('Usage: node scripts/eva/overnight-capacity-governor.mjs <seed-ledger|record-event|project|verdict> [...args]');
      process.exitCode = 1;
  }
}

main();
