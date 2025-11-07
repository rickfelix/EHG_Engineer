import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n🚀 Adding Child SD Pattern to LEO Protocol database...\n');

// Step 1: Add to CLAUDE_PLAN.md section
const claudePlanSection = {
  protocol_id: 'leo-v4-2-0-story-gates',
  section_type: 'planning_pattern',
  title: 'Child SD Pattern: When to Break into Child Strategic Directives',
  order_index: 850,
  context_tier: 'PHASE_PLAN',
  target_file: 'CLAUDE_PLAN.md',
  content: `## Child SD Pattern: When to Break into Child Strategic Directives

**Purpose**: For large or phased implementations, use Child SDs instead of phases within a single SD.

### Decision Matrix: Single SD vs Child SDs

| Criteria | Single SD | Child SDs ✨ |
|----------|-----------|--------------|
| **Scope** | < 8 user stories | ≥ 8 user stories |
| **Phases** | 1-2 phases | 3+ distinct phases |
| **Duration** | 1-2 sessions | 3+ sessions or weeks |
| **Parallelization** | Sequential work | Parallel work possible |
| **Team** | Single agent/person | Multiple agents/people |

### When to Use Child SDs

**Use Child SDs when**:
- Work naturally breaks into distinct phases/components
- Phases can be completed in parallel
- Implementation spans multiple sessions/weeks
- Different agents/people work on different phases
- Each phase has ≥3 user stories

**DO NOT use Child SDs when**:
- Work is inherently sequential (one PR, one session)
- Total scope < 5 user stories
- Implementation completes in single session
- No clear phase boundaries

### Creating Child SDs (During PLAN Phase)

1. **Define Parent SD** (Orchestrator):
   - Title: \`[Component] - Architecture & Orchestration\`
   - Scope: Define phases, dependencies, success criteria
   - NO implementation details (children handle implementation)
   - Set \`parent_sd_id: null\`

2. **Create Child SDs** (Implementation Units):
   - Title: \`[Parent-ID] - Phase N: [Phase Name]\`
   - Link: Set \`parent_sd_id\` to parent SD ID
   - Scope: Single phase/component (focused)
   - Stories: 3-8 user stories per child
   - Each child goes through full LEAD→PLAN→EXEC→PLAN→LEAD cycle

3. **Track Dependencies**:
   - Document in parent SD metadata: \`depends_on_child_ids: ['SD-XXX-PHASE1']\`
   - Block dependent children until prerequisites complete
   - Parent tracks child status in metadata

### Example: Payment System SD

**Parent SD**: \`SD-PAYMENT-SYSTEM-001\` (Payment System Architecture)
- **Children**:
  - \`SD-PAYMENT-SYSTEM-001-STRIPE\` (Stripe Integration) - 5 stories
  - \`SD-PAYMENT-SYSTEM-001-PAYPAL\` (PayPal Integration) - 4 stories (depends on Stripe)
  - \`SD-PAYMENT-SYSTEM-001-WEBHOOK\` (Webhook System) - 6 stories
  - \`SD-PAYMENT-SYSTEM-001-ADMIN\` (Admin Dashboard) - 7 stories

### Parent SD Progress Calculation

Parent progress = weighted average of child progress:

\`\`\`
parent_progress = sum(child.progress × child.weight) / sum(child.weight)

// Weights based on child priority:
critical: 40%, high: 30%, medium: 20%, low: 10%
\`\`\`

### Parent SD Responsibilities

**Parent SD MUST**:
- Define child SD scope and dependencies
- Track child SD status (blocked/in_progress/completed)
- Create PLAN→EXEC handoff when all children ready
- Generate orchestration retrospective (not implementation retro)
- Manage cross-child dependencies

**Parent SD MUST NOT**:
- Contain implementation code
- Have its own user stories (children have stories)
- Generate E2E tests (children generate tests)
- Track implementation deliverables (children track)

### Learning Source

**SD**: SD-CREWAI-ARCHITECTURE-001
**Challenge**: 55% progress despite 100% implementation complete
**Root Cause**: Phased multi-session work doesn't fit linear validation
**Solution**: Child SD pattern avoids all validation issues
**Recommendation**: docs/recommendations/child-sd-pattern-for-phased-work.md
`,
  metadata: {
    learning_source: 'SD-CREWAI-ARCHITECTURE-001',
    category: 'planning_patterns',
    applies_to_phases: ['PLAN'],
    version: '1.0.0',
    created_from: 'child-sd-pattern-for-phased-work.md'
  }
};

const { data: planSection, error: planError } = await client
  .from('leo_protocol_sections')
  .insert(claudePlanSection)
  .select()
  .single();

if (planError) {
  console.error('❌ Error adding CLAUDE_PLAN section:', planError.message);
} else {
  console.log('✅ Added to CLAUDE_PLAN.md');
  console.log(`   Title: ${planSection.title}`);
  console.log(`   Order Index: ${planSection.order_index}`);
}

// Step 2: Add to CLAUDE_EXEC.md section
const claudeExecSection = {
  protocol_id: 'leo-v4-2-0-story-gates',
  section_type: 'execution_pattern',
  title: 'Working with Child SDs (Execution Phase)',
  order_index: 850,
  context_tier: 'PHASE_EXEC',
  target_file: 'CLAUDE_EXEC.md',
  content: `## Working with Child SDs (Execution Phase)

### Implementation Flow for Child SDs

1. **Start with Parent SD** (LEAD→PLAN):
   - LEAD creates parent SD
   - PLAN breaks into child SDs
   - PLAN creates PRDs for each child
   - Parent PLAN→EXEC handoff: "Child SDs created, ready for parallel execution"

2. **Execute Child SDs** (each independently):
   - Child 1: LEAD→PLAN→EXEC→PLAN→LEAD (complete cycle)
   - Child 2: LEAD→PLAN→EXEC→PLAN→LEAD (can run in parallel)
   - Child 3: LEAD→PLAN→EXEC→PLAN→LEAD (may depend on Child 1/2)

3. **Complete Parent SD** (after all children):
   - All children must be \`status: completed\`
   - Parent generates orchestration retrospective
   - Parent PLAN→LEAD handoff: "All children complete"

### Child SD Execution Checklist

**When implementing a Child SD**:
- [ ] Verify parent SD exists and defines this child's scope
- [ ] Check dependencies: Are prerequisite children complete?
- [ ] Execute full LEO cycle for this child independently
- [ ] Generate child-specific retrospective (phase-specific lessons)
- [ ] Update parent SD metadata with child completion status

### Parent SD Orchestration Checklist

**Before marking parent SD complete**:
- [ ] All child SDs have \`status: completed\`
- [ ] All child retrospectives exist (phase-specific lessons)
- [ ] Parent retrospective created (orchestration lessons)
- [ ] Cross-child integration tested (if applicable)
- [ ] Parent EXEC→PLAN handoff documents child completion

### Checking Child SD Status

\`\`\`bash
# Example command (create this script):
node scripts/check-child-sd-status.js SD-PAYMENT-SYSTEM-001

# Output:
# Parent: SD-PAYMENT-SYSTEM-001 (Payment System Architecture)
# ├── SD-PAYMENT-SYSTEM-001-STRIPE: ✅ completed (100%)
# ├── SD-PAYMENT-SYSTEM-001-PAYPAL: ⏳ in_progress (65%)
# ├── SD-PAYMENT-SYSTEM-001-WEBHOOK: ✅ completed (100%)
# └── SD-PAYMENT-SYSTEM-001-ADMIN: 🔴 blocked (0%) - depends on PayPal
#
# Parent progress: 66% (2/4 children complete, 1 in progress)
\`\`\`

### Child SD Retrospectives

**Each child SD generates its own retrospective**:
- Focus: Phase-specific implementation lessons
- Scope: Limited to this child's work
- Examples: "Migration Performance Optimization", "UI Component Patterns"

**Parent SD generates orchestration retrospective**:
- Focus: Cross-child coordination and dependencies
- Scope: How phases worked together
- Examples: "Dependency Management", "Parallel Execution Challenges"

### Learning Source

**SD**: SD-CREWAI-ARCHITECTURE-001
**Insight**: Multi-phase work implemented across sessions causes validation mismatch
**Solution**: Child SD pattern provides natural progress tracking and independent completion
`,
  metadata: {
    learning_source: 'SD-CREWAI-ARCHITECTURE-001',
    category: 'execution_patterns',
    applies_to_phases: ['EXEC'],
    version: '1.0.0',
    created_from: 'child-sd-pattern-for-phased-work.md'
  }
};

const { data: execSection, error: execError } = await client
  .from('leo_protocol_sections')
  .insert(claudeExecSection)
  .select()
  .single();

if (execError) {
  console.error('❌ Error adding CLAUDE_EXEC section:', execError.message);
} else {
  console.log('\n✅ Added to CLAUDE_EXEC.md');
  console.log(`   Title: ${execSection.title}`);
  console.log(`   Order Index: ${execSection.order_index}`);
}

console.log('\n🎉 Child SD Pattern successfully added to LEO Protocol database!');
console.log('\n📝 Next steps:');
console.log('   1. Regenerate CLAUDE.md files: node scripts/generate-claude-md-from-db.js');
console.log('   2. Add database schema changes (parent_sd_id column)');
console.log('   3. Create check-child-sd-status.js script');
