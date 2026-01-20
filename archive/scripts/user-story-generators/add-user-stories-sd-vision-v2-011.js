#!/usr/bin/env node
/**
 * Add User Stories for SD-VISION-V2-011
 * Vision V2: EVA Backend Intelligence
 *
 * Creates user stories for moving generateProactiveInsight from frontend heuristics
 * to EVA backend orchestration with real multi-agent insight aggregation.
 *
 * Functional Requirements Mapping:
 * - FR-1: Create EVA Insight Service (evaInsightService.ts) → US-001, US-002
 * - FR-2: Create Chairman Insights API Endpoint (GET /api/v2/chairman/insights) → US-003
 * - FR-3: Replace Frontend Heuristics (update useChairmanDashboardData.ts) → US-004
 * - FR-4: Multi-Agent Insight Aggregation → US-005, US-006
 * - FR-5: EVA Event Bus Integration → US-007
 *
 * Context:
 * - Currently generateProactiveInsight is a frontend function generating fake insights
 * - EVA should provide real intelligence based on actual venture data, agent messages, portfolio analysis
 * - This SD builds on SD-VISION-V2-010 (real metrics) and SD-VISION-V2-009 (unified decision data)
 *
 * Files to Create:
 * - src/services/evaInsightService.ts - Multi-agent insight aggregation service
 * - pages/api/v2/chairman/insights.ts - API endpoint for EVA insights
 *
 * Files to Modify:
 * - src/hooks/useChairmanDashboardData.ts - Replace mock with API call
 * - src/services/evaOrchestrator.ts - Integrate insight service (if exists)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VISION-V2-011';
const _PRD_ID = 'PRD-SD-VISION-V2-011';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-VISION-V2-011:US-001',
    prd_id: null,  // PRD may not exist yet
    sd_id: SD_ID,
    title: 'Create EVA Insight Service foundation with data source connections',
    user_role: 'System',
    user_want: 'A backend service that aggregates insights from multiple data sources (ventures, agents, budgets, decisions)',
    user_benefit: 'EVA can generate intelligent insights based on real data instead of frontend heuristics',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Service initialization - Happy path',
        given: 'EVA Insight Service is instantiated',
        when: 'Service initializes',
        then: 'Service connects to Supabase client AND loads configuration (insight priorities, thresholds) AND initializes data source connections (ventures, agents, budgets, decisions)'
      },
      {
        id: 'AC-001-2',
        scenario: 'Data source queries - Ventures',
        given: 'Chairman has 3 active ventures with different statuses',
        when: 'Service queries venture data source',
        then: 'Returns ventures with id, name, status, stage, budget_status, last_updated AND includes RLS filtering by chairman_id'
      },
      {
        id: 'AC-001-3',
        scenario: 'Data source queries - Agent activity',
        given: 'Agent registry has recent LEAD/PLAN/EXEC activity',
        when: 'Service queries agent data source',
        then: 'Returns agent activity with agent_id, venture_id, last_active, status, current_task AND filters to last 24 hours'
      },
      {
        id: 'AC-001-4',
        scenario: 'Data source queries - Budget warnings',
        given: 'Ventures have budget warnings from EVATokenBudgetManager',
        when: 'Service queries budget data source',
        then: 'Returns budget warnings with venture_id, threshold_type (85%/95%/100%), tokens_used, tokens_allocated, created_at'
      },
      {
        id: 'AC-001-5',
        scenario: 'Error handling - Database connection',
        given: 'Database connection fails',
        when: 'Service attempts data query',
        then: 'Logs error AND returns empty result set AND does not crash service'
      }
    ],
    definition_of_done: [
      'File created: src/services/evaInsightService.ts',
      'Class EVAInsightService with constructor and data source methods',
      'Methods: getVentureData(), getAgentActivity(), getBudgetWarnings(), getRecentDecisions()',
      'Supabase client integration with RLS filtering',
      'Error handling for all database queries',
      'Unit tests for each data source method',
      'TypeScript interfaces for all data source return types'
    ],
    technical_notes: 'Create new service file following existing service patterns (e.g., evaTokenBudget.ts). Use Supabase client from lib/supabase.ts. Implement data source methods as async functions. Consider caching for performance. Each data source should return typed results.',
    implementation_approach: 'Create EVAInsightService class. Constructor takes Supabase client. Implement 4 data source methods (ventures, agents, budgets, decisions). Each method queries relevant table and returns typed data. Add error handling and logging. Write unit tests for each method.',
    implementation_context: 'This service is the foundation for backend intelligence. It replaces frontend data fetching with centralized backend aggregation. Must be performant as it will be called frequently. RLS is critical for security.',
    architecture_references: [
      'src/services/evaTokenBudget.ts - Reference service pattern',
      'database/schema/ventures - Venture data table',
      'database/schema/agent_registry - Agent activity table',
      'database/schema/venture_budget_warnings - Budget warnings table',
      'database/schema/venture_decisions - Decision tracking table',
      'lib/supabase.ts - Supabase client configuration'
    ],
    example_code_patterns: {
      service_foundation: `// src/services/evaInsightService.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface VentureDataSource {
  id: string;
  name: string;
  status: string;
  stage: string;
  budget_utilization: number;
  last_updated: string;
}

export interface AgentActivitySource {
  agent_id: string;
  venture_id: string;
  last_active: string;
  status: string;
  current_task: string | null;
}

export class EVAInsightService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async getVentureData(chairmanId: string): Promise<VentureDataSource[]> {
    try {
      const { data, error } = await this.supabase
        .from('ventures')
        .select('id, name, status, stage, last_updated')
        .eq('chairman_id', chairmanId)
        .eq('status', 'active');

      if (error) throw error;

      // Enhance with budget utilization
      const venturesWithBudget = await Promise.all(
        (data || []).map(async (v) => {
          const budgetUtil = await this.getBudgetUtilization(v.id);
          return { ...v, budget_utilization: budgetUtil };
        })
      );

      return venturesWithBudget;
    } catch (err) {
      console.error('EVAInsightService.getVentureData error:', err);
      return [];
    }
  }

  async getAgentActivity(ventureId?: string): Promise<AgentActivitySource[]> {
    try {
      let query = this.supabase
        .from('agent_registry')
        .select('agent_id, venture_id, last_active, status, current_task')
        .gte('last_active', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (ventureId) {
        query = query.eq('venture_id', ventureId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (err) {
      console.error('EVAInsightService.getAgentActivity error:', err);
      return [];
    }
  }

  private async getBudgetUtilization(ventureId: string): Promise<number> {
    // Query budget tables for utilization percentage
    // Implementation details...
    return 0;
  }
}`,
      unit_test_example: `// src/services/__tests__/evaInsightService.test.ts
import { EVAInsightService } from '../evaInsightService';
import { createClient } from '@supabase/supabase-js';

describe('EVAInsightService', () => {
  let service: EVAInsightService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = createClient('mock-url', 'mock-key');
    service = new EVAInsightService(mockSupabase);
  });

  describe('getVentureData', () => {
    it('should return ventures for chairman', async () => {
      const mockData = [
        { id: 'v1', name: 'Test Venture', status: 'active', stage: 'execution' }
      ];

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockData, error: null })
          })
        })
      });

      const result = await service.getVentureData('chairman-123');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Venture');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection failed' }
            })
          })
        })
      });

      const result = await service.getVentureData('chairman-123');
      expect(result).toEqual([]);
    });
  });
});`
    },
    testing_scenarios: [
      { scenario: 'Service initialization and data source connections', type: 'unit', priority: 'P0' },
      { scenario: 'Venture data query with RLS filtering', type: 'integration', priority: 'P0' },
      { scenario: 'Agent activity aggregation', type: 'integration', priority: 'P1' },
      { scenario: 'Error handling for failed database queries', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-001-eva-insight-service.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-002',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Implement insight generation algorithms with prioritization',
    user_role: 'System',
    user_want: 'Generate actionable insights from aggregated data with intelligent prioritization',
    user_benefit: 'Chairman receives relevant, prioritized insights instead of random suggestions',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Budget warning insights',
        given: 'Venture has budget_utilization >= 85%',
        when: 'generateInsights() is called',
        then: 'Insight generated with type: "budget_warning", severity: "high", message includes venture name and utilization percentage, actionItems include "Review budget allocation"'
      },
      {
        id: 'AC-002-2',
        scenario: 'Stale venture insights',
        given: 'Venture has no agent activity in last 7 days',
        when: 'generateInsights() is called',
        then: 'Insight generated with type: "stale_venture", severity: "medium", message: "Venture X has been inactive", actionItems include "Review venture status"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Agent bottleneck insights',
        given: '5+ ventures assigned to same agent AND agent status = "overloaded"',
        when: 'generateInsights() is called',
        then: 'Insight generated with type: "agent_bottleneck", severity: "high", message includes agent_id and venture count, actionItems include "Consider load balancing"'
      },
      {
        id: 'AC-002-4',
        scenario: 'Decision pending insights',
        given: 'Venture has decision with status = "pending" for > 48 hours',
        when: 'generateInsights() is called',
        then: 'Insight generated with type: "decision_pending", severity: "medium", message includes decision title and age, actionItems include "Review pending decision"'
      },
      {
        id: 'AC-002-5',
        scenario: 'Insight prioritization',
        given: 'Multiple insights generated (budget warning, stale venture, decision pending)',
        when: 'Insights are prioritized',
        then: 'Insights sorted by: severity (high > medium > low), then recency, then impact score AND top 5 insights returned'
      },
      {
        id: 'AC-002-6',
        scenario: 'No insights available',
        given: 'All ventures healthy, no warnings, no pending items',
        when: 'generateInsights() is called',
        then: 'Returns insight with type: "all_clear", severity: "info", message: "Portfolio operating smoothly"'
      }
    ],
    definition_of_done: [
      'EVAInsightService.generateInsights() method implemented',
      'Insight generation algorithms for 5+ insight types',
      'Prioritization algorithm based on severity + recency + impact',
      'TypeScript interface for InsightResult with type, severity, message, actionItems',
      'Unit tests for each insight type',
      'Integration test for full insight generation pipeline',
      'Documentation of insight types and prioritization logic'
    ],
    technical_notes: 'Implement insight generation using data from US-001. Each insight type has detection logic, message template, and action items. Prioritization uses weighted scoring: severity (50%), recency (30%), impact (20%). Consider configurable thresholds.',
    implementation_approach: 'Add generateInsights() method to EVAInsightService. Call all data source methods. Apply insight detection algorithms. Generate InsightResult objects. Sort by priority. Return top N insights. Use template strings for messages.',
    implementation_context: 'Insight generation is the core intelligence of EVA. Must be fast (<1s) and accurate. Messages should be actionable. Prioritization ensures Chairman sees most important items first.',
    architecture_references: [
      'src/services/evaInsightService.ts - Add generateInsights() method',
      'database/schema/venture_budget_warnings - Budget insight source',
      'database/schema/agent_registry - Agent activity insight source',
      'database/schema/venture_decisions - Decision insight source'
    ],
    example_code_patterns: {
      insight_interface: `export interface InsightResult {
  id: string;
  type: InsightType;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  actionItems: string[];
  relatedVentureIds: string[];
  priority: number;
  createdAt: string;
  metadata?: Record<string, any>;
}

export type InsightType =
  | 'budget_warning'
  | 'stale_venture'
  | 'agent_bottleneck'
  | 'decision_pending'
  | 'all_clear';`,
      insight_generation: `async generateInsights(chairmanId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];

  // Gather data from all sources
  const ventures = await this.getVentureData(chairmanId);
  const agentActivity = await this.getAgentActivity();
  const budgetWarnings = await this.getBudgetWarnings(chairmanId);
  const pendingDecisions = await this.getPendingDecisions(chairmanId);

  // Generate budget warning insights
  for (const warning of budgetWarnings) {
    if (warning.threshold_type === 'exceeded') {
      insights.push({
        id: \`budget-\${warning.venture_id}\`,
        type: 'budget_warning',
        severity: 'critical',
        title: 'Budget Exceeded',
        message: \`Venture "\${warning.venture_name}" has exceeded token budget (\${warning.utilization}%)\`,
        actionItems: [
          'Review venture budget allocation',
          'Consider pausing non-critical operations',
          'Investigate high token consumption'
        ],
        relatedVentureIds: [warning.venture_id],
        priority: this.calculatePriority('critical', warning.created_at, 100),
        createdAt: new Date().toISOString()
      });
    }
  }

  // Generate stale venture insights
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (const venture of ventures) {
    const lastActivity = agentActivity.find(a => a.venture_id === venture.id);
    if (!lastActivity || new Date(lastActivity.last_active).getTime() < sevenDaysAgo) {
      insights.push({
        id: \`stale-\${venture.id}\`,
        type: 'stale_venture',
        severity: 'medium',
        title: 'Inactive Venture',
        message: \`Venture "\${venture.name}" has been inactive for 7+ days\`,
        actionItems: [
          'Review venture status',
          'Check for blockers',
          'Consider archiving if complete'
        ],
        relatedVentureIds: [venture.id],
        priority: this.calculatePriority('medium', venture.last_updated, 60),
        createdAt: new Date().toISOString()
      });
    }
  }

  // Sort by priority and return top 5
  insights.sort((a, b) => b.priority - a.priority);
  return insights.slice(0, 5);
}`,
      prioritization: `private calculatePriority(
  severity: InsightResult['severity'],
  timestamp: string,
  impactScore: number
): number {
  const severityWeights = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
    info: 10
  };

  const severityScore = severityWeights[severity] * 0.5;

  const ageInHours = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 100 - ageInHours) * 0.3;

  const impactWeight = impactScore * 0.2;

  return severityScore + recencyScore + impactWeight;
}`
    },
    testing_scenarios: [
      { scenario: 'Budget warning insight generation', type: 'unit', priority: 'P0' },
      { scenario: 'Stale venture detection', type: 'unit', priority: 'P0' },
      { scenario: 'Insight prioritization algorithm', type: 'unit', priority: 'P1' },
      { scenario: 'Full insight pipeline with real data', type: 'integration', priority: 'P0' }
    ],
    e2e_test_path: 'tests/integration/services/US-002-insight-generation.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-003',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Create Chairman Insights API endpoint',
    user_role: 'Frontend Developer',
    user_want: 'A RESTful API endpoint to fetch EVA-generated insights for the Chairman dashboard',
    user_benefit: 'Frontend can display real backend intelligence instead of mock data',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Get insights',
        given: 'Chairman is authenticated AND insights are available',
        when: 'GET /api/v2/chairman/insights is called',
        then: 'Returns 200 status AND JSON array of InsightResult objects AND includes top 5 insights sorted by priority'
      },
      {
        id: 'AC-003-2',
        scenario: 'Authentication required',
        given: 'Request has no authentication token',
        when: 'API endpoint is called',
        then: 'Returns 401 status AND error message: "Authentication required"'
      },
      {
        id: 'AC-003-3',
        scenario: 'RLS enforcement',
        given: 'Chairman A is authenticated',
        when: 'API is called',
        then: 'Returns only insights for Chairman A\'s ventures AND does not include other chairmen\'s data'
      },
      {
        id: 'AC-003-4',
        scenario: 'No insights available',
        given: 'EVAInsightService returns empty array',
        when: 'API endpoint is called',
        then: 'Returns 200 status AND JSON with single "all_clear" insight'
      },
      {
        id: 'AC-003-5',
        scenario: 'Service error handling',
        given: 'EVAInsightService throws error',
        when: 'API endpoint is called',
        then: 'Returns 500 status AND error logged AND generic error message returned (no internal details exposed)'
      }
    ],
    definition_of_done: [
      'File created: pages/api/v2/chairman/insights.ts',
      'GET endpoint handler implemented',
      'Authentication middleware integrated',
      'EVAInsightService instantiated and called',
      'Error handling for service failures',
      'API response follows standard format: { success: boolean, data: InsightResult[], error?: string }',
      'Unit tests for API endpoint',
      'API documentation added'
    ],
    technical_notes: 'Follow Next.js API route pattern. Use middleware for authentication. Extract chairman_id from session/token. Instantiate EVAInsightService with Supabase client. Call generateInsights(). Return JSON response.',
    implementation_approach: 'Create Next.js API route at pages/api/v2/chairman/insights.ts. Export default handler function. Verify authentication. Get chairman_id. Create EVAInsightService instance. Call generateInsights(chairmanId). Return JSON response. Add error handling.',
    implementation_context: 'API endpoint bridges frontend and backend intelligence. Must be secure (authentication + RLS). Response time critical (<2s). Follows existing API patterns in pages/api/.',
    architecture_references: [
      'pages/api/ventures.ts - Reference API route pattern',
      'pages/api/compliance/summary.ts - Reference authentication pattern',
      'src/services/evaInsightService.ts - Service to call',
      'lib/supabase.ts - Supabase client for API routes'
    ],
    example_code_patterns: {
      api_endpoint: `// pages/api/v2/chairman/insights.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { EVAInsightService } from '@/services/evaInsightService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Create Supabase client with user's JWT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication'
      });
    }

    // Get chairman_id from user metadata or ventures table
    const { data: chairman } = await supabase
      .from('ventures')
      .select('chairman_id')
      .eq('chairman_id', user.id)
      .limit(1)
      .single();

    const chairmanId = chairman?.chairman_id || user.id;

    // Generate insights using EVA service
    const insightService = new EVAInsightService(supabase);
    const insights = await insightService.generateInsights(chairmanId);

    // Return insights
    return res.status(200).json({
      success: true,
      data: insights,
      metadata: {
        count: insights.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Chairman insights API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate insights'
    });
  }
}`,
      api_test: `// pages/api/v2/__tests__/chairman-insights.test.ts
import handler from '../chairman/insights';
import { createMocks } from 'node-mocks-http';

describe('/api/v2/chairman/insights', () => {
  it('should return 401 without authentication', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      success: false,
      error: 'Authentication required'
    });
  });

  it('should return insights for authenticated chairman', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer mock-jwt-token'
      }
    });

    // Mock Supabase client and service
    // ...

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});`
    },
    testing_scenarios: [
      { scenario: 'Authenticated request returns insights', type: 'e2e', priority: 'P0' },
      { scenario: 'Unauthenticated request rejected', type: 'unit', priority: 'P0' },
      { scenario: 'RLS filtering validated', type: 'integration', priority: 'P1' },
      { scenario: 'Error handling for service failures', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/api/chairman/US-003-insights-endpoint.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-004',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Replace frontend generateProactiveInsight with API call',
    user_role: 'Chairman',
    user_want: 'See real backend-generated insights instead of frontend mock data',
    user_benefit: 'I receive accurate, actionable recommendations based on actual portfolio state',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Locate and remove frontend mock',
        given: 'generateProactiveInsight function exists in codebase',
        when: 'Code search is performed',
        then: 'Function is located AND documented AND marked for removal'
      },
      {
        id: 'AC-004-2',
        scenario: 'Replace with API call',
        given: 'Frontend hook or component uses generateProactiveInsight',
        when: 'Code is refactored',
        then: 'Mock function replaced with fetch(/api/v2/chairman/insights) AND response typed as InsightResult[] AND loading/error states handled'
      },
      {
        id: 'AC-004-3',
        scenario: 'Dashboard displays real insights',
        given: 'Chairman loads dashboard',
        when: 'Insights are fetched from API',
        then: 'Real insights displayed AND no mock data shown AND insights update on page refresh'
      },
      {
        id: 'AC-004-4',
        scenario: 'Loading state',
        given: 'API request is in flight',
        when: 'Dashboard is rendering',
        then: 'Loading indicator shown AND previous insights not cleared until new data arrives'
      },
      {
        id: 'AC-004-5',
        scenario: 'Error state',
        given: 'API request fails',
        when: 'Error occurs',
        then: 'Error message shown: "Unable to load insights" AND retry option available AND error logged to console'
      }
    ],
    definition_of_done: [
      'generateProactiveInsight function removed from codebase',
      'Frontend replaced with API call to /api/v2/chairman/insights',
      'Loading and error states implemented',
      'TypeScript types match InsightResult interface',
      'No hardcoded/mock insights remain',
      'E2E test validates real data flow',
      'Code review confirms no frontend heuristics'
    ],
    technical_notes: 'Locate generateProactiveInsight (likely in hooks/ or utils/). Replace with fetch() or React Query. Handle loading/error states. Remove mock data. Ensure type safety.',
    implementation_approach: 'Find generateProactiveInsight usage. Create new hook useChairmanInsights() that calls API. Replace mock function with API hook. Add loading/error UI. Test data flow. Remove old code.',
    implementation_context: 'This completes the migration from frontend heuristics to backend intelligence. Critical to maintain UI/UX during transition. Must handle network errors gracefully.',
    architecture_references: [
      'src/hooks/useChairmanDashboardData.ts - Likely location of mock (if exists)',
      'pages/api/v2/chairman/insights.ts - API to call',
      'src/services/evaInsightService.ts - Backend service powering API'
    ],
    example_code_patterns: {
      new_hook: `// src/hooks/useChairmanInsights.ts
import { useState, useEffect } from 'react';
import { InsightResult } from '@/services/evaInsightService';

export function useChairmanInsights() {
  const [insights, setInsights] = useState<InsightResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInsights() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/v2/chairman/insights', {
          headers: {
            'Authorization': \`Bearer \${getAuthToken()}\`
          }
        });

        if (!response.ok) {
          throw new Error(\`API error: \${response.status}\`);
        }

        const result = await response.json();

        if (result.success) {
          setInsights(result.data);
        } else {
          throw new Error(result.error || 'Failed to fetch insights');
        }
      } catch (err) {
        console.error('useChairmanInsights error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchInsights();
  }, []);

  return { insights, loading, error, refetch: fetchInsights };
}`,
      component_usage: `// Replace in dashboard component
// BEFORE:
const insight = generateProactiveInsight(ventures);

// AFTER:
const { insights, loading, error } = useChairmanInsights();

// In JSX:
{loading && <LoadingSpinner />}
{error && <ErrorMessage message={error} onRetry={refetch} />}
{!loading && !error && insights.map(insight => (
  <InsightCard key={insight.id} insight={insight} />
))}`
    },
    testing_scenarios: [
      { scenario: 'Dashboard loads real insights from API', type: 'e2e', priority: 'P0' },
      { scenario: 'Loading state displayed during fetch', type: 'e2e', priority: 'P1' },
      { scenario: 'Error state handled gracefully', type: 'e2e', priority: 'P1' },
      { scenario: 'No mock data in production build', type: 'verification', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/chairman/US-004-real-insights-display.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-005',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Add multi-agent message aggregation for insights',
    user_role: 'System',
    user_want: 'Aggregate messages and status updates from LEAD, PLAN, and EXEC agents to generate insights',
    user_benefit: 'Insights reflect real agent activity and collaboration patterns',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Agent message aggregation',
        given: 'Agent registry has messages from LEAD, PLAN, EXEC agents',
        when: 'EVAInsightService aggregates agent data',
        then: 'Messages grouped by agent type AND recent activity summarized AND collaboration patterns identified'
      },
      {
        id: 'AC-005-2',
        scenario: 'Agent collaboration insight',
        given: 'LEAD agent approved task AND PLAN agent created PRD AND EXEC agent started implementation',
        when: 'Insight generation runs',
        then: 'Insight generated: "Venture X showing healthy agent collaboration" with type: "agent_collaboration", severity: "info"'
      },
      {
        id: 'AC-005-3',
        scenario: 'Agent stuck insight',
        given: 'EXEC agent has status="blocked" for > 24 hours',
        when: 'Insight generation runs',
        then: 'Insight generated: "Agent blocked on Venture X" with type: "agent_blocked", severity: "high", actionItems include "Review blocker"'
      },
      {
        id: 'AC-005-4',
        scenario: 'LEAD approval delay insight',
        given: 'PLAN agent completed PRD AND LEAD approval pending for > 48 hours',
        when: 'Insight generation runs',
        then: 'Insight generated: "LEAD approval pending for Venture X" with type: "approval_delay", severity: "medium"'
      }
    ],
    definition_of_done: [
      'EVAInsightService.getAgentMessages() method implemented',
      'Agent message aggregation by type (LEAD/PLAN/EXEC)',
      'Collaboration pattern detection algorithm',
      'Insights for: collaboration, blocked agents, approval delays',
      'Unit tests for agent message aggregation',
      'Integration test with real agent_registry data'
    ],
    technical_notes: 'Query agent_registry for recent messages. Group by agent_type and venture_id. Detect patterns: healthy collaboration (all agents active), blocked (agent stuck), approval delays (LEAD not responding). Generate insights.',
    implementation_approach: 'Add getAgentMessages() to EVAInsightService. Query agent_registry with status, current_task, last_active. Analyze patterns. Generate insights based on collaboration health, blockers, delays.',
    implementation_context: 'Multi-agent insights are unique to LEO protocol. Shows Chairman the health of agent collaboration. Critical for identifying workflow bottlenecks.',
    architecture_references: [
      'database/schema/agent_registry - Agent activity and messages',
      'src/services/evaInsightService.ts - Add agent message methods',
      'docs/02_api/leo-protocol.md - Agent workflow patterns'
    ],
    example_code_patterns: {
      agent_aggregation: `async getAgentMessages(ventureId?: string): Promise<AgentMessage[]> {
  let query = this.supabase
    .from('agent_registry')
    .select('agent_id, agent_type, venture_id, status, current_task, last_active, metadata')
    .gte('last_active', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}`,
      collaboration_insight: `private detectCollaborationInsights(
  ventures: VentureDataSource[],
  agentMessages: AgentMessage[]
): InsightResult[] {
  const insights: InsightResult[] = [];

  for (const venture of ventures) {
    const ventureAgents = agentMessages.filter(a => a.venture_id === venture.id);
    const leadAgent = ventureAgents.find(a => a.agent_type === 'LEAD');
    const planAgent = ventureAgents.find(a => a.agent_type === 'PLAN');
    const execAgent = ventureAgents.find(a => a.agent_type === 'EXEC');

    // Detect healthy collaboration
    const allActive = leadAgent && planAgent && execAgent;
    if (allActive) {
      insights.push({
        id: \`collab-\${venture.id}\`,
        type: 'agent_collaboration',
        severity: 'info',
        title: 'Healthy Agent Collaboration',
        message: \`Venture "\${venture.name}" has all agents actively collaborating\`,
        actionItems: [],
        relatedVentureIds: [venture.id],
        priority: this.calculatePriority('info', new Date().toISOString(), 30),
        createdAt: new Date().toISOString()
      });
    }

    // Detect blocked agents
    const blockedAgent = ventureAgents.find(a => a.status === 'blocked');
    if (blockedAgent) {
      const blockDuration = Date.now() - new Date(blockedAgent.last_active).getTime();
      if (blockDuration > 24 * 60 * 60 * 1000) {
        insights.push({
          id: \`blocked-\${venture.id}\`,
          type: 'agent_blocked',
          severity: 'high',
          title: 'Agent Blocked',
          message: \`\${blockedAgent.agent_type} agent blocked on "\${venture.name}" for \${Math.round(blockDuration / (60 * 60 * 1000))} hours\`,
          actionItems: ['Review blocker', 'Escalate if needed'],
          relatedVentureIds: [venture.id],
          priority: this.calculatePriority('high', blockedAgent.last_active, 80),
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  return insights;
}`
    },
    testing_scenarios: [
      { scenario: 'Agent message aggregation from registry', type: 'integration', priority: 'P0' },
      { scenario: 'Collaboration pattern detection', type: 'unit', priority: 'P1' },
      { scenario: 'Blocked agent insight generation', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-005-agent-insights.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-006',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Implement decision tracking insights',
    user_role: 'Chairman',
    user_want: 'See insights about pending decisions, decision velocity, and decision impact',
    user_benefit: 'I can identify decision bottlenecks and track governance effectiveness',
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Pending decision insight',
        given: 'Venture has decision with status="pending" for > 48 hours',
        when: 'Insight generation runs',
        then: 'Insight generated with type: "decision_pending", severity: "medium", message includes decision title and age in hours'
      },
      {
        id: 'AC-006-2',
        scenario: 'Decision velocity insight',
        given: 'Chairman has made < 2 decisions per week average',
        when: 'Insight generation runs',
        then: 'Insight generated with type: "low_decision_velocity", severity: "low", message: "Decision velocity below target"'
      },
      {
        id: 'AC-006-3',
        scenario: 'High-impact decision insight',
        given: 'Decision marked as high_impact AND status="pending"',
        when: 'Insight generation runs',
        then: 'Insight generated with severity: "high" AND prioritized above other pending decisions'
      }
    ],
    definition_of_done: [
      'EVAInsightService.getDecisionData() method implemented',
      'Insights for: pending decisions, decision velocity, high-impact decisions',
      'Decision age calculation (hours pending)',
      'Decision velocity calculation (decisions per week)',
      'Unit tests for decision insights',
      'Integration test with venture_decisions table'
    ],
    technical_notes: 'Query venture_decisions table. Calculate decision age (now - created_at). Calculate velocity (decisions in last 7 days / 7). Identify high-impact pending decisions. Generate insights.',
    implementation_approach: 'Add getDecisionData() to EVAInsightService. Query venture_decisions for pending, recent, high-impact. Calculate metrics. Generate insights based on thresholds.',
    implementation_context: 'Decision insights help Chairman track governance effectiveness. Pending decisions indicate bottlenecks. Velocity shows decision-making pace. High-impact decisions need attention.',
    architecture_references: [
      'database/schema/venture_decisions - Decision tracking table',
      'src/services/evaInsightService.ts - Add decision methods'
    ],
    example_code_patterns: {
      decision_data: `async getDecisionData(chairmanId: string): Promise<DecisionDataSource[]> {
  const { data, error } = await this.supabase
    .from('venture_decisions')
    .select('id, venture_id, title, status, impact_level, created_at, resolved_at')
    .in('venture_id',
      this.supabase.from('ventures')
        .select('id')
        .eq('chairman_id', chairmanId)
    );

  if (error) throw error;
  return data || [];
}`,
      decision_insights: `private generateDecisionInsights(decisions: DecisionDataSource[]): InsightResult[] {
  const insights: InsightResult[] = [];
  const now = Date.now();

  // Pending decisions > 48 hours
  const pendingDecisions = decisions.filter(d =>
    d.status === 'pending' &&
    (now - new Date(d.created_at).getTime()) > 48 * 60 * 60 * 1000
  );

  for (const decision of pendingDecisions) {
    const ageHours = Math.round((now - new Date(decision.created_at).getTime()) / (60 * 60 * 1000));
    insights.push({
      id: \`decision-\${decision.id}\`,
      type: 'decision_pending',
      severity: decision.impact_level === 'high' ? 'high' : 'medium',
      title: 'Pending Decision',
      message: \`Decision "\${decision.title}" pending for \${ageHours} hours\`,
      actionItems: ['Review decision details', 'Make decision or delegate'],
      relatedVentureIds: [decision.venture_id],
      priority: this.calculatePriority(
        decision.impact_level === 'high' ? 'high' : 'medium',
        decision.created_at,
        decision.impact_level === 'high' ? 90 : 60
      ),
      createdAt: new Date().toISOString()
    });
  }

  return insights;
}`
    },
    testing_scenarios: [
      { scenario: 'Pending decision insight generation', type: 'unit', priority: 'P0' },
      { scenario: 'Decision velocity calculation', type: 'unit', priority: 'P1' },
      { scenario: 'High-impact decision prioritization', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-006-decision-insights.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-011:US-007',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Integrate EVA insights with event bus for real-time updates',
    user_role: 'System',
    user_want: 'EVA insights automatically updated when relevant events occur (budget warnings, agent status changes, new decisions)',
    user_benefit: 'Chairman sees real-time insights without manual refresh',
    priority: 'medium',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Subscribe to budget warning events',
        given: 'EVA event bus is initialized',
        when: 'EVAInsightService initializes',
        then: 'Service subscribes to EVA_ALERT events with type: "budget_warning"'
      },
      {
        id: 'AC-007-2',
        scenario: 'Budget warning triggers insight refresh',
        given: 'Budget warning event published to event bus',
        when: 'EVAInsightService receives event',
        then: 'Service regenerates insights for affected venture AND publishes INSIGHT_UPDATED event'
      },
      {
        id: 'AC-007-3',
        scenario: 'Agent status change triggers refresh',
        given: 'Agent status changes to "blocked"',
        when: 'AGENT_STATUS_CHANGED event published',
        then: 'EVAInsightService regenerates insights for affected venture'
      },
      {
        id: 'AC-007-4',
        scenario: 'Frontend receives real-time updates',
        given: 'Frontend subscribed to INSIGHT_UPDATED events',
        when: 'New insight generated',
        then: 'Frontend receives event AND updates displayed insights without page refresh'
      }
    ],
    definition_of_done: [
      'EVAInsightService subscribes to relevant event bus topics',
      'Event handlers for: budget_warning, agent_status_changed, decision_created',
      'INSIGHT_UPDATED event published when insights regenerated',
      'Debouncing to prevent excessive regeneration',
      'Unit tests for event handlers',
      'Integration test for event flow'
    ],
    technical_notes: 'Use existing event bus infrastructure (if available) or implement simple pub/sub. Subscribe to relevant events. Debounce to prevent rapid regeneration. Publish INSIGHT_UPDATED when done.',
    implementation_approach: 'Add event bus integration to EVAInsightService. Subscribe in constructor. Handle budget_warning, agent_status_changed, decision_created events. Debounce with 5-second delay. Publish INSIGHT_UPDATED after regeneration.',
    implementation_context: 'Real-time insights improve Chairman experience. Event-driven architecture prevents stale data. Must balance freshness with performance (debouncing). Optional enhancement - can be deferred if event bus not ready.',
    architecture_references: [
      'src/services/evaTokenBudget.ts - Reference event publishing pattern',
      'src/lib/eventBus.ts - Event bus implementation (if exists)',
      'src/services/evaInsightService.ts - Add event subscriptions'
    ],
    example_code_patterns: {
      event_subscription: `// Add to EVAInsightService constructor
constructor(supabaseClient: SupabaseClient, eventBus?: EventBus) {
  this.supabase = supabaseClient;
  this.eventBus = eventBus;

  // Subscribe to relevant events
  if (eventBus) {
    eventBus.subscribe('EVA_ALERT', this.handleBudgetWarning.bind(this));
    eventBus.subscribe('AGENT_STATUS_CHANGED', this.handleAgentStatus.bind(this));
    eventBus.subscribe('DECISION_CREATED', this.handleDecisionCreated.bind(this));
  }

  // Debounced insight regeneration
  this.regenerateDebounced = debounce(this.regenerateInsights.bind(this), 5000);
}`,
      event_handler: `private async handleBudgetWarning(event: BudgetWarningEvent) {
  console.log('EVA Insight: Budget warning received', event);

  // Trigger debounced regeneration for affected venture
  this.regenerateDebounced(event.venture_id);
}

private async regenerateInsights(ventureId: string) {
  try {
    const insights = await this.generateInsights(ventureId);

    // Publish update event
    this.eventBus?.publish('INSIGHT_UPDATED', {
      ventureId,
      insights,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to regenerate insights:', err);
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Event subscription on service initialization', type: 'unit', priority: 'P1' },
      { scenario: 'Budget warning triggers insight refresh', type: 'integration', priority: 'P2' },
      { scenario: 'Debouncing prevents excessive regeneration', type: 'unit', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/services/US-007-event-integration.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists (support both UUID and legacy_id)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, sd_key, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Error:', sdError?.message);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    // Use the UUID for foreign key references
    const sdUuid = sdData.id;

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdUuid}`);
    console.log(`   Legacy ID: ${sdData.legacy_id || 'N/A'}\n`);

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid  // Replace string SD_ID with actual UUID
        };

        const { data: _data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error adding ${story.story_key}:`, error.message);
          console.error(`   Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`✅ Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Exception adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Success: ${successCount}/${userStories.length}`);
    console.log(`   Skipped: ${skipCount}/${userStories.length}`);
    console.log(`   Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log('\n✨ All user stories added successfully for SD-VISION-V2-011!');
      console.log('\n📋 Next Steps:');
      console.log(`   1. Review stories in database: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
      console.log('   2. Validate INVEST criteria using: npm run stories:validate');
      console.log(`   3. Create PRD with: npm run prd:create ${SD_ID}`);
      console.log('   4. Begin EXEC implementation with backend service first (US-001, US-002)');
      console.log('\n📐 Implementation Order:');
      console.log('   Phase 1 (Backend): US-001 → US-002 → US-003');
      console.log('   Phase 2 (Integration): US-005 → US-006 → US-004');
      console.log('   Phase 3 (Real-time): US-007 (optional)');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
