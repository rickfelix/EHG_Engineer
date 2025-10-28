#!/usr/bin/env node

/**
 * Add DESIGN→DATABASE Validation Gates Section to LEO Protocol
 *
 * This script adds a new section to leo_protocol_sections table describing
 * the 4 validation gates that enforce the DESIGN→DATABASE workflow pattern.
 *
 * After running this script, regenerate CLAUDE_PLAN.md using:
 *   node scripts/generate-claude-md.js
 *
 * Usage:
 *   node scripts/add-design-database-gates-to-protocol.js
 *
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const NEW_SECTION = {
  protocol_id: 'leo-v4-2-0-story-gates',
  section_type: 'design_database_validation_gates',
  title: 'DESIGN→DATABASE Validation Gates',
  order_index: 155, // After BMAD (150), before other reference docs
  content: `## DESIGN→DATABASE Validation Gates

The LEO Protocol enforces the DESIGN→DATABASE workflow pattern through 4 mandatory validation gates that ensure:
1. Sub-agent execution completeness (PLAN→EXEC)
2. Implementation fidelity to recommendations (EXEC→PLAN)
3. End-to-end traceability (PLAN→LEAD)
4. Workflow ROI and pattern effectiveness (LEAD Final)

**Passing Score**: ≥80 points (out of 100) required for each gate

---

### Gate 1: PLAN→EXEC Handoff (Pre-Implementation)

**When**: After PRD creation, before EXEC starts implementation
**Purpose**: Verify planning is complete and recommendations exist
**Script**: \`scripts/modules/design-database-gates-validation.js\`
**Integration Point**: \`unified-handoff-system.js\` line ~271 (after BMAD validation)

**9 Validation Checks** (11 points each + 1 buffer = 100 points):

1. **DESIGN Sub-Agent Executed** (11 points)
   - Queries: \`sub_agent_execution_results\` table
   - Checks: \`sub_agent_name = 'DESIGN'\` AND \`status = 'SUCCESS'\`

2. **DATABASE Sub-Agent Executed** (11 points)
   - Queries: \`sub_agent_execution_results\` table
   - Checks: \`sub_agent_name = 'DATABASE'\` AND \`status = 'SUCCESS'\`

3. **DATABASE Informed by DESIGN** (11 points)
   - Queries: \`product_requirements_v2.metadata.database_analysis.design_informed\`
   - Checks: \`design_informed = true\`

4. **STORIES Sub-Agent Executed** (11 points)
   - Queries: \`sub_agent_execution_results\` table
   - Checks: \`sub_agent_name = 'STORIES'\` AND \`status = 'SUCCESS'\`

5. **Schema Documentation Consulted** (11 points)
   - Analyzes: \`database_analysis.analysis\` text
   - Checks: References to \`docs/reference/schema/\`

6. **PRD Metadata Complete** (11 points)
   - Checks: Both \`design_analysis\` AND \`database_analysis\` exist in PRD metadata

7. **Sub-Agent Execution Order** (11 points)
   - Validates: DESIGN timestamp < DATABASE timestamp < STORIES timestamp

8. **PRD Created Via Script** (11 points)
   - Detects: \`add-prd-to-database.js\` metadata signature

9. **User Stories Context Coverage** (12 points)
   - Calculates: % of stories with \`implementation_context\`
   - Threshold: ≥80% coverage required

**Conditional Execution**:
- Only validates SDs with BOTH \`design\` AND \`database\` categories
- OR scope contains both "UI" AND "database" keywords
- Use: \`shouldValidateDesignDatabase(sd)\` helper function

---

### Gate 2: EXEC→PLAN Handoff (Post-Implementation)

**When**: After EXEC completes implementation, before PLAN verification
**Purpose**: Verify EXEC actually implemented DESIGN/DATABASE recommendations
**Script**: \`scripts/modules/implementation-fidelity-validation.js\`
**Integration Point**: \`unified-handoff-system.js\` line ~486 (after BMAD validation)

**4 Validation Sections** (25 points each = 100 points):

#### A. Design Implementation Fidelity (25 points)

- **A1: UI Components** (10 points)
  - Git analysis: \`git log --all --grep="SD-XXX" --name-only\`
  - Checks: Component files (.tsx, .jsx) committed

- **A2: Workflows** (10 points)
  - Queries: EXEC→PLAN handoff deliverables
  - Checks: Workflow implementation mentioned

- **A3: User Actions** (5 points)
  - Git analysis: \`git log --all --grep="SD-XXX" --patch\`
  - Checks: CRUD operations in code changes

#### B. Database Implementation Fidelity (25 points)

- **B1: Migrations** (15 points)
  - Scans: \`database/migrations\`, \`supabase/migrations\`
  - Checks: Migration files exist for SD

- **B2: RLS Policies** (5 points)
  - Git analysis: Checks for CREATE POLICY statements

- **B3: Migration Complexity** (5 points)
  - Reads: Migration file line count
  - Compares: To DATABASE analysis estimate (optional)

#### C. Data Flow Alignment (25 points)

- **C1: Database Queries** (10 points)
  - Git analysis: Checks for .select(), .insert(), .update(), .from()

- **C2: Form/UI Integration** (10 points)
  - Git analysis: Checks for useState, useForm, onSubmit, <form>, Input, Button

- **C3: Data Validation** (5 points)
  - Git analysis: Checks for zod, validate, schema, .required()

#### D. Enhanced Testing (25 points)

- **D1: E2E Tests** (15 points)
  - Scans: \`tests/e2e\`, \`tests/integration\`, \`playwright/tests\`
  - Checks: Test files exist for SD

- **D2: Migration Tests** (5 points)
  - Git analysis: Checks for migration + test file mentions

- **D3: Coverage Documentation** (5 points)
  - Queries: EXEC→PLAN handoff metadata
  - Checks: Test coverage documented

**Why This Gate Matters**:
This is the MOST CRITICAL gate - ensures recommendations weren't just generated but actually implemented. Without this, EXEC could ignore all recommendations.

---

### Gate 3: PLAN→LEAD Handoff (Pre-Final Approval)

**When**: After PLAN verification, before LEAD final approval
**Purpose**: Verify end-to-end alignment from design through implementation
**Script**: \`scripts/modules/traceability-validation.js\`
**Integration Point**: \`unified-handoff-system.js\` line ~726 (PLAN→LEAD validation)

**5 Validation Sections** (20 points each = 100 points):

#### A. Recommendation Adherence (20 points)

- **A1: Design Adherence** (10 points)
  - Calculates: (Gate 2 design_fidelity / 25) × 100%
  - Thresholds: ≥80% = 10pts, ≥60% = 7pts, <60% = 4pts

- **A2: Database Adherence** (10 points)
  - Calculates: (Gate 2 database_fidelity / 25) × 100%
  - Thresholds: ≥80% = 10pts, ≥60% = 7pts, <60% = 4pts

#### B. Implementation Quality (20 points)

- **B1: Gate 2 Score** (10 points)
  - Checks: Overall Gate 2 validation score
  - Thresholds: ≥90 = 10pts, ≥80 = 8pts, ≥70 = 6pts

- **B2: Test Coverage** (10 points)
  - Queries: EXEC→PLAN handoff metadata
  - Checks: Test coverage documented

#### C. Traceability Mapping (20 points)

- **C1: PRD → Implementation** (7 points)
  - Git analysis: Commits referencing SD ID

- **C2: Design → Code** (7 points)
  - Queries: Deliverables mention design/UI/components

- **C3: Database → Schema** (6 points)
  - Queries: Deliverables mention database/migration/schema/table

#### D. Sub-Agent Effectiveness (20 points)

- **D1: Execution Metrics** (10 points)
  - Queries: \`sub_agent_execution_results\`
  - Checks: All 3 sub-agents (DESIGN, DATABASE, STORIES) executed

- **D2: Recommendation Quality** (10 points)
  - Checks: Sub-agent results have substantial output (>500 chars)

#### E. Lessons Captured (20 points)

- **E1: Retrospective Prep** (10 points)
  - Queries: PLAN→LEAD handoff metadata
  - Checks: Mentions "lesson", "retrospective", "improvement"

- **E2: Workflow Effectiveness** (10 points)
  - Queries: EXEC→PLAN handoff metadata
  - Checks: Mentions "workflow", "process", "pattern"

---

### Gate 4: LEAD Final Approval (Pre-Completion)

**When**: Before marking SD as complete
**Purpose**: Executive oversight of design-to-implementation alignment
**Script**: \`scripts/modules/workflow-roi-validation.js\`
**Integration Point**: \`unified-handoff-system.js\` (LEAD final approval)

**4 Validation Sections** (25 points each = 100 points):

#### A. Process Adherence (25 points)

- **A1: PRD Created Via Script** (5 points)
  - Checks: \`metadata.created_via_script\` OR sub-agent analyses exist

- **A2: Design Analysis Completed** (5 points)
  - Checks: \`metadata.design_analysis\` exists

- **A3: Database Analysis Completed** (5 points)
  - Checks: \`metadata.database_analysis\` exists

- **A4: Design-Informed Database** (5 points)
  - Checks: \`metadata.database_analysis.design_informed = true\`

- **A5: Proper Workflow Order** (5 points)
  - Checks: Gate 1 validated execution order (DESIGN→DATABASE→STORIES)

#### B. Value Delivered (25 points)

- **B1: Time Efficiency** (10 points)
  - Checks: Sub-agent execution time from Gate 3
  - Thresholds: <15min = 10pts, <30min = 7pts, ≥30min = 5pts

- **B2: Recommendation Quality** (10 points)
  - Checks: Gate 3 validated substantial recommendations

- **B3: Implementation Fidelity** (5 points)
  - Checks: Gate 2 score ≥80 = 5pts, ≥70 = 3pts, <70 = 2pts

#### C. Pattern Effectiveness (25 points)

- **C1: Gate 1 Performance** (6 points)
  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts

- **C2: Gate 2 Performance** (6 points)
  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts

- **C3: Gate 3 Performance** (6 points)
  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts

- **C4: Overall Pattern ROI** (7 points)
  - Calculates: Average of Gate 1-3 scores
  - Thresholds: ≥90 = 7pts ("EXCELLENT - Continue pattern"), ≥80 = 6pts ("GOOD - Continue"), ≥70 = 4pts ("ACCEPTABLE - Monitor")

#### D. Executive Validation (25 points)

- **D1: All Gates Passed** (10 points)
  - Checks: Gate 1, 2, 3 all passed (score ≥80)
  - Scoring: 3/3 = 10pts, 2/3 = 6pts, 1/3 = 3pts, 0/3 = 0pts

- **D2: Quality Thresholds** (10 points)
  - Queries: \`sd_retrospectives\` table
  - Checks: Retrospective exists

- **D3: Pattern Recommendation** (5 points)
  - Based on avg gate score:
    - ≥80: "CONTINUE - Pattern is effective"
    - ≥70: "MONITOR - Pattern needs improvement"
    - <70: "REVIEW - Pattern may need adjustment"

---

### Integration with Unified Handoff System

**File**: \`scripts/unified-handoff-system.js\`

#### Integration Points:

1. **Gate 1 (PLAN→EXEC)** - After line 271
   \`\`\`javascript
   // After BMAD validation
   if (shouldValidateDesignDatabase(sd)) {
     const gate1 = await validateGate1PlanToExec(sd.id, supabase);
     handoff.metadata.gate1_validation = gate1;

     if (!gate1.passed) {
       throw new Error(\`Gate 1 validation failed: \${gate1.score}/100 points\`);
     }
   }
   \`\`\`

2. **Gate 2 (EXEC→PLAN)** - After line 486
   \`\`\`javascript
   // After BMAD validation
   if (shouldValidateDesignDatabase(sd)) {
     const gate2 = await validateGate2ExecToPlan(sd.id, supabase);
     handoff.metadata.gate2_validation = gate2;

     if (!gate2.passed) {
       throw new Error(\`Gate 2 validation failed: \${gate2.score}/100 points\`);
     }
   }
   \`\`\`

3. **Gate 3 (PLAN→LEAD)** - After line 726
   \`\`\`javascript
   // During PLAN→LEAD handoff
   if (shouldValidateDesignDatabase(sd)) {
     const gate3 = await validateGate3PlanToLead(sd.id, supabase, gate2Results);
     handoff.metadata.gate3_validation = gate3;

     if (!gate3.passed) {
       throw new Error(\`Gate 3 validation failed: \${gate3.score}/100 points\`);
     }
   }
   \`\`\`

4. **Gate 4 (LEAD Final)** - Before final approval
   \`\`\`javascript
   // Before marking SD complete
   if (shouldValidateDesignDatabase(sd)) {
     const allGates = { gate1, gate2, gate3 };
     const gate4 = await validateGate4LeadFinal(sd.id, supabase, allGates);

     if (!gate4.passed) {
       throw new Error(\`Gate 4 validation failed: \${gate4.score}/100 points\`);
     }
   }
   \`\`\`

---

### Validation Flow Diagram

\`\`\`
PRD Creation (add-prd-to-database.js)
    ↓
    ├─ DESIGN sub-agent → analysis
    ├─ DATABASE sub-agent → analysis (informed by DESIGN)
    └─ STORIES sub-agent → user stories
    ↓
🚪 GATE 1: PLAN→EXEC Handoff
    ├─ ✅ All sub-agents executed?
    ├─ ✅ Execution order correct?
    ├─ ✅ Schema docs consulted?
    └─ ✅ PRD metadata complete?
    ↓
EXEC Implementation
    ├─ Implement UI components (per DESIGN)
    ├─ Create migrations (per DATABASE)
    ├─ Write E2E tests
    └─ Commit with SD ID
    ↓
🚪 GATE 2: EXEC→PLAN Handoff
    ├─ ✅ Components match DESIGN?
    ├─ ✅ Migrations match DATABASE?
    ├─ ✅ Data flow aligned?
    └─ ✅ Tests comprehensive?
    ↓
PLAN Verification
    ↓
🚪 GATE 3: PLAN→LEAD Handoff
    ├─ ✅ Recommendations followed?
    ├─ ✅ Implementation quality high?
    ├─ ✅ End-to-end traceability?
    └─ ✅ Lessons captured?
    ↓
🚪 GATE 4: LEAD Final Approval
    ├─ ✅ All gates passed?
    ├─ ✅ Value delivered?
    ├─ ✅ Pattern effective?
    └─ ✅ Quality thresholds met?
    ↓
SD Complete ✅
\`\`\`

---

### Standalone Validation Scripts

For manual validation outside handoff flow:

\`\`\`bash
# Validate Gate 1 (PLAN→EXEC)
node scripts/validate-gate1.js --sd=SD-XXX-001

# Validate Gate 2 (EXEC→PLAN)
node scripts/validate-gate2.js --sd=SD-XXX-001

# Validate Gate 3 (PLAN→LEAD)
node scripts/validate-gate3.js --sd=SD-XXX-001

# Validate Gate 4 (LEAD Final)
node scripts/validate-gate4.js --sd=SD-XXX-001

# Validate all gates
node scripts/validate-all-gates.js --sd=SD-XXX-001
\`\`\`

---

### When Gates Don't Apply

**Conditional Execution Helper**:
\`\`\`javascript
export function shouldValidateDesignDatabase(sd) {
  const hasDesignCategory = sd.category?.includes('design');
  const hasDatabaseCategory = sd.category?.includes('database');

  const hasUIKeywords = (sd.scope || '').toLowerCase().includes('ui');
  const hasDatabaseKeywords = (sd.scope || '').toLowerCase().includes('database');

  return (hasDesignCategory && hasDatabaseCategory) ||
         (hasUIKeywords && hasDatabaseKeywords);
}
\`\`\`

**Behavior**:
- If validation doesn't apply: Returns \`{ passed: true, score: 100, warnings: ['Not applicable'] }\`
- If validation applies but fails: Returns \`{ passed: false, score: <score>, issues: [...] }\`
- If validation applies and passes: Returns \`{ passed: true, score: ≥80, details: {...} }\`

---

### Gate Results Storage

All gate results are stored in handoff metadata:

\`\`\`javascript
{
  handoff_type: "PLAN-TO-EXEC",
  metadata: {
    gate1_validation: {
      passed: true,
      score: 92,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { ... },
      gate_scores: { ... }
    }
  }
}
\`\`\`

This enables:
1. **Traceability**: Full audit trail of validation results
2. **Retrospectives**: Quality analysis for continuous improvement
3. **Cascading**: Gate 3 uses Gate 2 results, Gate 4 uses all previous results
4. **Debugging**: Detailed failure information for each gate`,
  metadata: {
    created_by: 'SD-DESIGN-DATABASE-VALIDATION-001',
    created_date: '2025-10-28',
    gates_count: 4,
    validation_points: 100,
    passing_threshold: 80,
    related_scripts: [
      'scripts/modules/design-database-gates-validation.js',
      'scripts/modules/implementation-fidelity-validation.js',
      'scripts/modules/traceability-validation.js',
      'scripts/modules/workflow-roi-validation.js'
    ],
    updated_by: 'SD-DESIGN-DATABASE-VALIDATION-001',
    last_updated: new Date().toISOString()
  }
};

async function main() {
  console.log('🚀 Adding DESIGN→DATABASE Validation Gates to LEO Protocol');
  console.log('='.repeat(70));

  try {
    // Check if section already exists
    const { data: existing, error: checkError } = await supabase
      .from('leo_protocol_sections')
      .select('id, section_type')
      .eq('protocol_id', NEW_SECTION.protocol_id)
      .eq('section_type', NEW_SECTION.section_type)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
      throw checkError;
    }

    if (existing) {
      console.log(`\n⚠️  Section "${NEW_SECTION.title}" already exists`);
      console.log('   Updating existing section...');

      const { error: updateError } = await supabase
        .from('leo_protocol_sections')
        .update({
          content: NEW_SECTION.content,
          title: NEW_SECTION.title,
          order_index: NEW_SECTION.order_index,
          metadata: NEW_SECTION.metadata
        })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }

      console.log('   ✅ Section updated successfully');
      console.log(`   ID: ${existing.id}`);
    } else {

      // Insert new section
      console.log(`\n📝 Inserting section: "${NEW_SECTION.title}"`);
      console.log(`   Protocol ID: ${NEW_SECTION.protocol_id}`);
      console.log(`   Section Type: ${NEW_SECTION.section_type}`);
      console.log(`   Order Index: ${NEW_SECTION.order_index}`);
      console.log(`   Content size: ${NEW_SECTION.content.length} characters`);

      const { data: inserted, error: insertError } = await supabase
        .from('leo_protocol_sections')
        .insert([NEW_SECTION])
        .select();

      if (insertError) {
        throw insertError;
      }

      console.log('\n✅ Section added successfully!');
      console.log(`   ID: ${inserted[0].id}`);
      console.log(`   Created: ${inserted[0].created_at}`);
    }

    console.log('\n📋 Next Steps:');
    console.log('   1. Regenerate CLAUDE.md files from database:');
    console.log('      node scripts/generate-claude-md-from-db.js');
    console.log('');
    console.log('   2. Verify the section appears in the generated CLAUDE files');
    console.log('      (Should be at order index 155, after BMAD section)');
    console.log('');
    console.log('   3. Integrate gates with unified-handoff-system.js');
    console.log('      (See section "Integration with Unified Handoff System" in the new content)');
    console.log('');
    console.log('   4. Test with a sample SD that has design+database categories');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
