/**
 * Leaf content computation (template vs panel-enriched)
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-001 wiring seam)
 *
 * The single decision point for a venture-build leaf's description/scope:
 *  - DEFAULT (flag off OR no driver): the legacy ARCHITECTURE_LAYERS template —
 *    byte-identical to the prior lifecycle-sd-bridge.js behavior.
 *  - ENABLED (PREBUILD_PANEL_ENRICHMENT on AND a panel driver supplied): run the
 *    panel via enrichLeafViaPanel and use the enriched description. If the panel
 *    HOLDS the leaf (a required agent could not deliver) this THROWS rather than
 *    stamping a stub — fail-closed, the core RCA behavior.
 *
 * Kept in its own module (no DB imports) so the seam is headlessly unit-testable
 * without loading the full bridge.
 *
 * @module lib/eva/bridge/leaf-content
 */

import { enrichLeafViaPanel } from './leaf-panel-enrichment.js';

/** Default-OFF feature flag. Mirrors the env-var kill-switch style of the bridge's other flags. */
export function isPrebuildPanelEnrichmentEnabled() {
  const v = process.env.PREBUILD_PANEL_ENRICHMENT;
  return v === '1' || v === 'true';
}

/** The legacy template content — must stay identical to the pre-seam bridge code. */
export function templateLeafContent(layer, childPayload) {
  return {
    description: `${layer.description} for "${childPayload.title}".`,
    scope: `${layer.label} implementation for parent task.`,
  };
}

/**
 * Compute a leaf's description + scope. Returns the template unless panel
 * enrichment is enabled AND a driver is present on ventureContext.
 *
 * @param {object} params
 * @param {object} params.layer - architecture layer ({ key, label, description })
 * @param {object} params.childPayload - parent child payload ({ title, ... })
 * @param {string} params.leafKey - the grandchild/leaf sd_key
 * @param {object} [params.ventureContext] - may carry { panelDriver, panelArtifactTypes, panelCriteriaOpts }
 * @returns {Promise<{description:string, scope:string}>}
 * @throws {Error} code 'PREBUILD_PANEL_HELD' when a required agent holds the leaf
 */
export async function computeLeafContent({ layer, childPayload, leafKey, ventureContext } = {}) {
  const template = templateLeafContent(layer, childPayload);
  if (!isPrebuildPanelEnrichmentEnabled() || !ventureContext?.panelDriver) {
    return template;
  }
  const enriched = await enrichLeafViaPanel({
    leaf: { sd_key: leafKey, title: `${childPayload.title} — ${layer.label}`, layer: layer.key },
    artifactTypes: ventureContext.panelArtifactTypes || [],
    criteriaOpts: ventureContext.panelCriteriaOpts || {},
    driver: ventureContext.panelDriver,
  });
  if (enriched.status === 'held') {
    const e = new Error(`PREBUILD_PANEL_HELD: leaf ${leafKey} held on agent ${enriched.heldOn} — refusing to stamp a template stub`);
    e.code = 'PREBUILD_PANEL_HELD';
    throw e;
  }
  // Keep the layer-scoped scope line; the rich content rides in the description.
  return { description: enriched.enrichedDescription, scope: template.scope };
}
