#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001';

const census_summary = {
  artifact: 'docs/architecture/fleet-liveness-predicate-consumer-census.md',
  key_finding: '"16" is not reproducible from any single measure. isDispatchableFleetMember: 5 direct + 1 transitive (via isLiveCountableWorker) = 6 production call sites. everClaimed: 0 direct production callers, ~13 transitive call sites across 9 files via isFleetWorker/liveFleetWorkers. The likely origin of "16" is tests/unit/session-predicates.test.js containing exactly 16 occurrences of the string — a test-assertion count, not a call-site count.',
  additional_axes_found: ['quarantined_at (session-predicates.mjs:104, QF-20260705-436)', 'parked_until (session-predicates.mjs:110, QF-20260705-347)', 'isRecentlyReleased (genuine-worker.mjs:226, only consumer coordinator-idle-qf-hint.mjs:220)'],
  uncalled_sibling_predicate: 'isGenuineCountableWorker (session-predicates.mjs:69) has zero production call sites — defined but unused.',
  verdict_breakdown: 'Every one of the 19 classified call sites (6 isDispatchableFleetMember + 13 everClaimed-family) is verdict=Correct for its current predicate choice. Zero incorrect sites found. One AMBIGUOUS flag: coordinator-idle-qf-hint.mjs:269 (verify no other liveFleetWorkers consumer needs the isRecentlyReleased layering it already added).',
  applications_duplicate_confirmed: {
    active_row: '75c6da62-a9ad-4f07-a5df-ab91eeeff8d0',
    inactive_row: 'f37300af-013b-4976-a3b1-2bba043d3fa8',
    disposition_proposed: 'Archive/deprecate the inactive row once no consumer resolves app-by-name to it, or add an explicit is_canonical marker. Merge/delete deferred to a separate governed change.',
  },
  follow_on_sd_scoping: 'Net conclusion: given zero incorrect sites, no wide predicate-substitution SD is warranted. Narrow follow-on: (1) confirm the one ambiguous site, (2) document the divergence rationale as a standing cross-reference comment, (3) file the applications-duplicate disposition as its own tiny governed change.',
  code_changes_shipped: 'ZERO — this SD is measurement-only. Diff is limited to the census artifact (docs/architecture/) and this evidence-recording one-off script.',
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, census_summary };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('census_summary recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
