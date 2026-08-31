import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-PHASE-DESIGN-GOVERNANCE-001';

const description = `Phase-0 design (design-only, no production code) for the INVARIANT half of governance cascade enforcement, per Solomon ruling 7cdcbd96's explicit seam: "plumbing vs invariant -- cite THREAD-DOWNSTREAM AS DEFERRED, never assumed wired." LEAD measured the live drift specimen the ruling cites: strategic_directives_v2 rows carrying a roadmap_link_exception grew from 98 to 106 reasonless (no operator_reason) after a ratified chairman decision (Adam's P2 both-halves binding) -- 106/414 rows with an exception currently carry no reason, live-confirmed 2026-08-31. Also found a NAME COLLISION requiring explicit disambiguation: a DB trigger named GR-GOVERNANCE-CASCADE already exists (supabase/migrations/20260302_governance_guardrail_triggers.sql, SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001) but checks a DIFFERENT thing entirely (SD-to-strategic_objectives traceability, not ratified-decision propagation into downstream layers). SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001 (status=deferred/EXEC) already owns the propagation-plumbing half (threading ratified decisions into EVA stage producers like S7 pricing) -- this design does not duplicate it, per the ruling's explicit instruction.`;

const scope = `IN SCOPE (design-only deliverable, no production code touched):
- Author docs/design/governance-cascade-invariant-design.md settling the INVARIANT question the ruling carved out: what should DETECT (not fix) a ratified decision whose downstream requirement went unwired, using the live-verified 106/414 reasonless roadmap_link_exception rows as the concrete, reviewable specimen.
- Explicitly disambiguate this design's "governance cascade" from the existing, differently-scoped GR-GOVERNANCE-CASCADE DB trigger (SD-to-objective traceability) -- a naming collision a future reader would otherwise conflate.
- Cite SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001 as the deferred plumbing half this design does NOT rebuild or duplicate, per Solomon ruling 7cdcbd96's seam.
- Propose 2-3 buildable child SDs for the invariant-detection mechanism, following docs/design/competitive-vigilance-observed-baseline-design.md as the template.
OUT OF SCOPE:
- Any code change to the reasonless-exception count itself, the GR-GOVERNANCE-CASCADE trigger, or THREAD-DOWNSTREAM-001's propagation plumbing -- all child-SD or already-owned work.
- Re-deciding the plumbing-vs-invariant seam Solomon already ruled -- this design operates strictly within the invariant half.`;

const key_changes = [
  { change: 'Author docs/design/governance-cascade-invariant-design.md', impact: 'Settles what detects unwired ratified-decision requirements, grounded in the live 106/414 reasonless roadmap_link_exception specimen; disambiguates from the pre-existing, differently-scoped GR-GOVERNANCE-CASCADE DB trigger.' }
];

const success_criteria = [
  { criterion: 'The design doc explicitly disambiguates from the existing GR-GOVERNANCE-CASCADE DB trigger, not conflating the two', measure: 'Doc names supabase/migrations/20260302_governance_guardrail_triggers.sql and states precisely what that trigger does vs what this design addresses.' },
  { criterion: 'The design doc grounds its premise in the live-verified reasonless-exception specimen, not an assumed one', measure: 'Doc cites the 106/414 count (live query, 2026-08-31) as the concrete drift evidence.' },
  { criterion: 'The design doc does not duplicate or rebuild THREAD-DOWNSTREAM-001s scope', measure: 'Doc cites SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001 by key and explicitly treats its propagation-plumbing scope as deferred, not rebuilt.' }
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Open docs/design/governance-cascade-invariant-design.md.', expected_outcome: 'Document exists, well-formed, cites live-verified facts and the two disambiguation citations (GR-GOVERNANCE-CASCADE trigger, THREAD-DOWNSTREAM-001).' },
  { step_number: 2, instruction: 'Verify no production code file was modified by this SD.', expected_outcome: 'git diff shows only the design doc and this SD one-off/evidence scripts touched.' }
];

async function main() {
  const { data: existing } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = {
    ...(existing?.metadata || {}),
    lead_enrichment: 'Measured directly against live DB and repo before authoring scope. Confirmed the 106/414 reasonless roadmap_link_exception specimen Solomon ruling 7cdcbd96 cites. Found a real name collision with the pre-existing GR-GOVERNANCE-CASCADE DB trigger (different scope: SD-to-objective traceability, not ratified-decision propagation) and confirmed THREAD-DOWNSTREAM-001 is a real, deferred sibling SD owning the plumbing half.'
  };
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ description, scope, key_changes, success_criteria, smoke_test_steps, metadata, scope_reduction_percentage: 0 })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK enriched', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
