const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    // Update Child A
    const { data: childA, error: errorA } = await supabase
      .from('strategic_directives_v2')
      .update({
        title: 'Agent Experience Factory - Dynamic Agent Composition from Accumulated Knowledge',
        sd_type: 'feature',
        description: 'Build a composition layer that dynamically assembles experienced agents at invocation time by querying issue_patterns, retrospectives, skills, and domain-specific knowledge. Instead of static sub-agent prompts, each invocation gets a contextually-rich agent carrying accumulated patterns, failure libraries, decision heuristics, and workflow templates from this specific codebase. The factory queries at invocation time: (1) issue_patterns filtered by domain, (2) retrospectives tagged by category, (3) relevant skills from the skills library, (4) project-specific context from the current SD and PRD. Validates on current sequential model - every existing sub-agent invocation benefits immediately.',
        priority: 'high',
        key_changes: [
          {
            change: 'Create agent factory composition layer querying issue_patterns, retrospectives, and skills at invocation time',
            type: 'feature'
          },
          {
            change: 'Add caching layer to prevent redundant pattern queries per session',
            type: 'feature'
          },
          {
            change: 'Implement feedback loop tracking whether composed agents perform better than static ones',
            type: 'feature'
          }
        ],
        success_criteria: [
          {
            criterion: 'Agent factory composes context-rich prompts from accumulated domain knowledge',
            measure: 'Sub-agents receive relevant issue patterns, retrospective learnings, and skills at invocation'
          },
          {
            criterion: 'Composition improves sub-agent output quality',
            measure: 'Measurable reduction in repeated failure patterns across sessions'
          }
        ],
        strategic_objectives: [
          'Transform static sub-agent prompts into dynamically composed experienced agents',
          'Create a reusable pattern applicable to any venture\'s agent system',
          'Close the feedback loop between accumulated knowledge and agent invocations'
        ],
        risks: [
          {
            risk: 'Query overhead at invocation time may slow sub-agent startup',
            mitigation: 'Session-level caching with 5-minute TTL'
          },
          {
            risk: 'Composed context may exceed token limits for some sub-agents',
            mitigation: 'Implement priority-based truncation of injected knowledge'
          }
        ],
        governance_metadata: {
          type_change_reason: 'Changed from placeholder orchestrator type to feature type. This SD builds a feature (agent composition layer) and does not orchestrate child SDs. Initial creation used wrong type.'
        }
      })
      .eq('sd_key', 'SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A')
      .select();

    if (errorA) {
      console.error('Error updating Child A:', errorA);
    } else {
      console.log('✅ Child A updated successfully');
      console.log('Updated rows:', childA?.length || 0);
    }

    // Update Child B
    const { data: childB, error: errorB } = await supabase
      .from('strategic_directives_v2')
      .update({
        title: 'Parallel Orchestrator Execution - Concurrent Independent Child SDs via Agent Teams',
        sd_type: 'infrastructure',
        description: 'Modify the orchestrator execution model to run independent child SDs concurrently using Claude Code Agent Teams. Currently getNextReadyChild() returns sorted[0] (one child at a time). This SD changes it to identify all unblocked children, build a dependency DAG, identify the independent set, and spawn one teammate per independent child - each in its own worktree. A team coordinator monitors completions and unlocks dependent children as blockers resolve. Existing infrastructure (worktrees, dependency tracking via metadata.blocked_by, multi-session locking, urgency scoring) is already in place. The gap is the coordination layer.',
        priority: 'medium',
        key_changes: [
          {
            change: 'Modify getNextReadyChild() to return array of all ready children instead of one',
            type: 'feature'
          },
          {
            change: 'Build team coordinator that spawns Agent Team members per independent child',
            type: 'feature'
          },
          {
            change: 'Implement dependency DAG resolver for identifying independent child sets',
            type: 'feature'
          },
          {
            change: 'Add completion aggregation and dependent-child unlocking',
            type: 'feature'
          }
        ],
        success_criteria: [
          {
            criterion: 'Independent orchestrator children execute in parallel',
            measure: '2-5x speedup on orchestrators with 3+ independent children'
          },
          {
            criterion: 'Dependency ordering is preserved',
            measure: 'Children with blocked_by constraints wait until blockers complete'
          }
        ],
        strategic_objectives: [
          'Reduce orchestrator wall-clock time by 2-5x for independent children',
          'Use existing worktree and session locking infrastructure',
          'Maintain compatibility with current sequential model as fallback'
        ],
        risks: [
          {
            risk: 'Parallel Opus agents multiply token costs',
            mitigation: 'Only parallelize truly independent children; sequential fallback for dependent chains'
          },
          {
            risk: 'Merge conflicts between parallel worktrees',
            mitigation: 'Each child already gets isolated worktree; merge only after passing tests'
          }
        ],
        metadata: {
          depends_on: ['SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A'],
          blocked_by: ['SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A']
        },
        governance_metadata: {
          type_change_reason: 'Changed from placeholder orchestrator type to infrastructure type. This SD builds infrastructure (parallel execution layer) and does not orchestrate child SDs. Initial creation used wrong type.'
        }
      })
      .eq('sd_key', 'SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B')
      .select();

    if (errorB) {
      console.error('Error updating Child B:', errorB);
    } else {
      console.log('✅ Child B updated successfully');
      console.log('Updated rows:', childB?.length || 0);
    }

    // Verify both updates
    const { data: verification, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, sd_type, priority, description')
      .in('sd_key', [
        'SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A',
        'SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B'
      ]);

    if (verifyError) {
      console.error('Error verifying updates:', verifyError);
    } else {
      console.log('\n=== Verification ===');
      verification.forEach(sd => {
        console.log(`\n${sd.sd_key}:`);
        console.log(`  Title: ${sd.title}`);
        console.log(`  Type: ${sd.sd_type}`);
        console.log(`  Priority: ${sd.priority}`);
        console.log(`  Description: ${sd.description.substring(0, 100)}...`);
      });
    }

  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
