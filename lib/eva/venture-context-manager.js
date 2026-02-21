/**
 * VentureContextManager - Track and manage active venture context
 *
 * SD-LEO-INFRA-VENTURE-CONTEXT-001
 * Part of CLI Venture Lifecycle Infrastructure (Foundation Phase)
 *
 * Responsibilities:
 * - Track active_venture_id in claude_sessions.metadata
 * - Provide venture-scoped operations (set, get, clear, switch)
 * - Support SD filtering by active venture
 * - Validate venture existence before setting context
 *
 * Database tables used:
 * - claude_sessions (metadata.active_venture_id)
 * - ventures (id, name, status, current_lifecycle_stage)
 * - strategic_directives_v2 (venture-scoped SD queries)
 */

import { createClient } from '@supabase/supabase-js';
import { resolveOwnSession } from '../resolve-own-session.js';

export class VentureContextManager {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.sessionId = options.sessionId || null;
    this._cachedVentureId = null;
    this._cachedVenture = null;
  }

  /**
   * Get the active venture ID from session metadata
   * @returns {Promise<string|null>} The active venture UUID or null
   */
  async getActiveVentureId() {
    if (this._cachedVentureId) return this._cachedVentureId;

    const session = await this._getActiveSession();
    if (!session?.metadata?.active_venture_id) return null;

    this._cachedVentureId = session.metadata.active_venture_id;
    return this._cachedVentureId;
  }

  /**
   * Get full venture details for the active venture
   * @returns {Promise<object|null>} Venture record or null
   */
  async getActiveVenture() {
    const ventureId = await this.getActiveVentureId();
    if (!ventureId) return null;

    if (this._cachedVenture?.id === ventureId) return this._cachedVenture;

    const { data, error } = await this.supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage, archetype, created_at')
      .eq('id', ventureId)
      .single();

    if (error || !data) return null;

    this._cachedVenture = data;
    return data;
  }

  /**
   * Set the active venture for the current session
   * @param {string} ventureId - UUID of the venture to activate
   * @returns {Promise<{success: boolean, venture?: object, error?: string}>}
   */
  async setActiveVenture(ventureId) {
    // Validate venture exists
    const { data: venture, error: ventureError } = await this.supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage')
      .eq('id', ventureId)
      .single();

    if (ventureError || !venture) {
      return { success: false, error: `Venture not found: ${ventureId}` };
    }

    // Update session metadata
    const session = await this._getActiveSession();
    if (!session) {
      return { success: false, error: 'No active session found' };
    }

    const updatedMetadata = {
      ...session.metadata,
      active_venture_id: ventureId,
      active_venture_name: venture.name,
      venture_set_at: new Date().toISOString()
    };

    const { error: updateError } = await this.supabase
      .from('claude_sessions')
      .update({ metadata: updatedMetadata })
      .eq('session_id', session.session_id);

    if (updateError) {
      return { success: false, error: `Failed to update session: ${updateError.message}` };
    }

    // Clear cache
    this._cachedVentureId = ventureId;
    this._cachedVenture = venture;

    return { success: true, venture };
  }

  /**
   * Clear the active venture context
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async clearActiveVenture() {
    const session = await this._getActiveSession();
    if (!session) {
      return { success: false, error: 'No active session found' };
    }

    const updatedMetadata = { ...session.metadata };
    delete updatedMetadata.active_venture_id;
    delete updatedMetadata.active_venture_name;
    delete updatedMetadata.venture_set_at;

    const { error } = await this.supabase
      .from('claude_sessions')
      .update({ metadata: updatedMetadata })
      .eq('session_id', session.session_id);

    if (error) {
      return { success: false, error: `Failed to clear venture: ${error.message}` };
    }

    this._cachedVentureId = null;
    this._cachedVenture = null;

    return { success: true };
  }

  /**
   * Switch to a different venture (combines clear + set)
   * @param {string} ventureId - UUID of venture to switch to
   * @returns {Promise<{success: boolean, venture?: object, previousVentureId?: string, error?: string}>}
   */
  async switchVenture(ventureId) {
    const previousVentureId = await this.getActiveVentureId();
    const result = await this.setActiveVenture(ventureId);

    if (result.success) {
      return { ...result, previousVentureId };
    }
    return result;
  }

  /**
   * List all ventures available for selection
   * @param {object} options - Filter options
   * @param {string} [options.status] - Filter by status (e.g., 'active', 'ideation')
   * @returns {Promise<object[]>} Array of venture summaries
   */
  async listVentures(options = {}) {
    let query = this.supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage, archetype, created_at')
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  }

  /**
   * Get SDs scoped to the active venture (by metadata or naming convention)
   * @returns {Promise<object[]>} Array of venture-scoped SDs
   */
  async getVentureScopedSDs() {
    const ventureId = await this.getActiveVentureId();
    if (!ventureId) return [];

    const venture = await this.getActiveVenture();
    if (!venture) return [];

    // Query SDs that reference this venture in metadata
    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, sd_type, priority, current_phase, progress')
      .or(`metadata->>venture_id.eq.${ventureId},metadata->>venture_name.eq.${venture.name}`)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  }

  /**
   * Check if a venture context is currently active
   * @returns {Promise<boolean>}
   */
  async hasActiveVenture() {
    const ventureId = await this.getActiveVentureId();
    return ventureId !== null;
  }

  /**
   * Get a formatted status string for display
   * @returns {Promise<string>}
   */
  async getStatusDisplay() {
    const venture = await this.getActiveVenture();
    if (!venture) {
      return 'No active venture (global context)';
    }
    return `Active venture: ${venture.name} (Stage ${venture.current_lifecycle_stage || 1}, ${venture.status})`;
  }

  /**
   * Invalidate cached data (call after external changes)
   */
  invalidateCache() {
    this._cachedVentureId = null;
    this._cachedVenture = null;
  }

  // --- Private helpers ---

  /**
   * Get the most recent active session
   * @private
   */
  async _getActiveSession() {
    const { data } = await resolveOwnSession(this.supabase, {
      select: 'session_id, metadata, status',
      warnOnFallback: false
    });
    return data;
  }
}

/**
 * Create a VentureContextManager with default configuration
 * @param {object} [options] - Optional overrides
 * @returns {VentureContextManager}
 */
export function createVentureContextManager(options = {}) {
  return new VentureContextManager(options);
}

export default VentureContextManager;
