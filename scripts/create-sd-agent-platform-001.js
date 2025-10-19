#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-AGENT-PLATFORM-001
 * Advanced AI Research Platform with Full Agent Suite
 *
 * This expands the MVP to include 5 additional specialized agents,
 * comprehensive external data integration (Reddit, HN, ProductHunt, Crunchbase),
 * shared knowledge base with pgvector, and advanced CrewAI Flows orchestration.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createAgentPlatform() {
  console.log('🤖 Creating Strategic Directive: Advanced AI Research Platform');
  console.log('================================================================\n');

  const strategicDirective = {
    id: 'SD-AGENT-PLATFORM-001',
    sd_key: 'SD-AGENT-PLATFORM-001',
    title: 'Advanced AI Research Platform',
    description: `Expand the venture ideation MVP into a comprehensive AI research platform with 9 total agents
    (adding 5 specialized agents), deep external data integration (Reddit, HackerNews, ProductHunt, Crunchbase),
    shared knowledge base using Supabase pgvector for agent memory and learning, and advanced CrewAI Flows
    for event-driven orchestration. Agents learn from Chairman feedback patterns and build institutional knowledge
    about successful venture characteristics.

    This transforms venture ideation from AI-assisted to AI-intelligent with pattern recognition and continuous improvement.`,
    priority: 'high',
    status: 'draft',
    category: 'ai-platform',
    rationale: `MVP provides basic research (4 agents, basic Reddit). To achieve 95%+ duplicate detection,
    60%+ time savings, and truly intelligent recommendations, we need:
    (1) 5 more specialized agents for regulatory, tech feasibility, idea enhancement, duplicates, financials
    (2) Rich external data from multiple sources, not just Reddit
    (3) Shared knowledge base so agents learn from past decisions and build expertise
    (4) Advanced orchestration with CrewAI Flows for complex workflows

    CrewAI's proven 90% development time reduction and 70% speed improvement makes this achievable in 4-5 weeks.`,
    scope: '5 additional specialized agents, EVA Assistant integration, external data integrations, shared knowledge base with pgvector, CrewAI Flows',
    strategic_objectives: [
      'Integrate existing EVA Assistant into unified agent platform with shared orchestration',
      'Deploy 5 additional specialized research agents (total 9): Regulatory, Tech Feasibility, Idea Enhancement, Duplicate Detection, Financial Viability',
      'Integrate external data sources: Enhanced Reddit API, HackerNews, ProductHunt, Crunchbase',
      'Build shared knowledge base using Supabase pgvector for agent memory and learning',
      'Implement pattern recognition from Chairman feedback and past venture decisions',
      'Deploy CrewAI Flows for event-driven workflow orchestration',
      'Extend GenericRestConnector for all external API integrations',
      'Achieve 95%+ duplicate detection accuracy',
      'Deliver 60%+ reduction in venture ideation time vs manual process',
      'Build institutional knowledge with >100 learned patterns in first month'
    ],
    success_criteria: [
      'All 9 agents deployed and operational with 90%+ task completion rate',
      '4 external data sources connected: Reddit (enhanced), HackerNews, ProductHunt, Crunchbase',
      'Shared knowledge base operational with >100 learned patterns from Chairman feedback',
      'Duplicate detection agent achieves 95%+ accuracy vs existing ventures',
      'Pattern recognition identifies successful venture characteristics with 85%+ confidence',
      '60%+ reduction in venture ideation cycle time (measured: submission → Chairman approval)',
      'Average confidence scores across all agents >85%',
      'External data enriches >80% of venture research reports'
    ],
    metadata: {
      timeline: {
        start_date: null, // Set when SD-VENTURE-IDEATION-MVP-001 completes
        target_completion: null, // 5 weeks after start
        milestones: [
          'Week 1: Deploy 5 new agents with CrewAI crew configurations',
          'Week 2: Integrate external data sources (HN, PH, Crunchbase)',
          'Week 3: Build pgvector knowledge base and memory system',
          'Week 4: Implement pattern recognition and learning algorithms',
          'Week 5: Deploy CrewAI Flows, testing, refinement'
        ]
      },
      business_impact: 'HIGH - Delivers comprehensive AI intelligence with learning and continuous improvement',
      technical_impact: 'Establishes reusable agent platform and knowledge infrastructure for future features',
      dependencies: {
        before: ['SD-VENTURE-IDEATION-MVP-001'],
        after: ['SD-AGENT-ADMIN-001']
      },
      technical_details: {
        additional_agents: [
          {
            name: 'Regulatory Risk Assessor',
            role: 'Compliance and Risk Analyst',
            goal: 'Identify regulatory barriers and compliance requirements for venture',
            tools: ['Regulatory database APIs', 'Legal research tools', 'Compliance checklist generator'],
            delegation: true,
            data_sources: ['Industry-specific regulations', 'FDA databases', 'FTC guidelines', 'State licensing'],
            estimated_duration: '3-5 minutes'
          },
          {
            name: 'Technology Feasibility Checker',
            role: 'Senior Technical Architect',
            goal: 'Assess technical feasibility and implementation complexity',
            tools: ['Technology stack analyzer', 'Architecture pattern matcher', 'Cloud cost estimator'],
            delegation: true,
            data_sources: ['GitHub repos', 'Stack Overflow trends', 'Cloud pricing APIs'],
            estimated_duration: '2-4 minutes'
          },
          {
            name: 'Idea Enhancement Agent',
            role: 'Creative Business Strategist',
            goal: 'Enhance and refine venture concepts based on research findings',
            tools: ['Idea refinement engine', 'Business model canvas generator', 'Value proposition designer'],
            delegation: false,
            dependencies: ['All other agents must complete first'],
            estimated_duration: '3-5 minutes'
          },
          {
            name: 'Duplicate Detection Agent',
            role: 'Portfolio Intelligence Analyst',
            goal: 'Identify duplicate or overlapping venture concepts with 95%+ accuracy',
            tools: ['Similarity detection engine (cosine similarity)', 'Portfolio database', 'Semantic search'],
            delegation: false,
            data_sources: ['All existing ventures', 'Past rejected ideas'],
            estimated_duration: '1-2 minutes'
          },
          {
            name: 'Financial Viability Agent',
            role: 'Financial Analysis Specialist',
            goal: 'Assess basic financial feasibility and unit economics',
            tools: ['Financial modeling templates', 'Unit economics calculator', 'CAC/LTV analyzer'],
            delegation: true,
            data_sources: ['Industry benchmarks', 'Comparable company financials'],
            estimated_duration: '2-4 minutes'
          }
        ],
        external_data_integrations: {
          reddit: {
            enhancement: 'Upgrade from basic to comprehensive scraping',
            subreddits: 'Industry-specific + startup communities',
            features: ['Sentiment analysis', 'Pain point extraction', 'Trend detection'],
            rate_limiting: '60 requests/minute with burst support'
          },
          hackernews: {
            api: 'Official HackerNews API',
            purpose: 'Tech trends, product launches, community sentiment',
            connector: 'Extends GenericRestConnector',
            endpoints: ['topstories', 'newstories', 'beststories', 'item'],
            rate_limiting: 'No official limit, implement 100/min conservative'
          },
          producthunt: {
            api: 'ProductHunt GraphQL API',
            purpose: 'Product launches, market validation, competitive tracking',
            connector: 'Extends GenericRestConnector with GraphQL support',
            authentication: 'OAuth2',
            rate_limiting: '1000 requests/hour'
          },
          crunchbase: {
            api: 'Crunchbase Enterprise API',
            purpose: 'Funding data, company intelligence, M&A activity',
            connector: 'Extends GenericRestConnector',
            authentication: 'API Key',
            cost: 'Requires Crunchbase subscription (~$300/month)',
            rate_limiting: 'Varies by plan, implement caching'
          }
        },
        shared_knowledge_base: {
          technology: 'Supabase pgvector extension',
          purpose: 'Agent memory, pattern recognition, continuous learning',
          database_table: 'agent_shared_knowledge',
          schema: {
            columns: [
              'id UUID PRIMARY KEY',
              'knowledge_type VARCHAR(100)',
              'content TEXT',
              'embedding VECTOR(1536)', // OpenAI ada-002 embeddings
              'metadata JSONB',
              'source_agent_id UUID REFERENCES crewai_agents(id)',
              'created_at TIMESTAMPTZ'
            ],
            indexes: [
              'CREATE INDEX ON agent_shared_knowledge USING ivfflat (embedding vector_cosine_ops)',
              'CREATE INDEX ON agent_shared_knowledge(knowledge_type)',
              'CREATE INDEX ON agent_shared_knowledge(source_agent_id)'
            ]
          },
          knowledge_types: [
            'chairman_feedback_pattern',
            'successful_venture_characteristic',
            'rejected_venture_pattern',
            'market_trend',
            'regulatory_requirement',
            'technology_best_practice'
          ],
          learning_mechanisms: [
            'When Chairman accepts AI suggestion → Store as positive pattern',
            'When Chairman rejects AI suggestion → Analyze diff and store as negative pattern',
            'When Chairman edits description → Extract improvement patterns',
            'After venture reaches Stage 10 → Store success characteristics',
            'When venture archived → Store failure indicators'
          ],
          target_patterns: '>100 patterns in first month of operation'
        },
        crewai_flows: {
          purpose: 'Event-driven orchestration for complex workflows',
          architecture: 'CrewAI Flows for granular control',
          use_cases: [
            'Conditional agent execution based on prior results',
            'Parallel vs sequential task optimization',
            'Error handling and retry with fallback strategies',
            'Dynamic agent selection based on venture category',
            'Progress reporting and status updates'
          ],
          example_flow: `
            1. Start: Venture submission event
            2. Parallel execution: Market Sizing + Pain Points + Competitive
            3. Wait for all parallel tasks
            4. Sequential: Strategic Fit (uses parallel results)
            5. Parallel execution: Regulatory + Tech Feasibility + Financial
            6. Wait for all parallel tasks
            7. Sequential: Duplicate Detection + Idea Enhancement
            8. Complete: Return enhanced results to Chairman
          `
        },
        performance_optimizations: {
          parallel_execution: 'Run independent agents in parallel (market sizing, pain points, competitive)',
          caching: 'Cache external API results for 24 hours to reduce costs/latency',
          progressive_loading: 'Return partial results as agents complete (stream to UI)',
          fallback_strategies: 'If external API fails, use cached data or skip that data source'
        }
      },
      resource_requirements: [
        'AI/ML engineer for 5 new agent configurations and knowledge base',
        'Backend developer for external API integrations',
        'Data engineer for pgvector setup and embeddings pipeline',
        'Full-stack developer for CrewAI Flows and orchestration',
        'DevOps for scaling and monitoring',
        'Budget: ~$300/month for Crunchbase API subscription'
      ],
      performance_targets: {
        duplicate_detection_accuracy: '95%+',
        time_savings_vs_manual: '60%+',
        average_confidence_scores: '85%+',
        task_completion_rate: '90%+',
        external_data_enrichment: '80%+ of reports',
        knowledge_patterns_first_month: '>100',
        total_research_duration: '8-20 minutes (depends on complexity)'
      },
      related_sds: ['SD-VENTURE-IDEATION-MVP-001', 'SD-AGENT-ADMIN-001']
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
      .eq('id', 'SD-AGENT-PLATFORM-001')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-AGENT-PLATFORM-001')
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

    console.log('   ID: SD-AGENT-PLATFORM-001');
    console.log('   Title: Advanced AI Research Platform');
    console.log('   Priority: HIGH');
    console.log('   Status: DRAFT (depends on SD-VENTURE-IDEATION-MVP-001)');
    console.log('   Timeline: 5 weeks after MVP complete');
    console.log('   Impact: Comprehensive AI intelligence with learning');
    console.log('\n🤖 9 total agents + 4 external data sources');
    console.log('🧠 Shared knowledge base with pattern recognition');
    console.log('📊 Expected: 95%+ duplicate detection, 60%+ time savings, >100 learned patterns');
    console.log('================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createAgentPlatform };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAgentPlatform();
}
