/**
 * Fleet-wide sub-agent repo resolution helper
 *
 * SD-LEO-INFRA-FLEET-WIDE-SUB-001 — generalizes the cross-repo pattern proven
 * by SD-LEO-INFRA-CROSS-REPO-AWARE-001 (DESIGN sub-agent) to the rest of the
 * sub-agent fleet. Sub-agents resolve the SD's target_application to its repo
 * root via DB-first SSOT (applications.local_path) with registry.json fallback,
 * and EVERY return path emits metadata.repo_path/repo_resolved/executed_from_cwd
 * top-level so the PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate can audit
 * cross-repo evidence integrity.
 *
 * Backward-compatibility contract: legacy sub_agent_execution_results rows
 * (missing metadata.repo_path key) get FULL CREDIT at the gate — only new rows
 * that are populated-and-incorrect fail. JSONB key-existence is checked via
 * `(metadata ? 'repo_path')` operator, NOT `IS NULL` (latter conflates
 * missing-key with explicit-json-null per database-agent finding).
 *
 * Capability flags live in lib/sub-agents/registry.json (NOT module export to
 * avoid self-checksum side-effect bug class; NOT DB column because capabilities
 * are code-bundled not data-mutable). Each sub-agent declares
 * supports_cross_repo: true|false; DATABASE_SCHEMA and DATABASE_MIGRATION
 * declare false because they must always run against EHG_Engineer.
 *
 * 9th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * @module lib/sub-agents/resolve-repo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveRepoPath,
  resolveRepoPathDbFirst,
  normalizeAppName,
  getRepoRoot,
} from '../repo-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_PATH = path.resolve(__dirname, 'registry.json');

// Module-scope cache (loaded once per process; cleared via clearRegistryCache for tests)
let _registry = null;

function loadRegistry() {
  if (_registry) return _registry;
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    _registry = JSON.parse(raw);
  } catch (err) {
    // Registry missing/corrupt → conservative default: all sub-agents support cross-repo
    // (matches default_supports_cross_repo:true policy; a real venture failure surfaces
    // via the gate's CONDITIONAL_PASS, not a silent skip)
    _registry = { default_supports_cross_repo: true, sub_agents: {} };
  }
  return _registry;
}

/**
 * Clear the registry cache. For tests only.
 */
export function clearRegistryCache() {
  _registry = null;
}

/**
 * Look up a sub-agent's cross-repo capability from registry.json.
 *
 * @param {string} subAgentCode - e.g. 'DESIGN', 'SECURITY', 'DATABASE_MIGRATION'
 * @returns {{supports_cross_repo: boolean, only_repo?: string, skip_reason?: string, probe_path?: string|null}}
 */
export function getSubAgentCapability(subAgentCode) {
  const registry = loadRegistry();
  const entry = registry.sub_agents?.[subAgentCode];
  if (entry) return entry;
  // Unknown sub-agent → default policy
  return {
    supports_cross_repo: registry.default_supports_cross_repo !== false,
    probe_path: null,
  };
}

/**
 * Resolve the repository path a sub-agent should scan, based on the SD's
 * target_application and the sub-agent's declared capability.
 *
 * @param {Object} args
 * @param {string} [args.sdId] - SD UUID or sd_key (informational only — caller usually has it)
 * @param {string} args.targetApplication - SD's target_application column value
 * @param {string} args.subAgentCode - e.g. 'SECURITY', 'PERFORMANCE'
 * @param {string} [args.fallback] - fallback target_application name if targetApplication is null
 * @param {string} [args.probeExistsRelative] - relative path under repoPath to check existence; if missing, repoResolved=true but probeExists=false (CONDITIONAL_PASS at gate)
 * @param {Object} [args.supabase] - Supabase service client; when omitted, falls back to registry-only resolution
 * @returns {Promise<{repoPath: string|null, repoResolved: boolean, registrySource: 'db'|'registry'|'fallback'|'skipped', probeExists?: boolean, skipReason?: string}>}
 */
export async function resolveSubAgentRepo({
  sdId,
  targetApplication,
  subAgentCode,
  fallback,
  probeExistsRelative,
  supabase,
} = {}) {
  const capability = getSubAgentCapability(subAgentCode);

  // Cross-repo unsupported → resolve to only_repo (typically EHG_Engineer) and emit skip_reason
  if (capability.supports_cross_repo === false) {
    const onlyRepo = capability.only_repo || 'EHG_Engineer';
    const skipReason = capability.skip_reason || 'sub_agent_engineer_only';
    // For only_repo='EHG_Engineer', synchronously resolve via getRepoRoot (worktree-aware,
    // returns the canonical main root). For other only_repo values, fall through to async.
    if (onlyRepo === 'EHG_Engineer') {
      return {
        repoPath: getRepoRoot(),
        repoResolved: true,
        registrySource: 'skipped',
        skipReason,
        probeExists: undefined,
      };
    }
    // Non-EHG_Engineer only_repo (rare) — async resolution
    const resolved = await resolveRepoPathDbFirst(onlyRepo, supabase);
    return {
      repoPath: resolved,
      repoResolved: !!resolved,
      registrySource: 'skipped',
      skipReason,
      probeExists: undefined,
    };
  }

  // Cross-repo supported → resolve target_application via DB-first SSOT
  const candidate = targetApplication || fallback;
  let repoPath = null;
  let registrySource = 'fallback';

  if (candidate) {
    try {
      // Try DB-first when supabase client provided
      if (supabase) {
        repoPath = await resolveRepoPathDbFirst(candidate, supabase);
        if (repoPath) registrySource = 'db';
      }
      // Fall back to sync registry if DB-path returned null OR no supabase
      if (!repoPath) {
        repoPath = resolveRepoPath(candidate);
        if (repoPath) registrySource = 'registry';
      }
    } catch {
      // Any resolution failure → null repoPath, registrySource='fallback'
      repoPath = null;
    }
  }

  const repoResolved = !!repoPath;
  const result = { repoPath, repoResolved, registrySource };

  // Optional probe existence check (for sub-agents that need a specific dir like src/components)
  const effectiveProbe = probeExistsRelative || capability.probe_path;
  if (repoResolved && effectiveProbe) {
    try {
      result.probeExists = fs.existsSync(path.join(repoPath, effectiveProbe));
    } catch {
      result.probeExists = false;
    }
  }

  return result;
}

/**
 * Apply repo-resolution verdict to a sub-agent results object — mirrors
 * lib/sub-agents/design/index.js:86's applyRepoResolutionVerdict pattern.
 *
 * Mutates `results.metadata` to include repo_path, repo_resolved, registry_source,
 * probe_exists (if checked), skip_reason (if skipped), and executed_from_cwd
 * (process.cwd() snapshot — used by gate's CWD_LEAK detection).
 *
 * Adjusts verdict to CONDITIONAL_PASS if resolution failed or probe missing
 * (matching the DESIGN sub-agent's fail-closed semantics: PASS produced by
 * scanning an unresolved/empty tree must not pass as green).
 *
 * @param {Object} results - sub-agent results object (mutated in place)
 * @param {Object} resolution - return value of resolveSubAgentRepo
 * @param {Object} [opts]
 * @param {string} [opts.severity='HIGH'] - warning severity to emit
 * @param {boolean} [opts.skipVerdictAdjust=false] - when true, only emits metadata, doesn't downgrade verdict (for sub-agents that don't have a numeric verdict, e.g., STORIES_CODEBASE which returns patterns)
 * @returns {Object} the same results object
 */
export function applySubAgentRepoVerdict(results, resolution, opts = {}) {
  const { severity = 'HIGH', skipVerdictAdjust = false } = opts;

  results.metadata = {
    ...(results.metadata || {}),
    repo_path: resolution.repoPath,
    repo_resolved: resolution.repoResolved,
    registry_source: resolution.registrySource,
    // eslint-disable-next-line no-process-cwd-in-sub-agents -- snapshot for PLAN-TO-EXEC CWD_LEAK detection; must be runtime cwd, not target_application path. Gate compares metadata.repo_path === executed_from_cwd to flag false-positive evidence rows.
    executed_from_cwd: process.cwd(),
    ...(resolution.probeExists !== undefined && { probe_exists: resolution.probeExists }),
    ...(resolution.skipReason && { skip_reason: resolution.skipReason }),
  };

  if (skipVerdictAdjust) return results;

  // Fail-closed: PASS on unresolved/empty tree → CONDITIONAL_PASS
  const probeFailed = resolution.probeExists === false;
  if ((!resolution.repoResolved || probeFailed) && results.verdict === 'PASS' && !resolution.skipReason) {
    results.verdict = 'CONDITIONAL_PASS';
    if (results.confidence > 60) results.confidence = 60;
    if (!results.warnings) results.warnings = [];
    results.warnings.push({
      severity,
      issue: `Sub-agent scanned an unresolved or empty repo (repo_resolved=${resolution.repoResolved}, probe_exists=${resolution.probeExists ?? 'not-checked'})`,
      recommendation: 'Verify the SD target_application resolves to the correct repo; an empty/wrong tree yields zero violations and must not pass as green',
    });
  }

  return results;
}
