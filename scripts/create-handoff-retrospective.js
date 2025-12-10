#!/usr/bin/env node
/**
 * Create Handoff Retrospective
 * Creates a retrospective focused on a specific handoff type
 *
 * Usage:
 *   node scripts/create-handoff-retrospective.js LEAD_TO_PLAN SD-XXX-001
 *   node scripts/create-handoff-retrospective.js PLAN_TO_EXEC SD-XXX-001
 *   node scripts/create-handoff-retrospective.js EXEC_TO_PLAN SD-XXX-001
 *   node scripts/create-handoff-retrospective.js PLAN_TO_LEAD SD-XXX-001
 */

import { createClient } from '@supabase/supabase-js';
import inquirer from 'inquirer';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Focus areas by handoff type
const FOCUS_AREAS = {
  LEAD_TO_PLAN: [
    'Strategic Directive Clarity',
    'Simplicity Assessment Effectiveness',
    'INVEST Criteria Validation',
    'Scope Boundary Definition',
    'Approval Process Quality',
    'Risk Identification Completeness'
  ],
  PLAN_TO_EXEC: [
    'PRD Completeness and Quality',
    'BMAD Validation Effectiveness',
    'Test Plan Adequacy',
    'Risk Assessment Coverage',
    'User Story Clarity',
    'Acceptance Criteria Quality',
    'Sub-agent Orchestration'
  ],
  EXEC_TO_PLAN: [
    'Implementation Fidelity',
    'Test Coverage and Quality',
    'E2E Test Mapping',
    'Deliverable Completeness',
    'Traceability Validation',
    'Code Quality',
    'Documentation Accuracy'
  ],
  PLAN_TO_LEAD: [
    'Verification Thoroughness',
    'Implementation vs Requirements',
    'Quality Gate Compliance',
    'Workflow ROI Assessment',
    'Closure Readiness',
    'Success Criteria Met'
  ]
};

const HANDOFF_TITLES = {
  LEAD_TO_PLAN: 'Strategic Approval → PRD Creation',
  PLAN_TO_EXEC: 'Planning → Implementation',
  EXEC_TO_PLAN: 'Implementation → Verification',
  PLAN_TO_LEAD: 'Verification → Final Approval'
};

async function main() {
  const args = process.argv.slice(2);
  const handoffType = args[0]?.toUpperCase().replace('-', '_');
  const sdId = args[1];

  if (!handoffType || !sdId) {
    console.log('Usage: node scripts/create-handoff-retrospective.js HANDOFF_TYPE SD-ID');
    console.log('');
    console.log('Handoff Types:');
    console.log('  LEAD_TO_PLAN   - Strategic to Planning handoff');
    console.log('  PLAN_TO_EXEC   - Planning to Execution handoff');
    console.log('  EXEC_TO_PLAN   - Execution to Verification handoff');
    console.log('  PLAN_TO_LEAD   - Verification to Final Approval handoff');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/create-handoff-retrospective.js PLAN_TO_EXEC SD-EXAMPLE-001');
    process.exit(1);
  }

  if (!FOCUS_AREAS[handoffType]) {
    console.log(`❌ Invalid handoff type: ${handoffType}`);
    console.log('Valid types: LEAD_TO_PLAN, PLAN_TO_EXEC, EXEC_TO_PLAN, PLAN_TO_LEAD');
    process.exit(1);
  }

  // Check if SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (sdError || !sd) {
    console.log(`❌ Strategic Directive ${sdId} not found`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📝 CREATE HANDOFF RETROSPECTIVE: ${HANDOFF_TITLES[handoffType]}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`SD: ${sdId}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Type: ${handoffType}`);
  console.log('');

  const focusAreas = FOCUS_AREAS[handoffType];

  console.log('Focus Areas for this handoff:');
  focusAreas.forEach((area, idx) => {
    console.log(`  ${idx + 1}. ${area}`);
  });
  console.log('');

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceedPrompts',
      message: 'Ready to provide retrospective details?',
      default: true
    }
  ]);

  if (!answers.proceedPrompts) {
    console.log('Cancelled.');
    process.exit(0);
  }

  // Collect responses for each focus area
  const focusAreaResponses = [];

  for (const area of focusAreas) {
    console.log('');
    console.log(`Focus Area: ${area}`);
    console.log('-'.repeat(60));

    const response = await inquirer.prompt([
      {
        type: 'list',
        name: 'effectiveness',
        message: 'How effective was this aspect?',
        choices: ['Excellent', 'Good', 'Fair', 'Poor', 'N/A']
      },
      {
        type: 'editor',
        name: 'notes',
        message: 'Notes/observations (opens editor):',
        when: (ans) => ans.effectiveness !== 'N/A'
      },
      {
        type: 'editor',
        name: 'improvements',
        message: 'Suggested improvements (opens editor):',
        when: (ans) => ans.effectiveness !== 'N/A' && ['Fair', 'Poor'].includes(ans.effectiveness)
      }
    ]);

    if (response.effectiveness !== 'N/A') {
      focusAreaResponses.push({
        area,
        effectiveness: response.effectiveness,
        notes: response.notes || '',
        improvements: response.improvements || ''
      });
    }
  }

  // Overall handoff quality
  console.log('');
  console.log('Overall Handoff Assessment');
  console.log('-'.repeat(60));

  const overall = await inquirer.prompt([
    {
      type: 'list',
      name: 'handoffQuality',
      message: 'Overall handoff quality:',
      choices: ['Excellent', 'Good', 'Fair', 'Poor']
    },
    {
      type: 'editor',
      name: 'successStories',
      message: 'What worked well? (success stories, opens editor):'
    },
    {
      type: 'editor',
      name: 'painPoints',
      message: 'What were the pain points? (opens editor):'
    },
    {
      type: 'editor',
      name: 'protocolImprovements',
      message: 'Protocol improvements (specific, actionable, opens editor):'
    },
    {
      type: 'input',
      name: 'qualityScore',
      message: 'Quality score (0-100):',
      default: '75',
      validate: (input) => {
        const num = parseInt(input);
        return (num >= 0 && num <= 100) || 'Score must be 0-100';
      }
    }
  ]);

  // Parse protocol improvements
  const protocolImprovementsArray = parseProtocolImprovements(
    overall.protocolImprovements,
    handoffType
  );

  // Parse success stories
  const successStoriesArray = parseListItems(overall.successStories, {
    pattern: 'Handoff success',
    impact: 'Positive'
  });

  // Parse pain points
  const painPointsArray = parseListItems(overall.painPoints, {
    category: 'HANDOFF',
    severity: 'medium'
  });

  // Create retrospective
  const retrospective = {
    sd_id: sdId,
    title: `${handoffType} Handoff Retrospective - ${sdId}`,
    learning_category: 'HANDOFF_QUALITY',
    conducted_date: new Date().toISOString(),
    focus_areas: focusAreaResponses,
    success_stories: successStoriesArray,
    pain_points: painPointsArray,
    protocol_improvements: protocolImprovementsArray,
    quality_score: parseInt(overall.qualityScore),
    handoff_type: handoffType,
    handoff_quality: overall.handoffQuality,
    metadata: {
      created_via: 'create-handoff-retrospective.js',
      handoff_type: handoffType,
      focus_areas_count: focusAreaResponses.length
    }
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 RETROSPECTIVE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Title: ${retrospective.title}`);
  console.log(`Quality Score: ${retrospective.quality_score}/100`);
  console.log(`Handoff Quality: ${retrospective.handoff_quality}`);
  console.log(`Focus Areas Addressed: ${focusAreaResponses.length}`);
  console.log(`Success Stories: ${successStoriesArray.length}`);
  console.log(`Pain Points: ${painPointsArray.length}`);
  console.log(`Protocol Improvements: ${protocolImprovementsArray.length}`);
  console.log('');

  const confirm = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'save',
      message: 'Save this retrospective to database?',
      default: true
    }
  ]);

  if (!confirm.save) {
    console.log('Cancelled.');
    process.exit(0);
  }

  // Save to database
  const { data, error } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select()
    .single();

  if (error) {
    console.error('❌ Error saving retrospective:', error);
    process.exit(1);
  }

  console.log('');
  console.log('✅ Retrospective created successfully!');
  console.log(`   ID: ${data.id}`);
  console.log('');
}

/**
 * Parse protocol improvements from text
 */
function parseProtocolImprovements(text, handoffType) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').filter(l => l.trim());
  const improvements = [];

  for (const line of lines) {
    const cleaned = line.trim().replace(/^[-*•]\s*/, '');
    if (cleaned.length < 10) continue;

    improvements.push({
      category: 'HANDOFF',
      improvement: cleaned,
      evidence: `Identified during ${handoffType} retrospective`,
      impact: 'medium',
      affected_phase: extractPhaseFromHandoffType(handoffType)
    });
  }

  return improvements;
}

/**
 * Parse list items (success stories, pain points)
 */
function parseListItems(text, defaults = {}) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').filter(l => l.trim());
  const items = [];

  for (const line of lines) {
    const cleaned = line.trim().replace(/^[-*•]\s*/, '');
    if (cleaned.length < 5) continue;

    items.push({
      description: cleaned,
      ...defaults
    });
  }

  return items;
}

/**
 * Extract phase from handoff type
 */
function extractPhaseFromHandoffType(handoffType) {
  if (handoffType.includes('LEAD')) return 'LEAD';
  if (handoffType.includes('PLAN')) return 'PLAN';
  if (handoffType.includes('EXEC')) return 'EXEC';
  return null;
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
