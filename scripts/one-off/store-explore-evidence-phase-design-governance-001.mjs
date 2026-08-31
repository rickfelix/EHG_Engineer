import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-PHASE-DESIGN-GOVERNANCE-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Found and read Solomon ruling 7cdcbd96 (.claude/solomon-session-state-08262241.md:1110): "GOVERNANCE CASCADE ENFORCED blessed -- seam ruled (plumbing vs invariant; cite THREAD-DOWNSTREAM AS DEFERRED)". Independently verified the cited drift specimen live: 106/414 strategic_directives_v2 rows with a roadmap_link_exception are currently reasonless. Found a real name collision with a pre-existing, differently-scoped GR-GOVERNANCE-CASCADE DB trigger. Confirmed THREAD-DOWNSTREAM-001 is a real, deferred sibling SD owning the propagation-plumbing half.',
    detailed_analysis: {
      files_read: [
        '.claude/solomon-session-state-08262241.md (ruling 7cdcbd96, lines ~1072-1110)',
        'supabase/migrations/20260302_governance_guardrail_triggers.sql (GR-GOVERNANCE-CASCADE trigger)',
        'docs/design/competitive-vigilance-observed-baseline-design.md (template precedent)'
      ],
      key_findings: [
        'Ruling 7cdcbd96 verdict: "GOVERNANCE CASCADE ENFORCED blessed -- seam ruled (plumbing vs invariant; cite THREAD-DOWNSTREAM AS DEFERRED); load-bearing condition = premise carries the DECIDED-BUT-UNWIRED family".',
        'Live query confirmed: 414 strategic_directives_v2 rows carry a roadmap_link_exception; 106 of those have reason_supplied=false (reasonless), matching the ruling cited 98->106 growth pattern.',
        'supabase/migrations/20260302_governance_guardrail_triggers.sql defines trigger_gr_governance_cascade / enforce_gr_governance_cascade (SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001) -- checks SD-to-strategic_objectives traceability, NOT ratified-decision propagation. Name collision with this design; must be explicitly disambiguated.',
        'SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001 confirmed real, status=deferred/EXEC, scope: thread ratified chairman decisions into downstream EVA stage producers (S7 pricing) -- the propagation-plumbing half this design must cite as deferred, not rebuild.'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
