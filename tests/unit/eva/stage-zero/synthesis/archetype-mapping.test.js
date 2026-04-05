import { describe, it, expect } from 'vitest';
import { toDbArchetype, SYNTHESIS_TO_DB_ARCHETYPE, DEFAULT_DB_ARCHETYPE } from '../../../../../lib/eva/stage-zero/synthesis/archetype-mapping.js';
import { VALID_ARCHETYPE_KEYS } from '../../../../../lib/eva/stage-zero/synthesis/archetypes.js';

// Known valid DB archetypes (from archetype_benchmarks table)
const VALID_DB_ARCHETYPES = [
  'ai_agents', 'ai_product', 'content', 'creator_tools', 'deeptech',
  'e_commerce', 'edtech', 'fintech', 'hardware', 'healthtech',
  'marketplace', 'media', 'real_estate', 'saas', 'saas_b2b', 'saas_b2c', 'services',
];

describe('archetype-mapping', () => {
  it('maps all synthesis archetypes to valid DB archetypes', () => {
    for (const key of VALID_ARCHETYPE_KEYS) {
      const dbKey = toDbArchetype(key);
      expect(VALID_DB_ARCHETYPES).toContain(dbKey);
    }
  });

  it('covers every synthesis archetype key', () => {
    for (const key of VALID_ARCHETYPE_KEYS) {
      expect(SYNTHESIS_TO_DB_ARCHETYPE).toHaveProperty(key);
    }
  });

  it('returns default for unknown archetype', () => {
    expect(toDbArchetype('nonexistent_type')).toBe(DEFAULT_DB_ARCHETYPE);
    expect(VALID_DB_ARCHETYPES).toContain(DEFAULT_DB_ARCHETYPE);
  });

  it('returns default for undefined/null', () => {
    expect(toDbArchetype(undefined)).toBe(DEFAULT_DB_ARCHETYPE);
    expect(toDbArchetype(null)).toBe(DEFAULT_DB_ARCHETYPE);
  });

  it('maps experience_designer (the failing case) correctly', () => {
    expect(toDbArchetype('experience_designer')).toBe('content');
  });
});
