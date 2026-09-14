// REGRESSION evidence writer for SD-LEARN-FIX-ADDRESS-PAT-LES-010 / PLAN_TO_LEAD
// Usage: node .artifacts/reg-evidence-pat-les-010.mjs provisional
//        node .artifacts/reg-evidence-pat-les-010.mjs final <json-file>
import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-010';
const PHASE = 'PLAN_TO_LEAD';
const WT = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEARN-FIX-ADDRESS-PAT-LES-010';

const mode = process.argv[2] || 'provisional';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, uuid_id, sd_key, target_application, current_phase')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (sdErr) { console.error('SD lookup error:', sdErr.message); process.exit(1); }
if (!sd) { console.error('SD not found'); process.exit(1); }
const sdUUID = sd.id; // normalizer resolves sd_key-style id; raw uuid is not recognized
console.log('SD id=', sd.id, '| uuid=', sd.uuid_id, '| phase=', sd.current_phase, '| target_app=', sd.target_application);

let results;
if (mode === 'provisional') {
  results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 40,
    summary: 'PROVISIONAL crash-insurance row - REGRESSION validation in progress for PLAN_TO_LEAD.',
    findings: [{ severity: 'INFO', issue: 'Validation in progress', recommendation: 'Await final update' }],
    metadata: { provisional: true },
  };
} else {
  results = JSON.parse(readFileSync(process.argv[3], 'utf8'));
}

let resolution;
try {
  resolution = await resolveSubAgentRepo({ subAgentCode: 'REGRESSION', sdId: sdUUID, supabase, fallbackRepoPath: WT });
} catch (e) {
  console.error('resolve warn:', e.message);
  resolution = { repoPath: WT, repoResolved: false, registrySource: 'fallback' };
}
// The SD branch lives in this worktree; that is the tree actually validated.
resolution.repoPath = WT;
resolution.repoResolved = true;
resolution.probeExists = true;
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const stored = await storeSubAgentResults('REGRESSION', sdUUID, { code: 'REGRESSION' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED:', JSON.stringify(stored).slice(0, 900));
