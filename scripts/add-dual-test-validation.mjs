#!/usr/bin/env node
/**
 * Add Dual Test Execution Validation to LEO Protocol
 *
 * Purpose: Enforce running BOTH unit tests AND E2E tests before EXEC→PLAN handoff
 * Impact: Prevents partial testing oversight (unit OR E2E instead of unit AND E2E)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addDualTestValidation() {
  console.log('🔧 Adding Dual Test Execution Validation to LEO Protocol');
  console.log('═'.repeat(70));

  // 1. Add validation rule for dual test execution
  console.log('\n1️⃣  Adding validation rule...');

  // Get active protocol ID
  const { data: activeProtocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  const { data: rule, error: ruleError } = await supabase
    .from('leo_validation_rules')
    .insert({
      protocol_id: activeProtocol?.id,
      rule_type: 'test_execution',
      rule_name: 'dual_test_execution',
      rule_definition: {
        unit_tests_passed: true,
        e2e_tests_passed: true,
        test_evidence: {
          unit_output: 'required',
          unit_framework: 'vitest',
          e2e_output: 'required',
          e2e_framework: 'playwright'
        },
        blocking_phases: ['EXEC_to_PLAN']
      },
      severity: 'error',
      active: true,
      applies_to_agent: 'EXEC'
    })
    .select()
    .single();

  if (ruleError) {
    console.log('   ⚠️  Rule may already exist or error:', ruleError.message);
  } else {
    console.log('   ✅ Validation rule created:', rule.rule_name);
  }

  // 2. Add QA Director auto-trigger for EXEC completion
  console.log('\n2️⃣  Adding QA Director auto-trigger...');

  const { data: subAgent } = await supabase
    .from('leo_sub_agents')
    .select('id')
    .eq('code', 'TESTING')
    .single();

  if (subAgent) {
    const { data: trigger, error: triggerError } = await supabase
      .from('leo_sub_agent_triggers')
      .insert({
        sub_agent_id: subAgent.id,
        trigger_phrase: 'EXEC_IMPLEMENTATION_COMPLETE',
        trigger_type: 'keyword',
        trigger_context: 'any context',
        priority: 95,
        active: true
      })
      .select()
      .single();

    if (triggerError) {
      console.log('   ⚠️  Trigger may already exist:', triggerError.message);
    } else {
      console.log('   ✅ Auto-trigger created: EXEC_IMPLEMENTATION_COMPLETE');
    }

    // Add additional test-related triggers
    const additionalTriggers = [
      { phrase: 'unit tests', context: 'any context', priority: 90 },
      { phrase: 'vitest', context: 'any context', priority: 85 },
      { phrase: 'npm run test:unit', context: 'any context', priority: 90 },
      { phrase: 'test results', context: 'any context', priority: 80 }
    ];

    for (const { phrase, context, priority } of additionalTriggers) {
      const { error } = await supabase
        .from('leo_sub_agent_triggers')
        .insert({
          sub_agent_id: subAgent.id,
          trigger_phrase: phrase,
          trigger_type: 'keyword',
          trigger_context: context,
          priority,
          active: true
        });

      if (!error) {
        console.log(`   ✅ Trigger added: "${phrase}"`);
      }
    }
  }

  // 3. Update EXEC agent responsibilities in leo_protocol_sections
  console.log('\n3️⃣  Updating EXEC agent section...');

  const execTestingGuidance = `
### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
\`\`\`bash
cd /mnt/c/_EHG/EHG
npm run test:unit
\`\`\`
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
\`\`\`bash
cd /mnt/c/_EHG/EHG
npm run test:e2e
\`\`\`
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: \`npm run test:unit\`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: \`npm run test:e2e\`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Common Mistake**:
❌ Running only E2E tests and claiming "all tests passed"
✅ Run BOTH unit AND E2E tests explicitly
`;

  const { data: section, error: sectionError } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: activeProtocol?.id,
      section_type: 'exec_dual_test_requirement',
      title: 'EXEC Dual Test Requirement',
      content: execTestingGuidance,
      order_index: 155, // After EXEC Pre-Implementation, before Git Commit Guidelines
      metadata: { category: 'exec_requirements' }
    })
    .select()
    .single();

  if (sectionError) {
    console.log('   ⚠️  Section may already exist:', sectionError.message);
  } else {
    console.log('   ✅ EXEC testing section created');
  }

  // 4. Update Testing Tier Strategy section
  console.log('\n4️⃣  Updating Testing Tier Strategy...');

  const updatedTierStrategy = `
## Testing Requirements - Dual Test Execution (UPDATED)

**Philosophy**: Comprehensive testing = Unit tests (logic) + E2E tests (user experience)

### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: BOTH unit tests AND E2E tests must pass
- **Commands**:
  - Unit: \`npm run test:unit\` (Vitest - business logic)
  - E2E: \`npm run test:e2e\` (Playwright - user flows)
- **Approval**: **BOTH test types REQUIRED for PLAN→LEAD approval**
- **Execution Time**: Combined <5 minutes for smoke-level tests
- **Coverage**:
  - Unit: Service layer, business logic, utilities
  - E2E: Critical user paths, authentication, navigation

### Tier 2: Comprehensive Testing (RECOMMENDED) 📋
- **Requirement**: Full test suite with deep coverage
- **Commands**:
  - Unit: \`npm run test:unit:coverage\` (50%+ coverage target)
  - E2E: All Playwright tests (30-50 scenarios)
  - Integration: \`npm run test:integration\`
  - A11y: \`npm run test:a11y\`
- **Approval**: Nice to have, **NOT blocking** but highly recommended
- **Timing**: Can be refined post-deployment

### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Visual regression testing
- **Complex flows**: Multi-step wizards, payment flows
- **Edge cases**: Rare scenarios not covered by automation

### ⚠️ What Changed (From Protocol Enhancement)
**Before**: "Tier 1 = 3-5 tests, <60s" (ambiguous - which tests?)
**After**: "Tier 1 = Unit tests + E2E tests (explicit frameworks, explicit commands)"

**Lesson Learned**: SD-AGENT-ADMIN-002 testing oversight (ran E2E only, missed unit test failures)
`;

  const { error: tierError } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: activeProtocol?.id,
      section_type: 'testing_tier_strategy_updated',
      title: 'Testing Tier Strategy (Updated)',
      content: updatedTierStrategy,
      order_index: 700,
      metadata: { category: 'testing_requirements', version: '2.0' }
    });

  if (tierError) {
    console.log('   ⚠️  Tier strategy may already exist:', tierError.message);
  } else {
    console.log('   ✅ Testing tier strategy section created');
  }

  // 5. Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log('\n✅ Updates Applied:');
  console.log('   • Validation rule: dual_test_execution');
  console.log('   • QA Director auto-trigger: EXEC_IMPLEMENTATION_COMPLETE');
  console.log('   • Additional triggers: unit tests, vitest, npm run test:unit');
  console.log('   • EXEC phase guidance: Dual test requirement section');
  console.log('   • Testing tier strategy: Clarified Tier 1 requirements');
  console.log('\n🔄 Next Steps:');
  console.log('   1. Regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
  console.log('   2. Update QA Director script: scripts/qa-engineering-director-enhanced.js');
  console.log('   3. Test with SD-AGENT-ADMIN-002 to verify fixes');
  console.log('═'.repeat(70));
}

addDualTestValidation()
  .then(() => {
    console.log('\n✅ Dual test validation setup complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
