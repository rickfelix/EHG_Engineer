import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// [sd_type, content_type, liveThreshold, beforeValue]
const PAIRS = [
  ['bugfix', 'retrospective', 65, null],       // no key before -> fell through to DEFAULT_THRESHOLD (60, per repo convention)
  ['feature', 'retrospective', 65, null],      // default 60 before this key existed
  ['infrastructure', 'prd', 60, 55],
  ['infrastructure', 'retrospective', 60, 55],
  ['security', 'retrospective', 75, 70],
];

const SINCE = '2026-08-28T00:00:00Z';

for (const [sd_type, content_type, live, before] of PAIRS) {
  const beforeVal = before ?? 60; // DEFAULT_THRESHOLD fallback per config.js convention
  const { data: liveRows, error: e1 } = await supabase
    .from('ai_quality_assessments')
    .select('id, weighted_score, pass_threshold, assessed_at, content_id, content_type')
    .eq('sd_type', sd_type)
    .eq('content_type', content_type)
    .eq('pass_threshold', live)
    .gte('assessed_at', SINCE)
    .order('assessed_at', { ascending: true })
    .limit(500);
  if (e1) { console.log(sd_type, content_type, 'ERROR', e1.message); continue; }

  const n = liveRows?.length || 0;
  const passN = (liveRows || []).filter(r => r.weighted_score >= live).length;
  const flips = (liveRows || []).filter(r => r.weighted_score >= beforeVal && r.weighted_score < live);

  console.log(`\n=== ${sd_type}/${content_type} (before=${beforeVal} -> live=${live}) ===`);
  console.log(`n=${n} live-pass=${passN} (${n ? (passN/n*100).toFixed(1) : 'NA'}%) flips(would-now-fail)=${flips.length}`);
  for (const f of flips) {
    console.log(`  FLIP id=${f.id} content_id=${f.content_id} score=${f.weighted_score} assessed_at=${f.assessed_at}`);
  }
}
