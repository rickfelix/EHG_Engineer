#!/usr/bin/env node
/**
 * Add Sustainable Issue Resolution Philosophy to LEO Protocol
 *
 * This adds the user's preference for handling issues immediately
 * and systemically with sustainable solutions.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addSection() {
  console.log('🔧 Adding Sustainable Issue Resolution Philosophy section...\n');

  // Get active protocol ID
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ Could not find active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`📋 Active protocol: ${protocol.id} (v${protocol.version})`);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('protocol_id', protocol.id)
    .eq('section_type', 'sustainable_issue_resolution')
    .single();

  if (existing) {
    console.log('⚠️  Section already exists. Updating...');

    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: getSectionContent(),
        title: 'Sustainable Issue Resolution Philosophy'
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('❌ Update failed:', updateError);
      process.exit(1);
    }
    console.log('✅ Section updated successfully!');
  } else {
    // Get max order_index for CORE sections to place this appropriately
    const { data: maxOrder } = await supabase
      .from('leo_protocol_sections')
      .select('order_index')
      .eq('protocol_id', protocol.id)
      .eq('section_type', 'execution_philosophy')
      .single();

    // Place it right after execution_philosophy (or at order 25 if not found)
    const orderIndex = maxOrder ? maxOrder.order_index + 1 : 25;

    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'sustainable_issue_resolution',
        title: 'Sustainable Issue Resolution Philosophy',
        content: getSectionContent(),
        order_index: orderIndex,
        context_tier: 'CORE',
        target_file: 'CLAUDE_CORE.md',
        metadata: {
          added_by: 'chairman_preference',
          added_date: new Date().toISOString(),
          purpose: 'Handle issues immediately with sustainable solutions'
        }
      });

    if (insertError) {
      console.error('❌ Insert failed:', insertError);
      process.exit(1);
    }
    console.log('✅ Section added successfully!');
  }

  console.log('\n📝 Next steps:');
  console.log('   1. Update section-file-mapping.json to include the new section type');
  console.log('   2. Run: node scripts/generate-claude-md-from-db.js');
}

function getSectionContent() {
  return `## Sustainable Issue Resolution Philosophy

**CHAIRMAN PREFERENCE**: When encountering issues, bugs, or blockers during implementation:

### Core Principles

1. **Handle Issues Immediately**
   - Do NOT defer problems to "fix later" or create tech debt
   - Address issues as they arise, before moving forward
   - Blocking issues must be resolved before continuing

2. **Resolve Systemically**
   - Fix the root cause, not just the symptom
   - Consider why the issue occurred and prevent recurrence
   - Update patterns, validation rules, or documentation as needed

3. **Prefer Sustainable Solutions**
   - Choose fixes that will last, not quick patches
   - Avoid workarounds that need to be revisited
   - Ensure the solution integrates properly with existing architecture

### Implementation Guidelines

| Scenario | Wrong Approach | Right Approach |
|----------|----------------|----------------|
| Test failing | Skip test, add TODO | Fix underlying issue, ensure test passes |
| Type error | Cast to \`any\` | Fix types properly, update interfaces |
| Migration issue | Comment out problematic code | Fix schema, add proper handling |
| Build warning | Suppress warning | Address root cause of warning |
| Performance issue | Defer to "optimization SD" | Fix if simple; create SD only if complex |

### Exception Handling

If immediate resolution is truly impossible:
1. Document the issue thoroughly
2. Create a high-priority SD for resolution
3. Add a failing test that captures the issue
4. Note the workaround as TEMPORARY with removal timeline

**Default behavior**: Resolve now, resolve properly, resolve sustainably.`;
}

addSection().catch(console.error);
