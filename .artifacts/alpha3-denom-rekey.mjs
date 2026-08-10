import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001';
const { data: cur } = await s.from('strategic_directives_v2').select('metadata,scope').eq('sd_key',SD).single();
const scope = 'IN (final, per coordinator SPLIT ruling 8280af5a): FR-2 ratify the 3-leg/6-point denominator in lib/drive-loop/score/aggregate.js via a frozen DRIVE_SCORE_LEGS SSOT (SPEC_LEG_COUNT derived, Adam d50b9f12 + coordinator ac704cbd provenance); FR-3 fail-loud phantom-leg guard (assertLegSetRatified / assertProducedLegsMatchSSOT — minting a leg is an explicit chairman-surfaced spec change). This SD ratifies the DENOMINATOR (its namesake) and builds the guard.\nOUT / SPLIT: leg INPUT wiring that makes measured_legs>0 is follow-on infrastructure, NOT this SD. leg1_landed (git-runner CI cron) -> SD-LEO-INFRA-DRIVE-SCORE-LEG1-001. leg2_uptake (prior-report top-5 snapshot; the live dispatch_rank CLEARS on claim, structurally excluding leg2 own numerator — the adding-to-an-exclusion-set class, coordinator 8280af5a) -> SD-LEO-INFRA-DRIVE-SCORE-LEG2-001. FR-4 (>0 measured legs positive control) re-keys to those follow-ons. This SD completion does NOT claim any leg wiring; leg4_capacity stays fail-closed pending APPLY-STATE-002.';
const success_criteria = [
  { criterion: 'FR-2: aggregate denominator reads 3 legs / 6 points, SPEC_LEG_COUNT derived from the frozen DRIVE_SCORE_LEGS SSOT, with Adam d50b9f12 + coordinator ac704cbd provenance inline; the placeholder NOT-RATIFIED/X8 wording is gone', measure: 'SPEC_LEG_COUNT===3 derived from DRIVE_SCORE_LEGS; aggregate.test.js asserts the ratified denominator LITERALLY (/X\/6/, not the prior self-referential constant) + the provenance tokens' },
  { criterion: 'FR-3: a leg minted without a ratified_by marker, or a produced/SSOT leg-set drift, fails CI loudly', measure: 'assertLegSetRatified throws on a phantom (positive control); assertProducedLegsMatchSSOT fails bidirectionally; the ratified set passes — two-sided in drive-score-legs.test.js' },
  { criterion: 'Leg INPUT wiring is split out and NOT claimed by this SD: leg1 -> SD-LEO-INFRA-DRIVE-SCORE-LEG1-001, leg2 -> SD-LEO-INFRA-DRIVE-SCORE-LEG2-001; FR-4 (>0 measured legs) re-keys to those follow-ons', measure: 'SD text + metadata name both follow-ons; leg1/leg2/leg4 remain in unavailable_legs with reasons' },
];
const metadata = { ...cur.metadata,
  split_completion_ruling: '8280af5a (Option A SPLIT): FR-2/FR-3 land as this SD completion; leg2 snapshot -> SD-LEO-INFRA-DRIVE-SCORE-LEG2-001, leg1 -> SD-LEO-INFRA-DRIVE-SCORE-LEG1-001; FR-4 re-keyed to follow-ons',
  leg1_split_followon: 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-001',
  leg2_split_followon: 'SD-LEO-INFRA-DRIVE-SCORE-LEG2-001',
  fr4_rekeyed: 'FR-4 (>0 measured legs positive control) is delivered by the leg-wiring follow-ons, not this denominator-ratification SD',
};
const { error } = await s.from('strategic_directives_v2').update({ scope, success_criteria, metadata }).eq('sd_key',SD);
if(error){console.error(error);process.exit(1);}
console.log('re-keyed: FR-2/FR-3 completion; leg2 split to SD-LEO-INFRA-DRIVE-SCORE-LEG2-001');
