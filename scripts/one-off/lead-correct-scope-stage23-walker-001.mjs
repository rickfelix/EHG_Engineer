#!/usr/bin/env node
// LEAD-phase scope correction for SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001.
//
// Two defects found during LEAD investigation (Explore sub-agent, 2026-09-05):
//
// 1. metadata.functional_requirements was auto-extracted by a naive sentence-splitter
//    over the `scope` prose and produced garbled fragments (e.g. FR-1's title is
//    "list after ELEVEN-001-A;" with no description) instead of real FR statements.
//    Regenerated cleanly here from the same scope prose, which itself is well-formed
//    and remains the source of record — this only fixes the derived metadata array.
//
// 2. FR-13 (and the matching success_criteria entry) instruct writing the stage-23
//    walk re-run id onto "ELEVEN-001 FR-4". Verified against ELEVEN-001's live PRD:
//    FR-4 there is "Edit surface — journey #5 (stp-ce40)", unrelated to walk re-runs.
//    ELEVEN-001 has no FR about recording a walk run id. Corrected to target a
//    metadata field on the ELEVEN-001 SD row directly (metadata.stage23_walk_run_id),
//    which is queryable, doesn't corrupt an unrelated FR, and satisfies the same
//    intent (a record on ELEVEN-001, not on this SD).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

const functional_requirements = [
  { id: 'FR-1', title: 'List surface override (stp-6aa6)', description: 'Hand-verified stepOverride for the list step, gated on ELEVEN-001-A merging.' },
  { id: 'FR-2', title: 'Multi-upload surface override (stp-d8b9)', description: 'Hand-verified stepOverride for multi-upload, gated on ELEVEN-001-B merging.' },
  { id: 'FR-3', title: 'Batch generate surface override (stp-bfdb)', description: 'Hand-verified stepOverride for batch generate, gated on ELEVEN-001-B merging.' },
  { id: 'FR-4', title: 'Edit surface override (stp-ce40)', description: 'Hand-verified stepOverride for edit, gated on ELEVEN-001-C merging.' },
  { id: 'FR-5', title: 'Copy surface override (stp-2496)', description: 'Hand-verified stepOverride for copy, gated on ELEVEN-001-C merging.' },
  { id: 'FR-6', title: 'Delete-surface override (stp-fc2f)', description: 'Hand-verified stepOverride for delete-surface, gated on ELEVEN-001-C merging.' },
  { id: 'FR-7', title: 'Approve / needs-review surface override (stp-686d)', description: 'Hand-verified stepOverride for approve/needs-review, gated on ELEVEN-001-D merging.' },
  { id: 'FR-8', title: 'Export surface override (stp-abd0)', description: 'Hand-verified stepOverride for export, gated on ELEVEN-001-E merging.' },
  { id: 'FR-9', title: 'Keywords surface override (stp-7903)', description: 'Hand-verified stepOverride for keywords, gated on ELEVEN-001-E merging.' },
  { id: 'FR-10', title: 'Suggestions surface override (stp-8c72)', description: 'Hand-verified stepOverride for suggestions, gated on ELEVEN-001-E merging.' },
  { id: 'FR-11', title: 'JSON view surface override (stp-58cd)', description: 'Hand-verified stepOverride for the JSON view, gated on ELEVEN-001-E merging.' },
  { id: 'FR-12', title: 'Registry completeness predicate (CI)', description: "A test loads the fourteen-journey specification of record and asserts every authenticated step_id has a registered stepOverride OR is on an explicit, dated 'surface not yet shipped' allowlist that shrinks to empty as FRs merge." },
  { id: 'FR-13', title: 'Walk re-run handoff', description: 'On the last override (FR-8..FR-11) merging, re-run the canonical stage-23 walk and write the run id to metadata.stage23_walk_run_id on the SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 row (corrected target — see LEAD note below; ELEVEN-001 has no FR for this).' },
];

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('scope, key_changes, success_criteria, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const scope = current.scope.replace(
    'FR-13 WALK RE-RUN HANDOFF: on the last override merging, the stage-23 walk is re-run by the canonical runner and the run id is written on ELEVEN-001 FR-4;',
    "FR-13 WALK RE-RUN HANDOFF: on the last override merging, the stage-23 walk is re-run by the canonical runner and the run id is written to metadata.stage23_walk_run_id on the SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 row [LEAD CORRECTION 2026-09-05: originally scoped as 'FR-4'; verified against ELEVEN-001's live PRD that FR-4 is 'Edit surface', unrelated — corrected to a dedicated metadata field so the handoff doesn't corrupt an unrelated FR];"
  );

  const key_changes = current.key_changes.map((kc) =>
    kc.change === 'FR-13 walk re-run handoff to ELEVEN-001 FR-4'
      ? { ...kc, change: 'FR-13 walk re-run handoff written to metadata.stage23_walk_run_id on ELEVEN-001 (corrected from the originally-scoped, nonexistent "ELEVEN-001 FR-4" target)' }
      : kc
  );

  const success_criteria = current.success_criteria.map((sc) =>
    sc.criterion === 'The walk re-run is handed to ELEVEN-001 FR-4 with its run id'
      ? {
          ...sc,
          criterion: 'The walk re-run is handed to ELEVEN-001 via metadata.stage23_walk_run_id',
          measure: "Instrument: SELECT metadata->>'stage23_walk_run_id' FROM strategic_directives_v2 WHERE sd_key='SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001' after the last override merges; expected reading: a stage-23 run id newer than 5662bf6e recorded there (its PASS or FAIL belongs to ELEVEN-001, not to this SD).",
        }
      : sc
  );

  const metadata = {
    ...current.metadata,
    functional_requirements,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrections: [
        'metadata.functional_requirements regenerated (was garbled sentence-fragment auto-extraction, no semantic content)',
        'FR-13 / key_changes / success_criteria: walk re-run target corrected from nonexistent "ELEVEN-001 FR-4" to metadata.stage23_walk_run_id on the ELEVEN-001 row (verified ELEVEN-001 FR-4 = Edit surface via live PRD read)',
      ],
      verified_via: 'Explore sub-agent LEAD investigation, cross-checked against product_requirements_v2 for SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001',
    },
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ scope, key_changes, success_criteria, metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ Scope corrected: functional_requirements regenerated, FR-13 target fixed.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
