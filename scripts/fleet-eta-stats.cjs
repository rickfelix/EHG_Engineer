/**
 * fleet-eta-stats.cjs — Query historical SD completion data for ETA estimation.
 *
 * Run once per coordinator session to get data-driven baselines.
 * Groups handoff durations by sd_type + child/standalone, returns medians.
 * Reports both wall-clock and active-time (excluding idle gaps >30m).
 *
 * Usage: node scripts/fleet-eta-stats.cjs
 */
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const sb = createSupabaseServiceClient();

// Idle gap threshold: gaps longer than this between handoffs are excluded from active-time
const IDLE_GAP_THRESHOLD_MINUTES = 30;

// SD key prefix patterns for sub-bucketing
const KEY_PREFIXES = [
  { pattern: /^SD-.*-OPS-/, label: 'OPS' },
  { pattern: /^SD-.*-LEARN-FIX-/, label: 'LEARN-FIX' },
  { pattern: /^SD-.*-WIRE-/, label: 'WIRE' },
  { pattern: /^SD-.*-BLUEPRINT-/, label: 'BLUEPRINT' },
  { pattern: /^SD-.*-MAN-/, label: 'MAN' },
];

function getKeyPrefix(sdKey) {
  if (!sdKey) return null;
  for (const { pattern, label } of KEY_PREFIXES) {
    if (pattern.test(sdKey)) return label;
  }
  return null;
}

function stats(arr) {
  if (!arr.length) return { n: 0, avg: 0, med: 0, p25: 0, p75: 0, min: 0, max: 0 };
  arr.sort((a, b) => a - b);
  return {
    n: arr.length,
    avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    med: arr[Math.floor(arr.length / 2)],
    p25: arr[Math.floor(arr.length * 0.25)],
    p75: arr[Math.floor(arr.length * 0.75)],
    min: arr[0],
    max: arr[arr.length - 1],
  };
}

/**
 * Compute active-time from sorted handoff timestamps, excluding idle gaps
 */
function computeActiveMinutes(timestamps) {
  if (timestamps.length < 2) return 0;
  let active = 0;
  for (let i = 0; i < timestamps.length - 1; i++) {
    const interval = Math.round((new Date(timestamps[i + 1]) - new Date(timestamps[i])) / 60000);
    if (interval <= IDLE_GAP_THRESHOLD_MINUTES) {
      active += interval;
    }
  }
  return active;
}

(async () => {
  // 1. Get all handoffs
  const { data: handoffs, error: e1 } = await sb.from('sd_phase_handoffs')
    .select('sd_id, from_phase, to_phase, created_at, status')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (e1) { console.error('Handoff query error:', e1.message); process.exit(1); }

  // 2. Get SD metadata
  const sdIds = [...new Set(handoffs.map(h => h.sd_id))];
  const { data: sdMeta, error: e2 } = await sb.from('strategic_directives_v2')
    .select('id, sd_key, parent_sd_id, sd_type, status, current_phase')
    .in('id', sdIds);

  if (e2) { console.error('SD query error:', e2.message); process.exit(1); }

  const sdMap = {};
  for (const s of (sdMeta || [])) sdMap[s.id] = s;

  // 3. Group handoffs by sd_id → compute total duration and phase breakdown
  const bySD = {};
  for (const h of handoffs) {
    if (!bySD[h.sd_id]) bySD[h.sd_id] = [];
    bySD[h.sd_id].push(h);
  }

  const rows = [];
  for (const [sdId, hs] of Object.entries(bySD)) {
    if (hs.length < 2) continue;
    const meta = sdMap[sdId];
    if (!meta) continue;

    const timestamps = hs.map(h => h.created_at);
    const first = new Date(timestamps[0]);
    const last = new Date(timestamps[timestamps.length - 1]);
    const totalMin = Math.round((last - first) / 60000);
    if (totalMin <= 0 || totalMin > 1440) continue;

    // Compute active-time (excluding idle gaps)
    const activeMin = computeActiveMinutes(timestamps);

    const phaseTotal = {};
    for (let i = 0; i < hs.length - 1; i++) {
      const dur = Math.round((new Date(hs[i + 1].created_at) - new Date(hs[i].created_at)) / 60000);
      const phase = hs[i].to_phase;
      phaseTotal[phase] = (phaseTotal[phase] || 0) + dur;
    }

    rows.push({
      key: meta.sd_key,
      isChild: !!meta.parent_sd_id,
      sdType: meta.sd_type || 'unknown',
      totalMin,
      activeMin,
      keyPrefix: getKeyPrefix(meta.sd_key),
      lead: phaseTotal['LEAD'] || 0,
      plan: phaseTotal['PLAN'] || 0,
      exec: phaseTotal['EXEC'] || 0,
    });
  }

  // 4. Group by type bucket and compute stats
  const groups = {};
  for (const r of rows) {
    const key = `${r.isChild ? 'child' : 'standalone'}/${r.sdType}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  console.log('=== ETA REFERENCE DATA ===');
  console.log(`Source: ${rows.length} completed SDs with handoff data`);
  console.log(`Idle gap threshold: ${IDLE_GAP_THRESHOLD_MINUTES}m (gaps longer excluded from active-time)\n`);

  console.log('TYPE BUCKET STATS (wall-clock / active-time):');
  const sortedKeys = Object.keys(groups).sort();
  for (const key of sortedKeys) {
    const items = groups[key];
    const sW = stats(items.map(i => i.totalMin));
    const sA = stats(items.map(i => i.activeMin));
    const sL = stats(items.map(i => i.lead));
    const sP = stats(items.map(i => i.plan));
    const sE = stats(items.map(i => i.exec));
    const ratio = sA.med > 0 ? (sW.med / sA.med).toFixed(1) : '-';
    console.log(`  ${key}: n=${sW.n}`);
    console.log(`    wall-clock: med=${sW.med}m avg=${sW.avg}m p25=${sW.p25}m p75=${sW.p75}m range=${sW.min}-${sW.max}m`);
    console.log(`    active-time: med=${sA.med}m avg=${sA.avg}m p25=${sA.p25}m p75=${sA.p75}m range=${sA.min}-${sA.max}m`);
    console.log(`    ratio: ${ratio}x (wall/active) ${ratio > 1.5 ? '— significant idle time' : ''}`);
    console.log(`    phases: LEAD med=${sL.med}m | PLAN med=${sP.med}m | EXEC med=${sE.med}m`);
  }

  // 5. Sub-bucket breakdown for standalone SDs by key prefix
  console.log('\nSUB-BUCKET BREAKDOWN (by SD key prefix):');
  const standaloneRows = rows.filter(r => !r.isChild && r.keyPrefix);
  const subBuckets = {};
  for (const r of standaloneRows) {
    const bk = `${r.sdType}/${r.keyPrefix}`;
    if (!subBuckets[bk]) subBuckets[bk] = [];
    subBuckets[bk].push(r);
  }

  const subKeys = Object.keys(subBuckets).sort();
  if (subKeys.length === 0) {
    console.log('  (no matching key prefix patterns found)');
  }
  for (const key of subKeys) {
    const items = subBuckets[key];
    const sA = stats(items.map(i => i.activeMin));
    const sW = stats(items.map(i => i.totalMin));
    const reliable = sA.n >= 5 ? 'reliable' : `low-n (${sA.n})`;
    console.log(`  ${key}: n=${sA.n} (${reliable}) | active med=${sA.med}m | wall med=${sW.med}m`);
  }

  // 6. Show pending SDs for matching
  console.log('\nPENDING SDs:');
  const { data: pending } = await sb.from('strategic_directives_v2')
    .select('sd_key, title, sd_type, parent_sd_id, status, current_phase, progress_percentage')
    .in('status', ['draft', 'in_progress', 'ready', 'planning']);

  for (const sd of (pending || [])) {
    const bucket = `${sd.parent_sd_id ? 'child' : 'standalone'}/${sd.sd_type || '?'}`;
    const ref = groups[bucket];
    const refStats = ref ? stats(ref.map(i => i.activeMin)) : null;
    const match = refStats ? `matched: ${bucket} (n=${refStats.n}, active med=${refStats.med}m)` : `no match for ${bucket}`;
    console.log(`  ${sd.sd_key} | ${bucket} | phase:${sd.current_phase} | ${sd.progress_percentage}% | ${match}`);
  }

  console.log('\n=== END ===');
})().catch(e => { console.error(e.message); process.exit(1); });
