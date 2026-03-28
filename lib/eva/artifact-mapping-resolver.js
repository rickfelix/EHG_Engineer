/**
 * Artifact Mapping Resolver
 *
 * SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
 *
 * Reads venture_sd_artifact_mapping table to determine which artifacts
 * from the EVA pipeline should be attached to each SD layer.
 *
 * Mapping flow:
 * 1. Load mapping config for a given venture_type from database
 * 2. If no mapping exists for the venture_type, generate a default mapping
 * 3. Resolve: given a set of artifacts and an SD layer, return the relevant artifacts
 *    classified as universal, layer_specific, or supplemental
 *
 * @module lib/eva/artifact-mapping-resolver
 */

import { ARTIFACT_TYPES, ARTIFACT_TYPE_BY_STAGE } from './artifact-types.js';

// ── Default Mapping Configuration ────────────────────────────────────
// Universal artifacts attach to every SD regardless of layer
const UNIVERSAL_ARTIFACTS = [
  { artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, lifecycle_stage: 10 },
  { artifact_type: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, lifecycle_stage: 14 },
  { artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, lifecycle_stage: 14 },
];

// Layer-specific mappings: which artifacts are required for each SD layer
const LAYER_SPECIFIC_ARTIFACTS = {
  data: [
    { artifact_type: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM, lifecycle_stage: 14 },
    { artifact_type: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC, lifecycle_stage: 14 },
  ],
  api: [
    { artifact_type: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT, lifecycle_stage: 14 },
  ],
  ui: [
    { artifact_type: ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES, lifecycle_stage: 15 },
    { artifact_type: ARTIFACT_TYPES.IDENTITY_BRAND_GUIDELINES, lifecycle_stage: 10 },
  ],
  tests: [
    { artifact_type: ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK, lifecycle_stage: 15 },
  ],
};

// Supplemental artifacts: useful context but not blocking
const SUPPLEMENTAL_ARTIFACTS = [
  { artifact_type: ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS, lifecycle_stage: 4 },
  { artifact_type: ARTIFACT_TYPES.ENGINE_PRICING_MODEL, lifecycle_stage: 7 },
  { artifact_type: ARTIFACT_TYPES.BLUEPRINT_RISK_REGISTER, lifecycle_stage: 15 },
  { artifact_type: ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP, lifecycle_stage: 13 },
  { artifact_type: ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY, lifecycle_stage: 12 },
  { artifact_type: ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL, lifecycle_stage: 5 },
  { artifact_type: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS, lifecycle_stage: 8 },
];

/**
 * Load artifact mapping from database for a given venture_type.
 * Falls back to default hardcoded mapping if none exists.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureType - The venture archetype (e.g., 'saas', 'marketplace')
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<Object>} Mapping config: { universal, layerSpecific, supplemental }
 */
export async function loadMapping(supabase, ventureType, options = {}) {
  const { logger = console } = options;

  // Try loading from database first
  const { data: rows, error } = await supabase
    .from('venture_sd_artifact_mapping')
    .select('*')
    .eq('venture_type', ventureType);

  if (error) {
    logger.warn(`[ArtifactMappingResolver] DB error loading mapping for ${ventureType}: ${error.message}, using defaults`);
  }

  if (rows && rows.length > 0) {
    return parseDatabaseMapping(rows);
  }

  // No DB mapping found — use hardcoded defaults
  logger.log(`[ArtifactMappingResolver] No DB mapping for venture_type="${ventureType}", using default mapping`);
  return getDefaultMapping();
}

/**
 * Parse database rows into structured mapping config.
 */
function parseDatabaseMapping(rows) {
  const universal = [];
  const layerSpecific = { data: [], api: [], ui: [], tests: [] };
  const supplemental = [];

  for (const row of rows) {
    const entry = {
      artifact_type: row.artifact_type,
      lifecycle_stage: row.lifecycle_stage,
      is_required: row.is_required,
    };

    if (row.classification === 'universal') {
      universal.push(entry);
    } else if (row.classification === 'layer_specific') {
      const layer = row.sd_layer;
      if (layerSpecific[layer]) {
        layerSpecific[layer].push(entry);
      }
    } else if (row.classification === 'supplemental') {
      supplemental.push(entry);
    }
  }

  return { universal, layerSpecific, supplemental };
}

/**
 * Get default hardcoded mapping (used when no DB mapping exists).
 */
export function getDefaultMapping() {
  return {
    universal: UNIVERSAL_ARTIFACTS.map(a => ({ ...a, is_required: true })),
    layerSpecific: Object.fromEntries(
      Object.entries(LAYER_SPECIFIC_ARTIFACTS).map(([layer, arts]) => [
        layer,
        arts.map(a => ({ ...a, is_required: true })),
      ]),
    ),
    supplemental: SUPPLEMENTAL_ARTIFACTS.map(a => ({ ...a, is_required: false })),
  };
}

/**
 * Resolve which artifacts should be attached to an SD for a given layer.
 *
 * @param {Object} mapping - Mapping config from loadMapping()
 * @param {string} sdLayer - The SD's architecture layer ('data', 'api', 'ui', 'tests')
 * @param {Object[]} availableArtifacts - Array of { artifact_type, id, lifecycle_stage, ... }
 * @returns {Object} { required: [...], supplemental: [...], missing: [...] }
 */
export function resolveArtifactsForSD(mapping, sdLayer, availableArtifacts) {
  const artifactsByType = new Map();
  for (const art of availableArtifacts) {
    artifactsByType.set(art.artifact_type, art);
  }

  const required = [];
  const supplemental = [];
  const missing = [];

  // Universal artifacts (attach to every SD)
  for (const spec of mapping.universal) {
    const found = artifactsByType.get(spec.artifact_type);
    if (found) {
      required.push({ ...found, classification: 'universal' });
    } else if (spec.is_required) {
      missing.push({ artifact_type: spec.artifact_type, classification: 'universal' });
    }
  }

  // Layer-specific artifacts
  const layerArts = mapping.layerSpecific[sdLayer] || [];
  for (const spec of layerArts) {
    const found = artifactsByType.get(spec.artifact_type);
    if (found) {
      required.push({ ...found, classification: 'layer_specific' });
    } else if (spec.is_required) {
      missing.push({ artifact_type: spec.artifact_type, classification: 'layer_specific' });
    }
  }

  // Supplemental artifacts (non-blocking)
  for (const spec of mapping.supplemental) {
    const found = artifactsByType.get(spec.artifact_type);
    if (found) {
      supplemental.push({ ...found, classification: 'supplemental' });
    }
  }

  return { required, supplemental, missing };
}

/**
 * Seed a default mapping into the database for a venture_type.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureType - The venture type to seed
 * @returns {Promise<{seeded: number, errors: string[]}>}
 */
export async function seedDefaultMapping(supabase, ventureType) {
  const mapping = getDefaultMapping();
  const rows = [];
  const errors = [];

  // Universal → sd_layer='all'
  for (const art of mapping.universal) {
    rows.push({
      venture_type: ventureType,
      artifact_type: art.artifact_type,
      sd_layer: 'all',
      classification: 'universal',
      is_required: true,
      lifecycle_stage: art.lifecycle_stage,
    });
  }

  // Layer-specific
  for (const [layer, arts] of Object.entries(mapping.layerSpecific)) {
    for (const art of arts) {
      rows.push({
        venture_type: ventureType,
        artifact_type: art.artifact_type,
        sd_layer: layer,
        classification: 'layer_specific',
        is_required: true,
        lifecycle_stage: art.lifecycle_stage,
      });
    }
  }

  // Supplemental → sd_layer='all'
  for (const art of mapping.supplemental) {
    rows.push({
      venture_type: ventureType,
      artifact_type: art.artifact_type,
      sd_layer: 'all',
      classification: 'supplemental',
      is_required: false,
      lifecycle_stage: art.lifecycle_stage,
    });
  }

  const { error } = await supabase
    .from('venture_sd_artifact_mapping')
    .upsert(rows, { onConflict: 'venture_type,artifact_type,sd_layer' });

  if (error) {
    errors.push(`Failed to seed mapping: ${error.message}`);
  }

  return { seeded: errors.length === 0 ? rows.length : 0, errors };
}

/**
 * Get all artifact types covered by the mapping.
 * Used for completeness validation.
 *
 * @param {Object} mapping - Mapping config from loadMapping()
 * @returns {Set<string>} Set of all artifact_type strings in the mapping
 */
export function getMappedArtifactTypes(mapping) {
  const types = new Set();

  for (const art of mapping.universal) {
    types.add(art.artifact_type);
  }
  for (const arts of Object.values(mapping.layerSpecific)) {
    for (const art of arts) {
      types.add(art.artifact_type);
    }
  }
  for (const art of mapping.supplemental) {
    types.add(art.artifact_type);
  }

  return types;
}
