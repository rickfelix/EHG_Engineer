#!/usr/bin/env node
// Records the EXEC-phase final TR-2 measurement (0 regressions, 76 newly-passing out of 4678
// live PRDs, measured at implementation time -- superseding VALIDATION's earlier 109/1698
// LEAD-phase snapshot, since the live population grows between phases) into the PRD's
// acceptance_criteria as the authoritative, ship-time figure.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001';

const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('acceptance_criteria')
  .eq('id', PRD_ID)
  .single();

if (error) { console.error('❌ Fetch failed:', error.message); process.exit(1); }

const ac = data.acceptance_criteria;
ac[0] =
  "A full-population re-measurement (4677 PRDs, same methodology as VALIDATION c84eda3c-0670-406e-80a6-d7c42b650f02) shows 0 regressions from the fixed implementation vs the current gate, and the newly-passing count is documented (VALIDATION measured 109 at LEAD-phase time against a 1698-PRD heuristic-path snapshot; the QF's original, unreproduced claim was 216; EXEC's final ship-time re-run against the live population at implementation time -- 4678 PRDs total, 4618 heuristic-path -- measured 76 newly-passing / 0 regressions, which is the authoritative figure since the live population grows between phases).";

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ acceptance_criteria: ac })
  .eq('id', PRD_ID);

if (updateErr) { console.error('❌ Update failed:', updateErr.message); process.exit(1); }

console.log('✅ EXEC-phase regression measurement recorded in PRD acceptance_criteria (0 regressions, 76 newly-passing / 4678 total PRDs).');
