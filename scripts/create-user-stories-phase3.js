#!/usr/bin/env node

/**
 * Create User Stories for SD-BOARD-VISUAL-BUILDER-003
 * Phase 3: Code Generation & Execution
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const stories = [
  {
    story_key: 'US-001',
    title: 'Generate Python Code from Visual Workflow',
    user_role: 'workflow designer',
    user_want: 'generate CrewAI Flows Python code from my visual workflow definition',
    user_benefit: 'I can execute my board meeting workflows programmatically',
    acceptance_criteria: [
      'User can click Generate Code button on workflow canvas',
      'System generates Python code with CrewAI decorators (@start, @listen, @router)',
      'Generated code includes all nodes (Start, Agent Task, Decision, Router, Parallel, Wait, End)',
      'Code is syntactically valid (AST validation)',
      'Generated code is stored in crewai_flows.python_code column',
      'User sees code preview in modal with syntax highlighting'
    ],
    priority: 'critical',
    story_points: 8,
    depends_on: [],
    technical_notes: 'Use AST (Abstract Syntax Tree) validation for Python syntax checking. Support all CrewAI Flow decorators. Prerequisite: crewai_flows table from Phase 1.'
  },
  {
    story_key: 'US-002',
    title: 'Execute Generated Workflow Code in Sandbox',
    user_role: 'board member',
    user_want: 'execute my workflow code in a secure sandboxed environment',
    user_benefit: 'I can run board meetings safely without compromising the system',
    acceptance_criteria: [
      'User can click Execute Workflow button',
      'System creates Docker container with resource limits (2GB RAM, 2 CPUs, 5min timeout)',
      'Python code executes in isolated environment',
      'Execution status tracked in crewai_flow_executions table',
      'User sees real-time execution progress',
      'System handles timeouts gracefully (>5min = cancelled)',
      'Execution results stored with input/output state'
    ],
    priority: 'critical',
    story_points: 13,
    depends_on: [],
    technical_notes: 'CRITICAL SECURITY: Use Docker containers with restricted imports whitelist. No filesystem access, no network access by default. Prerequisites: US-001 complete, Docker environment, Sandboxed execution infrastructure.'
  },
  {
    story_key: 'US-003',
    title: 'View Execution History and Results',
    user_role: 'board member',
    user_want: 'view past workflow executions and their results',
    user_benefit: 'I can review board meeting outcomes and decisions',
    acceptance_criteria: [
      'User navigates to Execution History tab',
      'System displays list of past executions from crewai_flow_executions table',
      'Each execution shows: date, status (pending/running/completed/failed), duration',
      'User can click execution to see detailed results',
      'Detail view shows input state, output state, error messages (if failed)',
      'User can filter by workflow, status, date range',
      'Pagination for large result sets (25/50/100 per page)'
    ],
    priority: 'high',
    story_points: 5,
    depends_on: [],
    technical_notes: 'Use existing execution tracking schema. Support JSON state visualization. Prerequisites: US-002, crewai_flow_executions table.'
  },
  {
    story_key: 'US-004',
    title: 'Validate Code Before Execution',
    user_role: 'system administrator',
    user_want: 'generated code validated before execution',
    user_benefit: 'malicious or invalid code cannot run',
    acceptance_criteria: [
      'System validates Python syntax (AST check) before saving',
      'System checks for restricted imports (os, subprocess, socket, etc.)',
      'System enforces whitelist: crewai, anthropic, openai libraries only',
      'Validation errors shown to user with line numbers',
      'Invalid code cannot be executed',
      'Validation results logged for audit'
    ],
    priority: 'critical',
    story_points: 8,
    depends_on: [],
    technical_notes: 'Implement import whitelist checker. Use Python AST module for syntax validation. Prerequisites: US-001.'
  },
  {
    story_key: 'US-005',
    title: 'Handle Execution Errors Gracefully',
    user_role: 'workflow designer',
    user_want: 'clear error messages when execution fails',
    user_benefit: 'I can debug and fix my workflows',
    acceptance_criteria: [
      'System captures Python exceptions during execution',
      'Error message, stack trace, error type stored in crewai_flow_executions',
      'User sees formatted error with line numbers',
      'System suggests common fixes for known errors',
      'Execution marked as failed in database',
      'User can retry failed executions'
    ],
    priority: 'high',
    story_points: 5,
    depends_on: [],
    technical_notes: 'Capture stderr from Docker container. Parse Python tracebacks for user-friendly display. Prerequisites: US-002.'
  },
  {
    story_key: 'US-006',
    title: 'Link Workflow Executions to Board Meetings',
    user_role: 'board member',
    user_want: 'workflow executions linked to board meetings',
    user_benefit: 'I can track which workflows ran during each meeting',
    acceptance_criteria: [
      'User can associate execution with board_meeting_id',
      'Execution list filterable by board meeting',
      'Board meeting detail page shows linked executions',
      'User sees execution context (which meeting triggered it)',
      'Execution mode tracked (manual, scheduled, triggered)'
    ],
    priority: 'medium',
    story_points: 3,
    depends_on: [],
    technical_notes: 'Use existing board_meeting_id foreign key in crewai_flow_executions. Prerequisites: US-003, board_meetings table from SD-BOARD-GOVERNANCE-001.'
  },
  {
    story_key: 'US-007',
    title: 'Track Execution Resource Usage',
    user_role: 'system administrator',
    user_want: 'track resource usage (tokens, cost, duration) for each execution',
    user_benefit: 'I can monitor system efficiency',
    acceptance_criteria: [
      'System tracks execution duration in milliseconds',
      'System tracks token count for LLM API calls',
      'System calculates cost in USD based on token count',
      'Execution history shows resource metrics',
      'Dashboard displays aggregate resource usage',
      'User can set budget alerts'
    ],
    priority: 'medium',
    story_points: 5,
    depends_on: [],
    technical_notes: 'Use token_count, cost_usd, duration_ms columns in crewai_flow_executions. Prerequisites: US-003.'
  },
  {
    story_key: 'US-008',
    title: 'Export Generated Code for External Use',
    user_role: 'workflow designer',
    user_want: 'export generated Python code',
    user_benefit: 'I can run it independently outside the platform',
    acceptance_criteria: [
      'User can click Export Code button',
      'System generates .py file with complete workflow code',
      'Exported code includes imports and boilerplate',
      'File download with workflow name (e.g., weekly-board-meeting.py)',
      'Exported code runs standalone with crewai installed',
      'README included with setup instructions'
    ],
    priority: 'low',
    story_points: 3,
    depends_on: [],
    technical_notes: 'Include pip install instructions. Add comments explaining workflow structure. Prerequisites: US-001.'
  }
];

async function main() {
  try {
    console.log('🎯 Creating User Stories for SD-BOARD-VISUAL-BUILDER-003\n');

    // Get SD ID for Phase 3
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, sd_key')
      .eq('sd_key', 'SD-BOARD-VISUAL-BUILDER-003')
      .single();

    if (sdError || !sd) {
      console.error('❌ SD-BOARD-VISUAL-BUILDER-003 not found');
      console.error(sdError?.message);
      process.exit(1);
    }

    console.log(`📋 Target SD: ${sd.title}`);
    console.log(`🆔 SD ID: ${sd.id}`);
    console.log(`🔑 SD Key: ${sd.sd_key}\n`);

    // Insert user stories one at a time
    let successCount = 0;
    let errorCount = 0;

    for (const story of stories) {
      const { data, error} = await supabase
        .from('user_stories')
        .insert({
          sd_id: sd.id,
          story_key: `${sd.sd_key}:${story.story_key}`,
          title: story.title,
          user_role: story.user_role,
          user_want: story.user_want,
          user_benefit: story.user_benefit,
          acceptance_criteria: story.acceptance_criteria,
          priority: story.priority,
          story_points: story.story_points,
          depends_on: story.depends_on,
          technical_notes: story.technical_notes,
          status: 'ready'
        })
        .select('id, story_key, title');

      if (error) {
        console.error(`❌ ${story.story_key}: ${error.message}`);
        errorCount++;
      } else {
        console.log(`✅ ${story.story_key}: ${story.title} (${story.story_points} pts, ${story.priority})`);
        successCount++;
      }
    }

    console.log('\n═'.repeat(80));
    console.log(`📊 Summary: ${successCount} created, ${errorCount} errors`);
    console.log(`📝 Total Story Points: ${stories.reduce((sum, s) => sum + s.story_points, 0)}`);
    console.log('═'.repeat(80));

  } catch (err) {
    console.error('💥 Error:', err.message);
    process.exit(1);
  }
}

main();
