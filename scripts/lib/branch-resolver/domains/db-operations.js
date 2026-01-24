/**
 * Database Operations Domain
 * Handles branch storage and update operations in database
 *
 * @module branch-resolver/domains/db-operations
 */

/**
 * Store validated branch in database
 * @param {Object} supabase - Supabase client
 * @param {string} sdUuid - SD UUID in database
 * @param {string} branch - Branch name to store
 * @param {Object} metadata - Additional metadata to store
 * @returns {Promise<Object>} Store result
 */
export async function storeBranchInDatabase(supabase, sdUuid, branch, metadata = {}) {
  try {
    // Get current metadata
    const { data: current, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdUuid)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    // Merge new branch info into metadata
    const updatedMetadata = {
      ...(current?.metadata || {}),
      feature_branch: branch,
      branch_metadata: {
        ...metadata,
        storedAt: new Date().toISOString()
      }
    };

    // Update the record
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdUuid);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update database to reflect that branch was merged
 * @param {Object} supabase - Supabase client
 * @param {string} sdUuid - SD UUID in database
 * @param {string} mergedBranch - Branch that was merged
 * @param {Object} fallbackResult - Fallback result with evidence
 * @returns {Promise<Object>} Update result
 */
export async function updateBranchAsMerged(supabase, sdUuid, mergedBranch, fallbackResult) {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdUuid)
      .single();

    if (fetchError) return { success: false, error: fetchError.message };

    const updatedMetadata = {
      ...(current?.metadata || {}),
      feature_branch: null, // Clear the stale branch
      merged_branch: {
        original: mergedBranch,
        mergedTo: 'main',
        mergedAt: new Date().toISOString(),
        evidence: fallbackResult.evidence
      }
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdUuid);

    return updateError
      ? { success: false, error: updateError.message }
      : { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  storeBranchInDatabase,
  updateBranchAsMerged
};
