/**
 * Artifact Version Chain — Explicit Version Lineage Tracking
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-02-B
 *
 * Tracks version lineage of lifecycle artifacts (PRDs, retrospectives,
 * handoffs) across stage transitions. Stores chains in eva_config table
 * with prefix artifact_chain: for explicit parent-child version tracking.
 *
 * @module lib/eva/artifact-version-chain
 */

import { randomUUID } from 'crypto';

const CHAIN_KEY_PREFIX = 'artifact_chain.';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache
let _chainCache = new Map();

/**
 * Create a new version chain for an artifact.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.artifactType - Type of artifact (prd, retrospective, handoff)
 * @param {string} params.stage - Lifecycle stage identifier
 * @param {Object} [params.initialData] - Initial artifact data snapshot
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ chainId: string, version: number, error?: string }>}
 */
export async function createChain(supabase, params, options = {}) {
  const { logger = console } = options;
  const { ventureId, artifactType, stage, initialData = {} } = params;

  if (!ventureId || !artifactType) {
    return { chainId: null, version: 0, error: 'Missing ventureId or artifactType' };
  }

  const chainId = randomUUID();
  const link = {
    linkId: randomUUID(),
    version: 1,
    parentLinkId: null,
    stage,
    artifactType,
    changeSummary: 'Initial version',
    data: initialData,
    createdAt: new Date().toISOString(),
  };

  const chain = {
    chainId,
    ventureId,
    artifactType,
    links: [link],
    currentVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const cacheKey = `${ventureId}:${artifactType}:${stage}`;
  _chainCache.set(cacheKey, chain);

  if (!supabase) {
    return { chainId, version: 1, warning: 'No supabase — cached only' };
  }

  try {
    const key = `${CHAIN_KEY_PREFIX}${chainId}`;
    const { error } = await supabase
      .from('eva_config')
      .upsert({
        key,
        value: JSON.stringify(chain),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      logger.warn(`[VersionChain] Persist failed for ${chainId}: ${error.message}`);
      return { chainId, version: 1, warning: 'Cache updated, persistence failed' };
    }

    return { chainId, version: 1 };
  } catch (err) {
    logger.warn(`[VersionChain] Create error: ${err.message}`);
    return { chainId, version: 1, warning: err.message };
  }
}

/**
 * Add a new version link to an existing chain.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} chainId - Chain UUID
 * @param {Object} params
 * @param {string} params.stage - Current lifecycle stage
 * @param {string} params.changeSummary - Description of changes
 * @param {Object} [params.data] - Artifact data snapshot
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ linkId: string, version: number, error?: string }>}
 */
export async function addLink(supabase, chainId, params, options = {}) {
  const { logger = console } = options;
  const { stage, changeSummary, data = {} } = params;

  if (!chainId) {
    return { linkId: null, version: 0, error: 'Missing chainId' };
  }

  // Load chain
  const { chain, error: loadError } = await loadChain(supabase, chainId, options);
  if (loadError || !chain) {
    return { linkId: null, version: 0, error: loadError || 'Chain not found' };
  }

  const previousLink = chain.links[chain.links.length - 1];
  const newVersion = chain.currentVersion + 1;

  const link = {
    linkId: randomUUID(),
    version: newVersion,
    parentLinkId: previousLink.linkId,
    stage,
    changeSummary,
    data,
    createdAt: new Date().toISOString(),
  };

  chain.links.push(link);
  chain.currentVersion = newVersion;
  chain.updatedAt = new Date().toISOString();

  // Update cache
  for (const [key, cached] of _chainCache.entries()) {
    if (cached.chainId === chainId) {
      _chainCache.set(key, chain);
      break;
    }
  }

  if (!supabase) {
    return { linkId: link.linkId, version: newVersion, warning: 'No supabase — cached only' };
  }

  try {
    const key = `${CHAIN_KEY_PREFIX}${chainId}`;
    const { error } = await supabase
      .from('eva_config')
      .upsert({
        key,
        value: JSON.stringify(chain),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      logger.warn(`[VersionChain] Update failed for ${chainId}: ${error.message}`);
      return { linkId: link.linkId, version: newVersion, warning: 'Persistence failed' };
    }

    return { linkId: link.linkId, version: newVersion };
  } catch (err) {
    logger.warn(`[VersionChain] AddLink error: ${err.message}`);
    return { linkId: link.linkId, version: newVersion, warning: err.message };
  }
}

/**
 * Get the full version chain.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} chainId - Chain UUID
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ chain: Object|null, error?: string }>}
 */
export async function getChain(supabase, chainId, options = {}) {
  return loadChain(supabase, chainId, options);
}

/**
 * Get the latest version link from a chain.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} chainId - Chain UUID
 * @param {Object} [options]
 * @returns {Promise<{ link: Object|null, version: number, error?: string }>}
 */
export async function getLatestVersion(supabase, chainId, options = {}) {
  const { chain, error } = await loadChain(supabase, chainId, options);
  if (error || !chain) {
    return { link: null, version: 0, error: error || 'Chain not found' };
  }

  const latestLink = chain.links[chain.links.length - 1];
  return { link: latestLink, version: chain.currentVersion };
}

/**
 * Clear all cached chains (for testing).
 */
export function clearChainCache() {
  _chainCache.clear();
}

// ── Internal ─────────────────────────────────────

async function loadChain(supabase, chainId, options = {}) {
  const { logger = console } = options;

  // Check cache
  for (const [, cached] of _chainCache.entries()) {
    if (cached.chainId === chainId) {
      return { chain: cached };
    }
  }

  if (!supabase) {
    return { chain: null, error: 'No supabase and not in cache' };
  }

  try {
    const key = `${CHAIN_KEY_PREFIX}${chainId}`;
    const { data, error } = await supabase
      .from('eva_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) {
      return { chain: null, error: 'Chain not found in database' };
    }

    const parsed = JSON.parse(data.value);

    // Check TTL
    const updatedAt = new Date(parsed.updatedAt).getTime();
    if (Date.now() - updatedAt > DEFAULT_TTL_MS) {
      logger.info(`[VersionChain] Chain ${chainId} expired (TTL)`);
      return { chain: null, error: 'Chain expired' };
    }

    // Populate cache
    const cacheKey = `${parsed.ventureId}:${parsed.artifactType}:${parsed.links[0]?.stage || 'unknown'}`;
    _chainCache.set(cacheKey, parsed);

    return { chain: parsed };
  } catch (err) {
    logger.warn(`[VersionChain] Load error: ${err.message}`);
    return { chain: null, error: err.message };
  }
}
