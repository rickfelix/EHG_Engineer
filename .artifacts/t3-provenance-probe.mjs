/**
 * Solomon's T3 counterfactual (relayed via Adam a31ae727): does issue_patterns.source_feedback_ids
 * genuinely chain to LANE rows at >0 coverage? If yes, a NARROWED T3 that prints its coverage
 * fraction beats the descope. If no, descope with the named return trigger.
 *
 * Measured over the SAME 60-day window T3 uses, on the FULL population (no cap — a capped fetch
 * grouped in memory measures the cap, not the population).
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const since = new Date(Date.now() - 60 * 86400_000).toISOString();

// --- issue_patterns population over the window -------------------------------------------------
const { data: patterns, error: pe, count: patternCount } = await sb
  .from('issue_patterns')
  .select('id, pattern_id, source_feedback_ids, created_at, source', { count: 'exact' })
  .gte('created_at', since);
if (pe) { console.error('issue_patterns read failed:', pe.message); process.exit(2); }

const withIds = (patterns || []).filter((p) => Array.isArray(p.source_feedback_ids) && p.source_feedback_ids.length > 0);
console.log(`issue_patterns in window: ${patterns.length} (exact count ${patternCount})`);
console.log(`  with non-empty source_feedback_ids: ${withIds.length}`);
if (patterns.length) {
  console.log(`  COVERAGE of the provenance key itself: ${(withIds.length / patterns.length * 100).toFixed(1)}%`);
}

// --- do those ids resolve to real feedback rows? -----------------------------------------------
const allIds = [...new Set(withIds.flatMap((p) => p.source_feedback_ids))];
console.log(`  distinct referenced feedback ids: ${allIds.length}`);

let resolved = [];
for (let i = 0; i < allIds.length; i += 200) {
  const chunk = allIds.slice(i, i + 200);
  const { data, error } = await sb.from('feedback').select('id, category, metadata, created_at').in('id', chunk);
  if (error) { console.error('feedback read failed:', error.message); process.exit(2); }
  resolved = resolved.concat(data || []);
}
console.log(`  of those, RESOLVING to a live feedback row: ${resolved.length}`);
if (allIds.length) console.log(`  dangling-reference rate: ${((allIds.length - resolved.length) / allIds.length * 100).toFixed(1)}%`);

// --- the actual question: do they chain to LANE classes? ---------------------------------------
// T3's denominator is lane-named classes (session_coordination payload lesson_class/signal_type).
// The chain only helps if a resolved feedback row can be tied back to one of those class keys.
const { data: lane, error: le } = await sb
  .from('session_coordination')
  .select('id, payload, created_at')
  .gte('created_at', since);
if (le) { console.error('session_coordination read failed:', le.message); process.exit(2); }

const laneKeys = new Set();
const laneIds = new Set();
for (const r of lane || []) {
  const k = r.payload?.lesson_class || r.payload?.signal_type;
  if (k) { laneKeys.add(k); laneIds.add(r.id); }
}
console.log(`\nlane rows in window: ${lane.length}; distinct lane class keys: ${laneKeys.size}`);
console.log(`  lane keys: ${[...laneKeys].slice(0, 12).join(', ')}`);

// Chain attempt 1: feedback.category matches a lane class key
const byCategory = resolved.filter((f) => laneKeys.has(f.category));
// Chain attempt 2: feedback.metadata carries a lane class key or a lane row id
const byMetadata = resolved.filter((f) => {
  const m = f.metadata || {};
  const cand = m.lesson_class || m.signal_type || m.class_key;
  return (cand && laneKeys.has(cand)) || (m.session_coordination_id && laneIds.has(m.session_coordination_id));
});
const chained = new Set([...byCategory, ...byMetadata].map((f) => f.id));

console.log(`\nCHAIN RESULT (the branch discriminant):`);
console.log(`  resolved feedback rows whose category IS a lane class key: ${byCategory.length}`);
console.log(`  resolved feedback rows whose metadata carries a lane class key or lane row id: ${byMetadata.length}`);
console.log(`  TOTAL chained: ${chained.size}`);

const coverageFraction = patterns.length ? chained.size / patterns.length : 0;
console.log(`  COVERAGE FRACTION (chained / issue_patterns in window): ${(coverageFraction * 100).toFixed(2)}%`);
console.log(`\nVERDICT: ${chained.size > 0 ? 'NARROW-AND-SHIP — a real chain exists at >0 coverage' : 'DESCOPE — the chain is empty, coverage is exactly 0'}`);
