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
import { VERDICT_VALUES } from '../lib/sub-agents/verdict-chain.js';

/**
 * SD-LEO-INFRA-EVIDENCE-WRITER-VERDICT-FAIL-LOUD-001 (FR-3): the most plausible non-verdict
 * top-level field names a caller might mistakenly send instead of `verdict`, ordered by how
 * often each shape actually appears in this codebase's real sub-agent payloads (lib/sub-agents/
 * design/*.js, regression.js, uat.js, testing/phases/*.js, etc). First present, non-empty match
 * wins -- never auto-mapped to verdict, only named in the guard message (FR-3 DOES-NOT).
 */
export const LIKELY_VERDICT_FIELDS = ['status', 'overall_status', 'overall_verdict', 'result', 'outcome', 'passed'];

/**
 * SD-LEO-INFRA-EVIDENCE-WRITER-VERDICT-FAIL-LOUD-001 (FR-1/FR-2/FR-3): pure predicate deciding
 * whether the row storeSubAgentResults() just wrote reflects writer MISUSE (an absent/unrecognised
 * input verdict) rather than a legitimate verdict='ERROR' crash report.
 *
 * BOTH conjuncts are independently load-bearing, measured via a live probe against the real
 * chain (PLAN-phase testing-agent, evidence 4387c4c7) -- not assumed:
 *   - storedVerdict === 'ERROR' alone is NOT sufficient: a genuine {verdict:'ERROR', ...} crash
 *     report also stores as 'ERROR' (~77% of the table's historical ERROR population, from the
 *     exact agent types this CLI names as its intended callers) and must never fire here.
 *   - rawPayload.verdict not being a VERDICT_VALUES member alone is NOT sufficient: prefix-family
 *     tokens like 'CONCERNS'/'BLOCK'/'UNKNOWN' are not literal members either, but mapVerdict's
 *     own classification resolves them to non-ERROR verdicts (CONDITIONAL_PASS/BLOCKED/BLOCKED) --
 *     this predicate never re-derives that classification itself (TR-1/TR-4: reuse, never
 *     duplicate mapVerdict), it simply never fires for them because storedVerdict is never 'ERROR'
 *     for that input in the first place.
 * rawPayload MUST be the raw, caller-supplied payload (or a shallow copy of it) -- never
 * derived from originalVerdictFor()/metadata.verdict_chain, both of which a payload can forge
 * (verdict-chain.js's own docblock documents this exact pre-seeding attack one layer up).
 *
 * @param {object} rawPayload - the loaded --content payload, as the caller supplied it
 * @param {string|null|undefined} storedVerdict - the verdict column storeSubAgentResults() wrote
 * @param {boolean} [storageTimeout] - true when the row is storeSubAgentResults' synthetic,
 *   never-actually-persisted statement-timeout fallback (result.storage_timeout === true)
 * @returns {string|null} the stderr message to emit, or null if this is not a misuse case
 */
export function verdictMisuseMessage(rawPayload, storedVerdict, storageTimeout) {
  if (storedVerdict !== 'ERROR') return null;
  const rawVerdict = rawPayload?.verdict;
  const normalized = String(rawVerdict ?? '').trim().toUpperCase();
  if (VERDICT_VALUES.includes(normalized)) return null;

  const display = rawVerdict === undefined || rawVerdict === null || String(rawVerdict).trim() === '' ? '(absent)' : String(rawVerdict);
  let message = `[VERDICT_UNRECOGNISED] input verdict=${display} stored=ERROR accepted=${VERDICT_VALUES.join('|')} -- pass a top-level verdict`;

  for (const field of LIKELY_VERDICT_FIELDS) {
    const value = rawPayload?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      message += ` (found "${field}": "${value}" -- pass "verdict", not "${field}")`;
      break;
    }
  }

  if (storageTimeout) message += ' (write timed out -- row not persisted)';
  return message;
}

export async function main(argv) {
  const [sdId, subAgentCode, ...rest] = argv;
  if (!sdId || !subAgentCode) {
    throw new Error(
      'Usage: store-sub-agent-repo-evidence.js <SD-ID> <SUB-AGENT-CODE> --content @results.json [--target-application <app>] [--phase <phase>]\n' +
      `Accepted verdicts: ${VERDICT_VALUES.join('|')}`
    );
  }
  const { value: contentArg, remaining } = extractContentArg(rest);
  const results = loadContentPayload(contentArg);
  const rawPayload = { ...results };

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

  const misuseMessage = verdictMisuseMessage(rawPayload, stored.verdict, stored.storage_timeout === true);
  if (misuseMessage) {
    console.error(misuseMessage);
    process.exitCode = 1;
  }

  console.log(`Stored ${subAgentCode} evidence for ${sdId}: id=${stored.id}, repo_path=${withEvidence.metadata.repo_path}`);
  return stored;
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
}
