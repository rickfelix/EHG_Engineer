#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function extractSubAgentSystem() {
  // Get sub-agents with triggers
  const { data: subAgents } = await supabase
    .from('leo_sub_agents')
    .select(`
      *,
      triggers:leo_sub_agent_triggers(*)
    `)
    .eq('active', true)
    .order('priority', { ascending: false });

  let content = `# Sub-Agent System Reference

**Database-Driven Sub-Agent Architecture**

This document provides comprehensive details about all active sub-agents, their triggers, and activation patterns.

> **Note**: This is extracted from the database. For the latest information, query the \`leo_sub_agents\` and \`leo_sub_agent_triggers\` tables directly.

## Active Sub-Agents

| Sub-Agent | Code | Type | Priority | Script |
|-----------|------|------|----------|--------|
`;

  // Add sub-agent table
  subAgents.forEach(sa => {
    const scriptPath = sa.script_path || 'N/A';
    content += `| ${sa.name} | ${sa.code} | ${sa.activation_type} | ${sa.priority} | \`${scriptPath}\` |\n`;
  });

  content += `\n## Sub-Agent Details\n\n`;

  // Add detailed sections for each sub-agent
  subAgents.forEach(sa => {
    content += `### ${sa.name} (${sa.code})\n\n`;
    content += `**Priority**: ${sa.priority}\n`;
    content += `**Activation**: ${sa.activation_type}\n\n`;
    
    if (sa.description) {
      content += `**Description**:\n${sa.description}\n\n`;
    }

    if (sa.triggers && sa.triggers.length > 0) {
      content += `**Triggers** (${sa.triggers.length} total):\n\n`;
      
      // Group by type
      const keywordTriggers = sa.triggers.filter(t => t.trigger_type === 'keyword');
      const eventTriggers = sa.triggers.filter(t => t.trigger_type === 'event');
      
      if (keywordTriggers.length > 0) {
        content += `**Keyword Triggers** (${keywordTriggers.length}):\n`;
        keywordTriggers.forEach(t => {
          const context = t.trigger_context || 'any';
          content += `- "${t.trigger_phrase}" in ${context} context\n`;
        });
        content += '\n';
      }
      
      if (eventTriggers.length > 0) {
        content += `**Event Triggers** (${eventTriggers.length}):\n`;
        eventTriggers.forEach(t => {
          const context = t.trigger_context || 'any';
          content += `- ${t.trigger_phrase} in ${context} context\n`;
        });
        content += '\n';
      }
    }

    if (sa.script_path) {
      content += `**Execution Script**: \`${sa.script_path}\`\n\n`;
    }

    if (sa.context_file) {
      content += `**Context File**: \`${sa.context_file}\`\n\n`;
    }

    content += `---\n\n`;
  });

  content += `## Sub-Agent Activation Process

When triggers are detected, EXEC MUST:

1. **Query Database for Active Triggers**:
   \`\`\`sql
   SELECT * FROM leo_sub_agent_triggers
   WHERE active = true
   AND trigger_phrase IN (detected_phrases);
   \`\`\`

2. **Create Formal Handoff** (7 elements from database template)

3. **Execute Sub-Agent**:
   - Option A: Run tool from \`script_path\` field
   - Option B: Use context from \`context_file\` field
   - Option C: Document analysis if no tool exists

4. **Store Results in Database**:
   \`\`\`sql
   INSERT INTO sub_agent_execution_results (sub_agent_id, results, ...);
   \`\`\`

## Querying Sub-Agents from Database

\`\`\`javascript
// Get all active sub-agents
const { data: subAgents } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('active', true)
  .order('priority', { ascending: false });

// Get triggers for a specific sub-agent
const { data: triggers } = await supabase
  .from('leo_sub_agent_triggers')
  .select('*')
  .eq('sub_agent_id', subAgentId)
  .eq('active', true);
\`\`\`

## Adding New Sub-Agents

To add a new sub-agent, insert into the database:

\`\`\`sql
INSERT INTO leo_sub_agents (
  name, code, description, activation_type, priority, 
  script_path, context_file, active
) VALUES (
  'Sub-Agent Name',
  'CODE',
  'Description...',
  'automatic',
  50,
  'scripts/subagent-script.js',
  'docs/subagent-context.md',
  true
);
\`\`\`

Then add triggers:

\`\`\`sql
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id, trigger_phrase, trigger_type, trigger_context, active
) VALUES (
  (SELECT id FROM leo_sub_agents WHERE code = 'CODE'),
  'keyword',
  'keyword',
  'any',
  true
);
\`\`\`
`;

  writeFileSync('docs/reference/sub-agent-system.md', content);
  console.log('✅ Created: docs/reference/sub-agent-system.md (' + content.length + ' chars)');
  console.log('   Sub-agents documented: ' + subAgents.length);
}

extractSubAgentSystem().catch(console.error);
