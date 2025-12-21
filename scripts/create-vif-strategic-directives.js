#!/usr/bin/env node

/**
 * Create Venture Ideation Framework (VIF) Strategic Directives
 *
 * Creates 1 parent + 3 child Strategic Directives for VIF implementation:
 * - SD-VIF-PARENT-001: Venture Ideation Framework (parent)
 * - SD-VIF-TIER-001: Tiered Ideation Engine
 * - SD-VIF-INTEL-001: Intelligence Agent Integration (STA + GCIA via LLM)
 * - SD-VIF-REFINE-001: Recursive Refinement Loop
 *
 * Revised assumptions:
 * - No feature flags (deploy when ready)
 * - LLM-based GCIA ($50/month budget, not $500/month)
 * - Chairman-optimized wizard UX (quick capture + smart routing)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const strategicDirectives = [
  // Parent SD
  {
    id: 'SD-VIF-PARENT-001',
    sd_key: 'VIF-PARENT-001',
    title: 'Venture Ideation Framework (VIF)',
    version: '1.0',
    status: 'draft',
    category: 'product_feature',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Next-generation venture ideation system with tiered complexity routing (Tier 0/1/2), LLM-powered competitive intelligence, and recursive refinement. Optimized for Chairman workflow with quick idea capture and smart routing.',
    strategic_intent: 'Enable rapid, high-quality venture creation with automatic complexity assessment and intelligence augmentation. Chairman captures ideas naturally (voice/text), system routes to appropriate tier and provides strategic insights via LLM research.',
    rationale: 'Current venture creation lacks complexity differentiation and strategic intelligence. Chairman needs: (1) quick idea capture without friction, (2) automatic routing based on novelty/investment/alignment, (3) competitive intelligence from LLM research, (4) recursive refinement for complex ventures.',
    scope: 'EHG app venture creation workflow enhancement. Three components: Tiered Ideation Engine, Intelligence Agent Integration (STA + GCIA via LLM), Recursive Refinement Loop.',
    strategic_objectives: [
      'Enable 3-tier venture creation: Tier 0 (MVP sandbox, 70% gates, 15 min), Tier 1 (standard, 85% gates, 4 hours), Tier 2 (deep research, 90% gates, 12 hours)',
      'Automatic complexity assessment based on novelty, investment size, strategic alignment',
      'LLM-powered competitive intelligence (GCIA) for market analysis',
      'Systems Thinking Agent (STA) for second/third-order effects',
      'Recursive refinement with max 2 iterations, +10% quality improvement threshold',
      'Chairman-optimized UX: quick capture, smart routing, progressive disclosure'
    ],
    success_criteria: [
      'Chairman can capture venture idea in <2 minutes (voice or text)',
      'System recommends correct tier with ≥80% accuracy',
      'Tier 0 ventures complete in 15 minutes with 70% quality gate',
      'Tier 1 ventures complete in 4 hours with 85% quality gate',
      'Tier 2 ventures complete in 12 hours with 90% quality gate',
      'GCIA LLM scans cost <$50/month (300+ scans)',
      'Intelligence insights load async without blocking submission',
      'Recursion converges within 2 iterations for 90% of ventures'
    ],
    key_changes: [
      'Extend ventures.metadata with tier, complexity_assessment, recursion_state',
      'Create 2 new tables: venture_augmentation_results, ideation_experiments',
      'Add complexity assessment to VentureCreationDialog',
      'Implement intelligenceAgents.ts service (STA + GCIA via LLM)',
      'Create IntelligenceDrawer component for agent results',
      'Implement recursionLoop.ts for iterative refinement'
    ],
    key_principles: [
      'Chairman workflow first: optimize for speed and clarity',
      'Database-first: all data in tables, no markdown files',
      'No feature flags: deploy when ready (MVP approach)',
      'LLM-powered research: use OpenAI/Anthropic, not external APIs',
      'Progressive disclosure: don\'t block on intelligence agents',
      'Mandatory E2E testing before deployment'
    ],
    metadata: {
      is_parent: true,
      sub_directive_ids: ['SD-VIF-TIER-001', 'SD-VIF-INTEL-001', 'SD-VIF-REFINE-001'],
      framework_type: 'venture_ideation',
      target_users: 'Chairman (primary), Founders (secondary)',
      deployment_strategy: 'Deploy when ready (no gradual rollout)',
      testing_strategy: 'Mandatory E2E via Playwright + QA Engineering Director',
      cost_estimate: {
        gcia_monthly_budget: '$50/month',
        gcia_per_scan: '$0.06-0.15',
        expected_monthly_scans: '300-500'
      },
      timeline: {
        tier_engine: '2 weeks (80 hours)',
        intelligence_agents: '2 weeks (80 hours)',
        recursion_loop: '2 weeks (80 hours)',
        total: '6 weeks (240 hours)'
      }
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // Child SD 1: Tiered Ideation Engine
  {
    id: 'SD-VIF-TIER-001',
    sd_key: 'VIF-TIER-001',
    title: 'Tiered Ideation Engine (Complexity Routing)',
    version: '1.0',
    status: 'draft',
    category: 'product_feature',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Implement 3-tier venture creation system with automatic complexity assessment. Tier 0 (MVP sandbox, 70% gates, 15 min), Tier 1 (standard flow, 85% gates, 4 hours), Tier 2 (deep research, 90% gates, 12 hours). Chairman captures idea, system analyzes and recommends tier.',
    strategic_intent: 'Differentiate venture complexity to optimize resource allocation. Simple ideas (Tier 0) move fast, complex ventures (Tier 2) get deep analysis. Chairman always has override control.',
    rationale: 'Not all ventures need same depth. MVP ideas should move in 15 minutes, not 4 hours. Complex ventures need deeper research and validation. Automatic assessment reduces Chairman decision fatigue.',
    scope: 'Venture creation workflow modifications: complexity assessment algorithm, tier selection UI, metadata extensions, routing logic.',
    strategic_objectives: [
      'Implement complexity assessment algorithm (novelty, investment, strategic alignment)',
      'Add tier selection step to VentureCreationDialog',
      'Extend ventures.metadata with tier and complexity_assessment fields',
      'Create routing logic for Stages 1-3 (Tier 0), Stages 1-10 (Tier 1), Stages 1-15 (Tier 2)',
      'Display tier recommendation with rationale',
      'Allow Chairman to override recommended tier'
    ],
    success_criteria: [
      'Complexity assessment completes in <3 seconds',
      'Tier recommendations are accurate ≥80% of time',
      'Chairman can override tier in 1 click',
      'Tier 0 ventures limited to Stages 1-3',
      'Tier 1 ventures use Stages 1-10',
      'Tier 2 ventures use Stages 1-15',
      'Zero regressions in existing venture creation'
    ],
    key_changes: [
      'Create assessComplexity() function in intelligenceAgents.ts',
      'Modify VentureCreationDialog: add tier selection step after idea capture',
      'Update ventures table metadata schema (JSONB extension)',
      'Create TierIndicator component for display',
      'Wire tier to CompleteWorkflowOrchestrator stage routing'
    ],
    key_principles: [
      'Chairman always has final say (override control)',
      'Show rationale for tier recommendation',
      'Default to Tier 1 if assessment is uncertain',
      'Tier selection doesn\'t block submission',
      'Clear visual differentiation between tiers'
    ],
    metadata: {
      parent_sd_id: 'SD-VIF-PARENT-001',
      sequence_order: 1,
      layer: 'foundation',
      estimated_effort_hours: 80,
      components_to_create: ['TierIndicator.tsx', 'intelligenceAgents.ts (partial)'],
      components_to_modify: ['VentureCreationDialog.tsx', 'CompleteWorkflowOrchestrator.tsx'],
      database_changes: ['ventures.metadata JSONB extension (no schema change)']
    },
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // Child SD 2: Intelligence Agent Integration
  {
    id: 'SD-VIF-INTEL-001',
    sd_key: 'VIF-INTEL-001',
    title: 'Intelligence Agent Integration (STA + GCIA via LLM)',
    version: '1.0',
    status: 'draft',
    category: 'product_feature',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Integrate Systems Thinking Agent (STA) and Global Competitive Intelligence Agent (GCIA) powered by LLM deep research. Agents execute asynchronously at key workflow stages, results displayed in IntelligenceDrawer. Budget cap: $50/month.',
    strategic_intent: 'Augment Chairman decision-making with strategic insights: second/third-order effects (STA) and competitive landscape analysis (GCIA). Intelligence loads progressively without blocking workflow.',
    rationale: 'Chairman needs strategic context for complex ventures. STA identifies unintended consequences (Jevons Paradox, Goodhart\'s Law). GCIA provides market sizing, competitor analysis, white space opportunities. LLM research is cost-effective ($0.06-0.15/scan) vs external APIs ($10/scan).',
    scope: 'Agent orchestration service, IntelligenceDrawer UI component, async execution at Stages 2-5 for Tier 1/2 ventures, budget monitoring.',
    strategic_objectives: [
      'Implement STA for systems thinking analysis (mental models, cascading effects)',
      'Implement GCIA via LLM for competitive intelligence (market size, competitors, white space)',
      'Create intelligenceOrchestrator service for parallel agent execution',
      'Build IntelligenceDrawer component (right-side panel with agent cards)',
      'Integrate agents at Stages 2, 3, 5 for Tier 1/2 ventures',
      'Enforce $50/month budget cap with daily spend monitoring'
    ],
    success_criteria: [
      'STA executes in <30 seconds, provides ≥3 mental models',
      'GCIA executes in <30 seconds, provides market analysis',
      'Both agents run in parallel (total time <30 seconds, not 60)',
      'IntelligenceDrawer displays results with quality scores',
      'Monthly LLM spend stays under $50',
      'Chairman can dismiss/expand agent insights',
      'Zero blocking on agent execution (async with progress indicator)'
    ],
    key_changes: [
      'Create intelligenceOrchestrator service in intelligenceAgents.ts',
      'Implement STA prompt template for systems thinking',
      'Implement GCIA prompt template for competitive intelligence',
      'Create IntelligenceDrawer.tsx component (shadcn Sheet)',
      'Create AgentResultCard.tsx for displaying insights',
      'Add venture_augmentation_results table for storing agent data',
      'Wire agents to CompleteWorkflowOrchestrator at Stages 2, 3, 5',
      'Implement budget monitoring with Supabase function'
    ],
    key_principles: [
      'Async execution: never block Chairman workflow',
      'Parallel agents: run STA + GCIA simultaneously',
      'Progressive disclosure: show results as they arrive',
      'Budget discipline: hard cap at $50/month',
      'Quality over speed: 30-second timeout per agent',
      'Graceful degradation: if agent fails, show error but proceed'
    ],
    metadata: {
      parent_sd_id: 'SD-VIF-PARENT-001',
      sequence_order: 2,
      layer: 'intelligence',
      estimated_effort_hours: 80,
      components_to_create: [
        'IntelligenceDrawer.tsx (250 LOC)',
        'AgentResultCard.tsx (100 LOC)',
        'intelligenceOrchestrator (400 LOC in intelligenceAgents.ts)'
      ],
      database_changes: [
        'CREATE TABLE venture_augmentation_results (agent_type, analysis_data JSONB, quality_score, execution_time_ms)'
      ],
      llm_configuration: {
        provider: 'OpenAI or Anthropic',
        model: 'gpt-4o or claude-sonnet-3.5',
        cost_per_scan: '$0.06-0.15',
        monthly_budget: '$50',
        expected_scans: '300-500/month',
        timeout: '30 seconds per agent'
      }
    },
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // Child SD 3: Recursive Refinement Loop
  {
    id: 'SD-VIF-REFINE-001',
    sd_key: 'VIF-REFINE-001',
    title: 'Recursive Refinement Loop',
    version: '1.0',
    status: 'draft',
    category: 'product_feature',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Implement recursive evaluation loop with max 2 iterations, +10% quality improvement threshold, and convergence detection. Chairman can skip refinement or escalate non-converging ventures.',
    strategic_intent: 'Enable iterative quality improvement for complex ventures without infinite loops. System detects when additional refinement adds value vs diminishing returns.',
    rationale: 'Some ventures benefit from refinement (e.g., 72% quality → 83% quality after rework). Others plateau quickly. Limit to 2 iterations prevents over-engineering. +10% threshold ensures meaningful improvement.',
    scope: 'Recursion state management, iteration tracking, quality convergence detection, RecursionIndicator UI, Chairman escalation workflow.',
    strategic_objectives: [
      'Implement recursionLoop service for iteration management',
      'Track quality scores across iterations (detect improvement)',
      'Enforce max 2 iterations (prevent infinite loops)',
      'Require +10% quality improvement to continue refinement',
      'Create RecursionIndicator component showing progress',
      'Add "Skip Refinement" option for Chairman override',
      'Escalate non-converging ventures to Chairman for decision'
    ],
    success_criteria: [
      'Recursion limited to max 2 iterations',
      'Quality improvement ≥10% required to proceed to iteration 2',
      'RecursionIndicator shows: current iteration, quality delta, time elapsed',
      'Chairman can skip refinement at any point',
      'Non-converging ventures escalate to Chairman with context',
      '≥90% of ventures converge within 2 iterations',
      'Zero infinite loops in production'
    ],
    key_changes: [
      'Create recursionLoop.ts service for state management',
      'Extend ventures.metadata with recursion_state (current_iteration, quality_scores, converged)',
      'Create RecursionIndicator.tsx component (Alert with progress)',
      'Wire recursion check to workflow stage submission',
      'Implement quality convergence detection logic',
      'Add Chairman escalation workflow for non-converging ventures',
      'Create ideation_experiments table for learning loop tracking'
    ],
    key_principles: [
      'Hard limit: max 2 iterations (simplicity over flexibility)',
      'Meaningful improvement: +10% quality threshold',
      'Chairman control: can skip refinement anytime',
      'Transparent progress: show quality delta and iteration count',
      'Escalation over automation: if not converging, involve Chairman',
      'Learning loop: track experiments for optimization'
    ],
    metadata: {
      parent_sd_id: 'SD-VIF-PARENT-001',
      sequence_order: 3,
      layer: 'optimization',
      estimated_effort_hours: 80,
      components_to_create: [
        'recursionLoop.ts (300 LOC)',
        'RecursionIndicator.tsx (100 LOC)'
      ],
      database_changes: [
        'ventures.metadata.recursion_state JSONB extension',
        'CREATE TABLE ideation_experiments (tier, configuration JSONB, total_time_minutes, gates_passed, recursion_iterations)'
      ],
      recursion_rules: {
        max_iterations: 2,
        improvement_threshold: '10%',
        iteration_timeout: '30 seconds',
        convergence_detection: 'Quality score delta <5% = converged',
        escalation_trigger: 'Non-convergence after 2 iterations'
      }
    },
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function insertStrategicDirective(sd) {
  console.log(`\n📋 Inserting ${sd.id}: ${sd.title}...`);

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', sd.id)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sd)
        .eq('id', sd.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} updated successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} created successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
    }
  } catch (error) {
    console.error(`❌ Error with ${sd.id}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating VIF Strategic Directives');
  console.log('='.repeat(60));
  console.log(`Total SDs to create: ${strategicDirectives.length}`);
  console.log('='.repeat(60));

  // Insert one at a time (database-first rule: one table at a time)
  for (const sd of strategicDirectives) {
    await insertStrategicDirective(sd);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All Strategic Directives created successfully!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Total SDs: ${strategicDirectives.length}`);
  console.log(`   Critical: ${strategicDirectives.filter(sd => sd.priority === 'critical').length}`);
  console.log(`   High: ${strategicDirectives.filter(sd => sd.priority === 'high').length}`);
  console.log(`   Medium: ${strategicDirectives.filter(sd => sd.priority === 'medium').length}`);
  console.log('\n🎯 Next Steps:');
  console.log('   1. Review SDs in EHG_Engineer dashboard');
  console.log('   2. LEAD pre-approval validation (Systems Analyst, Database Architect, Security, Design)');
  console.log('   3. PLAN phase: Create PRDs with user stories');
  console.log('   4. Navigate to /mnt/c/_EHG/EHG/ for implementation');
  console.log('   5. Execute LEAD→PLAN→EXEC workflow');
}

main().catch(console.error);
