#!/usr/bin/env node

/**
 * Create SD-CLAUDE-CODE-2.1.0-LEO-001 in database
 * Claude Code 2.1.0 Integration for LEO Protocol
 *
 * LEAD Approval: Pending
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createSD() {
  console.log('Creating SD-CLAUDE-CODE-2.1.0-LEO-001...\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sdData = {
    id: 'SD-CLAUDE-CODE-2.1.0-LEO-001',
    sd_key: 'SD-CLAUDE-CODE-2.1.0-LEO-001',
    sd_key: 'SD-CLAUDE-CODE-2.1.0-LEO-001',
    title: 'Claude Code 2.1.0 Integration - Baseline-Aware Continuous Execution System',
    description: `Integrate Claude Code 2.1.0 features into LEO Protocol to enable:
1. Deterministic phase detection via handoffs (replacing trigger keywords)
2. Automatic context management with hooks (PreToolUse/PostToolUse/Stop)
3. Baseline-aware execution with test state capture, crash recovery, and health tracking
4. Agent hot-reload via skills migration with dual-path support
5. Enhanced /leo-continuous and /escalate skills`,
    rationale: `Claude Code 2.1.0 introduces hooks, context forking, and skill hot-reload that can significantly improve LEO Protocol automation. Current issues:
- Trigger keywords are unreliable for phase detection
- Manual steps for model tracking, issue logging, and session recovery
- Agents require session restart to update
- No baseline test state capture (can't distinguish pre-existing vs new failures)
This SD addresses all these by leveraging native Claude Code capabilities.`,
    scope: `Phase 1 (Foundation): Create hooks directory, implement model-tracking.js, session-init.js, update registry.cjs with dual-path support
Phase 2 (Hook Infrastructure): Implement load-phase-context.js, auto-checkpoint.js, persist-session-state.js, recover-session-state.js
Phase 3 (Baseline Integration): Implement capture-baseline-test-state.js, compare-test-baseline.js, detect-and-log-issues.js, create /leo-continuous skill
Phase 4 (Agent Migration): Migrate testing-agent as pilot, validate hot-reload, migrate remaining agents
Phase 5 (Validation): End-to-end testing, documentation updates`,
    status: 'draft',
    category: 'Infrastructure',
    sd_type: 'infrastructure',
    priority: 'high',
    is_active: true,
    progress_percentage: 0,
    current_phase: 'LEAD',
    created_by: 'LEAD',
    metadata: {
      origin: 'Claude Code 2.1.0 Changelog Analysis',
      spec_document: 'docs/specs/CLAUDE-CODE-2.1.0-LEO-ENHANCEMENTS.md',
      complexity_score: 15,
      over_engineering_check: 'PASSED',
      lead_validation_complete: false,
      scope_locked: false,
      estimated_effort_hours: 40,
      in_scope: [
        'Create scripts/hooks/ directory with 20+ hook scripts',
        'Implement handoff-based phase detection',
        'Implement baseline test state capture and comparison',
        'Implement session crash recovery system',
        'Create /leo-continuous skill with full hook chain',
        'Update /escalate skill with agent field and hooks',
        'Update registry.cjs with dual-path support',
        'Migrate agents to .claude/skills/ with new frontmatter',
        'Add wildcard Bash permissions to settings.json',
        'Update agent frontmatter with hook definitions'
      ],
      out_of_scope: [
        'Changes to handoff validation logic',
        'Changes to baseline generation algorithm',
        'UI changes to EHG Engineer dashboard',
        'New database tables (using existing tables)'
      ],
      dependencies: [],
      key_deliverables: [
        'scripts/hooks/ directory with all hook scripts',
        '.claude/skills/leo-continuous.md skill',
        'Updated .claude/commands/escalate.md',
        'Updated lib/agents/registry.cjs',
        'Migrated agent files in .claude/skills/',
        'Updated settings.json with permissions'
      ],
      claude_code_features_used: [
        'context: fork (selective)',
        'hooks in frontmatter (PreToolUse, PostToolUse, Stop)',
        'once: true hooks',
        'automatic skill hot-reload',
        'agent field in skills',
        'wildcard Bash permissions',
        'YAML-style allowed-tools'
      ],
      implementation_phases: [
        { phase: 1, name: 'Foundation', effort_hours: 6 },
        { phase: 2, name: 'Hook Infrastructure', effort_hours: 12 },
        { phase: 3, name: 'Baseline Integration', effort_hours: 13 },
        { phase: 4, name: 'Agent Migration', effort_hours: 5 },
        { phase: 5, name: 'Validation & Cleanup', effort_hours: 4 }
      ],
      strategic_validation: {
        need: 'REAL - Trigger keywords unreliable, manual steps slow execution',
        solution: 'ALIGNED - Uses native Claude Code 2.1.0 hooks for automation',
        value: 'HIGH - Enables reliable continuous execution with crash recovery',
        feasibility: 'FEASIBLE - All features documented in Claude Code changelog',
        risks_mitigated: true
      }
    }
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', sdData.id)
      .single();

    if (existing) {
      console.log('SD already exists. Updating...\n');

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sdData)
        .eq('id', sdData.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating SD:', error);
        process.exit(1);
      }

      console.log('SD updated successfully\n');
      console.log('ID:', data.id);
      console.log('Title:', data.title);
      console.log('Status:', data.status);
      return;
    }

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('Error creating SD:', error);
      process.exit(1);
    }

    console.log('SD created successfully\n');
    console.log('═'.repeat(60));
    console.log('ID:', data.id);
    console.log('Title:', data.title);
    console.log('Status:', data.status);
    console.log('Priority:', data.priority);
    console.log('Type:', data.sd_type);
    console.log('Current Phase:', data.current_phase);
    console.log('═'.repeat(60));
    console.log('\nMetadata:');
    console.log('- Complexity Score:', data.metadata?.complexity_score, '/30');
    console.log('- Over-Engineering Check:', data.metadata?.over_engineering_check);
    console.log('- Estimated Effort:', data.metadata?.estimated_effort_hours, 'hours');
    console.log('- Spec Document:', data.metadata?.spec_document);
    console.log('\nImplementation Phases:');
    for (const phase of data.metadata?.implementation_phases || []) {
      console.log(`  Phase ${phase.phase}: ${phase.name} (${phase.effort_hours}h)`);
    }
    console.log('\nClaude Code Features Used:');
    for (const feature of data.metadata?.claude_code_features_used || []) {
      console.log(`  - ${feature}`);
    }
    console.log('\n═'.repeat(60));
    console.log('Next Steps:');
    console.log('1. Review spec: docs/specs/CLAUDE-CODE-2.1.0-LEO-ENHANCEMENTS.md');
    console.log('2. Get LEAD approval');
    console.log('3. Run: node scripts/handoff.js execute LEAD-TO-PLAN SD-CLAUDE-CODE-2.1.0-LEO-001');
    console.log('═'.repeat(60));

  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

createSD();
