#!/usr/bin/env node

/**
 * Create SD-A11Y-ONBOARDING-001: Fix Pre-existing Accessibility Errors
 * Database-first SD creation per LEO Protocol v4.2.0
 *
 * Context: During SD-VWC-INTUITIVE-FLOW-001 Checkpoint 1 CI validation,
 * we fixed a missing eslint-plugin-jsx-a11y dependency. The now-functional
 * plugin revealed 2 pre-existing ARIA errors in the onboarding flow that
 * were previously masked.
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createAccessibilitySD() {
  console.log('\n📋 Creating SD-A11Y-ONBOARDING-001');
  console.log('='.repeat(60));

  let client;

  try {
    console.log('\n1️⃣  Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connection established');

    const sdData = {
      id: 'SD-A11Y-ONBOARDING-001',
      title: 'Fix Pre-Existing Accessibility Errors in Onboarding Flow',
      description: `Fix 2 pre-existing ARIA errors in the onboarding getting-started page that were revealed when eslint-plugin-jsx-a11y was properly installed.

**Context**: During SD-VWC-INTUITIVE-FLOW-001 Checkpoint 1, we added the missing eslint-plugin-jsx-a11y dependency to package.json (it was installed locally but not declared). The now-functional ESLint plugin correctly identified 2 pre-existing accessibility errors in code not touched by Checkpoint 1.

**Impact**: These errors are blocking CI/CD for ALL pull requests, including the completed Checkpoint 1 work.

**Scope**: Minimal, targeted fix - only 2 ARIA attribute corrections in a single file.`,

      priority: 'high',
      status: 'approved',
      current_phase: 'PLAN',
      progress_percentage: 0,
      estimated_effort_hours: 1,

      business_value: `**Immediate Value**:
- Unblocks CI/CD pipeline for all PRs
- Enables merging of completed Checkpoint 1 work (4 user stories, 315 LOC)
- Removes technical debt before it spreads

**Long-term Value**:
- Improves accessibility for users with disabilities
- Demonstrates commitment to WCAG 2.1 AA compliance
- Prevents similar issues from being introduced
- Establishes pattern for handling pre-existing accessibility issues`,

      success_criteria: `1. ✅ ESLint passes with 0 accessibility errors in getting-started page
2. ✅ Radio button groups have proper ARIA attributes (aria-checked)
3. ✅ No aria-pressed on radio role elements
4. ✅ CI/CD pipeline passes for ehg repository
5. ✅ WAVE accessibility checker shows no new errors
6. ✅ Keyboard navigation still functional
7. ✅ Screen reader testing confirms proper announcement`,

      acceptance_criteria: `**Code Quality**:
- [ ] ESLint: 0 errors, 0 new warnings
- [ ] TypeScript: Compiles without errors
- [ ] No functional regressions in onboarding flow
- [ ] Changes limited to minimal ARIA attribute corrections

**Testing**:
- [ ] Manual keyboard navigation test (Tab, Space, Arrow keys)
- [ ] Screen reader test (NVDA or JAWS)
- [ ] Visual regression check (no UI changes)
- [ ] CI/CD pipeline green

**Documentation**:
- [ ] Commit message explains pre-existing nature of issue
- [ ] Links to SD-VWC-INTUITIVE-FLOW-001 context
- [ ] ARIA attribute changes documented`,

      risks: `**LOW Risk Assessment**:

1. **Scope Risk**: MINIMAL
   - Only 2 lines affected (275, 287)
   - Single file: app/(onboarding)/getting-started/page.tsx
   - No logic changes, only ARIA attributes

2. **Regression Risk**: LOW
   - Changes are additive (adding aria-checked)
   - Removing incorrect aria-pressed from radio
   - No event handlers or state logic affected

3. **Timeline Risk**: MINIMAL
   - Estimated 15 minutes implementation
   - 45 minutes testing (manual + automated)
   - Total: 1 hour

**Mitigation**:
- Test on staging before merging
- Quick rollback available if issues found
- Limited blast radius (onboarding page only)`,

      dependencies: `**Blocked By**: None - can proceed immediately

**Blocks**:
- SD-VWC-INTUITIVE-FLOW-001 Checkpoint 1 merge (PR #15)
- All future PRs requiring CI/CD validation

**Related**:
- SD-VWC-INTUITIVE-FLOW-001: Context for discovery
- eslint-plugin-jsx-a11y: Dependency that revealed issue`,

      metadata: {
        discovered_during: 'SD-VWC-INTUITIVE-FLOW-001',
        discovered_date: '2025-10-24',
        file_affected: 'app/(onboarding)/getting-started/page.tsx',
        error_count: 2,
        error_lines: [275, 287],
        blocking_pr: 15,
        blocking_ci_run: '18794041628',
        estimated_minutes: 60,
        priority_justification: 'Blocks all CI/CD validation'
      }
    };

    console.log('\n2️⃣  Preparing SD data...');
    console.log(`   ID: ${sdData.id}`);
    console.log(`   Title: ${sdData.title}`);
    console.log(`   Priority: ${sdData.priority}`);
    console.log(`   Estimated effort: ${sdData.estimated_effort_hours} hour`);

    console.log('\n3️⃣  Inserting SD into database...');

    const insertQuery = `
      INSERT INTO strategic_directives_v2 (
        id,
        title,
        description,
        priority,
        status,
        current_phase,
        progress_percentage,
        estimated_effort_hours,
        business_value,
        success_criteria,
        acceptance_criteria,
        risks,
        dependencies,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, created_at;
    `;

    const result = await client.query(insertQuery, [
      sdData.id,
      sdData.title,
      sdData.description,
      sdData.priority,
      sdData.status,
      sdData.current_phase,
      sdData.progress_percentage,
      sdData.estimated_effort_hours,
      sdData.business_value,
      sdData.success_criteria,
      sdData.acceptance_criteria,
      sdData.risks,
      sdData.dependencies,
      JSON.stringify(sdData.metadata)
    ]);

    console.log('✅ SD created successfully!');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Created: ${result.rows[0].created_at}`);

    console.log('\n4️⃣  Verifying SD in database...');
    const verifyQuery = `
      SELECT id, title, status, current_phase, priority
      FROM strategic_directives_v2
      WHERE id = $1;
    `;

    const verification = await client.query(verifyQuery, [sdData.id]);

    if (verification.rows.length > 0) {
      console.log('✅ SD verified in database');
      console.log(`   Title: ${verification.rows[0].title}`);
      console.log(`   Status: ${verification.rows[0].status}`);
      console.log(`   Phase: ${verification.rows[0].current_phase}`);
      console.log(`   Priority: ${verification.rows[0].priority}`);
    } else {
      throw new Error('SD verification failed - record not found');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SD-A11Y-ONBOARDING-001 CREATED');
    console.log('='.repeat(60));
    console.log('\nFix Details:');
    console.log('File: app/(onboarding)/getting-started/page.tsx');
    console.log('Line 275: Remove aria-pressed from radio role');
    console.log('Line 287: Add aria-checked to radio role');
    console.log('\nEstimated time: 1 hour (15 min code + 45 min testing)');
    console.log('Priority: HIGH (blocks all CI/CD)\n');

  } catch (error) {
    console.error('\n❌ Error creating SD:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAccessibilitySD()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default createAccessibilitySD;
