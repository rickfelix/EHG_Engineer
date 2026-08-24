#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 LEAD phase: enriches the SD's placeholder
// fields (key_changes/strategic_objectives/risks/success_metrics were auto-generated
// [UNPOPULATED] stand-ins per metadata.needs_enrichment) with the real FR-1..FR-4 scope already
// present in metadata.plan_content. Unlike the two preceding SDs this session, the as-submitted
// premise is NOT contradicted by measurement -- LEAD independently reproduced the exact failure
// mode this SD describes while shipping PR #7502 in this same session (a CHANGELOG.md merge
// conflict against a concurrent worker's entry), so this is enrichment, not a scope correction.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function enrichLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const key_changes = [
    { change: 'Each SD/QF writes a per-SD changelog fragment file (changelog/<sd-key>.md) instead of hand-editing CHANGELOG.md directly', type: 'feature', impact: 'Eliminates the single shared append point that causes near-every-merge conflicts under parallel fleet sessions' },
    { change: 'A deterministic assembler script folds all fragment files into CHANGELOG.md in stable order, generated (never hand-merged)', type: 'feature', impact: 'Same fragment set always produces byte-identical CHANGELOG.md output' },
    { change: 'Migrate: preserve existing CHANGELOG.md content as the assembled base; update changelog-writing guidance (.claude/commands/document.md and any /ship step that tells workers to edit CHANGELOG.md) to point at the fragment path', type: 'migration', impact: 'No history lost; new workers are not silently pointed at the old hand-edit workflow' },
    { change: 'Add a fixture proving two fragments landing on parallel branches merge with zero git conflicts and assemble deterministically', type: 'testing', impact: 'Directly demonstrates the structural fix, not just unit-level assembler correctness' },
  ];

  const strategic_objectives = [
    'Eliminate CHANGELOG.md as a shared mutable-file contention point across parallel fleet worker sessions',
    'Keep CHANGELOG.md itself as the same human-readable, git-history-preserving artifact it is today -- only the write path changes',
  ];

  const success_criteria = [
    { criterion: 'Zero CHANGELOG merge conflicts across parallel sessions post-adoption (measured over a week)', measure: 'Fixture: two independent branches each add a distinct changelog/<sd-key>.md fragment; merge both to a common base; assert zero git conflicts by construction (distinct filenames)' },
    { criterion: 'Assembler is deterministic (same fragments -> byte-identical CHANGELOG.md)', measure: 'Fixture: run the assembler twice against the same fragment set; assert byte-identical output both times, and against a fixed stable ordering rule (not filesystem enumeration order, which is not guaranteed stable)' },
    { criterion: 'Existing CHANGELOG.md history is preserved as the assembled base after migration', measure: 'Diff the pre-migration CHANGELOG.md against the post-migration assembled output for all pre-existing entries; assert byte-identical for everything predating the cutover' },
  ];

  const risks = [
    { risk: 'Workers keep hand-editing CHANGELOG.md out of habit because guidance in .claude/commands/document.md (and any /ship step referencing it) is not actually updated to the fragment path', impact: 'medium', likelihood: 'medium', mitigation: 'FR-3 explicitly requires updating the changelog-writing guidance at its real location, verified by grep for CHANGELOG.md references across .claude/commands/ and skills before closing this SD' },
    { risk: 'Assembler ordering is non-deterministic if it relies on filesystem directory enumeration order rather than an explicit, stable sort key (e.g. fragment filename or a stamped date)', impact: 'medium', likelihood: 'low', mitigation: 'FR-2 requires the assembler to be idempotent and conflict-free BY CONSTRUCTION; the fixture in FR-4 explicitly asserts byte-identical repeated runs, catching a non-deterministic sort immediately' },
    { risk: 'Migration accidentally drops or reorders pre-existing CHANGELOG.md content when folding it in as the assembled base', impact: 'high', likelihood: 'low', mitigation: 'FR-3 treats the existing file as a preserved base, not something regenerated from scratch; success_criteria requires a byte-identical diff check against pre-migration content' },
  ];

  const success_metrics = [
    { metric: 'CHANGELOG merge conflict rate', target: 'Zero conflicts across parallel sessions, measured over the week following adoption (baseline: 2 conflicts in one Golf-3 session same day this SD was filed, plus the LEAD verifier independently reproducing one shipping PR #7502 this same session)' },
    { metric: 'Assembler determinism', target: '100% byte-identical output across repeated runs against the same fragment set' },
    { metric: 'Zero regressions', target: 'Pre-existing CHANGELOG.md content byte-identical in the assembled output' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_enrichment: {
      enriched_at: new Date().toISOString(),
      enriched_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      reason: 'as-submitted premise independently corroborated (LEAD hit this exact CHANGELOG.md merge conflict shipping PR #7502 this same session); key_changes/strategic_objectives/risks/success_metrics were auto-generated [UNPOPULATED] placeholders per metadata.needs_enrichment, replaced with the real FR-1..FR-4 scope from metadata.plan_content plus honest risk/metrics analysis',
    },
    needs_enrichment: [],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      success_criteria,
      risks,
      success_metrics,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Enriched LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  enrichLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
