/**
 * PRDRepository - Product Requirements Document database access layer
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates all PRD query patterns into a single, testable module.
 */

export class PRDRepository {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('PRDRepository requires a Supabase client');
    }
    this.supabase = supabase;
  }

  /**
   * Get PRD by SD UUID
   * @param {string} sdUuid - Strategic Directive UUID
   * @returns {Promise<object|null>} PRD record or null
   */
  async getBySdUuid(sdUuid) {
    const { data: prds, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_uuid', sdUuid);

    if (error) {
      console.warn(`PRD query error: ${error.message}`);
      return null;
    }

    return prds?.[0] || null;
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
   * @param {string} sdUuid - Strategic Directive UUID
   * @returns {Promise<object|null>} exec_checklist object
   */
  async getExecChecklist(sdUuid) {
    const { data: prd, error } = await this.supabase
      .from('product_requirements_v2')
      .select('exec_checklist')
      .eq('sd_uuid', sdUuid)
      .single();

    if (error || !prd) {
      return null;
    }

    return prd.exec_checklist;
  }

  /**
   * Check if PRD exists for SD
   * @param {string} sdUuid - Strategic Directive UUID
   * @returns {Promise<boolean>}
   */
  async existsForSd(sdUuid) {
    const { count, error } = await this.supabase
      .from('product_requirements_v2')
      .select('id', { count: 'exact', head: true })
      .eq('sd_uuid', sdUuid);

    return !error && count > 0;
  }
}

export default PRDRepository;
