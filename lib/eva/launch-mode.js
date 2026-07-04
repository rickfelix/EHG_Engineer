/**
 * Launch-mode read helpers — SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-1).
 *
 * `ventures.launch_mode` is a distinct axis from the existing `pipeline_mode`
 * (lifecycle stage). It is chairman-gated DDL (database/migrations/20260703_ventures_launch_mode.sql)
 * staged but not necessarily applied yet — getLaunchMode fails open to 'simulated'
 * (today's de-facto behavior) on ANY read error, including the column not existing yet,
 * so callers never depend on the migration having landed.
 */

export const SIMULATED = 'simulated';
export const LIVE = 'live';
const DEFAULT_MODE = SIMULATED;

/**
 * Read a venture's launch_mode. Fails open to 'simulated' on any error
 * (missing supabase/ventureId, undefined_column, network error, no row).
 * @param {object} [supabase]
 * @param {string} [ventureId]
 * @returns {Promise<'simulated'|'live'>}
 */
export async function getLaunchMode(supabase, ventureId) {
  if (!supabase || !ventureId) return DEFAULT_MODE;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('launch_mode')
      .eq('id', ventureId)
      .maybeSingle();
    if (error || !data) return DEFAULT_MODE;
    return data.launch_mode === LIVE ? LIVE : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** @param {string} mode @returns {boolean} */
export function isLiveMode(mode) {
  return mode === LIVE;
}

/** @param {string} mode @returns {boolean} */
export function isSimulatedMode(mode) {
  return mode !== LIVE;
}
