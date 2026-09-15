import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';
const RETRO_ID = '0e5f1acf-43b8-4efb-a027-428888d9003b';

const supabase = await getSupabaseClient();
const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('sd_key', SD_KEY).maybeSingle();
const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: sd?.target_application || null, subAgentCode: 'RETRO', supabase });

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary: `Retrospective published: retrospectives.id=${RETRO_ID} (retro_type=SD_COMPLETION, status=PUBLISHED, quality_score=90). Captured the generalizable pattern from 4 near-misses found across this SD's own review passes: a quoted-key regex evasion in the new lint (TESTING), a CI paths: trigger-scope gap + misleading "advisory" wording (VALIDATION), an out-of-scope second live stage-binding site (STAGE_TO_VP, REGRESSION, routed to harness_backlog feedback df140dc0-b512-4954-a46f-4c030fd880f1), and a negative-control test seed that would have silently become a no-op (caught during original authorship). Protocol improvement recorded: a new reintroduction-guard lint's scope must be adversarially checked against all live sites/shapes of the pattern it guards, not just the sites its authoring SD's own refactor touched.`,
  findings: [
    'Retrospective published with grounded, independently-checkable citations (related_commits, related_files, sub_agent_evidence_rows) -- not generic boilerplate.',
    'Corrected the historical record: this SD\'s own commit message claimed "zero live callers" of role-registry-resolver.mjs; REGRESSION found a non-test caller (lib/org/acceptance-suite/fixtures/mock-venture.mjs:18) -- self-consistent, no regression impact, but factually corrected in the retro.',
    'action_items includes filing the STAGE_TO_VP follow-up SD using this SD\'s FR pattern as a template.',
  ],
  metadata: {
    recorded_by: 'scripts/one-off/record-retro-evidence-remove-every-binding-001.mjs',
    producer_note: 'Manual transcription of a retro-agent Task-tool run (this repo\'s established pattern for Task-agent evidence). The retrospective itself lives in the retrospectives table; this row is the PLAN-TO-LEAD gate\'s required sub_agent_execution_results evidence.',
    retrospective_id: RETRO_ID,
  },
};
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('RETRO', SD_KEY, null, results, { phase: 'PLAN' });
console.log('RETRO evidence stored:', stored?.id || stored);
