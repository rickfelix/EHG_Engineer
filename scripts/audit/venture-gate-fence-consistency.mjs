#!/usr/bin/env node
/** QF-20260912-366 fix (c): flags any SD row carrying fence_status_YYYY_MM_DD.state='CLEARED'
 *  alongside a stale venture_gate_last_verdict='NOT_MET'. Read-only; reports, never writes. */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const FENCE_KEY_RE = /^fence_status_\d{4}_\d{2}_\d{2}$/;

/** PURE: does this row's metadata carry the contradictory pair? */
export function findFenceVerdictContradiction(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return null;
  const fenceKey = Object.keys(metadata).find((k) => FENCE_KEY_RE.test(k));
  if (!fenceKey) return null;
  const fence = metadata[fenceKey];
  if (!fence || fence.state !== 'CLEARED') return null;
  if (metadata.venture_gate_last_verdict !== 'NOT_MET') return null;
  return { fenceKey, fenceState: fence.state, verdict: metadata.venture_gate_last_verdict };
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // 6276+ SD rows live -- an unpaginated .select() silently clamps at PostgREST's 1000-row cap.
  let data;
  try {
    data = await fetchAllPaginated(() => supabase.from('strategic_directives_v2').select('sd_key, metadata'));
  } catch (err) {
    console.error('READ FAILED:', err.message);
    process.exit(1);
  }

  const flagged = [];
  for (const row of data) {
    const hit = findFenceVerdictContradiction(row.metadata);
    if (hit) flagged.push({ sd_key: row.sd_key, ...hit });
  }

  if (flagged.length === 0) {
    console.log('No fence/verdict contradictions found.');
    return;
  }
  console.log(`${flagged.length} row(s) with a fence CLEARED but venture_gate_last_verdict NOT_MET:`);
  for (const f of flagged) console.log(`  - ${f.sd_key} (${f.fenceKey})`);
  process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  main();
}
