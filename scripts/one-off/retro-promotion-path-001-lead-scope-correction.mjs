#!/usr/bin/env node
// SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 LEAD phase: corrects the SD record from its
// as-submitted plan_content (mechanism mischaracterized) to the measurement-verified scope.
// Basis: validation-agent evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d (CONDITIONAL_PASS, 92%),
// independently re-verified by LEAD directly against retro-clobber-guard.js and db-operations.js.
// See .claude/session-state.md "Update 1" for full rationale.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-RETRO-PROMOTION-PATH-001';

export async function correctLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const description = `RETRO promotion path: the clobber-guard's rich-content check conflates PROVENANCE with LENGTH, refusing to enhance 99.7% of auto-generated HANDOFF-type retrospectives -- plus a second, independent bug where the guard classifies a different row than the one actually being written.

## Problem (LEAD-corrected, validation-agent evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d)
The original submission framed this as a retro_type-based refusal ("HANDOFF->SD_COMPLETION promotion"). Verified against the actual code (lib/fleet -- correction: scripts/modules/handoff/lib/retro-clobber-guard.js classifyRetro()), retro_type plays NO role in the refusal -- its one retro_type check (retro_type==='SD_COMPLETION') cannot fire on a HANDOFF row by construction. The refusal comes from the rich_existing_content branch, which fires whenever generated_by is in AUTO_GENERATED_TYPES (i.e. the row IS machine-authored, which the guard's own docblock says should never be refused -- it exists to protect MANUALLY-curated content) AND hasRichContent() scores the content "rich" by character length alone. Replayed against all 1658 live retro_type=HANDOFF rows since 2026-06-01: 1653 (99.7%) refuse via exactly this branch -- both cited specimens' key_learnings[0] is a byte-identical 193-char boilerplate string. enhanceRetrospective's merge logic is effectively dead code.

A second, independent defect (not in the original submission, found during LEAD verification): enhanceRetrospective(supabase, existingId, ...) updates .eq('id', existingId), but the guard is consulted via isSafeToWriteRetro(supabase, sdId) -- which re-queries "most recent retro row for this sd_id", NOT the specific existingId row being written. Both cited specimen SDs carry 3 retro rows each (HANDOFF, SD_COMPLETION, INCIDENT); the guard can classify a different row than the one actually targeted for the write.

Recurrence is genuine and understated, not overstated: >=6 independently file-verified workaround specimens (not the original "2/2"), each bypassing enhanceRetrospective with a fresh INSERT citing this exact guard as the reason.

## Scope (LEAD-corrected from the as-submitted plan; see scope_reduction_percentage)
- FR-1: narrow the rich-content check in classifyRetro() (scripts/modules/handoff/lib/retro-clobber-guard.js) so it never fires for auto-generated content (generated_by in AUTO_GENERATED_TYPES) -- richness should gate MANUAL content only, matching the guard's own stated charter. The manual_retro and manual_retro_null_inferred branches (the actual source-incident protection) are untouched.
- FR-2: fix isSafeToWriteRetro's row-selection to classify the SAME row enhanceRetrospective is about to write (existingId), not "most recent row for this sd_id" -- the two can differ when an SD carries multiple retro rows.
- FR-3: make enhanceRetrospective's merge genuinely non-lossy for the fields it currently overwrites wholesale rather than merging: existing.description is currently dropped (only existing.title is appended) -- preserve it; the 7 scalar quality-signal fields (conducted_date, objectives_met, on_schedule, within_scope, team_satisfaction, velocity_achieved, business_value_delivered) are taken from newRetro only with no fallback to existing's values when newRetro omits them; auto_generated is unconditionally forced true, which would relabel a manually-authored existing retro as auto-generated, corrupting the very provenance column this guard family depends on -- only set it when the write is genuinely auto-provenance end to end.
- FR-4: regression suite -- (a) the manual-content clobber protection still refuses (the actual source incident this guard exists for, re-run as a fixture); (b) an auto-generated HANDOFF retro with rich boilerplate content now enhances successfully with content preserved/merged, replayed against a sample of the live population; (c) the guard classifies the correct row on a multi-retro SD fixture; (d) the refusal message, when it still fires (manual content), names which content would be at risk (diagnosability -- today's message is only a machine reason code).

## Explicitly out of scope (LEAD decision, deferred)
- Retro content/scoring semantics themselves (quality_score computation, hasRichContent's threshold tuning) -- unchanged.
- SD-LEO-INFRA-PLAN-LEAD-RETRO-001's presence-sequencing concern -- separate SD, already in the belt.
- The retro_type vs retrospective_type dual-column footgun documented elsewhere in the schema docs -- a known, separately-tracked naming/schema concern, not this SD's mechanism.`;

  const success_criteria = [
    { criterion: 'Auto-generated HANDOFF retros with rich boilerplate content enhance successfully instead of silently refusing', measure: 'Fixture: replay a sample of the 1658 live retro_type=HANDOFF population through the corrected classifyRetro(); assert the refusal rate for generated_by IN AUTO_GENERATED_TYPES rows drops to ~0% while the manual-content refusal rate is unchanged' },
    { criterion: 'The manual-content clobber protection (the actual source incident) is unregressed', measure: 'Fixture: reconstruct the 10/4/5-rich, generated_by=null shape from the original incident; assert classifyRetro() still refuses it' },
    { criterion: 'The guard classifies the row actually being written, not an unrelated row on the same SD', measure: 'Fixture: an SD with 3 retro rows (HANDOFF/SD_COMPLETION/INCIDENT); enhance the HANDOFF row specifically; assert the guard evaluated that row, not whichever is most recent by created_at' },
    { criterion: 'A successful promotion loses no existing content', measure: 'Fixture: an existing retro with populated description + all 7 scalar fields, enhanced by a newRetro that omits some of them; assert every existing value survives unless newRetro explicitly supplies a replacement, and auto_generated is not force-set to true when existing was manually authored' },
  ];

  const key_changes = [
    { change: 'Narrow classifyRetro()\'s rich-content check to fire only for non-auto-generated (manual) content', type: 'fix' },
    { change: 'Fix isSafeToWriteRetro to classify the specific row being written (existingId), not the most-recent row for the sd_id', type: 'fix' },
    { change: 'Make enhanceRetrospective\'s merge non-lossy for description, 7 scalar fields, and the auto_generated provenance flag', type: 'fix' },
    { change: 'Add regression fixtures for the clobber-protection non-regression, the promotion success case, the row-selection fix, and content preservation', type: 'testing' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'validation-agent evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d',
      reason: 'as-submitted plan_content mischaracterized the refusal mechanism as retro_type-based when it is actually a provenance-vs-length conflation in the rich-content check; true recurrence is >=6 specimens and 1653/1658 (99.7%) of the live HANDOFF population, not "2/2"; LEAD verification found a second independent bug (guard classifies the wrong row on multi-retro SDs) and a third real gap (non-lossy promotion) not in the original 1-FR submission',
    },
    mechanism_verifications: [
      {
        verified_by: 'validation-agent (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d); re-confirmed independently by LEAD',
        verified_at: 'scripts/modules/handoff/lib/retro-clobber-guard.js:101',
      },
      {
        verified_by: 'validation-agent (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d); re-confirmed independently by LEAD',
        verified_at: 'scripts/modules/handoff/lib/retro-clobber-guard.js:130',
      },
      {
        verified_by: 'validation-agent (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d); re-confirmed independently by LEAD',
        verified_at: 'lib/sub-agents/retro/db-operations.js:224',
      },
      {
        verified_by: 'validation-agent (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d); re-confirmed independently by LEAD',
        verified_at: 'lib/sub-agents/retro/db-operations.js:332',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      success_criteria,
      key_changes,
      scope_reduction_percentage: 0,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
