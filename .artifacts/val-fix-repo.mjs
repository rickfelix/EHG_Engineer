import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const ROW_ID = 'f35b8d3e-5fc4-4a1c-b602-d2139991408c';
const SD_KEY = 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Canonical resolution, this time with the SD's declared target_application (EHG_Engineer).
const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase: s,
});
console.log('resolution:', JSON.stringify(resolution));

const { data: row, error: readErr } = await s
  .from('sub_agent_execution_results')
  .select('id, verdict, metadata')
  .eq('id', ROW_ID)
  .single();
if (readErr) throw readErr;

// Let the canonical writer stamp metadata.repo_path / repo_resolved / registry_source /
// executed_from_cwd. skipVerdictAdjust: the verdict is already CONDITIONAL_PASS on its own
// merits (not a repo-degradation), and the row is already persisted.
const shaped = { verdict: row.verdict, metadata: row.metadata || {} };
applySubAgentRepoVerdict(shaped, resolution, { skipVerdictAdjust: true });

const { error: upErr } = await s
  .from('sub_agent_execution_results')
  .update({ metadata: shaped.metadata })
  .eq('id', ROW_ID);
if (upErr) throw upErr;

const { data: verify } = await s
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, verdict, confidence, phase, created_at, metadata')
  .eq('id', ROW_ID)
  .single();

console.log('VERIFIED ROW:', JSON.stringify({
  id: verify.id,
  sd_id: verify.sd_id,
  agent: verify.sub_agent_code,
  verdict: verify.verdict,
  confidence: verify.confidence,
  phase: verify.phase,
  sd_key_meta: verify.metadata?.sd_key,
  repo_path: verify.metadata?.repo_path,
  repo_resolved: verify.metadata?.repo_resolved,
  registry_source: verify.metadata?.registry_source,
  executed_from_cwd: verify.metadata?.executed_from_cwd,
  findings: (verify.metadata?.findings || []).length,
}, null, 1));
