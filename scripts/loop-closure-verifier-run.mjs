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
 * Evidence collector: per-loop collectors now live in a registry (SD-LEO-INFRA-LOOP-
 * EVIDENCE-COLLECTORS-001), injected here via createCollectEvidence(supabase). A
 * loop_key with no registered collector still gets {} (empty evidence => STARVED) —
 * the chairman-ratified honest baseline (33/33 STARVED, 2026-07-14) is unchanged for
 * every loop except the ones a real collector now covers (L30 first).
 *
 * GT-1 guard: with empty evidence no loop can legitimately evaluate CLOSED (edge
 * freshness of a null edge is false) — a CLOSED verdict for an un-collected loop_key
 * is structurally impossible unless something is broken, so it is surfaced as
 * GT1_VIOLATION and the run exits non-zero to turn the workflow red. A registered
 * collector, by contrast, is designed to supply a real edge ONLY when it can prove
 * closure (see collectors/session-coordination-retention.js's measured-decline gate,
 * SD-LEO-INFRA-L30-CLOSURE-EDGE-001) — a CLOSED verdict for a collected loop is the
 * intended, legitimate CAN-CLOSE proof this system was built to eventually produce,
 * not a violation.
 *
 * Witness: stamps last_fired_at on the ARMED registry row via stampLastFired (NOT
 * registerVerifierCadence, whose upsert resets last_fired_at to null).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runClosureVerifier, VERIFIER_PROCESS_KEY } from '../lib/loop-governance/verifier.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { createCollectEvidence, COLLECTORS } from '../lib/loop-governance/collectors/index.js';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[loop-closure-verifier-run] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const result = await runClosureVerifier(supabase, createCollectEvidence(supabase));
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

  const falseClosed = (result.verdicts || []).filter((v) => v.status === 'closed' && !COLLECTORS[v.loop_key]);
  if (falseClosed.length > 0) {
    console.error(
      `GT1_VIOLATION false-CLOSE (no registered collector for): ` +
      falseClosed.map((v) => v.loop_key).join(', ')
    );
    process.exit(1);
  }

  const legitimatelyClosed = (result.verdicts || []).filter((v) => v.status === 'closed' && COLLECTORS[v.loop_key]);
  if (legitimatelyClosed.length > 0) {
    console.log(
      `[loop-closure-verifier-run] CAN-CLOSE proof: ` +
      legitimatelyClosed.map((v) => v.loop_key).join(', ')
    );
  }

  const stamp = await stampLastFired(supabase, VERIFIER_PROCESS_KEY);
  console.log(`[loop-closure-verifier-run] witness ${VERIFIER_PROCESS_KEY} stamped=${stamp.stamped}${stamp.reason ? ` (${stamp.reason})` : ''}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[loop-closure-verifier-run] error:', e && e.message ? e.message : e);
  process.exit(1);
});
