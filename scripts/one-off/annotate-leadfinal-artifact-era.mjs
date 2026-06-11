#!/usr/bin/env node
/**
 * One-off: annotate the LEAD-FINAL "artifact era" rejected rows.
 * SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-1)
 *
 * Before the FR-1 fix, every completion-action (LEAD-FINAL-APPROVAL) failure was
 * inserted into sd_phase_handoffs as status='rejected' while every acceptance went
 * only to leo_handoff_executions — so analytics reading sd_phase_handoffs saw
 * LEAD-FINAL as 100% rejected. This script stamps metadata.artifact_era=true on
 * those historical rows so analytics can exclude them. NO rows are deleted or
 * status-changed.
 *
 * Usage: node scripts/one-off/annotate-leadfinal-artifact-era.mjs [--apply]
 *   (dry-run by default; prints counts)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Paginate (PostgREST clamps any read to 1000 rows/page — 1,257 rows live at ship time).
const PAGE = 1000;
const rows = [];
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await db
    .from('sd_phase_handoffs')
    .select('id, metadata, created_at')
    .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
    .eq('status', 'rejected')
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < PAGE) break;
}

const todo = (rows || []).filter((r) => !(r.metadata && r.metadata.artifact_era === true));
console.log(`LEAD-FINAL rejected rows: ${rows?.length || 0} total, ${todo.length} unannotated${APPLY ? '' : ' (dry-run — pass --apply)'}`);

if (APPLY) {
  let done = 0;
  for (const r of todo) {
    const { error: upErr } = await db
      .from('sd_phase_handoffs')
      .update({
        metadata: {
          ...(r.metadata || {}),
          artifact_era: true,
          artifact_reason: 'Pre-FR-1 split-brain: completion-action failures landed here while acceptances went to leo_handoff_executions (SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001). Exclude from rejection-rate analytics.'
        }
      })
      .eq('id', r.id);
    if (upErr) console.warn(`  annotate failed for ${r.id}: ${upErr.message}`);
    else done++;
  }
  console.log(`annotated: ${done}/${todo.length}`);
}
