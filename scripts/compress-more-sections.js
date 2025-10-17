#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Find IDs for these sections
async function findAndCompress() {
  const { data: sections } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, content')
    .eq('protocol_id', 'leo-v4-2-0-story-gates');

  const toCompress = [
    { 
      title: 'Database Trigger Management for Special Cases',
      compressed: `**Database Trigger Management**: Temporary trigger disable for special cases (infrastructure/protocol SDs).

**Safe Pattern**:
\`\`\`javascript
// Step 1: Disable trigger
await client.query('ALTER TABLE ... DISABLE TRIGGER trigger_name');

// Step 2: Critical operation
await client.query('UPDATE ...');

// Step 3: Re-enable (ALWAYS in finally block)
await client.query('ALTER TABLE ... ENABLE TRIGGER trigger_name');
\`\`\`

**When to Use**: Legitimate special cases, RLS blocking trigger validation, no other solution available

**Complete Pattern**: See \`docs/reference/trigger-management.md\``
    },
    {
      title: 'E2E Testing: Dev Mode vs Preview Mode (CRITICAL)',
      compressed: `**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Problem**: Preview mode (port 4173) may have blank page rendering issues
**Solution**: Use dev mode for E2E tests, preview mode only for production parity validation

**playwright.config.ts**:
\`\`\`typescript
const baseURL = 'http://localhost:5173';  // Dev mode (recommended)
webServer: { command: 'npm run dev -- --port 5173', port: 5173 }
\`\`\`

**Complete Guide**: See \`docs/reference/e2e-testing-modes.md\``
    },
    {
      title: 'Sub-Agent Auto-Trigger Enforcement (MANDATORY)',
      compressed: `**Sub-Agent Auto-Trigger Enforcement**: Sub-agents MUST trigger automatically, not manually.

**EXEC→PLAN Handoff Verification**:
\`\`\`javascript
// MANDATORY: Check for QA execution
const { data: qaResults } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', sd_id)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1);

if (!qaResults || qaResults.verdict === 'BLOCKED') {
  // BLOCK handoff
  process.exit(1);
}
\`\`\`

**Complete Pattern**: See \`docs/reference/sub-agent-automation.md\``
    },
    {
      title: 'Proactive Context Monitoring',
      compressed: `**Context Monitoring**: Report context health in EVERY handoff.

**Status Thresholds**:
- HEALTHY ✅: 0-140K tokens (0-70%)
- WARNING ⚠️: 140K-180K (70-90%) - Consider compaction
- CRITICAL 🔴: 180K-190K (90-95%) - MUST compact before handoff
- EMERGENCY 🚨: >190K (>95%) - BLOCKED

**Handoff Section Required**:
\`\`\`markdown
## Context Health
**Current Usage**: X tokens (Y% of 200K budget)
**Status**: HEALTHY/WARNING/CRITICAL
**Recommendation**: [action if needed]
\`\`\`

**Complete Guide**: See \`docs/reference/context-monitoring.md\``
    }
  ];

  let totalSaved = 0;

  for (const item of toCompress) {
    const section = sections.find(s => s.title === item.title);
    if (!section) {
      console.log('Not found: ' + item.title);
      continue;
    }

    const oldChars = section.content ? section.content.length : 0;
    
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: item.compressed })
      .eq('id', section.id);

    if (error) {
      console.error('Error:', error);
      continue;
    }

    const newChars = item.compressed.length;
    const saved = oldChars - newChars;
    totalSaved += saved;
    
    console.log(item.title.substring(0, 40) + ': ' + oldChars + ' → ' + newChars + ' (saved ' + saved + ')');
  }

  console.log('\nTotal saved: ' + totalSaved + ' chars');
}

findAndCompress().catch(console.error);
