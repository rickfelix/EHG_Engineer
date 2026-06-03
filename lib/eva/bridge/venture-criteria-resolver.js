/**
 * Venture criteria resolver
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-003 dynamic manifest, input side)
 *
 * Maps a venture's prior-stage artifact SIGNALS (which S0-S18 artifacts exist)
 * into the boolean/enum criteria object that selectAgentManifest() consumes.
 * Pure logic over a list of artifact_type strings — no DB — so it is headlessly
 * unit-testable. The caller fetches `venture_artifacts.artifact_type` for the
 * venture (is_current, lifecycle_stage <= 18) and passes the list here.
 *
 * Some criteria are derivable purely from artifact PRESENCE (a data model means
 * the venture touches data; wireframes mean it has UI). Others require a
 * venture-level CLASSIFICATION that artifact presence alone cannot establish
 * (whether the venture processes SENSITIVE data, and its product archetype);
 * those arrive via `opts` from the registry / vision classification and default
 * to the safe choice.
 *
 * @module lib/eva/bridge/venture-criteria-resolver
 */

/**
 * artifact_type -> criteria signal mapping. Presence of ANY listed type sets the
 * corresponding criterion true. Mirrors the real DataDistill S0-18 artifact set.
 */
export const ARTIFACT_SIGNALS = Object.freeze({
  touchesData: ['blueprint_data_model', 'blueprint_schema_spec', 'blueprint_erd_diagram'],
  hasUI: ['blueprint_wireframes', 'wireframe_screens'],
  monetizationRelevant: ['engine_pricing_model', 'engine_business_model_canvas'],
  growthRelevant: ['identity_gtm_sales_strategy', 'marketing_landing_hero'],
});

/**
 * Derive the venture criteria object from artifact-type signals + classification opts.
 *
 * @param {string[]} artifactTypes - distinct `artifact_type` values present for the venture (stages 0-18, is_current)
 * @param {object}   [opts]
 * @param {boolean}  [opts.dataSensitive=false] - venture processes sensitive/external data (S6 risk + security persona / registry classification)
 * @param {string}   [opts.archetype='crud']    - product archetype: 'algorithm-core' | 'crud' | 'content' | 'marketplace' | 'api-platform'
 * @returns {{touchesData:boolean,hasUI:boolean,monetizationRelevant:boolean,growthRelevant:boolean,dataSensitive:boolean,archetype:string}}
 */
export function deriveVentureCriteria(artifactTypes = [], opts = {}) {
  const present = new Set(Array.isArray(artifactTypes) ? artifactTypes : []);
  const hasAny = (list) => list.some((t) => present.has(t));
  return {
    // derivable from artifact presence
    touchesData: hasAny(ARTIFACT_SIGNALS.touchesData),
    hasUI: hasAny(ARTIFACT_SIGNALS.hasUI),
    monetizationRelevant: hasAny(ARTIFACT_SIGNALS.monetizationRelevant),
    growthRelevant: hasAny(ARTIFACT_SIGNALS.growthRelevant),
    // classification-driven (not establishable from artifact presence alone)
    dataSensitive: opts.dataSensitive === true,
    archetype: opts.archetype || 'crud',
  };
}
