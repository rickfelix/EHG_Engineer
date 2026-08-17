#!/usr/bin/env node
/**
 * Venture ingest-key provisioning readiness probe + post-provision verification.
 * QF-20260817-752, per docs/reference/anon-write-contract.md FR-2/FR-3.
 *
 * SEQUENCING GUARD (binding, verbatim from the QF): this script NEVER calls
 * fn_provision_venture_ingest_key — that call is CHAIRMAN-HAND ONLY (it rotates the key on
 * every re-call, killing whatever deployment currently holds the old secret). Everything
 * here is a read-only service_role query against venture_ingest_keys (which stores only a
 * SHA-256 hash — the plaintext secret is never persisted anywhere, so this script cannot
 * expose it even by accident) and public.feedback.
 *
 * WHY live-caller-exists / deployment-live ARE LITERAL, HAND-MAINTAINED FACTS below, not
 * derived: all five calling apps live in OTHER repos (apexniche-ai, altifyai, marketlens,
 * ehg) that this probe/CI cannot see — the same reason anon-write-contract-probe.mjs's own
 * header gives for being a DB probe and not a source lint. `ventures.deployment_url` /
 * `launched_at` are also unpopulated for both ventures below (measured 2026-08-17) even
 * though ApexNiche AI has a confirmed live caller, so deriving "deployed" from that table
 * would false-negative. Update KNOWN_VENTURES by hand when a caller ships or a venture's
 * deployment status changes — mirrors the sibling probe's own EXPECTED-is-literal philosophy.
 *
 * Usage:
 *   node scripts/venture-ingest-provisioning-probe.mjs                     # readiness, all known ventures
 *   node scripts/venture-ingest-provisioning-probe.mjs --venture <uuid>    # one venture
 *   node scripts/venture-ingest-provisioning-probe.mjs --verify-submission <uuid> --since <ISO>
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export const EXIT = { OK: 0, NOT_READY: 1, ERROR: 2 };

/** LITERAL, hand-maintained facts — see file header. Do not derive these. */
export const KNOWN_VENTURES = Object.freeze([
  {
    id: '809ec7e7-f688-4a0c-b9f8-c8a8291cf94d',
    name: 'ApexNiche AI',
    hasLiveCaller: true,
    callerNote: 'apexniche-ai/src/ui/api/feedbackClient.ts:121 — sets venture_id + feedback_type correctly',
    deploymentLive: true,
    deploymentNote: 'live caller confirmed calling the anon endpoint today',
  },
  {
    id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
    name: 'AltifyAI',
    hasLiveCaller: true,
    callerNote: 'altifyai/lib/feedback/submit.js — RPC cutover shipped, PR rickfelix/altifyai#24',
    deploymentLive: false,
    deploymentNote: 'no live Cloudflare Workers deployment yet (deploy pending on CF token) — deployment is the provisioning trigger, code-shipped is NOT sufficient; do not provision ahead of it',
  },
]);

/** Pure. Combines a known-venture fact row with a live key-row-exists read into one verdict. */
export function evaluateReadiness(venture, keyRowExists) {
  const blockers = [];
  if (!venture.hasLiveCaller) blockers.push('no live caller');
  if (!venture.deploymentLive) blockers.push(`not deployed — ${venture.deploymentNote}`);
  if (keyRowExists) blockers.push('key row ALREADY EXISTS — re-provisioning ROTATES and breaks the current deployment; do not run Step A unless deliberately coordinating a rotation');
  return {
    ventureId: venture.id,
    ventureName: venture.name,
    liveCallerExists: venture.hasLiveCaller,
    deploymentLive: venture.deploymentLive,
    keyRowExists,
    ready: blockers.length === 0,
    blockers,
  };
}

async function fetchKeyRowExists(supabase, ventureId) {
  const { data, error } = await supabase.from('venture_ingest_keys').select('venture_id').eq('venture_id', ventureId).limit(1);
  if (error) throw new Error(`venture_ingest_keys read failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function runReadinessProbe(supabase, ventures = KNOWN_VENTURES) {
  const results = [];
  for (const v of ventures) {
    results.push(evaluateReadiness(v, await fetchKeyRowExists(supabase, v.id)));
  }
  return results;
}

/**
 * Post-provision verification (FR-2/FR-3 Step B.4): a client-reported success is NOT
 * evidence (anon-write-contract.md "Why the error message misleads"). Confirms a REAL row
 * landed in public.feedback for this venture, created at/after `since`.
 */
export async function verifySubmissionLanded(supabase, ventureId, since) {
  const { data, error, count } = await supabase
    .from('feedback')
    .select('id, created_at', { count: 'exact' })
    .eq('venture_id', ventureId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(`feedback verification read failed: ${error.message}`);
  return { landed: (count ?? 0) > 0, count: count ?? 0, sample: data ?? [] };
}

function printReadiness(results) {
  console.log('=== Venture ingest-key provisioning readiness ===');
  for (const r of results) {
    console.log(`\n${r.ventureName} (${r.ventureId})`);
    console.log(`  live-caller-exists: ${r.liveCallerExists}`);
    console.log(`  deployment-live:    ${r.deploymentLive}`);
    console.log(`  key-row-exists:     ${r.keyRowExists}`);
    console.log(`  READY: ${r.ready ? 'YES — green light for Step A' : 'NO'}`);
    r.blockers.forEach((b) => console.log(`    - BLOCKED: ${b}`));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const getFlag = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const verifyVentureId = getFlag('--verify-submission');
  if (verifyVentureId) {
    const since = getFlag('--since');
    if (!since) {
      console.error('Usage: --verify-submission <venture-uuid> --since <ISO timestamp>');
      process.exit(EXIT.ERROR);
    }
    const result = await verifySubmissionLanded(supabase, verifyVentureId, since);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.landed ? EXIT.OK : EXIT.NOT_READY);
    return;
  }

  const ventureId = getFlag('--venture');
  const ventures = ventureId ? KNOWN_VENTURES.filter((v) => v.id === ventureId) : KNOWN_VENTURES;
  if (ventureId && ventures.length === 0) {
    console.error(`Unknown venture id: ${ventureId}. Known: ${KNOWN_VENTURES.map((v) => v.id).join(', ')}`);
    process.exit(EXIT.ERROR);
    return;
  }

  const results = await runReadinessProbe(supabase, ventures);
  printReadiness(results);
  process.exit(results.every((r) => r.ready) ? EXIT.OK : EXIT.NOT_READY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error('Fatal error:', err.message); process.exit(EXIT.ERROR); });
}
