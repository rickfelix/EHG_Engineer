/**
 * SD Router — Resolves target_application for venture SDs (fail-closed).
 *
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-A: original silent EHG fallback
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A: DB-derived registry + NFKD normalizer
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B (this SD): PA-1 fail-closed throws,
 *   sd_type-constrained null-venture branch (security C-SEC-8B), error
 *   taxonomy split (security C-SEC-4).
 *
 * Two entry points (use the one that matches your caller's I/O posture):
 *   - resolveTargetApplication (sync) — uses lib/venture-resolver.js::getVentureConfig
 *     (registry.json + NFKD normalizer). No supabase required.
 *   - resolveTargetApplicationAsync (async) — uses getVentureConfigAsync
 *     (vw_venture_registry view). Distinguishes registry-miss (permanent) from
 *     registry-query-error (transient) per security C-SEC-4. Requires supabase.
 *
 * Both flow:
 *   - Null/empty name + legitimate sd_type → EHG fallback (validation C3)
 *   - Null/empty name + non-legitimate sd_type → throw VentureNotRegisteredError
 *   - Non-null name + registry hit → resolved venture
 *   - Non-null name + registry miss → throw VentureNotRegisteredError
 *   (async-only) Non-null name + registry query error → throw VentureRegistryUnavailableError
 *
 * @module lib/eva/bridge/sd-router
 */

import { getVentureConfig, getVentureConfigAsync } from '../../venture-resolver.js';
import {
  VentureNotRegisteredError,
  VentureRegistryUnavailableError,
} from './venture-routing-error.js';

const DEFAULT_TARGET = 'ehg';

/**
 * sd_types that legitimately have no parent venture (LEO governance work).
 * Per security-agent C-SEC-8B: without this constraint, any caller could
 * route to EHG by omitting venture_name. Listed here as the source of truth.
 */
export const LEGITIMATE_NO_VENTURE_SD_TYPES = new Set([
  'infrastructure',
  'governance',
  'leo',
  'documentation',
  'refactor',
]);

/**
 * Internal: validate the null-venture branch against sd_type / metadata.
 * @returns {boolean} true if null-venture is legitimate
 */
function isLegitimateNoVenture(sd_type, metadata) {
  if (sd_type && LEGITIMATE_NO_VENTURE_SD_TYPES.has(sd_type)) return true;
  if (metadata?.engineering_only === true) return true;
  return false;
}

/**
 * Internal: build the EHG fallback resolution structure.
 */
function buildEhgFallback() {
  return {
    targetApp: DEFAULT_TARGET,
    githubRepo: null,
    localPath: null,
    supabaseSchema: null,
    fallback: true,
  };
}

/**
 * Internal: build the EHG fallback throw context for a non-legitimate null-venture.
 */
function throwOnIllegitimateNullVenture(ventureName, sd_type, metadata) {
  throw new VentureNotRegisteredError({
    attemptedName: ventureName ?? '',
    sd_context: { sd_type, has_metadata_engineering_only: metadata?.engineering_only === true },
    resolution_hint:
      'Provide venture_name on the SD, or set sd_type to one of: ' +
      Array.from(LEGITIMATE_NO_VENTURE_SD_TYPES).join(', ') +
      ', or set metadata.engineering_only=true for legitimate EHG_Engineer infrastructure work.',
  });
}

/**
 * Internal: shape a resolver row into the public result.
 */
function shapeResolution(config, logger, ventureName) {
  logger.log('[sd-router] Resolved venture "' + ventureName + '" -> target_application: ' + config.name);
  return {
    targetApp: config.name,
    githubRepo: config.repo_url || config.github_repo || null,
    localPath: config.local_path || null,
    supabaseSchema: config.supabase_schema || null,
    fallback: false,
  };
}

/**
 * Sync resolver — uses lib/venture-resolver.js::getVentureConfig (registry.json + NFKD).
 *
 * @param {string|null|undefined} ventureName
 * @param {Object} [options]
 * @param {string|null} [options.sd_type] - SD type for null-venture validation (C-SEC-8B)
 * @param {Object|null} [options.metadata] - SD metadata; metadata.engineering_only=true legitimizes null-venture
 * @param {Object} [options.logger=console]
 * @returns {{ targetApp: string, githubRepo: string|null, localPath: string|null, supabaseSchema: string|null, fallback: boolean }}
 * @throws {VentureNotRegisteredError}
 */
export function resolveTargetApplication(
  ventureName,
  { sd_type = null, metadata = null, logger = console } = {}
) {
  if (!ventureName) {
    if (!isLegitimateNoVenture(sd_type, metadata)) {
      throwOnIllegitimateNullVenture(ventureName, sd_type, metadata);
    }
    logger.log('[sd-router] No venture name (legitimate ' + (sd_type || 'engineering_only') + '), using default:', DEFAULT_TARGET);
    return buildEhgFallback();
  }

  const config = getVentureConfig(ventureName);
  if (!config) {
    throw new VentureNotRegisteredError({
      attemptedName: ventureName,
      sd_context: { sd_type, ventureName },
    });
  }
  return shapeResolution(config, logger, ventureName);
}

/**
 * Async resolver — uses lib/venture-resolver.js::getVentureConfigAsync (vw_venture_registry).
 * Distinguishes registry-miss (permanent) from registry-query-error (transient).
 *
 * @param {Object} args
 * @param {string|null|undefined} args.ventureName
 * @param {Object} args.supabase - Supabase client (required for non-null names)
 * @param {string|null} [args.sd_type]
 * @param {Object|null} [args.metadata]
 * @param {Object} [args.logger=console]
 * @returns {Promise<{ targetApp: string, githubRepo: string|null, localPath: string|null, supabaseSchema: string|null, fallback: boolean }>}
 * @throws {VentureNotRegisteredError} permanent failure
 * @throws {VentureRegistryUnavailableError} transient failure
 */
export async function resolveTargetApplicationAsync({
  ventureName,
  supabase,
  sd_type = null,
  metadata = null,
  logger = console,
}) {
  if (!ventureName) {
    if (!isLegitimateNoVenture(sd_type, metadata)) {
      throwOnIllegitimateNullVenture(ventureName, sd_type, metadata);
    }
    logger.log('[sd-router] No venture name (legitimate ' + (sd_type || 'engineering_only') + '), using default:', DEFAULT_TARGET);
    return buildEhgFallback();
  }

  if (!supabase) {
    throw new Error(
      '[sd-router] resolveTargetApplicationAsync requires supabase for non-null venture names. ' +
      'Pass { supabase } in the args, or use the sync resolveTargetApplication for registry.json lookup.'
    );
  }

  let config;
  try {
    config = await getVentureConfigAsync({ name: ventureName, supabase });
  } catch (err) {
    if (
      err?.name === 'VentureRegistryCollisionError' ||
      err?.name === 'VentureRegistryInvalidNameError'
    ) {
      throw err;
    }
    throw new VentureRegistryUnavailableError({
      attemptedName: ventureName,
      underlyingError: err,
    });
  }

  if (!config) {
    throw new VentureNotRegisteredError({
      attemptedName: ventureName,
      sd_context: { sd_type, ventureName },
    });
  }
  return shapeResolution(config, logger, ventureName);
}
