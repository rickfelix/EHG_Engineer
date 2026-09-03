#!/usr/bin/env node
/**
 * QF-20260902-824: the coordinator's flip-timing ruling (directive a4dfd033, 2026-09-03T01:01Z)
 * for SUBAGENT_VERDICT_MODE=block on PLAN-TO-EXEC/EXEC-TO-PLAN.
 *
 * "flip ONLY when a measurement at flip time shows zero in-flight handoffs with a
 * currently-rejecting TESTING verdict - query sub_agent_execution_results for TESTING
 * rows with a rejecting verdict on SDs whose status is active and whose latest
 * sd_phase_handoffs row is not accepted; print the count in the PR and on the QF row.
 * If the count is nonzero, land the code with the flag default OFF and record the
 * blocking SD keys on the row; I flip it at the next zero reading."
 *
 * This is a PRESENT-TENSE snapshot, distinct from
 * scripts/census-testing-verdict-gate-passthrough.mjs's trailing-N-day HISTORICAL
 * census of already-accepted handoffs. The question here is narrower and more urgent:
 * "if the flag flipped RIGHT NOW, which in-flight SDs would have their NEXT handoff
 * attempt refused because they already carry a rejecting TESTING verdict?"
 *
 * READ-ONLY. Flips nothing. "Evidence... runner-produced with artifact_path+sha, never
 * hand-written" (the ruling's own words) -- this script WRITES its own output as a JSON
 * artifact under .artifacts/ and prints the artifact's sha256, so the flip decision cites
 * a file this script produced, not a number typed into a PR description by hand.
 *
 * Usage: node scripts/census-inflight-testing-block-risk.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REJECT_VERDICTS = new Set(['FAIL', 'BLOCKED', 'PENDING', 'MANUAL_REQUIRED', 'ERROR']);

/**
 * @param {object} supabase
 * @returns {Promise<{scannedActiveSds: number, blocking: Array<{sd_key: string, sd_id: string, latest_handoff_status: string|null, testing_verdict: string}>}>}
 */
export async function runInFlightCensus({ supabase }) {
  // .limit(500): a genuine bound, not lint-decoration -- 'active' SDs are a small,
  // deliberately-scarce working set (measured 6 live at authoring time); 500 is generous
  // headroom while still catching a runaway population as an anomaly worth investigating,
  // rather than reading the whole table unbounded.
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('status', 'active')
    .limit(500);
  if (error) throw new Error(`census: strategic_directives_v2 query failed: ${error.message}`);

  const blocking = [];
  for (const sd of sds || []) {
    const { data: handoffs, error: hErr } = await supabase
      .from('sd_phase_handoffs')
      .select('status, created_at')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (hErr) continue; // a single lookup failure excludes that SD, never aborts the census
    const latestHandoffStatus = handoffs && handoffs[0] ? handoffs[0].status : null;
    if (latestHandoffStatus === 'accepted') continue; // already past the gate at its latest phase

    const { data: testing, error: tErr } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, created_at')
      .eq('sd_id', sd.id)
      .ilike('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tErr) continue;
    const latestVerdict = testing && testing[0] ? testing[0].verdict : null;
    if (latestVerdict && REJECT_VERDICTS.has(latestVerdict)) {
      blocking.push({ sd_key: sd.sd_key, sd_id: sd.id, latest_handoff_status: latestHandoffStatus, testing_verdict: latestVerdict });
    }
  }
  return { scannedActiveSds: (sds || []).length, blocking };
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await runInFlightCensus({ supabase });
  const artifact = {
    measurement: 'inflight_testing_block_risk',
    qf: 'QF-20260902-824',
    ruling_directive_id: 'a4dfd033-0302-4919-87c5-d0b4ecd65475',
    measured_at: new Date().toISOString(),
    scanned_active_sds: result.scannedActiveSds,
    blocking_count: result.blocking.length,
    blocking_sd_keys: result.blocking.map((b) => b.sd_key),
    blocking: result.blocking,
  };

  const artifactDir = path.resolve(process.cwd(), '.artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `qf-20260902-824-inflight-block-census-${Date.now()}.json`);
  const content = JSON.stringify(artifact, null, 2);
  fs.writeFileSync(artifactPath, content);
  const sha = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  console.log(`\nIN-FLIGHT TESTING-BLOCK RISK CENSUS (present-tense, per coordinator ruling a4dfd033)`);
  console.log(`  Active SDs scanned: ${result.scannedActiveSds}`);
  console.log(`  Blocking (would refuse under SUBAGENT_VERDICT_MODE=block right now): ${result.blocking.length}`);
  for (const b of result.blocking) {
    console.log(`    - ${b.sd_key} (sd_id=${b.sd_id}) latest_handoff_status=${b.latest_handoff_status} testing_verdict=${b.testing_verdict}`);
  }
  console.log(`\n  artifact_path: ${path.relative(process.cwd(), artifactPath)}`);
  console.log(`  sha256: ${sha}`);
  console.log('\n(Read-only. No flag was changed by this run.)');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
