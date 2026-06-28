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
import { runAdherenceProbes, hasDrift, parseFingerprintsTail } from '../lib/adam/adherence-probes.js';

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
    adamChairmanDecisionQuestionsInWindow: null,
  };

  // P3 friction-signaling (signals side): Adam-originated coordination messages within the window.
  // session_coordination attributes the sender via sender_type (verified: there is NO from_role
  // column). HONEST: only a query error leaves this null -> unknown; a real 0 is a real 0.
  try {
    const { count, error } = await supabase
      .from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('sender_type', 'adam');
    if (error) throw error; // a query error must NOT masquerade as a real "0 signals"
    if (Number.isFinite(count)) facts.signalsInWindow = count;
  } catch { /* leave null -> unknown */ }

  // FR-1b — sourcing cadence: count SDs Adam durably attributed within the window. The canonical
  // marker is metadata.sourced_by='adam' (stamped at sourcing time by leo-create-sd.js FR-1a, and
  // the existing live convention). HONEST: a real 0 stays 0 (probe FAIL — cadence stalled); ONLY a
  // thrown query error leaves the fact null -> unknown. No retroactive fabrication on historical SDs.
  try {
    const { count, error } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('metadata->>sourced_by', 'adam');
    if (error) throw error; // a query error must NOT masquerade as a real "0 sourced"
    if (Number.isFinite(count)) facts.sourcedInWindow = count;
  } catch { /* leave null -> unknown */ }

  // FR-2 — friction signaling (recurrence side): windowed recurrence count from the durable
  // recurrence source issue_patterns. We DO NOT use the lifetime occurrence_count (that overcounts
  // across the whole history); instead we count patterns whose recurrence ACTIVITY falls in the
  // window (updated_at >= since) and that are still LIVE-recurring.
  //
  // Caveat (documented): updated_at is a RECENCY proxy, not a true "recurred-in-window" event — a
  // pattern row touched for an unrelated reason within the window will be included. It is the best
  // durable signal available; sharpening to a per-occurrence event store is a follow-up.
  //
  // Live-recurring trend allow-set (verified against live issue_patterns.trend values): stable,
  // increasing, persistent, recurring, new. EXCLUDED wound-down trends: decreasing, resolved,
  // improving (not a live recurrence to signal). The compare is CASE-INSENSITIVE so a stray
  // 'STABLE' (present in live data) is not silently dropped. We fetch the windowed trend column and
  // filter in JS rather than .in() because PostgREST .in() is case-sensitive. HONEST: a real 0 stays
  // 0 (probe PASS — nothing to signal); ONLY a query error leaves the fact null -> unknown.
  const LIVE_RECURRING_TRENDS = new Set(['stable', 'increasing', 'persistent', 'recurring', 'new']);
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('trend')
      .gte('updated_at', since);
    if (error) throw error; // a query error must NOT masquerade as a real "0 recurrences"
    if (Array.isArray(data)) {
      facts.recurrencesInWindow = data.filter(
        (r) => r && typeof r.trend === 'string' && LIVE_RECURRING_TRENDS.has(r.trend.trim().toLowerCase()),
      ).length;
    }
  } catch { /* leave null -> unknown */ }

  // FR-3 — propose-only (CONST-002): count build/PR/handoff/file-write actions AUTHORED by Adam
  // within the window. HONEST-UNMEASURABLE by design: this fact stays null -> 'unknown'.
  //
  // Why we do NOT attribute via session lineage (the prior approach, which fabricated a FAIL):
  //   - session_coordination.sender_session is a Claude session UUID, NOT a role tag. Sessions are
  //     MIXED-ROLE — one session can speak as 'adam' (sender_type='adam') AND, in the same session,
  //     run LEO worker/PLAN/EXEC phases that legitimately write sub_agent_execution_results. Counting
  //     every build of any session that EVER sent an 'adam' message attributes legitimate LEO builds
  //     to Adam -> a fabricated CONST-002 FAIL -> a false high-severity remediation flag.
  //   - There is NO reliable PER-BUILD / PER-ROW Adam-author marker on sub_agent_execution_results.
  //     Verified against live data (14d, 4,464 rows): metadata has NO 'sender_type' key (0 rows) and
  //     NO 'actor' key (0 rows); 'sender_type'='adam'=0, 'actor'='adam'=0. The build rows carry
  //     machinery keys (findings, routing, phase, session_id, repo_path, ...), none of which is a
  //     per-build author identity. Adam is propose-only, so builds are simply never adam-tagged.
  //
  // The HONEST answer is therefore "could not measure": we leave adamAuthoredBuildsInWindow = null,
  // which the probe turns into verdict='unknown' (never a fabricated 0/PASS and never a fabricated
  // FAIL). propose_only honestly degrades to 'unknown' until a build-actor-tagging scheme exists
  // (e.g. a per-row metadata->>'actor'='adam' stamp at the authoring seam). The SD target is 3-of-4
  // measurable; the three measured dims are sourcing-cadence, friction-signaling, and vision-going-
  // forward. NO query is issued here — there is no reliable source to query.
  // facts.adamAuthoredBuildsInWindow stays null -> probe 'unknown' (honest).

  // FR-4 — vision monitoring: did Adam read the vision gauge within the window? The durable read
  // marker is an audit_log row event_type='vision_gauge_read' written when Adam runs
  // scripts/adam-exec-summary.mjs (recordVisionGaugeRead below; existing store, no new table).
  // HONEST (highest-risk dim): if NO such event exists in the window — or the source is unavailable
  // (query error) — the fact stays null -> unknown. It MUST NOT default to false: an absent durable
  // signal is "could not confirm", not "definitely not read". This dim may legitimately remain
  // 'unknown' (the SD target is 3-of-4 measurable).
  try {
    const { count, error } = await supabase
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('event_type', VISION_GAUGE_READ_EVENT)
      // FR-4 hardening: count ONLY Adam-authored gauge-read events. recordVisionGaugeRead (below)
      // always stamps metadata.sender_type='adam', so this filter is precise — a non-Adam writer of
      // the same event_type (should none ever exist) cannot satisfy Adam's monitoring duty.
      .eq('metadata->>sender_type', 'adam');
    if (error) throw error;
    // >=1 event -> measured TRUE. 0 events -> NOT measured-false: the marker is best-effort and may
    // simply be absent for this window, so we honestly degrade to null -> unknown (never false).
    if (Number.isFinite(count) && count >= 1) facts.visionGaugeReadInWindow = true;
  } catch { /* leave null -> unknown */ }

  // P7 decision-rubric (FR-1): the Adam->chairman decision-questions in the window. Adam's outward
  // advisory channel is session_coordination sender_type='adam', payload.kind='adam_advisory'
  // (verified live: 100% of Adam's coordination rows). The pure classifier (probeDecisionRubric)
  // gates each body on a decision-ASK, so harness/status syncs that carry no ask are never counted
  // as over-asks. HONEST: a real empty window is an honest [] (probe PASS — nothing to flag); ONLY a
  // thrown query error leaves the fact null -> 'unknown'. We read payload.body (the canonical Adam
  // message field) for each row.
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('payload, created_at')
      .gte('created_at', since)
      .eq('sender_type', 'adam')
      .eq('payload->>kind', 'adam_advisory');
    if (error) throw error; // a query error must NOT masquerade as a real "0 questions"
    if (Array.isArray(data)) {
      facts.adamChairmanDecisionQuestionsInWindow = data.map((r) => ({
        body: r && r.payload ? (r.payload.body ?? r.payload.message ?? r.payload.subject ?? '') : '',
        created_at: r ? r.created_at : null,
      }));
    }
  } catch { /* leave null -> unknown */ }

  // SD-LEO-INFRA-ADAM-DECISION-RUBRIC-PROBE-HYGIENE-001 (b): RESOLVED-EXCLUSION. Load the over-ask
  // fingerprints from PRIOR decision_rubric ledger rows that already carry a remediation_ref (an
  // over-ask that was surfaced + remediated). probeDecisionRubric excludes these so a resolved/historical
  // over-ask never re-fails — the verdict reflects only NEW, un-remediated over-asks. (a) report the
  // window basis so a fail is interpretable. Fail-soft: a query error leaves the set empty (no exclusion,
  // never a fabricated pass). Look back further than the corpus window so remediations stay honored.
  facts.windowDays = windowDays;
  facts.decisionRubricWindowBasis = `${windowDays}-day rolling window (cross-session)`;
  try {
    const ledgerLookback = windowStart(Math.max(windowDays, 30), nowMs);
    const { data: resolvedRows } = await supabase
      .from('adam_adherence_ledger')
      .select('detail, remediation_ref, created_at')
      .eq('probe', 'decision_rubric')
      .not('remediation_ref', 'is', null)
      .gte('created_at', ledgerLookback);
    const resolvedFps = new Set();
    for (const row of (resolvedRows || [])) {
      for (const fp of parseFingerprintsTail(row && row.detail)) resolvedFps.add(fp);
    }
    facts.resolvedOverAskFingerprints = [...resolvedFps];
  } catch {
    facts.resolvedOverAskFingerprints = []; // fail-soft: no exclusion, but never a fabricated pass
  }

  return facts;
}

/** Durable audit_log event_type recording that Adam read the vision build-% gauge (FR-4). */
const VISION_GAUGE_READ_EVENT = 'vision_gauge_read';

/**
 * FR-4 — write a durable 'vision gauge was read' marker to the EXISTING audit_log store (no new
 * chairman-gated table). Called by scripts/adam-exec-summary.mjs after it computes the gauge.
 * Fail-soft: a write failure NEVER blocks the exec-summary email — the resolver honestly degrades
 * to 'unknown' rather than reporting a false read. Returns the row id, or null on failure.
 * @param {object} supabase
 * @param {{ sessionId?: string|null, pct?: number|null }} [opts]
 */
export async function recordVisionGaugeRead(supabase, { sessionId = null, pct = null } = {}) {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .insert({
        event_type: VISION_GAUGE_READ_EVENT,
        entity_type: 'vision_gauge',
        entity_id: 'adam-exec-summary',
        created_by: sessionId || 'adam',
        severity: 'info',
        metadata: { sender_type: 'adam', session_id: sessionId || null, pct: Number.isFinite(pct) ? pct : null },
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn(`[adam-self-adherence] vision_gauge_read marker write failed (non-blocking): ${err.message}`);
    return null;
  }
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
    const facts = { windowDays: WINDOW_DAYS, sourcedInWindow: null, visionGaugeReadInWindow: null, recurrencesInWindow: null, signalsInWindow: null, adamAuthoredBuildsInWindow: null, adamChairmanDecisionQuestionsInWindow: null };
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
