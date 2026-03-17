import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  const prdId = 'PRD-SD-MOCK-HOOKS';
  const sdId = 'SD-MOCK-HOOKS';

  // Check for existing
  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.log('PRD already exists, updating...');
  }

  const prd = {
    id: prdId,
    sd_id: sdId,
    directive_id: sdId,
    title: 'Mock Hooks Refactor: Unified mockableQuery Pattern',
    version: '1.0',
    status: 'approved',
    category: 'Refactor',
    priority: 'medium',
    executive_summary: 'Refactor 19 hooks to use the centralized mock infrastructure via mockableQuery pattern. This eliminates scattered localStorage demo mode checks and enables unified mock mode toggle.',
    business_context: 'Currently, each hook independently checks localStorage for demo mode with inconsistent patterns. This creates maintenance burden and makes it impossible to have a single toggle for mock mode.',
    technical_context: 'The mock infrastructure (src/mocks/) provides mockableQuery<T>() wrapper that automatically routes to mock or real data based on getMockConfig(). All hooks need refactoring to use this pattern.',
    system_architecture: 'Each hook will import mockableQuery from @/mocks and wrap their data fetching. The mockableQuery checks getMockConfig() and either runs the real query or returns mock data from the registry.',
    exploration_summary: [
      { file: '../ehg/src/hooks/useVentureData.ts', purpose: 'Primary venture data hook', findings: 'Uses localStorage check, needs mockableQuery wrapper' },
      { file: '../ehg/src/hooks/useAnalyticsData.ts', purpose: 'Analytics hooks', findings: 'Multiple hooks with localStorage checks' },
      { file: '../ehg/src/hooks/useChairmanData.ts', purpose: 'Chairman data hooks', findings: 'Mixed real and mock queries' },
      { file: '../ehg/src/hooks/useGovernanceData.ts', purpose: 'Governance data', findings: 'Full mock implementation' }
    ],
    functional_requirements: [
      { id: 'FR-1', requirement: 'Refactor useVentureData hooks', description: 'Wrap useVentures and useVentureMetrics with mockableQuery', priority: 'HIGH', acceptance_criteria: ['No localStorage checks', 'Uses getMockData for mock data'] },
      { id: 'FR-2', requirement: 'Refactor useAnalyticsData hooks', description: 'Wrap usePortfolioAnalytics, useVentureAnalytics, useAIInsights with mockableQuery', priority: 'HIGH', acceptance_criteria: ['All 3 hooks use mockableQuery'] },
      { id: 'FR-3', requirement: 'Refactor useChairmanData hooks', description: 'Wrap chairman-related hooks with mockableQuery', priority: 'MEDIUM', acceptance_criteria: ['Uses centralized mock data'] },
      { id: 'FR-4', requirement: 'Refactor useGovernanceData', description: 'Wrap governance hook with mockableQuery', priority: 'MEDIUM', acceptance_criteria: ['Removes inline mock generation'] }
    ],
    non_functional_requirements: [
      { type: 'maintainability', requirement: 'Single mock detection pattern', target_metric: 'Zero localStorage checks' },
      { type: 'testability', requirement: 'Mock mode testable via URL param', target_metric: '?mock=true works' }
    ],
    test_scenarios: [
      { id: 'TS-1', scenario: 'Mock mode toggle via URL', description: 'Add ?mock=true and verify mock data returned', expected_result: 'All hooks return mock data', test_type: 'e2e' },
      { id: 'TS-2', scenario: 'Real mode by default', description: 'Without mock params, hooks fetch real data', expected_result: 'Supabase queries executed', test_type: 'integration' }
    ],
    acceptance_criteria: [
      'All 19 hooks refactored to use mockableQuery',
      'No localStorage demo mode checks remaining',
      'TypeScript compilation passes',
      'Existing E2E tests pass'
    ],
    implementation_approach: 'Refactor hooks in batches: 1) Core venture/analytics hooks, 2) Chairman/governance hooks, 3) Remaining utility hooks. Each batch should be a separate commit.',
    technology_stack: ['React 18', 'TypeScript 5', 'mockableQuery from @/mocks'],
    progress: 0,
    phase: 'planning',
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .upsert(prd)
    .select('id, title, status')
    .single();

  if (error) {
    console.error('PRD creation failed:', error.message);
    return;
  }

  console.log('PRD created:', data);

  // Create user stories
  const stories = [
    { title: 'Core Venture Hooks', description: 'Refactor useVentures, useVentureMetrics to use mockableQuery' },
    { title: 'Analytics Hooks', description: 'Refactor usePortfolioAnalytics, useVentureAnalytics, useAIInsights' },
    { title: 'Chairman Hooks', description: 'Refactor useChairmanData hooks to use mockableQuery' },
    { title: 'Governance Hooks', description: 'Refactor useGovernanceData to use mockableQuery' }
  ];

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const { error: storyError } = await supabase
      .from('user_stories')
      .upsert({
        id: 'US-' + sdId + '-' + String(i + 1).padStart(3, '0'),
        sd_id: sdId,
        prd_id: prdId,
        title: story.title,
        user_role: 'developer',
        goal: story.description,
        user_benefit: 'Unified mock mode detection',
        status: 'in_progress',
        priority: i === 0 ? 'high' : 'medium',
        implementation_context: { batch: i + 1 }
      });

    if (storyError) {
      console.error('Story creation failed:', storyError.message);
    }
  }

  console.log('Created 4 user stories');
}

createPRD();
