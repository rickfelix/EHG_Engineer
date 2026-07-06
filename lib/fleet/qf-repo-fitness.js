/**
 * qf-repo-fitness.js — QF-20260706-356
 *
 * Rider 3 (2026-07-06) opened quick_fixes.target_application to every ACTIVE
 * applications-registry row, not just EHG/EHG_Engineer. 8 of 11 registered ventures
 * have applications.github_repo IS NULL (scaffolded but never pushed to GitHub) — a
 * QF filed against one is DB-valid but unworkable; a claiming worker would wedge
 * hunting a repo that does not exist. This predicate runs at claim time (qf-start.js,
 * BEFORE the claim_sd RPC) so that class of QF routes back with a clear reason
 * instead of being claimed.
 *
 * Fails open (returns null) for: platform targets (EHG/EHG_Engineer), an unset
 * target, and a target that doesn't match any registered application — only a
 * POSITIVELY-confirmed missing github_repo/local_path blocks the claim.
 */
import { isVentureRepo, normalizeAppName } from '../repo-paths.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} qfId
 * @returns {Promise<string|null>} a human-readable block reason, or null when fit to claim
 */
export async function repoUnfitReason(supabase, qfId) {
  const { data: qf } = await supabase.from('quick_fixes').select('target_application').eq('id', qfId).maybeSingle();
  const targetApp = qf?.target_application;
  if (!isVentureRepo(targetApp)) return null;
  const { data: apps } = await supabase.from('applications')
    .select('name, github_repo, local_path').eq('status', 'active').is('deleted_at', null);
  const app = (apps || []).find((a) => normalizeAppName(a.name) === normalizeAppName(targetApp));
  if (!app || (app.github_repo && app.local_path)) return null;
  return `target '${targetApp}' has no usable repo (github_repo=${app.github_repo || 'null'}, local_path=${app.local_path || 'null'}) — needs repo registration, or route via a venture-SD lane instead of a worker QF claim.`;
}
