#!/usr/bin/env node

/**
 * Add Proactive Context Monitoring section to LEO Protocol
 * Part of Context Management Improvements
 *
 * This adds mandatory token reporting requirements to agent handoffs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CONTEXT_MONITORING_CONTENT = `## Proactive Context Monitoring (MANDATORY)

**Critical Lesson**: Context management prevents conversation overflow and ensures smooth handoffs.

---

### Token Reporting in Every Handoff

**MANDATORY**: Before EVERY handoff, agents MUST report context health.

#### Context Health Section (Required in Handoffs)

\`\`\`markdown
## Context Health

**Current Usage**: [X] tokens ([Y]% of 200K budget)
**Status**: HEALTHY | WARNING | CRITICAL
**Recommendation**: [action if needed]
**Compaction Needed**: YES | NO
\`\`\`

---

### Context Status Thresholds

| Status | Token Range | Percentage | Action Required |
|--------|-------------|------------|-----------------|
| **HEALTHY** ✅ | 0-140K | 0-70% | Continue normally |
| **WARNING** ⚠️ | 140K-180K | 70-90% | Consider compaction |
| **CRITICAL** 🔴 | 180K-190K | 90-95% | MUST compact before handoff |
| **EMERGENCY** 🚨 | >190K | >95% | BLOCKED - Force handoff |

---

### Actions by Status

#### HEALTHY (< 140K tokens)
- ✅ No action needed
- Continue with current workflow
- Monitor every handoff

#### WARNING (140K-180K tokens)
- ⚠️ Consider running \`/context-compact\`
- Review sub-agent reports for compression
- Prepare for compaction in next phase

#### CRITICAL (180K-190K tokens)
- 🔴 **MUST** run \`/context-compact\` before handoff
- Compress historical handoffs
- Move verbose content to memory
- Cannot proceed to next phase without compaction

#### EMERGENCY (> 190K tokens)
- 🚨 **BLOCKED** - Cannot create handoff
- Emergency compaction required
- Force phase completion
- Full state dump to memory

---

### How Agents Report Context

**I (Claude) can see real-time token usage**:
\`\`\`
<system-reminder>Token usage: 127450/200000; 72550 remaining</system-reminder>
\`\`\`

**I will report in every handoff**:
1. Extract current token count
2. Calculate percentage used
3. Determine status (HEALTHY/WARNING/CRITICAL)
4. Recommend action if needed
5. Document in handoff "Context Health" section

---

### Automatic Triggers

Context compaction is **automatically recommended** when:
- Context exceeds 140K tokens (WARNING status)
- Before creating any handoff
- Before starting new phases
- When memory updates would add >10K tokens

---

### Compaction Command

When compaction needed:
\`\`\`bash
/context-compact
\`\`\`

This will:
- Analyze current context usage
- Compress sub-agent reports (Tier 3 → reference)
- Compress historical handoffs
- Move verbose details to memory
- Provide before/after token counts

---

### Integration with Handoff System

**7-Element Handoff Structure** now includes:
1. Executive Summary
2. Completeness Report
3. Deliverables Manifest
4. Key Decisions & Rationale
5. Known Issues & Risks
6. Resource Utilization **← Includes Context Health**
7. Action Items for Receiver

**Element 6 (Resource Utilization) now requires**:
\`\`\`markdown
## Resource Utilization

**Time Spent**:
- Phase duration: X hours
- Estimated remaining: Y hours

**Context Health** (REQUIRED):
- Current usage: X tokens (Y% of 200K)
- Status: HEALTHY/WARNING/CRITICAL
- Recommendation: [action]
- Compaction needed: YES/NO
\`\`\`

---

### Benefits

1. **Prevents overflow**: Early warning system before hitting 200K limit
2. **Smooth handoffs**: Ensures next agent has sufficient context budget
3. **Proactive management**: Address issues before they become blockers
4. **Visibility**: Everyone knows context health at all times
5. **Automation**: I (Claude) handle reporting automatically

---

**Related Tools**:
- \`/context-compact\` - Manual compaction command
- \`scripts/context-monitor.js\` - CLI token estimation tool
- \`lib/context/memory-manager.js\` - Memory persistence system
`;

async function addContextMonitoringSection() {
  console.log('\n📊 Adding Context Monitoring Section to LEO Protocol');
  console.log('='.repeat(60));
  console.log();

  try {
    // Get current active protocol
    const { data: protocol, error: protocolError } = await supabase
      .from('leo_protocols')
      .select('id, version')
      .eq('status', 'active')
      .single();

    if (protocolError || !protocol) {
      console.error('❌ Error finding active protocol:', protocolError);
      process.exit(1);
    }

    console.log(`✅ Found active protocol: ${protocol.version} (${protocol.id})`);
    console.log();

    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id, title')
      .eq('protocol_id', protocol.id)
      .eq('section_type', 'context_monitoring')
      .single();

    if (existing) {
      console.log('⚠️  Context monitoring section already exists');
      console.log(`   Updating: ${existing.title}`);
      console.log();

      const { error: updateError } = await supabase
        .from('leo_protocol_sections')
        .update({
          title: 'Proactive Context Monitoring',
          content: CONTEXT_MONITORING_CONTENT,
          order_index: 320,
          metadata: {
            source: 'Context Management Improvements',
            created_date: '2025-10-10',
            priority: 'high',
            category: 'context_management'
          }
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('❌ Update failed:', updateError);
        process.exit(1);
      }

      console.log('✅ Context monitoring section updated');
    } else {
      console.log('Creating new context monitoring section...');
      console.log();

      const { error: insertError } = await supabase
        .from('leo_protocol_sections')
        .insert({
          protocol_id: protocol.id,
          section_type: 'context_monitoring',
          title: 'Proactive Context Monitoring',
          content: CONTEXT_MONITORING_CONTENT,
          order_index: 320,
          metadata: {
            source: 'Context Management Improvements',
            created_date: '2025-10-10',
            priority: 'high',
            category: 'context_management'
          }
        });

      if (insertError) {
        console.error('❌ Insert failed:', insertError);
        process.exit(1);
      }

      console.log('✅ Context monitoring section added');
    }

    console.log();
    console.log('='.repeat(60));
    console.log('📋 NEXT STEPS:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify section appears in CLAUDE.md');
    console.log('   3. Test token reporting in next handoff');
    console.log('='.repeat(60));
    console.log();

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addContextMonitoringSection();
