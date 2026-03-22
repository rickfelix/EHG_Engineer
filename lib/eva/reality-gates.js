/**
 * Reality Gate Enforcement
 *
 * SD-LEO-INFRA-REALITY-GATES-001
 * Always-on gates that block venture phase transitions unless required
 * artifacts exist, meet quality thresholds, and (where configured)
 * deployed URLs are reachable.
 *
 * Enforced boundaries: 5→6, 9→10, 12→13, 16→17, 22→23
 *
 * Design: Pure dependency injection (db, httpClient, now) for
 * deterministic testing without production bypass flags.
 *
 * @module lib/eva/reality-gates
 */

import { ARTIFACT_TYPES } from './artifact-types.js';

const MODULE_VERSION = '1.0.0';

// --- Reason codes (fixed enum per FR-5) ---
const REASON_CODES = Object.freeze({
  ARTIFACT_MISSING: 'ARTIFACT_MISSING',
  QUALITY_SCORE_MISSING: 'QUALITY_SCORE_MISSING',
  QUALITY_SCORE_BELOW_THRESHOLD: 'QUALITY_SCORE_BELOW_THRESHOLD',
  URL_UNREACHABLE: 'URL_UNREACHABLE',
  DB_ERROR: 'DB_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
});

// --- Boundary configuration (TR-2) ---
// Keyed by "from->to". Each entry lists required artifacts with
// their minimum quality score and optional URL verification.
const BOUNDARY_CONFIG = Object.freeze({
  '5->6': {
    description: 'SPARK → ENGINE',
    required_artifacts: [
      { artifact_type: ARTIFACT_TYPES.TRUTH_PROBLEM_STATEMENT, min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.TRUTH_TARGET_MARKET_ANALYSIS, min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.TRUTH_VALUE_PROPOSITION, min_quality_score: 0.6, url_verification_required: false },
    ],
  },
  '9->10': {
    description: 'ENGINE → IDENTITY',
    required_artifacts: [
      { artifact_type: ARTIFACT_TYPES.ENGINE_RISK_ASSESSMENT, min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.ENGINE_REVENUE_MODEL, min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS, min_quality_score: 0.6, url_verification_required: false },
    ],
  },
  // System gate: checks artifact existence in venture_artifacts table.
  // Stage 12 also has a local data-based gate (in stage-12.js evaluateRealityGate)
  // that validates data completeness (funnel stages, journey steps, naming candidates).
  // Both gates must pass for the phase transition to succeed.
  '12->13': {
    description: 'IDENTITY → BLUEPRINT',
    required_artifacts: [
      { artifact_type: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS, min_quality_score: 0.7, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.BLUEPRINT_PROJECT_PLAN, min_quality_score: 0.5, url_verification_required: false },
    ],
  },
  '17->18': {
    description: 'BLUEPRINT → BUILD LOOP',
    required_artifacts: [
      { artifact_type: ARTIFACT_TYPES.BUILD_MVP_BUILD, min_quality_score: 0.7, url_verification_required: true },
      { artifact_type: ARTIFACT_TYPES.BUILD_TEST_COVERAGE_REPORT, min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.LAUNCH_DEPLOYMENT_RUNBOOK, min_quality_score: 0.5, url_verification_required: false },
    ],
  },
  '23->24': {
    description: 'BUILD LOOP → LAUNCH & LEARN',
    required_artifacts: [
      { artifact_type: ARTIFACT_TYPES.LAUNCH_LAUNCH_METRICS, min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.LAUNCH_USER_FEEDBACK_SUMMARY, min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: ARTIFACT_TYPES.LAUNCH_PRODUCTION_APP, min_quality_score: 0.7, url_verification_required: true },
    ],
  },
});

// Allowed HTTP status codes for URL verification (default)
const DEFAULT_ALLOWED_STATUSES = [200, 201, 202, 204, 301, 302, 303, 307, 308];
const URL_TIMEOUT_MS = 1000;
const MAX_URL_RETRIES = 1; // Single retry on network timeout only

/**
 * Evaluate a Reality Gate for a venture stage transition.
 *
 * Accepts two calling conventions for backward compatibility:
 *   evaluateRealityGate({ ventureId, fromStage, toStage, supabase, ... })     // single-arg
 *   evaluateRealityGate({ ventureId, from, to }, { supabase, httpClient })    // two-arg (orchestrator)
 *
 * When `requiredArtifacts` is provided (from lifecycle_stage_config), uses those
 * instead of the deprecated BOUNDARY_CONFIG. Falls back to BOUNDARY_CONFIG if
 * requiredArtifacts is not supplied.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} [params.fromStage] - Current stage number
 * @param {number} [params.from] - Alias for fromStage (orchestrator convention)
 * @param {number} [params.toStage] - Target stage number
 * @param {number} [params.to] - Alias for toStage (orchestrator convention)
 * @param {string[]} [params.requiredArtifacts] - Artifact types from lifecycle_stage_config (DB-driven)
 * @param {Object} [params.supabase] - Supabase client (can also be in deps)
 * @param {Object} [deps] - Injected dependencies (second-arg calling convention)
 * @param {Object} [deps.supabase] - Supabase client
 * @param {Function} [deps.httpClient] - async (url, opts) => { status, ok }
 * @param {Function} [deps.now] - () => Date
 * @returns {Promise<Object>} Gate result with passed: true/false
 */
async function evaluateRealityGate(params, deps = {}) {
  const {
    ventureId,
    fromStage, from,
    toStage, to,
    supabase: supabaseFromParams,
    httpClient: httpClientFromParams,
    now: nowFromParams,
    logger: loggerFromParams,
    profileThresholds = null,
    requiredArtifacts = null,
    simulationMode = false,
  } = params;

  // Normalize parameters (handle both calling conventions)
  const effectiveFromStage = fromStage ?? from;
  const effectiveToStage = toStage ?? to;
  const supabase = supabaseFromParams ?? deps.supabase;
  const httpClient = httpClientFromParams ?? deps.httpClient;
  const now = nowFromParams ?? deps.now ?? (() => new Date());
  const logger = loggerFromParams ?? deps.logger ?? console;

  const transitionKey = `${effectiveFromStage}->${effectiveToStage}`;
  const evaluatedAt = now().toISOString();

  // Build base result
  const result = {
    venture_id: ventureId,
    from_stage: effectiveFromStage,
    to_stage: effectiveToStage,
    status: 'PASS',
    passed: true,
    evaluated_at: evaluatedAt,
    reasons: [],
    module_version: MODULE_VERSION,
  };

  // Determine artifact requirements: DB config (preferred) → BOUNDARY_CONFIG (fallback)
  let artifactRequirements;
  if (requiredArtifacts && requiredArtifacts.length > 0) {
    // DB-driven: convert string array to requirement objects with default quality threshold
    artifactRequirements = requiredArtifacts.map(type => ({
      artifact_type: type,
      min_quality_score: 0.5, // Default threshold for DB-driven artifacts
      url_verification_required: false,
    }));
    result.config_source = 'lifecycle_stage_config';
  } else {
    const config = BOUNDARY_CONFIG[transitionKey];
    if (!config) {
      result.status = 'NOT_APPLICABLE';
      result.passed = true; // NOT_APPLICABLE means gate doesn't block
      return result;
    }
    artifactRequirements = config.required_artifacts;
    result.config_source = 'BOUNDARY_CONFIG';
  }

  // Validate inputs
  if (!ventureId) {
    result.status = 'FAIL';
    result.passed = false;
    result.reasons.push({
      code: REASON_CODES.CONFIG_ERROR,
      message: 'ventureId is required for Reality Gate evaluation',
    });
    return result;
  }

  if (!supabase) {
    result.status = 'FAIL';
    result.passed = false;
    result.reasons.push({
      code: REASON_CODES.CONFIG_ERROR,
      message: 'Database client (supabase) is required for Reality Gate evaluation',
    });
    return result;
  }

  // Fetch required artifacts from DB
  let artifacts;
  try {
    const artifactTypes = artifactRequirements.map(a => a.artifact_type);
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, quality_score, file_url, is_current')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .in('artifact_type', artifactTypes);

    if (error) {
      throw error;
    }
    artifacts = data || [];
  } catch (err) {
    // Fail-closed on DB errors
    logger.error(`Reality Gate DB error for ${transitionKey}:`, err.message || err);
    result.status = 'FAIL';
    result.passed = false;
    result.reasons.push({
      code: REASON_CODES.DB_ERROR,
      message: `Database query failed: ${(err.message || 'unknown error').slice(0, 150)}`,
    });
    return result;
  }

  // Build lookup map: artifact_type -> artifact record
  const artifactMap = new Map();
  for (const a of artifacts) {
    artifactMap.set(a.artifact_type, a);
  }

  // Evaluate each required artifact
  for (const req of artifactRequirements) {
    const artifact = artifactMap.get(req.artifact_type);

    // Check 1: Artifact existence
    if (!artifact) {
      result.reasons.push({
        code: REASON_CODES.ARTIFACT_MISSING,
        message: `Required artifact '${req.artifact_type}' not found for boundary ${transitionKey}`,
        artifact_type: req.artifact_type,
      });
      continue;
    }

    // Check 2: Quality score
    const effectiveThreshold = profileThresholds?.[req.artifact_type] ?? req.min_quality_score;

    if (artifact.quality_score == null) {
      result.reasons.push({
        code: REASON_CODES.QUALITY_SCORE_MISSING,
        message: `Artifact '${req.artifact_type}' has no quality score; required >= ${effectiveThreshold}`,
        artifact_type: req.artifact_type,
      });
    } else if (artifact.quality_score < effectiveThreshold) {
      result.reasons.push({
        code: REASON_CODES.QUALITY_SCORE_BELOW_THRESHOLD,
        message: `Artifact '${req.artifact_type}' quality ${artifact.quality_score} < required ${effectiveThreshold}`,
        artifact_type: req.artifact_type,
        actual: artifact.quality_score,
        required: effectiveThreshold,
        profile_override: profileThresholds?.[req.artifact_type] != null,
      });
    }

    // Check 3: URL verification - only when configured and httpClient provided.
    // In simulation mode, skip URL reachability entirely — simulated ventures
    // cannot have deployed URLs. Artifact content quality is validated by the
    // quality score checks above instead.
    if (req.url_verification_required && httpClient && !simulationMode) {
      const url = artifact.file_url;
      if (!url) {
        result.reasons.push({
          code: REASON_CODES.URL_UNREACHABLE,
          message: `Artifact '${req.artifact_type}' requires URL verification but has no URL`,
          artifact_type: req.artifact_type,
        });
      } else {
        const urlResult = await verifyUrl(url, httpClient, logger);
        if (!urlResult.reachable) {
          result.reasons.push({
            code: REASON_CODES.URL_UNREACHABLE,
            message: `URL unreachable for '${req.artifact_type}': ${urlResult.detail.slice(0, 100)}`,
            artifact_type: req.artifact_type,
            url: url,
          });
        }
      }
    } else if (req.url_verification_required && simulationMode) {
      logger.info(`Reality Gate: skipping URL verification for '${req.artifact_type}' (simulation mode)`);
    }
  }

  // Set final status — BLOCKED instead of FAIL (Chairman decides venture fate)
  if (result.reasons.length > 0) {
    result.status = 'BLOCKED';
    result.passed = false;
  }

  // Include profile threshold metadata if overrides were applied
  if (profileThresholds) {
    result.profile_thresholds_applied = true;
    result.threshold_overrides = profileThresholds;
  }

  // Include simulation mode metadata
  if (simulationMode) {
    result.simulation_mode = true;
  }

  logger.info(`Reality Gate ${transitionKey}: ${result.status} (${result.reasons.length} issue(s))${profileThresholds ? ' [profile thresholds]' : ''}${simulationMode ? ' [simulation]' : ''} [${result.config_source}]`);
  return result;
}

/**
 * Verify a URL is reachable with retry on network timeout.
 *
 * @param {string} url - URL to probe
 * @param {Function} httpClient - async (url, opts) => { status, ok }
 * @param {Object} logger - Logger
 * @returns {Promise<{reachable: boolean, detail: string}>}
 */
async function verifyUrl(url, httpClient, logger) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_URL_RETRIES; attempt++) {
    try {
      const response = await httpClient(url, {
        method: 'HEAD',
        timeout: URL_TIMEOUT_MS,
        redirect: 'follow',
      });

      const status = response.status || response.statusCode;
      if (DEFAULT_ALLOWED_STATUSES.includes(status)) {
        return { reachable: true, detail: `HTTP ${status}` };
      }
      return { reachable: false, detail: `HTTP ${status} (not in allowed statuses)` };
    } catch (err) {
      lastError = err;
      const isTimeout = err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNABORTED' ||
        err.name === 'TimeoutError' ||
        (err.message && err.message.includes('timeout'));

      if (isTimeout && attempt < MAX_URL_RETRIES) {
        logger.warn(`URL check timeout for ${url}, retrying (${attempt + 1}/${MAX_URL_RETRIES})`);
        continue;
      }
      break;
    }
  }

  const detail = lastError
    ? `${lastError.code || lastError.name || 'Error'}: ${(lastError.message || '').slice(0, 80)}`
    : 'Unknown error';
  return { reachable: false, detail };
}

/**
 * Get the boundary configuration for a given transition.
 * Returns null if no Reality Gate applies.
 *
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {Object|null}
 */
function getBoundaryConfig(fromStage, toStage) {
  return BOUNDARY_CONFIG[`${fromStage}->${toStage}`] || null;
}

/**
 * Check if a transition has a Reality Gate.
 *
 * Returns true if:
 *   - requiredArtifacts is provided and non-empty (DB-driven), OR
 *   - the transition exists in BOUNDARY_CONFIG (legacy fallback)
 *
 * @param {number} fromStage
 * @param {number} toStage
 * @param {string[]} [requiredArtifacts] - From lifecycle_stage_config (overrides BOUNDARY_CONFIG)
 * @returns {boolean}
 */
function isGatedBoundary(fromStage, toStage, requiredArtifacts) {
  if (requiredArtifacts && requiredArtifacts.length > 0) return true;
  return `${fromStage}->${toStage}` in BOUNDARY_CONFIG;
}

export {
  evaluateRealityGate,
  getBoundaryConfig,
  isGatedBoundary,
  BOUNDARY_CONFIG,
  REASON_CODES,
  MODULE_VERSION,
};

// Exported for testing only
export const _internal = {
  verifyUrl,
  DEFAULT_ALLOWED_STATUSES,
  URL_TIMEOUT_MS,
  MAX_URL_RETRIES,
};
