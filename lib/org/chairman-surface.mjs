/**
 * Chairman surface — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-6.
 *
 * The meeting-brief + attention-items + calendar-deep-dive + top-constraint-line
 * surface. NET-NEW surface over four EXISTING computations (verified live at LEAD):
 *   1. lib/telemetry/bottleneck-analyzer.js::analyzeBottlenecks   (workflow bottlenecks)
 *   2. lib/eva/constraint-drift-detector.js::detectConstraintDrift (baseline contradiction)
 *   3. lib/skunkworks/signals/venture-portfolio-reader.js::readVenturePortfolioSignals
 *   4. lib/operator/cash-burn-substrate.js::getDistanceToBroke     (runway / distance-to-quit)
 *
 * HARD RULE (SD smoke step 3): the top-constraint line is sourced LIVE from these four
 * — never hardcoded/stale. Every section carries {source, computed_at}; a failed section
 * degrades to {error} without sinking the brief (calm cockpit: partial > brittle).
 *
 * Reads venture state ONLY through v_venture_state_canonical (FR-3) — never the
 * deprecated fragmented views. EVA may DELIVER this brief (routing surface
 * 'meeting_brief_delivery'); it decides nothing here.
 *
 * @module lib/org/chairman-surface
 */

// The four computations are LAZY-imported: test seams (opts.fns) never load the real
// chain, and lib/supabase-client.js (reached via cash-burn-substrate) carries a shebang
// that some transforms (vitest/esbuild on imported modules) reject at parse time.
async function loadRealFns() {
  const [bn, cd, vp, cb, vg] = await Promise.all([
    import('../telemetry/bottleneck-analyzer.js'),
    import('../eva/constraint-drift-detector.js'),
    import('../skunkworks/signals/venture-portfolio-reader.js'),
    import('../operator/cash-burn-substrate.js'),
    import('../vigilance/freshness-gauge.js'),
  ]);
  return {
    analyzeBottlenecks: bn.analyzeBottlenecks,
    detectConstraintDrift: cd.detectConstraintDrift,
    readVenturePortfolioSignals: vp.readVenturePortfolioSignals,
    getDistanceToBroke: cb.getDistanceToBroke,
    periodMonthOf: cb.periodMonthOf,
    computeVigilanceFreshness: vg.computeVigilanceFreshness,
  };
}

/** Local fallback matching cash-burn-substrate's periodMonthOf shape (YYYY-MM). */
function periodMonthFallback(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Local fallback for computeVigilanceFreshness when a test seam supplies only the original 4
 * fns (Child F landed after Child B's own tests) — returns the honest NO_DATA shape rather than
 * throwing, so pre-existing test-seam callers are unaffected.
 */
async function vigilanceFreshnessFallback() {
  return { status: 'NO_DATA', latest_observed_at: null, hours_since_latest: null, thesis_count: 0, computed_at: new Date().toISOString() };
}

const section = (source, data) => ({ source, computed_at: new Date().toISOString(), ...data });
const failedSection = (source, err) => section(source, { error: (err && err.message) || String(err) });

/** Runway months below which cash becomes the top constraint outright. */
const RUNWAY_CRITICAL_MONTHS = 6;

/**
 * Build the chairman meeting brief.
 * @param {object} supabase - service client
 * @param {object} [opts]
 * @param {object} [opts.logger]
 * @param {object} [opts.fns] - test seams { analyzeBottlenecks, detectConstraintDrift, readVenturePortfolioSignals, getDistanceToBroke }
 * @returns {Promise<{generated_at: string, top_constraint: object, attention_items: Array, runway: object,
 *                    bottlenecks: object, portfolio_signals: object, constraint_drift: object,
 *                    deep_dive_proposal: object|null}>}
 */
export async function buildChairmanBrief(supabase, opts = {}) {
  const logger = opts.logger || console;
  const fns = opts.fns && opts.fns.analyzeBottlenecks && opts.fns.detectConstraintDrift
    && opts.fns.readVenturePortfolioSignals && opts.fns.getDistanceToBroke
    ? { periodMonthOf: periodMonthFallback, computeVigilanceFreshness: vigilanceFreshnessFallback, ...opts.fns }
    : { ...(await loadRealFns()), ...(opts.fns || {}) };

  // The attention-max venture drives the drift check and the deep-dive proposal.
  // Canonical read model ONLY (FR-3).
  let focusVenture = null;
  try {
    const { data } = await supabase
      .from('v_venture_state_canonical')
      .select('id, name, attention_score, current_lifecycle_stage, dwell_days, health_status')
      .eq('lifecycle_state', 'active')
      .order('attention_score', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    focusVenture = data || null;
  } catch (e) {
    logger.warn?.(`[chairman-surface] canonical read model unavailable: ${e.message}`);
  }

  const [bottlenecks, signals, runway, drift, vigilance] = await Promise.all([
    fns.analyzeBottlenecks(supabase, {})
      .then((r) => section('bottleneck-analyzer', { result: r }))
      .catch((e) => failedSection('bottleneck-analyzer', e)),
    Promise.resolve()
      .then(() => fns.readVenturePortfolioSignals({ supabase, logger }))
      .then((r) => section('venture-portfolio-reader', { signals: r }))
      .catch((e) => failedSection('venture-portfolio-reader', e)),
    fns.getDistanceToBroke((fns.periodMonthOf || periodMonthFallback)(new Date()), supabase)
      .then((r) => section('cash-burn-substrate', { result: r }))
      .catch((e) => failedSection('cash-burn-substrate', e)),
    focusVenture
      ? fns.detectConstraintDrift({
          ventureId: focusVenture.id,
          currentStage: focusVenture.current_lifecycle_stage || 1,
          supabase,
          logger,
        })
          .then((r) => section('constraint-drift-detector', { result: r }))
          .catch((e) => failedSection('constraint-drift-detector', e))
      : Promise.resolve(section('constraint-drift-detector', { skipped: 'no active venture in canonical read model' })),
    // SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F: vigilance freshness gauge (S-4). NO_DATA (never
    // a stale green) when the intake is disabled/absent — computeVigilanceFreshness itself
    // enforces this, so this section never needs a synthetic failedSection fallback of its own.
    (fns.computeVigilanceFreshness || vigilanceFreshnessFallback)(supabase)
      .then((r) => section('vigilance-freshness-gauge', { result: r }))
      .catch((e) => failedSection('vigilance-freshness-gauge', e)),
  ]);

  const attention_items = buildAttentionItems({ bottlenecks, signals, drift, runway });
  const top_constraint = pickTopConstraint({ bottlenecks, signals, drift, runway });

  const deep_dive_proposal = focusVenture
    ? {
        venture_id: focusVenture.id,
        venture_name: focusVenture.name,
        reason: `highest attention score (${focusVenture.attention_score ?? 'n/a'}), dwell ${focusVenture.dwell_days ?? '?'}d, health ${focusVenture.health_status ?? 'unknown'}`,
        suggested_duration_minutes: 25,
        // EVA schedules this (routing surface); the proposal itself is spine output.
        scheduling_surface: 'meeting_brief_delivery',
      }
    : null;

  return {
    generated_at: new Date().toISOString(),
    top_constraint,
    attention_items,
    deep_dive_proposal,
    runway,
    bottlenecks,
    portfolio_signals: signals,
    constraint_drift: drift,
    vigilance_freshness: vigilance,
  };
}

/** Flatten the four live sections into ranked attention items (no invented data). */
export function buildAttentionItems({ bottlenecks, signals, drift, runway }) {
  const items = [];

  const runwayMonths = runway?.result?.months_remaining ?? runway?.result?.runway_months ?? null;
  if (typeof runwayMonths === 'number' && runwayMonths < RUNWAY_CRITICAL_MONTHS) {
    items.push({ kind: 'runway', severity: 'critical', line: `Runway ${runwayMonths.toFixed(1)} months — below ${RUNWAY_CRITICAL_MONTHS}mo threshold`, source: 'cash-burn-substrate' });
  }

  const driftResult = drift?.result;
  if (driftResult?.driftDetected) {
    items.push({ kind: 'constraint_drift', severity: String(driftResult.severity || 'medium').toLowerCase(), line: `Baseline contradiction on venture ${driftResult.ventureId}: ${driftResult.findings?.length ?? 0} finding(s)`, source: 'constraint-drift-detector' });
  }

  for (const b of bottlenecks?.result?.bottlenecks ?? []) {
    items.push({ kind: 'bottleneck', severity: b.severity || 'medium', line: b.summary || `${b.dimension_key ?? 'workflow'} bottleneck`, source: 'bottleneck-analyzer', detail: b });
  }

  for (const s of signals?.signals ?? []) {
    items.push({ kind: s.type || 'portfolio_signal', severity: (s.strength ?? 0) >= 70 ? 'high' : 'medium', line: s.title, source: 'venture-portfolio-reader', detail: { strength: s.strength } });
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return items.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

/** ONE top-constraint line, live-sourced by precedence: cash < blocking drift < worst bottleneck < strongest signal. */
export function pickTopConstraint({ bottlenecks, signals, drift, runway }) {
  const runwayMonths = runway?.result?.months_remaining ?? runway?.result?.runway_months ?? null;
  if (typeof runwayMonths === 'number' && runwayMonths < RUNWAY_CRITICAL_MONTHS) {
    return section('cash-burn-substrate', { line: `TOP CONSTRAINT: cash runway ${runwayMonths.toFixed(1)} months`, kind: 'runway' });
  }
  const driftResult = drift?.result;
  if (driftResult?.driftDetected && ['HIGH', 'CRITICAL', 'high', 'critical'].includes(String(driftResult.severity))) {
    return section('constraint-drift-detector', { line: `TOP CONSTRAINT: baseline contradiction (${driftResult.severity}) on venture ${driftResult.ventureId}`, kind: 'constraint_drift' });
  }
  const worstBottleneck = (bottlenecks?.result?.bottlenecks ?? [])[0];
  if (worstBottleneck) {
    return section('bottleneck-analyzer', { line: `TOP CONSTRAINT: ${worstBottleneck.summary || 'workflow bottleneck'}`, kind: 'bottleneck' });
  }
  const strongest = [...(signals?.signals ?? [])].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))[0];
  if (strongest) {
    return section('venture-portfolio-reader', { line: `TOP CONSTRAINT: ${strongest.title}`, kind: strongest.type || 'portfolio_signal' });
  }
  return section('none', { line: 'No live constraint surfaced by the four computations', kind: 'none' });
}

/**
 * FW-3 Child D (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-E): the chairman-visible framing DIGEST.
 * Govern-by-ABSENCE mitigation — the chairman must see WHAT was framed and HOW even when every
 * downstream gauge reads green (traces-to-CMV, Adam-approved, panel-survived). "Screen RANKS,
 * chairman PICKS": pick-class framings rank FIRST (they route to the chairman fork), then
 * instrument-class by recency. Pure + fail-safe: a null/empty input yields an EXPLICIT empty
 * digest (visible absence), never a silent omission or a throw. Reads payload.framing_class from
 * the FW-3 wire discriminator (child A / -001-B); degrades gracefully until that ships — an item
 * with no framing_class is treated as instrument-class (lowest rank), never dropped.
 * @param {Array<{framing_class?:string, source?:string, summary?:string, title?:string, created_at?:string}>} framings
 * @returns {{empty:boolean, total:number, pickCount:number, instrumentCount:number, items:Array, note:string}}
 */
export function buildFramingDigest(framings) {
  const list = Array.isArray(framings) ? framings : [];
  const classOf = (f) => (f && f.framing_class === 'pick') ? 'pick' : 'instrument';
  const stamp = (x) => Date.parse(x && x.created_at) || 0;
  const items = list
    .map((f) => ({
      framing_class: classOf(f),
      severity: classOf(f) === 'pick' ? 'high' : 'medium',
      line: `[${classOf(f)}] ${(f && (f.summary || f.title)) || 'framing'}`,
      source: (f && f.source) || 'apex-framing-role',
      created_at: (f && f.created_at) || null,
    }))
    // pick-class before instrument-class; within a class, most-recent first.
    .sort((a, b) => (a.framing_class === b.framing_class
      ? stamp(b) - stamp(a)
      : (a.framing_class === 'pick' ? -1 : 1)));
  const pickCount = items.filter((i) => i.framing_class === 'pick').length;
  const empty = items.length === 0;
  return {
    empty,
    total: items.length,
    pickCount,
    instrumentCount: items.length - pickCount,
    items,
    note: empty
      ? 'No framings this period — the apex framing role surfaced nothing to pick (shown so the chairman sees the absence too).'
      : `${items.length} framing(s): ${pickCount} PICK (chairman decides) + ${items.length - pickCount} instrument.`,
  };
}

export { RUNWAY_CRITICAL_MONTHS };
