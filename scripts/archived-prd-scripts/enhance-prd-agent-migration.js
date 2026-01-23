require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function enhancePRD() {
  console.log('🔄 Enhancing PRD-AGENT-MIGRATION-001...\n');

  const enhancements = {
    system_architecture: {
      current_state: {
        description: 'System B: Flat 4-table structure (crewai_agents, crewai_crews, crewai_tasks, venture_drafts)',
        limitations: [
          'No organizational hierarchy',
          'Single-tenant design',
          'No department-based access control',
          'Limited scalability for multi-client deployment'
        ]
      },
      target_state: {
        description: 'System A: Hierarchical 8-table architecture with department organization',
        components: {
          data_layer: [
            'agent_departments (11 seeded departments with parent-child hierarchy)',
            'crewai_agents (agent configs with department_id FK)',
            'crewai_crews (team definitions with manager_agent_id)',
            'crew_members (many-to-many crew-agent mapping)',
            'research_sessions (EVA-orchestrated session tracking)',
            'agent_knowledge (pgvector semantic search with 1536-dim embeddings)',
            'api_cache (24-hour TTL external API caching)',
            'agent_tools (tool registry with rate limiting)'
          ],
          service_layer: [
            'useCrewAIAgents hook (React Query + Supabase realtime)',
            'useDepartments hook (department hierarchy management)',
            'useResearchSessions hook (session orchestration)',
            'useAgentKnowledge hook (semantic search via pgvector)'
          ],
          presentation_layer: [
            'AIAgentsPage.tsx (department hierarchy + filter)',
            'DepartmentSelector.tsx (org tree navigation)',
            'AgentCard.tsx (individual agent display)',
            'CrewManager.tsx (crew composition UI)',
            'ResearchSessionDashboard.tsx (session monitoring)'
          ]
        },
        capabilities: [
          'Multi-tenant RLS using auth.uid()',
          'Semantic search via pgvector cosine similarity',
          'Department-based RBAC',
          'Real-time updates via Supabase subscriptions',
          'Automated API caching with TTL'
        ]
      },
      migration_path: {
        phase_1: 'Database migration (drop System B, create System A)',
        phase_2: 'Backend migration (preserve 5,700 LOC Python, update DB calls)',
        phase_3: 'Frontend rewrite (React hooks + UI components)',
        phase_4: 'Avatar integration (12 PNGs from OpenAI GPT-4o)',
        phase_5: 'E2E testing (Playwright validation of all user flows)'
      }
    },
    implementation_approach: {
      strategy: 'Incremental migration with parallel testing environments',
      phases: [
        {
          phase: 'Database Schema Migration',
          duration: '2 hours',
          tasks: [
            'Execute 20251008000000_agent_platform_schema.sql',
            'Verify pgvector extension enabled',
            'Seed 11 departments with hierarchy',
            'Validate RLS policies using test accounts',
            'Drop System B tables (crewai_agents, crewai_crews, crewai_tasks, venture_drafts)'
          ],
          success_criteria: [
            'All 8 System A tables created',
            'pgvector extension active',
            '11 departments in agent_departments',
            'RLS policies enforce auth.uid() isolation',
            'Zero System B tables remaining'
          ]
        },
        {
          phase: 'React Hooks Rewrite',
          duration: '3 hours',
          tasks: [
            'Create useCrewAIAgents hook with department joins',
            'Create useDepartments hook for hierarchy navigation',
            'Add Supabase realtime subscriptions',
            'Implement optimistic updates',
            'Add error boundary handling'
          ],
          success_criteria: [
            'Hooks fetch department hierarchy correctly',
            'Realtime updates trigger UI refresh',
            'Loading states handle async operations',
            'Error states display user-friendly messages'
          ]
        },
        {
          phase: 'UI Components Development',
          duration: '3 hours',
          tasks: [
            'Rewrite AIAgentsPage.tsx with department filter',
            'Create DepartmentSelector component',
            'Update AgentCard for department display',
            'Add CrewManager for crew composition',
            'Implement ResearchSessionDashboard'
          ],
          success_criteria: [
            'Department filter functional',
            'Agent cards show department badges',
            'Crew manager allows member assignment',
            'Session dashboard displays active research'
          ]
        },
        {
          phase: 'Avatar Integration',
          duration: '0.5 hours',
          tasks: [
            'Verify 12 avatar PNGs exist in /public',
            'Update agentAvatars.ts configuration',
            'Add rotation functionality to AgentCard',
            'Test avatar fallback for missing files'
          ],
          success_criteria: [
            'All 12 avatars load correctly',
            'Rotation cycles through 3 variations',
            'Pending avatar shows for errors',
            'Avatar URLs resolve at http://localhost:8080/agent-*.png'
          ]
        },
        {
          phase: 'E2E Testing (Playwright)',
          duration: '0.5 hours',
          tasks: [
            'Write smoke tests for department filter',
            'Test agent card rendering',
            'Validate crew assignment workflow',
            'Test research session creation'
          ],
          success_criteria: [
            'All 5 user story scenarios pass',
            'Screenshots captured for evidence',
            'No console errors in test runs',
            'Playwright HTML report generated'
          ]
        }
      ],
      rollback_strategy: {
        trigger: 'Critical migration failure or data loss detected',
        steps: [
          'Restore System B schema from backup',
          'Revert React hooks to previous version',
          'Document failure reason in retrospective',
          'Estimate remediation time'
        ]
      },
      testing_strategy: {
        unit_tests: 'Vitest for hooks (50% coverage minimum)',
        integration_tests: 'Supabase RLS policy validation',
        e2e_tests: 'Playwright for all 5 user stories',
        manual_tests: 'Department hierarchy navigation'
      }
    },
    risks: [
      {
        id: 'RISK-001',
        category: 'Data Loss',
        description: 'Dropping System B tables before verifying System A data integrity',
        probability: 'Medium',
        impact: 'Critical',
        mitigation: 'Take full database backup before migration, validate System A has all data before dropping System B',
        contingency: 'Restore from backup, defer migration to investigate data gaps'
      },
      {
        id: 'RISK-002',
        category: 'Performance',
        description: 'pgvector semantic search may be slow with large knowledge base (>10K embeddings)',
        probability: 'Low',
        impact: 'Medium',
        mitigation: 'Use ivfflat index with proper lists parameter (100 for <100K vectors), monitor query performance',
        contingency: 'Increase lists parameter, add caching layer for frequent queries'
      },
      {
        id: 'RISK-003',
        category: 'Authentication',
        description: 'RLS policies using auth.uid() may not work if Supabase Auth not configured',
        probability: 'Low',
        impact: 'High',
        mitigation: 'Verify Supabase Auth is enabled in project settings, test RLS with real user accounts',
        contingency: 'Temporarily disable RLS for development, enable before production'
      },
      {
        id: 'RISK-004',
        category: 'Avatar Loading',
        description: '12 PNG files may not be generated or fail to load',
        probability: 'Medium',
        impact: 'Low',
        mitigation: 'Verify all files exist in /public before deployment, implement fallback to placeholder',
        contingency: 'Use pending avatar placeholder, defer OpenAI generation to future sprint'
      },
      {
        id: 'RISK-005',
        category: 'Scope Creep',
        description: 'Advanced filtering features (collapsible panels, performance metrics) may be added mid-sprint',
        probability: 'Medium',
        impact: 'Medium',
        mitigation: 'Strictly enforce approved scope, defer all advanced features to SD-AGENT-FILTERING-002',
        contingency: 'Escalate to LEAD for scope reduction decision'
      }
    ]
  };

  const { data: _data, error } = await supabase
    .from('product_requirements_v2')
    .update(enhancements)
    .eq('id', 'PRD-AGENT-MIGRATION-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating PRD:', error);
    return;
  }

  console.log('✅ PRD enhanced successfully!\n');
  console.log('📋 Added fields:');
  console.log('   • system_architecture (current state, target state, migration path)');
  console.log('   • implementation_approach (5 phases, rollback strategy, testing strategy)');
  console.log('   • risks (5 risks with mitigation/contingency)');
  console.log('\n🎯 Ready for PLAN→EXEC handoff retry');
}

enhancePRD();
