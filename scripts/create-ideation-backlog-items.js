#!/usr/bin/env node

/**
 * Create Backlog Items for EHG Ideation Milestone SDs
 *
 * Populates sd_backlog_map with detailed implementation tasks for each SD.
 * Aligns with the parent-child hierarchy:
 * - SD-IDEATION-VISION-001 (parent)
 * - SD-IDEATION-DATA-001, SD-IDEATION-AGENTS-001, SD-IDEATION-PATTERNS-001 (foundation)
 * - SD-IDEATION-STAGE[1-6]-001 (stage implementations)
 *
 * Created: 2025-11-26 (EHG Stages 1-6 Vision Alignment)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate unique backlog ID
const generateBacklogId = (sdId, itemNum) => {
  return `${sdId}-ITEM-${String(itemNum).padStart(3, '0')}`;
};

// Backlog items for each SD
const backlogItems = {
  // ============================================================================
  // VISION PARENT SD
  // ============================================================================
  'SD-IDEATION-VISION-001': [
    {
      backlog_title: 'Define EHG Holdings Architecture',
      description_raw: 'Document the complete EHG Holdings structure: Holding company, EHG Corporate, Portfolios, Companies, Ventures',
      item_description: 'Create comprehensive architecture diagram and documentation for EHG Holdings structure with all entity relationships',
      priority: 'High',
      stage_number: 0,
      phase: 'LEAD'
    },
    {
      backlog_title: 'Establish CrewAI Agent Hierarchy',
      description_raw: 'Define Chairman→EVA→Board→CEO/VPs/Managers hierarchy for AI agents',
      item_description: 'Document the AI agent hierarchy from Chairman assistant (EVA) through Board of Directors to company-level AI executives',
      priority: 'High',
      stage_number: 0,
      phase: 'LEAD'
    },
    {
      backlog_title: 'Define Shared Services Model',
      description_raw: 'Establish Marketing, Legal, Finance, Engineering as shared services under EHG Corporate',
      item_description: 'Design shared services model with cost allocation, resource pooling, and venture access patterns',
      priority: 'Medium',
      stage_number: 0,
      phase: 'LEAD'
    },
    {
      backlog_title: 'Create Stage 3.4 Gate Specification',
      description_raw: 'Define Kill/Revise/Proceed gate criteria and decision framework',
      item_description: 'Comprehensive specification for Stage 3.4 gate including scoring rubric, thresholds, and Chairman override capabilities',
      priority: 'High',
      stage_number: 3,
      phase: 'PLAN'
    },
    {
      backlog_title: 'Design Autonomous Execution Framework',
      description_raw: 'Specify how Stages 1-6 execute without manual intervention',
      item_description: 'Framework for fully autonomous execution with error handling, timeouts, and graceful degradation',
      priority: 'High',
      stage_number: 0,
      phase: 'PLAN'
    }
  ],

  // ============================================================================
  // DATA FOUNDATION SD
  // ============================================================================
  'SD-IDEATION-DATA-001': [
    {
      backlog_title: 'Create stage_executions Table',
      description_raw: 'Design and implement stage_executions table for tracking venture progress',
      item_description: 'CREATE TABLE stage_executions with columns: id, venture_id, stage_number, stage_name, status, started_at, completed_at, result_summary, confidence_score, metadata',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create agent_results Table',
      description_raw: 'Design and implement agent_results table for storing agent outputs',
      item_description: 'CREATE TABLE agent_results with JSONB result storage, execution time tracking, cost attribution, and confidence scores',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create validation_scores Table',
      description_raw: 'Design and implement validation_scores table for historical scoring',
      item_description: 'CREATE TABLE validation_scores for tracking validation history with score, max_score, details JSONB, and timestamps',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Extend ventures.metadata Schema',
      description_raw: 'Add tier, archetype, recursion_state, current_stage to ventures.metadata JSONB',
      item_description: 'ALTER TABLE ventures to extend metadata JSONB with ideation milestone tracking fields',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Implement RLS Policies',
      description_raw: 'Create RLS policies for all new tables',
      item_description: 'Row Level Security policies for stage_executions, agent_results, validation_scores ensuring user-venture ownership',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Enable Realtime Subscriptions',
      description_raw: 'Configure Supabase realtime for progress monitoring',
      item_description: 'Enable and test realtime subscriptions on stage_executions for Chairman dashboard updates within 1 second',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Dashboard Views',
      description_raw: 'Build database views for Chairman dashboard queries',
      item_description: 'CREATE VIEW v_venture_progress, v_stage_summary, v_agent_performance for optimized dashboard queries',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Add Performance Indexes',
      description_raw: 'Create indexes for performant queries',
      item_description: 'CREATE INDEX on venture_id, stage_number, created_at for all new tables with EXPLAIN analysis',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // AGENTS FOUNDATION SD
  // ============================================================================
  'SD-IDEATION-AGENTS-001': [
    {
      backlog_title: 'Install CrewAI Framework',
      description_raw: 'Install and configure CrewAI Python framework',
      item_description: 'pip install crewai crewai-tools, configure hierarchical crew process with manager delegation',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Agent Registry Table',
      description_raw: 'Database table for agent configurations',
      item_description: 'CREATE TABLE crewai_agents with role, goal, backstory, tools, llm_config, delegation_enabled',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Market Sizing Analyst',
      description_raw: 'Build TAM/SAM/SOM calculation agent',
      item_description: 'CrewAI agent for market sizing with market_data_api tool, gpt-4o-mini LLM, estimated cost $0.02-0.05',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Pain Point Validator',
      description_raw: 'Build social data validation agent',
      item_description: 'CrewAI agent for pain point validation using reddit_api and sentiment_analyzer tools',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Competitive Intel Mapper',
      description_raw: 'Build competitive landscape mapping agent',
      item_description: 'CrewAI agent for competitive intelligence using web_search and company_database tools, gpt-4o LLM',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Strategic Fit Analyzer',
      description_raw: 'Build portfolio alignment assessment agent',
      item_description: 'CrewAI agent for strategic fit using portfolio_analyzer and synergy_detector tools',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Financial Modeler',
      description_raw: 'Build unit economics and profitability agent',
      item_description: 'CrewAI agent for financial modeling using financial_calculator and market_data_api tools, gpt-4o LLM',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Risk Assessor',
      description_raw: 'Build risk identification and quantification agent',
      item_description: 'CrewAI agent for risk assessment using risk_framework and market_data_api tools',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Technical Validator',
      description_raw: 'Build technical feasibility assessment agent',
      item_description: 'CrewAI agent for technical validation using tech_stack_analyzer tool',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Systems Thinker',
      description_raw: 'Build second-order effects analysis agent',
      item_description: 'CrewAI agent for systems thinking using causal_loop_builder tool, gpt-4o LLM',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Build Crew Orchestration Engine',
      description_raw: 'Implement crew composition and execution logic',
      item_description: 'Python service for assembling crews based on venture tier, managing parallel execution, and aggregating results',
      priority: 'High',
      stage_number: 4,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Implement Cost Tracking',
      description_raw: 'Track API costs per agent per venture',
      item_description: 'Cost attribution system with per-venture caps, monthly budget monitoring ($150/month target)',
      priority: 'Medium',
      stage_number: 4,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // PATTERNS FOUNDATION SD
  // ============================================================================
  'SD-IDEATION-PATTERNS-001': [
    {
      backlog_title: 'Design Recursion State Machine',
      description_raw: 'Define recursion states and transitions',
      item_description: 'State machine with states: linear, recursing, converged, forced_exit and transitions: trigger_recursion, quality_improved, max_iterations, chairman_override',
      priority: 'High',
      stage_number: 1,
      phase: 'PLAN'
    },
    {
      backlog_title: 'Implement Recursion Triggers',
      description_raw: 'Code recursion trigger logic based on validation scores',
      item_description: 'Implement triggers: Stage 5→3 (unit_economics_invalid), Stage 6→4 (new_competitor_threat), Stage 6→3 (critical_risk_discovered)',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Build Convergence Detection',
      description_raw: 'Implement +10% quality improvement threshold logic',
      item_description: 'Algorithm to detect quality improvement between recursion iterations, enforce max 2 iterations, hard cap at 3',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create SaaS B2B Archetype',
      description_raw: 'Define SaaS B2B venture archetype template',
      item_description: 'Archetype with key metrics (MRR, CAC, LTV, Churn, NRR), benchmarks (LTV:CAC >3:1, churn <5%), validation focus areas',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Marketplace Archetype',
      description_raw: 'Define Marketplace venture archetype template',
      item_description: 'Archetype with key metrics (GMV, Take Rate, Liquidity), benchmarks (take rate 10-30%), validation focus on chicken-egg problem',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create E-commerce Archetype',
      description_raw: 'Define E-commerce venture archetype template',
      item_description: 'Archetype with key metrics (AOV, Conversion, Return Rate, COGS), benchmarks (gross margin >40%), validation focus on differentiation',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Content/Media Archetype',
      description_raw: 'Define Content/Media venture archetype template',
      item_description: 'Archetype with key metrics (MAU, DAU/MAU, Time on Site), benchmarks (DAU/MAU >20%), validation focus on content moat',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Build Archetype Detection',
      description_raw: 'Implement automatic archetype classification from venture description',
      item_description: 'ML/LLM-based archetype detection with 85% accuracy target, support for multi-archetype ventures',
      priority: 'Medium',
      stage_number: 4,
      phase: 'EXEC',
      new_module: true
    }
  ],

  // ============================================================================
  // STAGE 1 SD
  // ============================================================================
  'SD-IDEATION-STAGE1-001': [
    {
      backlog_title: 'Integrate EVA Voice Capture',
      description_raw: 'Connect EVA voice-to-text in Stage 1',
      item_description: 'Integrate existing EVA voice capture service with Stage1Enhanced.tsx for voice input processing',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build AI Description Enhancement',
      description_raw: 'Implement LLM-based description expansion',
      item_description: 'Service to expand 2-sentence ideas into comprehensive descriptions with market context, using gpt-4o-mini',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Add Archetype Detection UI',
      description_raw: 'Display detected archetype in Stage 1',
      item_description: 'UI component showing detected archetype(s) with confidence score and manual override option',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Add Tier Recommendation UI',
      description_raw: 'Display recommended tier with rationale',
      item_description: 'UI component showing Tier 0/1/2 recommendation based on complexity signals, with Chairman override',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Implement Enhancement Diff View',
      description_raw: 'Show original vs enhanced description',
      item_description: 'Side-by-side diff view allowing Chairman to see AI changes and revert if needed',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // STAGE 2 SD
  // ============================================================================
  'SD-IDEATION-STAGE2-001': [
    {
      backlog_title: 'Build Agent Deployment Service',
      description_raw: 'Service to launch Stage 2 agent crew',
      item_description: 'TypeScript service to deploy Market Sizing Analyst and Pain Point Validator in parallel',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create TAM/SAM/SOM Display',
      description_raw: 'UI component for market sizing results',
      item_description: 'React component displaying TAM/SAM/SOM with source citations and confidence scores',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Pain Point Validation Display',
      description_raw: 'UI component for pain point evidence',
      item_description: 'React component showing validated pain points with Reddit/forum source links',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build Preliminary Viability Score',
      description_raw: 'Calculate viability score from agent results',
      item_description: 'Algorithm combining market sizing and pain point validation into 0-100 viability score',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Implement Red Flag Detection',
      description_raw: 'Identify early red flags for Chairman',
      item_description: 'Logic to detect and highlight critical issues (tiny market, no pain point evidence) for immediate attention',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // STAGE 3 SD
  // ============================================================================
  'SD-IDEATION-STAGE3-001': [
    {
      backlog_title: 'Build Multi-Agent Validation Service',
      description_raw: 'Service to launch Stage 3 validation crew',
      item_description: 'Service deploying Pain Point Validator (deep), Technical Validator, Strategic Fit Analyzer, Systems Thinker',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Technical Feasibility Display',
      description_raw: 'UI for technical validation results',
      item_description: 'Component showing technical complexity assessment, effort estimate, and feasibility concerns',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Strategic Fit Display',
      description_raw: 'UI for portfolio alignment results',
      item_description: 'Component showing portfolio synergies, strategic alignment score, and fit recommendations',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Systems Effects Display',
      description_raw: 'UI for second-order effects',
      item_description: 'Component visualizing second and third-order effects identified by Systems Thinker agent',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build Gate Recommendation Engine',
      description_raw: 'Synthesize results into Kill/Revise/Proceed',
      item_description: 'Algorithm combining all validation dimensions into gate recommendation with confidence percentage',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Stage 3.4 Gate UI',
      description_raw: 'Chairman decision interface for gate',
      item_description: 'Full-page gate presentation showing recommendation, supporting evidence, and action buttons',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // STAGE 4 SD
  // ============================================================================
  'SD-IDEATION-STAGE4-001': [
    {
      backlog_title: 'Build Competitive Intel Service',
      description_raw: 'Service to launch Stage 4 competitive crew',
      item_description: 'Service deploying Competitive Intel Mapper and Strategic Fit Analyzer for competitive analysis',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Competitor Profiles Display',
      description_raw: 'UI for competitor information',
      item_description: 'Component showing 5-10 competitor profiles with strengths, weaknesses, and market position',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Competitive Map Visualization',
      description_raw: 'Visual competitive landscape map',
      item_description: 'Interactive visualization positioning venture against competitors on key dimensions',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build Differentiation Opportunities Display',
      description_raw: 'UI for differentiation suggestions',
      item_description: 'Component showing 3+ actionable differentiation opportunities with strategic rationale',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Implement Portfolio Context Injection',
      description_raw: 'Inject existing venture data for synergy detection',
      item_description: 'Service to query existing EHG ventures and inject context for synergy/conflict detection',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    }
  ],

  // ============================================================================
  // STAGE 5 SD
  // ============================================================================
  'SD-IDEATION-STAGE5-001': [
    {
      backlog_title: 'Build Financial Modeling Service',
      description_raw: 'Service to launch Stage 5 financial crew',
      item_description: 'Service deploying Financial Modeler agent with archetype-specific configuration',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Unit Economics Display',
      description_raw: 'UI for unit economics breakdown',
      item_description: 'Component showing CAC, LTV, margins, and other archetype-specific unit economics',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Revenue Projection Display',
      description_raw: 'UI for 3-year revenue projections',
      item_description: 'Interactive chart showing revenue projections with scenario toggle (best/base/worst)',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Profitability Timeline Display',
      description_raw: 'UI for break-even analysis',
      item_description: 'Component showing path to profitability with break-even point highlighted',
      priority: 'Medium',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Implement Archetype Benchmark Validation',
      description_raw: 'Validate projections against archetype benchmarks',
      item_description: 'Service to compare financial projections against archetype benchmarks and flag outliers',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build Recursion Trigger Logic',
      description_raw: 'Trigger return to Stage 3 if economics invalid',
      item_description: 'Logic to detect profitability_score < 60% and trigger recursion to Stage 3',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    }
  ],

  // ============================================================================
  // STAGE 6 SD
  // ============================================================================
  'SD-IDEATION-STAGE6-001': [
    {
      backlog_title: 'Build Risk Assessment Service',
      description_raw: 'Service to launch Stage 6 risk crew',
      item_description: 'Service deploying Risk Assessor and Systems Thinker agents for comprehensive risk evaluation',
      priority: 'High',
      stage_number: 1,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Create Multi-Dimension Risk Display',
      description_raw: 'UI for 4-dimension risk assessment',
      item_description: 'Component showing market, technical, operational, and financial risks with 1-10 scores',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Mitigation Strategies Display',
      description_raw: 'UI for risk mitigation recommendations',
      item_description: 'Component showing mitigation strategies for each high-risk item with effort estimates',
      priority: 'High',
      stage_number: 2,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Build Critical Risk Recursion Trigger',
      description_raw: 'Trigger recursion on critical risks',
      item_description: 'Logic to detect risk_score > 80% and trigger appropriate recursion (Stage 3 or 4)',
      priority: 'Medium',
      stage_number: 3,
      phase: 'EXEC'
    },
    {
      backlog_title: 'Create Ideation Milestone Summary',
      description_raw: 'Generate comprehensive Stage 1-6 summary',
      item_description: 'Service to compile all stage results into final ideation milestone summary report',
      priority: 'High',
      stage_number: 3,
      phase: 'EXEC',
      new_module: true
    },
    {
      backlog_title: 'Build Development Handoff Package',
      description_raw: 'Prepare venture for Stage 7+ development',
      item_description: 'Service to package ideation results for handoff to development milestone (Stages 7-15)',
      priority: 'Medium',
      stage_number: 4,
      phase: 'EXEC'
    }
  ]
};

async function createBacklogItems() {
  console.log('========================================================');
  console.log('📋 Creating Backlog Items for Ideation Milestone SDs');
  console.log('========================================================\n');

  const results = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: []
  };

  for (const [sdId, items] of Object.entries(backlogItems)) {
    console.log(`\n📁 Processing ${sdId} (${items.length} items)`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const backlogId = generateBacklogId(sdId, i + 1);

      const backlogEntry = {
        sd_id: sdId,
        backlog_id: backlogId,
        backlog_title: item.backlog_title,
        description_raw: item.description_raw,
        item_description: item.item_description,
        priority: item.priority,
        stage_number: item.stage_number,
        phase: item.phase,
        new_module: item.new_module || false,
        present_in_latest_import: true,
        extras: {
          acceptance_criteria: item.acceptance_criteria || [],
          created_by: 'LEAD',
          created_at: new Date().toISOString()
        }
      };

      try {
        // Use upsert to handle both insert and update
        const { error } = await supabase
          .from('sd_backlog_map')
          .upsert(backlogEntry, {
            onConflict: 'sd_id,backlog_id'
          });

        if (error) throw error;

        console.log(`   ✅ ${backlogId}: ${item.backlog_title.substring(0, 40)}...`);
        results.created++;
      } catch (err) {
        console.log(`   ❌ ${backlogId}: ${err.message}`);
        results.failed++;
        results.errors.push({ backlogId, error: err.message });
      }
    }
  }

  // Summary
  console.log('\n========================================================');
  console.log('📊 BACKLOG CREATION SUMMARY');
  console.log('========================================================');
  console.log(`✅ Created/Updated: ${results.created}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(({ backlogId, error }) => {
      console.log(`   - ${backlogId}: ${error}`);
    });
  }

  // Show counts per SD
  console.log('\n📁 Items per SD:');
  for (const [sdId, items] of Object.entries(backlogItems)) {
    console.log(`   - ${sdId}: ${items.length} items`);
  }

  const totalItems = Object.values(backlogItems).reduce((sum, items) => sum + items.length, 0);
  console.log(`\n📊 Total: ${totalItems} backlog items across 10 SDs`);

  return results;
}

// Execute
createBacklogItems()
  .then(results => {
    const success = results.failed === 0;
    console.log(success ? '\n✅ All backlog items created successfully!' : '\n⚠️  Some items failed to create');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
