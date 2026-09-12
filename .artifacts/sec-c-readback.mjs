import dotenv from 'dotenv'; dotenv.config();
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, confidence, phase, created_at, metadata')
  .eq('id','9c56a73b-16c3-4d05-9ae1-484646126b50').single();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log(JSON.stringify({
  id: data.id, code: data.sub_agent_code, verdict: data.verdict,
  confidence: data.confidence, phase: data.phase, created_at: data.created_at,
  repo_path: data.metadata?.repo_path,
  repo_resolved: data.metadata?.repo_resolved,
  executed_from_cwd: data.metadata?.executed_from_cwd,
  findings_count: data.metadata?.findings_count,
  evidence_keys: Object.keys(data.metadata?.evidence || {}),
  q1: data.metadata?.evidence?.q1_injection?.verdict,
  q2: data.metadata?.evidence?.q2_privilege?.verdict,
  q3: data.metadata?.evidence?.q3_disclosure?.verdict,
  q4: data.metadata?.evidence?.q4_race?.verdict,
  q5: data.metadata?.evidence?.q5_secrets_pii?.verdict,
}, null, 1));
