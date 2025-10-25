#!/usr/bin/env node
/**
 * Insert Proactive Learning Sections into LEO Protocol Database
 * SD-LEO-LEARN-001: Proactive Learning Integration
 *
 * Inserts knowledge retrieval sections into leo_protocol_sections table
 * for PHASE_EXEC, PHASE_PLAN, and PHASE_LEAD tiers.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sections = [
  {
    protocol_id: 'leo-v4-2-0-story-gates',
    context_tier: 'PHASE_EXEC',
    section_type: 'knowledge_retrieval',
    title: '🔍 Pre-Implementation Knowledge Retrieval (MANDATORY)',
    content: `**SD-LEO-LEARN-001: Proactive Learning Integration**

**CRITICAL**: Run BEFORE starting implementation to retrieve relevant historical lessons.

## Step 0: Knowledge Preflight Check

**Run this command before writing any code**:

\`\`\`bash
node scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>
\`\`\`

## What This Does

Queries historical knowledge base for:
- **Issue patterns** relevant to your SD category
- **Retrospectives** from similar past work
- **Proven solutions** with success rates >85%
- **Common pitfalls** to avoid (success rate <50%)
- **Prevention checklists** for proactive measures

## How to Use Results

1. **High Success Patterns (✅ ≥85%)**:
   - Apply proven solutions preemptively
   - Add to implementation plan before encountering issues
   - Example: "PAT-004 shows server restart needed after changes → add to workflow"

2. **Moderate Patterns (⚠️ 50-85%)**:
   - Be aware, prepare contingencies
   - Document why you chose alternative approach
   - Example: "PAT-002 test path errors → verify imports carefully"

3. **Low Success Patterns (❌ <50%)**:
   - Known failure modes, avoid these approaches
   - Flag in handoff if you must use similar approach
   - Example: "PAT-007 sub-agent not triggering → use manual invocation"

## Handoff Documentation (MANDATORY)

Add "Patterns Consulted" section to your handoff:

\`\`\`markdown
## Patterns Consulted

- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%, Applied: Yes)
- PAT-004: Server restart needed for changes (Success: 100%, Applied: Yes)
- PAT-002: Test path errors after refactor (Success: 100%, Not encountered)
\`\`\`

## Why This Matters

- **Prevents repeated mistakes**: 60%+ of issues have been seen before
- **Saves time**: Apply proven solutions immediately (avg 15-20 min saved)
- **Builds institutional memory**: Every SD benefits from prior learnings
- **Reduces rework**: Proactive prevention vs reactive debugging

## Quick Reference

\`\`\`bash
# Before starting implementation (MANDATORY)
node scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>

# View detailed pattern info
node scripts/search-prior-issues.js "<issue description>"

# View knowledge summaries (updated weekly)
ls docs/summaries/lessons/*.md
\`\`\`

**Time Investment**: 30 seconds to run, 2-3 minutes to review
**Time Saved**: 15-60 minutes of debugging/rework`,
    order_index: 100, // Insert early in EXEC phase
    metadata: {
      added_by: 'SD-LEO-LEARN-001',
      added_date: new Date().toISOString(),
      purpose: 'Proactive knowledge retrieval for implementation phase'
    },
    target_file: 'CLAUDE_EXEC.md'
  },
  {
    protocol_id: 'leo-v4-2-0-story-gates',
    context_tier: 'PHASE_PLAN',
    section_type: 'knowledge_retrieval',
    title: '📚 Automated PRD Enrichment (MANDATORY)',
    content: `**SD-LEO-LEARN-001: Proactive Learning Integration**

**CRITICAL**: Run BEFORE writing PRD to incorporate historical lessons.

## Step 0: Knowledge Preflight Check

**Run this command before creating PRD**:

\`\`\`bash
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>
node scripts/enrich-prd-with-research.js <SD_UUID>  # If available
\`\`\`

## What This Does

Automatically:
1. Queries retrospectives for similar SDs
2. Extracts proven technical approaches
3. Identifies common pitfalls → adds to "Risks & Mitigations"
4. Suggests prevention measures → adds to acceptance criteria
5. Updates user_stories.implementation_context

## How to Use Results

### In PRD "Technical Approach" Section
- Include proven solutions from high-success patterns
- Reference historical approaches that worked well
- Example: "Based on PAT-001 (100% success), we'll verify schema types before..."

### In PRD "Risks & Mitigations" Section
- Document known pitfalls from retrospectives
- Add prevention measures from historical failures
- Example: "Risk: Test path errors after refactor (PAT-002). Mitigation: Verify all imports."

### In PRD "Acceptance Criteria"
- Include prevention checklist items
- Add validation steps from proven patterns
- Example: "[ ] Schema types verified against database (prevents PAT-001)"

## Verification

Verify enrichment appears in PRD's "Reference Materials" section:

\`\`\`markdown
## Reference Materials

### Historical Patterns Consulted
- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%)
- SD-SIMILAR-001 Retrospective: Database validation prevented 3 rework cycles

### Prevention Measures Applied
- Schema verification before implementation
- Test path validation in acceptance criteria
\`\`\`

## Why This Matters

- **Better PRDs**: Incorporate lessons before design, not after errors
- **Prevents design flaws**: Known pitfalls addressed in planning
- **Faster implementation**: EXEC has clear prevention guidance
- **Higher quality**: Proven approaches baked into requirements

## Quick Reference

\`\`\`bash
# Before creating PRD (MANDATORY)
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>

# Enrich PRD with research (if script exists)
node scripts/enrich-prd-with-research.js <SD_UUID>

# View category-specific lessons
cat docs/summaries/lessons/<category>-lessons.md
\`\`\`

**Time Investment**: 1-2 minutes
**Time Saved**: 30-90 minutes of EXEC rework`,
    order_index: 50, // Insert early in PLAN phase
    metadata: {
      added_by: 'SD-LEO-LEARN-001',
      added_date: new Date().toISOString(),
      purpose: 'Proactive knowledge retrieval for planning phase'
    },
    target_file: 'CLAUDE_PLAN.md'
  },
  {
    protocol_id: 'leo-v4-2-0-story-gates',
    context_tier: 'PHASE_LEAD',
    section_type: 'knowledge_retrieval',
    title: '📖 Historical Context Review (RECOMMENDED)',
    content: `**SD-LEO-LEARN-001: Proactive Learning Integration**

**RECOMMENDED**: Run BEFORE approving SD to review historical context.

## Step 0: Historical Context Check

**Run this command before SD approval**:

\`\`\`bash
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>
\`\`\`

## What This Does

Queries historical knowledge base for:
- **Over-engineering patterns** in this SD category
- **Similar past SDs** and their outcomes
- **Complexity indicators** (actual vs estimated time)
- **Scope creep history** (SDs split due to bloat)

## Red Flags to Watch For

### Over-Engineering Indicators
- Pattern shows "over-engineering" occurred 2+ times in this category
- Historical resolution time >5x original estimate
- Past SDs in category were split due to scope bloat
- Complexity score disproportionate to business value

### Strategic Concerns
- Similar SDs had high failure/rework rates
- Category has pattern of expanding beyond initial scope
- Technical approach more complex than necessary
- Dependencies create cascading risks

## How to Use Results

### If Red Flags Found
1. Apply simplicity-first lens more rigorously
2. Challenge technical complexity in strategic validation
3. Request PLAN to simplify approach before approval
4. Consider phased delivery (MVP first, enhancements later)

### Document in Approval
Add to approval notes:

\`\`\`markdown
## Historical Context Reviewed

Consulted 3 prior retrospectives in [category]:
- SD-SIMILAR-001: Over-engineered auth (8 weeks → 3 weeks after simplification)
- SD-SIMILAR-002: Scope expanded 3x during implementation
- PAT-009: Premature abstraction in [category] (40% success rate)

**Decision**: Approved with simplicity constraints:
- MVP scope only (defer advanced features to Phase 2)
- Weekly complexity reviews during PLAN
- Hard cap: 400 LOC per component
\`\`\`

### If No Red Flags
- Proceed with standard approval process
- Note historical consultation in approval
- Builds confidence in strategic decision

## Why This Matters

- **Prevents strategic mistakes**: Learn from past over-engineering
- **Informed decisions**: Data-driven approval vs intuition
- **Protects team time**: Avoid repeating known pitfalls
- **Builds pattern recognition**: Strategic lens improves over time

## Quick Reference

\`\`\`bash
# Before SD approval (RECOMMENDED)
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>

# Review over-engineering patterns
node scripts/search-prior-issues.js --category over_engineering --list

# Check category history
node scripts/search-prior-issues.js "<SD category>" --retrospectives
\`\`\`

**Time Investment**: 1-2 minutes
**Value**: Strategic foresight, prevents month-long mistakes`,
    order_index: 200, // Insert in LEAD pre-approval
    metadata: {
      added_by: 'SD-LEO-LEARN-001',
      added_date: new Date().toISOString(),
      purpose: 'Proactive knowledge retrieval for strategic approval'
    },
    target_file: 'CLAUDE_LEAD.md'
  },
  {
    protocol_id: 'leo-v4-2-0-story-gates',
    context_tier: 'CORE',
    section_type: 'quick_reference',
    title: 'Knowledge Retrieval Commands',
    content: `## 🔍 Knowledge Retrieval (Proactive Learning)

**SD-LEO-LEARN-001: Added 2025-10-25**

\`\`\`bash
# Before starting any phase (MANDATORY for EXEC/PLAN, RECOMMENDED for LEAD)
node scripts/phase-preflight.js --phase <LEAD|PLAN|EXEC> --sd-id <UUID>

# Search for specific issues
node scripts/search-prior-issues.js "<issue description>"

# Generate fresh knowledge summaries (weekly)
node scripts/generate-knowledge-summary.js --category <category>
node scripts/generate-knowledge-summary.js --category all

# View existing summaries
ls docs/summaries/lessons/*.md
cat docs/summaries/lessons/database-lessons.md
\`\`\`

**Philosophy**: Consult lessons BEFORE encountering issues, not after.`,
    order_index: 999, // Append to quick reference
    metadata: {
      added_by: 'SD-LEO-LEARN-001',
      added_date: new Date().toISOString(),
      purpose: 'Quick reference for proactive learning commands'
    },
    target_file: 'CLAUDE_CORE.md'
  }
];

async function insertSections() {
  console.log('\n📚 Inserting Proactive Learning Sections into LEO Protocol Database');
  console.log('═'.repeat(75));
  console.log('\n📋 SD: SD-LEO-LEARN-001');
  console.log(`📊 Sections to insert: ${sections.length}\n`);

  for (const section of sections) {
    console.log(`\n🔄 Inserting: ${section.title}`);
    console.log(`   Tier: ${section.context_tier}`);
    console.log(`   Order: ${section.order_index}`);
    console.log(`   Target: ${section.target_file}`);

    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .insert(section)
      .select();

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    console.log(`   ✅ Inserted: ID ${data[0].id}`);
  }

  console.log('\n═'.repeat(75));
  console.log('✅ All sections inserted successfully!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
  console.log('   2. Verify: CLAUDE_EXEC.md, CLAUDE_PLAN.md, CLAUDE_LEAD.md, CLAUDE_CORE.md');
  console.log('   3. Commit: Changes to LEO Protocol files\n');
}

async function main() {
  try {
    await insertSections();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
