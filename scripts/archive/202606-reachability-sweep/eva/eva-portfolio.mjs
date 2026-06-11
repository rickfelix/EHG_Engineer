#!/usr/bin/env node
/**
 * eva-portfolio.mjs
 * Portfolio-level vision health dashboard.
 * Shows avg score, tier distribution, top/bottom SDs.
 *
 * Usage:
 *   node scripts/eva/eva-portfolio.mjs [--exclude-synthetic]
 *
 * Part of: SD-CORR-VIS-V06-CLI-WORKFLOW-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const excludeSynthetic = process.argv.includes('--exclude-synthetic');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  let query = supabase
    .from('eva_vision_scores')
    .select('sd_id, total_score, threshold_action, created_by, scored_at')
    .order('scored_at', { ascending: false });

  if (excludeSynthetic) {
    query = query.not('created_by', 'in', '("synthetic-LEAD-workaround","manual-chairman-override")');
  }

  const { data, error } = await query;
  if (error) { console.error('Query error:', error.message); process.exit(1); }
  if (!data || data.length === 0) { console.log('No vision scores found.'); process.exit(0); }

  // Deduplicate: keep latest score per SD
  const latest = new Map();
  for (const row of data) {
    if (!latest.has(row.sd_id)) latest.set(row.sd_id, row);
  }
  const scores = [...latest.values()];

  const avg = Math.round(scores.reduce((a, r) => a + r.total_score, 0) / scores.length * 10) / 10;
  const min = Math.min(...scores.map(r => r.total_score));
  const max = Math.max(...scores.map(r => r.total_score));

  // Tier distribution
  const tiers = { accept: [], minor_sd: [], gap_closure_sd: [], escalate: [] };
  for (const s of scores) {
    const tier = tiers[s.threshold_action] || tiers.escalate;
    tier.push(s);
  }

  // Top/bottom SDs
  const sorted = [...scores].sort((a, b) => a.total_score - b.total_score);
  const bottom5 = sorted.slice(0, 5);
  const top5 = sorted.slice(-5).reverse();

  console.log('\n\x1b[1m\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m EVA VISION PORTFOLIO HEALTH\x1b[0m');
  console.log(`\x1b[2m ${scores.length} unique SDs scored${excludeSynthetic ? ' (synthetic excluded)' : ''}\x1b[0m`);
  console.log('\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m\n');

  // Summary bar
  const avgBar = '█'.repeat(Math.round(avg / 5)) + '░'.repeat(20 - Math.round(avg / 5));
  console.log(`  \x1b[1mPortfolio Average:\x1b[0m ${avgBar} \x1b[1m${avg}\x1b[0m/100`);
  console.log(`  \x1b[2mRange: ${min} — ${max}\x1b[0m\n`);

  // Tier distribution
  console.log('\x1b[1m  TIER DISTRIBUTION\x1b[0m\n');
  const tierConfig = [
    { key: 'accept', label: 'Accept (93+)', color: '\x1b[32m' },
    { key: 'minor_sd', label: 'Minor (83-92)', color: '\x1b[33m' },
    { key: 'gap_closure_sd', label: 'Gap Closure (70-82)', color: '\x1b[33m' },
    { key: 'escalate', label: 'Escalate (<70)', color: '\x1b[31m' },
  ];
  for (const t of tierConfig) {
    const count = tiers[t.key].length;
    const pct = Math.round(count / scores.length * 100);
    const bar = '▓'.repeat(Math.round(count / scores.length * 30));
    console.log(`  ${t.color}${t.label.padEnd(22)}\x1b[0m ${String(count).padStart(3)} (${String(pct).padStart(2)}%) ${t.color}${bar}\x1b[0m`);
  }

  // Bottom 5
  console.log('\n\x1b[1m  WEAKEST SDs\x1b[0m\n');
  for (const s of bottom5) {
    const sdShort = s.sd_id.length > 50 ? s.sd_id.substring(0, 47) + '...' : s.sd_id;
    console.log(`  \x1b[31m${String(s.total_score).padStart(3)}\x1b[0m  ${sdShort}`);
  }

  // Top 5
  console.log('\n\x1b[1m  STRONGEST SDs\x1b[0m\n');
  for (const s of top5) {
    const sdShort = s.sd_id.length > 50 ? s.sd_id.substring(0, 47) + '...' : s.sd_id;
    console.log(`  \x1b[32m${String(s.total_score).padStart(3)}\x1b[0m  ${sdShort}`);
  }

  console.log('');
}

main().catch(err => { console.error(err.message); process.exit(1); });
