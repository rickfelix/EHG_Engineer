#!/usr/bin/env node
/**
 * dispatch-suggestion-report.mjs — SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-4).
 *
 * THE NAMED READER for dispatch_suggestion / dispatch_override rows. Without a reader that
 * actually runs, FR-4's log repeats the door_routing_ledger dead-table pattern (a prior table of
 * the same shape whose own SD concluded "has never run"). This script aggregates the two payload
 * kinds session_coordination now carries (see lib/fleet/dispatch-suggestions.cjs FR-1 and
 * scripts/dispatch-suggestion-override.mjs FR-4) into a suggestion-followed-vs-override ratio and
 * the most common override reasons for a lookback window.
 *
 * Usage: node scripts/dispatch-suggestion-report.mjs [--days N]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';

/**
 * Pure aggregation over already-fetched rows, so the report logic is unit-testable without a DB.
 * @param {Array<{payload: object}>} rows
 * @returns {{ suggestions: number, overrides: number, overrideRatio: (number|null), topReasons: Array<{reason: string, count: number}> }}
 */
export function summarizeSuggestionActivity(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const suggestions = list.filter((r) => r?.payload?.kind === 'dispatch_suggestion');
  const overrides = list.filter((r) => r?.payload?.kind === 'dispatch_override');
  const reasonCounts = {};
  for (const o of overrides) {
    const reason = typeof o.payload.reason === 'string' && o.payload.reason.trim() ? o.payload.reason.trim() : '(no reason)';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const topReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    suggestions: suggestions.length,
    overrides: overrides.length,
    overrideRatio: suggestions.length > 0 ? overrides.length / suggestions.length : null,
    topReasons,
  };
}

export async function fetchSuggestionActivity(supabase, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, payload, created_at')
    .in('payload->>kind', ['dispatch_suggestion', 'dispatch_override'])
    .gte('created_at', since)
    .limit(5000);
  if (error) throw new Error(`fetchSuggestionActivity: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

async function main() {
  const args = process.argv.slice(2);
  const dIdx = args.indexOf('--days');
  const days = dIdx >= 0 && Number.isFinite(Number(args[dIdx + 1])) ? Number(args[dIdx + 1]) : 7;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[dispatch-suggestion-report] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const rows = await fetchSuggestionActivity(supabase, { days });
  const summary = summarizeSuggestionActivity(rows);

  console.log(`DISPATCH SUGGESTION REPORT (last ${days}d)`);
  console.log(`  suggestions written: ${summary.suggestions}`);
  console.log(`  overrides recorded:  ${summary.overrides}`);
  console.log(`  override ratio:      ${summary.overrideRatio === null ? 'n/a (no suggestions in window)' : `${(summary.overrideRatio * 100).toFixed(1)}%`}`);
  if (summary.topReasons.length) {
    console.log('  top override reasons:');
    for (const { reason, count } of summary.topReasons) console.log(`    ${count}x  ${reason}`);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[dispatch-suggestion-report] ${e.message}`); process.exit(1); });
}
