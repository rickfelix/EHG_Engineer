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
      { artifact_type: 'problem_statement', min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: 'target_market_analysis', min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: 'value_proposition', min_quality_score: 0.6, url_verification_required: false },
    ],
  },
  '9->10': {
    description: 'ENGINE → IDENTITY',
    required_artifacts: [
      { artifact_type: 'risk_assessment', min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: 'revenue_model', min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: 'business_model_canvas', min_quality_score: 0.6, url_verification_required: false },
    ],
  },
  // System gate: checks artifact existence in venture_artifacts table.
  // Stage 12 also has a local data-based gate (in stage-12.js evaluateRealityGate)
  // that validates data completeness (funnel stages, journey steps, naming candidates).
  // Both gates must pass for the phase transition to succeed.
  '12->13': {
    description: 'IDENTITY → BLUEPRINT',
    required_artifacts: [
      { artifact_type: 'business_model_canvas', min_quality_score: 0.7, url_verification_required: false },
      { artifact_type: 'technical_architecture', min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: 'project_plan', min_quality_score: 0.5, url_verification_required: false },
    ],
  },
  '16->17': {
    description: 'BLUEPRINT → BUILD LOOP',
    required_artifacts: [
      { artifact_type: 'mvp_build', min_quality_score: 0.7, url_verification_required: true },
      { artifact_type: 'test_coverage_report', min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: 'deployment_runbook', min_quality_score: 0.5, url_verification_required: false },
    ],
  },
  '22->23': {
    description: 'BUILD LOOP → LAUNCH & LEARN',
    required_artifacts: [
      { artifact_type: 'launch_metrics', min_quality_score: 0.6, url_verification_required: false },
      { artifact_type: 'user_feedback_summary', min_quality_score: 0.5, url_verification_required: false },
      { artifact_type: 'production_app', min_quality_score: 0.7, url_verification_required: true },
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
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.fromStage - Current stage number
 * @param {number} params.toStage - Target stage number
 * @param {Object} params.db - Database client with .from().select()... API
 * @param {Function} [params.httpClient] - async (url, opts) => { status, ok }
 * @param {Function} [params.now] - () => Date (defaults to () => new Date())
 * @param {Object} [params.logger] - { info, warn, error } (defaults to console)
 * @param {Object} [params.profileThresholds] - Profile-specific threshold overrides.
 *   Map of artifact_type → min_quality_score. Overrides BOUNDARY_CONFIG values.
 *   (SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-C)
 * @returns {Promise<Object>} Gate result with status PASS|FAIL|NOT_APPLICABLE
 */
async function evaluateRealityGate({
  ventureId,
  fromStage,
  toStage,
  db,
  httpClient,
  now = () => new Date(),
  logger = console,
  profileThresholds = null,
}) {
  const transitionKey = `${fromStage}->${toStage}`;
  const evaluatedAt = now().toISOString();

  // Build base result
  const result = {
    venture_id: ventureId,
    from_stage: fromStage,
    to_stage: toStage,
    status: 'PASS',
    evaluated_at: evaluatedAt,
    reasons: [],
    module_version: MODULE_VERSION,
  };

  // Check if this is a configured boundary
  const config = BOUNDARY_CONFIG[transitionKey];
  if (!config) {
    result.status = 'NOT_APPLICABLE';
    return result;
  }

  // Validate inputs
  if (!ventureId) {
    result.status = 'FAIL';
    result.reasons.push({
      code: REASON_CODES.CONFIG_ERROR,
      message: 'ventureId is required for Reality Gate evaluation',
    });
    return result;
  }

  if (!db) {
    result.status = 'FAIL';
    result.reasons.push({
      code: REASON_CODES.CONFIG_ERROR,
      message: 'Database client (db) is required for Reality Gate evaluation',
    });
    return result;
  }

  // Fetch required artifacts from DB (TR-4: parameterized, minimal fields)
  let artifacts;
  try {
    const artifactTypes = config.required_artifacts.map(a => a.artifact_type);
    const { data, error } = await db
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
    // Fail-closed on DB errors (FR-6, D03)
    logger.error(`Reality Gate DB error for ${transitionKey}:`, err.message || err);
    result.status = 'FAIL';
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
  for (const req of config.required_artifacts) {
    const artifact = artifactMap.get(req.artifact_type);

    // Check 1: Artifact existence (FR-2)
    if (!artifact) {
      result.reasons.push({
        code: REASON_CODES.ARTIFACT_MISSING,
        message: `Required artifact '${req.artifact_type}' not found for boundary ${transitionKey}`,
        artifact_type: req.artifact_type,
      });
      continue; // Collect all failures, don't short-circuit
    }

    // Check 2: Quality score (FR-3)
    // Use profile threshold override if available, otherwise use BOUNDARY_CONFIG default
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

    // Check 3: URL verification (FR-4) - only when configured and httpClient provided
    if (req.url_verification_required && httpClient) {
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
    }
  }

  // Set final status
  if (result.reasons.length > 0) {
    result.status = 'FAIL';
  }

  // Include profile threshold metadata if overrides were applied
  if (profileThresholds) {
    result.profile_thresholds_applied = true;
    result.threshold_overrides = profileThresholds;
  }

  logger.info(`Reality Gate ${transitionKey}: ${result.status} (${result.reasons.length} issue(s))${profileThresholds ? ' [profile thresholds]' : ''}`);
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
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {boolean}
 */
function isGatedBoundary(fromStage, toStage) {
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
