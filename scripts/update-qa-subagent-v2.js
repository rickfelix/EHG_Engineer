#!/usr/bin/env node
/**
 * Update QA Engineering Director Sub-Agent to v2.0
 *
 * Updates leo_sub_agents table with new capabilities, script path, and metadata
 * for the Enhanced QA Engineering Director v2.0.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateQASubAgent() {
  console.log('🔄 Updating QA Engineering Director to v2.0...\n');

  const capabilities = [
    'pre_test_build_validation',
    'database_migration_verification',
    'automated_migration_execution',
    'component_integration_checking',
    'smart_test_tier_selection',
    'test_infrastructure_discovery',
    'cross_sd_dependency_detection',
    'smoke_test_execution',
    'e2e_test_execution',
    'evidence_collection',
    'intelligent_verdict_generation'
  ];

  const metadata = {
    version: '2.0.0',
    modules: [
      'build-validator.js',
      'migration-verifier.js',
      'integration-checker.js',
      'test-tier-selector.js',
      'infrastructure-discovery.js',
      'dependency-checker.js',
      'migration-executor.js'
    ],
    time_savings: {
      build_validation: '2-3 hours',
      migration_verification: '1-2 hours',
      integration_checking: '30-60 minutes',
      infrastructure_discovery: '30-60 minutes',
      dependency_detection: '10-15 minutes',
      migration_execution: '5-8 minutes',
      total_per_sd: '3-4 hours'
    },
    test_tiers: {
      tier_1: { name: 'Smoke Tests', required: true, count: '3-5', time_budget: '<60s' },
      tier_2: { name: 'E2E Tests', required: 'conditional', count: '10-20', time_budget: '<5min' },
      tier_3: { name: 'Manual Testing', required: 'rare', count: '5-10', time_budget: '<30min' }
    },
    retrospective_source: 'SD-RECONNECT-009',
    issues_addressed: [
      'Database migration not applied',
      'Cross-SD dependency caused build failure',
      'Components built but not integrated',
      'Over-testing with 100+ unnecessary manual tests'
    ]
  };

  try {
    // Update QA Engineering Director sub-agent
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        capabilities: JSON.stringify(capabilities),
        script_path: 'scripts/qa-engineering-director-enhanced.js',
        metadata: JSON.stringify(metadata),
        description: 'Enhanced QA Engineering Director v2.0 - Intelligent testing automation with 7 intelligence modules. Saves 3-4 hours per SD through automated pre-flight checks, smart test tier selection, and elimination of manual steps. Based on SD-RECONNECT-009 retrospective learnings.'
      })
      .eq('code', 'TESTING')
      .select();

    if (error) {
      console.error('❌ Failed to update QA sub-agent:', error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.error('❌ QA sub-agent not found (code: TESTING)');
      return;
    }

    console.log('✅ QA Engineering Director updated to v2.0\n');
    console.log('📊 Updated Fields:');
    console.log(`   - Capabilities: ${capabilities.length} capabilities`);
    console.log(`   - Script Path: ${data[0].script_path}`);
    console.log('   - Version: 2.0.0');
    console.log('   - Modules: 7 intelligence modules');
    console.log('   - Time Savings: 3-4 hours per SD\n');

    console.log('🎯 New Capabilities:');
    capabilities.forEach((cap, idx) => {
      console.log(`   ${idx + 1}. ${cap}`);
    });

    console.log('\n✅ Database update complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Add new LEO Protocol section for Enhanced QA
async function addLEOProtocolSection() {
  console.log('\n📝 Adding LEO Protocol section for Enhanced QA...\n');

  const section = {
    protocol_id: 'leo-v4-2-0-story-gates', // Current active protocol
    section_type: 'qa_engineering_enhanced',
    title: 'Enhanced QA Engineering Director v2.0',
    content: `## Enhanced QA Engineering Director v2.0

### Overview
Intelligent testing automation based on SD-RECONNECT-009 retrospective learnings.

**Time Savings**: 3-4 hours per SD through automated checks and smart test execution.

### 7 Intelligence Modules

1. **Pre-test Build Validation** (saves 2-3 hours)
   - Validates build before testing
   - Parses build errors and provides fix recommendations
   - Blocks test execution if build fails

2. **Database Migration Verification** (prevents 1-2 hours debugging)
   - Checks if migrations are applied before testing
   - Identifies pending migrations by SD ID
   - Provides automated and manual execution options

3. **Component Integration Checking** (saves 30-60 minutes)
   - Verifies components are actually imported and used
   - Detects "built but not integrated" gaps
   - Prevents unused code accumulation

4. **Smart Test Tier Selection** (prevents 100+ unnecessary tests)
   - Tier 1 (Smoke): ALWAYS required (3-5 tests, <60s)
   - Tier 2 (E2E): Conditional for UI features (10-20 tests, <5min)
   - Tier 3 (Manual): Rare, for complex logic (5-10 items, <30min)
   - Selects tiers based on SD category and scope

5. **Test Infrastructure Discovery** (saves 30-60 minutes)
   - Discovers existing auth helpers, test fixtures
   - Recommends reuse of authenticateUser() and other helpers
   - Prevents recreation of existing infrastructure

6. **Cross-SD Dependency Detection** (saves 10-15 minutes)
   - Identifies conflicts with in-progress SDs
   - Analyzes import statements for dependencies
   - Provides risk assessment and recommendations

7. **Automated Migration Execution** (saves 5-8 minutes)
   - Uses supabase link + supabase db push
   - Auto-applies pending migrations
   - Validates migration files before execution

### 5-Phase Execution Workflow

**Phase 1: Pre-flight Checks**
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)

**Phase 2: Smart Test Planning**
- Test tier selection
- Infrastructure discovery

**Phase 3: Test Execution**
- Execute recommended test tiers
- Smoke tests (always)
- E2E tests (conditional)
- Manual testing (rare)

**Phase 4: Evidence Collection**
- Screenshots, logs, coverage reports
- Test execution summaries

**Phase 5: Verdict & Handoff**
- Aggregate all results
- Calculate final verdict
- Generate recommendations
- Store in database

### Activation

**Automatic Triggers**:
- "coverage" keyword in any context
- "protected route" keyword
- "build error" keyword
- "test infrastructure" keyword
- "testing evidence" keyword

**Manual Execution**:
\`\`\`bash
node scripts/qa-engineering-director-enhanced.js <SD-ID> [options]

Options:
  --skip-build             Skip build validation
  --skip-migrations        Skip migration checks
  --no-auto-migrations     Don't auto-execute migrations
  --force-manual           Execute manual tests even if not required
\`\`\`

### Success Criteria

**PASS Verdict** requires:
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ Smoke tests pass (3-5 tests)
- ✅ E2E tests pass (if required)
- ✅ No critical integration gaps

**CONDITIONAL_PASS** if:
- ⚠️ Smoke tests pass but E2E has minor issues
- ⚠️ Non-critical integration warnings

**BLOCKED** if:
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ Critical dependency conflicts

### Database Integration

Results stored in \`sub_agent_execution_results\` table:
- Overall verdict and confidence score
- Phase results (pre-flight, planning, execution, evidence)
- Recommendations for EXEC agent
- Time saved estimates

### Retrospective Source

Based on learnings from **SD-RECONNECT-009** retrospective (ID: 39cc380d-2d4d-46aa-8493-11829e2ac852):

**Issues Addressed**:
1. Database migration not applied (manual step required)
2. Cross-SD dependency caused build failure
3. HelpTooltip built but not integrated (0 imports)
4. Over-testing with 100+ manual test checklist

**Key Learnings Applied**:
- Build validation saves 2-3 hours per SD
- Migration automation is critical blocker prevention
- Component integration must be verified during EXEC
- SIMPLICITY FIRST in test planning saves 8-10 hours`,
    order_index: 100,
    metadata: JSON.stringify({
      version: '2.0.0',
      added_date: '2025-10-04',
      source: 'SD-RECONNECT-009 retrospective'
    })
  };

  try {
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .insert(section)
      .select();

    if (error) {
      console.error('❌ Failed to add protocol section:', error.message);
      return;
    }

    console.log('✅ LEO Protocol section added\n');
    console.log(`   Section ID: ${data[0].id}`);
    console.log(`   Title: ${data[0].title}`);
    console.log(`   Order Index: ${data[0].order_index}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Execute updates
updateQASubAgent()
  .then(() => addLEOProtocolSection())
  .then(() => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ QA Engineering Director v2.0 - Database Integration Complete');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Next Steps:');
    console.log('1. Apply database migration: sub_agent_execution_results.sql');
    console.log('2. Test enhanced QA sub-agent');
    console.log('3. Regenerate CLAUDE.md from database\n');
  });
