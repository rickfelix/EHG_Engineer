#!/usr/bin/env node
/**
 * eva-gaps.mjs
 * Lists vision dimensions scoring below threshold across the portfolio.
 * Aggregates dimension_scores JSONB from eva_vision_scores and ranks by worst.
 *
 * Usage:
 *   node scripts/eva/eva-gaps.mjs [--threshold <N>]
 *
 * Part of: SD-CORR-VIS-V06-CLI-WORKFLOW-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const threshold = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--threshold') || '70', 10);

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('eva_vision_scores')
    .select('sd_id, dimension_scores, total_score, created_by')
    .not('created_by', 'eq', 'synthetic-LEAD-workaround')
    .order('scored_at', { ascending: false });

  if (error) { console.error('Query error:', error.message); process.exit(1); }
  if (!data || data.length === 0) { console.log('No vision scores found.'); process.exit(0); }

  // Aggregate dimension scores across all SDs
  const dims = {};
  for (const row of data) {
    if (!row.dimension_scores || typeof row.dimension_scores !== 'object') continue;
    for (const [key, val] of Object.entries(row.dimension_scores)) {
      const score = typeof val === 'number' ? val : val?.score;
      if (typeof score !== 'number') continue;
      if (!dims[key]) dims[key] = { scores: [], belowThreshold: 0 };
      dims[key].scores.push(score);
      if (score < threshold) dims[key].belowThreshold++;
    }
  }

  // Calculate averages and sort by worst
  const ranked = Object.entries(dims)
    .map(([key, d]) => ({
      dimension: key,
      avg: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
      min: Math.min(...d.scores),
      max: Math.max(...d.scores),
      count: d.scores.length,
      belowThreshold: d.belowThreshold,
    }))
    .sort((a, b) => a.avg - b.avg);

  console.log('\n\x1b[1m\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m VISION DIMENSION GAP ANALYSIS\x1b[0m');
  console.log(`\x1b[2m Threshold: ${threshold}/100 | SDs scored: ${data.length}\x1b[0m`);
  console.log('\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m\n');

  if (ranked.length === 0) {
    console.log('No dimension scores found in eva_vision_scores.');
    process.exit(0);
  }

  const gapDims = ranked.filter(d => d.avg < threshold);
  const passDims = ranked.filter(d => d.avg >= threshold);

  if (gapDims.length > 0) {
    console.log(`\x1b[31m\x1b[1m  BELOW THRESHOLD (${gapDims.length} dimensions)\x1b[0m\n`);
    for (const d of gapDims) {
      const bar = '█'.repeat(Math.round(d.avg / 5)) + '░'.repeat(20 - Math.round(d.avg / 5));
      console.log(`  \x1b[31m${d.dimension.padEnd(45)}\x1b[0m ${bar} \x1b[1m${d.avg}\x1b[0m/100`);
      console.log(`  \x1b[2m  min: ${d.min} | max: ${d.max} | n: ${d.count} | below ${threshold}: ${d.belowThreshold}\x1b[0m\n`);
    }
  }

  if (passDims.length > 0) {
    console.log(`\x1b[32m\x1b[1m  ABOVE THRESHOLD (${passDims.length} dimensions)\x1b[0m\n`);
    for (const d of passDims) {
      const bar = '█'.repeat(Math.round(d.avg / 5)) + '░'.repeat(20 - Math.round(d.avg / 5));
      console.log(`  \x1b[32m${d.dimension.padEnd(45)}\x1b[0m ${bar} \x1b[1m${d.avg}\x1b[0m/100`);
    }
  }

  console.log(`\n\x1b[2m  Portfolio: ${gapDims.length} gaps | ${passDims.length} passing | ${ranked.length} total dimensions\x1b[0m\n`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
