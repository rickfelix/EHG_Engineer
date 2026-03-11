/**
 * fleet-eta-stats.cjs — Query historical SD completion data for ETA estimation.
 *
 * Run once per coordinator session to get data-driven baselines.
 * Groups handoff durations by sd_type + child/standalone, returns medians.
 *
 * Usage: node scripts/fleet-eta-stats.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

    const first = new Date(hs[0].created_at);
    const last = new Date(hs[hs.length - 1].created_at);
    const totalMin = Math.round((last - first) / 60000);
    if (totalMin <= 0 || totalMin > 1440) continue;

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
  console.log(`Source: ${rows.length} completed SDs with handoff data\n`);

  console.log('TYPE BUCKET STATS:');
  const sortedKeys = Object.keys(groups).sort();
  for (const key of sortedKeys) {
    const items = groups[key];
    const s = stats(items.map(i => i.totalMin));
    const sL = stats(items.map(i => i.lead));
    const sP = stats(items.map(i => i.plan));
    const sE = stats(items.map(i => i.exec));
    console.log(`  ${key}: n=${s.n} | med=${s.med}m avg=${s.avg}m p25=${s.p25}m p75=${s.p75}m range=${s.min}-${s.max}m`);
    console.log(`    phases: LEAD med=${sL.med}m | PLAN med=${sP.med}m | EXEC med=${sE.med}m`);
  }

  // 5. Show pending SDs for matching
  console.log('\nPENDING SDs:');
  const { data: pending } = await sb.from('strategic_directives_v2')
    .select('sd_key, title, sd_type, parent_sd_id, status, current_phase, progress_percentage')
    .in('status', ['draft', 'in_progress', 'ready', 'planning']);

  for (const sd of (pending || [])) {
    const bucket = `${sd.parent_sd_id ? 'child' : 'standalone'}/${sd.sd_type || '?'}`;
    const ref = groups[bucket];
    const refStats = ref ? stats(ref.map(i => i.totalMin)) : null;
    const match = refStats ? `matched bucket: ${bucket} (n=${refStats.n}, med=${refStats.med}m)` : `no match for ${bucket}`;
    console.log(`  ${sd.sd_key} | ${bucket} | phase:${sd.current_phase} | ${sd.progress_percentage}% | ${match}`);
  }

  console.log('\n=== END ===');
})().catch(e => { console.error(e.message); process.exit(1); });
