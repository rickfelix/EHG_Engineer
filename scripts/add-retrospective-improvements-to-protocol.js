#!/usr/bin/env node

/**
 * Add Retrospective-Based Improvements to LEO Protocol
 *
 * Based on analysis of 7 retrospectives (SD-LEO-001/002/003, SD-UAT-002/003/020, SD-008)
 * Adds critical protocol sections identified from recurring patterns
 */

import { createSupabaseClient } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

async function addSections() {
  console.log('\n🔍 RETROSPECTIVE IMPROVEMENTS TO LEO PROTOCOL');
  console.log('═'.repeat(60));

  // Get active protocol ID
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ Failed to get active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`📋 Active Protocol: ${protocol.version} (${protocol.id})\n`);

  const newSections = [
    {
      section_type: 'database_first_enforcement_expanded',
      title: 'Database-First Enforcement - Expanded',
      order_index: 345,
      content: `## 🚨 DATABASE-ONLY ENFORCEMENT - EXPANDED

### ABSOLUTE PROHIBITION: No File Creation

LEO Protocol v4.2.0 is **DATABASE-FIRST ONLY**. **NEVER** create:
- ❌ **Strategic Directive markdown files** (\`.md\`)
- ❌ **PRD markdown files** (\`.md\`)
- ❌ **Retrospective markdown files** (\`.md\`)
- ❌ **Handoff documents** (\`.md\`)
- ❌ **Verification reports** (\`.md\`)
- ❌ Any work-related documentation files

### REQUIRED: Database Operations Only

**Strategic Directives**:
- ✅ Create in \`strategic_directives_v2\` table
- ✅ Use \`scripts/create-strategic-directive.js\` or dashboard
- ✅ ALL SD data must be in database, not files

**PRDs (Product Requirements)**:
- ✅ Create in \`product_requirements_v2\` table
- ✅ Use \`scripts/add-prd-to-database.js\`
- ✅ Link to SD via \`strategic_directive_id\` foreign key

**Retrospectives**:
- ✅ Create in \`retrospectives\` table
- ✅ Use \`scripts/generate-comprehensive-retrospective.js\`
- ✅ Trigger: Continuous Improvement Coach sub-agent
- ✅ Link to SD via \`sd_id\` foreign key

**Handoffs**:
- ✅ Store in handoff tracking tables
- ✅ 7-element structure required
- ✅ Link to SD and phase

**Progress & Verification**:
- ✅ Update database fields directly
- ✅ Store verification results in database
- ✅ Track in real-time via dashboard

### Why Database-First?

**From Retrospectives**:
- SD-UAT-002: "Database-first architecture maintained - no data loss, proper tracking"
- SD-008: "Database integration - All operations properly store results in database"
- SD-LEO-002: "Database triggers are powerful for automation"

**Benefits**:
1. Single source of truth
2. Real-time dashboard updates
3. Automated tracking and transitions
4. No file sync issues
5. Proper foreign key relationships
6. Audit trail built-in

### If You Create Files By Mistake:

1. **STOP immediately**
2. Extract content to appropriate database table:
   - SDs → \`strategic_directives_v2\`
   - PRDs → \`product_requirements_v2\`
   - Retrospectives → \`retrospectives\`
3. Delete the markdown files
4. Update progress tracking in database
5. Verify dashboard shows correct status

### Checking Compliance:

\`\`\`bash
# Check for rogue markdown files
find . -name "SD-*.md" -o -name "PRD-*.md" -o -name "*retrospective*.md"

# Should return ONLY files in retrospectives/ folder (legacy)
# Any new files = VIOLATION
\`\`\``,
      metadata: { category: 'enforcement', from_retrospectives: true }
    },

    {
      section_type: 'plan_pre_exec_checklist',
      title: 'PLAN Pre-EXEC Checklist',
      order_index: 135,
      content: `## PLAN Agent Pre-EXEC Checklist (MANDATORY)

**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.

Before creating PLAN→EXEC handoff, PLAN agent MUST verify:

### Database Dependencies ✅
- [ ] **Identify all data dependencies** in PRD
- [ ] **Run schema verification script** for data-dependent SDs
- [ ] **Verify tables/columns exist** OR create migration
- [ ] **Document verification results** in PLAN→EXEC handoff
- [ ] If tables missing: **Escalate to LEAD** with options

**Success Pattern** (SD-UAT-003):
> "Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours"

### Architecture Planning ✅
- [ ] **Component sizing estimated** (target 300-600 lines per component)
- [ ] **Existing infrastructure identified** (don't rebuild what exists)
- [ ] **Third-party libraries considered** before custom code

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

### Testing Strategy ✅
- [ ] **Smoke tests defined** (3-5 tests minimum)
- [ ] **Test scenarios documented** in PRD

### SIMPLICITY FIRST Validation ✅
- [ ] **Verified claims with code review** (if UI/UX SD)
- [ ] **Rejected unnecessary complexity**

**Success Pattern** (SD-UAT-002):
> "LEAD code review rejected 3/5 false claims → saved hours of unnecessary work"`,
      metadata: { category: 'process', from_retrospectives: true }
    },

    {
      section_type: 'testing_tier_strategy',
      title: 'Testing Tier Strategy',
      order_index: 140,
      content: `## Testing Requirements - Clear Thresholds

**Evidence from Retrospectives**: Testing confusion appeared in SD-UAT-002, SD-UAT-020, SD-008.

### Three-Tier Testing Strategy

#### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: 3-5 tests, <60 seconds execution
- **Approval**: **SUFFICIENT for PLAN→LEAD approval**

#### Tier 2: Comprehensive E2E (RECOMMENDED) 📋
- **Requirement**: 30-50 tests covering user flows
- **Approval**: Nice to have, **NOT blocking for LEAD approval**
- **Timing**: Can be refined post-deployment

#### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Single smoke test recommended (+5 min)
- **Logic changes <5 lines**: Optional
- **Logic changes >10 lines**: Required

### Anti-Pattern to Avoid ❌

**DO NOT** create 100+ manual test checklists unless specifically required.

**From SD-UAT-020**:
> "Created 100+ test checklist but didn't execute manually. Time spent on unused documentation."`,
      metadata: { category: 'testing', from_retrospectives: true }
    },

    {
      section_type: 'exec_component_sizing_guidelines',
      title: 'Component Sizing Guidelines',
      order_index: 145,
      content: `## Component Sizing Guidelines

**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.

### Optimal Component Size: 300-600 Lines

**Success Pattern** (SD-UAT-020):
> "Split settings into three focused components. Each ~500 lines. Easy to test and maintain."

### Sizing Rules

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot |
| **>800** | **MUST split** | Too complex |`,
      metadata: { category: 'implementation', from_retrospectives: true }
    },

    {
      section_type: 'exec_todo_comment_standard',
      title: 'TODO Comment Standard',
      order_index: 150,
      content: `## TODO Comment Standard (When Deferring Work)

**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.

### Standard TODO Format

\`\`\`typescript
// TODO (SD-ID): Action required
// Requires: Dependencies, prerequisites
// Estimated effort: X-Y hours
// Current state: Mock/temporary/placeholder
\`\`\`

**Success Pattern** (SD-UAT-003):
> "Comprehensive TODO comments provided clear future work path. Saved 4-6 hours."`,
      metadata: { category: 'implementation', from_retrospectives: true }
    },

    {
      section_type: 'plan_cicd_verification',
      title: 'CI/CD Pipeline Verification',
      order_index: 155,
      content: `## CI/CD Pipeline Verification (MANDATORY)

**Evidence from Retrospectives**: Gap identified in SD-UAT-002 and SD-LEO-002.

### Verification Process

**After EXEC implementation complete, BEFORE PLAN→LEAD handoff**:

1. Wait 2-3 minutes for GitHub Actions to complete
2. Trigger DevOps sub-agent to verify pipeline status
3. Document CI/CD status in PLAN→LEAD handoff
4. PLAN→LEAD handoff is **BLOCKED** if pipelines failing`,
      metadata: { category: 'verification', from_retrospectives: true }
    },

    {
      section_type: 'lead_code_review_requirement',
      title: 'LEAD Code Review for UI/UX SDs',
      order_index: 160,
      content: `## LEAD Code Review Requirement (For UI/UX SDs)

**Evidence from Retrospectives**: Critical pattern from SD-UAT-002 saved hours.

### When Code Review is MANDATORY

**For SDs claiming** UI/UX issues or improvements.

### Why Code Review First?

**Success Story** (SD-UAT-002):
> "LEAD challenged 5 claimed issues, validated only 2. Saved 3-4 hours of unnecessary work."

### Process:
1. Receive SD with UI/UX claims
2. Read actual source code (don't trust claims)
3. Verify each claim against implementation
4. Reject false claims, document findings
5. Update SD scope and priority`,
      metadata: { category: 'approval', from_retrospectives: true }
    },

    {
      section_type: 'simplicity_first_enforcement',
      title: 'SIMPLICITY FIRST Decision Framework',
      order_index: 102,
      content: `## SIMPLICITY FIRST Decision Framework (MANDATORY)

**Evidence from Retrospectives**: Applied successfully in 4 out of 7 retrospectives, saved 4-6 hours per SD.

### LEAD Decision Framework (Before Approving ANY SD)

#### Question 1: Can We Document Instead of Implement?

**Example** (SD-UAT-003): Database blocker → documented instead → saved 4-6 hours

#### Question 2: Is This Solving Real or Imagined Problems?

**Example** (SD-UAT-002): Code review rejected 3/5 false claims → saved 3-4 hours

#### Question 3: Can We Use Existing Infrastructure?

**Example** (SD-UAT-020): Used existing Supabase Auth → saved 8-10 hours

#### Question 4: Is Complexity Inherent or Self-Imposed?

**Reject**: Premature optimization, custom solutions when proven tools exist

### Total Savings from Retrospectives: 15-20 hours across 3 SDs`,
      metadata: { category: 'decision_framework', from_retrospectives: true }
    }
  ];

  console.log(`Adding ${newSections.length} new protocol sections\n`);

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (const section of newSections) {
    try {
      console.log(`📝 ${section.title}`);

      // Add protocol_id to section
      const sectionData = {
        ...section,
        protocol_id: protocol.id
      };

      const { data, error } = await supabase
        .from('leo_protocol_sections')
        .insert(sectionData)
        .select();

      if (error) {
        if (error.code === '23505') {
          console.log(`   ⚠️  Already exists`);
          skipCount++;
        } else {
          throw error;
        }
      } else {
        console.log(`   ✅ Added (ID: ${data[0].id})`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log(`   ✅ Successfully added: ${successCount}`);
  console.log(`   ⚠️  Already existed: ${skipCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('');
  console.log('🔄 NEXT STEPS:');
  console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
  console.log('   2. Verify sections appear in CLAUDE.md');
  console.log('   3. Test with next SD execution');
  console.log('');

  process.exit(0);
}

addSections().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
