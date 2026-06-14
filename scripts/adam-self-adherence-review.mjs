#!/usr/bin/env node
/**
 * Adam recurring self-adherence review — the remediation half of the self-improving governance loop.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (Adam-autonomy child E), FR-3.
 *
 * Flow (one audit run):
 *   resolveFacts() --(best-effort, fail-loud)--> runAdherenceProbes() --> ledger each verdict
 *   --> if drift, SOURCE a propose-only remediation (a feedback flag for the coordinator) and
 *       stamp remediation_ref on the failed ledger rows.
 *
 * CONST-002: this NEVER builds/authors a fix. Remediation is propose-only — it writes a single
 * feedback flag (the coordinator/Adam triages it into a gap-closing SD). There is no build/PR/
 * handoff/file-write path here.
 *
 * Resolvers are v1 BEST-EFFORT: a resolver that cannot confidently measure a duty returns null,
 * which the (fail-loud) probes turn into verdict='unknown' — never a silent pass. Sharpening the
 * resolvers is a follow-up; 'unknown' is the honest answer until then.
 *
 *   node scripts/adam-self-adherence-review.mjs            # real run (ledger + propose-only remediation)
 *   node scripts/adam-self-adherence-review.mjs --dry-run  # probe + report, NO DB writes
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { runAdherenceProbes, hasDrift } from '../lib/adam/adherence-probes.js';

const WINDOW_DAYS = 1;
const REMEDIATION_CATEGORY = 'adam_adherence_drift';

/** ISO timestamp for `windowDays` ago. */
function windowStart(windowDays = WINDOW_DAYS, nowMs = Date.now()) {
  return new Date(nowMs - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolve the facts each probe needs. BEST-EFFORT + FAIL-LOUD: any query error / uncertainty
 * returns null for that fact, so the probe yields 'unknown' (never a silent pass). No fabrication.
 */
export async function resolveFacts(supabase, { windowDays = WINDOW_DAYS, nowMs = Date.now() } = {}) {
  const since = windowStart(windowDays, nowMs);
  const facts = {
    windowDays,
    sourcedInWindow: null,
    visionGaugeReadInWindow: null,
    recurrencesInWindow: null,
    signalsInWindow: null,
    adamAuthoredBuildsInWindow: null,
  };

  // P3 friction-signaling: Adam-originated coordination messages within the window. session_coordination
  // attributes the sender via sender_type (verified: there is NO from_role column). This is the one
  // duty we can confidently measure today.
  try {
    const { count, error } = await supabase
      .from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('sender_type', 'adam');
    if (!error && Number.isFinite(count)) facts.signalsInWindow = count;
  } catch { /* leave null -> unknown */ }

  // sourcedInWindow, visionGaugeReadInWindow, recurrencesInWindow, adamAuthoredBuildsInWindow are NOT
  // yet confidently measurable from a generic query (feedback.provenance_source is unpopulated; there
  // is no reliable adam-sourced-SD attribution column; vision-gauge reads + adam-authored builds have
  // no durable signal). They are left null => the (fail-loud) probes return 'unknown' — the HONEST
  // answer until the resolvers are sharpened (completion-flag follow-up). An unmeasured duty is NEVER
  // reported as 'pass'.

  return facts;
}

/** Insert one ledger row for a probe verdict. Returns the row id (or null, fail-soft). */
export async function recordAdherence(supabase, runId, bar, remediationRef = null) {
  try {
    const { data, error } = await supabase
      .from('adam_adherence_ledger')
      .insert({
        run_id: runId,
        probe: bar.probe,
        duty: bar.duty,
        verdict: bar.verdict,
        detail: bar.detail,
        remediation_ref: remediationRef,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn(`[adam-self-adherence] ledger write failed (non-blocking): ${err.message}`);
    return null;
  }
}

/**
 * PROPOSE-ONLY remediation (CONST-002): source a single feedback flag for the coordinator. This
 * NEVER builds/authors/PRs — it only writes a sourcing record. Returns the feedback id (remediation_ref).
 */
export async function sourceRemediation(supabase, runId, failedBars) {
  const duties = failedBars.map((b) => b.probe).join(', ');
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      type: 'issue',
      source_application: 'EHG_Engineer',
      source_type: 'manual_capture',
      category: REMEDIATION_CATEGORY,
      status: 'new',
      severity: failedBars.some((b) => b.probe === 'propose_only') ? 'high' : 'medium',
      title: `Adam adherence drift: ${duties}`,
      description: `Adam self-adherence audit run ${runId} detected drift on: ${failedBars.map((b) => `${b.probe} — ${b.detail}`).join(' | ')}. PROPOSE-ONLY: triage into a gap-closing SD (Adam does not build — CONST-002).`,
      metadata: { run_id: runId, failed_probes: failedBars.map((b) => b.probe), sd: 'SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Run one full self-adherence audit. Returns { runId, facts, bars, remediationRef }. */
export async function runSelfAdherenceReview(supabase, { dryRun = false, runId = crypto.randomUUID(), windowDays = WINDOW_DAYS } = {}) {
  const facts = await resolveFacts(supabase, { windowDays });
  const bars = runAdherenceProbes(facts);
  const drift = hasDrift(bars);

  if (dryRun) return { runId, facts, bars, remediationRef: null, dryRun: true };

  // Propose-only remediation FIRST (so failed rows can carry remediation_ref).
  let remediationRef = null;
  if (drift) remediationRef = await sourceRemediation(supabase, runId, bars.filter((b) => b.verdict === 'fail'));

  for (const bar of bars) {
    await recordAdherence(supabase, runId, bar, bar.verdict === 'fail' ? remediationRef : null);
  }
  return { runId, facts, bars, remediationRef, dryRun: false };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = dryRun ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = crypto.randomUUID();
  if (dryRun) {
    const facts = { windowDays: WINDOW_DAYS, sourcedInWindow: null, visionGaugeReadInWindow: null, recurrencesInWindow: null, signalsInWindow: null, adamAuthoredBuildsInWindow: null };
    const bars = runAdherenceProbes(facts);
    console.log(`[dry-run] run ${runId}:`);
    for (const b of bars) console.log(`  ${b.verdict.toUpperCase().padEnd(7)} ${b.probe} — ${b.detail}`);
    console.log(`[dry-run] drift=${hasDrift(bars)} (no DB writes, no remediation)`);
    return;
  }
  const result = await runSelfAdherenceReview(supabase, { runId });
  console.log(`run ${result.runId}: ${result.bars.map((b) => `${b.probe}=${b.verdict}`).join(' ')}`);
  console.log(result.remediationRef ? `drift -> propose-only remediation feedback ${result.remediationRef}` : 'no drift -> no remediation');
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) main().catch((e) => { console.error('self-adherence review failed:', e.message); process.exit(1); });
