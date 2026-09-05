#!/usr/bin/env node
// owner-directive-positive-count.mjs — FR-5(e) of SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
//
// POSITIVE predicate (deliberately the counterpart to FR-5(c)'s negative-only assertion,
// per testing-agent's finding that an all-negative suite can pass merely because the new writer
// path was never exercised): asserts the count of session_coordination rows carrying the
// registered owner-directive kind since the merge commit is NON-ZERO once real fleet traffic has
// landed, reporting INSUFFICIENT_DATA (not a false PASS) before that traffic exists.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { OWNER_DIRECTIVE_KIND } from '../../lib/periodic-liveness/owner-directive-writer.mjs';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PREDICATE = `count of session_coordination rows with payload.kind='${OWNER_DIRECTIVE_KIND}' since the merge commit`;

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
        .from('session_coordination')
        .select('id, created_at')
        .eq('payload->>kind', OWNER_DIRECTIVE_KIND)
        .gte('created_at', sinceIso)
    );
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
    return;
  }

  const count = (rows || []).length;
  if (count === 0) {
    console.log(JSON.stringify({
      status: 'INSUFFICIENT_DATA', count: 0, since: sinceIso, predicate: PREDICATE,
      note: 'No owner-directive rows written yet since the given timestamp -- this cannot distinguish "the writer has never fired" from "it correctly fires zero times". Re-run once a periodic process has actually laddered post-merge.',
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({ status: 'PASS', count, since: sinceIso, predicate: PREDICATE }, null, 2));
}

if (process.argv[1] && /owner-directive-positive-count\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
