/**
 * SDRepository - Strategic Directive database access layer
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates all SD query patterns into a single, testable module.
 * Eliminates 10+ duplicate query patterns from unified-handoff-system.js
 */

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
   * SD-VENTURE-STAGE0-UI-001: Support both UUID and legacy_id lookups
   *
   * @param {string} sdId - Strategic Directive ID (UUID or legacy_id)
   * @param {string} columns - Columns to select (default: '*')
   * @returns {Promise<object>} SD record
   * @throws {Error} If SD not found
   */
  async getById(sdId, columns = '*') {
    const cacheKey = `sd:${sdId}:${columns}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    // SD-VENTURE-STAGE0-UI-001: Check if sdId is UUID or legacy_id
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'legacy_id';

    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select(columns)
      .eq(queryField, sdId)
      .single();

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
   * SD-VENTURE-STAGE0-UI-001: Support both UUID and legacy_id lookups
   *
   * @param {string} sdId - Strategic Directive ID (UUID or legacy_id)
   * @returns {Promise<object>} SD record with basic info
   * @throws {Error} With detailed remediation if SD not found
   */
  async verifyExists(sdId) {
    console.log(`🔍 Verifying SD exists in database: ${sdId}`);

    // SD-VENTURE-STAGE0-UI-001: Try UUID first, then legacy_id
    let sd = null;
    let error = null;

    // Check if sdId looks like a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

    if (isUUID) {
      // Query by UUID id field
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, title, status, category')
        .eq('id', sdId)
        .single();
      sd = result.data;
      error = result.error;
    } else {
      // Query by legacy_id (e.g., SD-VENTURE-STAGE0-UI-001)
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, title, status, category')
        .eq('legacy_id', sdId)
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
   * @param {string} sdId - Strategic Directive ID
   * @param {string} status - New status
   * @param {string} phase - New phase (optional)
   * @param {object} metadata - Additional fields to update
   */
  async updateStatus(sdId, status, phase = null, metadata = {}) {
    const updateData = { status, ...metadata };
    if (phase) {
      updateData.current_phase = phase;
    }

    const { error } = await this.supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', sdId);

    if (error) {
      throw new Error(`Failed to update SD status: ${error.message}`);
    }

    // Invalidate cache
    this._invalidateCacheForSd(sdId);
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
