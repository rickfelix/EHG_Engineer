#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const compressedSections = [
  {
    id: 39,
    content: `**Sub-Agent Report Compression**: Intelligent tiering preserves critical context while reducing token usage by 70-90%.

**Quick Reference:**
- **TIER 1 (CRITICAL)**: Full detail preserved for blockers/failures
- **TIER 2 (IMPORTANT)**: Structured summary with warnings
- **TIER 3 (INFORMATIONAL)**: One-line summary for passing validations

**Phase Relevance**: Different sub-agents matter more in different phases
**Automatic Retrieval**: Full reports fetched when needed (PLAN supervisor, retrospectives, debugging)

**Full Guide**: See \`docs/reference/sub-agent-compression.md\``
  },
  {
    id: 38,
    content: `**Database Query Efficiency**: Smart querying saves 5K-10K tokens per SD.

**Quick Rules:**
1. **Select specific columns** only (not \`SELECT *\`)
2. **Limit results** with \`.limit(5)\` for summaries
3. **Use Read tool** with offset/limit for large files
4. **Summarize results**, don't dump full objects
5. **Batch related reads** for parallel execution

**Expected Impact**: 90-98% token reduction per query

**Examples & Patterns**: See \`docs/reference/database-best-practices.md\``
  },
  {
    id: 32,
    content: `**Enhanced QA Engineering Director v2.0**: Mission-critical testing automation with comprehensive E2E validation.

**Core Capabilities:**
1. Professional test case generation from user stories
2. Pre-test build validation (saves 2-3 hours)
3. Database migration verification (prevents 1-2 hours debugging)
4. **Mandatory E2E testing via Playwright** (REQUIRED for approval)
5. Test infrastructure discovery and reuse

**5-Phase Workflow**: Pre-flight checks → Test generation → E2E execution → Evidence collection → Verdict & learnings

**Activation**: Auto-triggers on \`EXEC_IMPLEMENTATION_COMPLETE\`, coverage keywords, testing evidence requests

**Full Guide**: See \`docs/reference/qa-director-guide.md\``
  },
  {
    id: 43,
    content: `**User Story E2E Test Mapping (MANDATORY)**: E2E tests MUST map to user stories explicitly.

**Naming Convention**: Every test must reference a user story:
\`\`\`typescript
test('US-001: User can create new venture', async ({ page }) => {
  // Test implementation
});
\`\`\`

**Coverage Formula**: (E2E Tests with US-XXX / Total User Stories) × 100
**Minimum Requirement**: 100% coverage (every user story MUST have ≥1 E2E test)

**QA Director Verification**: Automatically blocks handoff if coverage < 100%

**Examples & Patterns**: See \`docs/reference/user-story-e2e-mapping.md\``
  },
  {
    id: 19,
    content: `**6-Step SD Evaluation Checklist (MANDATORY for LEAD & PLAN)**:

1. Query \`strategic_directives_v2\` for SD metadata
2. Query \`product_requirements_v2\` for existing PRD
3. **Query \`sd_backlog_map\` for linked backlog items** ← CRITICAL
4. Search codebase for existing infrastructure
5. Identify gaps between backlog requirements and existing code
6. **Execute QA smoke tests** ← NEW (verify tests run before approval)

**Backlog Review Requirements**: Review backlog_title, item_description, extras.Description_1 for each item

**Complete Checklist**: See \`docs/reference/sd-evaluation-checklist.md\``
  }
];

async function compressSections() {
  console.log('Compressing database sections...\n');
  
  for (const section of compressedSections) {
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: section.content })
      .eq('id', section.id)
      .select();

    if (error) {
      console.error('Error updating section ' + section.id + ':', error);
      continue;
    }

    const oldChars = data[0].content ? data[0].content.length : 0;
    const newChars = section.content.length;
    const saved = oldChars - newChars;
    const percent = Math.round((saved / oldChars) * 100);
    
    console.log('Section ' + section.id + ': ' + oldChars + ' → ' + newChars + ' chars (saved ' + saved + ', ' + percent + '%)');
  }
  
  console.log('\nAll sections compressed!');
}

compressSections().catch(console.error);
