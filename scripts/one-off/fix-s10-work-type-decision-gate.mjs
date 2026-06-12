#!/usr/bin/env node
/**
 * SD-MAN-INFRA-GATE-BAR-REGIME-001 (FR-2) — fix the S10 work_type mislabel.
 *
 * venture_stages stage 10 (Customer & Brand Foundation, gate_type=promotion)
 * carries work_type='artifact_only', which stage-governance.js excludes from
 * blockingStages — S10's chairman gate silently never blocks. Sitting #1
 * item 1 ruled S10 must block like its peer gates. Single-row data fix,
 * reversible: --rollback restores artifact_only.
 *
 * S18 and S25 carry the same artifact_only label but the ruling names S10
 * only — they are left unchanged and documented for chairman follow-up.
 *
 * Usage: node scripts/one-off/fix-s10-work-type-decision-gate.mjs [--rollback]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const rollback = process.argv.includes('--rollback');
const target = rollback ? 'artifact_only' : 'decision_gate';

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: before, error: readErr } = await db
  .from('venture_stages')
  .select('stage_number, stage_name, gate_type, work_type')
  .eq('stage_number', 10)
  .single();
if (readErr) { console.error('read failed:', readErr.message); process.exit(1); }
console.log('before:', JSON.stringify(before));

if (before.work_type === target) {
  console.log(`idempotent: work_type already '${target}' — nothing to do.`);
  process.exit(0);
}

const { data: updated, error } = await db
  .from('venture_stages')
  .update({ work_type: target })
  .eq('stage_number', 10)
  .select('stage_number, work_type');
if (error) { console.error('update failed:', error.message); process.exit(1); }
if (!updated || updated.length !== 1) { console.error(`expected 1 row, got ${updated?.length}`); process.exit(1); }
console.log('after:', JSON.stringify(updated[0]));
console.log(rollback ? 'ROLLBACK complete (artifact_only restored).' : 'FIX complete — S10 now classifies into blockingStages.');
