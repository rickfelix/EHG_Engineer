// READ-ONLY readback of the SECURITY evidence row (persist != return).
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createSupabaseServiceClient();
const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, sd_id, phase, verdict, confidence, created_at, metadata')
  .eq('id', '64f83f0a-f863-4b15-9e3d-581556853143')
  .maybeSingle();
if (error) { console.log('READBACK_ERROR', error.message); process.exit(1); }
if (!data) { console.log('READBACK_ABSENT — row not persisted'); process.exit(1); }
console.log('READBACK_OK');
console.log('  id           ', data.id);
console.log('  code         ', data.sub_agent_code);
console.log('  sd_id        ', data.sd_id);
console.log('  phase        ', data.phase);
console.log('  verdict      ', data.verdict);
console.log('  confidence   ', data.confidence);
console.log('  created_at   ', data.created_at);
console.log('  repo_path    ', data.metadata?.repo_path);
console.log('  exec_from_cwd', data.metadata?.executed_from_cwd);
console.log('  findings     ', (data.metadata?.findings_count ?? 'n/a'), '| security_delta:', data.metadata?.security_delta?.finding, data.metadata?.security_delta?.severity);
process.exit(0);
