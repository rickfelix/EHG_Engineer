#!/usr/bin/env node
// chairman-awareness-live-owner-count.mjs — FR-5(c) of SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
//
// Asserts zero chairman_decisions rows with brief_data.recorded_via='ladder-escalation-advisory'
// whose brief_data.reason is anything other than 'dead_owner' or 'chairman_owned' -- by
// construction, lib/periodic-liveness/ladder-escalation.mjs's decideLadderRoute() only ever
// routes a process to chairman_awareness for one of those two reasons (never a live, non-chairman
// owner), so any other/missing reason value on a live row is a regression in that invariant.
//
// A zero-denominator window (no rows since the given timestamp) prints INSUFFICIENT_DATA rather
// than a bare PASS, since "no data" and "zero defects" are different claims (mirrors
// claim-guard-path-source-false-block-count.mjs's FR-5a precedent, SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RECORDED_VIA = 'ladder-escalation-advisory';
const VALID_REASONS = new Set(['dead_owner', 'chairman_owned']);
const PREDICATE = "chairman_decisions rows with brief_data.recorded_via='ladder-escalation-advisory' whose brief_data.reason is not dead_owner or chairman_owned";

function parseArgs(argv) {
  const out = { sinceIso: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') out.sinceIso = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceIso = args.sinceIso || process.env.LIVENESS_LADDER_MERGE_COMMIT_ISO;
  if (!sinceIso) {
    console.error(JSON.stringify({ status: 'error', error: 'missing --since <ISO timestamp of the merge commit> (or LIVENESS_LADDER_MERGE_COMMIT_ISO env var)' }));
    process.exitCode = 1;
    return;
  }

  let rows;
  try {
    rows = await fetchAllPaginated(() =>
      supabase
        .from('chairman_decisions')
        .select('id, created_at, brief_data')
        .eq('brief_data->>recorded_via', RECORDED_VIA)
        .gte('created_at', sinceIso)
    );
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
    return;
  }

  const denominator = (rows || []).length;
  if (denominator === 0) {
    console.log(JSON.stringify({
      status: 'INSUFFICIENT_DATA', denominator: 0, count: 0, since: sinceIso, predicate: PREDICATE,
      note: 'Zero ladder-escalation-advisory rows since the given timestamp -- this is NOT the same as zero defects. Re-run once real traffic has landed rows.',
    }, null, 2));
    return;
  }

  const offenders = (rows || []).filter((r) => !VALID_REASONS.has(r.brief_data?.reason));
  const result = {
    status: offenders.length === 0 ? 'PASS' : 'FAIL',
    denominator, count: offenders.length, since: sinceIso, predicate: PREDICATE,
    offending_row_ids: offenders.map((r) => r.id),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && /chairman-awareness-live-owner-count\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
