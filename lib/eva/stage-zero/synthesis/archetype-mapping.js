/**
 * Maps synthesis (strategic) archetypes to DB (industry) archetypes.
 *
 * The synthesis engine classifies ventures into 7 strategic archetypes,
 * but ventures.archetype has a FK to archetype_benchmarks which uses
 * industry archetypes (canonical list in stage-01-constants.js).
 *
 * RCA: PAT-TAXONOMY-COLLISION-001
 * Fix: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001 — aligned to
 * post-migration canonical values (20260324_unify_archetype_taxonomy.sql)
 */

import { ARCHETYPES } from '../../stage-templates/stage-01-constants.js';

const SYNTHESIS_TO_DB_ARCHETYPE = {
  democratizer: 'saas',
  automator: 'saas',
  capability_productizer: 'ai_product',
  first_principles_rebuilder: 'marketplace',
  vertical_specialist: 'saas',
  portfolio_connector: 'services',
  experience_designer: 'media',
};

// Startup validation: ensure all mapped values exist in canonical list
for (const [synth, db] of Object.entries(SYNTHESIS_TO_DB_ARCHETYPE)) {
  if (!ARCHETYPES.includes(db)) {
    console.error(`[archetype-mapping] WARNING: "${synth}" maps to "${db}" which is not in ARCHETYPES canonical list`);
  }
}

const DEFAULT_DB_ARCHETYPE = 'saas';

/**
 * Map a synthesis archetype key to a valid archetype_benchmarks value.
 * Returns the mapped DB archetype, or DEFAULT_DB_ARCHETYPE if unknown.
 *
 * @param {string} synthesisArchetype - Key from synthesis engine (e.g. 'experience_designer')
 * @returns {string} Valid archetype_benchmarks key (e.g. 'content')
 */
export function toDbArchetype(synthesisArchetype) {
  return SYNTHESIS_TO_DB_ARCHETYPE[synthesisArchetype] || DEFAULT_DB_ARCHETYPE;
}

export { SYNTHESIS_TO_DB_ARCHETYPE, DEFAULT_DB_ARCHETYPE };
