/**
 * Baseline Manager — CRUD operations for roadmap baseline snapshots
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-D
 *
 * Manages versioned snapshots of roadmap wave sequences for audit trail.
 * Used by roadmap-baseline.js CLI and future Chairman approval workflows.
 */

/**
 * Create a baseline snapshot for a roadmap.
 * Captures all waves and their items as a JSONB snapshot.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId - UUID of the roadmap
 * @param {object} options
 * @param {string} [options.rationale] - Change rationale
 * @param {string} [options.createdBy] - Creator identifier
 * @returns {Promise<{version: number, snapshotId: string}>}
 */
export async function createBaseline(supabase, roadmapId, options = {}) {
  // Fetch current roadmap
  const { data: roadmap, error: rmErr } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, current_baseline_version')
    .eq('id', roadmapId)
    .single();

  if (rmErr || !roadmap) {
    throw new Error(`Roadmap not found: ${roadmapId}`);
  }

  // Fetch all waves with items
  const { data: waves, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, sequence_rank, title, description, status, confidence_score, progress_pct')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (wErr) throw new Error(`Failed to fetch waves: ${wErr.message}`);

  if (!waves || waves.length === 0) {
    throw new Error('No waves found for this roadmap. Cannot create empty baseline.');
  }

  // Fetch items for each wave
  const waveSequence = [];
  for (const wave of waves) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('id, source_type, source_id, title, promoted_to_sd_key, priority_rank')
      .eq('wave_id', wave.id)
      .order('priority_rank', { ascending: true });

    waveSequence.push({
      wave_id: wave.id,
      sequence_rank: wave.sequence_rank,
      title: wave.title,
      description: wave.description,
      status: wave.status,
      confidence_score: wave.confidence_score,
      progress_pct: wave.progress_pct,
      items: items || [],
    });
  }

  const nextVersion = (roadmap.current_baseline_version || 0) + 1;

  // Insert snapshot
  const { data: snapshot, error: snapErr } = await supabase
    .from('roadmap_baseline_snapshots')
    .insert({
      roadmap_id: roadmapId,
      version: nextVersion,
      wave_sequence: waveSequence,
      change_rationale: options.rationale || null,
      created_by: options.createdBy || 'leo-baseline-manager',
    })
    .select('id')
    .single();

  if (snapErr) throw new Error(`Failed to create snapshot: ${snapErr.message}`);

  // Update current_baseline_version on roadmap
  const { error: updateErr } = await supabase
    .from('strategic_roadmaps')
    .update({ current_baseline_version: nextVersion })
    .eq('id', roadmapId);

  if (updateErr) {
    console.warn(`Warning: Snapshot created but failed to update roadmap version: ${updateErr.message}`);
  }

  return { version: nextVersion, snapshotId: snapshot.id };
}

/**
 * List all baseline snapshots for a roadmap.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId - UUID of the roadmap
 * @returns {Promise<Array<{id: string, version: number, change_rationale: string, created_at: string, created_by: string, approved_at: string, approved_by: string}>>}
 */
export async function listBaselines(supabase, roadmapId) {
  const { data, error } = await supabase
    .from('roadmap_baseline_snapshots')
    .select('id, version, change_rationale, created_at, created_by, approved_at, approved_by')
    .eq('roadmap_id', roadmapId)
    .order('version', { ascending: true });

  if (error) throw new Error(`Failed to fetch baselines: ${error.message}`);
  return data || [];
}

/**
 * Get a specific baseline snapshot with full wave sequence.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId - UUID of the roadmap
 * @param {number} version - Baseline version number
 * @returns {Promise<object|null>}
 */
export async function getBaseline(supabase, roadmapId, version) {
  const { data, error } = await supabase
    .from('roadmap_baseline_snapshots')
    .select('*')
    .eq('roadmap_id', roadmapId)
    .eq('version', version)
    .single();

  if (error) return null;
  return data;
}
