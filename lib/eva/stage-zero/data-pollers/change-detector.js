/**
 * Ranking Change Detector
 * Compares current polling results against previous cycle to identify significant movements.
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-003
 */

const DEFAULT_THRESHOLD = 5;

/**
 * Detect significant ranking changes between current and previous polling cycles.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Array}  params.currentResults - Current polling results [{source, app_name, chart_position, app_url, ...}]
 * @param {number} [params.threshold=5] - Minimum position change to flag as significant
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<{movements: Array, summary: Object}>}
 */
export async function detectChanges({ supabase, currentResults, threshold = DEFAULT_THRESHOLD, logger = console } = {}) {
  if (!currentResults || currentResults.length === 0) {
    return { movements: [], summary: { total_compared: 0, significant: 0, new_entries: 0 } };
  }

  // Group current results by source
  const bySource = {};
  for (const entry of currentResults) {
    if (!bySource[entry.source]) bySource[entry.source] = [];
    bySource[entry.source].push(entry);
  }

  const allMovements = [];
  let totalCompared = 0;
  let newEntries = 0;

  for (const [source, entries] of Object.entries(bySource)) {
    // Fetch previous rankings for this source
    const appUrls = entries.map(e => e.app_url).filter(Boolean);
    if (appUrls.length === 0) continue;

    const { data: previousData, error } = await supabase
      .from('app_rankings')
      .select('app_name, app_url, chart_position, source, polled_at')
      .eq('source', source)
      .in('app_url', appUrls);

    if (error) {
      logger.log(`Change detector: error querying previous data for ${source}: ${error.message}`);
      continue;
    }

    // Build lookup of previous positions by app_url
    const previousByUrl = {};
    if (previousData) {
      for (const prev of previousData) {
        // Keep the most recent previous entry per app_url
        if (!previousByUrl[prev.app_url] || new Date(prev.polled_at) > new Date(previousByUrl[prev.app_url].polled_at)) {
          previousByUrl[prev.app_url] = prev;
        }
      }
    }

    for (const current of entries) {
      if (!current.app_url) continue;
      totalCompared++;

      const previous = previousByUrl[current.app_url];
      if (!previous) {
        newEntries++;
        continue;
      }

      const delta = previous.chart_position - current.chart_position;
      if (Math.abs(delta) >= threshold) {
        allMovements.push({
          source,
          app_name: current.app_name,
          app_url: current.app_url,
          previous_position: previous.chart_position,
          current_position: current.chart_position,
          delta,
          direction: delta > 0 ? 'up' : 'down',
          magnitude: Math.abs(delta),
        });
      }
    }
  }

  // Sort by magnitude descending
  allMovements.sort((a, b) => b.magnitude - a.magnitude);

  return {
    movements: allMovements,
    summary: {
      total_compared: totalCompared,
      significant: allMovements.length,
      new_entries: newEntries,
      sources_analyzed: Object.keys(bySource).length,
    },
  };
}
