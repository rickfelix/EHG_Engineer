#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-LEO-LEARN-001
 * Proactive Learning Integration for LEO Protocol
 *
 * Transforms LEO Protocol from reactive (search when stuck) to proactive
 * (consult lessons before starting) by integrating mandatory knowledge
 * retrieval checkpoints into all three phases.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createProactiveLearningSD() {
  console.log('📚 Creating Strategic Directive: Proactive Learning Integration');
  console.log('================================================================\n');

  const strategicDirective = {
    id: 'SD-LEO-LEARN-001',
    uuid_id: randomUUID(),
    sd_key: 'SD-LEO-LEARN-001',
    title: 'Proactive Learning Integration for LEO Protocol',
    version: '1.0',
    status: 'draft',
    category: 'Process Improvement',
    priority: 'high',
    target_application: 'EHG_Engineer',
    current_phase: 'IDEATION',

    description: 'Transform LEO Protocol from reactive knowledge retrieval (search when encountering errors) to proactive knowledge consultation (automatically retrieve relevant lessons before starting each phase). Adds mandatory checkpoints to EXEC, PLAN, and LEAD phases with supporting automation scripts.',

    strategic_intent: 'Shift from "learn from mistakes" to "prevent mistakes by learning first". Enable agents to leverage accumulated knowledge proactively rather than reactively, reducing error rates, implementation time, and repeated mistakes across SDs.',

    rationale: 'Current LEO Protocol has robust retrospective generation and searchable issue patterns (97+ retrospectives, 8+ patterns), but knowledge retrieval is primarily reactive—triggered by errors. Agents may not consult historical context before starting work, leading to repeated issues. Proactive integration ensures every SD benefits from prior learnings.',

    scope: 'Enhance 5 CLAUDE protocol files (LEAD, PLAN, EXEC, CORE, router), create 2 automation scripts (phase-preflight.js, generate-knowledge-summary.js), update handoff templates, modify session prologue, comprehensive testing.',

    key_changes: [
      'Add "Pre-Implementation Knowledge Retrieval" section to CLAUDE_EXEC.md (MANDATORY)',
      'Add "Automated PRD Enrichment" section to CLAUDE_PLAN.md (MANDATORY)',
      'Add "Historical Context Review" section to CLAUDE_LEAD.md (RECOMMENDED)',
      'Update CLAUDE_CORE.md Quick Reference with knowledge retrieval commands',
      'Update CLAUDE.md router to mention proactive learning',
      'Create phase-preflight.js: automated knowledge retrieval at phase start',
      'Create generate-knowledge-summary.js: AI-optimized lesson summaries',
      'Update handoff templates with "Patterns Consulted" section',
      'Update session prologue to mention preflight checks',
      'Test scripts with completed SDs across multiple categories',
      'Integrate with existing learning history system (issue_patterns, retrospectives)'
    ],

    strategic_objectives: [
      'Reduce repeated mistakes: 60%+ of issues resolved via historical search before escalation',
      'Improve implementation quality: Fewer errors due to proactive prevention',
      'Decrease resolution time: Apply proven solutions preemptively',
      'Enhance knowledge utilization: 100% of SDs consult prior learnings',
      'Build institutional memory: Every SD builds on previous work',
      'Enable continuous improvement: Systematic application of retrospective insights'
    ],

    success_criteria: [
      '100% of EXEC implementations run phase-preflight before coding',
      '100% of PRDs enriched with automated research',
      '80%+ of LEAD approvals include historical context review',
      '100% of handoffs document "Patterns Consulted" section',
      'Session prologue updated with proactive learning requirements',
      '60%+ pattern reference rate in handoffs (measured via text analysis)',
      'New scripts tested successfully with 5+ completed SDs',
      'Zero script crashes with empty database (graceful degradation)',
      'Documentation clear: agents understand when/how to use new tools',
      'LEO Protocol version updated to v4.4.0 (proactive learning)'
    ],

    key_principles: [
      'Proactive over reactive: Consult lessons before encountering issues',
      'Mandatory where high-value: EXEC/PLAN must retrieve, LEAD recommended',
      'Graceful degradation: Scripts work even with empty knowledge base',
      'Concise output: Summaries ≤500 chars to prevent information overload',
      'Integration not disruption: Enhance existing workflow, don\'t replace',
      'Evidence-based: Track pattern consultation rates in handoffs',
      'Backward compatible: Existing workflows continue if scripts unavailable',
      'Continuous feedback: Monitor usage, iterate on relevance algorithms'
    ],

    implementation_guidelines: [
      'Follow existing script patterns (search-prior-issues.js, auto-extract-patterns-from-retro.js)',
      'Use database-first approach: Query retrospectives and issue_patterns tables',
      'Test with real completed SDs before deployment',
      'Document all CLI flags and output formats clearly',
      'Add error handling for missing environment variables',
      'Include usage examples in script headers',
      'Update all relevant documentation in single commit',
      'Verify scripts work in both EHG_Engineer and EHG contexts',
      'Create clear examples showing pattern consultation in handoffs',
      'Eat our own dog food: Use enhanced PLAN process for PRD creation'
    ],

    dependencies: [
      'Learning History System (issue_patterns table, search-prior-issues.js)',
      'Retrospectives table (97+ existing retrospectives)',
      'Knowledge Retrieval System (SD-KNOWLEDGE-001 infrastructure)',
      'CLAUDE protocol files (LEAD.md, PLAN.md, EXEC.md, CORE.md)',
      'Handoff template system (templates/config/handoff-templates.json)'
    ],

    risks: [
      'Information overload - Mitigation: Keep summaries concise (≤500 chars)',
      'Low adoption if optional - Mitigation: Make EXEC/PLAN mandatory, LEAD recommended',
      'Script failures disrupt workflow - Mitigation: Graceful degradation, backward compatibility',
      'Irrelevant pattern suggestions - Mitigation: Test with real SDs, refine ranking algorithm',
      'Adds time overhead to phases - Mitigation: Scripts run in <30 seconds'
    ],

    success_metrics: [
      'Pattern consultation rate: Baseline 15% → Target 60%+',
      'Error rate reduction: Measure issues per SD before/after',
      'Time to resolution: Average minutes for known patterns',
      'Knowledge base utilization: % of retrospectives referenced',
      'Agent satisfaction: Perceived value of proactive suggestions'
    ],

    stakeholders: ['LEO Protocol', 'All three agents (LEAD, PLAN, EXEC)', 'Future SDs'],

    metadata: {
      timeline: {
        estimated_duration: '3.5-4.5 hours',
        milestones: [
          'Hour 1: Create SD + build phase-preflight.js script',
          'Hour 2: Build generate-knowledge-summary.js + test both scripts',
          'Hour 3: Update CLAUDE_EXEC.md, CLAUDE_PLAN.md, CLAUDE_LEAD.md',
          'Hour 4: Update CLAUDE_CORE.md, CLAUDE.md, handoff templates, session prologue',
          'Final 30min: Testing, PRD creation, commit & push'
        ]
      },
      business_impact: 'HIGH - Prevents repeated mistakes, reduces implementation time, improves quality',
      technical_impact: 'Establishes proactive learning pattern for all future protocol enhancements',
      integration_points: {
        'Learning History System': 'Queries issue_patterns and retrospectives',
        'Knowledge Retrieval (SD-KNOWLEDGE-001)': 'Complements automated PRD enrichment',
        'LEO Protocol': 'Enhances all three phases with knowledge checkpoints'
      },
      documentation_deliverables: [
        'scripts/phase-preflight.js (CREATE)',
        'scripts/generate-knowledge-summary.js (CREATE)',
        'CLAUDE_EXEC.md (UPDATE - add Pre-Implementation section)',
        'CLAUDE_PLAN.md (UPDATE - add PRD Enrichment section)',
        'CLAUDE_LEAD.md (UPDATE - add Historical Context section)',
        'CLAUDE_CORE.md (UPDATE - add Quick Reference commands)',
        'CLAUDE.md (UPDATE - add loading strategy note)',
        'templates/config/handoff-templates.json (UPDATE - add Patterns Consulted)',
        'templates/session-prologue.md (UPDATE - add preflight mention)'
      ],
      performance_targets: {
        script_execution_time: '<30 seconds',
        output_conciseness: '≤500 characters per pattern summary',
        relevance_score: '70%+ pattern match relevance',
        adoption_rate: '60%+ pattern consultation in handoffs'
      }
    },

    created_by: 'Claude (Sonnet 4.5)',
    updated_by: 'Claude (Sonnet 4.5)',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sequence_rank: 1000,
    is_active: true,
    progress_percentage: 0
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-LEO-LEARN-001')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-LEO-LEARN-001')
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

    console.log('\n📋 SD Details:');
    console.log('   ID: SD-LEO-LEARN-001');
    console.log('   Title: Proactive Learning Integration');
    console.log('   Priority: high');
    console.log('   Status: draft');
    console.log('   Category: Process Improvement');
    console.log('   Timeline: 3.5-4.5 hours');
    console.log('\n🎯 Key Features:');
    console.log('   - Proactive knowledge retrieval at phase start');
    console.log('   - EXEC/PLAN mandatory, LEAD recommended');
    console.log('   - 2 new automation scripts (phase-preflight, knowledge-summary)');
    console.log('   - 5 CLAUDE files enhanced with knowledge checkpoints');
    console.log('   - Handoff templates updated with pattern consultation');
    console.log('\n📊 Expected Impact:');
    console.log('   - 60%+ pattern consultation rate (up from 15%)');
    console.log('   - Fewer repeated mistakes across SDs');
    console.log('   - Reduced implementation time via preemptive solutions');
    console.log('   - 100% knowledge base utilization');
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
export { createProactiveLearningSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createProactiveLearningSD();
}
