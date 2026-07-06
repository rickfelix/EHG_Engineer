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
 * SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-1/FR-2, TR-2): compose the venture's locked
 * design tokens + motion-grammar + design_reference + FR-3 instruction block into a single
 * additive text block. PURE (no I/O) — returns null when nothing is available, so the
 * template-content path stays byte-identical for ventures with no locked design source.
 *
 * @param {{tokens?:object|null, motionGrammar?:object|null, designReference?:object|null, instructionBlock?:string|null}} input
 * @returns {string|null}
 */
export function buildDesignInputBlock({ tokens, motionGrammar, designReference, instructionBlock } = {}) {
  const parts = [];
  if (tokens) parts.push(`DESIGN TOKENS (locked):\n${JSON.stringify(tokens, null, 2)}`);
  if (motionGrammar) parts.push(`MOTION GRAMMAR:\n${JSON.stringify(motionGrammar, null, 2)}`);
  if (designReference) parts.push(`DESIGN REFERENCE:\n${JSON.stringify(designReference, null, 2)}`);
  if (instructionBlock) parts.push(instructionBlock);
  return parts.length ? parts.join('\n\n') : null;
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
    // SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-1/FR-2): the UI leaf carries the venture's
    // locked design tokens + motion-grammar + design_reference + audit instruction block
    // instead of the bare generic template, when a design-input source exists. A venture
    // with no locked source at all falls through to `template` unchanged (TS-2).
    if (layer?.key === 'ui') {
      const designBlock = buildDesignInputBlock({
        tokens: ventureContext?.designTokens || null,
        motionGrammar: ventureContext?.motionGrammar || null,
        designReference: childPayload?.design_reference || null,
        instructionBlock: ventureContext?.designInstructionBlock || null,
      });
      if (designBlock) {
        return { description: `${template.description}\n\n${designBlock}`, scope: template.scope };
      }
    }
    return template;
  }
  const enriched = await enrichLeafViaPanel({
    leaf: { sd_key: leafKey, title: `${childPayload.title} — ${layer.label}`, layer: layer.key },
    artifactTypes: ventureContext.panelArtifactTypes || [],
    criteriaOpts: ventureContext.panelCriteriaOpts || {},
    driver: ventureContext.panelDriver,
  });
  if (enriched.status === 'held') {
    // SD-LEO-INFRA-WIRE-PRE-BUILD-002 FR-6: emit an ATTRIBUTABLE observability event BEFORE the
    // throw propagates. The throw unwinds past createGrandchildren (no local try/catch) to the
    // bridge's tree-level catch, which rolls back the WHOLE venture decomposition — intended
    // whole-tree fail-closed (no tree of stubs). Without this event the rollback looks like a
    // generic DB failure. onHold is INJECTED by the bridge (wires emitFeedback) so this module
    // stays DB-free/headlessly-testable; a failing emit must NEVER swallow the fail-closed throw.
    if (typeof ventureContext.onHold === 'function') {
      try {
        await ventureContext.onHold({ event: 'PREBUILD_PANEL_HELD', leafKey, heldOn: enriched.heldOn, ventureId: ventureContext.ventureId ?? null });
      } catch { /* observability is best-effort */ }
    }
    const e = new Error(`PREBUILD_PANEL_HELD: leaf ${leafKey} held on agent ${enriched.heldOn} — refusing to stamp a template stub`);
    e.code = 'PREBUILD_PANEL_HELD';
    throw e;
  }
  // Keep the layer-scoped scope line; the rich content rides in the description.
  return { description: enriched.enrichedDescription, scope: template.scope };
}
