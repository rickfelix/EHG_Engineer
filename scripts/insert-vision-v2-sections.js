#!/usr/bin/env node

/**
 * Insert Vision V2 protocol sections into leo_protocol_sections table
 *
 * Adds three sections for LEAD, PLAN, and EXEC phases to enforce
 * Vision V2 SD handling requirements.
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function insertVisionSections() {
  const client = await createDatabaseClient('engineer', { verify: true });

  try {
    const sections = [
      {
        protocol_id: 'leo-v4-3-3-ui-parity',
        section_type: 'vision_v2_lead',
        title: 'Vision V2 SD Handling (SD-VISION-V2-*)',
        content: `### MANDATORY: Vision Spec Reference Check

**For ALL SDs with ID matching \`SD-VISION-V2-*\`:**

Before LEAD approval, you MUST:

1. **Read the SD's metadata.vision_spec_references** field
2. **Read ALL files listed in \`must_read_before_prd\`**
3. **Verify scope aligns with referenced spec sections**

### Vision Document Locations

| Spec | Path | Content |
|------|------|---------|
| Database Schema | \`docs/vision/specs/01-database-schema.md\` | Tables, RLS, functions |
| API Contracts | \`docs/vision/specs/02-api-contracts.md\` | Endpoints, TypeScript interfaces |
| UI Components | \`docs/vision/specs/03-ui-components.md\` | React components, layouts |
| EVA Orchestration | \`docs/vision/specs/04-eva-orchestration.md\` | EVA modes, token budgets |
| Agent Hierarchy | \`docs/vision/specs/06-hierarchical-agent-architecture.md\` | LTREE, CEOs, VPs |
| Glass Cockpit | \`VISION_V2_GLASS_COCKPIT.md\` | Design philosophy |

### LEAD Approval Gate for Vision V2 SDs

**Additional questions for Vision V2 SDs:**

1. **Spec Alignment**: Does the SD scope match the referenced spec sections?
2. **25-Stage Insulation**: If SD touches agents/CEOs, does it maintain READ-ONLY access to venture_stage_work?
3. **Vision Document Traceability**: Are specific spec sections cited in the SD description?

### Implementation Guidance

All Vision V2 SDs contain this metadata:
\`\`\`json
"implementation_guidance": {
  "critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION",
  "creation_mode": "CREATE_FROM_NEW",
  "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new."
}
\`\`\``,
        order_index: 999,
        context_tier: 'PHASE_LEAD',
        target_file: 'CLAUDE_LEAD.md',
        metadata: JSON.stringify({ added_for: 'Vision V2 transition', added_date: '2025-12-13' })
      },
      {
        protocol_id: 'leo-v4-3-3-ui-parity',
        section_type: 'vision_v2_plan',
        title: 'Vision V2 PRD Requirements (SD-VISION-V2-*)',
        content: `### MANDATORY: Vision Spec Integration in PRDs

**For ALL PRDs for SDs matching \`SD-VISION-V2-*\`:**

Before creating a PRD, you MUST:

1. **Query SD metadata for vision spec references**
2. **Read ALL files listed in \`must_read_before_prd\`**
3. **Include vision spec citations in PRD sections**

### PRD Section Requirements for Vision V2

| PRD Section | Vision Spec Requirement |
|-------------|------------------------|
| \`technical_context\` | MUST cite specific spec sections that define the implementation |
| \`implementation_approach\` | MUST reference spec patterns/examples |
| \`acceptance_criteria\` | MUST include "Matches spec Section X" criteria |
| \`metadata\` | MUST include \`vision_spec_references\` from parent SD |

### PRD Template for Vision V2

Add this to PRD's \`technical_context\`:

\`\`\`markdown
### Vision Specification References

This PRD implements requirements from:
- **Primary Spec**: [spec-name.md](path/to/spec) - Sections X, Y, Z
- **Design Philosophy**: [VISION_V2_GLASS_COCKPIT.md](VISION_V2_GLASS_COCKPIT.md)

Key spec requirements addressed:
1. [Requirement from spec Section X]
2. [Requirement from spec Section Y]
\`\`\`

### Implementation Guidance (from SD metadata)

All Vision V2 SDs have \`creation_mode: CREATE_FROM_NEW\` - implement fresh per specs, learn from existing code but do not modify it.`,
        order_index: 999,
        context_tier: 'PHASE_PLAN',
        target_file: 'CLAUDE_PLAN.md',
        metadata: JSON.stringify({ added_for: 'Vision V2 transition', added_date: '2025-12-13' })
      },
      {
        protocol_id: 'leo-v4-3-3-ui-parity',
        section_type: 'vision_v2_exec',
        title: 'Vision V2 Implementation Requirements (SD-VISION-V2-*)',
        content: `### MANDATORY: Vision Spec Consultation Before Implementation

**For ALL implementations of SDs matching \`SD-VISION-V2-*\`:**

Before writing any code, you MUST:

1. **Query SD metadata for vision spec references**
2. **Read ALL files listed in \`must_read_before_exec\`**
3. **Follow patterns and structures defined in specs**

### Implementation Requirements for Vision V2

| Requirement | Description |
|-------------|-------------|
| **Spec Compliance** | Code MUST match spec definitions exactly (table names, column types, API shapes) |
| **25-Stage Insulation** | CEO Runtime MUST be OBSERVER-COMMITTER only - no direct venture_stage_work writes |
| **Glass Cockpit Design** | UI MUST follow progressive disclosure, minimal chrome philosophy |
| **Token Budget Enforcement** | All agent operations MUST respect venture token budgets |

### CREATE_FROM_NEW Policy

All Vision V2 SDs have this implementation guidance:
- **REVIEW** all vision files before implementation
- **CREATE FROM NEW** - similar files may exist to learn from, but implement fresh
- **DO NOT MODIFY** existing files - create new implementations per vision specs

### 25-Stage Insulation Checklist (SD-VISION-V2-005 CRITICAL)

**Before marking SD-VISION-V2-005 complete:**

- [ ] Zero direct INSERT/UPDATE/DELETE on \`venture_stage_work\`
- [ ] All stage transitions via \`fn_advance_venture_stage()\` only
- [ ] Gate types (auto/advisory/hard) respected
- [ ] E2E test verifies no direct writes to stage tables
- [ ] No new columns added to existing stage tables`,
        order_index: 999,
        context_tier: 'PHASE_EXEC',
        target_file: 'CLAUDE_EXEC.md',
        metadata: JSON.stringify({ added_for: 'Vision V2 transition', added_date: '2025-12-13' })
      }
    ];

    let successCount = 0;
    const errors = [];

    for (const section of sections) {
      try {
        const result = await client.query(
          `INSERT INTO leo_protocol_sections (
            protocol_id, section_type, title, content, order_index,
            context_tier, target_file, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING id, section_type, title`,
          [
            section.protocol_id,
            section.section_type,
            section.title,
            section.content,
            section.order_index,
            section.context_tier,
            section.target_file,
            section.metadata
          ]
        );

        successCount++;
        console.log(`✅ Inserted: ${result.rows[0].section_type} (${result.rows[0].title})`);
        console.log(`   ID: ${result.rows[0].id}`);
      } catch (error) {
        errors.push({ section: section.section_type, error: error.message });
      }
    }

    console.log(`\n📊 Summary: ${successCount}/3 sections inserted successfully`);

    if (errors.length > 0) {
      console.error('\n❌ Errors:');
      errors.forEach(e => console.error(`  - ${e.section}: ${e.error}`));
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

insertVisionSections().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
