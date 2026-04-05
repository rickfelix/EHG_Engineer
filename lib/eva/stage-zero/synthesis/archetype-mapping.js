/**
 * Maps synthesis (strategic) archetypes to DB (industry) archetypes.
 *
 * The synthesis engine classifies ventures into 7 strategic archetypes,
 * but ventures.archetype has a FK to archetype_benchmarks which uses
 * industry archetypes. This module bridges the two taxonomies.
 *
 * RCA: PAT-TAXONOMY-COLLISION-001
 */

const SYNTHESIS_TO_DB_ARCHETYPE = {
  democratizer: 'saas_b2c',
  automator: 'saas_b2b',
  capability_productizer: 'ai_agents',
  first_principles_rebuilder: 'marketplace',
  vertical_specialist: 'saas_b2b',
  portfolio_connector: 'services',
  experience_designer: 'content',
};

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
