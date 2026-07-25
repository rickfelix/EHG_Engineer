#!/usr/bin/env node
/**
 * Solomon late-verdict reconciliation sweep — SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 (FR-4b).
 *
 * DURABILITY IS THE POINT. FR-4a already wires reconcileLateVerdicts into adam-advisory's inbox
 * mode, but that host is SESSION-SCOPED: it only runs while an Adam session is alive. A Solomon
 * verdict lands 135-600s after the pre-send consult and Adam sessions routinely end in between, so
 * a session-only host would silently stop reconciling exactly when it matters. This mirrors the
 * proven GitHub Actions pattern of adam-inbound-backlog-watchdog-sweep.mjs, whose header argues
 * this same point at length (the QF-20260719-196 / QF-20260719-997 class: session CronCreate
 * expires after 7 days and dies with the window).
 *
 * Transport: supabase-js + service-role ONLY. There is deliberately NO pooler/pg/DATABASE_URL
 * path — SUPABASE_POOLER_URL is injected into ZERO *cron*.yml in this repo and is silently
 * undefined on a GHA runner, so a pg path would fail closed with nobody watching.
 *
 * Exit codes:
 *   0 — ran clean (reconciled >= 0; nothing to do is a normal, healthy outcome)
 *   1 — INFRA failure (could not build the client / the sweep threw). Never conflated with "quiet".
 *
 * There is deliberately NO breach code. A consult with no verdict is NOT a failure of this sweep —
 * a bit under HALF of consults are ever answered (MEASURED 2026-07-25: 42 of 93 = 45.2%), so
 * escalating on unanswered consults would fire on the majority of rows and train everyone to ignore
 * it. This sweep reports only what it CONSUMED.
 * (An earlier draft of this header cited ~18%; that figure was wrong by ~2.5x and is corrected here.
 * The decision is unchanged — 55% unanswered is, if anything, a stronger argument against a breach
 * code — but the number was load-bearing in the rationale, so it should not stay wrong.)
 */
import { createClient } from '@supabase/supabase-js';
// Windows-safe main-module guard (TR-4): the raw `import.meta.url === file://${process.argv[1]}`
// form never matches on a backslash path, which is why scripts/consult-answer-bind.mjs:105 has a
// CLI that has never once fired on this platform.
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001';
const EXIT_OK = 0;
const EXIT_INFRA = 1;

function parseArgs(argv = []) {
  return { dryRun: argv.includes('--dry-run') };
}

function buildSupabase(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key);
}

/**
 * Dependency-injected entrypoint: deps.{logger, env, now, supabase, reconcile, recordDisposition,
 * detectVerdictDelta} so the whole sweep is unit-testable with a fake supabase and injected clock —
 * no network, no real time.
 */
export async function main(argv = process.argv, deps = {}) {
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const nowMs = Number.isFinite(deps.now) ? deps.now : Date.now();
  const args = parseArgs(argv);

  let supabase;
  try {
    supabase = deps.supabase || buildSupabase(env);
  } catch (err) {
    logger.log?.(`[late-verdict-reconcile] ${JSON.stringify({ ts: new Date(nowMs).toISOString(), sd: SD_KEY, ok: false, reason: 'infra', error: err.message })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }

  try {
    const reconcile = deps.reconcile
      || (await import('../../lib/coordinator/reply-class.cjs')).reconcileLateVerdicts
      || (await import('../../lib/coordinator/reply-class.cjs')).default?.reconcileLateVerdicts;
    const recordDisposition = deps.recordDisposition
      || (await import('../../lib/decision-binding/disposition.js')).recordDisposition;
    const detectVerdictDelta = deps.detectVerdictDelta
      || (await import('../../lib/adam/should-consult-solomon.js')).detectVerdictDelta;

    // --dry-run exercises the full read + match path but records nothing and stamps nothing, so a
    // candidate stays reconcilable on the next real run.
    const result = await reconcile(supabase, {
      now: nowMs,
      recordDisposition: args.dryRun
        ? async () => ({ created: false, dryRun: true })
        : (a) => recordDisposition(supabase, { decisionType: a.decisionType, subject: a.subject, answerPayload: a.payload }),
      detectVerdictDelta,
      // Near-miss capture is intentionally omitted on the cron host: issue_patterns is the
      // session-side governance feeder, and a cron double-writing it would duplicate what FR-4a's
      // in-session pass already records. Reconciliation itself is idempotent either way.
    });

    // per-candidate write failures are surfaced, NOT folded into the quiet-lane reading. The
    // reconciler fails open per row, so a sweep where every write threw still returns reconciled:0
    // — identical on the wire to "nothing to do". That conflation is exactly how a reconciler that
    // never once succeeded logged ok:true for its whole life. Still exit 0 (fail-open is
    // deliberate; the rows stay retryable), but the counts make the difference visible.
    logger.log?.(`[late-verdict-reconcile] ${JSON.stringify({
      ts: new Date(nowMs).toISOString(),
      sd: SD_KEY,
      dry_run: args.dryRun,
      checked: result.checked,
      reconciled: result.reconciled,
      near_misses: result.nearMisses,
      already_dispositioned: result.alreadyDispositioned ?? 0,
      write_errors: result.errors ?? 0,
      // CODE only, never the raw driver message. A Postgres constraint violation embeds
      // "Failing row contains (...)" with the consult body, and this log is world-readable on a
      // public repo. Length-capping that message would not help — it bounds size, not content.
      first_error_code: result.firstErrorCode ?? null,
      window_saturated: result.saturated === true,
      // C1: "no answers" vs "could not READ the answers" are different states. Without this they
      // log identically and a blind sweep reports a healthy quiet lane.
      answer_query_failed: result.answerQueryFailed === true,
      ok: true,
    })}`);
    return { exitCode: EXIT_OK, summary: result };
  } catch (err) {
    logger.log?.(`[late-verdict-reconcile] ${JSON.stringify({ ts: new Date(nowMs).toISOString(), sd: SD_KEY, ok: false, reason: 'infra', error: String(err && err.message).slice(0, 200) })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }
}

if (isMainModule(import.meta.url)) {
  const { exitCode } = await main();
  process.exit(exitCode);
}
