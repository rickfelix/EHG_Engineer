/**
 * Persona Configuration Provider
 * SD-MAN-GEN-TITLE-TARGET-APPLICATION-001
 *
 * Loads per-application persona rules from the persona_config database table.
 * Falls back to hardcoded defaults if database is unavailable.
 *
 * Cache: 5-minute TTL to minimize DB calls.
 *
 * @module persona-config-provider
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let configCache = new Map();
let cacheTimestamp = 0;

// Error codes for persona validation
export const PERSONA_ERRORS = {
  PERSONA_NOT_ALLOWED_FOR_APP: 'PERSONA_NOT_ALLOWED_FOR_APP',
  PERSONA_TEMPLATE_NOT_FOUND: 'PERSONA_TEMPLATE_NOT_FOUND',
  PERSONA_CONFIG_FALLBACK_USED: 'PERSONA_CONFIG_FALLBACK_USED'
};

/**
 * Hardcoded fallback defaults (used when DB is unavailable)
 * Matches the seed data in 20260206_persona_config_table.sql
 */
const FALLBACK_CONFIGS = {
  'EHG': {
    target_application: 'EHG',
    mandatory_personas: ['chairman', 'solo_entrepreneur'],
    forbidden_personas: ['developer', 'dba', 'admin', 'engineer', 'ops', 'devops', 'sysadmin', 'backend', 'frontend', 'qa', 'tester', 'it', 'infrastructure', 'platform'],
    optional_triggers: { eva: 'automation' },
    sd_type_overrides: {
      infrastructure: { allow_technical: true },
      database: { allow_technical: true }
    }
  },
  'EHG_Engineer': {
    target_application: 'EHG_Engineer',
    mandatory_personas: ['chairman'],
    forbidden_personas: null,
    optional_triggers: { devops_engineer: 'infra', eva: 'automation' },
    sd_type_overrides: {}
  },
  '_default': {
    target_application: '_default',
    mandatory_personas: ['chairman'],
    forbidden_personas: ['developer', 'dba', 'admin', 'engineer', 'ops', 'devops', 'sysadmin', 'backend', 'frontend', 'qa', 'tester', 'it', 'infrastructure', 'platform'],
    optional_triggers: { eva: 'automation' },
    sd_type_overrides: {
      infrastructure: { allow_technical: true },
      documentation: { allow_technical: true },
      refactor: { allow_technical: true },
      database: { allow_technical: true }
    }
  }
};

/**
 * Normalize a persona string to snake_case for consistent matching.
 * Handles: camelCase, PascalCase, spaces, hyphens, mixed formats.
 *
 * Examples:
 *   "SoloEntrepreneur" → "solo_entrepreneur"
 *   "solo-entrepreneur" → "solo_entrepreneur"
 *   "Solo Entrepreneur" → "solo_entrepreneur"
 *   "soloEntrepreneur"  → "solo_entrepreneur"
 *   "  DEVELOPER  "     → "developer"
 *
 * @param {string} persona - Raw persona string
 * @returns {string} Normalized snake_case persona
 */
export function normalizePersona(persona) {
  if (!persona || typeof persona !== 'string') return '';

  return persona
    .trim()
    // Insert underscore before uppercase letters that follow lowercase (camelCase/PascalCase)
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    // Replace hyphens and spaces with underscores
    .replace(/[-\s]+/g, '_')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Get a Supabase client (lazy creation)
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Load all persona configs from database into cache
 */
async function refreshCache() {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { data, error } = await supabase
      .from('persona_config')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.warn(`   ⚠️  PersonaConfigProvider: DB error: ${error.message}`);
      return false;
    }

    configCache = new Map();
    for (const row of (data || [])) {
      configCache.set(row.target_application, row);
    }
    cacheTimestamp = Date.now();
    return true;
  } catch (err) {
    console.warn(`   ⚠️  PersonaConfigProvider: Failed to load: ${err.message}`);
    return false;
  }
}

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return configCache.size > 0 && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

/**
 * Get persona configuration for a target application
 *
 * @param {string} targetApp - Target application name (e.g., 'EHG', 'EHG_Engineer')
 * @returns {Promise<Object>} Persona config for the application
 */
export async function getPersonaConfig(targetApp) {
  if (!isCacheValid()) {
    await refreshCache();
  }

  // Try exact match first
  if (configCache.has(targetApp)) {
    return configCache.get(targetApp);
  }

  // Try _default from cache
  if (configCache.has('_default')) {
    return configCache.get('_default');
  }

  // Fall back to hardcoded defaults
  return FALLBACK_CONFIGS[targetApp] || FALLBACK_CONFIGS['_default'];
}

/**
 * Check if a persona is forbidden for a specific application and SD type
 *
 * @param {string} persona - Persona name to check
 * @param {string} targetApp - Target application name
 * @param {string} [sdType] - SD type (e.g., 'feature', 'infrastructure')
 * @returns {Promise<boolean>} True if the persona is forbidden
 */
export async function isForbiddenForApp(persona, targetApp, sdType) {
  const config = await getPersonaConfig(targetApp);
  const normalized = normalizePersona(persona);

  // If no forbidden list (null), nothing is forbidden
  if (!config.forbidden_personas) {
    return false;
  }

  // Check SD type override first
  if (sdType && config.sd_type_overrides) {
    const override = config.sd_type_overrides[sdType.toLowerCase()];
    if (override?.allow_technical) {
      return false; // Technical personas allowed for this SD type
    }
  }

  // Check against forbidden list (normalize both sides)
  return config.forbidden_personas.some(fp => {
    const normalizedFp = normalizePersona(fp);
    return normalized.includes(normalizedFp) || normalizedFp.includes(normalized);
  });
}

/**
 * Get the forbidden personas list for an application (synchronous, uses cache)
 * Returns the global default list if cache is empty
 *
 * @param {string} targetApp - Target application name
 * @param {string} [sdType] - SD type for override checking
 * @returns {string[]} Array of forbidden persona names (may be empty)
 */
export function getForbiddenPersonasSync(targetApp, sdType) {
  const config = configCache.get(targetApp)
    || configCache.get('_default')
    || FALLBACK_CONFIGS[targetApp]
    || FALLBACK_CONFIGS['_default'];

  // If no forbidden list, return empty
  if (!config.forbidden_personas) {
    return [];
  }

  // Check SD type override
  if (sdType && config.sd_type_overrides) {
    const override = config.sd_type_overrides[sdType.toLowerCase()];
    if (override?.allow_technical) {
      return []; // Technical personas allowed
    }
  }

  return config.forbidden_personas;
}

/**
 * Validate a persona for a specific application and SD type.
 * Returns a structured result with error code if validation fails.
 *
 * @param {string} persona - Persona name to validate
 * @param {string} targetApp - Target application name
 * @param {string} [sdType] - SD type (e.g., 'feature', 'infrastructure')
 * @returns {Promise<{valid: boolean, normalized: string, error?: string, errorCode?: string}>}
 */
export async function validatePersonaForApp(persona, targetApp, sdType) {
  const normalized = normalizePersona(persona);

  if (!normalized) {
    return { valid: false, normalized: '', error: 'Empty persona', errorCode: PERSONA_ERRORS.PERSONA_TEMPLATE_NOT_FOUND };
  }

  const config = await getPersonaConfig(targetApp);
  const usedFallback = !configCache.has(targetApp) && !configCache.has('_default');

  if (usedFallback) {
    console.log(`   [PersonaConfig] ${PERSONA_ERRORS.PERSONA_CONFIG_FALLBACK_USED}: Using hardcoded defaults for "${targetApp}"`);
  }

  // If no forbidden list (null), all personas are valid
  if (!config.forbidden_personas) {
    return { valid: true, normalized };
  }

  // Check SD type override
  if (sdType && config.sd_type_overrides) {
    const override = config.sd_type_overrides[sdType.toLowerCase()];
    if (override?.allow_technical) {
      return { valid: true, normalized };
    }
  }

  // Check against forbidden list
  const isForbidden = config.forbidden_personas.some(fp => {
    const normalizedFp = normalizePersona(fp);
    return normalized.includes(normalizedFp) || normalizedFp.includes(normalized);
  });

  if (isForbidden) {
    return {
      valid: false,
      normalized,
      error: `Persona "${persona}" (normalized: "${normalized}") is not allowed for application "${targetApp}"${sdType ? ` with SD type "${sdType}"` : ''}`,
      errorCode: PERSONA_ERRORS.PERSONA_NOT_ALLOWED_FOR_APP
    };
  }

  return { valid: true, normalized };
}

/**
 * Invalidate the cache (useful after DB changes)
 */
export function invalidateCache() {
  configCache = new Map();
  cacheTimestamp = 0;
}

/**
 * Pre-load cache at startup
 */
export async function initializePersonaConfig() {
  return refreshCache();
}

export default {
  getPersonaConfig,
  isForbiddenForApp,
  validatePersonaForApp,
  getForbiddenPersonasSync,
  normalizePersona,
  invalidateCache,
  initializePersonaConfig,
  PERSONA_ERRORS
};
