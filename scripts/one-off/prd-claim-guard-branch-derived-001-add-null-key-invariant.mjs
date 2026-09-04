// PLAN-phase enrichment: STORIES sub-agent (evidence db49511a-4676-4e6a-9f88-cc55ced9082b) found the
// single highest-blast-radius line in this SD: ENFORCEMENT-4's block predicate is
// `Boolean(claimedSdKey) && claimedSdKey !== worktreeKey`. Today the whole block sits behind
// `if (match && match[1] !== 'qf')`, so a non-matching path is UNREACHABLE, not a null-key case
// evaluated by the predicate. If FR-1's new derivation replaces that guard with a plain
// `if (derivedKey) {...}` (or drops the guard) WITHOUT an equivalent "no key -> skip the whole
// block" early return, a null derived key paired with any real claimedSdKey would satisfy
// Boolean(null) === false, so the AND short-circuits to false -- appearing safe in isolation, but
// EXEC must not assume this from memory; it must preserve an explicit early-return-on-no-key
// gate at the top of ENFORCEMENT-4, structurally equivalent to today's `if (match && ...)`, so a
// future refactor cannot accidentally invert fail-open to fail-closed by restructuring the
// derivation chain. This is added to FR-3 (fail-open) and a new TR-5 rather than left as an
// external note, so PLAN-TO-EXEC and EXEC-TO-PLAN gates both see it as part of the spec.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-11f9e1ac-a769-47f1-82b4-950a32a0d977';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr || !prd) { console.error('PRD_FETCH_FAILED', fetchErr); process.exit(1); }

  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id !== 'FR-3') return fr;
    return {
      ...fr,
      description: fr.description +
        ' CRITICAL INVARIANT (STORIES sub-agent finding, evidence db49511a-4676-4e6a-9f88-cc55ced9082b): ENFORCEMENT-4\'s block predicate is `Boolean(claimedSdKey) && claimedSdKey !== worktreeKey`. Today the ENTIRE block sits behind `if (match && match[1] !== \'qf\')` -- a non-matching path never reaches the predicate at all, it is not merely a null-key case the predicate happens to handle safely. The new derivation MUST preserve a structurally equivalent early-return-on-no-derived-key gate at the top of ENFORCEMENT-4 (not merely rely on `Boolean(null)===false` short-circuiting inside the predicate as an implicit safety net), so a future refactor of the derivation chain cannot silently invert the guard from fail-open to fail-CLOSED fleet-wide by restructuring away that early return.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'ENFORCEMENT-4 retains an explicit early-return/skip when NO key can be derived from any source (branch, marker, or path) -- verified by a dedicated unit specimen asserting the whole block is skipped, not merely that the predicate evaluates false',
      ],
    };
  });

  const technical_requirements = [
    ...prd.technical_requirements,
    {
      id: 'TR-5',
      requirement: 'Fail-open is an explicit early return, never an implicit falsy short-circuit',
      rationale:
        'shouldBlockWorktreeEdit\'s predicate (Boolean(claimedSdKey) && claimedSdKey !== worktreeKey) would ALSO evaluate false for a null derived key, which looks safe -- but relying on that as the fail-open mechanism removes the visible guard clause a future reader/refactor depends on. EXEC must keep an explicit "if no key derived, skip the whole ENFORCEMENT-4 block" gate (mirroring today\'s `if (match && match[1] !== \'qf\')` structurally), not just trust the predicate\'s arithmetic. Flagged as the SD\'s single highest-blast-radius line by the STORIES sub-agent (evidence db49511a-4676-4e6a-9f88-cc55ced9082b).',
    },
  ];

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements })
    .eq('id', PRD_ID);
  if (updateErr) { console.error('PRD_UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('PRD_ENRICHED', { fr3_ac_count: functional_requirements.find(f => f.id === 'FR-3').acceptance_criteria.length, tr_count: technical_requirements.length });
}

if (isMainModule(import.meta.url)) {
  main();
}
