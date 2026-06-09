/**
 * Adam scope registry — enumerate portfolio scopes for the governance heartbeat.
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001. READ-ONLY.
 *
 * Classifies scopes from the canonical `applications` table (kind + venture_id)
 * rather than a hard-coded list, reusing repo-paths semantics for name
 * normalization. Returns one scope per active portfolio surface:
 *   - harness        = EHG_Engineer (kind=platform)
 *   - platform       = EHG          (kind=platform)
 *   - venture:<id>   = each active non-demo venture that has a live application row
 *
 * The `supabase` argument MUST be a @supabase/supabase-js client (query-builder
 * semantics: .from().select().eq().is()), NOT a raw pg.Client.
 */
import { normalizeAppName } from '../repo-paths.js';

export const HARNESS_APP = 'EHG_Engineer';
export const PLATFORM_APP = 'EHG';

/**
 * Enumerate the live portfolio scopes.
 * @param {object} supabase - supabase-js client (service role)
 * @returns {Promise<Array<{scope_key,kind,app_name,repo_path,venture_id}>>}
 */
export async function enumerateScopes(supabase) {
  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, name, normalized_name, kind, local_path, venture_id')
    .eq('status', 'active')
    .is('deleted_at', null);
  if (appErr) throw new Error(`enumerateScopes: applications query failed: ${appErr.message}`);

  // active, non-demo ventures form the per-venture allowlist
  const { data: ventures, error: venErr } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('status', 'active')
    .eq('is_demo', false)
    .is('deleted_at', null);
  if (venErr) throw new Error(`enumerateScopes: ventures query failed: ${venErr.message}`);
  const liveVentureIds = new Set((ventures || []).map((v) => v.id));

  const harnessNorm = normalizeAppName(HARNESS_APP);
  const scopes = [];
  for (const app of apps || []) {
    const kind = String(app.kind || '').toLowerCase();
    if (kind === 'platform') {
      const isHarness = normalizeAppName(app.name) === harnessNorm;
      scopes.push({
        scope_key: isHarness ? 'harness' : 'platform',
        kind: 'platform',
        app_name: app.name,
        repo_path: app.local_path || null,
        venture_id: null,
      });
    } else if (kind === 'venture') {
      // per-venture scope ONLY when the app links to a live (active, non-demo) venture
      if (app.venture_id && liveVentureIds.has(app.venture_id)) {
        scopes.push({
          scope_key: `venture:${app.venture_id}`,
          kind: 'venture',
          app_name: app.name,
          repo_path: app.local_path || null,
          venture_id: app.venture_id,
        });
      }
    }
  }

  // deterministic order: harness, platform, then ventures by app_name
  const rank = (s) => (s.scope_key === 'harness' ? 0 : s.scope_key === 'platform' ? 1 : 2);
  scopes.sort((a, b) => rank(a) - rank(b) || String(a.app_name).localeCompare(String(b.app_name)));
  return scopes;
}

/**
 * Count the distinct live ventures in a scope list (drives the liveness guard).
 * @param {Array} scopes
 * @returns {number}
 */
export function countLiveVentures(scopes) {
  return (scopes || []).filter((s) => s.kind === 'venture').length;
}

/**
 * Weighted round-robin: pick ONE scope per tick. Deterministic given tickIndex
 * (no Math.random — the loop must be replayable). harness/platform carry the
 * live OKRs today, so they get double weight.
 * @param {Array} scopes
 * @param {number} tickIndex
 * @returns {object|null}
 */
export function selectScopeForTick(scopes, tickIndex = 0) {
  if (!Array.isArray(scopes) || scopes.length === 0) return null;
  const weighted = [];
  for (const s of scopes) {
    const w = s.kind === 'platform' ? 2 : 1;
    for (let i = 0; i < w; i++) weighted.push(s);
  }
  const i = Number.isFinite(tickIndex) ? tickIndex : 0;
  const idx = ((i % weighted.length) + weighted.length) % weighted.length;
  return weighted[idx];
}

/**
 * Resolve an explicit --scope argument against the enumerated scopes.
 * Accepts: 'harness' | 'platform' | 'venture:<id>' | 'auto'.
 * @returns {object|null} the matching scope, or null if not found
 */
export function resolveScopeArg(scopes, scopeArg, tickIndex = 0) {
  const arg = String(scopeArg || 'auto').trim();
  if (arg === 'auto' || arg === '') return selectScopeForTick(scopes, tickIndex);
  return (scopes || []).find((s) => s.scope_key === arg) || null;
}
