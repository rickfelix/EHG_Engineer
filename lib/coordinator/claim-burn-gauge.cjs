/**
 * @wire-check-exempt: loaded via a lazy require() inside scripts/fleet-dashboard.cjs's
 * printClaimBurnGauge() — mirrors this file's sibling gauge modules (strand-age-gauge.cjs,
 * relay-drop-gauge.cjs, chairman-directive-gauge.cjs), none of which are traced as reachable
 * either because fleet-dashboard.cjs has no package.json script entry point.
 *
 * Claim-burn gauge: how many claim events an SD consumes, split by WHO consumed them.
 * QF-20260727-962 (coordinator KPI-0 committed action).
 *
 * WHY A SINGLE COUNT WOULD BE WORSE THAN NO GAUGE. claim_history length conflates two defects
 * that need opposite fixes:
 *   - ONE session retaking ONE item        -> claim/resume IDEMPOTENCY failure
 *   - MANY distinct sessions bouncing off  -> a dependency or spec WALL
 * Measured on the live table: SD-LEO-INFRA-WORKER-INBOX-DRAIN-SUBSET-001 carries 13 claim events
 * under exactly ONE distinct holder. A length-only gauge scores that identically to 13 different
 * workers hitting a wall and sends the fix the wrong way. So the two are emitted as SEPARATE
 * signals and never summed into one headline.
 *
 * WHICH WAY THE LIVE DATA ACTUALLY POINTS (measured 2026-07-28, whole table, paginated):
 * 5449 SDs, 1254 carrying claim_history, 2109 claim events. Of the SDs with more than one event,
 * REPEAT-HOLDER burn (189) EXCEEDS DISTINCT-HOLDER burn (117), with 108 mixed — and 539 repeat
 * events would be invisible to a length-only gauge. The dominant defect is idempotency, not walls,
 * which is the opposite of the intuition the aggregate invites.
 *
 * THE WINDOW IS PART OF THE SIGNAL. The commissioning row quoted 3.30 claim events per shipped
 * item; measured table-wide lifetime it is 0.50 — 6.6x apart, and BOTH are correct for their scope
 * (that figure was a recent cohort). A burn ratio without its denominator stated is a number nobody
 * can reproduce or falsify, so windowLabel rides on every emission.
 *
 * SUSTAINED BURN ONLY. 840 of 1254 SDs carrying history have exactly one claim; a gauge that fired
 * on a single re-claim would flag normal life and be muted within a week.
 *
 * Read-only: never writes strategic_directives_v2 and never touches claiming_session_id.
 */
'use strict';

/** Sustained, not incidental: 2 claims is ordinary, 3+ is a pattern worth a name. */
const DEFAULT_MIN_EVENTS = 3;

/** PURE. Split one SD's claim_history into the two independent burn signals. */
function classifyClaimBurn(claimHistory) {
  const list = Array.isArray(claimHistory) ? claimHistory : [];
  const ids = list
    .map((e) => (e && typeof e === 'object' ? e.session_id : null))
    .filter((v) => typeof v === 'string' && v.length > 0);
  const events = list.length;
  const distinctHolders = new Set(ids).size;
  // Entries with no readable session_id cannot be attributed, so they are counted as events but
  // never inflate distinctHolders. Clamping at 0 keeps a malformed row from reporting negative burn.
  const repeatEvents = Math.max(0, events - distinctHolders);
  let shape = 'none';
  if (events > 1) {
    if (distinctHolders <= 1) shape = 'repeat_holder';
    else if (repeatEvents === 0) shape = 'distinct_holders';
    else shape = 'mixed';
  }
  return { events, distinctHolders, repeatEvents, shape };
}

/** Read-only scan. Fails OPEN (empty gauge) so a query fault never breaks the dashboard tick. */
async function planClaimBurnGauge(supabase, opts = {}) {
  const minEvents = Number.isFinite(opts.minEvents) ? opts.minEvents : DEFAULT_MIN_EVENTS;
  const windowLabel = opts.windowLabel || 'lifetime (all SD rows)';

  let rows = null;
  try {
    const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
    rows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, metadata')
      .order('sd_key'));           // unique-key tiebreaker for stable pagination
  } catch { rows = null; }
  if (!Array.isArray(rows)) return emptyGauge(windowLabel, minEvents);

  const scored = [];
  let totalEvents = 0;
  let completed = 0;
  for (const sd of rows) {
    if (sd && sd.status === 'completed') completed += 1;
    const burn = classifyClaimBurn(sd && sd.metadata && sd.metadata.claim_history);
    totalEvents += burn.events;
    if (burn.events >= minEvents) scored.push({ sd_key: sd.sd_key, status: sd.status, ...burn });
  }

  const by = (shape) => scored.filter((r) => r.shape === shape);
  return {
    windowLabel,
    minEvents,
    population: rows.length,
    totalEvents,
    completed,
    // Declared alongside its denominator, never bare — see the module docblock.
    eventsPerCompletion: completed > 0 ? totalEvents / completed : null,
    repeatHolder: by('repeat_holder').sort((a, b) => b.repeatEvents - a.repeatEvents),
    distinctHolders: by('distinct_holders').sort((a, b) => b.distinctHolders - a.distinctHolders),
    mixed: by('mixed').sort((a, b) => b.events - a.events),
  };
}

function emptyGauge(windowLabel, minEvents) {
  return {
    windowLabel, minEvents, population: 0, totalEvents: 0, completed: 0,
    eventsPerCompletion: null, repeatHolder: [], distinctHolders: [], mixed: [],
  };
}

/**
 * One line, emitted UNCONDITIONALLY including every zero. A counter that appears only when non-zero
 * renders measured-and-clean identically to not-measured — the ambiguity the sibling gauges exist to
 * remove. The window is inside the string so a pasted figure carries its own denominator.
 */
function formatClaimBurnSummary(gauge) {
  const ratio = gauge.eventsPerCompletion === null ? 'n/a' : gauge.eventsPerCompletion.toFixed(2);
  return `CLAIM BURN (${gauge.windowLabel}, >=${gauge.minEvents} events): `
    + `repeat_holder=${gauge.repeatHolder.length} distinct_holders=${gauge.distinctHolders.length} `
    + `mixed=${gauge.mixed.length} | ${gauge.totalEvents} events / ${gauge.completed} completed `
    + `= ${ratio} per completion`;
}

module.exports = {
  classifyClaimBurn,
  planClaimBurnGauge,
  formatClaimBurnSummary,
  DEFAULT_MIN_EVENTS,
};
