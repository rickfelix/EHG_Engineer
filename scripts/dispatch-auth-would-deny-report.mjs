#!/usr/bin/env node
/**
 * Per-mint-path would_deny evidence report.
 * SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-B FR-5.
 *
 * Reads the durable evidence written by recordWouldDenyEvidence()
 * (lib/claim/gates/dispatch-authorization.cjs, reusing system_events) and
 * groups it by mint path (payload.mint_path — the SD's own creation
 * provenance, distinct from claim lane) and by claim lane. This is the
 * concrete deliverable a future, separately-scoped SD would consume as its
 * empirical input for deriving an auto-authorize allowlist — deriving or
 * shipping that allowlist is explicitly OUT OF SCOPE here.
 *
 * Usage:
 *   node scripts/dispatch-auth-would-deny-report.mjs
 */

import 'dotenv/config';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { WOULD_DENY_EVENT_TYPE } from '../lib/claim/gates/dispatch-authorization.cjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

/**
 * @param {object} supabase
 * @returns {Promise<{total: number, byMintPath: Record<string, number>, byLane: Record<string, number>}>}
 */
export async function buildWouldDenyProfile(supabase) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: system_events is an unbounded
  // growing (*_events) table and every row is iterated into the histogram below — paginate to
  // completion. Error policy preserved: same thrown message.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('system_events')
      .select('payload')
      .eq('event_type', WOULD_DENY_EVENT_TYPE)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) {
    throw new Error(`would_deny evidence read failed: ${e.message}`);
  }
  const byMintPath = {};
  const byLane = {};
  for (const row of rows) {
    const payload = row.payload || {};
    const mintPath = payload.mint_path || 'unknown';
    const lane = payload.lane || 'unknown';
    byMintPath[mintPath] = (byMintPath[mintPath] || 0) + 1;
    byLane[lane] = (byLane[lane] || 0) + 1;
  }
  return { total: rows.length, byMintPath, byLane };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const profile = await buildWouldDenyProfile(supabase);

  console.log('\nDISPATCH-AUTH WOULD-DENY EVIDENCE PROFILE');
  console.log('='.repeat(60));
  console.log(`Total evidence rows: ${profile.total}`);

  console.log('\nBy mint path (SD creation provenance):');
  if (Object.keys(profile.byMintPath).length === 0) {
    console.log('  (none yet)');
  } else {
    for (const [mintPath, count] of Object.entries(profile.byMintPath).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${mintPath.padEnd(30)} ${count}`);
    }
  }

  console.log('\nBy claim lane (which CLI attempted the claim):');
  if (Object.keys(profile.byLane).length === 0) {
    console.log('  (none yet)');
  } else {
    for (const [lane, count] of Object.entries(profile.byLane).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${lane.padEnd(30)} ${count}`);
    }
  }
  console.log('='.repeat(60));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
