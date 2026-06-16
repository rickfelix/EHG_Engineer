// SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001 (FR-3) — pure trend rendering for the vision build-% gauge.
//
// Reads a window of persisted vision_build_gauge snapshots and produces an HONEST trend for the Adam
// chairman exec-summary: a compact sparkline over the recent window, a signed delta vs the PRIOR run,
// and a short prior-analysis line. No IO — the caller fetches the rows; this is hermetically testable.
//
// Honesty invariants (the recurring VDR lesson — auto-metrics must DEFAULT HONEST, never lie):
//   • Fewer than 2 snapshots  → "trend: building history" (NEVER a fabricated trend/delta).
//   • An unavailable run (available=false / overall_pct null) is a GAP in the sparkline, is EXCLUDED
//     from the numeric delta, and is COUNTED in the analysis line — it is never silently dropped or
//     treated as 0%.
//   • If the immediately-prior run was unavailable, the delta is reported "n/a (prior run unavailable)"
//     rather than skipping to an older run and overstating a movement.

const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const GAP = '·'; // an unavailable run (could-not-measure) — honestly shown as a gap, not a 0% bar

/** Map an absolute pct (0..100) to a sparkline bar. Absolute scale (NOT min-max normalized) so a flat
 *  low value looks flat-low and a small wobble does not get visually exaggerated. */
function bar(pct) {
  if (pct == null || Number.isNaN(pct)) return GAP;
  const clamped = Math.max(0, Math.min(100, pct));
  return BARS[Math.round((clamped / 100) * (BARS.length - 1))];
}

function isAvailable(s) {
  return !!(s && s.available && s.overall_pct != null && !Number.isNaN(Number(s.overall_pct)));
}

function pctOf(s) { return Math.round(Number(s.overall_pct)); }

function signed(n) { return n > 0 ? `+${n}` : `${n}`; }

/**
 * @param {Array<{overall_pct:?number, available:boolean, measured_at:string}>} snapshots
 *        Any order; sorted ascending by measured_at internally (oldest → newest, left → right).
 * @returns {{ trendLine: string, analysisLine: (string|null) }}
 */
export function computeGaugeTrend(snapshots) {
  const rows = (Array.isArray(snapshots) ? snapshots : [])
    // Drop rows with a missing OR unparseable measured_at: an NaN sort key would make the comparator
    // non-deterministic and could mislabel which run is "current"/"prior". (timestamptz NOT NULL at the
    // DB means this never bites real data — but the helper is pure and must stay deterministic.)
    .filter((s) => s && s.measured_at != null && !Number.isNaN(new Date(s.measured_at).getTime()))
    .slice()
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  const n = rows.length;
  if (n === 0) return { trendLine: 'EHG vision trend: building history (no snapshots yet)', analysisLine: null };
  if (n === 1) return { trendLine: 'EHG vision trend: building history (1 snapshot)', analysisLine: null };

  const sparkline = rows.map((s) => (isAvailable(s) ? bar(pctOf(s)) : GAP)).join('');
  const current = rows[n - 1];
  const prior = rows[n - 2];
  const unavailableCount = rows.filter((s) => !isAvailable(s)).length;

  // ── trend line: sparkline + headline current % + signed delta vs the immediately-prior run ──
  let head;
  if (!isAvailable(current)) {
    head = `current run unavailable (${n} runs)`;
  } else if (!isAvailable(prior)) {
    head = `${pctOf(current)}% (delta n/a — prior run unavailable, ${n} runs)`;
  } else {
    const delta = pctOf(current) - pctOf(prior);
    head = `${pctOf(current)}% (${signed(delta)} vs prior run, ${n} runs)`;
  }
  const trendLine = `EHG vision trend: ${sparkline} ${head}`;

  // ── prior-analysis line: direction across the available points in the window ──
  const available = rows.filter(isAvailable);
  let analysisLine;
  if (available.length < 2) {
    analysisLine = `prior analysis: only ${available.length} measurable run(s) in the last ${n} (rest unavailable)`;
  } else {
    const first = pctOf(available[0]);
    const last = pctOf(available[available.length - 1]);
    const verb = last > first ? 'rose' : last < first ? 'fell' : 'held';
    const span = verb === 'held' ? `flat at ${last}%` : `${first}% → ${last}%`;
    analysisLine = `prior analysis: ${verb} ${span} over the last ${n} runs` +
      (unavailableCount ? ` (${unavailableCount} unavailable)` : '');
  }

  return { trendLine, analysisLine };
}

export const __test = { bar, isAvailable, GAP, BARS };
