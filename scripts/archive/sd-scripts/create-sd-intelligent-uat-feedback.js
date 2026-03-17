#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD() {
  console.log('📋 Creating SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001\n');

  const sdData = {
    id: 'SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001',
    sd_key: 'SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001',
    title: 'Intelligent UAT Feedback System with Multi-Model Triangulation',
    description: 'Enhance the UAT system to intelligently parse batch text feedback, detect the user\'s mode (Strategic/Product/Technical/Polish), and use multi-model triangulation (GPT 5.2 + Gemini) to assess severity, classify actions, and generate context-aware follow-up questions. The system should route issues to quick-fix, SD creation, or backlog based on model consensus.',

    scope: `**Must-Haves**:
1. Multi-model feedback analyzer integration (GPT 5.2 + Gemini)
2. Mode detection engine (Strategic/Product/Technical/Polish)
3. Consensus engine for action routing decisions
4. Context-aware follow-up question generation
5. Database table for parsed feedback (uat_feedback_parsed)
6. Integration with existing /uat command
7. Action routing to quick-fix/SD/backlog

**Nice-to-Haves**:
- Feedback clustering for related issues
- Historical pattern recognition
- Severity trend analysis
- Custom mode definitions`,

    strategic_intent: 'Enable the solo entrepreneur to provide raw, unstructured UAT feedback and have the system intelligently parse, classify, and route it to appropriate actions with minimal manual intervention. Multi-model consensus provides higher confidence in action routing decisions.',

    rationale: `Simplicity-First Approach:
- Leverage existing LLM integration patterns
- Build on proven UAT command infrastructure
- Use multi-model triangulation to reduce manual triage
- Minimize false positives via consensus scoring`,

    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'high',
    sd_type: 'feature',
    category: 'feature',
    target_application: 'EHG_Engineer',

    strategic_objectives: `1. Parse batch text feedback into structured issues
2. Detect user's feedback mode for context-aware responses
3. Use multi-model consensus for action classification
4. Generate intelligent follow-up questions for unclear items
5. Route to quick-fix, SD creation, or backlog with confidence scores
6. Integrate seamlessly with existing /uat workflow`,

    success_criteria: JSON.stringify([
      { criterion: 'Batch feedback parsing works end-to-end', measure: 'Raw text → parsed issues with mode detection' },
      { criterion: 'Multi-model triangulation operational', measure: 'GPT 5.2 and Gemini both analyze feedback' },
      { criterion: 'Consensus engine produces confidence scores', measure: 'Agreement/disagreement flagged correctly' },
      { criterion: 'Follow-up questions generated for low-confidence items', measure: 'Interactive clarification works' },
      { criterion: 'Action routing to quick-fix/SD/backlog', measure: 'Correct routing based on consensus' },
      { criterion: 'Integration with /uat command', measure: 'Invokable from existing UAT workflow' },
      { criterion: 'Unit tests for core modules', measure: '≥80% coverage on new code' },
      { criterion: 'Documentation updated', measure: 'UAT command docs reflect new capabilities' }
    ]),

    key_changes: JSON.stringify([
      { change: 'Add multi-model feedback analyzer (GPT 5.2 + Gemini)', impact: 'Enables triangulated parsing and classification' },
      { change: 'Implement mode detection (Strategic/Product/Technical/Polish)', impact: 'Context-aware follow-up questions' },
      { change: 'Add consensus engine for action routing', impact: 'Higher confidence quick-fix vs SD vs backlog decisions' },
      { change: 'Integrate with existing /uat command', impact: 'Seamless workflow integration' },
      { change: 'Add uat_feedback_parsed database table', impact: 'Structured storage of parsed feedback' }
    ]),

    dependencies: JSON.stringify([
      { dependency: 'OpenAI API key configured', type: 'technical', status: 'ready' },
      { dependency: 'Gemini API key configured', type: 'technical', status: 'ready' },
      { dependency: 'Existing UAT command infrastructure', type: 'technical', status: 'ready' }
    ]),

    risks: JSON.stringify([
      { risk: 'API rate limits during high feedback volume', severity: 'medium', mitigation: 'Implement request queuing and caching' },
      { risk: 'Model disagreement on edge cases', severity: 'low', mitigation: 'Fall back to user decision via follow-up' },
      { risk: 'Increased API costs from dual-model calls', severity: 'low', mitigation: 'Use fast/cheap models for initial parsing, full models only for classification' }
    ]),

    metadata: {
      acceptance_criteria: [
        'AC-001: Batch feedback parsing produces structured issues with detected mode',
        'AC-002: GPT 5.2 and Gemini both analyze feedback independently',
        'AC-003: Consensus engine calculates agreement scores and flags conflicts',
        'AC-004: Follow-up questions generated for low-confidence classifications',
        'AC-005: Action routing correctly assigns quick-fix, SD creation, or backlog',
        'AC-006: Integration with /uat command allows invocation from existing workflow',
        'AC-007: Unit tests achieve ≥80% coverage on new modules',
        'AC-008: Documentation updated with new capabilities and examples'
      ],
      estimated_hours: 16,
      complexity: 'high',
      requires_design_review: false,
      integration_touchpoints: [
        'Existing /uat command infrastructure',
        'OpenAI API integration',
        'Gemini API integration',
        'Strategic directives database'
      ]
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sdData])
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }

  console.log('✅ SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001 created successfully!\n');
  console.log('📊 SD Summary:');
  console.log('   SD Key: SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001');
  console.log('   Title: Intelligent UAT Feedback System with Multi-Model Triangulation');
  console.log('   Type: feature');
  console.log('   Priority: HIGH');
  console.log('   Status: draft');
  console.log('   Current Phase: LEAD_APPROVAL');
  console.log('   Target Application: EHG_Engineer');
  console.log('   Estimated: 16 hours');
  console.log('   Complexity: high');
  console.log('\n📋 Created SD Details:');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n🎯 Next: LEAD agent to activate SD and create LEAD→PLAN handoff');
}

createSD().catch(err => {
  console.error('Fatal error:', err.message);
  console.error(err);
  process.exit(1);
});
