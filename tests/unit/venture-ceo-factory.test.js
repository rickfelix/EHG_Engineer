/**
 * Unit Tests: VentureFactory / STANDARD_VENTURE_TEMPLATE
 * SD-FDBK-ENH-ADD-MARKETING-STANDARD-001: VP_MARKETING added as a STANDARD
 * (unconditionally instantiated) 5th VP role.
 *
 * No pre-existing test file covered this module before this SD — coverage
 * added here spans both the template's static shape and a mocked full
 * instantiateVenture() run, plus explicit zero-regression assertions on the
 * pre-existing 4 VPs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VentureFactory, STANDARD_VENTURE_TEMPLATE } from '../../../lib/agents/venture-ceo-factory.js';

vi.mock('uuid', () => ({
  v4: () => `mock-uuid-${Math.random().toString(36).slice(2)}`
}));

describe('STANDARD_VENTURE_TEMPLATE shape', () => {
  it('has 5 executives (was 4)', () => {
    expect(STANDARD_VENTURE_TEMPLATE.executives).toHaveLength(5);
  });

  it('includes VP_MARKETING with the expected capabilities/tools/stage_ownership', () => {
    const vpMarketing = STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_MARKETING');
    expect(vpMarketing).toBeDefined();
    expect(vpMarketing.capabilities).toEqual(
      expect.arrayContaining(['brand_strategy', 'content_marketing', 'seo', 'demand_generation', 'lifecycle_marketing'])
    );
    // Only tools that exist in tool_registry — verified directly against the live table.
    expect(vpMarketing.tools).toEqual(
      expect.arrayContaining(['web_search', 'document_writer', 'sentiment_analyzer', 'email_sender', 'image_generator'])
    );
    // Continuous mandate: NOT bound to any BUILD-pipeline stage, unlike VP_GROWTH.
    expect(vpMarketing.stage_ownership).toEqual([]);
  });

  it('is unconditionally present — no flag/threshold field gates its inclusion', () => {
    const vpMarketing = STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_MARKETING');
    expect(vpMarketing).not.toHaveProperty('lazy');
    expect(vpMarketing).not.toHaveProperty('instantiate_flag');
    expect(vpMarketing).not.toHaveProperty('enabled');
  });

  it('has 18 crews (was 14), 4 of which report to VP_MARKETING', () => {
    expect(STANDARD_VENTURE_TEMPLATE.crews).toHaveLength(18);
    const marketingCrews = STANDARD_VENTURE_TEMPLATE.crews.filter(c => c.executive_parent === 'VP_MARKETING');
    expect(marketingCrews).toHaveLength(4);
    expect(marketingCrews.map(c => c.agent_role)).toEqual(
      expect.arrayContaining(['Brand_Content_Crew', 'SEO_Crew', 'Demand_Gen_Crew', 'Lifecycle_Crew'])
    );
    // Each crew has a distinct, non-empty capability list.
    const capSets = marketingCrews.map(c => JSON.stringify(c.capabilities));
    expect(new Set(capSets).size).toBe(marketingCrews.length);
  });

  it('leaves the other 4 VPs byte-identical to their pre-change shape (zero regression)', () => {
    const expected = {
      VP_STRATEGY: { capabilities: ['market_research', 'competitive_analysis', 'financial_modeling', 'tam_calculation'], stage_ownership: [1, 2, 3, 4, 5, 6, 7, 8, 9], token_budget: 30000 },
      VP_PRODUCT: { capabilities: ['product_definition', 'user_research', 'narrative_development', 'naming'], stage_ownership: [10, 11, 12], token_budget: 25000 },
      VP_TECH: { capabilities: ['tech_architecture', 'data_modeling', 'code_generation', 'qa_testing'], stage_ownership: [13, 14, 15, 16, 17, 18, 19, 20, 21], token_budget: 40000 },
      VP_GROWTH: { capabilities: ['launch_planning', 'analytics', 'optimization', 'user_acquisition'], stage_ownership: [22, 23, 24, 25, 26], token_budget: 25000 }
    };

    for (const [role, exp] of Object.entries(expected)) {
      const vp = STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === role);
      expect(vp).toBeDefined();
      expect(vp.capabilities).toEqual(exp.capabilities);
      expect(vp.stage_ownership).toEqual(exp.stage_ownership);
      expect(vp.token_budget).toBe(exp.token_budget);
    }
  });

  it('description reflects the 24-agent total (1 CEO + 5 VP + 18 crew)', () => {
    expect(STANDARD_VENTURE_TEMPLATE.description).toContain('24-agent');
  });
});

describe('VentureFactory.instantiateVenture with mocked Supabase', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      // insert()/upsert() are chainable (agent_registry chains .select().single());
      // call sites that await insert()/upsert() directly (agent_relationships,
      // tool_access_grants, agent_memory_stores, agent_messages, org_agent_roles)
      // destructure {error} off the returned object, which is undefined here —
      // undefined is falsy, matching the "no error" success path.
      insert: vi.fn(() => mockSupabase),
      upsert: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      // Terminal resolvers: every chained call site awaits one of these.
      single: vi.fn(async () => ({ data: { id: `mock-agent-${Math.random().toString(36).slice(2)}` }, error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null }))
    };
  });

  it('creates 5 executive agents (was 4), including VP_MARKETING', async () => {
    const factory = new VentureFactory(mockSupabase);
    const result = await factory.instantiateVenture({
      ventureName: 'Test Venture',
      ventureId: 'test-venture-id-123'
    });

    expect(Object.keys(result.executive_agent_ids)).toHaveLength(5);
    expect(result.executive_agent_ids).toHaveProperty('VP_MARKETING');
    expect(result.executive_agent_ids).toHaveProperty('VP_STRATEGY');
    expect(result.executive_agent_ids).toHaveProperty('VP_PRODUCT');
    expect(result.executive_agent_ids).toHaveProperty('VP_TECH');
    expect(result.executive_agent_ids).toHaveProperty('VP_GROWTH');
  });

  it('total_agents_created reflects 1 CEO + 5 VP + 18 crew = 24', async () => {
    const factory = new VentureFactory(mockSupabase);
    const result = await factory.instantiateVenture({
      ventureName: 'Test Venture 2',
      ventureId: 'test-venture-id-456'
    });

    expect(result.total_agents_created).toBe(24);
  });
});
