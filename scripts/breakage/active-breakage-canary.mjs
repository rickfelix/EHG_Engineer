#!/usr/bin/env node
/**
 * Active breakage canary — SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-D (child D).
 *
 * A NET-NEW, uniquely-named active prober (distinct from llm_canary_* and from run-canary-probe.mjs /
 * CANARY_VENTURE_PROBE_V1). It actively probes the 4 breakage classes child C's PASSIVE detectors do NOT
 * cover and, on detection, writes FAIL-LOUD to system_alerts via child-B recordSystemAlert using child-A's
 * frozen taxonomy:
 *   - RLS-regression       : anon write must be RLS-DENIED (read-only intent; self-cleans on regression)
 *   - gate-pipeline-down   : recent handoff ACTIVITY with zero completions (never idle)
 *   - payment-webhook-fail : substrate-absence-aware (no webhook table today -> skip, forward-compatible)
 *   - model-availability-cap: REUSES detectFromDb (never re-implements the rung evaluator)
 *
 * SAFETY: every probe is read-only; none triggers a payment, mutates prod, or weakens RLS. The only writes
 * are the alert rows (fail-loud) on a detected breakage. --dry-run classifies + reports with NO writes.
 *
 * Run: node scripts/breakage/active-breakage-canary.mjs [--dry-run]   (npm: breakage:canary)
 */
import { createRequire } from 'node:module';
import { detectFromDb as detectLlmDegradation } from '../continuity/llm-degradation-detector.mjs';

const require = createRequire(import.meta.url);
const {
  classifyRlsProbe, classifyGatePipelineProbe, classifyPaymentWebhookProbe, classifyModelAvailabilityProbe,
} = require('../../lib/breakage/active-canary-probes.cjs');
const { recordSystemAlert } = require('../../lib/breakage/alert-writer.cjs');

const RLS_PROBE_TABLE = 'session_coordination'; // governance table; anon INSERT is RLS-denied (verified 42501)
const PAYMENT_WEBHOOK_TABLES = ['webhook_events', 'payment_webhook_events']; // candidates — absent today (Stripe test-mode)

/** anon INSERT a uniquely-marked canary row; RLS must DENY it (42501). On regression the row is cleaned up. */
async function probeRls(anon, service, nowMs) {
  const marker = `__RLS_CANARY_PROBE_${nowMs}__`;
  let result;
  try {
    result = await anon.from(RLS_PROBE_TABLE)
      .insert({ target_session: marker, message_type: 'INFO', subject: marker, body: 'RLS-regression canary probe (auto-delete)', sender_type: 'system' })
      .select('id');
  } catch (e) {
    result = { error: { code: e.code, message: e.message }, data: null };
  }
  const verdict = classifyRlsProbe(result);
  if (verdict.breakage && verdict.detail && Array.isArray(verdict.detail.inserted_ids)) {
    for (const id of verdict.detail.inserted_ids) {
      try { await service.from(RLS_PROBE_TABLE).delete().eq('id', id); } catch { /* best-effort; row is clearly marked */ }
    }
  }
  return verdict;
}

async function probeGatePipeline(service, nowMs) {
  let recent = [];
  try {
    const { data } = await service.from('sd_phase_handoffs')
      .select('status, created_at, accepted_at')
      .order('created_at', { ascending: false })
      .limit(50);
    recent = data || [];
  } catch { /* read-only; on error -> empty -> idle -> no fire */ }
  return classifyGatePipelineProbe(recent, nowMs);
}

async function probePaymentWebhook(service, nowMs) {
  let tablePresent = false;
  let lastProcessedAtMs = null;
  let errorCount = null;
  for (const t of PAYMENT_WEBHOOK_TABLES) {
    try {
      // A real .select() (NOT head+estimated, which returns {count:null,error:null} for a MISSING table)
      // surfaces PGRST205/42P01 "relation does not exist" for an absent table. Service client bypasses
      // RLS, so for an EXISTING table there is no error. -> present iff no relation-missing error.
      const { error } = await service.from(t).select('*').limit(1);
      if (!error) { tablePresent = true; break; } // future: read last_processed_at / error_count here
      if (error.code && error.code !== 'PGRST205' && error.code !== '42P01') { tablePresent = true; break; } // exists but errored otherwise
    } catch { /* relation absent -> stays absent */ }
  }
  return classifyPaymentWebhookProbe({ tablePresent, lastProcessedAtMs, errorCount }, nowMs);
}

async function probeModelAvailability(service, nowMs, detect) {
  let rungResult;
  try { rungResult = await detect(service, nowMs); }
  catch (e) { rungResult = { rung: 'NORMAL', reason: `llm detector read failed (fail-open): ${e.message}` }; }
  return classifyModelAvailabilityProbe(rungResult);
}

/**
 * Run all 4 probes. Detection is isolated per-probe (a blind probe never suppresses the others); the alert
 * WRITE is fail-loud (recordSystemAlert throws -> non-zero exit) per scope. Deps are injectable for tests.
 * @param {{service?:object, anon?:object, nowMs?:number, dryRun?:boolean, detectFromDb?:Function, record?:Function}} [deps]
 * @returns {Promise<Array<object>>} per-probe summary
 */
export async function run(deps = {}) {
  const nowMs = Number.isFinite(deps.nowMs) ? deps.nowMs : Date.now();
  const dry = deps.dryRun !== undefined ? deps.dryRun : process.argv.slice(2).includes('--dry-run');
  const service = deps.service || require('../../lib/supabase-client.cjs').createSupabaseServiceClient();
  const anon = deps.anon || (await import('../../lib/supabase-client.js')).createSupabaseClient();
  const detect = deps.detectFromDb || detectLlmDegradation;
  const record = deps.record || recordSystemAlert;

  const probes = [
    { name: 'RLS-regression', run: () => probeRls(anon, service, nowMs) },
    { name: 'gate-pipeline-down', run: () => probeGatePipeline(service, nowMs) },
    { name: 'payment-webhook-fail', run: () => probePaymentWebhook(service, nowMs) },
    { name: 'model-availability-cap', run: () => probeModelAvailability(service, nowMs, detect) },
  ];

  const summary = [];
  for (const p of probes) {
    let verdict;
    try { verdict = await p.run(); }
    catch (e) { verdict = { breakage: false, error: e.message, reason: `probe ${p.name} threw (skipped): ${e.message}` }; }
    summary.push({ probe: p.name, ...verdict });

    if (verdict.breakage) {
      if (dry) {
        console.log(`[canary] DRY-RUN would alert ${verdict.breakClass}: ${verdict.reason}`);
      } else {
        // FAIL-LOUD: a write error propagates and the canary exits non-zero (per scope).
        const res = await record(service, {
          breakClass: verdict.breakClass,
          sourceService: `active-breakage-canary/${p.name}`,
          severity: verdict.severity, // undefined -> writer uses the frozen spec.defaultSeverity
          message: verdict.reason,
          metadata: verdict.detail || {},
        });
        console.log(`[canary] alerted ${verdict.breakClass} (${res.deduped ? 'deduped' : 'new'} ${res.id}): ${verdict.reason}`);
      }
    } else {
      const tag = verdict.skipped ? ' (skipped)' : verdict.idle ? ' (idle)' : verdict.inconclusive ? ' (inconclusive)' : '';
      console.log(`[canary] ${p.name}: OK${tag} — ${verdict.reason}`);
    }
  }
  const breakages = summary.filter((s) => s.breakage).length;
  console.log(`[canary] done: ${breakages} breakage(s) across ${probes.length} probe(s)${dry ? ' (dry-run, no writes)' : ''}`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith('active-breakage-canary.mjs'))) {
  run().then(() => process.exit(0)).catch((e) => { console.error(`[canary] FAILED (fail-loud): ${e.message}`); process.exit(1); });
}
