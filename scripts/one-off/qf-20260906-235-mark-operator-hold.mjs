// QF-20260906-235 ADDENDUM — mark VENTURE_FIXTURE_SWEEP_V1 as an operator hold, not staleness.
//
// The flag-governance digest recommends KILL for this flag daily (disabled-aging), but it is OFF
// by a deliberate operator decision (87 of 89 ventures are fixture residue; coordinator seat
// 6acf5a48 L1369), not neglect. Data-only change (an existing free-text column), no schema
// change: append an [OPERATOR_HOLD: ...] marker to enablement_criteria that
// lib/feature-flags/governance-review.js's classifyFlag now pattern-matches to downgrade
// KILL -> KEEP.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FLAG_KEY = 'VENTURE_FIXTURE_SWEEP_V1';
const MARKER = '[OPERATOR_HOLD: 87 of 89 ventures are fixture residue; deliberately left OFF pending operator review — coordinator seat 6acf5a48 L1369]';

async function main() {
  const { data: row, error: readErr } = await supabase
    .from('leo_feature_flags')
    .select('id, enablement_criteria')
    .eq('flag_key', FLAG_KEY)
    .single();
  if (readErr) throw new Error(readErr.message);

  if (row.enablement_criteria && row.enablement_criteria.includes('[OPERATOR_HOLD')) {
    console.log(`OK: ${FLAG_KEY} already carries an OPERATOR_HOLD marker; no change needed.`);
    return;
  }

  const enablement_criteria = row.enablement_criteria
    ? `${MARKER} ${row.enablement_criteria}`
    : MARKER;

  const { error: writeErr } = await supabase
    .from('leo_feature_flags')
    .update({ enablement_criteria })
    .eq('id', row.id);
  if (writeErr) throw new Error(writeErr.message);

  const { data: after, error: verifyErr } = await supabase
    .from('leo_feature_flags')
    .select('enablement_criteria')
    .eq('id', row.id)
    .single();
  if (verifyErr) throw new Error(verifyErr.message);
  if (!after.enablement_criteria || !after.enablement_criteria.includes('[OPERATOR_HOLD')) {
    throw new Error('VERIFY FAILED: marker did not persist');
  }
  console.log(`OK: ${FLAG_KEY} marked with [OPERATOR_HOLD] and verified.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
