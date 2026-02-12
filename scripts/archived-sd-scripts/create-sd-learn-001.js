#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-LEARN-001
 * Intelligent /learn Command for LEO Protocol Self-Improvement
 *
 * Created: 2026-01-09
 * Source: Ground-Truth Triangulation Protocol (Claude Opus 4.5, OpenAI GPT-4, Antigravity)
 *
 * LEO Protocol v4.3.3 - Database First Approach
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createLearnSD() {
  console.log('🚀 LEO Protocol v4.3.3 - SD-LEARN-001 Database Insertion');
  console.log('================================================================');
  console.log('Source: Ground-Truth Triangulation Protocol (2026-01-09)\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey ||
      supabaseUrl === 'your_supabase_url_here' ||
      supabaseKey === 'your_supabase_anon_key_here') {
    console.log('❌ Missing or placeholder Supabase credentials in .env file');
    process.exit(1);
  }

  console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role' : 'anon'} key`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sd = {
    id: 'SD-LEARN-001',
    sd_key: 'LEARN-001',
    title: 'Intelligent /learn Command for LEO Protocol Self-Improvement',
    version: '1.0',
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD',
    sd_type: 'feature',

    description: `Create an intelligent /learn command that enables the LEO Protocol to self-improve based on accumulated organizational learning from retrospectives, issue patterns, and protocol improvements.

**Problem Statement:**
The LEO Protocol has extensive learning infrastructure (74+ retrospectives, 8+ issue patterns, protocol improvement queue, pattern-subagent mappings) but lacks intelligent orchestration to apply lessons to current work.

**Triangulation Consensus (Claude, OpenAI, Antigravity):**
- Unanimous: Command name "/learn"
- Unanimous: Devil's advocate review for all proposals
- Unanimous: Required rejection reasons for accountability
- Unanimous: Bidirectional integration with /ship

**User Decisions (Chairman):**
- 2 commands only: /learn (full pipeline) + /learn insights
- Checkbox-style approval interface
- Top 5 items per category by default
- Always show devil's advocate (no skip mode)
- Rejection reasons REQUIRED
- Minimal auto-suggest at SD start`,

    strategic_intent: 'Enable the LEO Protocol to self-improve through intelligent orchestration of existing learning infrastructure, reducing repeat mistakes to zero.',

    rationale: `Current state: Rich learning infrastructure exists but is manually applied.
- 74+ retrospectives with lessons learned
- protocol_improvement_queue with pending improvements
- 8+ tracked issue patterns with proven solutions
- Pattern-subagent mappings for proactive agent invocation

Gap: No unified command to surface lessons before work or apply improvements systematically.

This SD closes the learning loop, ensuring retrospective insights compound rather than fade.`,

    scope: `**Phase 1: Foundation**
1. learning_decisions table with rollback metadata + rejection reasons
2. LearningContextBuilder.js - gather patterns, lessons, queue
3. Basic /learn command (process only)

**Phase 2: Core Loop**
4. LearningReviewer.js with structured devil's advocate template
5. Checkbox-style approval UX
6. LearningExecutor.js with audit trail
7. Required rejection reason flow

**Phase 3: Polish**
8. /learn insights command
9. Admin scripts for history + rollback
10. Minimal auto-suggest at SD start
11. Bidirectional /ship integration

**Phase 4: Documentation**
12. Create docs/reference/learn-command-guide.md
13. Update docs/reference/ship-command-guide.md
14. Update .claude/commands/ship.md
15. Regenerate CLAUDE.md`,

    strategic_objectives: [
      'Create unified /learn command for protocol self-improvement',
      'Implement devil\'s advocate review for all improvement proposals',
      'Enable checkbox-style approval interface for efficient decision-making',
      'Close the learning loop with pattern recurrence tracking',
      'Integrate bidirectionally with /ship command',
      'DOCUMENTATION: Comprehensive command guide and integration docs'
    ],

    success_criteria: [
      '/learn surfaces relevant patterns, lessons, and improvements',
      'Devil\'s advocate counter-arguments generated for each proposal',
      'Checkbox approval interface works with space toggle + enter confirm',
      'Rejection reasons captured and logged',
      '/learn insights shows effectiveness metrics',
      '/ship suggests /learn on preventable patterns',
      '/learn suggests /ship after applying improvements',
      'All decisions logged in learning_decisions table with rollback capability'
    ],

    key_changes: [
      'New learning_decisions database table',
      'New scripts/modules/learning/ module (4 files)',
      'New .claude/commands/learn.md skill definition',
      'Updated ship.md with /learn integration',
      'New docs/reference/learn-command-guide.md'
    ],

    key_principles: [
      'Database-first: All learning stored in database, not markdown',
      'Quality over speed: All improvements require approval',
      'Devil\'s advocate: Every proposal gets challenged',
      'Rollback capability: Ability to undo improvements',
      'Bidirectional integration: /learn and /ship reinforce each other'
    ],

    metadata: {
      source: 'Ground-Truth Triangulation Protocol',
      triangulation_date: '2026-01-09',
      triangulation_participants: ['Claude Opus 4.5', 'OpenAI GPT-4', 'Antigravity'],
      track: 'A',
      estimated_effort_hours: 24,
      plan_file: '/home/rickf/.claude/plans/zesty-painting-stroustrup.md',
      existing_infrastructure: [
        'retrospectives table (74+ entries)',
        'protocol_improvement_queue table',
        'issue_patterns table (8+ patterns)',
        'pattern_subagent_mapping table',
        'pattern_usage_metrics table',
        '/ship command (reference implementation)'
      ],
      risks: [
        {
          type: 'technical',
          description: 'Checkbox UI may require terminal library (inquirer/prompts)',
          probability: 'low',
          impact: 'low',
          mitigation: 'Use existing CLI patterns from other scripts'
        },
        {
          type: 'integration',
          description: '/ship integration may require changes to ShippingDecisionEvaluator',
          probability: 'medium',
          impact: 'low',
          mitigation: 'Design integration points during PLAN phase'
        }
      ],
      testing_requirements: {
        unit_tests: true,
        e2e_tests: true,
        documentation_pages: 2
      },
      user_decisions: {
        subcommands: '2 only (/learn, /learn insights)',
        quick_mode: 'No - always show DA',
        display_limit: 'Top 5 per category',
        approval_interface: 'Checkbox-style',
        auto_suggest: 'Minimal',
        rejection_reasons: 'Always required',
        experimental_period: 'No - permanent on approval',
        dry_run_mode: 'No - PAUSE serves as preview',
        ship_integration: 'Yes, bidirectional'
      }
    },

    created_by: 'LEAD-Triangulation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('📝 Inserting SD-LEARN-001...');

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .upsert(sd, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('❌ Error inserting SD:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }

  console.log('✅ SD-LEARN-001 inserted successfully!');
  console.log('\nSD Details:');
  console.log(`  ID: ${sd.id}`);
  console.log(`  Title: ${sd.title}`);
  console.log(`  Phase: ${sd.current_phase}`);
  console.log(`  Priority: ${sd.priority}`);
  console.log(`  Track: ${sd.metadata.track}`);
  console.log(`  Estimated Hours: ${sd.metadata.estimated_effort_hours}`);

  console.log('\n📋 Next Steps:');
  console.log('  1. Run: npm run sd:next  (to see SD in queue)');
  console.log('  2. Review LEAD phase approval criteria');
  console.log('  3. Begin PLAN phase with PRD generation');
  console.log('\n✨ SD created from triangulation consensus!');
}

createLearnSD().catch(console.error);
