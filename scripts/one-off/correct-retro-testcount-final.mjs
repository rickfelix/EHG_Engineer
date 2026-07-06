#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = '3fe2f41a-2148-407c-9719-abaa2dee64ed';

const { data: current, error: fetchErr } = await supabase
  .from('retrospectives')
  .select('what_went_well')
  .eq('id', RETRO_ID)
  .single();
if (fetchErr) { console.error(fetchErr.message); process.exit(1); }

const wgw = current.what_went_well.map(item =>
  item.startsWith('18 new unit tests')
    ? item.replace('18 new unit tests across 3 new test files', '21 new unit tests across 3 new test files (including 3 regression tests added during round-1 adversarial-review remediation)')
    : item
);

const { error: updateErr } = await supabase
  .from('retrospectives')
  .update({ what_went_well: wgw })
  .eq('id', RETRO_ID);

if (updateErr) { console.error('[correct-retro-final] Failed:', updateErr.message); process.exit(1); }
console.log('[correct-retro-final] Test count corrected to 21 (final, post-round-1-remediation).');
