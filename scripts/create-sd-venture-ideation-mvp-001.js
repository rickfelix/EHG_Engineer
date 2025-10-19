#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-VENTURE-IDEATION-MVP-001
 * Intelligent Venture Creation MVP with CrewAI Foundation
 *
 * This establishes the foundation for AI-enhanced venture ideation,
 * replacing the modal form with a full-page progressive workflow
 * and deploying 4 core CrewAI research agents.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createVentureIdeationMVP() {
  console.log('🚀 Creating Strategic Directive: Intelligent Venture Creation MVP');
  console.log('=====================================================================\n');

  const strategicDirective = {
    id: 'SD-VENTURE-IDEATION-MVP-001',
    sd_key: 'SD-VENTURE-IDEATION-MVP-001',
    title: 'Intelligent Venture Creation MVP',
    description: `Transform venture ideation from a simple modal form into an AI-orchestrated intelligent process.
    Replace VentureCreationDialog modal with full-page progressive workflow, integrate CrewAI framework,
    and deploy 4 core research agents that conduct market analysis, pain point validation, competitive
    intelligence, and strategic fit assessment. Chairman submits idea, AI agents research (5-15 min),
    and return enhanced insights for review/approval.

    This MVP establishes the foundation for comprehensive AI-driven venture intelligence platform.`,
    priority: 'high',
    status: 'active',
    category: 'venture-platform',
    rationale: `Current modal form provides no intelligence - just data capture. Chairman must conduct all research manually.
    This creates a 10x opportunity: AI agents can research market data, validate pain points via Reddit/forums,
    analyze competitors, and assess portfolio fit in minutes instead of hours/days. CrewAI framework provides
    enterprise-ready multi-agent orchestration with proven 5.76x performance advantages.`,
    scope: 'Full-page venture creation workflow with CrewAI integration and 4 core research agents',
    strategic_objectives: [
      'Replace VentureCreationDialog modal with full-page progressive workflow route (/ventures/new)',
      'Implement company assignment (required field, default EHG, editable at Phase 3 after AI research)',
      'Deploy CrewAI framework foundation (Python backend with FastAPI integration)',
      'Build and deploy 4 core research agents using CrewAI hierarchical crew architecture',
      'Integrate basic Reddit API for pain point validation',
      'Create pause/resume functionality with draft state persistence',
      'Update navigation routes maturity from draft to development',
      'Deliver end-to-end AI-enhanced venture creation with 85%+ Chairman acceptance rate'
    ],
    success_criteria: [
      'Full-page workflow route /ventures/new is functional and replaces modal',
      'Company assignment field is required with EHG default, editable at Phase 3',
      'CrewAI framework installed and configured with hierarchical crew process',
      '4 research agents deployed: Market Sizing, Pain Point Validator, Competitive Landscape, Strategic Fit',
      'AI research completes in 5-15 minutes with parallel agent execution',
      'Chairman receives enhanced description + market insights for review/edit',
      '85%+ Chairman acceptance rate on AI-generated suggestions',
      'Pause/resume works correctly with draft state saved to database',
      '6 navigation routes updated from draft to development maturity'
    ],
    metadata: {
      timeline: {
        start_date: new Date().toISOString(),
        target_completion: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(), // 5 weeks
        milestones: [
          'Week 1: Install CrewAI, design database schema, create full-page route',
          'Week 2: Build 4 core agents with CrewAI crew configuration',
          'Week 3: Integrate Reddit API, implement orchestration engine',
          'Week 4: Build Chairman review/edit UI, pause/resume functionality',
          'Week 5: End-to-end testing, refinement, deployment'
        ]
      },
      business_impact: 'HIGH - Transforms venture ideation from manual to AI-orchestrated, 60% time savings expected',
      technical_impact: 'Foundation for entire AI agent platform - establishes CrewAI integration patterns',
      dependencies: {
        before: [],
        after: ['SD-AGENT-PLATFORM-001']
      },
      technical_details: {
        crewai_integration: {
          framework: 'CrewAI v0.x',
          installation: 'pip install crewai crewai-tools',
          architecture: 'Hierarchical crew process with auto-assigned manager',
          backend: 'Python FastAPI service',
          communication: 'REST API between React frontend and Python backend'
        },
        core_agents: [
          {
            name: 'Market Sizing Analyst',
            role: 'Senior Market Intelligence Analyst',
            goal: 'Calculate TAM/SAM/SOM with high accuracy using market data APIs',
            tools: ['Market data APIs', 'Competitive analysis tools'],
            delegation: true,
            estimated_duration: '2-4 minutes'
          },
          {
            name: 'Pain Point Validator',
            role: 'Customer Insights Researcher',
            goal: 'Identify and validate genuine customer pain points via Reddit/forums',
            tools: ['Reddit API connector', 'Sentiment analysis'],
            delegation: true,
            estimated_duration: '3-5 minutes'
          },
          {
            name: 'Competitive Landscape Mapper',
            role: 'Competitive Intelligence Specialist',
            goal: 'Map competitive landscape and identify differentiation opportunities',
            tools: ['Competitive tracking service', 'Market analysis APIs'],
            delegation: true,
            estimated_duration: '2-4 minutes'
          },
          {
            name: 'Strategic Fit Analyzer',
            role: 'Strategic Portfolio Analyst',
            goal: 'Evaluate alignment with portfolio strategy and identify synergies',
            tools: ['Portfolio analysis engine', 'Synergy detection system'],
            delegation: true,
            estimated_duration: '1-3 minutes'
          }
        ],
        database_schema: {
          new_tables: [
            {
              name: 'crewai_agents',
              purpose: 'Agent registry with role, goal, backstory, tools, capabilities',
              columns: ['id', 'agent_role', 'goal', 'backstory', 'capabilities', 'llm_config', 'delegation_enabled', 'tools', 'is_active']
            },
            {
              name: 'crewai_crews',
              purpose: 'Crew configurations for hierarchical orchestration',
              columns: ['id', 'crew_name', 'process_type', 'agent_ids', 'config']
            },
            {
              name: 'crewai_tasks',
              purpose: 'Task execution tracking with results and performance',
              columns: ['id', 'venture_id', 'crew_id', 'task_type', 'description', 'assigned_agent_id', 'status', 'result', 'execution_time_ms', 'confidence_score']
            }
          ]
        },
        ui_components: {
          route: '/ventures/new',
          replaces: 'VentureCreationDialog modal',
          features: [
            'Multi-step progressive form with progress indicator',
            'Company assignment (required, default EHG)',
            'Voice capture integration (existing)',
            'EVA validation (existing)',
            'Pause/resume with draft persistence',
            'AI research progress display (5-15 min wait)',
            'Enhanced description review/edit interface',
            'Accept/reject AI suggestions workflow'
          ]
        },
        external_integrations: {
          reddit: {
            api: 'Reddit API',
            connector: 'Extends GenericRestConnector',
            purpose: 'Scrape subreddits for pain point validation',
            rate_limiting: '60 requests/minute'
          }
        },
        navigation_routes_update: {
          target_database: 'liapbndqlqxdcgpwntbv (EHG app)',
          routes_to_update: [
            '/eva-assistant',
            '/automation',
            '/eva-orchestration',
            '/agents',
            '/ai-agents',
            '/eva-analytics'
          ],
          maturity_change: 'draft → development'
        }
      },
      resource_requirements: [
        'Senior full-stack developer for React/FastAPI integration',
        'AI/ML engineer for CrewAI agent configuration',
        'Backend developer for Python service and database schema',
        'UX designer for full-page workflow design',
        'QA engineer for end-to-end testing'
      ],
      performance_targets: {
        research_duration: '5-15 minutes',
        chairman_acceptance_rate: '85%+',
        task_completion_rate: '90%+',
        confidence_score_average: '85%+',
        time_savings_vs_manual: '60%+'
      },
      related_sds: ['SD-AGENT-PLATFORM-001', 'SD-AGENT-ADMIN-001']
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-VENTURE-IDEATION-MVP-001')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-VENTURE-IDEATION-MVP-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('   ID: SD-VENTURE-IDEATION-MVP-001');
    console.log('   Title: Intelligent Venture Creation MVP');
    console.log('   Priority: HIGH');
    console.log('   Status: ACTIVE');
    console.log('   Timeline: 5 weeks');
    console.log('   Impact: Transforms venture ideation with AI orchestration');
    console.log('\n🎯 Foundation for AI-enhanced venture platform');
    console.log('🤖 CrewAI framework + 4 core research agents');
    console.log('📊 Expected: 85%+ Chairman acceptance, 60%+ time savings');
    console.log('=====================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createVentureIdeationMVP };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createVentureIdeationMVP();
}
