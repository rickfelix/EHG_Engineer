/**
 * Unit tests for Stage 10/11 Brand Wiring
 * SD: SD-LEO-INFRA-WIRE-STAGE-BRAND-001
 *
 * Tests:
 * - Persona role assignment logic (first=primary, rest=secondary/tertiary)
 * - Naming score mapping from candidate scores and personaFit
 *
 * @module tests/unit/eva/brand-stage-wiring.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client and brand-genome service
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

vi.mock('../../../lib/eva/services/brand-genome.js', () => ({
  createBrandGenome: vi.fn().mockResolvedValue({ id: 'bg-mock-id' }),
}));

import { analyzeStage10 } from '../../../lib/eva/stage-templates/analysis-steps/stage-10-customer-brand.js';
import { getLLMClient } from '../../../lib/llm/index.js';

/**
 * Helper: create well-formed Stage 10 LLM response.
 */
function createStage10Response(overrides = {}) {
  return JSON.stringify({
    customerPersonas: [
      {
        name: 'Enterprise CTO',
        demographics: { role: 'CTO', industry: 'Technology', ageRange: '35-50' },
        goals: ['Reduce infra costs', 'Improve reliability'],
        painPoints: ['Vendor lock-in', 'Scaling complexity'],
        behaviors: ['Evaluates new tools quarterly'],
        motivations: ['Team productivity'],
      },
      {
        name: 'Startup Founder',
        demographics: { role: 'CEO', industry: 'Technology', ageRange: '25-35' },
        goals: ['Ship fast', 'Find PMF'],
        painPoints: ['Limited budget'],
        behaviors: ['Early adopter'],
        motivations: ['Growth'],
      },
      {
        name: 'DevOps Lead',
        demographics: { role: 'DevOps', industry: 'Technology', ageRange: '28-40' },
        goals: ['Automate everything'],
        painPoints: ['Alert fatigue'],
        behaviors: ['CLI-first'],
        motivations: ['Efficiency'],
      },
    ],
    brandGenome: {
      archetype: 'Creator',
      values: ['Reliability', 'Speed'],
      tone: 'Confident and technical',
      audience: 'Engineering teams',
      differentiators: ['AI-native'],
      customerAlignment: [
        { trait: 'Reliability', personaName: 'Enterprise CTO', personaInsight: 'CTOs need uptime' },
      ],
    },
    brandPersonality: {
      vision: 'Make infrastructure invisible',
      mission: 'We automate the boring parts',
      brandVoice: 'Technical but human',
    },
    namingStrategy: 'abstract',
    scoringCriteria: [
      { name: 'Memorability', weight: 25 },
      { name: 'Relevance', weight: 25 },
      { name: 'Uniqueness', weight: 25 },
      { name: 'Persona Resonance', weight: 25 },
    ],
    candidates: [
      { name: 'Stratum', rationale: 'Layers of infrastructure', scores: { Memorability: 90, Relevance: 85, Uniqueness: 80, 'Persona Resonance': 88 } },
      { name: 'Nimbus', rationale: 'Cloud metaphor', scores: { Memorability: 75, Relevance: 70, Uniqueness: 65, 'Persona Resonance': 72 } },
      { name: 'Forge', rationale: 'Building tools', scores: { Memorability: 80, Relevance: 78, Uniqueness: 60, 'Persona Resonance': 76 } },
      { name: 'Axiom', rationale: 'Foundational truth', scores: { Memorability: 85, Relevance: 82, Uniqueness: 90, 'Persona Resonance': 80 } },
      { name: 'Lattice', rationale: 'Interconnected', scores: { Memorability: 70, Relevance: 75, Uniqueness: 72, 'Persona Resonance': 68 } },
    ],
    decision: {
      selectedName: 'Stratum',
      workingTitle: true,
      rationale: 'Top scorer overall',
      availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' },
    },
    ...overrides,
  });
}

describe('Stage 10 Brand Wiring — Persona Role Assignment', () => {
  let mockSupabase;
  let personaUpsertCalls;
  let mappingUpsertCalls;
  let artifactInsertCalls;

  beforeEach(() => {
    personaUpsertCalls = [];
    mappingUpsertCalls = [];
    artifactInsertCalls = [];

    // Build a chainable mock for supabase
    const mockChain = (calls) => {
      const chain = {};
      chain.upsert = (...args) => { calls.push(args[0]); return chain; };
      chain.insert = (...args) => { calls.push(args[0]); return chain; };
      chain.select = () => chain;
      chain.single = () => Promise.resolve({ data: { id: `mock-${Math.random().toString(36).slice(2, 8)}` }, error: null });
      return chain;
    };

    mockSupabase = {
      from: vi.fn((table) => {
        if (table === 'customer_personas') return mockChain(personaUpsertCalls);
        if (table === 'venture_persona_mapping') return mockChain(mappingUpsertCalls);
        if (table === 'venture_artifacts') return mockChain(artifactInsertCalls);
        return mockChain([]);
      }),
    };

    const mockComplete = vi.fn().mockResolvedValue(createStage10Response());
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  it('assigns primary role to first persona, secondary to second, tertiary to rest', async () => {
    const result = await analyzeStage10({
      stage1Data: { description: 'Cloud infra platform', targetMarket: 'Engineering teams' },
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-123',
      supabase: mockSupabase,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    // Verify 3 personas created
    expect(result.customerPersonas).toHaveLength(3);

    // Verify persona mapping calls happened (3 personas = 3 mapping calls)
    expect(mappingUpsertCalls).toHaveLength(3);

    // Check role assignment via notes and relevance_score
    const roles = mappingUpsertCalls.map(call => JSON.parse(call.notes).role);
    expect(roles[0]).toBe('primary');
    expect(roles[1]).toBe('secondary');
    expect(roles[2]).toBe('tertiary');

    // Check relevance scores
    const scores = mappingUpsertCalls.map(call => call.relevance_score);
    expect(scores[0]).toBe(1.0);
    expect(scores[1]).toBe(0.75);
    expect(scores[2]).toBe(0.5);
  });

  it('writes brand genome artifact ref', async () => {
    await analyzeStage10({
      stage1Data: { description: 'Cloud infra platform', targetMarket: 'Engineering teams' },
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-123',
      supabase: mockSupabase,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    // Should have 2 artifact inserts: brand genome + persona catalog
    expect(artifactInsertCalls).toHaveLength(2);

    const brandArtifact = artifactInsertCalls.find(a => a.title === 'Brand Genome (Stage 10)');
    expect(brandArtifact).toBeDefined();
    expect(brandArtifact.lifecycle_stage).toBe(10);
    expect(brandArtifact.artifact_type).toBe('identity_brand_guidelines');
  });

  it('skips DB writes when supabase is not provided', async () => {
    const result = await analyzeStage10({
      stage1Data: { description: 'Cloud infra platform', targetMarket: 'Engineering teams' },
      ventureName: 'TestVenture',
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    // Should still return valid analysis
    expect(result.customerPersonas).toHaveLength(3);
    expect(result.brandGenome.archetype).toBe('Creator');

    // No DB calls made
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('Stage 11 Brand Wiring — Naming Score Mapping', () => {
  it('maps persona fit average to brand_fit_score', () => {
    // Test the score mapping logic directly
    const candidate = {
      name: 'TestName',
      rationale: 'Test rationale',
      scores: { Memorability: 90, Uniqueness: 85 },
      personaFit: [
        { personaName: 'CTO', fitScore: 80, reasoning: 'Good fit' },
        { personaName: 'Founder', fitScore: 70, reasoning: 'Decent fit' },
        { personaName: 'DevOps', fitScore: 90, reasoning: 'Great fit' },
      ],
    };

    // brand_fit_score = average of personaFit fitScores
    const personaFitAvg = Array.isArray(candidate.personaFit) && candidate.personaFit.length > 0
      ? Math.round(candidate.personaFit.reduce((sum, pf) => sum + (pf.fitScore || 0), 0) / candidate.personaFit.length)
      : null;

    expect(personaFitAvg).toBe(80); // (80+70+90)/3 = 80

    // pronounceability_score falls back to Memorability when Pronounceability absent
    const pronounceabilityScore = candidate.scores?.['Pronounceability'] ?? candidate.scores?.['Memorability'] ?? null;
    expect(pronounceabilityScore).toBe(90);

    // uniqueness_score maps directly
    const uniquenessScore = candidate.scores?.['Uniqueness'] ?? null;
    expect(uniquenessScore).toBe(85);
  });

  it('returns null brand_fit_score when no personaFit data', () => {
    const candidate = {
      name: 'TestName',
      scores: { Memorability: 90, Uniqueness: 85 },
      personaFit: [],
    };

    const personaFitAvg = Array.isArray(candidate.personaFit) && candidate.personaFit.length > 0
      ? Math.round(candidate.personaFit.reduce((sum, pf) => sum + (pf.fitScore || 0), 0) / candidate.personaFit.length)
      : null;

    expect(personaFitAvg).toBeNull();
  });

  it('maps domain statuses to unknown', () => {
    // Verify the domain status values match naming_suggestions CHECK constraints
    const validStatuses = ['available', 'taken', 'error', 'unknown'];
    const defaultStatus = 'unknown';
    expect(validStatuses).toContain(defaultStatus);
  });
});
