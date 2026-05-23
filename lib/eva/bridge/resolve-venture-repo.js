/**
 * resolve-venture-repo.js
 * SD-LEO-FEAT-S19-BUILDS-INTO-001 (FR-2 / TR-1)
 *
 * Resolve the canonical git repo for a venture so Stage 19 can BUILD INTO the
 * existing Stage-17 design repo instead of creating a blank one.
 *
 * Precedence:
 *   1. ventures.repo_url — the SSOT, populated from the S17 github_sync capture
 *      by trg_set_venture_repo_from_s17 (ehg migration 20260523120000). [FR-1]
 *   2. Fallback: the current s17_approved github_sync artifact's
 *      metadata.lovable_artifact.repo_url (covers ventures captured before the
 *      SSOT trigger/backfill, or where the column was cleared).
 *   3. null — no design repo resolves; the caller falls back to create-new.
 *
 * Pure read. `supabase` is injected so the resolver is unit-testable without a
 * live DB (PRD TS-6). Never throws — a DB error degrades to the next source,
 * then to null (create-new), never to a wrong repo.
 */

/**
 * Normalize a repo URL to a clean https form with no trailing `.git`.
 * Mirrors the SSOT trigger's regexp_replace(..., '\.git/?$', '').
 * @param {unknown} url
 * @returns {string|null}
 */
export function normalizeRepoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\.git\/?$/, '');
  return trimmed || null;
}

/**
 * Resolve the venture's existing git repo, if any.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<string|null>} normalized https repo URL, or null
 */
export async function resolveVentureRepoUrl(supabase, ventureId) {
  if (!supabase || !ventureId) return null;

  // 1. SSOT: ventures.repo_url
  try {
    const { data: venture } = await supabase
      .from('ventures')
      .select('repo_url')
      .eq('id', ventureId)
      .maybeSingle();
    const fromVenture = normalizeRepoUrl(venture?.repo_url);
    if (fromVenture) return fromVenture;
  } catch {
    // fall through to the artifact fallback
  }

  // 2. Fallback: the current s17_approved github_sync capture
  try {
    const { data: arts } = await supabase
      .from('venture_artifacts')
      .select('metadata')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 's17_approved')
      .eq('lifecycle_stage', 17)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1);
    const lovable = arts?.[0]?.metadata?.lovable_artifact;
    if (lovable?.type === 'github_sync') {
      const fromArtifact = normalizeRepoUrl(lovable.repo_url);
      if (fromArtifact) return fromArtifact;
    }
  } catch {
    // no resolvable repo
  }

  return null;
}

export default resolveVentureRepoUrl;
