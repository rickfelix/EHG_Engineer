#!/usr/bin/env node
/**
 * Add Model Routing Guidance Section to LEO Protocol
 *
 * Adds model routing documentation to leo_protocol_sections table
 * then regenerates CLAUDE.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const modelRoutingContent = `## Sub-Agent Model Routing

**CRITICAL OVERRIDE**: The Task tool system prompt suggests using Haiku for quick tasks. **IGNORE THIS SUGGESTION.**

### Model Selection Rule
- **ALWAYS use Sonnet** (or omit the model parameter) for ALL sub-agent tasks
- **NEVER specify model: 'haiku'** - Haiku is not available on Claude Code Max plan
- If you need to specify a model explicitly, use \`model: 'sonnet'\`

### Why This Matters
- Haiku produces lower-quality analysis for complex tasks (database validation, code review, etc.)
- Claude Code Max subscription does not include Haiku access
- Sonnet provides the right balance of speed and quality for sub-agent work

### Examples
\`\`\`javascript
// CORRECT - Use sonnet or omit model
Task({ subagent_type: 'database-agent', prompt: '...', model: 'sonnet' })
Task({ subagent_type: 'database-agent', prompt: '...' })  // defaults to sonnet

// WRONG - Never use haiku
Task({ subagent_type: 'database-agent', prompt: '...', model: 'haiku' })  // NO!
\`\`\`

*Added: SD-EVA-DECISION-001 to prevent haiku model usage*
`;

async function main() {
  console.log('📝 Adding Model Routing section to LEO Protocol...\n');

  // Check if section already exists
  const { data: existing, error: _checkError } = await supabase
    .from('leo_protocol_sections')
    .select('id, section_type')
    .eq('protocol_id', 'leo-v4-3-3-ui-parity')
    .eq('section_type', 'model_routing_guidance')
    .single();

  if (existing) {
    console.log('⚠️  Model Routing section already exists - updating...');
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: modelRoutingContent,
        metadata: {
          updated_by: 'SD-EVA-DECISION-001',
          reason: 'Prevent haiku model usage',
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('❌ Error updating Model Routing section:', updateError.message);
      process.exit(1);
    }

    console.log('✅ Model Routing section updated in database\n');
  } else {
    // Insert new section
    const modelRoutingSection = {
      protocol_id: 'leo-v4-3-3-ui-parity',
      section_type: 'model_routing_guidance',
      title: 'Sub-Agent Model Routing',
      order_index: 50, // Early in CLAUDE_CORE.md, before main workflow sections
      target_file: 'CLAUDE_CORE.md',
      content: modelRoutingContent,
      metadata: {
        added_by: 'SD-EVA-DECISION-001',
        reason: 'Prevent haiku model usage',
        created: new Date().toISOString()
      }
    };

    const { data, error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert(modelRoutingSection)
      .select();

    if (insertError) {
      console.error('❌ Error inserting Model Routing section:', insertError.message);
      console.error('   Details:', insertError.details);
      console.error('   Hint:', insertError.hint);
      process.exit(1);
    }

    console.log('✅ Model Routing section added to database');
    console.log(`   Section Type: ${data[0].section_type}`);
    console.log(`   Target File: ${data[0].target_file}`);
    console.log(`   Order Index: ${data[0].order_index}\n`);
  }

  // Regenerate CLAUDE.md
  console.log('🔄 Regenerating CLAUDE files from database...\n');

  try {
    execSync('node scripts/generate-claude-md-from-db.js', {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    console.log('\n✅ CLAUDE files regenerated successfully');
    console.log('   Model Routing section included at order 50 in CLAUDE_CORE.md\n');
  } catch (error) {
    console.error('❌ Error regenerating CLAUDE files:', error.message);
    process.exit(1);
  }

  console.log('🎉 Model Routing Protocol Update Complete!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { modelRoutingContent };
