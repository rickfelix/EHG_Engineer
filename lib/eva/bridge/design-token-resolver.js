/**
 * Locked design-token source resolution.
 * SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-1, TR-1).
 *
 * Two locked-design-token sources exist for a venture:
 *  - venture_gvos_profile.locked_prompt_snapshot -- the newer GVOS-standard source
 *    (written by lib/eva/stage-execution-worker.js's S17-GvosLock hook).
 *  - blueprint_token_manifest (via lib/eva/stage-17/token-manifest.js) -- the legacy
 *    S17-lock source.
 * Neither is read anywhere near the venture-build leaf-content seam. This resolver
 * picks GVOS first, falls back to the legacy manifest, and returns null (never
 * throws) when neither exists -- a venture with no locked source keeps receiving
 * today's generic template, byte-for-byte (zero regression).
 *
 * @module lib/eva/bridge/design-token-resolver
 */

/**
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<{ source: 'gvos'|'legacy'|'none', tokens: object|null }>}
 */
export async function resolveLockedDesignTokens(ventureId, supabase) {
  if (!ventureId || !supabase) return { source: 'none', tokens: null };

  try {
    const { data: gvosRow } = await supabase
      .from('venture_gvos_profile')
      .select('locked_prompt_snapshot')
      .eq('venture_id', ventureId)
      .maybeSingle();
    if (gvosRow?.locked_prompt_snapshot) {
      return { source: 'gvos', tokens: gvosRow.locked_prompt_snapshot };
    }
  } catch {
    // fall through to the legacy source
  }

  try {
    const { getTokenConstraints } = await import('../stage-17/token-manifest.js');
    const legacy = await getTokenConstraints(ventureId, supabase);
    if (legacy) return { source: 'legacy', tokens: legacy };
  } catch {
    // fail-open: no source resolvable
  }

  return { source: 'none', tokens: null };
}

/**
 * Motion-grammar resolution (FR-1). The S15 wireframe generator persists per-screen
 * micro_animations (entry_transition/hover_states/loading_animation/cta_effects) on the
 * wireframe_screens venture_artifacts row -- the only per-venture motion-grammar source
 * that exists today. Returns the first screen's micro_animations as a representative,
 * venture-wide sample (the same "resolve once for the whole venture" contract as
 * resolveLockedDesignTokens above). Never throws; null means no motion-grammar data.
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<object|null>}
 */
export async function resolveMotionGrammar(ventureId, supabase) {
  if (!ventureId || !supabase) return null;
  try {
    const { data } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'wireframe_screens')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    const screens = data?.artifact_data?.screens || [];
    for (const s of screens) {
      if (s?.micro_animations && typeof s.micro_animations === 'object') {
        return s.micro_animations;
      }
    }
  } catch {
    // fail-open: no motion-grammar data resolvable
  }
  return null;
}
