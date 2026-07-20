#!/usr/bin/env node
/**
 * Fixture-venture residue sweep
 * QF-20260710-435 (coordinator gauge delta e580c3e0; §H5 fence-6 residue class)
 *
 * Test/e2e fixture ventures must never sit LIVE (active/paused) and undeleted in prod
 * tables — that is exactly the residue the simulated-run harness fence 6 asserts zero
 * of post-run. This sweep is the standing assertion:
 *
 *   node scripts/sweep-fixture-residue.mjs          # assert: exit 1 + FIXTURE_RESIDUE lines on residue
 *   node scripts/sweep-fixture-residue.mjs --fix    # sanctioned teardown: soft-delete (deleted_at + cancelled)
 *
 * Predicate (the QF-named classes, superset of the canonical isFixtureVenture):
 *   is_demo=true | metadata.is_fixture=true | name ^__e2e_ | ^TEST- | ^parity-test- |
 *   ^test-stub | ^Test Venture for
 * The permanently-flagged canary venture is EXCLUDED — it is designed to cycle live
 * briefly during probes (net-zero per run) and is not residue.
 */

import 'dotenv/config';
import { createRequire } from 'node:module';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

/** Canary exclusion — the one sanctioned permanently-flagged is_demo venture. */
export const CANARY_NAME = 'Canary Venture Probe';

export const FIXTURE_CLASS_RE = /^(__e2e_|TEST-|parity-test-|test-stub|Test Venture for )/i;

/** Pure: is this row a fixture-class venture (QF-435 predicate)? */
export function isFixtureClassVenture(v) {
  if (!v) return false;
  if (v.name === CANARY_NAME) return false;
  if (v.is_demo === true) return true;
  if (v.metadata && v.metadata.is_fixture === true) return true;
  return typeof v.name === 'string' && FIXTURE_CLASS_RE.test(v.name);
}

/** Pure: is this fixture-class row LIVE residue (the fence-6 class)? */
export function isLiveResidue(v) {
  return isFixtureClassVenture(v)
    && v.deleted_at == null
    && (v.status === 'active' || v.status === 'paused');
}

/**
 * Sweep prod ventures for fixture residue.
 * @returns {Promise<{residue: Object[], fixed: number}>}
 */
export async function sweepFixtureResidue(supabase, { fix = false, logger = console } = {}) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: ventures is a portfolio table that
  // grows with portfolio size — small today is not a provable bound. Paginate.
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status, is_demo, deleted_at, metadata')
      .is('deleted_at', null)
      .in('status', ['active', 'paused'])
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`sweep query failed: ${e.message}`);
  }

  const residue = data.filter(isLiveResidue);

  for (const v of residue) {
    logger.log(`FIXTURE_RESIDUE id=${v.id} name="${v.name}" status=${v.status} ⚠`);
  }

  let fixed = 0;
  if (fix && residue.length > 0) {
    for (const v of residue) {
      // Sanctioned teardown: soft-delete — deleted_at stamped, status terminal.
      const { error: updErr } = await supabase
        .from('ventures')
        .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
        .eq('id', v.id);
      if (updErr) {
        logger.warn(`FIXTURE_RESIDUE_FIX_FAILED id=${v.id}: ${updErr.message}`);
      } else {
        fixed += 1;
        logger.log(`FIXTURE_RESIDUE_FIXED id=${v.id} name="${v.name}" (soft-deleted)`);
      }
    }
  }

  logger.log(`FIXTURE_RESIDUE_CLEAN=${residue.length - fixed === 0} residue=${residue.length} fixed=${fixed}`);
  return { residue, fixed };
}

async function main() {
  const fix = process.argv.includes('--fix');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, key);
  const { residue, fixed } = await sweepFixtureResidue(supabase, { fix });
  // exitCode (not process.exit): hard-exiting with live supabase handles trips a libuv
  // teardown assert on Windows (exit 127 AFTER printing CLEAN=true) — an assertion tool
  // must have a trustworthy exit code.
  process.exitCode = residue.length - fixed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
