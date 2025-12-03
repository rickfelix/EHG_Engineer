#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function generateSessionPrologue() {
  console.log('📝 Generating session prologue template...\n');

  // Fetch active protocol version
  const { data: protocol } = await supabase
    .from('leo_protocols')
    .select('version, title')
    .eq('status', 'active')
    .single();

  const version = protocol?.version || 'v4.2.0_story_gates';
  const title = protocol?.title || 'LEO Protocol';

  const content = `# Session Prologue - ${title} ${version}
*Copy-paste this at session start to align Claude with EHG_Engineer practices*
*Generated: ${new Date().toISOString()}*

## Core Directives

1. **Follow LEAD→PLAN→EXEC workflow** - Target ≥85% gate pass rate for all phases
2. **Activate sub-agents** - Architect (design/boundaries), QA (tests/coverage), Reviewer (PR checks). Summarize outputs concisely
3. **Database-first artifacts** - No markdown files as source of truth; use DB tables for PRDs, handoffs, retros
4. **Small PRs only** - Keep diffs ≤100 lines per change; split larger work into increments
5. **7-element handoffs** - Required for all phase transitions: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items
6. **Priority-first approach** - Use \`npm run prio:top3\` to justify work selection

## Slash Commands Cheatsheet

- \`/plan\` - Outline implementation steps and files to change
- \`/implement <ticket>\` - Execute with code, tests, and handoff
- \`/review pr:<#>\` - Apply rubric: correctness, tests, types, a11y, perf, security
- \`/test changed\` - Run focused tests on modified code

## Quick Checks

- \`npm run sd:next\` - **START HERE** - Intelligent SD queue showing what to work on next
- \`npm run prio:top3\` - View current top 3 priorities with WSJF scores
- \`npm run sd:status\` - Progress vs baseline with variance analysis
- \`npm run sd:burnrate\` - Velocity metrics and completion forecasting

## Session Start Workflow

1. Run \`npm run sd:next\` to see the SD queue
2. If SD marked "CONTINUE" → Resume that SD
3. If no active SD → Pick highest-ranked READY SD
4. Load CLAUDE_LEAD.md for approval workflow

---
*Remind Claude: Follow database-first, keep PRs small, use sub-agents, create handoffs*`;

  const outputPath = path.join(process.cwd(), 'templates', 'session-prologue.md');
  fs.writeFileSync(outputPath, content);

  console.log(`✅ Generated ${outputPath}`);
  console.log(`📋 Protocol: ${title} ${version}`);
}

generateSessionPrologue().catch(console.error);