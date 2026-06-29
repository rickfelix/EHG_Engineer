/**
 * Shared wireframe_screens normalizer — SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001.
 *
 * The 15->16 boundary REQUIRES the `wireframe_screens` artifact. Historically it was written
 * implicitly by the orchestrator's legacy single-artifact fallback (synchronously, BEFORE the
 * boundary). SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001 switched the S15 producer to the typed
 * { artifacts:[...] } contract, which bypassed that fallback — so wireframe_screens then depended
 * solely on the daemon's POST-ADVANCEMENT post-hook, creating a deadlock (boundary needs the
 * artifact -> no advance -> hook never fires). RCA confidence 0.93.
 *
 * Fix: the producer now emits wireframe_screens in its typed batch (before the boundary), and the
 * post-hook stays an idempotent fallback for legacy/orchestrator-direct ventures. BOTH call this
 * shared normalizer so the screen payload shape can never drift between the two writers.
 */

// S15 stores screens in several shapes depending on the producing sub-step; accept all of them.
export function extractRawScreens(source) {
  const s = source || {};
  return s.screens
    ?? s.wireframes?.screens
    ?? s.ia_sitemap?.pages
    ?? [];
}

// Normalize a raw screen list for downstream consumption (archetype-generator / S17).
// SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B: pass `surface` through when present
// AND the surface-aware flag is enabled (env-gated, matched to the post-hook's prior behavior).
export function normalizeWireframeScreens(rawScreens, { surfaceAwareEnabled = process.env.EVA_SURFACE_AWARE_ENABLED === 'true' } = {}) {
  const list = Array.isArray(rawScreens) ? rawScreens : [];
  return list.map((screen, idx) => {
    const s = screen || {};
    const normalized = {
      screen_id: s.screen_id ?? s.id ?? `screen-${idx}`,
      screen_name: s.screen_name ?? s.name ?? s.title ?? `Screen ${idx + 1}`,
      description: s.description ?? s.purpose ?? s.prompt ?? s.text ?? '',
      deviceType: s.deviceType ?? s.device_type ?? 'DESKTOP',
      page_type: s.page_type ?? s.pageType ?? null,
    };
    if (surfaceAwareEnabled && s.surface) {
      normalized.surface = s.surface;
    }
    return normalized;
  });
}

// Build the canonical wireframe_screens artifact_data payload (what both writers persist).
export function buildWireframeScreensPayload(source, opts = {}) {
  const screens = normalizeWireframeScreens(extractRawScreens(source), opts);
  return {
    screens,
    screenCount: screens.length,
    ia_sitemap: (source && source.ia_sitemap) ?? null,
  };
}

export default { extractRawScreens, normalizeWireframeScreens, buildWireframeScreensPayload };
