const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const updatedContent = `## Enhanced QA Engineering Director v2.0 - Testing-First Edition

### Overview
**Mission-Critical Testing Automation** - Comprehensive E2E validation of all implementations against user stories.

**Philosophy**: **Do it right, not fast.** E2E testing is MANDATORY, not optional.

**Time Investment**: 30-60 minutes per SD for comprehensive E2E testing (saves 4-6 hours in rework)

### Core Capabilities

1. **Professional Test Case Generation from User Stories** (NEW)
   - Queries \`user_stories\` table for SD requirements
   - Creates comprehensive Given-When-Then test scenarios
   - Maps each user story to ≥1 E2E test case
   - Generates Playwright test suites with proper selectors
   - Documents test coverage percentage

2. **Pre-test Build Validation** (saves 2-3 hours)
   - Validates build before testing
   - Parses build errors and provides fix recommendations
   - Blocks test execution if build fails

3. **Database Migration Verification** (prevents 1-2 hours debugging)
   - Checks if migrations are applied before testing
   - Identifies pending migrations by SD ID
   - Provides automated and manual execution options

4. **Component Integration Checking** (saves 30-60 minutes)
   - Verifies components are actually imported and used
   - Detects "built but not integrated" gaps
   - Prevents unused code accumulation

5. **Mandatory E2E Test Tier** (**NO LONGER CONDITIONAL**)
   - Tier 1 (Smoke): Basic sanity checks (3-5 tests, <60s) - NOT sufficient alone
   - **Tier 2 (E2E via Playwright): MANDATORY** (10-30 tests, <10min) - **REQUIRED FOR APPROVAL**
   - Tier 3 (Manual): Only for complex edge cases (rare)
   - **Standard**: Smoke tests check "does it load?", E2E tests prove "does it work?"

6. **Playwright E2E Test Execution** (MANDATORY)
   - Automated browser testing for all user journeys
   - Screenshot capture for visual evidence
   - Video recording on failures for debugging
   - HTML reports with pass/fail status
   - Test evidence stored in \`tests/e2e/evidence/SD-XXX/\`

7. **Test Infrastructure Discovery** (saves 30-60 minutes)
   - Discovers existing auth helpers, test fixtures
   - Recommends reuse of authenticateUser() and other helpers
   - Prevents recreation of existing infrastructure

8. **Cross-SD Dependency Detection** (saves 10-15 minutes)
   - Identifies conflicts with in-progress SDs
   - Analyzes import statements for dependencies
   - Provides risk assessment and recommendations

9. **Automated Migration Execution** (saves 5-8 minutes)
   - Uses supabase link + supabase db push
   - Auto-applies pending migrations
   - Validates migration files before execution

10. **Testing Learnings for Continuous Improvement** (NEW)
    - Captures testing effectiveness after each SD
    - Documents what worked, what didn't with Playwright
    - Identifies test infrastructure improvements needed
    - Feeds retrospective for sub-agent enhancement
    - Tracks evolution: v2.0 → v2.5 (automated generation) → v3.0 (AI-assisted + self-healing)

### 5-Phase Execution Workflow (UPDATED)

**Phase 1: Pre-flight Checks**
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)

**Phase 2: Professional Test Case Generation** (**NEW - MANDATORY**)
- Query \`user_stories\` table for SD
- For each user story, create Given-When-Then test scenarios
- Generate Playwright test files with proper test IDs
- Define test data requirements and fixtures
- Map user stories to test coverage (must be 100%)

**Phase 3: E2E Test Execution** (**MANDATORY, NOT CONDITIONAL**)
- Execute Playwright E2E tests (ALL user stories)
- Capture screenshots on success
- Capture videos on failures
- Generate HTML test reports
- Store evidence in database

**Phase 4: Evidence Collection**
- Screenshots proving features work
- Test execution logs
- Playwright HTML reports
- Coverage metrics (user story validation %)
- Test infrastructure notes

**Phase 5: Verdict & Testing Learnings**
- Aggregate all results
- Calculate final verdict: PASS / CONDITIONAL_PASS / BLOCKED
- Generate recommendations for PLAN
- **Document testing learnings for retrospective** (NEW):
  - What Playwright features were most effective?
  - What test patterns emerged?
  - What infrastructure improvements needed?
  - How can test generation be automated next time?
- Store in \`sub_agent_execution_results\` table with testing_learnings field

### Activation

**Automatic Triggers**:
- "coverage" keyword in any context
- "protected route" keyword
- "build error" keyword
- "test infrastructure" keyword
- "testing evidence" keyword
- "user stories" keyword (NEW)
- "playwright" keyword (NEW)

**Manual Execution**:
\`\`\`bash
# Standard E2E execution (MANDATORY)
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# Options (use sparingly)
--skip-build             # Skip build validation
--skip-migrations        # Skip migration checks
--no-auto-migrations     # Don't auto-execute migrations
\`\`\`

### Success Criteria (UPDATED)

**PASS Verdict** requires:
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ **ALL E2E tests pass (100% user stories validated)** (**MANDATORY**)
- ✅ Test evidence collected (Playwright report, screenshots)
- ✅ No critical integration gaps

**CONDITIONAL_PASS** if:
- ⚠️ E2E tests pass but minor issues in edge cases
- ⚠️ Non-critical integration warnings
- ⚠️ Test infrastructure improvements identified but not blocking

**BLOCKED** if:
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ **ANY E2E test failures** (user stories not validated)
- ❌ Critical dependency conflicts

### Database Integration (UPDATED)

Results stored in \`sub_agent_execution_results\` table:
- Overall verdict and confidence score
- Phase results (pre-flight, test generation, execution, evidence, learnings)
- Recommendations for EXEC agent
- **Testing learnings** (for continuous improvement) (**NEW**)
- Test evidence URLs (Playwright reports, screenshots, videos)
- User story coverage percentage (must be 100%)

### Continuous Improvement Framework (NEW)

**Goal**: Perfect the testing sub-agent through iterative learning

**Mechanisms**:
1. **Retrospective capture**: Testing learnings after each SD execution
2. **Script enhancement**: Improve \`qa-engineering-director-enhanced.js\` based on patterns
3. **Infrastructure building**: Add reusable Playwright helpers, fixtures, page objects
4. **Best practices documentation**: Capture effective test patterns in wiki
5. **Tooling improvements**: Add new Playwright reporters, visual regression, trace viewer usage

**Feedback Loop**:
\`\`\`
SD Execution → Testing Challenges → Retrospective Captured →
Script Enhanced → Better Testing Next SD → Repeat
\`\`\`

**Expected Evolution**:
- **v2.0** (current): Manual test case generation, Playwright execution, evidence collection
- **v2.5** (next): Automated test generation from user stories, smart selector strategies
- **v3.0** (future): AI-assisted test case creation, self-healing tests, visual regression automation

### Integration with Product Requirements Expert

**Workflow**:
1. **PLAN Phase**: Product Requirements Expert generates user stories → Stores in \`user_stories\` table
2. **PLAN Verification**: QA Director queries user stories → Creates professional test cases → Validates with Playwright
3. **Evidence**: Each user story must have corresponding passing E2E test(s)
4. **Approval**: LEAD cannot approve SD without 100% user story validation

### Key Principle

**"Smoke tests tell you if it loads. E2E tests tell you if it works. We require BOTH, with emphasis on E2E."**`;

async function updateQASection() {
  console.log('🔄 Updating QA Engineering Director section in leo_protocol_sections table...\n');

  try {
    // First, find the existing section
    const { data: existing, error: fetchError } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .eq('section_type', 'qa_engineering_enhanced')
      .single();

    if (fetchError) {
      console.error('❌ Error fetching existing section:', fetchError);
      process.exit(1);
    }

    if (!existing) {
      console.error('❌ QA Engineering Director section not found (section_type: qa_engineering_enhanced)');
      process.exit(1);
    }

    console.log('✅ Found existing section:');
    console.log(`   ID: ${existing.id}`);
    console.log(`   Title: ${existing.title}`);
    console.log(`   Section Type: ${existing.section_type}`);
    console.log(`   Order Index: ${existing.order_index}`);
    console.log('');

    // Update the section (only fields that exist in the table)
    const { data: updated, error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: updatedContent,
        title: 'Enhanced QA Engineering Director v2.0 - Testing-First Edition',
        metadata: {
          ...existing.metadata,
          version: '2.0',
          edition: 'Testing-First',
          updated_reason: 'Comprehensive E2E testing requirements with Playwright',
          updated_date: new Date().toISOString()
        }
      })
      .eq('id', existing.id)
      .select();

    if (updateError) {
      console.error('❌ Error updating section:', updateError);
      process.exit(1);
    }

    console.log('✅ Successfully updated QA Engineering Director section!');
    console.log('');
    console.log('📊 Updated fields:');
    console.log('   - title: Enhanced QA Engineering Director v2.0 - Testing-First Edition');
    console.log('   - content: Updated with Testing-First requirements (' + updatedContent.length + ' chars)');
    console.log('   - metadata: Added version 2.0 and Testing-First edition info');
    console.log('');
    console.log('🔑 Key Changes:');
    console.log('   ✅ E2E testing is now MANDATORY (not conditional)');
    console.log('   ✅ Professional test case generation from user stories');
    console.log('   ✅ Playwright emphasis throughout');
    console.log('   ✅ Testing learnings capture for continuous improvement');
    console.log('   ✅ 5-phase workflow updated with test case generation');
    console.log('   ✅ New triggers: "user stories", "playwright"');
    console.log('   ✅ Integration with Product Requirements Expert');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('   1. Regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify updated content appears in CLAUDE.md');
    console.log('');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

updateQASection();
