#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001: corrects strategic_directives_v2.success_criteria,
// which was missed by the earlier plan-precondition-correction.mjs (that script updated
// description/key_changes/risks/metadata but not success_criteria). A /ship deep-tier adversarial
// review caught this: all 3 success_criteria entries still asserted the FALSE "merge-base"
// precondition, and criterion 3 specifically claimed the one-side-after-divergence scenario
// "still conflicts" -- which is backwards for the ours-side-only case (TS-3b resolves CLEANLY).
// Independently re-verified against the live SD row before fixing.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function correctSuccessCriteria() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const success_criteria = [
    {
      criterion: 'The default git merge strategy conflicts on a same-date/same-category concurrent CHANGELOG.md append (documents the problem)',
      measure: "Isolated temp-repo fixture (TS-1): two branches from a common base each append a distinct entry under the same `## YYYY-MM-DD` / `### Category`; default merge produces CONFLICT (content)",
    },
    {
      criterion: 'With `merge=union` present in the CHECKED-OUT ("ours") branch\'s history at merge time, the identical scenario merges with zero conflicts and both entries preserved',
      measure: "Same fixture (TS-2), .gitattributes with the rule present in the checked-out branch's own history; merge succeeds automatically, resulting file contains both entries under the correct heading, zero conflict markers (order not asserted -- union output order tracks merge direction, not date/SD key)",
    },
    {
      criterion: 'The REAL precondition (checked-out/"ours" side presence at merge time, NOT the merge-base) is proven by two complementary fixture variants, not assumed',
      measure: "TS-3a: attribute present ONLY on the incoming (theirs) side, absent from the checked-out (ours) side -- merge STILL CONFLICTS, proving ours-side presence is what matters. TS-3b: attribute present ONLY on the checked-out (ours) side (added after divergence from a common ancestor that never had it), incoming side never had it either -- merge resolves CLEANLY, the decisive sensitivity check.",
    },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    success_criteria_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f), caught by /ship deep-tier adversarial review',
      reason: 'success_criteria still carried the false "merge-base precondition" framing and criterion 3 specifically claimed the wrong outcome (CONFLICT) for the TS-3b scenario, which actually resolves CLEANLY -- the earlier plan-precondition-correction.mjs updated description/key_changes/risks/metadata but missed this field.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ success_criteria, metadata })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected success_criteria for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctSuccessCriteria().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
