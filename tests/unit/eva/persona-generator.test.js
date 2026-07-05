/**
 * Unit tests for lib/eva/persona-generator.js.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E
 *
 * @module tests/unit/eva/persona-generator.test
 */

import { describe, it, expect } from 'vitest';
import { JOURNEY_STEPS, generatePersonaFromArtifact } from '../../../lib/eva/persona-generator.js';

const SAMPLE_ARTIFACT = {
  personas: [
    {
      name: 'Tech-Savvy Startup Founder',
      demographics: { ageRange: '25-40', role: 'Founder/CEO', industry: 'Technology' },
      goals: ['Validate product-market fit quickly', 'Raise a seed round'],
      painPoints: ['Wasting time on ideas nobody wants', 'Unclear willingness-to-pay signal'],
      behaviors: ['Researches competitors obsessively'],
      motivations: ['Building something that matters'],
    },
  ],
};

describe('generatePersonaFromArtifact() — TS-1', () => {
  it('produces a persona descriptor with non-empty name/goals/painPoints and a scripted intent per journey step', () => {
    const persona = generatePersonaFromArtifact(SAMPLE_ARTIFACT);

    expect(persona.name).toBe('Tech-Savvy Startup Founder');
    expect(persona.goals.length).toBeGreaterThan(0);
    expect(persona.painPoints.length).toBeGreaterThan(0);

    for (const step of JOURNEY_STEPS) {
      expect(persona.stepIntents[step]).toBeTruthy();
      expect(typeof persona.stepIntents[step]).toBe('string');
    }
    // Intents are grounded in the persona's actual goals/pain points, not generic filler.
    expect(persona.stepIntents.land).toContain('Wasting time on ideas nobody wants');
    expect(persona.stepIntents.signup).toContain('Validate product-market fit quickly');
  });
});

describe('generatePersonaFromArtifact() — TS-2', () => {
  it('throws when the artifact has no personas — never fabricates one from nothing', () => {
    expect(() => generatePersonaFromArtifact({ personas: [] })).toThrow(/refusing to fabricate/);
  });

  it('throws when the artifact is null (identity_persona_brand missing entirely)', () => {
    expect(() => generatePersonaFromArtifact(null)).toThrow(/refusing to fabricate/);
  });

  it('throws when the first persona has no name', () => {
    expect(() => generatePersonaFromArtifact({ personas: [{ goals: ['x'] }] })).toThrow(/missing a name/);
  });
});
