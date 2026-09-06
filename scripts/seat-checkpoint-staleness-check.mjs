#!/usr/bin/env node
/**
 * seat-checkpoint-staleness-check.mjs — SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A FR-4.
 *
 * Daily read-side half of the CAPA W6 role-seat durability corrective. Asserts: for each of the
 * 4 fixed role seats (SEAT_NAMES), the newest role_seat_checkpoints row is no older than 24
 * hours. Three rounds of PLAN-phase adversarial review (evidence 79b61564/3fb39af9/732f0d3f)
 * converged on this design specifically BECAUSE two earlier drafts tried to derive "which seats
 * count" from claude_sessions liveness and produced a different denominator on each side of the
 * write/read boundary — this check has NO claude_sessions dependency and NO local file access at
 * all, which is also why it is safe to run on a GitHub-hosted runner (unlike the write side,
 * which needs the gitignored local `.claude/*.md` files and must stay machine-local).
 *
 * FAILS LOUD, NEVER A FALSE-PASS 0:
 *   - An unreachable table / query error is a hard failure (exit 1), never reported as "0 stale".
 *   - A seat_name with ZERO checkpoint rows ever is reported AS stale (age=Infinity), never
 *     silently excluded from the count.
 * Uses a service-role client (matching the table's RLS) -- an anon/authenticated client would
 * silently read 0 rows with no error, the exact false-pass class this check exists to prevent.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { SEAT_NAMES } = require('../lib/fleet/seat-checkpoint-registry.cjs');

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export const NAMED_FIRST_INSTANCE = 'solomon';

/**
 * Pure: given the newest last_verified_at per seat_name (or undefined if never mirrored),
 * compute the staleness verdict for one seat.
 * @param {string|undefined} lastVerifiedAt
 * @param {number} nowMs
 * @returns {{stale: boolean, ageMs: number}}
 */
export function evaluateSeatStaleness(lastVerifiedAt, nowMs = Date.now()) {
  if (!lastVerifiedAt) return { stale: true, ageMs: Infinity };
  const verifiedMs = Date.parse(lastVerifiedAt);
  if (!Number.isFinite(verifiedMs)) return { stale: true, ageMs: Infinity };
  const ageMs = nowMs - verifiedMs;
  return { stale: ageMs > STALE_THRESHOLD_MS, ageMs };
}

/**
 * Pure: given a map of seat_name -> newest last_verified_at (missing keys = never mirrored),
 * evaluate all 4 fixed seats.
 * @param {Record<string,string|undefined>} newestBySeat
 * @param {number} [nowMs]
 * @returns {{staleSeats: Array<{seatName:string, ageMs:number}>, results: Array<{seatName:string, stale:boolean, ageMs:number}>}}
 */
export function evaluateAllSeats(newestBySeat, nowMs = Date.now()) {
  const results = SEAT_NAMES.map((seatName) => {
    const { stale, ageMs } = evaluateSeatStaleness(newestBySeat[seatName], nowMs);
    return { seatName, stale, ageMs };
  });
  const staleSeats = results.filter((r) => r.stale).map((r) => ({ seatName: r.seatName, ageMs: r.ageMs }));
  return { staleSeats, results };
}

/**
 * Fetch the newest last_verified_at per seat_name from role_seat_checkpoints.
 * Throws on any query error -- callers MUST treat a throw as a hard failure, never a false 0.
 *
 * One bounded (`.limit(1)`) query PER fixed seat_name, not a single unbounded global-order select.
 * EXEC-TO-PLAN TESTING evidence (2026-09-06): a single `.order().select()` with no `.limit()` is
 * only "correct by luck" today (4 rows always sort into PostgREST's default max-rows window) and
 * would silently truncate once the table grows past that cap. SEAT_NAMES is fixed and small (4
 * values), so per-seat queries stay cheap and are correct regardless of total table size.
 * @param {object} supabase - service-role client
 * @returns {Promise<Record<string,string|undefined>>}
 */
export async function fetchNewestVerifiedPerSeat(supabase) {
  const newestBySeat = {};
  for (const seatName of SEAT_NAMES) {
    const { data, error } = await supabase
      .from('role_seat_checkpoints')
      .select('last_verified_at')
      .eq('seat_name', seatName)
      .order('last_verified_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`role_seat_checkpoints query failed (seat_name=${seatName}): ${error.message}`);
    if (data && data.length > 0) newestBySeat[seatName] = data[0].last_verified_at;
  }
  return newestBySeat;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let newestBySeat;
  try {
    newestBySeat = await fetchNewestVerifiedPerSeat(supabase);
  } catch (e) {
    console.error(`SEAT_CHECKPOINT_STALENESS: HARD FAILURE (never a false-pass 0) — ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const { staleSeats, results } = evaluateAllSeats(newestBySeat);
  for (const r of results) {
    const ageLabel = Number.isFinite(r.ageMs) ? `${Math.round(r.ageMs / 3_600_000)}h` : 'never mirrored';
    const named = r.seatName === NAMED_FIRST_INSTANCE ? ' (named first instance, Solomon predicate 01982cf5 item a)' : '';
    console.log(`  seat=${r.seatName} stale=${r.stale} age=${ageLabel}${named}`);
  }

  if (staleSeats.length > 0) {
    console.error(`SEAT_CHECKPOINT_STALENESS: ${staleSeats.length} stale seat(s): ${staleSeats.map((s) => s.seatName).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('SEAT_CHECKPOINT_STALENESS: 0 stale seats.');
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
