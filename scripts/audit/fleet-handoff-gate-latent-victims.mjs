#!/usr/bin/env node
/**
 * SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 FR-4: Fleet pre-merge audit.
 *
 * Enumerates SDs whose `current_phase` ranks BELOW their latest accepted
 * `to_phase` in `sd_phase_handoffs`. These are SDs the broken
 * `assertSweepHandoffGate` (silent fail-open since 2026-05-08) MAY have
 * silently allowed `stale-session-sweep` to reset.
 *
 * Output: TSV to stdout (header + sorted rows). Run by LEAD at PLAN-VERIFY
 * to disclose latent victim SDs at PR-review time, before merge.
 *
 * Usage:
 *   node scripts/audit/fleet-handoff-gate-latent-victims.mjs
 *   node scripts/audit/fleet-handoff-gate-latent-victims.mjs --save docs/audits/<sd-key>-latent-victims-<date>.tsv
 *
 * Notes:
 *   - phaseRank mirrors lib/exec-context-guard.mjs::PHASE_RANK exactly.
 *   - Phases not in the rank mapping are skipped (consistent with guard).
 *   - "Phase regression" = current_phase rank < latest_accepted to_phase rank.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { PHASE_RANK } from '../../lib/exec-context-guard.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const saveIdx = args.indexOf('--save');
const savePath = saveIdx >= 0 ? args[saveIdx + 1] : null;

async function main() {
  const { data: sds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, current_phase, status')
    .not('current_phase', 'is', null);

  if (sdErr) {
    console.error('SD_LOAD_ERR:', sdErr.message);
    process.exit(1);
  }

  const { data: handoffs, error: hErr } = await supabase
    .from('sd_phase_handoffs')
    .select('sd_id, to_phase, created_at, status, handoff_type')
    .eq('status', 'accepted');

  if (hErr) {
    console.error('HANDOFF_LOAD_ERR:', hErr.message);
    process.exit(1);
  }

  // Latest accepted handoff per sd_id
  const latestByUuid = new Map();
  for (const h of handoffs) {
    const cur = latestByUuid.get(h.sd_id);
    if (!cur || new Date(h.created_at) > new Date(cur.created_at)) {
      latestByUuid.set(h.sd_id, h);
    }
  }

  const lines = [
    '# SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 FR-4 Fleet Audit: handoff-gate latent victims',
    `# Generated: ${new Date().toISOString()}`,
    '# A row appears here if the SD\'s current_phase ranks BELOW its latest accepted to_phase.',
    '# These SDs may have been silently reset by stale-session-sweep due to the broken guard.',
    '# Manual triage advised post-merge for any rows below.',
    '#',
    'sd_key\tcurrent_phase\tlatest_accepted_to_phase\tphase_rank_diff\taccepted_handoff_count\tlatest_handoff_type\tstatus',
  ];

  // Per-SD accepted handoff count
  const countByUuid = new Map();
  for (const h of handoffs) {
    countByUuid.set(h.sd_id, (countByUuid.get(h.sd_id) || 0) + 1);
  }

  const victims = [];
  for (const sd of sds) {
    const latest = latestByUuid.get(sd.id);
    if (!latest) continue;
    const curRank = PHASE_RANK[sd.current_phase];
    const handoffRank = PHASE_RANK[latest.to_phase];
    if (curRank === undefined || handoffRank === undefined) continue;
    if (curRank < handoffRank) {
      victims.push({
        sd_key: sd.sd_key,
        current_phase: sd.current_phase,
        latest_to_phase: latest.to_phase,
        diff: handoffRank - curRank,
        count: countByUuid.get(sd.id) || 0,
        latest_type: latest.handoff_type || '',
        status: sd.status,
      });
    }
  }

  victims.sort((a, b) => b.diff - a.diff || (b.count - a.count));

  for (const v of victims) {
    lines.push(`${v.sd_key}\t${v.current_phase}\t${v.latest_to_phase}\t${v.diff}\t${v.count}\t${v.latest_type}\t${v.status}`);
  }

  const out = lines.join('\n') + '\n';
  process.stdout.write(out);

  console.error(`\n[fleet-audit] ${victims.length} potential victim SD(s) found across ${sds.length} active SDs.`);

  if (savePath) {
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(savePath, out);
    console.error(`[fleet-audit] Output saved to: ${savePath}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('UNHANDLED:', err);
  process.exit(1);
});
