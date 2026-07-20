/**
 * Harness briefing — read-only signal scan over EHG_Engineer governance tables.
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 (signal scan) +
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-1: map signals -> KR-anchored candidates).
 *
 * Anchors to the O-GOV objectives/KRs. Sources: feedback(harness_backlog),
 * retrospectives, gate-tuning recommendations, pending EVA recommendations.
 * Empty tables are reported as "no signal", never as an error.
 *
 * CARDINAL SAFETY RULE (FR-1): a candidate is emitted ONLY when its harness
 * signal class resolves to a REAL key_results row (queried live, joined to an
 * O-GOV objective). A signal whose mapped objective has NO live KR is EXCLUDED —
 * never given a fabricated anchor. hasLiveAnchor() therefore passes legitimately.
 */
import { warnIfCapTruncated } from '../../db/fetch-all-paginated.mjs';

/**
 * Static class -> O-GOV objective-code mapping. Each harness signal class is
 * routed to the governance objective it actually concerns. The CONCRETE KR row
 * (and its live status) is resolved at runtime from key_results — never invented.
 *
 *   harness_backlog  -> O-GOV-1 (Foundation Cleanup & Consolidation) — backlog/cleanup debt
 *   gate_tuning      -> O-GOV-2 (Raise LEO Intelligence Integration Score) — gate/quality tuning
 *   eva_consultant   -> O-GOV-3 (Deploy Strategic Governance Stack) — governance-stack recs
 *
 * `class` is the candidate class key the preference model (FR-2) weights by.
 */
const SIGNAL_CLASS_TO_OBJECTIVE = Object.freeze({
  'harness-backlog': 'O-GOV-1',
  'gate-tuning': 'O-GOV-2',
  'eva-consultant': 'O-GOV-3',
});

/**
 * Pick the best live KR under an objective to anchor to: prefer the worst-status
 * (off_track > at_risk > on_track/pending > completed/achieved) so the candidate
 * legitimately reflects where the objective is hurting. Returns null when the
 * objective has no live KR (-> the signal is excluded, never faked).
 *
 * key_results.status domain observed live: on_track | pending | at_risk |
 * achieved. The rationale bar's scorer maps unknown statuses -> on_track (1.0).
 */
const STATUS_RANK = Object.freeze({
  off_track: 5,
  at_risk: 4,
  not_started: 3,
  pending: 3,
  on_track: 2,
  completed: 1,
  achieved: 1,
});

function pickAnchorKr(krRows) {
  if (!Array.isArray(krRows) || krRows.length === 0) return null;
  let best = null;
  let bestRank = -1;
  for (const kr of krRows) {
    const rank = STATUS_RANK[kr.status] ?? 2; // unknown -> on_track-ish
    if (rank > bestRank) {
      bestRank = rank;
      best = kr;
    }
  }
  return best;
}

/**
 * Normalize a key_results row + objective code into the objective_kr anchor shape
 * the rationale bar expects: { objective, kr, kr_status, off_track_delta }.
 */
function toAnchor(objectiveCode, krRow) {
  if (!krRow) return null;
  // off_track_delta: a real, computed signed gap (current - target) when numeric,
  // else null. NEVER fabricated — purely derived from the live KR row.
  let delta = null;
  if (typeof krRow.current_value === 'number' && typeof krRow.target_value === 'number') {
    delta = Math.round((krRow.current_value - krRow.target_value) * 100) / 100;
  }
  return {
    objective: objectiveCode,
    kr: krRow.code || krRow.id, // real KR code/id — never invented
    kr_status: krRow.status || 'on_track',
    off_track_delta: delta,
    key_result_id: krRow.id,
  };
}

/**
 * Build a candidate from one harness-signal class. Returns null when no live KR
 * anchors the class (the signal is then excluded — the cardinal safety rule).
 * Pure: no DB; takes the pre-fetched KR rows for the class's objective.
 *
 * @param {object} args
 * @param {string} args.signalClass    candidate class key (e.g. 'harness-backlog')
 * @param {string} args.objectiveCode  O-GOV objective code
 * @param {Array}  args.krRows         live key_results rows under that objective
 * @param {number} args.count          number of open signals of this class
 * @param {string} args.contribution_type  'direct'|'enabling'|'supporting'
 * @param {object} args.copy           { opportunity, evidence, rationale, risk, counterfactual }
 * @param {number} [args.confidence]
 * @param {string} args.dedup_key
 */
export function buildCandidateFromSignal({
  signalClass,
  objectiveCode,
  krRows,
  count,
  contribution_type,
  copy,
  confidence = 0.6,
  dedup_key,
}) {
  if (!count || count <= 0) return null; // no signal -> no candidate
  const krRow = pickAnchorKr(krRows);
  const anchor = toAnchor(objectiveCode, krRow);
  if (!anchor || !anchor.kr) return null; // NO live KR -> EXCLUDE (never fabricate)
  return {
    scope_key: 'harness',
    class: signalClass,
    objective_kr: anchor,
    contribution_type,
    opportunity: copy.opportunity,
    evidence: copy.evidence,
    rationale: copy.rationale,
    risk: copy.risk,
    counterfactual: copy.counterfactual,
    confidence,
    dedup_key,
    roadmap_id: '3aa2f3e2-75fa-4fc8-a17e-44d553b86674', // FR-3: LEO Roadmap (self-gates to no-op today)
  };
}

/**
 * Map raw harness signal inputs (counts + the live KR rows per O-GOV objective)
 * into scored candidate objects. PURE + DB-free (fully unit-testable).
 *
 * @param {object} args
 * @param {Array} [args.backlog]   feedback rows (harness_backlog)
 * @param {Array} [args.retros]
 * @param {Array} [args.gateRecs]  gate-tuning recommendation rows
 * @param {Array} [args.evaRecs]   pending EVA consultant recs
 * @param {Map<string,Array>} [args.krByObjective]  objectiveCode -> live key_results rows
 */
export function summarizeHarness({
  backlog = [],
  retros = [],
  gateRecs = [],
  evaRecs = [],
  krByObjective = new Map(),
} = {}) {
  // Only gate-tuning recs that recommend an ACTUAL threshold change are actionable;
  // MONITOR rows are not a governance opportunity.
  const actionableGateRecs = (gateRecs || []).filter(
    (r) => r && typeof r.recommendation === 'string' && /^(INCREASE|DECREASE)/i.test(r.recommendation)
  );
  // Engineer-domain EVA recs that propose creating an SD are governance-stack work.
  const engineerEvaRecs = (evaRecs || []).filter(
    (r) => r && r.action_type === 'create_sd'
  );

  const signals = {
    open_harness_backlog: backlog.length,
    recent_retros: retros.length,
    gate_tuning_recs: gateRecs.length,
    actionable_gate_recs: actionableGateRecs.length,
    pending_eva_recs: evaRecs.length,
    engineer_eva_recs: engineerEvaRecs.length,
  };

  const get = (code) => krByObjective.get?.(code) || [];

  const rawCandidates = [
    buildCandidateFromSignal({
      signalClass: 'harness-backlog',
      objectiveCode: SIGNAL_CLASS_TO_OBJECTIVE['harness-backlog'],
      krRows: get(SIGNAL_CLASS_TO_OBJECTIVE['harness-backlog']),
      count: backlog.length,
      contribution_type: 'enabling',
      confidence: 0.6,
      dedup_key: 'harness-backlog-cleanup',
      copy: {
        opportunity: `Burn down the open harness backlog (${backlog.length} item${backlog.length === 1 ? '' : 's'}) to advance Foundation Cleanup.`,
        evidence: `feedback(category=harness_backlog,status=new) holds ${backlog.length} unresolved harness signal${backlog.length === 1 ? '' : 's'}.`,
        rationale: 'A scoped cleanup SD reduces accumulated process/cleanup debt against the Foundation Cleanup KR.',
        risk: 'Some backlog items may be stale or already-superseded; triage before scoping.',
        counterfactual: 'If left to accumulate, the backlog grows and the cleanup KR drifts further from target.',
      },
    }),
    buildCandidateFromSignal({
      signalClass: 'gate-tuning',
      objectiveCode: SIGNAL_CLASS_TO_OBJECTIVE['gate-tuning'],
      krRows: get(SIGNAL_CLASS_TO_OBJECTIVE['gate-tuning']),
      count: actionableGateRecs.length,
      contribution_type: 'direct',
      confidence: 0.7,
      dedup_key: 'harness-gate-tuning',
      copy: {
        opportunity: `Apply ${actionableGateRecs.length} actionable gate-threshold tuning recommendation${actionableGateRecs.length === 1 ? '' : 's'} to raise LEO intelligence.`,
        evidence: `v_ai_quality_tuning_recommendations flags ${actionableGateRecs.length} INCREASE/DECREASE recommendation${actionableGateRecs.length === 1 ? '' : 's'}.`,
        rationale: 'Tuning gate thresholds to the evidence improves the LEO Intelligence Integration score.',
        risk: 'Over-tuning could mask real defects; apply per-type with review.',
        counterfactual: 'If thresholds stay misaligned, gate pass-rates and intelligence score remain below target.',
      },
    }),
    buildCandidateFromSignal({
      signalClass: 'eva-consultant',
      objectiveCode: SIGNAL_CLASS_TO_OBJECTIVE['eva-consultant'],
      krRows: get(SIGNAL_CLASS_TO_OBJECTIVE['eva-consultant']),
      count: engineerEvaRecs.length,
      contribution_type: 'supporting',
      confidence: 0.55,
      dedup_key: 'harness-eva-consultant',
      copy: {
        opportunity: `Review ${engineerEvaRecs.length} pending EVA consultant recommendation${engineerEvaRecs.length === 1 ? '' : 's'} for governance-stack work.`,
        evidence: `eva_consultant_recommendations holds ${engineerEvaRecs.length} pending create_sd recommendation${engineerEvaRecs.length === 1 ? '' : 's'}.`,
        rationale: 'Acting on vetted EVA recommendations advances the Strategic Governance Stack.',
        risk: 'EVA recs vary in confidence; filter by confidence_tier before scoping.',
        counterfactual: 'If pending recs are never reviewed, governance-stack gaps persist unaddressed.',
      },
    }),
  ];

  const candidates = rawCandidates.filter(Boolean);
  return { scope_key: 'harness', signals, candidates, gaps: [] };
}

async function safe(fn) {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

/**
 * Fetch live key_results rows grouped by O-GOV objective code. Read-only,
 * fail-soft: any error yields an empty Map (-> all signals excluded, never faked).
 * @returns {Promise<Map<string,Array>>}
 */
export async function fetchKrByObjective(supabase) {
  const map = new Map();
  try {
    const codes = [...new Set(Object.values(SIGNAL_CLASS_TO_OBJECTIVE))];
    const { data: objs } = await supabase
      .from('objectives')
      .select('id, code')
      .in('code', codes);
    if (!objs || objs.length === 0) return map;
    const idToCode = new Map(objs.map((o) => [o.id, o.code]));
    const { data: krs } = await supabase
      .from('key_results')
      .select('id, code, title, status, objective_id, current_value, target_value')
      .in('objective_id', [...idToCode.keys()]);
    for (const kr of krs || []) {
      const code = idToCode.get(kr.objective_id);
      if (!code) continue;
      if (!map.has(code)) map.set(code, []);
      map.get(code).push(kr);
    }
  } catch {
    return new Map();
  }
  return map;
}

export async function briefHarness(supabase) {
  const backlog = await safe(async () =>
    warnIfCapTruncated((await supabase.from('feedback').select('id').eq('category', 'harness_backlog').eq('status', 'new')).data, 'lib/adam/briefings/harness.js:269')
  );
  const retros = await safe(async () =>
    (await supabase.from('retrospectives').select('id').order('created_at', { ascending: false }).limit(20)).data
  );
  const gateRecs = await safe(async () =>
    (await supabase.from('v_ai_quality_tuning_recommendations').select('sd_type, recommendation')).data
  );
  const evaRecs = await safe(async () =>
    (await supabase.from('eva_consultant_recommendations').select('id, action_type, confidence_tier').eq('status', 'pending').limit(50)).data
  );
  // Live KR anchors — the cardinal safety rule depends on these being real.
  const krByObjective = await fetchKrByObjective(supabase);
  return summarizeHarness({ backlog, retros, gateRecs, evaRecs, krByObjective });
}
