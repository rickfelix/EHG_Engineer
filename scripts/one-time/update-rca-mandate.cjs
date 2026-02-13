#!/usr/bin/env node
/**
 * One-time script: Update RCA Issue Resolution Mandate with Five-Point Brief
 * Updates leo_protocol_sections id=424
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const newContent = `## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use \`subagent_type="rca-agent"\` via the Task tool

### Sub-Agent Prompt Quality Standard (Five-Point Brief)

**CRITICAL**: The prompt you write when spawning ANY sub-agent is the highest-impact point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

Every sub-agent invocation MUST include these five elements:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | Observable behavior (what IS happening) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, DB tables involved | "routes/users.js line 45, lib/queries/user-lookup.js" |
| **Frequency** | How often, when it started, pattern | "Started 2h ago, every 3rd request fails" |
| **Prior attempts** | What was already tried (so agent doesn't repeat) | "Server restart didn't help, DNS is fine" |
| **Desired outcome** | What success looks like | "Identify root cause, propose fix with <30min implementation" |

**Anti-patterns** (NEVER do these):
- ❌ "Analyze why [issue] is occurring" — too vague, agent has nothing to anchor on
- ❌ Dumping entire conversation context — unrelated tokens waste investigation capacity
- ❌ Omitting prior attempts — agent repeats your failed approaches

**Example invocation (GOOD - RCA agent):**
\`\`\`
Task tool with subagent_type="rca-agent":
"Symptom: SD cannot be marked completed. DB trigger rejects with 'Progress: 20% (need 100%)'.
Location: get_progress_breakdown() function, trigger on strategic_directives_v2, UUID: 7d2aa25e
Frequency: 6th child of orchestrator. First 5 siblings completed. Only this one stuck.
Prior attempts: Direct status update blocked. Checked sd_phase_handoffs — empty for all siblings.
Desired outcome: Identify what mechanism marked sibling phases complete, apply same to this SD."
\`\`\`

**Example invocation (BAD - too vague):**
\`\`\`
Task tool with subagent_type="rca-agent":
"Analyze why the SD completion is failing. Perform 5-whys analysis and identify the root cause."
\`\`\`

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in \`issue_patterns\` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**`;

async function main() {
  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', 424);

  if (error) {
    console.error('Error updating section 424:', error.message);
    process.exit(1);
  }
  console.log('✅ Section 424 (RCA mandate) updated with Five-Point Brief');

  // Verify
  const { data } = await supabase
    .from('leo_protocol_sections')
    .select('content')
    .eq('id', 424)
    .single();

  const hasBackticks = data.content.includes('subagent_type="rca-agent"');
  const hasFivePoint = data.content.includes('Five-Point Brief');
  const hasIssuePatterns = data.content.includes('issue_patterns');
  const hasGoodExample = data.content.includes('Symptom: SD cannot be marked');
  const hasBadExample = data.content.includes('too vague');

  console.log('Verification:');
  console.log('  subagent_type reference:', hasBackticks ? '✅' : '❌');
  console.log('  Five-Point Brief:', hasFivePoint ? '✅' : '❌');
  console.log('  issue_patterns:', hasIssuePatterns ? '✅' : '❌');
  console.log('  Good example:', hasGoodExample ? '✅' : '❌');
  console.log('  Bad example:', hasBadExample ? '✅' : '❌');
}

main();
