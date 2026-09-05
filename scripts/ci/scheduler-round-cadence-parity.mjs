#!/usr/bin/env node
// scheduler-round-cadence-parity.mjs — FR-4/FR-5(d) of SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
//
// Asserts every periodic_process_registry row named scheduler_round:<key> declares
// expected_interval_seconds matching its ACTUAL registration in lib/eva/eva-master-scheduler.js --
// closing the misdeclaration class that made okr-day28-hardstop/stage_health/portfolio_review read
// OVERDUE by declaration alone (a registry value disagreeing with the scheduler's own cadence).
//
// eva-master-scheduler.js has TWO separate registration APIs with different cadence shapes:
//   registerJob({name, cadenceDays: <number>})        -- 4 okr-* jobs, cadenceDays*86400 seconds
//   registerRound(roundType, {cadence: '<string>'})   -- the other scheduler_round rows, mapped
//                                                          via CADENCE_STRING_TO_SECONDS below
//
// KNOWN LIMITATION: this is a source-text regex scan, not an AST parse or a runtime introspection
// of the live SchedulerV2 instance. It will miss a registration whose cadenceDays/cadence value is
// a computed expression rather than a literal (none exist today -- all 18 live rows resolve to a
// literal). scheduler_round:__poll_loop__ is explicitly excluded: it is the scheduler's own
// self-heartbeat row (mirrors periodic-liveness-watcher.mjs's WATCHER_SELF_KEY convention), never
// registered via registerJob/registerRound, so it has no config to compare against.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCHEDULER_PATH = resolve(ROOT, 'lib/eva/eva-master-scheduler.js');

const CADENCE_STRING_TO_SECONDS = {
  daily: 86400,
  weekly: 604800,
  monthly: 2592000, // 30 days -- matches this file's own okr-* registerJob cadenceDays:30 convention
};

const SELF_HEARTBEAT_KEYS = new Set(['scheduler_round:__poll_loop__']);

/**
 * Parse eva-master-scheduler.js's source for registerJob({name, cadenceDays}) and
 * registerRound('roundType', {cadence}) calls. Pure (string in, map out) so it is unit-testable
 * without touching the filesystem.
 * @param {string} src
 * @returns {Map<string, {seconds:number|null, source:'registerJob'|'registerRound', rawCadence:string|number}>}
 */
/**
 * Given source text and the index of an opening `{`, return the substring up to (not including)
 * its matching closing `}` via brace-depth counting -- required because registerJob's object
 * literal contains a nested `handler: async () => { ... }` function body, which a non-greedy
 * regex (`[\s\S]*?\}`) truncates at the handler's OWN closing brace, never reaching cadenceDays.
 * @param {string} src
 * @param {number} openBraceIndex - index of the `{` character
 * @returns {string}
 */
function extractBalancedBody(src, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(openBraceIndex + 1, i);
    }
  }
  return src.slice(openBraceIndex + 1); // unterminated -- return what we have, caller's regexes just won't match
}

export function parseSchedulerRegistrations(src) {
  const out = new Map();

  // registerJob({ name: 'x', ..., cadenceDays: N, ... }) -- name and cadenceDays can appear in
  // either order within the object literal, so capture the whole (brace-balanced) call body and
  // pull both fields.
  const jobCallStartRe = /registerJob\(\{/g;
  let m;
  while ((m = jobCallStartRe.exec(src)) !== null) {
    const openBraceIndex = m.index + m[0].length - 1;
    const body = extractBalancedBody(src, openBraceIndex);
    const nameMatch = body.match(/name:\s*'([^']+)'/);
    const cadenceMatch = body.match(/cadenceDays:\s*(\d+)/);
    if (nameMatch && cadenceMatch) {
      const name = nameMatch[1];
      const cadenceDays = Number(cadenceMatch[1]);
      out.set(`scheduler_round:${name}`, { seconds: cadenceDays * 86400, source: 'registerJob', rawCadence: cadenceDays });
    }
  }

  // registerRound('roundType', { ..., cadence: 'weekly', ... })
  const roundCallStartRe = /registerRound\('([^']+)',\s*\{/g;
  while ((m = roundCallStartRe.exec(src)) !== null) {
    const roundType = m[1];
    const openBraceIndex = m.index + m[0].length - 1;
    const body = extractBalancedBody(src, openBraceIndex);
    const cadenceMatch = body.match(/cadence:\s*'([^']+)'/);
    if (cadenceMatch) {
      const cadenceStr = cadenceMatch[1];
      const seconds = Object.prototype.hasOwnProperty.call(CADENCE_STRING_TO_SECONDS, cadenceStr)
        ? CADENCE_STRING_TO_SECONDS[cadenceStr]
        : null; // an unmapped cadence string (e.g. 'frequent', 'on_demand') has no fixed-seconds equivalent
      out.set(`scheduler_round:${roundType}`, { seconds, source: 'registerRound', rawCadence: cadenceStr });
    }
  }

  return out;
}

async function main() {
  const src = readFileSync(SCHEDULER_PATH, 'utf8');
  const registrations = parseSchedulerRegistrations(src);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, expected_interval_seconds')
    .like('process_key', 'scheduler_round:%');
  if (error) {
    console.error(JSON.stringify({ status: 'error', error: error.message }));
    process.exitCode = 1;
    return;
  }

  const mismatches = [];
  const unmappedCadence = [];
  const uncovered = [];
  for (const row of rows || []) {
    if (SELF_HEARTBEAT_KEYS.has(row.process_key)) continue;
    const reg = registrations.get(row.process_key);
    if (!reg) {
      uncovered.push(row.process_key); // a live registry row with no matching source registration -- worth knowing, not necessarily a failure
      continue;
    }
    if (reg.seconds === null) {
      unmappedCadence.push({ process_key: row.process_key, rawCadence: reg.rawCadence });
      continue;
    }
    if (row.expected_interval_seconds !== reg.seconds) {
      mismatches.push({ process_key: row.process_key, declared: row.expected_interval_seconds, expected: reg.seconds, source: reg.source });
    }
  }

  const result = {
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
    total_rows_checked: (rows || []).length - [...(rows || [])].filter((r) => SELF_HEARTBEAT_KEYS.has(r.process_key)).length,
    mismatches,
    unmapped_cadence_strings: unmappedCadence, // advisory: a cadence string this predicate cannot verify (no fixed-seconds mapping)
    uncovered_registry_rows: uncovered, // advisory: a registry row with no matching registerJob/registerRound source
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && /scheduler-round-cadence-parity\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
