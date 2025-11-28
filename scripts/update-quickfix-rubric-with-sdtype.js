#!/usr/bin/env node

/**
 * Update Quick Fix Rubric with SD Type Awareness
 *
 * SD: SD-TECH-DEBT-DOCS-001
 * Purpose: Add sd_type-aware validation and multi-checkpoint detection guidance
 *
 * Updates leo_protocol_sections table (database-first approach)
 * Then regenerate CLAUDE_LEAD.md via: node scripts/generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UPDATED_CONTENT = `## SD to Quick Fix Reverse Rubric

**Purpose**: Evaluate if an incoming SD should be downgraded to Quick Fix workflow.

**Why**: Quick Fix to SD escalation exists, but reverse does not. 7+ QA-category SDs went through full LEAD-PLAN-EXEC workflow unnecessarily.

### Downgrade Criteria (ALL must be true)

| Criterion | Check |
|-----------|-------|
| Category | quality_assurance, documentation, or bug_fix |
| Scope | Estimated LOC 50 or less OR no code changes (verification only) |
| Complexity | No architectural decisions needed |
| PRD | No PRD required (validation/verification task) |
| Duration | Single session completion expected |
| Risk | Low risk (no auth, schema, security, migration) |

### Anti-Criteria (ANY blocks downgrade)

- Contains: migration, schema change, auth, security, RLS
- Severity is critical
- Multiple files changed (more than 3)
- Requires sub-agent validation (DATABASE, SECURITY)

### SD Type Classification (NEW - LEO v4.3.3)

**IMPORTANT**: If SD is NOT a code change, set \`sd_type\` appropriately:

| sd_type | Description | Validation Requirements |
|---------|-------------|------------------------|
| \`feature\` | UI/UX, customer-facing features | Full (TESTING, GITHUB, DOCMON, etc.) |
| \`infrastructure\` | CI/CD, tooling, protocols | Reduced (DOCMON, STORIES, GITHUB) |
| \`database\` | Schema migrations | Full + DATABASE sub-agent |
| \`security\` | Auth, RLS, permissions | Full + SECURITY sub-agent |
| \`documentation\` | Docs only, no code changes | Minimal (DOCMON, STORIES only) |

**Auto-Detection**: The system auto-detects sd_type at PRD creation based on:
- SD title/scope keywords
- Category field
- Functional requirements analysis

**Manual Override**: If auto-detection fails, manually set sd_type:
\`\`\`sql
UPDATE strategic_directives_v2 SET sd_type = 'documentation' WHERE id = 'SD-XXX';
\`\`\`

### Documentation-Only SD Handling

When reviewing an SD that involves **NO CODE CHANGES** (e.g., file migration, cleanup, audit):

1. **Set sd_type = 'documentation'** before PLAN phase
2. **Skip TESTING/GITHUB** sub-agents automatically
3. **Require only**: DOCMON pass + Retrospective

**Detection Keywords** (trigger documentation-only classification):
- "cleanup", "migrate markdown", "archive", "audit", "report"
- "documentation only", "no code changes", "verification only"

**Example SD-TECH-DEBT-DOCS-001**: Migration of 34 legacy markdown files was blocked by TESTING sub-agent because sd_type was not set to 'documentation'.

### LEAD Agent Action

When reviewing a new SD that matches ALL downgrade criteria, suggest:

This SD qualifies for Quick Fix workflow.
- Category: quality_assurance
- Estimated scope: 50 LOC or less / verification only

Consider using /quick-fix to reduce overhead.
- Quick Fix skips: LEAD approval, PRD, sub-agents, full validation gates
- Quick Fix keeps: Dual tests, server restart, UAT, PR creation

**For Documentation-Only SDs** (not Quick Fix eligible due to scope):
1. Proceed with full SD workflow
2. Set \`sd_type = 'documentation'\` in database
3. TESTING/GITHUB validation will be automatically skipped

### Reference

- Quick Fix escalation: .claude/commands/quick-fix.md lines 139-148
- SD Type validation: lib/utils/sd-type-validation.js
- Evidence: SD-TECH-DEBT-DOCS-001 (documentation SD blocked by code-centric validation)
- Pattern: 7 QA-category SDs went through full workflow`;

async function updateSection() {
  console.log('📝 Updating Quick Fix Rubric with SD Type Awareness...\n');

  // Update the section
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .update({
      content: UPDATED_CONTENT,
      metadata: {
        added_by: 'EXEC',
        evidence_sd: 'SD-TECH-DEBT-DOCS-001',
        qa_sd_count: 7,
        updated_at: new Date().toISOString(),
        update_reason: 'Added sd_type awareness and documentation-only SD handling',
        version: '4.3.3'
      }
    })
    .eq('id', 187)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to update section:', error.message);
    process.exit(1);
  }

  console.log('✅ Section updated successfully!');
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Target: ${data.target_file}`);

  console.log('\n📋 Next Steps:');
  console.log('   1. Regenerate CLAUDE_LEAD.md:');
  console.log('      node scripts/generate-claude-md-from-db.js');
  console.log('   2. Verify changes in CLAUDE_LEAD.md');
}

updateSection().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
