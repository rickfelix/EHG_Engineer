/**
 * SD Router — Resolves target_application for venture SDs
 *
 * Validates venture names against applications/registry.json via venture-resolver.js.
 * Falls back to 'ehg' when venture name is null, undefined, or not registered.
 *
 * Created by: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-A
 *
 * @module lib/eva/bridge/sd-router
 */

import { getVentureConfig } from '../../venture-resolver.js';

const DEFAULT_TARGET = 'ehg';

/**
 * Resolve the target application for a venture SD.
 *
 * @param {string|null|undefined} ventureName - The venture name from stage execution context
 * @param {Object} [options]
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {{ targetApp: string, githubRepo: string|null, localPath: string|null, supabaseSchema: string|null, fallback: boolean }}
 */
export function resolveTargetApplication(ventureName, { logger = console } = {}) {
  if (!ventureName) {
    logger.log('[sd-router] No venture name provided, using default:', DEFAULT_TARGET);
    return {
      targetApp: DEFAULT_TARGET,
      githubRepo: null,
      localPath: null,
      supabaseSchema: null,
      fallback: true,
    };
  }

  const config = getVentureConfig(ventureName);

  if (!config) {
    logger.warn(`[sd-router] Venture "${ventureName}" not found in registry, falling back to: ${DEFAULT_TARGET}`);
    return {
      targetApp: DEFAULT_TARGET,
      githubRepo: null,
      localPath: null,
      supabaseSchema: null,
      fallback: true,
    };
  }

  logger.log(`[sd-router] Resolved venture "${ventureName}" → target_application: ${config.name}`);

  return {
    targetApp: config.name,
    githubRepo: config.github_repo || null,
    localPath: config.local_path || null,
    supabaseSchema: config.supabase_schema || null,
    fallback: false,
  };
}
