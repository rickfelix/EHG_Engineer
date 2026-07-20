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
import { runAdherenceProbes, hasDrift, parseFingerprintsTail, parseSnapshotTail } from '../lib/adam/adherence-probes.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: several facts below filter/process
// rows (not a plain exact-count) over growing tables (quick_fixes, issue_patterns,
// session_coordination, chairman_decisions, adam_adherence_ledger, strategic_directives_v2,
// feedback) with no bound — paginate so a filtered count/set is never silently truncated at
// the PostgREST cap (the exact live-incident shape this SD exists to close).
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

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
    adamMachineRaisedNoiseInWindow: null,
    pmBoardSnapshot: null,
    pmBoardPriorSnapshot: null,
    // SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 FR-1: the belt-starvation (D1) + dispatch-boundary
    // (D2) cardinal facts are now resolved in the retro audit from LIVE claim tables (below), so
    // those probes no longer degrade to 'unknown' here (the 297/297-unknown class).
    claimableBelt: null,
    idleWorkers: null,
    sourceableBacklogCount: null,
    advisoryBody: null,
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

  // FR-1b — sourcing cadence: count ALL gap-closing work Adam sources for the coordinator within
  // the window, unified across the two lanes it uses — SD drafts (metadata.sourced_by='adam',
  // stamped at SD-creation time) and quick_fixes (no metadata column exists on that table
  // to carry a per-row marker, so the whole lane counts). QF-20260703-537: the SD-only count was
  // blind to the quick_fixes lane, producing a false FAIL/drift remediation on days Adam sourced
  // only QFs. HONEST: a real 0 across both lanes stays 0 (probe FAIL); a thrown error on EITHER
  // query leaves the combined fact null -> unknown (never silently under-counts via the other lane).
  try {
    // FR-6 batch 9: the QF lane was .limit(1000) — dead weight at the exact live-incident cap
    // value AND a truncation risk (a >1000-QF window would silently undercount past-cap
    // fixture-filtered QFs). Paginate; keep the SD lane as an exact head-count (unfiltered).
    const [sdResult, qfRows] = await Promise.all([
      supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true })
        .gte('created_at', since).eq('metadata->>sourced_by', 'adam'),
      // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: fetch id+title (not a head-count) so
      // fixture-titled test QFs don't inflate the sourcing gauge.
      fetchAllPaginated(() => supabase.from('quick_fixes')
        .select('id, title')
        .gte('created_at', since)
        .order('id', { ascending: true })), // unique tiebreaker (FR-6)
    ]);
    if (sdResult.error) throw sdResult.error;
    const { isFixtureQf } = await import('../lib/governance/fixture-exclusion.mjs');
    if (Number.isFinite(sdResult.count)) {
      const qfCount = qfRows.filter((qf) => !isFixtureQf(qf)).length;
      facts.sourcedInWindow = sdResult.count + qfCount;
    }
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
    // FR-6 batch 9: issue_patterns is a growing table and this filters by trend content (not a
    // plain exact-count), so paginate rather than risk a silently-capped 1000-row page.
    const data = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('trend, id')
      .gte('updated_at', since)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    facts.recurrencesInWindow = data.filter(
      (r) => r && typeof r.trend === 'string' && LIVE_RECURRING_TRENDS.has(r.trend.trim().toLowerCase()),
    ).length;
  } catch { /* leave null -> unknown */ }

  // FR-1 (propose_only, CONST-002) — COUNTERFACTUAL-PRESENCE signal. Adam is propose-only: it NEVER
  // steps into the claim/build lane. Prior code left this null -> 'unknown' FOREVER (108/108 unknown)
  // arguing sub_agent_execution_results had no per-build Adam marker. That is true, but the SOUND
  // signal is not "find an Adam build row" — it is the ROLE-ATTRIBUTABLE claim census: count
  // claude_sessions carrying metadata.role='adam' that ALSO hold a non-null sd_key (an Adam-role
  // session that claimed an SD to build). This is exactly the mirror of solomon-self-assessment's
  // solomon_claim_count discipline signal (scripts/solomon-self-assessment-writer.cjs), keys on the
  // durable role tag (NOT mixed-role session lineage, which fabricated FAILs), and NEVER fabricates:
  // a real 0 is a real PASS (Adam stayed propose-only — falsifiable: it WOULD fail if an adam-role
  // session held a claim), a >0 is a real violation, and only a query error leaves the fact
  // null -> 'unknown'. Verified live 2026-07-19: 0 adam-role sessions hold an sd_key (PASS).
  try {
    const { count, error } = await supabase
      .from('claude_sessions')
      .select('session_id', { count: 'exact', head: true })
      .eq('metadata->>role', 'adam')
      .not('sd_key', 'is', null);
    if (error) throw error; // a query error must NOT masquerade as a real "0 build-claims"
    if (Number.isFinite(count)) facts.adamAuthoredBuildsInWindow = count;
  } catch { /* leave null -> unknown */ }

  // FR-4 / FR-1 — vision monitoring: did Adam read the vision gauge within the window? The durable
  // read marker is an audit_log row event_type='vision_gauge_read' written when Adam runs
  // scripts/adam-exec-summary.mjs (recordVisionGaugeRead below; existing store, no new table).
  // MEASURED, FALSIFIABLE (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 FR-1): the vision-read marker
  // is THE durable signal for this duty, so a SUCCESSFUL query with 0 events in the window means the
  // duty was not evidenced -> FALSE -> probe FAIL (monitoring lapsed). Prior code degraded absence to
  // null -> 'unknown', producing an unknown-forever gauge (66/108 unknown) that FR-1 forbids ("an
  // unknown-forever probe is worse than none"). ONLY a query ERROR (infra fault) now leaves the fact
  // null -> 'unknown' — a measured absence is a real, falsifiable FAIL, not a could-not-confirm.
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
    if (error) throw error; // a query error must NOT masquerade as a measured "0 reads"
    // >=1 event -> PASS (read). Successful 0 -> measured FALSE -> FAIL (lapsed). Error -> null/unknown.
    if (Number.isFinite(count)) facts.visionGaugeReadInWindow = count >= 1;
  } catch { /* leave null -> unknown (query error only) */ }

  // P7 decision-rubric (FR-1): the Adam->chairman decision-questions in the window. Adam's outward
  // advisory channel is session_coordination sender_type='adam', payload.kind='adam_advisory'
  // (verified live: 100% of Adam's coordination rows). The pure classifier (probeDecisionRubric)
  // gates each body on a decision-ASK, so harness/status syncs that carry no ask are never counted
  // as over-asks. HONEST: a real empty window is an honest [] (probe PASS — nothing to flag); ONLY a
  // thrown query error leaves the fact null -> 'unknown'. We read payload.body (the canonical Adam
  // message field) for each row.
  try {
    // FR-6 batch 9: session_coordination is a growing table with no cap here; paginate.
    const data = await fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .gte('created_at', since)
      .eq('sender_type', 'adam')
      .eq('payload->>kind', 'adam_advisory')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    facts.adamChairmanDecisionQuestionsInWindow = data.map((r) => ({
      body: r && r.payload ? (r.payload.body ?? r.payload.message ?? r.payload.subject ?? '') : '',
      created_at: r ? r.created_at : null,
    }));
  } catch { /* leave null -> unknown */ }

  // FR-1 (dispatch_boundary, D2) — resolve the advisory corpus body from the SAME in-window Adam
  // advisory set resolved just above (session_coordination sender_type='adam', kind='adam_advisory').
  // The pure probe scans for fleet-lifecycle/dispatch language; joining the window's advisory bodies
  // makes it a real-window check — FAIL if ANY advisory crossed into the coordinator's capacity lane,
  // PASS if none. Reuses the already-fetched corpus (no extra query). Null ONLY when that fetch itself
  // failed (advisory set unresolved) -> probe 'unknown'; an empty-but-resolved corpus is '' -> PASS.
  if (Array.isArray(facts.adamChairmanDecisionQuestionsInWindow)) {
    facts.advisoryBody = facts.adamChairmanDecisionQuestionsInWindow
      .map((q) => (q && q.body ? String(q.body) : ''))
      .join('\n');
  }

  // QF-20260704-748: the decision_rubric probe above only sees Adam's free-text advisory channel.
  // The stall detector (lib/adam/stall-alert.js) raises a SEPARATE, structured escalation channel --
  // chairman_decisions rows inserted via recordPendingDecision(raisedBy:'adam') -- that carries no
  // free-text body to classify. A row later cancelled without real chairman action IS itself the
  // over-ask signal (Adam auto-escalated something that resolved as noise). HONEST: only a thrown
  // query error leaves this null -> unknown; a real 0 is a real 0.
  try {
    // FR-6 batch 9: paginate — no bound on this chairman_decisions read.
    const data = await fetchAllPaginated(() => supabase
      .from('chairman_decisions')
      .select('id, summary, created_at')
      .gte('created_at', since)
      .eq('status', 'cancelled')
      .or('brief_data->>raised_by.eq.adam,brief_data->>recorded_via.eq.record-pending-decision')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    facts.adamMachineRaisedNoiseInWindow = data.map((r) => ({
      id: r.id, summary: r.summary, created_at: r.created_at,
    }));
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
    // FR-6 batch 9: adam_adherence_ledger accumulates every probe run with no pruning observed;
    // a >=30-day lookback with no cap is a truncation risk over time — paginate.
    const resolvedRows = await fetchAllPaginated(() => supabase
      .from('adam_adherence_ledger')
      .select('id, detail, remediation_ref, created_at')
      .eq('probe', 'decision_rubric')
      .not('remediation_ref', 'is', null)
      .gte('created_at', ledgerLookback)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    const resolvedFps = new Set();
    for (const row of resolvedRows) {
      for (const fp of parseFingerprintsTail(row && row.detail)) resolvedFps.add(fp);
    }
    facts.resolvedOverAskFingerprints = [...resolvedFps];
  } catch {
    facts.resolvedOverAskFingerprints = []; // fail-soft: no exclusion, but never a fabricated pass
  }

  // P8 pm-board (current snapshot): every currently-open (not done/cancelled) child-tier task in
  // Adam's PM board. tier='child' ONLY — parent.status is never auto-rolled-up anywhere in the
  // shipped ledger code, so a parent-tier read would false-fail on parents whose children all
  // finished without the parent's own status field being bumped. HONEST: a real empty board stays
  // an empty array (probe reads PASS); only a query error leaves this null -> unknown.
  try {
    const { data: openRows, error } = await supabase
      .from('adam_task_ledger')
      .select('id, status')
      .eq('tier', 'child')
      .not('status', 'in', '(done,cancelled)');
    if (error) throw error;
    facts.pmBoardSnapshot = (openRows || []).map((r) => ({ id: r.id, status: r.status }));
  } catch { /* leave null -> unknown */ }

  // P8 pm-board (prior snapshot): read back the CURRENT snapshot this probe recorded on its own
  // last run (mirrors decision_rubric's persisted-history pattern above) so the probe can diff
  // against it rather than trusting adam_task_ledger.updated_at, which is bumped by every
  // idempotent board-rehydrate upsert and would make a staleness threshold silently inert.
  try {
    const { data: lastRow, error } = await supabase
      .from('adam_adherence_ledger')
      .select('detail')
      .eq('probe', 'pm_board')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    facts.pmBoardPriorSnapshot = parseSnapshotTail(lastRow && lastRow.detail);
  } catch { /* leave null -> unknown */ }

  // FR-1 (belt_starvation, D1) — resolve the belt/idle census from the SAME live claim tables sd:next
  // and the sweep read. claimableBelt = GENUINELY-claimable SDs (unclaimed + the canonical
  // isClaimableSd predicate: non-orchestrator, all dependency blockers terminal) so a
  // dependency-blocked SD never inflates the belt; idleWorkers = live WORKER sessions (recent
  // heartbeat, active/idle, not a role-tagged non-worker) holding no SD claim — the claiming_session_id
  // definition mirrored from lib/fleet/tier-backlog.cjs. The probe FAILs only when belt==0 AND idle>0
  // AND backlog>0. HONEST: if EITHER census query errors, both facts stay null -> probe 'unknown'
  // (never a fabricated belt=0 FAIL). Point-in-time snapshot: a real-time gauge's "window" is now.
  try {
    const mod = await import('../lib/coordinator/claimable-work.cjs');
    const { isClaimableSd, dependencyKeys } = mod.default || mod;
    const liveCutoff = new Date(nowMs - 15 * 60 * 1000).toISOString();
    // FR-6 batch 9: the SD lane excludes only 4 terminal statuses on strategic_directives_v2 (a
    // growing table) — the classic "not bounded" shape — so paginate it. The session lane stays
    // as-is: a recent-heartbeat + active/idle filter pins it to the currently-live fleet, an
    // operationally small set regardless of claude_sessions' total historical size.
    const [sdRows, { data: sessRows, error: sErr }] = await Promise.all([
      fetchAllPaginated(() => supabase.from('strategic_directives_v2')
        .select('sd_key, sd_type, status, dependencies, claiming_session_id')
        .not('status', 'in', '(completed,cancelled,archived,deferred)')
        .order('sd_key', { ascending: true })), // unique tiebreaker (FR-6)
      supabase.from('claude_sessions')
        .select('session_id, metadata, sd_key, status, heartbeat_at')
        .in('status', ['active', 'idle'])
        .gte('heartbeat_at', liveCutoff),
    ]);
    if (sErr) throw sErr;
    const rows = sdRows;
    // Resolve dependency-blocker statuses so isClaimableSd can judge each SD (unknown keys => UNMET,
    // conservative). ONE .in() lookup over the distinct blocker keys (mirrors coordinator-audit).
    const depKeys = dependencyKeys(rows);
    const depStatus = {};
    if (depKeys.length) {
      const { data: depRows, error: depErr } = await supabase
        .from('strategic_directives_v2').select('sd_key, status').in('sd_key', depKeys);
      if (depErr) throw depErr;
      for (const d of (depRows || [])) depStatus[d.sd_key] = d.status;
    }
    facts.claimableBelt = rows.filter((r) => !r.claiming_session_id && isClaimableSd(r, depStatus)).length;
    const claimedSessionIds = new Set(rows.filter((r) => r.claiming_session_id).map((r) => r.claiming_session_id));
    const NON_WORKER = new Set(['adam', 'solomon', 'coordinator', 'chairman', 'eva']);
    const sess = Array.isArray(sessRows) ? sessRows : [];
    facts.idleWorkers = sess.filter((s) => {
      const role = String((s.metadata && s.metadata.role) || '').toLowerCase();
      return !NON_WORKER.has(role) && !claimedSessionIds.has(s.session_id);
    }).length;
  } catch { /* leave claimableBelt/idleWorkers null -> belt probe unknown */ }

  // FR-1 (belt_starvation, D1 third input) — sourceable backlog: genuine (auto-capture-excluded)
  // open harness_backlog feedback, via the canonical scripts/lib/sourceable-backlog.mjs filter (the
  // same the sweep's action-time check uses). HONEST: a real 0 is a real 0; only a query error leaves
  // the fact null -> belt probe 'unknown'.
  try {
    const { sourceableBacklog } = await import('./lib/sourceable-backlog.mjs');
    // FR-6 batch 9: feedback is a growing table; paginate rather than trust an implicit cap.
    const blRows = await fetchAllPaginated(() => supabase
      .from('feedback')
      .select('id, status, title, metadata')
      .eq('category', 'harness_backlog')
      .in('status', ['open', 'new', 'backlog'])
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    facts.sourceableBacklogCount = sourceableBacklog(blRows).length;
  } catch { /* leave sourceableBacklogCount null -> belt probe unknown */ }

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
    const facts = { windowDays: WINDOW_DAYS, sourcedInWindow: null, visionGaugeReadInWindow: null, recurrencesInWindow: null, signalsInWindow: null, adamAuthoredBuildsInWindow: null, adamChairmanDecisionQuestionsInWindow: null, pmBoardSnapshot: null, pmBoardPriorSnapshot: null };
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
