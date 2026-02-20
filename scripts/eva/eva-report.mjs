#!/usr/bin/env node
/**
 * eva-report.mjs
 * Vision governance summary report.
 * Shows round history, corrective SD status, dimension trends, open gaps.
 *
 * Usage:
 *   node scripts/eva/eva-report.mjs [--json]
 *
 * Part of: SD-CORR-VIS-V06-CLI-WORKFLOW-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const jsonOutput = process.argv.includes('--json');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // 1. Round history (orchestrator SDs)
  const rounds = [
    { key: 'SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001', label: 'Round 1', purpose: 'Build governance system' },
    { key: 'SD-MAN-ORCH-EVA-VISION-IMPROVEMENT-001', label: 'Round 2', purpose: 'Close gaps (53→85 target)' },
    { key: 'SD-MAN-ORCH-EVA-VISION-VALIDATION-001', label: 'Round 3', purpose: 'Validate & fix infrastructure' },
    { key: 'SD-MAN-ORCH-EVA-VISION-ROUND4-001', label: 'Round 4', purpose: 'Targeted dimension improvement' },
  ];

  const { data: orchSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, current_phase')
    .in('sd_key', rounds.map(r => r.key));

  const orchMap = new Map((orchSDs || []).map(s => [s.sd_key, s]));

  // 2. Corrective SDs
  const { data: corrSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status')
    .like('sd_key', 'SD-CORR-%')
    .order('created_at', { ascending: false })
    .limit(10);

  // 3. Portfolio scores
  const { data: scores } = await supabase
    .from('eva_vision_scores')
    .select('total_score, threshold_action, created_by')
    .not('created_by', 'eq', 'synthetic-LEAD-workaround');

  const organic = (scores || []).filter(s => s.created_by !== 'manual-chairman-override');
  const avg = organic.length > 0
    ? Math.round(organic.reduce((a, r) => a + r.total_score, 0) / organic.length * 10) / 10
    : 0;
  const escalateCount = (scores || []).filter(s => s.threshold_action === 'escalate').length;
  const acceptCount = (scores || []).filter(s => s.threshold_action === 'accept').length;

  // 4. Open gaps (from eva_vision_gaps if it exists)
  let openGaps = 0;
  try {
    const { data: gaps } = await supabase
      .from('eva_vision_gaps')
      .select('id')
      .eq('status', 'open');
    openGaps = gaps?.length || 0;
  } catch { /* table may not have data yet */ }

  const report = {
    generated_at: new Date().toISOString(),
    portfolio: { avg_score: avg, total_scored: organic.length, escalate_count: escalateCount, accept_count: acceptCount, open_gaps: openGaps },
    rounds: rounds.map(r => {
      const sd = orchMap.get(r.key);
      return { ...r, status: sd?.status || 'not found', phase: sd?.current_phase || 'unknown' };
    }),
    corrective_sds: (corrSDs || []).map(s => ({ sd_key: s.sd_key, title: s.title, status: s.status })),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n\x1b[1m\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m EVA VISION GOVERNANCE REPORT\x1b[0m');
  console.log(`\x1b[2m Generated: ${new Date().toLocaleString()}\x1b[0m`);
  console.log('\x1b[36m═══════════════════════════════════════════════════════════\x1b[0m\n');

  // Portfolio summary
  console.log('\x1b[1m  PORTFOLIO HEALTH\x1b[0m\n');
  const avgColor = avg >= 80 ? '\x1b[32m' : avg >= 70 ? '\x1b[33m' : '\x1b[31m';
  console.log(`  Average Score:  ${avgColor}\x1b[1m${avg}/100\x1b[0m (${organic.length} SDs scored organically)`);
  console.log(`  Escalate Tier:  \x1b[31m${escalateCount}\x1b[0m SDs | Accept Tier: \x1b[32m${acceptCount}\x1b[0m SDs`);
  console.log(`  Open Gaps:      ${openGaps}`);

  // Round history
  console.log('\n\x1b[1m  ROUND HISTORY\x1b[0m\n');
  for (const r of report.rounds) {
    const statusIcon = r.status === 'completed' ? '\x1b[32m✓\x1b[0m' : r.status === 'draft' ? '\x1b[33m○\x1b[0m' : '\x1b[36m→\x1b[0m';
    console.log(`  ${statusIcon} \x1b[1m${r.label}\x1b[0m — ${r.purpose}`);
    console.log(`    \x1b[2mStatus: ${r.status} | Phase: ${r.phase}\x1b[0m`);
  }

  // Corrective SDs
  if (report.corrective_sds.length > 0) {
    console.log('\n\x1b[1m  CORRECTIVE SDs\x1b[0m\n');
    for (const s of report.corrective_sds) {
      const icon = s.status === 'completed' ? '\x1b[32m✓\x1b[0m' : s.status === 'cancelled' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m→\x1b[0m';
      const titleShort = s.title.length > 55 ? s.title.substring(0, 52) + '...' : s.title;
      console.log(`  ${icon} ${s.sd_key.padEnd(30)} ${titleShort}`);
    }
  }

  console.log('\n\x1b[2m  Run with --json for machine-readable output\x1b[0m\n');
}

main().catch(err => { console.error(err.message); process.exit(1); });
