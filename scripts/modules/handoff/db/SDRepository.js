/**
 * SDRepository - Strategic Directive database access layer
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates all SD query patterns into a single, testable module.
 * Eliminates 10+ duplicate query patterns from unified-handoff-system.js
 *
 * SD-LEO-ID-NORMALIZE-001: Uses SD ID normalizer to prevent silent update failures
 * caused by ID format mismatches (UUID vs sd_key vs legacy_id).
 */

import { normalizeSDId, normalizeSDIdWithDetails } from '../../sd-id-normalizer.js';

export class SDRepository {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('SDRepository requires a Supabase client');
    }
    this.supabase = supabase;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get Strategic Directive by ID
   * SD-VENTURE-STAGE0-UI-001: Support UUID, legacy_id, and sd_key lookups
   *
   * @param {string} sdId - Strategic Directive ID (UUID, legacy_id, or sd_key)
   * @param {string} columns - Columns to select (default: '*')
   * @returns {Promise<object>} SD record
   * @throws {Error} If SD not found
   */
  async getById(sdId, columns = '*') {
    const cacheKey = `sd:${sdId}:${columns}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    // SD-VENTURE-STAGE0-UI-001: Check if sdId is UUID or legacy_id/sd_key
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

    let sd, error;
    if (isUUID) {
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select(columns)
        .eq('id', sdId)
        .single();
      sd = result.data;
      error = result.error;
    } else {
      // Try id, legacy_id, or sd_key (SD-LEO-ID-NORMALIZE-001: support all ID formats)
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select(columns)
        .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
        .single();
      sd = result.data;
      error = result.error;
    }

    if (error || !sd) {
      throw new Error(`Strategic Directive not found: ${sdId}`);
    }

    this._setCache(cacheKey, sd);
    return sd;
  }

  /**
   * Verify SD exists in database (blocking gate)
   * Used to prevent work on non-existent SDs (SD-TEST-MOCK-001 prevention)
   *
   * SD-VENTURE-STAGE0-UI-001: Support UUID, legacy_id, and sd_key lookups
   *
   * @param {string} sdId - Strategic Directive ID (UUID, legacy_id, or sd_key)
   * @returns {Promise<object>} SD record with basic info
   * @throws {Error} With detailed remediation if SD not found
   */
  async verifyExists(sdId) {
    console.log(`🔍 Verifying SD exists in database: ${sdId}`);

    // SD-VENTURE-STAGE0-UI-001: Try UUID first, then legacy_id/sd_key
    let sd = null;
    let error = null;

    // Check if sdId looks like a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

    if (isUUID) {
      // Query by UUID id field
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, sd_key, title, status, category, sd_type, intensity_level')
        .eq('id', sdId)
        .single();
      sd = result.data;
      error = result.error;
    } else {
      // Query by id, legacy_id, or sd_key (SD-LEO-ID-NORMALIZE-001: support all ID formats)
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, sd_key, title, status, category, sd_type, intensity_level')
        .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
        .single();
      sd = result.data;
      error = result.error;
    }

    if (error || !sd) {
      const errorMsg = [
        '',
        '❌ BLOCKING: Strategic Directive not found in database',
        '='.repeat(60),
        `   SD ID: ${sdId}`,
        '',
        '   CRITICAL: All Strategic Directives MUST exist in the database',
        '   before ANY work begins (LEAD, PLAN, EXEC, or handoffs).',
        '',
        '   REMEDIATION:',
        '   1. Create SD in database using LEO Protocol dashboard',
        '   2. OR use: node scripts/create-strategic-directive.js',
        '   3. Ensure SD has title, category, priority, and rationale',
        '   4. Retry this handoff after SD is created',
        '',
        `   Database error: ${error ? error.message : 'SD not found'}`,
        '='.repeat(60)
      ].join('\n');

      console.error(errorMsg);

      throw new Error(
        `❌ BLOCKING: Strategic Directive ${sdId} not found in database. ` +
        'All SDs must exist in strategic_directives_v2 table before work begins. ' +
        'Create SD first using the LEO Protocol dashboard or create-strategic-directive.js script.'
      );
    }

    console.log(`✅ SD verified in database: ${sd.title}`);
    console.log(`   Status: ${sd.status} | Category: ${sd.category || 'N/A'}`);

    return sd;
  }

  /**
   * Update SD status and phase
   *
   * SD-LEO-ID-NORMALIZE-001: This method now normalizes the SD ID before update
   * to prevent silent failures when the input format doesn't match the DB id column.
   *
   * @param {string} sdId - Strategic Directive ID (any format: uuid, legacy_id, sd_key)
   * @param {string} status - New status
   * @param {string} phase - New phase (optional)
   * @param {object} metadata - Additional fields to update
   * @throws {Error} If SD not found or update fails
   */
  async updateStatus(sdId, status, phase = null, metadata = {}) {
    // SD-LEO-ID-NORMALIZE-001: Normalize ID to prevent silent update failures
    const normalization = await normalizeSDIdWithDetails(this.supabase, sdId);

    if (!normalization.success) {
      throw new Error(
        `Cannot update SD status: ${normalization.error}. ` +
        `Input ID was: "${sdId}" (format: ${normalization.inputFormat})`
      );
    }

    const canonicalId = normalization.canonicalId;

    // Log if normalization changed the ID (helps debug silent failures)
    if (normalization.wasNormalized) {
      console.log(`[SDRepository.updateStatus] ID normalized: "${sdId}" -> "${canonicalId}"`);
    }

    const updateData = {
      status,
      ...metadata,
      updated_at: new Date().toISOString()
    };

    if (phase) {
      updateData.current_phase = phase;
    }

    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', canonicalId)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to update SD status: ${error.message}`);
    }

    // SD-LEO-ID-NORMALIZE-001: Verify update actually happened
    if (!data) {
      throw new Error(
        'SD status update returned no data - possible silent failure. ' +
        `Canonical ID: "${canonicalId}", Original input: "${sdId}"`
      );
    }

    console.log(`[SDRepository.updateStatus] Updated SD ${canonicalId}: status=${status}${phase ? `, phase=${phase}` : ''}`);

    // Invalidate cache for both original and canonical IDs
    this._invalidateCacheForSd(sdId);
    if (sdId !== canonicalId) {
      this._invalidateCacheForSd(canonicalId);
    }
  }

  /**
   * Get SD UUID for foreign key relationships
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<string>} SD UUID
   */
  async getUuid(sdId) {
    const sd = await this.getById(sdId, 'uuid');
    return sd.uuid;
  }

  // Cache helpers
  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiry) {
      return entry.value;
    }
    this.cache.delete(key);
    return null;
  }

  _setCache(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.cacheTTL
    });
  }

  _invalidateCacheForSd(sdId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`sd:${sdId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export default SDRepository;
