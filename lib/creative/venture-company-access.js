/**
 * Resolves venture access via the user_company_access ownership model, deliberately NOT
 * ventures.created_by (which is NULL on all live ventures and would return "authorized: false"
 * unconditionally for every user, indistinguishable from a genuine authorization failure).
 *
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (FR-5 / US-006).
 *
 * DELIBERATELY DEPENDENCY-FREE (only the passed-in supabase client): this module is imported
 * from BOTH the Node-side lib/creative/variant-scoring-bridge.js AND the Deno-runtime
 * supabase/functions/variant-scoring-bridge/index.ts Edge Function. Do not add any import here
 * beyond the supabase client parameter -- Deno's bundler cannot resolve bare Node built-in
 * specifiers (e.g. a plain `import crypto from 'crypto'` without a `node:` prefix, as found in
 * lib/feature-flags/evaluator.js, which is why asset-view-gate.js's full dependency chain is
 * NOT imported by the Edge Function -- see that file's Edge Function usage note).
 *
 * @param {{supabase: object, userId: string|null|undefined, ventureId: string|null|undefined}} params
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function resolveVentureCompanyAccess({ supabase, userId, ventureId }) {
  if (!userId || !ventureId) {
    return { allowed: false, reason: 'missing_user_or_venture_id' };
  }

  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('company_id')
    .eq('id', ventureId)
    .maybeSingle();

  if (ventureError || !venture || !venture.company_id) {
    return { allowed: false, reason: 'venture_not_found_or_no_company' };
  }

  const { data: access, error: accessError } = await supabase
    .from('user_company_access')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', venture.company_id)
    .maybeSingle();

  if (accessError || !access) {
    return { allowed: false, reason: 'no_company_access' };
  }

  return { allowed: true };
}
