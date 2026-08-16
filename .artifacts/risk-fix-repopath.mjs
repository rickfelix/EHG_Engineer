import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROW = 'e252eef9-9f7a-4180-81bb-d00f8ea470a6';

const resolution = await resolveSubAgentRepo({
  sdId: 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5',
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RISK',
  supabase: s,
});
console.log('resolution:', JSON.stringify(resolution));

const { data: row, error: rErr } = await s.from('sub_agent_execution_results').select('metadata,verdict,confidence').eq('id', ROW).single();
if (rErr) { console.error(rErr); process.exit(1); }

// Canonical writer applied to the ALREADY-STORED metadata, verdict preserved.
const shim = { metadata: row.metadata, verdict: row.verdict, confidence: row.confidence };
applySubAgentRepoVerdict(shim, resolution, { skipVerdictAdjust: true });

const { error: uErr } = await s.from('sub_agent_execution_results').update({ metadata: shim.metadata }).eq('id', ROW);
if (uErr) { console.error('UPDATE FAILED', uErr); process.exit(1); }

const { data: v } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,metadata').eq('id', ROW).single();
console.log('VERIFIED repo_path        :', v.metadata.repo_path);
console.log('VERIFIED repo_resolved    :', v.metadata.repo_resolved);
console.log('VERIFIED registry_source  :', v.metadata.registry_source);
console.log('VERIFIED executed_from_cwd:', v.metadata.executed_from_cwd);
console.log('VERIFIED phase/verdict    :', v.phase, v.verdict, v.confidence);
console.log('VERIFIED overall_risk     :', v.metadata.overall_risk, JSON.stringify(v.metadata.domain_scores));
