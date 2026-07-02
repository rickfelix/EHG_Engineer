#!/usr/bin/env node
/**
 * QF-20260702-679 — safe, heredoc-free evidence writer for Task-tool-invoked sub-agents
 * (validation-agent, regression-agent, etc). These agents hand-roll their own inline
 * `node -e "..."` inserts to persist sub_agent_execution_results, which is where a
 * heredoc/backslash-collapse silently mangles Windows repo paths and drops
 * metadata.repo_path/executed_from_cwd on the first write attempt.
 *
 * This script chains the ALREADY-CORRECT library functions (resolveSubAgentRepo ->
 * applySubAgentRepoVerdict -> storeSubAgentResults — proven correct by
 * tests/unit/sub-agent-repo-evidence-persistence.test.js) so repo evidence persists
 * reliably. Content comes from --content @<file>|- (never inline shell JSON), the same
 * safe pattern as add-prd-to-database.js.
 *
 * Usage:
 *   node scripts/store-sub-agent-repo-evidence.js <SD-ID> <SUB-AGENT-CODE> --content @results.json [--target-application <app>] [--phase <phase>]
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { normalizeSDId } from './modules/sd-id-normalizer.js';
import { loadContentPayload, extractContentArg } from './add-prd-to-database.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export async function main(argv) {
  const [sdId, subAgentCode, ...rest] = argv;
  if (!sdId || !subAgentCode) {
    throw new Error('Usage: store-sub-agent-repo-evidence.js <SD-ID> <SUB-AGENT-CODE> --content @results.json [--target-application <app>] [--phase <phase>]');
  }
  const { value: contentArg, remaining } = extractContentArg(rest);
  const results = loadContentPayload(contentArg);

  const phaseIdx = remaining.indexOf('--phase');
  const phase = phaseIdx >= 0 ? remaining[phaseIdx + 1] : undefined;
  const appIdx = remaining.indexOf('--target-application');
  let targetApplication = appIdx >= 0 ? remaining[appIdx + 1] : undefined;

  const supabase = await getSupabaseClient();
  if (!targetApplication) {
    const normalized = await normalizeSDId(supabase, sdId);
    const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('id', normalized).maybeSingle();
    targetApplication = sd?.target_application || undefined;
  }

  const resolution = await resolveSubAgentRepo({ sdId, targetApplication, subAgentCode, supabase });
  const withEvidence = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(subAgentCode, sdId, null, withEvidence, phase ? { phase } : {});
  console.log(`Stored ${subAgentCode} evidence for ${sdId}: id=${stored.id}, repo_path=${withEvidence.metadata.repo_path}`);
  return stored;
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
}
