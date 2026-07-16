/**
 * Loop-closure verifier cadence runner (the CRON-WIRE).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001 — operational hardening gap (a))
 *
 * PR #6090 shipped and ARMED the closure verifier (periodic_process_registry row
 * `g3-armed-loop-closure-verifier`, daily cadence) but nothing invokes it on a real
 * schedule — evaluated_at only advances when someone runs it by hand. This CLI is the
 * missing invoker, called daily by .github/workflows/loop-closure-verifier-cron.yml
 * (and manually via workflow_dispatch or `node scripts/loop-closure-verifier-run.mjs`).
 *
 * Evidence collector: per-loop collectors are a separate, dependency-ordered SD (Adam's
 * lane — D5 retention is the golden-test first collector). Until they land, this runner
 * supplies the EMPTY collector, which the closure engine evaluates as STARVED — the
 * chairman-ratified honest baseline (33/33 STARVED, 2026-07-14). Collectors plug in
 * here when they exist.
 *
 * GT-1 guard: with empty evidence no loop can legitimately evaluate CLOSED (edge
 * freshness of a null edge is false). A CLOSED verdict under this baseline is a
 * false-CLOSE — the exact failure the op-co GO gate exists to prevent — so it is
 * surfaced as GT1_VIOLATION and the run exits non-zero to turn the workflow red.
 *
 * Witness: stamps last_fired_at on the ARMED registry row via stampLastFired (NOT
 * registerVerifierCadence, whose upsert resets last_fired_at to null).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runClosureVerifier, VERIFIER_PROCESS_KEY } from '../lib/loop-governance/verifier.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

// Per-loop evidence collectors not wired yet — empty evidence => honest STARVED.
const emptyEvidenceCollector = () => ({});

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[loop-closure-verifier-run] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const result = await runClosureVerifier(supabase, emptyEvidenceCollector);
  if (!result.ran) {
    console.error(`[loop-closure-verifier-run] verifier did not run: ${result.reason}`);
    process.exit(1);
  }

  const tally = {};
  for (const v of result.verdicts || []) tally[v.status] = (tally[v.status] || 0) + 1;
  console.log(
    `[loop-closure-verifier-run] evaluated=${result.evaluated} written=${result.written} ` +
    `tally=${JSON.stringify(tally)}`
  );

  const falseClosed = (result.verdicts || []).filter((v) => v.status === 'closed');
  if (falseClosed.length > 0) {
    console.error(
      `GT1_VIOLATION false-CLOSE under empty-evidence baseline: ` +
      falseClosed.map((v) => v.loop_key).join(', ')
    );
    process.exit(1);
  }

  const stamp = await stampLastFired(supabase, VERIFIER_PROCESS_KEY);
  console.log(`[loop-closure-verifier-run] witness ${VERIFIER_PROCESS_KEY} stamped=${stamp.stamped}${stamp.reason ? ` (${stamp.reason})` : ''}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[loop-closure-verifier-run] error:', e && e.message ? e.message : e);
  process.exit(1);
});
