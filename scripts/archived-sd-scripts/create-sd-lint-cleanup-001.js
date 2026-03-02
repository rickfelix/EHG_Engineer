#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-LINT-CLEANUP-001
 * Codebase Lint Cleanup - Pre-Existing CI/CD Blockers
 *
 * Fix 8 a11y errors and 5 React hooks warnings in pre-existing codebase
 * that are blocking CI/CD pipeline for all SDs.
 *
 * Identified during SD-E2E-INFRASTRUCTURE-001 PLAN verification phase.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createLintCleanup() {
  console.log('🔨 Creating Strategic Directive: Codebase Lint Cleanup');
  console.log('==========================================================================\n');

  const strategicDirective = {
    id: 'SD-LINT-CLEANUP-001',
    sd_key: 'SD-LINT-CLEANUP-001',
    title: 'Codebase Lint Cleanup - Pre-Existing CI/CD Blockers',
    description: 'Fix 8 a11y errors and 5 React hooks warnings in pre-existing codebase files that are blocking CI/CD pipeline for all SDs. Files affected: chairman/, audio/, analytics/, ai-ceo/, onboarding/ components. These pre-existing issues were identified during SD-E2E-INFRASTRUCTURE-001 and are preventing proper CI/CD verification for all future strategic directives.',
    priority: 'high',
    status: 'draft',
    category: 'Optimization',

    rationale: `Pre-existing lint errors are blocking CI/CD verification for ALL strategic directives:

**Problem Identified**: During SD-E2E-INFRASTRUCTURE-001 PLAN verification, CI/CD pipeline failed due to pre-existing lint errors in UNRELATED files:
- 8 accessibility errors (ESLint jsx-a11y rules)
- 5 React hooks warnings (exhaustive-deps violations)

**Affected Directories**:
- chairman/ components (Chairman Dashboard analytics)
- audio/ components (Audio player/recording)
- analytics/ components (Analytics dashboards)
- ai-ceo/ components (AI CEO interface)
- onboarding/ components (User onboarding flows)

**Impact**: Every SD that creates a PR will fail CI/CD validation due to these pre-existing issues, preventing proper quality gates from functioning. This creates false negative signals and prevents legitimate work from progressing.

**Source**: Identified and documented in SD-E2E-INFRASTRUCTURE-001 retrospective (ID: 86a815a3-e0a6-4f58-8d6a-3225da3bdc5c) as HIGH priority follow-up.

**ROI**: 2-3 hour investment will unblock CI/CD for ALL future SDs, saving 1-2 hours per SD in debugging and workarounds.`,

    scope: `Fix pre-existing lint errors in 5 component directories:

1. **chairman/ components** - Chairman Dashboard analytics
   - Fix a11y errors (missing ARIA labels, keyboard navigation)
   - Fix React hooks exhaustive-deps warnings

2. **audio/ components** - Audio player/recording
   - Fix a11y errors (missing alt text, button labels)
   - Fix React hooks warnings

3. **analytics/ components** - Analytics dashboards
   - Fix a11y errors
   - Verify no new warnings introduced

4. **ai-ceo/ components** - AI CEO interface
   - Fix React hooks exhaustive-deps warnings
   - Ensure proper dependency arrays

5. **onboarding/ components** - User onboarding flows
   - Fix React hooks warnings
   - Fix any a11y issues

**In Scope**: Lint error fixes only, minimal code changes
**Out of Scope**: New features, major refactoring, performance optimization`,

    key_changes: '',
    implementation_guidelines: '',

    strategic_objectives: [
      'Achieve 0 lint errors in affected components (chairman/, audio/, analytics/, ai-ceo/, onboarding/)',
      'Unblock CI/CD pipeline for all future strategic directives',
      'Establish clean code quality baseline for future work',
      'Enable proper quality gates to function without false negatives'
    ],

    success_criteria: [
      'CI/CD lint check passes with 0 errors, 0 warnings in affected files',
      'All 8 accessibility errors fixed (jsx-a11y compliance)',
      'All 5 React hooks warnings fixed (exhaustive-deps compliance)',
      'No new lint errors introduced during fixes',
      'Verification: npm run lint passes cleanly',
      'CI/CD pipeline passes for test PR without lint errors'
    ],

    target_application: 'EHG',

    metadata: {
      source: 'SD-E2E-INFRASTRUCTURE-001 completion',
      parent_sd_id: 'SD-E2E-INFRASTRUCTURE-001',
      retrospective_id: '86a815a3-e0a6-4f58-8d6a-3225da3bdc5c',
      identified_during: 'PLAN verification phase',
      ci_cd_impact: 'BLOCKS all future SDs',
      error_breakdown: {
        a11y_errors: 8,
        react_hooks_warnings: 5,
        affected_directories: ['chairman/', 'audio/', 'analytics/', 'ai-ceo/', 'onboarding/']
      },
      estimated_effort: '2-3 hours',
      business_impact: 'Unblocks CI/CD for entire codebase',
      roi: 'HIGH - Enables all future SDs to use CI/CD validation properly',
      time_savings: 'Saves 1-2 hours per SD × 20 SDs per quarter = 20-40 hours saved quarterly'
    }
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-LINT-CLEANUP-001')
      .single();

    if (existing) {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-LINT-CLEANUP-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('   ID: SD-LINT-CLEANUP-001');
    console.log('   Title: Codebase Lint Cleanup - Pre-Existing CI/CD Blockers');
    console.log('   Priority: HIGH');
    console.log('   Status: DRAFT');
    console.log('   Target App: EHG');
    console.log('   Estimated Effort: 2-3 hours');
    console.log('\n📋 Problem: 8 a11y + 5 React hooks errors blocking CI/CD');
    console.log('🎯 Impact: Unblocks CI/CD for ALL future SDs');
    console.log('💰 ROI: HIGH (20-40 hours saved quarterly)');
    console.log('🔗 Source: SD-E2E-INFRASTRUCTURE-001 retrospective');
    console.log('==========================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createLintCleanup };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createLintCleanup();
}
