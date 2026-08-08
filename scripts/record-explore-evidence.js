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
import { toCanonicalRepoPath } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_VERDICTS = new Set(['PASS', 'CONDITIONAL_PASS', 'WARNING', 'FAIL']);

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

export async function recordExploreEvidence(args, { store = storeSubAgentResults, supabase = null } = {}) {
  const reason = refusalReason(args);
  if (reason) {
    const err = new Error(`record-explore-evidence: ${reason}`);
    err.isRefusal = true;
    throw err;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const results = {
    verdict: String(args.verdict).toUpperCase(),
    confidence: args.confidence ? Number(args.confidence) : 90,
    summary: args.summary || '',
    findings: args.findings || [],
    metadata: {
      // Canonical, NOT the worktree path: v_sub_agent_repo_compliance compares
      // metadata->>repo_path to applications.local_path by exact string equality, so a
      // worktree-valued repo_path fails SUB_AGENT_REPO_RESOLUTION.
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/record-explore-evidence.js',
      producer_note: 'Explore is a read-only BUILT-IN and cannot write its own row; this is the '
        + 'sanctioned transcription path (SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001 FR-1).'
    }
  };

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
