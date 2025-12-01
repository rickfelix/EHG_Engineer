#!/usr/bin/env node

/**
 * Create Stage 1-2 Implementation Backlog Strategic Directives
 *
 * Creates backlog SDs for implementing Stage 1 (Draft Idea Capture) and
 * Stage 2 (AI Multi-Perspective Review) orchestrators.
 *
 * These SDs address the gap identified in SD-STAGE7-PREREQ-001's 8-wave assessment:
 * - Stages 1-2 currently use generic agent pool (no dedicated orchestrators)
 * - 25% of Stage 6 composite score uses default values (50.0)
 * - IDEATION phase only 40% complete without these implementations
 *
 * Documentation Reference: /docs/STAGE_1_2_LIMITATION.md
 * PRD References:
 *   - Stage 1: /enhanced_prds/20_workflows/01a_draft_idea.md
 *   - Stage 2: /enhanced_prds/20_workflows/02_ai_review.md
 *
 * Created: 2025-11-28 (SD-STAGE7-PREREQ-001)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// STAGE 1 IMPLEMENTATION SD
// ============================================================================
const stage1SD = {
  id: 'SD-STAGE1-IMPL-001',
  sd_key: 'STAGE1-IMPL-001',
  title: 'Stage 1: Draft Idea Orchestrator Implementation',
  version: '1.0',
  status: 'draft',
  category: 'feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  sd_type: 'feature',

  description: `Implement Stage 1 dedicated orchestrator for the 40-Stage Venture Wizard workflow.

Currently, Stage 1 (Draft Idea) uses the generic crewai_agents pool without specialized validation.
This SD creates a Stage1Orchestrator following the established patterns from Stages 3-6.

Stage 1 Purpose: Capture and structure raw venture ideas with initial validation.

Key Components to Implement:
- Stage1Orchestrator: Coordinates idea capture flow
- IdeaCaptureValidator: Validates input against schema (title 3-120 chars, description 20-2000 chars)
- InitialRiskAssessor: Preliminary risk identification
- ChairmanVoiceHandler: Process voice feedback (if available)

PRD Reference: /enhanced_prds/20_workflows/01a_draft_idea.md`,

  strategic_intent: `Complete the IDEATION phase foundation by implementing Stage 1.
This enables proper weighted scoring in Stage 6 (currently using 50.0 default for 10% weight).`,

  rationale: `Without Stage 1 implementation:
- Stage 6 composite score is impacted by default 50.0 value (10% weight)
- No schema validation occurs before Stage 3
- Chairman voice feedback not captured
- No initial risk flagging before full validation`,

  scope: `Stage 1 components in agent-platform:
- app/agents/stage1/__init__.py
- app/agents/stage1/stage1_orchestrator.py
- app/agents/stage1/idea_capture_validator.py
- app/agents/stage1/initial_risk_assessor.py
- tests/unit/stage1/*.py
- tests/e2e/stage1/*.py`,

  strategic_objectives: [
    'Create Stage1Orchestrator following Stage 3-6 patterns',
    'Implement schema validation for idea input',
    'Add initial risk assessment capability',
    'Integrate with VentureDecision unified enum',
    'Output unified_decision field for downstream stages'
  ],

  success_criteria: [
    'Stage1Orchestrator executes without errors',
    'Idea schema validation enforced',
    'Output includes unified_decision field',
    'Unit tests pass with ≥80% coverage',
    'E2E test validates Stage 1→2 flow'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-STAGE7-PREREQ-001',
      description: 'Unified VentureDecision enum'
    },
    {
      type: 'internal',
      sd_id: null,
      description: 'Stage 1 PRD (01a_draft_idea.md)'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Voice integration may add complexity',
      likelihood: 'medium',
      impact: 'low',
      mitigation: 'Make voice handling optional, text-first approach'
    }
  ],

  success_metrics: [
    {
      metric: 'Test Coverage',
      target: '≥80%',
      measurement: 'pytest --cov'
    },
    {
      metric: 'Stage 1 Execution Time',
      target: '<30 seconds',
      measurement: 'Performance test'
    }
  ],

  metadata: {
    wizard_stage: 1,
    phase: 'IDEATION',
    assessment_reference: 'SD-STAGE7-PREREQ-001',
    limitation_doc: '/docs/STAGE_1_2_LIMITATION.md',
    estimated_loc: '400-600'
  },

  created_by: 'Claude Code',
  created_at: new Date().toISOString()
};

// ============================================================================
// STAGE 2 IMPLEMENTATION SD
// ============================================================================
const stage2SD = {
  id: 'SD-STAGE2-IMPL-001',
  sd_key: 'STAGE2-IMPL-001',
  title: 'Stage 2: AI Multi-Perspective Review Orchestrator Implementation',
  version: '1.0',
  status: 'draft',
  category: 'feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  sd_type: 'feature',

  description: `Implement Stage 2 dedicated orchestrator for the 40-Stage Venture Wizard workflow.

Currently, Stage 2 (AI Review) uses the generic crewai_agents pool without structured critique.
This SD creates a Stage2Orchestrator following the established patterns from Stages 3-6.

Stage 2 Purpose: Multi-agent AI critique and contrarian analysis of venture ideas.

Key Components to Implement:
- Stage2Orchestrator: Coordinates multi-perspective review
- MultiPerspectiveReviewer: Runs 3+ AI agent perspectives
- ContrarianAnalyzer: Devil's advocate analysis
- RiskPrioritizer: Top-5 risk extraction
- CritiqueSynthesizer: Aggregates perspectives into report

PRD Reference: /enhanced_prds/20_workflows/02_ai_review.md`,

  strategic_intent: `Complete the IDEATION phase with Stage 2 AI review capability.
This enables proper weighted scoring in Stage 6 (currently using 50.0 default for 15% weight).`,

  rationale: `Without Stage 2 implementation:
- Stage 6 composite score is impacted by default 50.0 value (15% weight)
- No multi-perspective AI critique before Stage 3
- No contrarian analysis challenges assumptions
- Top-5 risks not identified early
Combined with Stage 1 gap: 25% of composite score uses defaults.`,

  scope: `Stage 2 components in agent-platform:
- app/agents/stage2/__init__.py
- app/agents/stage2/stage2_orchestrator.py
- app/agents/stage2/multi_perspective_reviewer.py
- app/agents/stage2/contrarian_analyzer.py
- app/agents/stage2/risk_prioritizer.py
- app/agents/stage2/critique_synthesizer.py
- tests/unit/stage2/*.py
- tests/e2e/stage2/*.py`,

  strategic_objectives: [
    'Create Stage2Orchestrator following Stage 3-6 patterns',
    'Implement 3+ AI perspective review system',
    'Add contrarian/devil\'s advocate analysis',
    'Extract and prioritize top-5 risks',
    'Integrate with VentureDecision unified enum',
    'Output unified_decision field for Stage 3'
  ],

  success_criteria: [
    'Stage2Orchestrator executes without errors',
    'Multi-perspective review generates 3+ distinct viewpoints',
    'Contrarian analysis challenges key assumptions',
    'Top-5 risks extracted and ranked',
    'Output includes unified_decision field',
    'Unit tests pass with ≥80% coverage',
    'E2E test validates Stage 2→3 flow'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-STAGE1-IMPL-001',
      description: 'Stage 1 must be implemented first (provides input)'
    },
    {
      type: 'internal',
      sd_id: 'SD-STAGE7-PREREQ-001',
      description: 'Unified VentureDecision enum'
    },
    {
      type: 'internal',
      sd_id: null,
      description: 'Stage 2 PRD (02_ai_review.md)'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Multi-agent coordination may be complex',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Follow Stage 3-4 patterns for agent coordination'
    },
    {
      id: 'R2',
      description: 'LLM cost for 3+ perspectives',
      likelihood: 'low',
      impact: 'medium',
      mitigation: 'Use tiered models (GPT-4o-mini for initial, GPT-4o for synthesis)'
    }
  ],

  success_metrics: [
    {
      metric: 'Test Coverage',
      target: '≥80%',
      measurement: 'pytest --cov'
    },
    {
      metric: 'Stage 2 Execution Time',
      target: '<60 seconds',
      measurement: 'Performance test'
    },
    {
      metric: 'Perspective Diversity',
      target: '≥3 distinct viewpoints',
      measurement: 'Manual review'
    }
  ],

  metadata: {
    wizard_stage: 2,
    phase: 'IDEATION',
    assessment_reference: 'SD-STAGE7-PREREQ-001',
    limitation_doc: '/docs/STAGE_1_2_LIMITATION.md',
    estimated_loc: '500-700',
    depends_on_stage: 1
  },

  created_by: 'Claude Code',
  created_at: new Date().toISOString()
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function createBacklogSDs() {
  console.log('Creating Stage 1-2 Implementation Backlog SDs...\n');

  const sds = [stage1SD, stage2SD];

  for (const sd of sds) {
    console.log(`Creating ${sd.id}: ${sd.title}`);

    try {
      // Check if SD already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        console.log(`  ⚠️  SD ${sd.id} already exists, skipping...`);
        continue;
      }

      // Insert new SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) {
        console.error(`  ❌ Error creating ${sd.id}:`, error.message);
      } else {
        console.log(`  ✅ Created ${sd.id} successfully`);
      }
    } catch (err) {
      console.error(`  ❌ Exception creating ${sd.id}:`, err.message);
    }
  }

  console.log('\n--- Summary ---');
  console.log('SDs created:');
  console.log('  - SD-STAGE1-IMPL-001: Stage 1 Draft Idea Orchestrator');
  console.log('  - SD-STAGE2-IMPL-001: Stage 2 AI Review Orchestrator');
  console.log('\nThese SDs are in BACKLOG status and depend on SD-STAGE7-PREREQ-001.');
  console.log('Documentation: /docs/STAGE_1_2_LIMITATION.md');
}

// Run
createBacklogSDs()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
