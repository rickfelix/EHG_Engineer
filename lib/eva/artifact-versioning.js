/**
 * Artifact Version Numbering
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-025
 *
 * Adds version numbering to venture_artifacts using the metadata JSONB column.
 * Each artifact gets an incrementing version number. History is browsable
 * via getArtifactHistory().
 *
 * Design principles:
 *   - Stateless: version state in database metadata column
 *   - Uses existing venture_artifacts table (no schema changes)
 *   - Safe merge pattern for metadata (spread existing)
 *   - is_current flag marks only the latest version
 *
 * @module lib/eva/artifact-versioning
 */

import { ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/**
 * Create a versioned artifact. Sets version=1 in metadata.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.artifactType - Type of artifact (e.g. 'analysis', 'report')
 * @param {string} params.stageId - Stage identifier
 * @param {object} params.content - Artifact content
 * @param {object} [params.existingMetadata] - Existing metadata to preserve
 * @returns {Promise<{id: string, version: number}>}
 */
export async function createVersionedArtifact(supabase, { ventureId, artifactType, stageId, content, existingMetadata = {} }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'ArtifactVersioning');
  if (!ventureId) throw new ServiceError('INVALID_ARGS', 'ventureId is required', 'ArtifactVersioning');

  const metadata = {
    ...existingMetadata,
    version: 1,
    versioned_at: new Date().toISOString(),
    version_module: MODULE_VERSION,
  };

  const { data, error } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: ventureId,
      artifact_type: artifactType,
      stage_id: stageId,
      content,
      metadata,
      is_current: true,
    })
    .select('id')
    .single();

  if (error) {
    throw new ServiceError('INSERT_FAILED', `Failed to create artifact: ${error.message}`, 'ArtifactVersioning', error);
  }

  return { id: data.id, version: 1 };
}

/**
 * Update an artifact with a new version. Creates a new row with incremented version
 * and marks the previous as not current.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.artifactId - UUID of the current artifact to update
 * @param {object} params.content - New artifact content
 * @param {object} [params.additionalMetadata] - Extra metadata to merge
 * @returns {Promise<{id: string, version: number, previousId: string}>}
 */
export async function updateArtifactVersion(supabase, { artifactId, content, additionalMetadata = {} }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'ArtifactVersioning');
  if (!artifactId) throw new ServiceError('INVALID_ARGS', 'artifactId is required', 'ArtifactVersioning');

  // Fetch the current artifact
  const { data: current, error: fetchError } = await supabase
    .from('venture_artifacts')
    .select('*')
    .eq('id', artifactId)
    .single();

  if (fetchError || !current) {
    throw new ServiceError('NOT_FOUND', `Artifact not found: ${artifactId}`, 'ArtifactVersioning', fetchError);
  }

  const currentVersion = current.metadata?.version || 1;
  const newVersion = currentVersion + 1;

  // Mark the old version as not current
  const { error: updateError } = await supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('id', artifactId);

  if (updateError) {
    throw new ServiceError('UPDATE_FAILED', `Failed to mark old version: ${updateError.message}`, 'ArtifactVersioning', updateError);
  }

  // Create the new version
  const metadata = {
    ...(current.metadata || {}),
    ...additionalMetadata,
    version: newVersion,
    previous_version_id: artifactId,
    versioned_at: new Date().toISOString(),
    version_module: MODULE_VERSION,
  };

  const { data: newArtifact, error: insertError } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: current.venture_id,
      artifact_type: current.artifact_type,
      stage_id: current.stage_id,
      content,
      metadata,
      is_current: true,
    })
    .select('id')
    .single();

  if (insertError) {
    // Attempt to restore the old version's is_current flag
    await supabase.from('venture_artifacts').update({ is_current: true }).eq('id', artifactId);
    throw new ServiceError('INSERT_FAILED', `Failed to create new version: ${insertError.message}`, 'ArtifactVersioning', insertError);
  }

  return { id: newArtifact.id, version: newVersion, previousId: artifactId };
}

/**
 * Get the version history for an artifact chain.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.artifactType] - Filter by artifact type
 * @param {string} [params.stageId] - Filter by stage
 * @returns {Promise<Array<{id: string, version: number, is_current: boolean, created_at: string}>>}
 */
export async function getArtifactHistory(supabase, { ventureId, artifactType = null, stageId = null }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'ArtifactVersioning');
  if (!ventureId) throw new ServiceError('INVALID_ARGS', 'ventureId is required', 'ArtifactVersioning');

  let query = supabase
    .from('venture_artifacts')
    .select('id, venture_id, artifact_type, stage_id, content, metadata, is_current, created_at')
    .eq('venture_id', ventureId)
    .order('metadata->>version', { ascending: false });

  if (artifactType) query = query.eq('artifact_type', artifactType);
  if (stageId) query = query.eq('stage_id', stageId);

  const { data, error } = await query;

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to query artifact history: ${error.message}`, 'ArtifactVersioning', error);
  }

  return (data || []).map(a => ({
    ...a,
    version: a.metadata?.version || 1,
  }));
}

/**
 * Get a specific version of an artifact.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} artifactId - UUID of the artifact
 * @returns {Promise<{id: string, version: number, content: object, metadata: object} | null>}
 */
export async function getArtifactVersion(supabase, artifactId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, venture_id, artifact_type, stage_id, content, metadata, is_current, created_at')
    .eq('id', artifactId)
    .single();

  if (error) return null;

  return {
    ...data,
    version: data.metadata?.version || 1,
  };
}
