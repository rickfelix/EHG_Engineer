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
import { VentureFactory, STANDARD_VENTURE_TEMPLATE, EHG_SHARED_OPERATORS } from '../../lib/agents/venture-ceo-factory.js';

vi.mock('uuid', () => ({
  v4: () => `mock-uuid-${Math.random().toString(36).slice(2)}`
}));

describe('STANDARD_VENTURE_TEMPLATE shape', () => {
  it('has 6 executives (was 5)', () => {
    expect(STANDARD_VENTURE_TEMPLATE.executives).toHaveLength(6);
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

  it('has 21 crews (was 18), 4 of which report to VP_MARKETING', () => {
    expect(STANDARD_VENTURE_TEMPLATE.crews).toHaveLength(21);
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

  it('description reflects the 28-agent per-venture total (1 CEO + 6 VP + 21 crew)', () => {
    expect(STANDARD_VENTURE_TEMPLATE.description).toContain('28-agent');
  });
});

describe('SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 — org-template delta', () => {
  const NEW_ROLES_MUST_HAVE_DUTY = ['VP_CUSTOMER', 'Sales_Crew', 'Customer_Success_Crew', 'Support_Crew'];

  it('FR-1: VP_CUSTOMER is a standard per-venture executive with a continuous mandate + duty cycle + honest idle', () => {
    const vp = STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_CUSTOMER');
    expect(vp).toBeDefined();
    expect(vp.stage_ownership).toEqual([]); // continuous, like VP_MARKETING
    expect(vp.duty_cycle).toBeTruthy();
    expect(vp.honest_idle).toBeTruthy();
    expect(vp).not.toHaveProperty('lazy'); // unconditional, no gating flag
  });

  it('FR-1: Customer_Success_Crew + Support_Crew report to VP_CUSTOMER with duty cycles', () => {
    const cust = STANDARD_VENTURE_TEMPLATE.crews.filter(c => c.executive_parent === 'VP_CUSTOMER');
    expect(cust.map(c => c.agent_role).sort()).toEqual(['Customer_Success_Crew', 'Support_Crew']);
    for (const c of cust) { expect(c.duty_cycle).toBeTruthy(); expect(c.honest_idle).toBeTruthy(); }
  });

  it('FR-2: Sales_Crew is a crew (not a VP) under VP_GROWTH with duty cycle + honest idle', () => {
    const sales = STANDARD_VENTURE_TEMPLATE.crews.find(c => c.agent_role === 'Sales_Crew');
    expect(sales).toBeDefined();
    expect(sales.executive_parent).toBe('VP_GROWTH');
    expect(sales.duty_cycle).toMatch(/outreach/i);
    expect(sales.honest_idle).toMatch(/suppression|no outreach/i);
    expect(STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_SALES')).toBeUndefined();
  });

  it('FR-3: the 3 mandate extensions retire the every-mandate-ends-at-a-stage defect', () => {
    for (const role of ['VP_TECH', 'VP_PRODUCT', 'VP_GROWTH']) {
      const vp = STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === role);
      expect(vp.post_stage_mandate, `${role} must carry a post_stage_mandate`).toBeTruthy();
      expect(vp.honest_idle, `${role} mandate extension needs an honest-idle`).toBeTruthy();
    }
    // stage_ownership arrays are UNCHANGED (additive field only — no routing change).
    expect(STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_TECH').stage_ownership).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(STANDARD_VENTURE_TEMPLATE.executives.find(e => e.agent_role === 'VP_GROWTH').stage_ownership).toEqual([22, 23, 24, 25, 26]);
  });

  it('FR-4: EHG_SHARED_OPERATORS exports the 5 named commodity operators (incl. RESEARCH_INTELLIGENCE_OPERATOR), instantiate-once', () => {
    expect(Array.isArray(EHG_SHARED_OPERATORS)).toBe(true);
    expect(EHG_SHARED_OPERATORS.map(o => o.agent_role).sort()).toEqual(
      ['DATA_PLATFORM_OPERATOR', 'FINANCE_BILLING_OPERATOR', 'LEGAL_COMPLIANCE_OPERATOR', 'RESEARCH_INTELLIGENCE_OPERATOR', 'SECURITY_POSTURE_OPERATOR']
    );
    for (const op of EHG_SHARED_OPERATORS) {
      expect(op.placement).toBe('shared'); // chairman-ratified default
      expect(op.duty_cycle).toBeTruthy();
      expect(op.honest_idle).toBeTruthy();
    }
    // SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A: the 5th operator ships defined-but-unarmed.
    const research = EHG_SHARED_OPERATORS.find(o => o.agent_role === 'RESEARCH_INTELLIGENCE_OPERATOR');
    expect(research).toBeTruthy();
    expect(research.armed).toBe(false);
    // They are SEPARATE from the per-venture template (instantiate once at holdco level).
    const perVentureRoles = STANDARD_VENTURE_TEMPLATE.executives.map(e => e.agent_role);
    for (const op of EHG_SHARED_OPERATORS) expect(perVentureRoles).not.toContain(op.agent_role);
  });

  it('FR-5 anti-decoration guard: every new role has a NON-EMPTY duty_cycle AND honest_idle', () => {
    const newVentureRoles = [
      ...STANDARD_VENTURE_TEMPLATE.executives.filter(e => NEW_ROLES_MUST_HAVE_DUTY.includes(e.agent_role)),
      ...STANDARD_VENTURE_TEMPLATE.crews.filter(c => NEW_ROLES_MUST_HAVE_DUTY.includes(c.agent_role)),
      ...EHG_SHARED_OPERATORS
    ];
    expect(newVentureRoles.length).toBeGreaterThanOrEqual(8);
    for (const r of newVentureRoles) {
      expect(typeof r.duty_cycle === 'string' && r.duty_cycle.trim().length > 0, `${r.agent_role} duty_cycle`).toBe(true);
      expect(typeof r.honest_idle === 'string' && r.honest_idle.trim().length > 0, `${r.agent_role} honest_idle`).toBe(true);
    }
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

  it('creates 6 executive agents (was 5), including VP_CUSTOMER', async () => {
    const factory = new VentureFactory(mockSupabase);
    const result = await factory.instantiateVenture({
      ventureName: 'Test Venture',
      ventureId: 'test-venture-id-123'
    });

    expect(Object.keys(result.executive_agent_ids)).toHaveLength(6);
    expect(result.executive_agent_ids).toHaveProperty('VP_MARKETING');
    expect(result.executive_agent_ids).toHaveProperty('VP_CUSTOMER');
    expect(result.executive_agent_ids).toHaveProperty('VP_STRATEGY');
    expect(result.executive_agent_ids).toHaveProperty('VP_PRODUCT');
    expect(result.executive_agent_ids).toHaveProperty('VP_TECH');
    expect(result.executive_agent_ids).toHaveProperty('VP_GROWTH');
  });

  it('total_agents_created reflects 1 CEO + 6 VP + 21 crew = 28', async () => {
    const factory = new VentureFactory(mockSupabase);
    const result = await factory.instantiateVenture({
      ventureName: 'Test Venture 2',
      ventureId: 'test-venture-id-456'
    });

    expect(result.total_agents_created).toBe(28);
  });
});
