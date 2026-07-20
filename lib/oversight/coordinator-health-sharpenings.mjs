/**
 * coordinator-health-sharpenings.mjs — the 5-sharpening DELTA on the completed
 * ADAM-COORDINATOR-HEALTH-001 base (SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001,
 * Solomon cold-review, chairman-requested).
 *
 * The base's 3 KPIs are INPUT-side (utilization / plan-adherence / integrity) —
 * they can read green while claims never ship. This module adds the OUTCOME
 * axis (S1 KPI-0), the six alarm failure classes (S2), and the dispatch
 * reason-code band (S3). Pure derivations are exported separately from their
 * DB fetchers so every alarm is provable on synthetic triggers (AC-2/TS-*).
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — the outcome-flow DB fetcher
// ITERATES its reads (cohort conversion/latency, per-cohort handoffs) over growing tables;
// a silent PostgREST 1000-row cap would understate conversion and hide rework. Paginate.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

// ── Named, exported constants: thresholds are reviewable diffs, never inline
// magic (the WAVE_LINKAGE lesson — a gauge is only trustworthy if changing its
// denominator/threshold is a visible change). ─────────────────────────────────
export const OUTCOME_WINDOW_DAYS = 7;
export const CONVERSION_FLOOR = 0.2;        // below this with a real cohort => CONVERSION_COLLAPSE
export const MIN_COHORT_FOR_ALARM = 3;      // tiny cohorts never alarm (insufficient-n discipline)
export const LATENCY_CEILING_MS = 7 * 24 * 60 * 60 * 1000; // median claim->final above 7d => LATENCY_BLOWOUT
export const REWORK_CEILING = 0.3;          // rejected/failed handoff share above this => LATENCY_BLOWOUT (rework arm)
export const STUCK_HOURS = 24;              // unclaimed in-flight SD older than this needs a hold reason
export const FALSE_COMPLETION_SAMPLE = 5;   // completed SDs sampled per probe for merge-vs-main verification

// S3: DISTRIBUTION-IN-A-BAND, not stamp coverage. 100%-roadmap-stamped is the
// WRONG target (Solomon: live work is legitimately feedback/QF/incident-sourced;
// 0/10 stamped at review time proved it). Generous default: no category may
// monopolize dispatch, and no minimum roadmap share is imposed.
export const REASON_BAND = Object.freeze({
  chairman_directed: [0, 0.85],
  feedback: [0, 0.85],
  incident: [0, 0.85],
  now_wave_remainder: [0, 1],
  other: [0, 0.6],
});

export const FAILURE_CLASSES = Object.freeze([
  'FALSE_COMPLETION',
  'STUCK_WITHOUT_HOLD_REASON',
  'IDLE_WITH_BACKLOG',
  'INTEGRITY_DIVERGENCE',
  'CONVERSION_COLLAPSE',
  'LATENCY_BLOWOUT',
]);

const HOLD_KEYS = ['requires_human_action', 'needs_coordinator_review', 'not_before', 'lead_blocker', 'exec_boundary_hold', 'release_request'];

function firstClaimAt(row) {
  const h = row?.metadata?.claim_history;
  const at = Array.isArray(h) && h[0] && h[0].claimed_at;
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Pure: the first-claim-in-window cohort (shared by KPI-0 and the reason band). */
export function selectCohort(sdRows, nowMs = Date.now(), windowDays = OUTCOME_WINDOW_DAYS) {
  const windowStart = nowMs - windowDays * 24 * 60 * 60 * 1000;
  return (sdRows || []).filter((r) => {
    const t = firstClaimAt(r);
    return t !== null && t >= windowStart && t <= nowMs;
  });
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * S1 KPI-0 pure derivation. Cohort = SDs whose FIRST claim falls in the window
 * (first-entry rule: later re-claims are churn, captured by the rework arm, not
 * new cohort entries). Empty cohort => null-shaped (never a fake 0%).
 */
export function deriveOutcomeFlow(sdRows, handoffRows, nowMs = Date.now(), windowDays = OUTCOME_WINDOW_DAYS) {
  const windowStart = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const cohort = (sdRows || []).filter((r) => {
    const t = firstClaimAt(r);
    return t !== null && t >= windowStart && t <= nowMs;
  });
  if (!cohort.length) {
    return { status: 'no_cohort', window_days: windowDays, cohort_size: 0, conversion: null, median_latency_ms: null, rework_rate: null };
  }
  const completed = cohort.filter((r) => r.status === 'completed');
  const latencies = completed
    .map((r) => {
      const done = r.completion_date ? Date.parse(r.completion_date) : NaN;
      const start = firstClaimAt(r);
      return Number.isFinite(done) && start !== null ? done - start : null;
    })
    .filter((v) => v !== null && v >= 0);
  const cohortIds = new Set(cohort.map((r) => r.id));
  const cohortHandoffs = (handoffRows || []).filter((h) => cohortIds.has(h.sd_id));
  const rejected = cohortHandoffs.filter((h) => /reject|fail/i.test(h.status || '')).length;
  return {
    status: 'measured',
    window_days: windowDays,
    cohort_size: cohort.length,
    conversion: completed.length / cohort.length,
    median_latency_ms: median(latencies),
    rework_rate: cohortHandoffs.length ? rejected / cohortHandoffs.length : 0,
  };
}

/** S1 DB fetcher: window cohort rows + their handoffs, then the pure derivation. */
export async function computeOutcomeFlow(supabase, { nowMs = Date.now(), windowDays = OUTCOME_WINDOW_DAYS } = {}) {
  const sinceIso = new Date(nowMs - (windowDays + 21) * 24 * 60 * 60 * 1000).toISOString();
  // FR-6 batch 8: strategic_directives_v2 grows past the PostgREST 1000-row cap; the dead
  // .limit(2000) never bounded it (server clamps to 1000). Paginate; fail-closed (original threw).
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, completion_date, metadata, created_at')
      .gte('created_at', sinceIso)
      .order('id', { ascending: true })); // stable page boundaries (FR-6)
  } catch (e) {
    throw new Error(`outcome-flow: SD query failed: ${e.message}`);
  }
  // Fetch handoffs for the COHORT only (first claim in window), chunked — a
  // full-window .in() list overflows the PostgREST URL and 400s (live-verified).
  const windowStart = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const cohortIds = rows
    .filter((r) => { const t = firstClaimAt(r); return t !== null && t >= windowStart && t <= nowMs; })
    .map((r) => r.id);
  const handoffs = [];
  for (let i = 0; i < cohortIds.length; i += 100) {
    const chunk = cohortIds.slice(i, i + 100);
    // FR-6 batch 8: 100 cohort SDs collectively carry many phase-handoff rows (multiple
    // phases + retries each), so the .in()-chunk does NOT bound the row count and the dead
    // .limit(10000) never did (server clamps to 1000). Paginate each chunk; fail-closed.
    let hs;
    try {
      hs = await fetchAllPaginated(() => supabase
        .from('sd_phase_handoffs').select('sd_id, status').in('sd_id', chunk)
        .order('id', { ascending: true })); // stable page boundaries (FR-6)
    } catch (e) {
      throw new Error(`outcome-flow: handoff query failed: ${e.message}`);
    }
    handoffs.push(...hs);
  }
  return deriveOutcomeFlow(rows, handoffs, nowMs, windowDays);
}

/** S3 pure: classify one SD row's dispatch reason-code. */
export function classifyDispatchReason(row) {
  const key = row?.sd_key || '';
  const md = row?.metadata || {};
  // QF-20260719-365: the coordinator now stamps metadata.dispatch_reason_band at RANK time
  // (coordinator-backlog-rank.mjs deriveReasonBand), so worker self-claims inherit it. The
  // stamp is AUTHORITATIVE when present; the heuristics below remain the fallback for
  // pre-stamp rows (coverage read 3.4% dishonestly because ~95% of claims are self-claims
  // with no per-claim dispatch row — nothing for the heuristics to find).
  const stampMap = {
    'chairman-directed': 'chairman_directed',
    feedback: 'feedback',
    incident: 'incident',
    'now-wave-remainder': 'now_wave_remainder',
  };
  const stamped = stampMap[String(md.dispatch_reason_band || '')];
  if (stamped) return stamped;
  if (md.chairman_directed === true || md.directed_assignment === true || /chairman/i.test(String(md.sourced_by || ''))) return 'chairman_directed';
  if (/^SD-FDBK-/.test(key) || String(md.source || '').includes('feedback')) return 'feedback';
  if (/-FIX-|^QF-/.test(key) || /remediation|incident/i.test(String(md.source || ''))) return 'incident';
  // Roadmap/plan provenance in the wild (live-sampled markers): plan_key /
  // roadmap ids, source in {plan, roadmap_item}, and the lifecycle-sd-bridge
  // (Stage-17/18 sprint generation = venture roadmap work).
  if (md.roadmap_item_id || md.wave_id || md.promoted_from_roadmap || md.plan_key
    || ['plan', 'roadmap_item'].includes(String(md.source || ''))
    || String(md.created_via || md.sourced_by || '') === 'lifecycle-sd-bridge') return 'now_wave_remainder';
  return 'other';
}

/** S3 pure: shares per reason-code over a cohort. */
export function deriveDispatchReasons(sdRows) {
  const counts = { chairman_directed: 0, feedback: 0, incident: 0, now_wave_remainder: 0, other: 0 };
  // QF-20260719-365: honest-coverage accounting — how many rows carry the authoritative
  // rank-time stamp, partitioned into coordinator-direct dispatches (directed_assignment
  // marker) vs worker self-claims (the ~95% majority the old coverage could not see).
  let stamped = 0, directDispatch = 0, selfClaim = 0;
  for (const r of sdRows || []) {
    counts[classifyDispatchReason(r)]++;
    if (r?.metadata?.dispatch_reason_band) {
      stamped++;
      if (r.metadata.directed_assignment === true) directDispatch++;
      else selfClaim++;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const distribution = {};
  for (const [k, v] of Object.entries(counts)) distribution[k] = total ? v / total : 0;
  return {
    total, counts, distribution,
    stamped, stamped_coverage: total ? stamped / total : 0,
    partition: { direct_dispatch: directDispatch, self_claim: selfClaim },
  };
}

/** S3 pure: band check. Alarms only with a real cohort (insufficient-n never alarms). */
export function evaluateReasonBand(reasons, band = REASON_BAND, minCohort = MIN_COHORT_FOR_ALARM) {
  if (!reasons || reasons.total < minCohort) return { band_ok: true, insufficient_n: true, violations: [] };
  const violations = Object.entries(band)
    .filter(([k, [lo, hi]]) => {
      const share = reasons.distribution[k] ?? 0;
      return share < lo || share > hi;
    })
    .map(([k, [lo, hi]]) => ({ category: k, share: reasons.distribution[k] ?? 0, band: [lo, hi] }));
  return { band_ok: violations.length === 0, insufficient_n: false, violations };
}

/** S2 pure: does an in-flight, unclaimed, stale SD row lack ANY hold provenance? */
export function lacksHoldReason(row, nowMs = Date.now(), stuckHours = STUCK_HOURS) {
  if (row?.claiming_session_id) return false;
  // Orchestrator PARENTS are in_progress/unclaimed BY DESIGN while children run
  // (parent lifecycle contract) — never the stuck class (live-verified false positive).
  if (row?.sd_type === 'orchestrator') return false;
  if (!['in_progress', 'pending_approval', 'active'].includes(row?.status)) return false;
  const updated = Date.parse(row?.updated_at || '');
  if (!Number.isFinite(updated) || nowMs - updated < stuckHours * 60 * 60 * 1000) return false;
  const md = row?.metadata || {};
  return !HOLD_KEYS.some((k) => md[k] !== undefined && md[k] !== null && md[k] !== false);
}

/** S2 DB fetcher for the STUCK_WITHOUT_HOLD_REASON class (the ApexNiche class). */
export async function fetchStuckWithoutHold(supabase, { nowMs = Date.now() } = {}) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, updated_at, claiming_session_id, metadata')
    .in('status', ['in_progress', 'pending_approval', 'active'])
    .is('claiming_session_id', null)
    .limit(500);
  if (error) throw new Error(`stuck-without-hold: query failed: ${error.message}`);
  return (data || []).filter((r) => lacksHoldReason(r, nowMs));
}

/**
 * S2 FALSE_COMPLETION sampler: a DB-completed SD must leave a trace on
 * origin/main (a commit mentioning its key, or merged-PR evidence in metadata).
 * gitGrep is INJECTED ((sdKey) => true|false|'unverifiable') so tests use
 * synthetic verdicts and the live impl can fail-soft to 'unverifiable' when git
 * or the remote is unavailable — 'unverifiable' is a distinct status, never a
 * silent pass (DB!=code is the whole class).
 */
export function sampleFalseCompletions(completedRows, gitGrep) {
  const samples = [];
  for (const r of completedRows || []) {
    const md = r?.metadata || {};
    const prEvidence = Boolean(md.pr_url || md.merged_pr || md.completed_pr);
    // Cross-repo SDs leave their trace on the VENTURE repo's main, which this
    // probe cannot see — 'unverifiable', never a false-completion verdict
    // (live-verified false positive on ApexNiche doc SDs). Cross-repo
    // verification is a named follow-up.
    const target = r?.target_application || md.target_application;
    const crossRepo = typeof target === 'string' && target !== '' && target !== 'EHG_Engineer';
    const verdict = prEvidence ? true : crossRepo ? 'unverifiable' : gitGrep(r.sd_key);
    samples.push({
      sd_key: r.sd_key,
      verified: verdict === true,
      unverifiable: verdict === 'unverifiable',
    });
  }
  const falseCompletions = samples.filter((s) => !s.verified && !s.unverifiable);
  return { samples, false_completions: falseCompletions.map((s) => s.sd_key) };
}

/**
 * S2 pure: the six alarm classes, each independently derivable and synthetic-
 * triggerable. Base signals (idle-with-backlog, integrity) are REUSED from the
 * base probe's outputs — never re-derived (one gauge per signal).
 */
export function classifyFailureClasses({ outcomeFlow, utilization, integrity, stuckRows, falseCompletionSample }) {
  const of = outcomeFlow || {};
  const measured = of.status === 'measured' && of.cohort_size >= MIN_COHORT_FOR_ALARM;
  const classes = [
    {
      cls: 'FALSE_COMPLETION',
      firing: Boolean(falseCompletionSample && falseCompletionSample.false_completions.length),
      detail: falseCompletionSample ? `unverified-on-main: ${falseCompletionSample.false_completions.join(', ') || 'none'}` : 'no sample',
    },
    {
      cls: 'STUCK_WITHOUT_HOLD_REASON',
      firing: Boolean(stuckRows && stuckRows.length),
      detail: stuckRows && stuckRows.length ? `fence-less parked: ${stuckRows.map((r) => r.sd_key).join(', ')}` : 'none',
    },
    {
      cls: 'IDLE_WITH_BACKLOG',
      firing: Boolean(utilization && utilization.idle > 0 && utilization.dispatchable_backlog_size > 0),
      detail: utilization ? `idle=${utilization.idle}, backlog=${utilization.dispatchable_backlog_size}` : 'no reading',
    },
    {
      cls: 'INTEGRITY_DIVERGENCE',
      firing: Boolean(integrity && integrity.integrity_ok === false),
      detail: integrity ? (integrity.divergent_fields || []).join(', ') || 'ok' : 'no reading',
    },
    {
      cls: 'CONVERSION_COLLAPSE',
      firing: measured && of.conversion !== null && of.conversion < CONVERSION_FLOOR,
      detail: measured ? `conversion=${(of.conversion * 100).toFixed(1)}% over cohort ${of.cohort_size}` : 'insufficient cohort',
    },
    {
      cls: 'LATENCY_BLOWOUT',
      firing: measured && ((of.median_latency_ms !== null && of.median_latency_ms > LATENCY_CEILING_MS) || of.rework_rate > REWORK_CEILING),
      detail: measured ? `median_latency=${of.median_latency_ms}ms, rework=${(of.rework_rate * 100).toFixed(1)}%` : 'insufficient cohort',
    },
  ];
  return classes;
}
