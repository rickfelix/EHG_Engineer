/**
 * Context-Aware Sub-Agent Selector - Domain Keywords Module
 *
 * Loads domain keywords and coordination groups from external JSON configuration.
 * Provides lazy-loaded proxies for backwards compatibility.
 *
 * @module lib/modules/context-aware-selector/domain-keywords
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this module for relative path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Caches
// ============================================================================

let _domainKeywordsCache = null;
let _coordinationGroupsCache = null;

// ============================================================================
// Loaders
// ============================================================================

/**
 * Load domain keywords from external JSON configuration
 * Extracted to config/domain-keywords.json for maintainability
 *
 * @returns {Object} Domain keywords configuration
 */
export function loadDomainKeywords() {
  if (_domainKeywordsCache) return _domainKeywordsCache;

  try {
    const configPath = join(__dirname, '..', '..', '..', 'config', 'domain-keywords.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    _domainKeywordsCache = configData.domains;
    _coordinationGroupsCache = configData.coordinationGroups;
    return _domainKeywordsCache;
  } catch (error) {
    console.error('[DOMAIN_KEYWORDS] Failed to load config, using fallback:', error.message);
    // Return a minimal fallback for critical functionality
    return {
      DATABASE: {
        code: 'DATABASE',
        name: 'Principal Database Architect',
        primary: ['database', 'postgres', 'supabase', 'migration', 'schema'],
        secondary: ['table', 'column', 'query'],
        exclusions: [],
        minMatches: 2,
        weight: { title: 3, description: 2, content: 1 }
      }
    };
  }
}

/**
 * Load coordination groups from configuration
 *
 * @returns {Object} Coordination groups configuration
 */
export function loadCoordinationGroups() {
  if (_coordinationGroupsCache) return _coordinationGroupsCache;

  // Trigger loading if not already done
  loadDomainKeywords();
  return _coordinationGroupsCache || {};
}

// ============================================================================
// Proxies for Backwards Compatibility
// ============================================================================

/**
 * Lazy-loaded domain keywords proxy
 * Provides backwards compatible access to domain keywords
 */
export const DOMAIN_KEYWORDS = new Proxy({}, {
  get: (target, prop) => loadDomainKeywords()[prop],
  ownKeys: () => Object.keys(loadDomainKeywords()),
  getOwnPropertyDescriptor: (target, prop) => {
    const keywords = loadDomainKeywords();
    if (prop in keywords) {
      return { enumerable: true, configurable: true, value: keywords[prop] };
    }
    return undefined;
  },
  has: (target, prop) => prop in loadDomainKeywords()
});

/**
 * Lazy-loaded coordination groups proxy
 * Provides backwards compatible access to coordination groups
 */
export const COORDINATION_GROUPS = new Proxy({}, {
  get: (target, prop) => loadCoordinationGroups()[prop],
  ownKeys: () => Object.keys(loadCoordinationGroups()),
  getOwnPropertyDescriptor: (target, prop) => {
    const groups = loadCoordinationGroups();
    if (prop in groups) {
      return { enumerable: true, configurable: true, value: groups[prop] };
    }
    return undefined;
  },
  has: (target, prop) => prop in loadCoordinationGroups()
});
