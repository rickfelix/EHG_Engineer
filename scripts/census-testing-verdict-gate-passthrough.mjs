#!/usr/bin/env node
/**
 * QF-20260902-824, item (a): dry-run census for the SUBAGENT_VERDICT_MODE flip.
 *
 * Measures, without touching any flag, how many PLAN-TO-EXEC/EXEC-TO-PLAN handoffs
 * accepted in the trailing N days WOULD have been refused under SUBAGENT_VERDICT_MODE=block
 * -- i.e. carried a REJECTING TESTING verdict (per subagent-evidence-gate.js's own
 * ACCEPT_VERDICTS/REJECT_VERDICTS classification) that was already recorded at-or-before
 * the handoff's own acceptance time.
 *
 * WHY "at-or-before acceptance time" MATTERS, not just "the latest TESTING row today": a
 * naive "latest row per SD" query is contaminated by TESTING re-runs that happened AFTER
 * the handoff was already accepted (a later phase's re-test, a retry, a retroactive
 * finding) -- those could not possibly be what the gate saw at accept time. Filtering to
 * evidence_at <= accepted_at reconstructs what the gate actually had in front of it.
 *
 * This script is READ-ONLY. It flips nothing. It exists so the flag-flip decision (held
 * for coordinator review per this QF's own scope note -- fleet blast radius on in-flight
 * handoffs) is made against a measured number, not an assumed one.
 *
 * Usage: node scripts/census-testing-verdict-gate-passthrough.mjs [--days 7]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const REJECT_VERDICTS = new Set(['FAIL', 'BLOCKED', 'PENDING', 'MANUAL_REQUIRED', 'ERROR']);

/**
 * Pure predicate, exported for unit testing without a database: given a handoff's
 * acceptance time and the SD's TESTING evidence rows (any order), decide whether a
 * rejecting verdict was already recorded by acceptance time.
 * @param {string} acceptedAt - ISO timestamp
 * @param {Array<{verdict: string, created_at: string}>} testingRows
 * @returns {{rejecting: boolean, verdict: string|null, evidenceAt: string|null}}
 */
export function classifyAtAcceptTime(acceptedAt, testingRows) {
  const cutoff = new Date(acceptedAt).getTime();
  const priorRows = (testingRows || [])
    .filter((r) => new Date(r.created_at).getTime() <= cutoff)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latest = priorRows[0];
  if (!latest) return { rejecting: false, verdict: null, evidenceAt: null };
  return { rejecting: REJECT_VERDICTS.has(latest.verdict), verdict: latest.verdict, evidenceAt: latest.created_at };
}

export async function runCensus({ supabase, days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  // .limit(999): a genuine bound -- a 7-day window of accepted PLAN-TO-EXEC/EXEC-TO-PLAN
  // handoffs measured 253 rows at authoring time; 999 covers a real fleet surge with
  // room to spare while still catching a truly runaway result as an anomaly, rather than
  // an unbounded full-table read.
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type, status, accepted_at, created_at')
    .in('handoff_type', ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'])
    .eq('status', 'accepted')
    .gte('created_at', since)
    .limit(999);
  if (error) throw new Error(`census: sd_phase_handoffs query failed: ${error.message}`);

  const rows = [];
  for (const h of handoffs || []) {
    const acceptedAt = h.accepted_at || h.created_at;
    const { data: testingRows, error: tErr } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, created_at')
      .eq('sd_id', h.sd_id)
      .ilike('sub_agent_code', 'TESTING')
      .lte('created_at', acceptedAt)
      .order('created_at', { ascending: false })
      .limit(1);
    if (tErr) continue; // a single lookup failure must not abort the whole census
    const verdict = classifyAtAcceptTime(acceptedAt, testingRows);
    if (verdict.rejecting) {
      rows.push({ handoff_id: h.id, sd_id: h.sd_id, handoff_type: h.handoff_type, accepted_at: acceptedAt, verdict: verdict.verdict, evidence_at: verdict.evidenceAt });
    }
  }
  return { scanned: (handoffs || []).length, wouldHaveRefused: rows, days };
}

async function main() {
  const daysArg = process.argv.indexOf('--days');
  const days = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 7;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await runCensus({ supabase, days });
  console.log(`\nSUBAGENT_VERDICT_MODE=block DRY-RUN CENSUS (trailing ${result.days}d)`);
  console.log(`  Accepted PLAN-TO-EXEC/EXEC-TO-PLAN handoffs scanned: ${result.scanned}`);
  console.log(`  Would have been REFUSED under block mode: ${result.wouldHaveRefused.length}\n`);
  for (const r of result.wouldHaveRefused) {
    console.log(`  - ${r.handoff_id} (${r.handoff_type}, sd=${r.sd_id}) accepted=${r.accepted_at} verdict=${r.verdict} evidence_at=${r.evidence_at}`);
  }
  console.log('\n(Read-only. No flag was changed by this run.)');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
