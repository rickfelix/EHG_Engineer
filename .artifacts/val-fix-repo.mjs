import dotenv from 'dotenv'; dotenv.config();
import pg from 'pg';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const ROW_ID = '09ac5c83-847a-4420-ac9f-172308a26b97';
// Canonical resolution, this time WITH targetApplication (the omission that degraded the row).
const resolution = await resolveSubAgentRepo({
  subAgentCode: 'VALIDATION',
  sdId: 'fbbf9a6d-e079-4c22-9189-88336aae9a16',
  targetApplication: 'EHG_Engineer',
});
const probe = { verdict: 'CONDITIONAL_PASS', confidence: 88, metadata: {} };
applySubAgentRepoVerdict(probe, resolution, { skipVerdictAdjust: true });
console.log('canonical resolution ->', JSON.stringify(probe.metadata, null, 2));

const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} }); await c.connect();
const patch = {
  repo_path: probe.metadata.repo_path,
  repo_resolved: probe.metadata.repo_resolved,
  registry_source: probe.metadata.registry_source,
  repo_path_repaired_note: 'initial write omitted targetApplication, yielding repo_path=null; repaired in-place with applySubAgentRepoVerdict output (same run, same findings)',
};
const r = await c.query(
  `update sub_agent_execution_results set metadata = metadata || $2::jsonb where id = $1
   returning id, metadata->>'repo_path' rp, metadata->>'repo_resolved' rr, metadata->>'registry_source' rs`,
  [ROW_ID, JSON.stringify(patch)]
);
console.log('patched:', JSON.stringify(r.rows));
const v = await c.query(`select sub_agent_code, verdict, confidence_score, metadata->>'repo_path' rp from sub_agent_execution_results where id=$1`, [ROW_ID]);
console.log('final row:', JSON.stringify(v.rows));
await c.end();
