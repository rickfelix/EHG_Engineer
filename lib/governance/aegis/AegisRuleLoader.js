/**
 * AegisRuleLoader - Loads and caches governance rules from database
 *
 * Features:
 * - Loads rules from aegis_rules table
 * - Falls back to local JSON file if database unavailable
 * - Caches rules with TTL for performance
 * - Supports filtering by constitution, category, severity
 * - Handles rule inheritance from parent constitutions
 *
 * @module AegisRuleLoader
 * @version 1.1.0
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_RULES_PATH = join(__dirname, 'aegis-rules-local.json');

export class AegisRuleLoader {
  constructor(options = {}) {
    this.supabase = options.supabase || this._createSupabaseClient();
    this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
    this.localRulesPath = options.localRulesPath || LOCAL_RULES_PATH;
    this._cache = {
      rules: null,
      constitutions: null,
      timestamp: null
    };
    this._localFallbackData = null;
  }

  /**
   * Load local fallback data from JSON file
   * @private
   */
  _loadLocalFallback() {
    if (this._localFallbackData) return this._localFallbackData;

    try {
      if (existsSync(this.localRulesPath)) {
        const data = readFileSync(this.localRulesPath, 'utf-8');
        this._localFallbackData = JSON.parse(data);
        console.log('[AegisRuleLoader] Loaded local fallback rules:', {
          constitutions: this._localFallbackData.constitutions?.length || 0,
          rules: this._localFallbackData.rules?.length || 0
        });
        return this._localFallbackData;
      }
    } catch (err) {
      console.warn('[AegisRuleLoader] Failed to load local fallback:', err.message);
    }

    return { constitutions: [], rules: [] };
  }

  /**
   * Create Supabase client
   * @private
   */
  _createSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[AegisRuleLoader] Supabase credentials not configured');
      return null;
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Check if cache is valid
   * @private
   */
  _isCacheValid() {
    if (!this._cache.timestamp) return false;
    return (Date.now() - this._cache.timestamp) < this.cacheTtlMs;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this._cache = {
      rules: null,
      constitutions: null,
      timestamp: null
    };
  }

  /**
   * Load all constitutions from database, with local file fallback
   * @returns {Promise<Array>} Array of constitution objects
   */
  async loadConstitutions() {
    if (this._isCacheValid() && this._cache.constitutions) {
      return this._cache.constitutions;
    }

    // Try database first
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('aegis_constitutions')
          .select('*')
          .eq('is_active', true)
          .order('code');

        if (!error && data && data.length > 0) {
          this._cache.constitutions = data;
          this._cache.timestamp = Date.now();
          return this._cache.constitutions;
        }

        if (error) {
          console.warn('[AegisRuleLoader] Database error, trying local fallback:', error.message);
        }
      } catch (err) {
        console.warn('[AegisRuleLoader] Database exception, trying local fallback:', err.message);
      }
    }

    // Fall back to local file
    const localData = this._loadLocalFallback();
    if (localData.constitutions && localData.constitutions.length > 0) {
      console.log('[AegisRuleLoader] Using local fallback for constitutions');
      this._cache.constitutions = localData.constitutions;
      this._cache.timestamp = Date.now();
      return this._cache.constitutions;
    }

    console.warn('[AegisRuleLoader] No constitutions available from database or local fallback');
    return [];
  }

  /**
   * Load all active rules from database, with local file fallback
   * @param {Object} options - Filter options
   * @param {string} [options.constitutionCode] - Filter by constitution code
   * @param {string} [options.category] - Filter by category
   * @param {string} [options.severity] - Filter by severity
   * @param {string} [options.validationType] - Filter by validation type
   * @returns {Promise<Array>} Array of rule objects
   */
  async loadRules(options = {}) {
    const { constitutionCode, category, severity, validationType } = options;

    // Check cache for unfiltered requests
    if (!constitutionCode && !category && !severity && !validationType) {
      if (this._isCacheValid() && this._cache.rules) {
        return this._cache.rules;
      }
    }

    // Try database first
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('aegis_rules')
          .select(`
            *,
            constitution:aegis_constitutions(id, code, name, domain, enforcement_mode)
          `)
          .eq('is_active', true);

        // Apply filters
        if (constitutionCode) {
          const constitutions = await this.loadConstitutions();
          const constitution = constitutions.find(c => c.code === constitutionCode);
          if (constitution) {
            query = query.eq('constitution_id', constitution.id);
          } else {
            // Constitution not found in database, try local fallback
            return this._loadRulesFromLocal(options);
          }
        }

        if (category) {
          query = query.eq('category', category);
        }

        if (severity) {
          query = query.eq('severity', severity);
        }

        if (validationType) {
          query = query.eq('validation_type', validationType);
        }

        query = query.order('severity').order('rule_code');

        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          // Cache only unfiltered results
          if (!constitutionCode && !category && !severity && !validationType) {
            this._cache.rules = data;
            this._cache.timestamp = Date.now();
          }
          return data;
        }

        if (error) {
          console.warn('[AegisRuleLoader] Database error loading rules, trying local fallback:', error.message);
        }
      } catch (err) {
        console.warn('[AegisRuleLoader] Database exception loading rules, trying local fallback:', err.message);
      }
    }

    // Fall back to local file
    return this._loadRulesFromLocal(options);
  }

  /**
   * Load rules from local fallback file
   * @private
   */
  _loadRulesFromLocal(options = {}) {
    const { constitutionCode, category, severity, validationType } = options;

    const localData = this._loadLocalFallback();
    let rules = localData.rules || [];

    // Apply filters
    if (constitutionCode) {
      const constitution = (localData.constitutions || []).find(c => c.code === constitutionCode);
      if (constitution) {
        rules = rules.filter(r => r.constitution_id === constitution.id || r.constitution_code === constitutionCode);
      } else {
        return [];
      }
    }

    if (category) {
      rules = rules.filter(r => r.category === category);
    }

    if (severity) {
      rules = rules.filter(r => r.severity === severity);
    }

    if (validationType) {
      rules = rules.filter(r => r.validation_type === validationType);
    }

    if (rules.length > 0) {
      console.log(`[AegisRuleLoader] Using ${rules.length} rules from local fallback`);
    }

    return rules;
  }

  /**
   * Load rules for a specific constitution
   * @param {string} constitutionCode - Constitution code (e.g., 'PROTOCOL', 'FOUR_OATHS')
   * @returns {Promise<Array>} Array of rule objects
   */
  async loadRulesForConstitution(constitutionCode) {
    return this.loadRules({ constitutionCode });
  }

  /**
   * Load a specific rule by code
   * @param {string} constitutionCode - Constitution code
   * @param {string} ruleCode - Rule code
   * @returns {Promise<Object|null>} Rule object or null
   */
  async loadRule(constitutionCode, ruleCode) {
    const rules = await this.loadRulesForConstitution(constitutionCode);
    return rules.find(r => r.rule_code === ruleCode) || null;
  }

  /**
   * Load rules with their dependencies resolved
   * @param {string} constitutionCode - Constitution code
   * @returns {Promise<Array>} Rules in dependency order
   */
  async loadRulesWithDependencies(constitutionCode) {
    const rules = await this.loadRulesForConstitution(constitutionCode);

    // Build dependency graph and sort topologically
    const ruleMap = new Map(rules.map(r => [r.id, r]));
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (rule) => {
      if (visited.has(rule.id)) return;
      if (visiting.has(rule.id)) {
        console.warn(`[AegisRuleLoader] Circular dependency detected for rule ${rule.rule_code}`);
        return;
      }

      visiting.add(rule.id);

      // Visit dependencies first
      const deps = rule.depends_on_rules || [];
      for (const depId of deps) {
        const depRule = ruleMap.get(depId);
        if (depRule) {
          visit(depRule);
        }
      }

      visiting.delete(rule.id);
      visited.add(rule.id);
      sorted.push(rule);
    };

    for (const rule of rules) {
      visit(rule);
    }

    return sorted;
  }

  /**
   * Get constitution by code
   * @param {string} code - Constitution code
   * @returns {Promise<Object|null>} Constitution object or null
   */
  async getConstitution(code) {
    const constitutions = await this.loadConstitutions();
    return constitutions.find(c => c.code === code) || null;
  }

  /**
   * Check if a constitution is in enforced mode
   * @param {string} code - Constitution code
   * @returns {Promise<boolean>}
   */
  async isConstitutionEnforced(code) {
    const constitution = await this.getConstitution(code);
    return constitution?.enforcement_mode === 'enforced';
  }
}

export default AegisRuleLoader;
