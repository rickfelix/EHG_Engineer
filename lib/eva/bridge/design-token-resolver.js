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
