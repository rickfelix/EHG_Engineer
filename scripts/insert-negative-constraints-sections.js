#!/usr/bin/env node

/**
 * Insert Negative Constraints Sections for SD-LEO-GEMINI-001
 *
 * This script adds <negative_constraints> XML blocks to each CLAUDE_*.md file
 * via the leo_protocol_sections database table.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROTOCOL_ID = 'leo-v4-3-3-ui-parity';

// Negative Constraints for CLAUDE_CORE.md (Global Anti-Patterns)
const CORE_NEGATIVE_CONSTRAINTS = `
## 🚫 Global Negative Constraints

<negative_constraints phase="GLOBAL">
These anti-patterns apply across ALL phases. Violating them leads to failed handoffs, rework, and wasted effort.

### NC-001: No Markdown Files as Source of Truth
**Anti-Pattern**: Creating or updating markdown files (*.md) to store requirements, PRDs, or status
**Why Wrong**: Data becomes stale, conflicts with database, no validation
**Correct Approach**: Use database tables (strategic_directives_v2, product_requirements_v2) via scripts

### NC-002: No Bypassing Process Scripts
**Anti-Pattern**: Directly inserting into database tables instead of using handoff.js, add-prd-to-database.js
**Why Wrong**: Skips validation gates, breaks audit trail, causes inconsistent state
**Correct Approach**: Always use the designated scripts for phase transitions

### NC-003: No Guessing File Locations
**Anti-Pattern**: Assuming file paths based on naming conventions without verification
**Why Wrong**: Leads to wrong file edits, missing imports, broken builds
**Correct Approach**: Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
**Anti-Pattern**: Starting to code before reading existing implementation
**Why Wrong**: Duplicates existing functionality, conflicts with patterns, wastes time
**Correct Approach**: Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
**Anti-Pattern**: Implementing quick fixes without understanding why something fails
**Why Wrong**: 2-3x time multiplier, masks real issues, accumulates technical debt
**Correct Approach**: Identify root cause first, then fix. Document if workaround needed.
</negative_constraints>
`;

// Negative Constraints for CLAUDE_PLAN.md (PLAN Phase Anti-Patterns)
const PLAN_NEGATIVE_CONSTRAINTS = `
## 🚫 PLAN Phase Negative Constraints

<negative_constraints phase="PLAN">
These anti-patterns are specific to the PLAN phase. Violating them leads to incomplete PRDs and blocked handoffs.

### NC-PLAN-001: No Implementation in PLAN Phase
**Anti-Pattern**: Writing actual code (components, services, migrations) during PLAN
**Why Wrong**: PLAN is for specification, not execution. Code written here won't be tracked.
**Correct Approach**: Document requirements, architecture, and test scenarios. Save coding for EXEC.

### NC-PLAN-002: No PRD Without Exploration
**Anti-Pattern**: Creating PRD immediately after SD approval without reading codebase
**Why Wrong**: PRDs miss existing infrastructure, create duplicate work, conflict with patterns
**Correct Approach**: Read ≥5 relevant files, document findings in exploration_summary

### NC-PLAN-003: No Boilerplate Acceptance Criteria
**Anti-Pattern**: Using generic criteria like "all tests pass", "code review done", "meets requirements"
**Why Wrong**: Russian Judge detects boilerplate (≤50% score), blocks PLAN→EXEC handoff
**Correct Approach**: Write specific, measurable criteria tied to functional requirements

### NC-PLAN-004: No Skipping Sub-Agents
**Anti-Pattern**: Creating PRD without running DESIGN, DATABASE sub-agents
**Why Wrong**: Gate 1 blocks handoff if sub-agent execution not recorded
**Correct Approach**: Execute sub-agents via lib/sub-agent-executor.js, store results in database

### NC-PLAN-005: No Placeholder Requirements
**Anti-Pattern**: Using "TBD", "to be defined", "will be determined" in requirements
**Why Wrong**: PRD validator blocks placeholders, signals incomplete planning
**Correct Approach**: If truly unknown, use AskUserQuestion to clarify before PRD creation
</negative_constraints>
`;

// Negative Constraints for CLAUDE_EXEC.md (EXEC Phase Anti-Patterns)
const EXEC_NEGATIVE_CONSTRAINTS = `
## 🚫 EXEC Phase Negative Constraints

<negative_constraints phase="EXEC">
These anti-patterns are specific to the EXEC phase. Violating them leads to failed tests and rejected handoffs.

### NC-EXEC-001: No Scope Creep
**Anti-Pattern**: Implementing features not in PRD, "improving" unrelated code, adding "nice to have" features
**Why Wrong**: Scope creep derails timelines, introduces untested changes, confuses review
**Correct Approach**: Implement ONLY what's in the PRD. Create new SD for additional work.

### NC-EXEC-002: No Wrong Application Directory
**Anti-Pattern**: Working in EHG_Engineer when target is ehg app (or vice versa)
**Why Wrong**: Changes applied to wrong codebase, tests fail in CI, deployment issues
**Correct Approach**: Verify pwd matches PRD target_application before ANY changes

### NC-EXEC-003: No Tests Without Execution
**Anti-Pattern**: Claiming "tests exist" without actually running them
**Why Wrong**: 30-minute gaps between "complete" and discovering failures (SD-EXPORT-001)
**Correct Approach**: Run BOTH npm run test:unit AND npm run test:e2e, document results

### NC-EXEC-004: No Manual Sub-Agent Simulation
**Anti-Pattern**: Manually creating sub-agent results instead of executing actual tools
**Why Wrong**: 15% quality delta between manual (75%) and tool-executed (60%) confidence
**Correct Approach**: Sub-agent results must have tool_executed: true with real output

### NC-EXEC-005: No UI Without Visibility
**Anti-Pattern**: Backend implementation without corresponding UI to display results
**Why Wrong**: LEO v4.3.3 UI Parity Gate blocks features users can't see
**Correct Approach**: Every backend field must have corresponding UI component
</negative_constraints>
`;

// PRD Template Scaffolding for CLAUDE_PLAN.md
const PRD_TEMPLATE_SCAFFOLD = `
## 📋 PRD Template Scaffolding

When creating a PRD, use this scaffold as a starting point. Fill in each section with specific, measurable content.

### PRD Creation Checklist

Before running \`node scripts/add-prd-to-database.js\`:

1. **Exploration Complete?** (Discovery Gate)
   - [ ] Read ≥5 relevant files
   - [ ] Documented findings in exploration_summary
   - [ ] Identified existing patterns to follow

2. **Requirements Specific?** (Russian Judge)
   - [ ] No "TBD" or placeholder text
   - [ ] Each requirement has acceptance criteria
   - [ ] Test scenarios are concrete (not "verify it works")

3. **Architecture Defined?**
   - [ ] Integration points identified
   - [ ] Data flow documented
   - [ ] Dependencies listed

### PRD Section Guide

| Section | Guiding Questions | Example |
|---------|-------------------|---------|
| **executive_summary** | What? Why? Impact? | "This PRD defines X to solve Y, reducing Z by N%" |
| **functional_requirements** | What must it do? How measured? | FR-1: System shall display X when Y occurs |
| **technical_requirements** | What technologies? Constraints? | Must integrate with existing Supabase RLS |
| **system_architecture** | How do components interact? | Data flows: API → Service → Database |
| **test_scenarios** | How do we verify? Edge cases? | TS-1: Given empty input, should show validation error |
| **acceptance_criteria** | How do we know it's done? | All E2E tests pass, Russian Judge ≥70% |
| **risks** | What could go wrong? Mitigations? | Risk: API rate limits. Mitigation: caching layer |

### PRD Script Usage

\`\`\`bash
# Create PRD with all required fields
node scripts/add-prd-to-database.js \\
  --sd-id SD-XXX-001 \\
  --title "Feature Name" \\
  --status planning

# Or use the generated script template:
node scripts/create-prd-sd-xxx-001.js
\`\`\`

### Self-Critique Before Handoff

Before submitting PLAN→EXEC handoff, ask yourself:
- **Confidence (1-10)**: How confident am I this PRD is complete?
- **Gaps**: What areas might need clarification during EXEC?
- **Assumptions**: What am I assuming that should be validated?

If confidence < 7, revisit the PRD before handoff.
`;

async function insertSections() {
  console.log('📝 Inserting Negative Constraints Sections');
  console.log('='.repeat(60));

  const sections = [
    {
      protocol_id: PROTOCOL_ID,
      section_type: 'negative_constraints_global',
      title: 'Global Negative Constraints',
      content: CORE_NEGATIVE_CONSTRAINTS.trim(),
      order_index: 15, // Early in CORE
      target_file: 'CLAUDE_CORE.md',
      context_tier: 'CORE',
      metadata: { sd_source: 'SD-LEO-GEMINI-001', user_story: 'US-003' }
    },
    {
      protocol_id: PROTOCOL_ID,
      section_type: 'negative_constraints_plan',
      title: 'PLAN Phase Negative Constraints',
      content: PLAN_NEGATIVE_CONSTRAINTS.trim(),
      order_index: 25, // After PRD requirements
      target_file: 'CLAUDE_PLAN.md',
      context_tier: 'PHASE_PLAN',
      metadata: { sd_source: 'SD-LEO-GEMINI-001', user_story: 'US-004' }
    },
    {
      protocol_id: PROTOCOL_ID,
      section_type: 'negative_constraints_exec',
      title: 'EXEC Phase Negative Constraints',
      content: EXEC_NEGATIVE_CONSTRAINTS.trim(),
      order_index: 25, // After implementation requirements
      target_file: 'CLAUDE_EXEC.md',
      context_tier: 'PHASE_EXEC',
      metadata: { sd_source: 'SD-LEO-GEMINI-001', user_story: 'US-005' }
    },
    {
      protocol_id: PROTOCOL_ID,
      section_type: 'prd_template_scaffold',
      title: 'PRD Template Scaffolding',
      content: PRD_TEMPLATE_SCAFFOLD.trim(),
      order_index: 30, // After requirements, before handoff
      target_file: 'CLAUDE_PLAN.md',
      context_tier: 'PHASE_PLAN',
      metadata: { sd_source: 'SD-LEO-GEMINI-001', user_story: 'US-007' }
    }
  ];

  for (const section of sections) {
    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('section_type', section.section_type)
      .eq('protocol_id', PROTOCOL_ID)
      .single();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('leo_protocol_sections')
        .update(section)
        .eq('id', existing.id);

      if (error) {
        console.error(`❌ Failed to update ${section.section_type}:`, error.message);
      } else {
        console.log(`✅ Updated: ${section.section_type} → ${section.target_file}`);
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('leo_protocol_sections')
        .insert(section);

      if (error) {
        console.error(`❌ Failed to insert ${section.section_type}:`, error.message);
      } else {
        console.log(`✅ Inserted: ${section.section_type} → ${section.target_file}`);
      }
    }
  }

  console.log('\n📋 Next step: Regenerate CLAUDE files');
  console.log('   Run: node scripts/generate-claude-md-from-db.js');
}

insertSections().catch(console.error);
