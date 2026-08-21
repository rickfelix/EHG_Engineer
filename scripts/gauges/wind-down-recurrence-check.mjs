// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-3) — executor for the wind-down recurrence guard.
// Queries the live trailing-24h feedback.category='wind_down_survey' count and evaluates it
// against the ship-time baseline via the pure lib/governance/wind-down-recurrence-guard.js.
//
// Usage:
//   node scripts/gauges/wind-down-recurrence-check.mjs
//   node scripts/gauges/wind-down-recurrence-check.mjs --baseline 206
//
// Exit code: 0 = not alarmed, 1 = alarmed (suitable for a scheduled check / CI step).
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { evaluateWindDownRecurrence, SHIP_TIME_BASELINE_COUNT_24H } from '../../lib/governance/wind-down-recurrence-guard.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export async function runCheck({ supabase, baselineCount = SHIP_TIME_BASELINE_COUNT_24H, now = new Date() } = {}) {
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { count: trailingCount, error } = await supabase
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('category', 'wind_down_survey')
    .gte('created_at', since24h);
  if (error) throw new Error(`wind-down-recurrence-check: query failed: ${error.message}`);
  // SECURITY evidence (d0547fd5): a `head:true` count query can come back `{count: null,
  // error: null}` (e.g. against a missing/renamed table or an RLS-empty result) — coercing that
  // to 0 via `?? 0` would read as "confirmed zero inflow, all clear" instead of "the instrument
  // itself is broken", the exact "blind check reads as healthy" shape this guard exists to
  // avoid becoming. A non-finite count is a hard failure, never silently folded into 0.
  if (!Number.isFinite(trailingCount)) {
    throw new Error(`wind-down-recurrence-check: query returned a non-finite count (${trailingCount}) with no error — the instrument itself may be broken (missing table, RLS, etc.), refusing to treat this as zero inflow`);
  }

  const verdict = evaluateWindDownRecurrence({ baselineCount, trailingCount });
  return { ...verdict, baselineCount, trailingCount, since24h };
}

async function main() {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf('--baseline');
  const baselineCount = baselineIdx !== -1 ? Number(args[baselineIdx + 1]) : SHIP_TIME_BASELINE_COUNT_24H;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const result = await runCheck({ supabase, baselineCount });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.alarmed ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
