#!/usr/bin/env node
// QF-20260912-514 (FIX SHAPE c): one weekly yield line -- stamped instrument N / stamped
// pick N / unclassified N for the trailing 7 days -- so Solomon's weekly deep review
// (CLAUDE_SOLOMON_MANUAL.md, ratification a236d122) measures the SENDER, not just the
// router, and the retirement rule (lib/governance/fw3-framing-router.cjs docblock) has a
// number to read each cycle.
//
// KNOWN LIMITATION: queries session_coordination directly (mirrors solomon-advisory.cjs's
// checkConsultQuota query shape). A row past this table's own retention/archival window is
// not counted -- run on the review's own weekly cadence to stay inside that window.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { tallyFramingYield, formatFramingYieldLine } = require('../lib/governance/fw3-framing-yield.cjs');

export async function computeWeeklyFramingYield(supabase, { days = 7, now = new Date() } = {}) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // count-truncation-diff-lint requires a provably-bounded limit(N<1000) -- PostgREST's own
  // server-side db-max-rows cap silently clamps ANY unranged read at 1000 regardless of a
  // higher client .limit() (measured convention, see scripts/adam-advisory.cjs's
  // SWEEP_ROW_LIMIT), so 2000 would have been misleading, not just unbounded.
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, payload, created_at')
    .eq('payload->>oracle', 'true')
    .gte('created_at', since.toISOString())
    .limit(999);
  if (error) return { available: false, reason: error.message };
  const counts = tallyFramingYield(data || []);
  return { available: true, counts, line: formatFramingYieldLine(counts, { days }) };
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await computeWeeklyFramingYield(supabase);
  if (!result.available) {
    console.error(`[framing-router-yield] UNAVAILABLE: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.line);
}

if (isMainModule(import.meta.url)) {
  main();
}
