import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import fs from 'fs';

const SD = 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001';
const payloadPath = process.argv[2];
const results = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

const supabase = createSupabaseServiceClient();
const { data: sdRow } = await supabase.from('strategic_directives_v2')
  .select('target_application').eq('sd_key', SD).maybeSingle();
const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: sdRow?.target_application || null,
  subAgentCode: 'REGRESSION',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'lib/db-actor-identity.js',
  supabase,
});
console.log('RESOLUTION:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const stored = await storeSubAgentResults('REGRESSION', SD, { name: 'Regression Validation Specialist' }, results, { sdKey: SD });
console.log('STORED:', JSON.stringify(stored)?.slice(0, 500));
console.log('FINAL VERDICT:', results.verdict, '| repo_resolved:', results.metadata.repo_resolved, '| repo_path:', results.metadata.repo_path);
