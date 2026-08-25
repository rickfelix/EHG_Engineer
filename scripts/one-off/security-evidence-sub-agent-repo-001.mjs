import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '4e010f6a-f5a5-437c-ac2c-e1ffb8185a95';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = process.cwd();

const analysis = `SECURITY agent reviewed both commits (e7647300a9b, 0327d994edb). VERDICT: PASS,
confidence 88.

(1) Shell-injection via execAsync template strings (regression.js: cd "\${repoPath}" && npm test,
grep -rn "^export " "\${srcPath}") -- CONFIRMED pre-existing, NOT worsened. The interpolated value
is applications.local_path / registry.json local_path (admin/service-role infrastructure data),
never the SD's target_application string itself (which is only used as a normalizeAppName()
lookup key, stripped of all non-alphanumerics before matching). Identical pattern already present
in security.js:386, performance.js:297 -- fleet-wide, out of scope for this SD.

(2) resolveTargetApplicationForRegression precedence -- NO new risk. Matches the precedence the
canonical executor.js:250 already applies; the CLI path was the only place lacking it. Net effect:
CLI runs now execute test tooling in the SD's ACTUAL target repo instead of unconditionally in
'ehg' -- a reduction in wrong-repo execution, not an expansion. Candidate paths remain bounded by
the applications registry.

(3) metadata/conditions/justification now included in the insert -- NO new leak. Only
repo_path/repo_resolved/registry_source/executed_from_cwd/probe_exists/skip_reason/verdict_chain
are written by applySubAgentRepoVerdict, identical fields already written by the canonical writer
for every other sub-agent. Synthesized conditions/justification contain only booleans derived from
the resolution object -- no secrets.

(4) Non-blocking observations: results.metadata is passed raw in regression.js's insert, bypassing
the canonical writer's metadata sanitizer (results-storage.js:451-496) -- bounded today since no
caller supplies metadata into results before this point, flagged as hygiene not a vulnerability.
The new {error:insertError} destructure is a security IMPROVEMENT (converts a silently-dropped
evidence row into a logged failure); insertError.message is console-logged only, not persisted.
No secrets/credentials/auth/RLS surfaces touched; no new network or filesystem write paths.`;

const { data, error } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: 'SECURITY',
  sub_agent_name: 'Security Sub-Agent',
  verdict: 'PASS',
  confidence: 88,
  phase: 'EXEC',
  source: 'agent',
  detailed_analysis: analysis,
  warnings: [
    { severity: 'LOW', issue: 'regression.js passes results.metadata raw into its insert, bypassing the canonical writer\'s metadata sanitizer (results-storage.js:451-496)', recommendation: 'Bounded today (no caller supplies metadata before this point); worth reusing the sanitizer if results.metadata ever grows to include caller-supplied content' },
  ],
  recommendations: [],
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    mechanism_verifications: [
      { verified_at: 'lib/repo-paths.js:149-151,245', verified_by: 'SECURITY agent (Task tool), confirmed normalizeAppName sanitization via direct file read' },
      { verified_at: 'lib/sub-agent-executor/executor.js:250', verified_by: 'SECURITY agent (Task tool), confirmed precedence pattern parity via direct file read' },
    ],
  },
  executed_from_cwd: CWD,
}).select('id');

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('SECURITY evidence recorded:', data[0].id);
