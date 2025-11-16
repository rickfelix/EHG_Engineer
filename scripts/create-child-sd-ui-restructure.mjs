#!/usr/bin/env node

/**
 * Create Child SD: SD-STAGE4-UI-RESTRUCTURE-001
 * Child of SD-STAGE4-AI-FIRST-UX-001
 * Focus: UI Component Reorganization for AI-First Workflow
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createChildSD() {
  console.log('Creating Child SD: UI Restructure...\n');

  const sdData = {
    id: 'SD-STAGE4-UI-RESTRUCTURE-001',
    sd_key: 'SD-STAGE4-UI-RESTRUCTURE-001',
    title: 'Stage 4 UI Restructure for AI-First Workflow',
    parent_sd_id: 'SD-STAGE4-AI-FIRST-UX-001',
    version: '1.0',
    status: 'active',
    priority: 'high',
    category: 'feature',
    sd_type: 'feature',
    current_phase: 'PLAN',

    description: 'Restructure Stage 4 UI components to prioritize AI-driven workflow. Move manual competitor entry to Advanced Settings accordion, create prominent AI progress card component, and implement navigation blocking logic during AI analysis.',

    rationale: 'Current UI presents manual entry as the primary workflow, hiding AI capabilities. This child SD focuses specifically on the UI restructuring needed to make AI the primary path.',

    scope: `INCLUDED:
- Move existing manual competitor entry forms to "Advanced Settings" accordion (collapsed by default)
- Create new AIProgressCard component for prominent progress display
- Implement navigation blocking logic in CompetitiveIntelligence.tsx
- Update UI layout to feature AI workflow prominently
- Add Skip button with confirmation modal

EXCLUDED:
- Backend integration (handled by SD-STAGE4-AGENT-PROGRESS-001)
- Data transformation (handled by SD-STAGE4-RESULTS-DISPLAY-001)
- Error handling flows (handled by SD-STAGE4-ERROR-HANDLING-001)`,

    strategic_intent: 'Make AI-driven competitive analysis the visually prominent default workflow while preserving manual entry as an advanced fallback option.',

    strategic_objectives: [
      {
        objective: "Reposition manual entry as advanced/fallback option",
        rationale: "Users explicitly stated they won't manually enter competitor data",
        success_indicator: "Manual entry forms hidden in collapsed accordion by default"
      },
      {
        objective: "Create prominent AI progress visualization",
        rationale: "Visible progress builds trust and showcases AI capabilities",
        success_indicator: "Progress card displayed prominently at top of Stage 4"
      },
      {
        objective: "Prevent premature navigation during AI analysis",
        rationale: "Ensure users wait for AI results rather than skipping",
        success_indicator: "Navigation blocked with clear skip option available"
      }
    ],

    success_metrics: [
      {
        metric: "Manual Entry Visibility",
        target: "Hidden by default (0 clicks to view AI, 1 click to view manual)",
        measurement: "UI component visibility state",
        baseline: "Manual entry visible by default"
      },
      {
        metric: "Progress Card Prominence",
        target: "Above the fold, ≥400px height when expanded",
        measurement: "Component position and size",
        baseline: "No progress visualization"
      },
      {
        metric: "Navigation Control",
        target: "100% blocking during AI analysis with skip option",
        measurement: "Button state during agent_status='running'",
        baseline: "No navigation control"
      }
    ],

    key_principles: [
      "Visual hierarchy: AI workflow above manual entry",
      "Progressive disclosure: Advanced options hidden by default",
      "User control: Always provide skip/cancel options",
      "Clear feedback: Show what AI is doing at all times",
      "Graceful degradation: Manual entry always accessible as fallback"
    ],

    success_criteria: [
      {
        criterion: 'Manual entry moved to Advanced Settings accordion',
        measure: 'Accordion component exists, collapsed by default, contains all manual forms'
      },
      {
        criterion: 'AI progress card prominently displayed',
        measure: 'Progress card at top of Stage 4, shows task name and percentage'
      },
      {
        criterion: 'Navigation properly blocked during analysis',
        measure: 'Next/Back buttons disabled when agent_status="running"'
      },
      {
        criterion: 'Skip functionality implemented',
        measure: 'Skip button appears after 10 seconds, shows confirmation modal'
      }
    ],

    dependencies: [
      {
        dependency: 'CompetitiveIntelligence.tsx component exists',
        type: 'technical',
        status: 'ready'
      },
      {
        dependency: 'Shadcn UI components available',
        type: 'technical',
        status: 'ready'
      },
      {
        dependency: 'Parent SD approved (SD-STAGE4-AI-FIRST-UX-001)',
        type: 'process',
        status: 'ready'
      }
    ],

    risks: [
      {
        risk: 'Users confused by hidden manual entry',
        severity: 'low',
        mitigation: 'Clear "Advanced Settings" label, help tooltip explaining AI-first approach'
      },
      {
        risk: 'Progress card takes too much screen space',
        severity: 'low',
        mitigation: 'Collapsible progress card, minimize button to show just status bar'
      }
    ],

    metadata: {
      parent_sd: 'SD-STAGE4-AI-FIRST-UX-001',
      estimated_effort: '2-3 days',
      components_affected: [
        'CompetitiveIntelligence.tsx',
        'AIProgressCard.tsx (new)',
        'AdvancedSettingsAccordion.tsx (new)',
        'useCompetitiveIntelligence.ts (updates)'
      ]
    },

    sequence_rank: 851,
    created_by: 'PLAN',
    target_application: 'EHG'
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating child SD:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log('✅ Child SD created successfully!');
    console.log('ID:', data.id);
    console.log('Title:', data.title);
    console.log('Parent:', data.parent_sd_id);
    console.log('\nNext: Create PRD for this child SD');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createChildSD();