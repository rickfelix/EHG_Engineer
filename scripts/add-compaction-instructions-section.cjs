#!/usr/bin/env node
/**
 * add-compaction-instructions-section.js
 *
 * Adds the Compaction Instructions section to leo_protocol_sections
 * This section tells Claude what to preserve during auto-compaction.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SECTION_CONTENT = `**When context is compacted (manually or automatically), ALWAYS preserve:**

1. **Current SD State** (NEVER LOSE):
   - Current SD key (e.g., \`SD-FIX-ANALYTICS-001\`)
   - Current phase (LEAD/PLAN/EXEC)
   - Gate pass/fail status
   - Active branch name

2. **Modified Files** (PRESERVE LIST):
   - All files changed in current session
   - Pending uncommitted changes
   - Recent commit hashes (last 3)

3. **Critical Context** (SUMMARIZE, DON'T DROP):
   - Active user stories being implemented
   - Specific error messages being debugged
   - Database query results that drive decisions
   - Test commands and their outcomes

4. **NEVER Compress Away**:
   - The \`.claude/session-state.md\` reference
   - The \`.claude/compaction-snapshot.md\` reference
   - Active PRD requirements
   - User's explicit instructions from this session

5. **Safe to Discard**:
   - Verbose sub-agent exploration logs
   - Full file contents (keep file paths only)
   - Repetitive status checks
   - Historical handoff details (older than current phase)

**After compaction, IMMEDIATELY read:**
- \`.claude/compaction-snapshot.md\` (git state)
- \`.claude/session-state.md\` (work state)

**Session Restoration Protocol**: If you notice context seems sparse or you're missing critical details, proactively ask: "I may have lost context during compaction. Let me check .claude/session-state.md for current work state."`;

async function main() {
  console.log('🔄 Adding Compaction Instructions section...');

  // Get active protocol (status = 'active')
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ Failed to get active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`📋 Active protocol: ${protocol.version} (${protocol.id})`);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'compaction_instructions')
    .single();

  if (existing) {
    // Update existing
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        title: 'Compaction Instructions (CRITICAL)',
        content: SECTION_CONTENT,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('❌ Failed to update section:', updateError);
      process.exit(1);
    }
    console.log('✅ Updated existing compaction_instructions section');
  } else {
    // Insert new
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'compaction_instructions',
        title: 'Compaction Instructions (CRITICAL)',
        content: SECTION_CONTENT,
        order_index: 615,  // After execution_philosophy (600-ish)
        context_tier: 'CORE',
        target_file: 'CLAUDE_CORE.md',
        priority: 'CORE'
      });

    if (insertError) {
      console.error('❌ Failed to insert section:', insertError);
      process.exit(1);
    }
    console.log('✅ Inserted new compaction_instructions section');
  }

  console.log('\n📝 Next steps:');
  console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
  console.log('   2. Verify CLAUDE_CORE.md contains the new section');
}

main().catch(console.error);
