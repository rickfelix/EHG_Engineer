#!/usr/bin/env node
/**
 * Add Handoff Retrospective Documentation to leo_protocol_sections
 *
 * This script adds the documentation for the handoff retrospective system
 * that was implemented in commit 9d291b3 but not documented in the database.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addHandoffRetrospectiveDocs() {
  try {
    console.log('📚 Adding Handoff Retrospective Documentation\n');

    // Get active protocol version
    const { data: protocols, error: protoError } = await supabase
      .from('leo_protocols')
      .select('id, version')
      .eq('status', 'active')
      .limit(1);

    if (protoError || !protocols || protocols.length === 0) {
      throw new Error(`Could not find active protocol: ${protoError?.message}`);
    }

    const protocol = protocols[0];
    console.log(`   Protocol: ${protocol.version} (${protocol.id})\n`);

    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('protocol_id', protocol.id)
      .ilike('title', '%Handoff Retrospective%');

    if (existing && existing.length > 0) {
      console.log('   ⚠️  Handoff retrospective section already exists');
      console.log(`   ID: ${existing[0].id}`);
      return;
    }

    // Create the documentation section - using actual columns from schema
    // Columns: id, protocol_id, section_type, title, content, order_index, metadata, context_tier, target_file
    const section = {
      protocol_id: protocol.id,
      section_type: 'handoffs',
      title: 'Handoff Retrospectives',
      content: `## Handoff Retrospective System

Retrospectives are **automatically created** at each phase transition to capture learnings.

### Handoff Types
| Handoff | Type | Triggers |
|---------|------|----------|
| LEAD → PLAN | LEAD_TO_PLAN | SD approval, PRD script generation |
| PLAN → EXEC | PLAN_TO_EXEC | PRD approval, deliverables population |

### Retrospective Behavior

**Non-Interactive Mode** (default in Claude Code):
- Auto-detects via \`process.stdin.isTTY\`
- Uses derived quality metrics from handoff result
- Default rating: 4/5 (good) when handoff succeeds
- Retrospective always created, never blocked

**Interactive Mode** (terminal):
- Prompts with 10-second timeout per question
- 5 questions for LEAD→PLAN, 5 for PLAN→EXEC
- Timeout uses default rating (4/5)
- Friction points captured for improvement queue

### Quality Metrics
- Quality Score: 0-100% derived from ratings
- Team Satisfaction: 1-10 scale
- Ratings: 1-5 per dimension

### Retrospective Fields
- \`retrospective_type\`: LEAD_TO_PLAN | PLAN_TO_EXEC | SD_COMPLETION
- \`what_went_well\`: Array of achievements
- \`what_needs_improvement\`: Array of issues
- \`action_items\`: Array of follow-up tasks
- \`key_learnings\`: Array of insights

### Pre-Handoff Warnings
Before each handoff, recent retrospectives are queried to surface recurring issues.
Top 3 friction points from last 10 retrospectives are displayed.

### Protocol Improvement Integration
Retrospectives feed into the protocol improvement queue:
1. ImprovementExtractor parses retrospectives
2. Actionable improvements added to queue
3. Changes applied via ImprovementApplicator
4. Effectiveness tracked over time

### Related Files
- \`scripts/modules/handoff/executors/LeadToPlanExecutor.js\`
- \`scripts/modules/handoff/executors/PlanToExecExecutor.js\`
- \`scripts/create-handoff-retrospective.js\`
- \`docs/reference/protocol-self-improvement.md\``,
      order_index: 850,
      context_tier: 'REFERENCE',
      target_file: 'CLAUDE_EXEC.md',
      metadata: {
        feature: 'handoff_retrospectives',
        added_by: 'protocol_improvement',
        related_commit: '9d291b3',
        root_cause_fix: '28d4fc4',
        phase: 'EXEC'
      }
    };

    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .insert(section)
      .select('id');

    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }

    console.log('   ✅ Documentation section added!');
    console.log(`   Section ID: ${data[0].id}`);
    console.log(`   Title: ${section.title}`);
    console.log(`   Target File: ${section.target_file}`);

    console.log('\n   📝 To regenerate CLAUDE.md files, run:');
    console.log('   node scripts/generate-claude-md-from-db.js');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

addHandoffRetrospectiveDocs().catch(console.error);
