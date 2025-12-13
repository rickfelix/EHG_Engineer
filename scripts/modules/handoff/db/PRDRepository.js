/**
 * PRDRepository - Product Requirements Document database access layer
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates all PRD query patterns into a single, testable module.
 *
 * SD ID SCHEMA CLEANUP (2025-12-12):
 * - sd_uuid column has been dropped
 * - sd_id column now contains strategic_directives_v2.id values
 * - All lookups now use sd_id as the canonical column
 */

export class PRDRepository {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('PRDRepository requires a Supabase client');
    }
    this.supabase = supabase;
  }

  /**
   * Get PRD by SD ID
   *
   * @param {string} sdId - Strategic Directive ID (SD.id value, e.g., "SD-050" or UUID)
   * @returns {Promise<object|null>} PRD record or null
   */
  async getBySdId(sdId) {
    // Primary lookup by sd_id (canonical column after schema cleanup)
    const { data: prds, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId);

    if (error) {
      console.warn(`PRD query error (sd_id): ${error.message}`);
    }

    if (prds && prds.length > 0) {
      return prds[0];
    }

    // Fallback: Try directive_id column (for very old PRDs created before standardization)
    const { data: fallback, error: fallbackErr } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);

    if (fallbackErr) {
      console.warn(`PRD query error (directive_id): ${fallbackErr.message}`);
    }

    if (fallback && fallback.length > 0) {
      console.log('   ℹ️  PRD found via directive_id column (legacy fallback)');
      return fallback[0];
    }

    return null;
  }

  /**
   * Get PRD by SD UUID (deprecated - use getBySdId instead)
   *
   * @deprecated Use getBySdId() instead. This method is kept for backward
   * compatibility during the transition period.
   *
   * @param {string} sdUuid - Strategic Directive UUID (now equivalent to SD.id)
   * @returns {Promise<object|null>} PRD record or null
   */
  async getBySdUuid(sdUuid) {
    console.warn('DEPRECATED: getBySdUuid() - use getBySdId() instead');
    return this.getBySdId(sdUuid);
  }

  /**
   * Get PRD by ID
   * @param {string} prdId - PRD ID
   * @returns {Promise<object|null>} PRD record or null
   */
  async getById(prdId) {
    const { data: prd, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (error) {
      return null;
    }

    return prd;
  }

  /**
   * Update PRD status and phase
   * @param {string} prdId - PRD ID
   * @param {string} status - New status
   * @param {string} phase - New phase
   * @param {object} metadata - Additional update fields
   */
  async updateStatus(prdId, status, phase = null, metadata = {}) {
    const updateData = { status, ...metadata };
    if (phase) {
      updateData.current_phase = phase;
    }

    const { error } = await this.supabase
      .from('product_requirements_v2')
      .update(updateData)
      .eq('id', prdId);

    if (error) {
      throw new Error(`Failed to update PRD status: ${error.message}`);
    }
  }

  /**
   * Get exec_checklist from PRD
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<object|null>} exec_checklist object
   */
  async getExecChecklist(sdId) {
    const { data: prd, error } = await this.supabase
      .from('product_requirements_v2')
      .select('exec_checklist')
      .eq('sd_id', sdId)
      .single();

    if (error || !prd) {
      return null;
    }

    return prd.exec_checklist;
  }

  /**
   * Check if PRD exists for SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<boolean>}
   */
  async existsForSd(sdId) {
    // Check sd_id (canonical)
    const { count: count1 } = await this.supabase
      .from('product_requirements_v2')
      .select('id', { count: 'exact', head: true })
      .eq('sd_id', sdId);

    if (count1 > 0) return true;

    // Fallback: check directive_id (legacy)
    const { count: count2 } = await this.supabase
      .from('product_requirements_v2')
      .select('id', { count: 'exact', head: true })
      .eq('directive_id', sdId);

    return count2 > 0;
  }
}

export default PRDRepository;
