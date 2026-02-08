/**
 * Brand Genome Service (CLI Port)
 *
 * SD-LEO-FEAT-SERVICE-PORTS-001
 * CLI-compatible port of ehg/src/services/brandGenomeService.ts
 *
 * Differences from frontend:
 * - Supabase client passed to every function (no frontend import)
 * - createBrandGenome accepts explicit createdBy param (no auth.getUser())
 * - Pure CRUD operations, no UI-specific logic
 *
 * @module lib/eva/services/brand-genome
 */

/**
 * Get all brand genomes for a venture.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId
 * @returns {Promise<Object[]>}
 */
export async function getBrandGenomesByVenture(supabase, ventureId) {
  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .select('*')
    .eq('venture_id', ventureId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch brand genomes: ${error.message}`);
  return data || [];
}

/**
 * Get all brand genomes, optionally filtered by venture.
 *
 * @param {Object} supabase
 * @param {string} [ventureId]
 * @returns {Promise<Object[]>}
 */
export async function getBrandGenomeList(supabase, ventureId) {
  let query = supabase
    .from('brand_genome_submissions')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch brand genome list: ${error.message}`);
  return data || [];
}

/**
 * Get a single brand genome by ID.
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getBrandGenome(supabase, id) {
  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch brand genome: ${error.message}`);
  }
  return data;
}

/**
 * Get active (published) brand genomes.
 *
 * @param {Object} supabase
 * @param {string} [ventureId]
 * @returns {Promise<Object[]>}
 */
export async function getActiveBrandGenomes(supabase, ventureId) {
  let query = supabase
    .from('v_active_brand_genomes')
    .select('*')
    .order('created_at', { ascending: false });

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch active brand genomes: ${error.message}`);
  return data || [];
}

/**
 * Get latest published brand genome for a venture.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<Object|null>}
 */
export async function getLatestBrandGenome(supabase, ventureId) {
  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('submission_status', 'published')
    .is('archived_at', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch latest brand genome: ${error.message}`);
  return data;
}

/**
 * Create a new brand genome submission (draft).
 *
 * @param {Object} supabase
 * @param {Object} dto - { venture_id, brand_data?, created_by }
 * @returns {Promise<Object>}
 */
export async function createBrandGenome(supabase, dto) {
  if (!dto.created_by) {
    throw new Error('created_by is required (no auth.getUser() in CLI context)');
  }

  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .insert({
      venture_id: dto.venture_id,
      created_by: dto.created_by,
      submission_status: 'draft',
      brand_data: dto.brand_data || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create brand genome: ${error.message}`);
  return data;
}

/**
 * Update a brand genome submission.
 *
 * @param {Object} supabase
 * @param {string} id
 * @param {Object} dto - { brand_data?, submission_status? }
 * @returns {Promise<Object>}
 */
export async function updateBrandGenome(supabase, id, dto) {
  const updateData = {};
  if (dto.brand_data !== undefined) updateData.brand_data = dto.brand_data;
  if (dto.submission_status !== undefined) updateData.submission_status = dto.submission_status;

  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update brand genome: ${error.message}`);
  return data;
}

/**
 * Partial update of brand_data (merge with existing).
 *
 * @param {Object} supabase
 * @param {string} id
 * @param {Object} brandData - Partial brand data to merge
 * @returns {Promise<Object>}
 */
export async function updateBrandData(supabase, id, brandData) {
  const current = await getBrandGenome(supabase, id);
  if (!current) throw new Error('Brand genome not found');

  const mergedBrandData = { ...current.brand_data, ...brandData };
  return updateBrandGenome(supabase, id, { brand_data: mergedBrandData });
}

/**
 * Submit a brand genome (draft → published).
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function submitBrandGenome(supabase, id) {
  return updateBrandGenome(supabase, id, { submission_status: 'published' });
}

/**
 * Approve a brand genome (alias for submit).
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function approveBrandGenome(supabase, id) {
  return submitBrandGenome(supabase, id);
}

/**
 * Archive a brand genome (soft delete).
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function archiveBrandGenome(supabase, id) {
  const { error } = await supabase
    .from('brand_genome_submissions')
    .update({
      archived_at: new Date().toISOString(),
      submission_status: 'archived',
    })
    .eq('id', id);

  if (error) throw new Error(`Failed to archive brand genome: ${error.message}`);
  return true;
}

/**
 * Delete a brand genome (hard delete, drafts only).
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteBrandGenome(supabase, id) {
  const { error } = await supabase
    .from('brand_genome_submissions')
    .delete()
    .eq('id', id)
    .eq('submission_status', 'draft');

  if (error) throw new Error(`Failed to delete brand genome: ${error.message}`);
  return true;
}

/**
 * Get brand genomes by status.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {string} status
 * @returns {Promise<Object[]>}
 */
export async function getBrandGenomesByStatus(supabase, ventureId, status) {
  const { data, error } = await supabase
    .from('brand_genome_submissions')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('submission_status', status)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch brand genomes by status: ${error.message}`);
  return data || [];
}

/**
 * Get brand completeness statistics.
 *
 * @param {Object} supabase
 * @returns {Promise<Object|null>}
 */
export async function getBrandCompletenessStats(supabase) {
  const { data, error } = await supabase
    .from('v_brand_completeness_stats')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch brand completeness stats: ${error.message}`);
  return data;
}

/**
 * Get completeness score for a specific brand genome.
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<number|null>}
 */
export async function getCompletenessScore(supabase, id) {
  const genome = await getBrandGenome(supabase, id);
  return genome?.completeness_score ?? null;
}

/**
 * Check if brand genome meets minimum completeness threshold.
 *
 * @param {number|null} completenessScore
 * @param {number} [threshold=70]
 * @returns {boolean}
 */
export function meetsCompletenessThreshold(completenessScore, threshold = 70) {
  if (completenessScore === null || completenessScore === undefined) return false;
  return completenessScore >= threshold;
}

/**
 * Get required fields missing for a brand genome.
 *
 * @param {Object} supabase
 * @param {string} id
 * @returns {Promise<string[]>}
 */
export async function getRequiredFieldsMissing(supabase, id) {
  const genome = await getBrandGenome(supabase, id);
  return genome?.required_fields_missing || [];
}
