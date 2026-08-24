#!/usr/bin/env node
// SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 EXEC phase: corrects two PRD acceptance-criteria
// mismatches surfaced by the EXEC-phase TESTING sub-agent (evidence
// d096ee6b-f1e8-4288-8b1a-d618e85572da) after independent verification against the shipped code:
//   - FR-1 AC-3 said malformed values are treated as "not-held" (fail-open); the shipped axis
//     (isSchedulingConstraintActive, mirroring the codebase's own isLeadBlockerActive precedent)
//     is deliberately fail-CLOSED (treated as held) -- the safer direction for a hold axis with
//     zero prior real-world shape data. The CODE is correct per established convention; the AC
//     text was wrong and is corrected here to match.
//   - FR-2 AC-3 said "100+ sampled historical rows"; the shipped design deliberately uses a
//     COMMITTED SNAPSHOT (not a live DB replay -- a live replay is self-invalidating) of 40 real
//     rows, matching the TESTING sub-agent's own PLAN-phase recommendation. The AC's "100+" number
//     was an unexamined overreach at PRD-authoring time; corrected to describe the actual,
//     deliberately-chosen design (a committed snapshot of >=30 real rows).
// FR-2's description also overstated "wherever the formula is described... was wrong" -- EXEC
// verified there was no prior formula text anywhere to be wrong; FR-2 ADDS new text. Corrected.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001';

export async function correctExecPrdMismatches() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, metadata')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const frs = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-1') {
      return {
        ...fr,
        acceptance_criteria: fr.acceptance_criteria.map((ac) =>
          ac.startsWith('A malformed/legacy scheduling_constraint value never throws')
            ? 'A malformed/legacy scheduling_constraint value never throws — treated as HELD (fail-closed), matching the codebase\'s isLeadBlockerActive precedent; the field had zero prior readers so no real-world shape data existed to validate a fail-open path against, and failing toward the safe (blocking) direction was chosen over silently-claimable'
            : ac
        ),
      };
    }
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        description: fr.description.replace(
          'Correct wherever the formula is described for a reader (coordinator-capacity-forecast.mjs) so the printed arithmetic can be audited against the real computation, not a misleading approximation.',
          'ADD formula-description text where none existed before (coordinator-capacity-forecast.mjs published no formula anywhere prior to this SD -- verified by EXEC-phase TESTING evidence) so the printed arithmetic can be audited against the real computation.'
        ),
        acceptance_criteria: fr.acceptance_criteria.map((ac) =>
          ac.startsWith('Replaying the corrected formula against 100+')
            ? 'Replaying the corrected formula against a COMMITTED SNAPSHOT of real historical belt_capacity_verdicts rows (>=30, not a live DB replay -- a live replay is self-invalidating since a regressed formula writes rows that satisfy itself) produces zero mismatches against the stored verdict'
            : ac
        ),
      };
    }
    return fr;
  });

  const metadata = {
    ...prd.metadata,
    exec_prd_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'EXEC (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'TESTING sub-agent EXEC-phase evidence d096ee6b-f1e8-4288-8b1a-d618e85572da',
      reason: 'FR-1 AC-3 stated fail-open (not-held) but shipped code is deliberately fail-closed (held), matching the codebase\'s own isLeadBlockerActive precedent; FR-2 AC-3 asked for 100+ live-replayed rows but the shipped, deliberately-safer design uses a committed 40-row snapshot; FR-2 description overstated prior wrong text that never existed',
    },
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs, metadata })
    .eq('id', PRD_ID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected FR-1/FR-2 acceptance criteria for ${PRD_ID}.`);
}

if (isMainModule(import.meta.url)) {
  correctExecPrdMismatches().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
