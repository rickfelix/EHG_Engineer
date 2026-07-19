#!/usr/bin/env node
// Forecast Ledger CLI — register / resolve / calibration. SD-LEO-FEAT-FORECAST-LEDGER-001.
// Thin wrapper: builds a service-role supabase client and delegates to lib/forecasting/ledger.js.
//   node scripts/forecast-ledger.js register --question "..." --class kill-gate --p 0.7 --horizon 30d --resolution "..." [--model opus-4.8]
//   node scripts/forecast-ledger.js resolve --id <id> --outcome true|false
//   node scripts/forecast-ledger.js calibration [--class kill-gate]
import { createClient } from '@supabase/supabase-js';
import { register, resolve, calibration } from '../lib/forecasting/ledger.js';

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const truthy = (v) => /^(true|1|yes|y)$/i.test(String(v || ''));

async function main() {
  try { (await import('@dotenvx/dotenvx')).config({ quiet: true }); } catch { try { await import('dotenv/config'); } catch { /* env may already be set */ } }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
  const deps = { supabase };
  const by = arg('--by', process.env.CLAUDE_SESSION_ID || 'cli');
  const cmd = process.argv[2];

  let out;
  if (cmd === 'register') {
    out = await register(deps, {
      question: arg('--question'), questionClass: arg('--class'), p: Number(arg('--p')),
      horizon: arg('--horizon'), resolutionCriteria: arg('--resolution'), model: arg('--model'), registeredBy: by,
    });
  } else if (cmd === 'resolve') {
    out = await resolve(deps, { id: arg('--id'), outcome: truthy(arg('--outcome')), resolvedBy: by });
  } else if (cmd === 'calibration') {
    out = await calibration(deps, { questionClass: arg('--class') });
  } else {
    console.error('Usage: forecast-ledger.js register|resolve|calibration [flags] — see file header');
    process.exit(2);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error('forecast-ledger:', e && e.message ? e.message : e); process.exit(1); });
