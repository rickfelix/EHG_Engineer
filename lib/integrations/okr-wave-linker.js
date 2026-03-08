/**
 * OKR-Wave Linker Module
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-E
 *
 * Manages bidirectional linkage between OKR objectives and roadmap wave items.
 * Stores linkage in wave_items metadata JSONB column.
 * Calculates alignment scores per wave and per roadmap.
 */

/**
 * Link a wave item to an OKR objective.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} waveItemId - UUID of the wave item
 * @param {string} okrId - Identifier for the OKR objective (e.g., "O-GOV-1" or "KR-GOV-1.1")
 * @param {string} [rationale] - Why this item aligns with the OKR
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function linkOkrToWaveItem(supabase, waveItemId, okrId, rationale) {
  const { data: item, error: fetchErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, metadata')
    .eq('id', waveItemId)
    .single();

  if (fetchErr || !item) {
    return { success: false, error: `Wave item not found: ${waveItemId}` };
  }

  const metadata = item.metadata || {};
  const linkages = metadata.okr_linkages || [];

  // Prevent duplicate linkage
  if (linkages.some(l => l.okr_id === okrId)) {
    return { success: false, error: `Already linked to ${okrId}` };
  }

  linkages.push({
    okr_id: okrId,
    rationale: rationale || null,
    linked_at: new Date().toISOString(),
  });

  const { error: updateErr } = await supabase
    .from('roadmap_wave_items')
    .update({ metadata: { ...metadata, okr_linkages: linkages } })
    .eq('id', waveItemId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}

/**
 * Unlink a wave item from an OKR objective.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} waveItemId
 * @param {string} okrId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unlinkOkrFromWaveItem(supabase, waveItemId, okrId) {
  const { data: item, error: fetchErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, metadata')
    .eq('id', waveItemId)
    .single();

  if (fetchErr || !item) {
    return { success: false, error: `Wave item not found: ${waveItemId}` };
  }

  const metadata = item.metadata || {};
  const linkages = metadata.okr_linkages || [];
  const filtered = linkages.filter(l => l.okr_id !== okrId);

  if (filtered.length === linkages.length) {
    return { success: false, error: `Not linked to ${okrId}` };
  }

  const { error: updateErr } = await supabase
    .from('roadmap_wave_items')
    .update({ metadata: { ...metadata, okr_linkages: filtered } })
    .eq('id', waveItemId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}

/**
 * Calculate alignment scores for all waves in a roadmap.
 * Alignment = items with OKR linkage / total items per wave.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @returns {Promise<{waves: Array<{wave_id: string, title: string, total_items: number, linked_items: number, alignment_pct: number, okr_ids: string[]}>, overall_alignment_pct: number}>}
 */
export async function calculateAlignment(supabase, roadmapId) {
  const { data: waves, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, sequence_rank')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (wErr) throw new Error(`Failed to fetch waves: ${wErr.message}`);

  let totalItems = 0;
  let totalLinked = 0;
  const waveResults = [];

  for (const wave of (waves || [])) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('id, title, metadata')
      .eq('wave_id', wave.id);

    const waveItems = items || [];
    const linkedItems = waveItems.filter(i => {
      const linkages = i.metadata?.okr_linkages || [];
      return linkages.length > 0;
    });

    const allOkrIds = new Set();
    linkedItems.forEach(i => {
      (i.metadata?.okr_linkages || []).forEach(l => allOkrIds.add(l.okr_id));
    });

    totalItems += waveItems.length;
    totalLinked += linkedItems.length;

    waveResults.push({
      wave_id: wave.id,
      title: wave.title,
      sequence_rank: wave.sequence_rank,
      total_items: waveItems.length,
      linked_items: linkedItems.length,
      alignment_pct: waveItems.length > 0
        ? Math.round((linkedItems.length / waveItems.length) * 100)
        : 0,
      okr_ids: [...allOkrIds],
    });
  }

  return {
    waves: waveResults,
    overall_alignment_pct: totalItems > 0
      ? Math.round((totalLinked / totalItems) * 100)
      : 0,
  };
}

/**
 * Create a Chairman approval proposal for a roadmap's wave sequence.
 * Inserts into chairman_decisions with roadmap context and OKR alignment data.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @param {object} [options]
 * @param {string} [options.rationale] - Proposal rationale
 * @returns {Promise<{decisionId: string, alignment: object}>}
 */
export async function createProposal(supabase, roadmapId, options = {}) {
  // Fetch roadmap
  const { data: roadmap, error: rErr } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, current_baseline_version')
    .eq('id', roadmapId)
    .single();

  if (rErr || !roadmap) {
    throw new Error(`Roadmap not found: ${roadmapId}`);
  }

  // Calculate alignment
  const alignment = await calculateAlignment(supabase, roadmapId);

  // Build context for Chairman
  const context = {
    roadmap_id: roadmapId,
    roadmap_title: roadmap.title,
    current_baseline_version: roadmap.current_baseline_version || 0,
    proposed_baseline_version: (roadmap.current_baseline_version || 0) + 1,
    overall_alignment_pct: alignment.overall_alignment_pct,
    wave_summary: alignment.waves.map(w => ({
      title: w.title,
      items: w.total_items,
      okr_aligned: w.linked_items,
      alignment_pct: w.alignment_pct,
      okrs: w.okr_ids,
    })),
    proposal_rationale: options.rationale || 'Wave sequence ready for Chairman review',
  };

  // Insert chairman decision
  const { data: decision, error: dErr } = await supabase
    .from('chairman_decisions')
    .insert({
      decision_type: 'roadmap_approval',
      status: 'pending',
      blocking: true,
      summary: `Roadmap approval: ${roadmap.title} (v${context.proposed_baseline_version})`,
      rationale: options.rationale || null,
      context,
    })
    .select('id')
    .single();

  if (dErr) {
    throw new Error(`Failed to create proposal: ${dErr.message}`);
  }

  return { decisionId: decision.id, alignment };
}
