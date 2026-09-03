#!/usr/bin/env node
/**
 * Sanctioned transcription writer for Explore evidence.
 * SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001, FR-1.
 *
 * WHY THIS EXISTS. Explore is a Claude Code BUILT-IN (leo_protocol_sections id=289/290), deliberately
 * NOT a row in leo_sub_agents — it is read-only and cannot write its own evidence. Registering it was
 * considered and RULED OUT: it would create a second representation of what Explore is, and measured,
 * it would not even fix the majority path (a DB row alone is not Task-spawnable, and the Task tool
 * writes 211 of 314 Explore rows today). So the boundary stays, and the evidence gets a producer
 * instead. Before this script, 36 one-off scripts hand-wrote that row.
 *
 * THE REFUSAL AT THE BOTTOM IS THE POINT, not a nicety. This SD exists because a CRASHED run wrote an
 * ERROR tombstone that advisory-passed the LEAD-TO-PLAN gate at score 100 — a LOUD fail-open, but a
 * fail-open. A writer that will record a verdict with no summary and no findings would replace that
 * with a well-formed EMPTY PASS: invisible instead of countable, and strictly worse. That would be
 * this SD committing the exact defect class it was opened to close, so the writer refuses.
 *
 * Usage:
 *   node scripts/record-explore-evidence.js --sd-id <SD-KEY-or-uuid> --verdict PASS \
 *     --summary "what the Explore run actually concluded" [--phase LEAD] [--confidence 90] \
 *     [--findings "one finding" --findings "another"]
 */

import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_VERDICTS = new Set(['PASS', 'CONDITIONAL_PASS', 'WARNING', 'FAIL']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * QF-20260813-220: this script's own file always lives inside the EHG_Engineer checkout,
 * so deriving repo_path from import.meta.url (the prior implementation) stamped
 * EHG_Engineer on every row REGARDLESS of which application the SD actually targets —
 * breaking evidence capture for any cross-repo SD (e.g. an AltifyAI-venture SD whose
 * target_application resolves to a different repo). Look up the SD's own
 * target_application and resolve THAT app's canonical repo path via the same DB-first,
 * cross-repo-aware mechanism every other sub-agent uses (lib/sub-agents/resolve-repo.js),
 * instead of hand-rolling a path from this script's own location.
 * @param {string} sdId - sd_key or UUID, whichever form the caller passed
 * @param {object} supabase
 * @returns {Promise<string|null>} the SD's target_application, or null if unresolvable
 */
export async function fetchTargetApplication(sdId, supabase) {
  try {
    const column = UUID_RE.test(sdId) ? 'id' : 'sd_key';
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('target_application')
      .eq(column, sdId)
      .maybeSingle();
    if (error || !data) return null;
    return data.target_application || null;
  } catch {
    return null;
  }
}

/** Minimal argv parser: repeated flags collect into an array. */
export function parseArgs(argv) {
  const out = { findings: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    if (key === 'findings') out.findings.push(val);
    else out[key.replace(/-/g, '_')] = val;
  }
  return out;
}

/**
 * The empty-evidence guard, exported so it is testable without spawning or touching a database.
 * Returns null when acceptable, or a reason string when the record must be refused.
 *
 * NOTE the asymmetry: a verdict is REQUIRED and never defaulted. Defaulting to PASS would let a
 * caller record a pass by omission, which is the same laundering in a friendlier costume.
 */
export function refusalReason({ sd_id, verdict, summary, findings = [] }) {
  if (!sd_id) return 'missing --sd-id';
  if (!verdict) return 'missing --verdict (never defaulted: a pass by omission is still a pass nobody vouched for)';
  if (!VALID_VERDICTS.has(String(verdict).toUpperCase())) {
    return `unrecognised --verdict "${verdict}" (expected one of: ${[...VALID_VERDICTS].join(', ')})`;
  }
  const hasSummary = typeof summary === 'string' && summary.trim().length > 0;
  const hasFindings = Array.isArray(findings) && findings.filter((f) => String(f || '').trim()).length > 0;
  if (!hasSummary && !hasFindings) {
    return 'refusing to record a verdict with no summary and no findings — an empty PASS is invisible '
      + 'where the ERROR tombstone it replaces was at least countable, which is the failure mode this '
      + 'SD exists to prevent';
  }
  return null;
}

export async function recordExploreEvidence(args, { store = storeSubAgentResults, supabase = null, resolveRepo = resolveSubAgentRepo } = {}) {
  const reason = refusalReason(args);
  if (reason) {
    const err = new Error(`record-explore-evidence: ${reason}`);
    err.isRefusal = true;
    throw err;
  }

  const db = supabase || await getSupabaseClient();
  const targetApplication = await fetchTargetApplication(args.sd_id, db);
  const resolution = await resolveRepo({
    sdId: args.sd_id,
    targetApplication,
    subAgentCode: 'Explore',
    supabase: db,
  });

  const results = {
    verdict: String(args.verdict).toUpperCase(),
    confidence: args.confidence ? Number(args.confidence) : 90,
    summary: args.summary || '',
    findings: args.findings || [],
    metadata: {
      recorded_by: 'scripts/record-explore-evidence.js',
      producer_note: 'Explore is a read-only BUILT-IN and cannot write its own row; this is the '
        + 'sanctioned transcription path (SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001 FR-1).'
    }
  };
  // applySubAgentRepoVerdict stamps metadata.repo_path/repo_resolved/registry_source/
  // executed_from_cwd (and downgrades verdict to CONDITIONAL_PASS on a failed resolution,
  // matching every other sub-agent's fail-closed semantics for unresolved cross-repo evidence).
  applySubAgentRepoVerdict(results, resolution);

  // sub_agent_code is 'Explore' exactly. The evidence gate groups on a NORMALIZED code, so casing
  // does not decide matching — but it does decide what a human reads in the row, and every existing
  // Task-path row uses this spelling.
  const stored = await store('Explore', args.sd_id, null, results, { phase: args.phase || 'LEAD' });
  return stored;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let stored;
  try {
    stored = await recordExploreEvidence(args);
  } catch (e) {
    console.error(`\n${e.message}`);
    if (e.isRefusal) {
      console.error('\n  Record what the Explore run actually concluded, e.g.:');
      console.error('    node scripts/record-explore-evidence.js --sd-id <SD> --verdict PASS \\');
      console.error('      --summary "enumerated the 6 call sites; 4 are attacker-reachable"');
      process.exit(2);
    }
    process.exit(1);
  }

  // Read the row back. A success return is not persistence — this script exists to be trusted by a
  // gate, so it verifies rather than reporting the writer's own optimism.
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`\n  WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }
  console.log('\n  Explore evidence recorded and read back:');
  console.log(`    id      ${data.id}`);
  console.log(`    code    ${data.sub_agent_code}`);
  console.log(`    phase   ${data.phase}`);
  console.log(`    verdict ${data.verdict}`);
}

// Only run when invoked directly, so the exports above stay importable by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
