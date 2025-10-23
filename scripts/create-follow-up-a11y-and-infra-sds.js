#!/usr/bin/env node

/**
 * Create Follow-up Strategic Directives from SD-VWC-A11Y-001 Completion
 *
 * Creates 2 Strategic Directives:
 * 1. SD-VWC-A11Y-002: Phase 2 Accessibility Compliance (deferred work)
 * 2. SD-INFRASTRUCTURE-FIX-001: Critical LEO Protocol Infrastructure Issues
 *
 * User requested HIGH and CRITICAL priority respectively
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const strategicDirectives = [
  // SD 1: VWC Accessibility Phase 2
  {
    id: 'SD-VWC-A11Y-002',
    sd_key: 'VWC-A11Y-002',
    title: 'VentureCreationPage: Phase 2 Accessibility Compliance',
    version: '1.0',
    status: 'pending_approval',
    category: 'accessibility',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'LEAD',
    progress: 0,
    description: 'Complete Phase 2 accessibility work deferred from SD-VWC-A11Y-001. Implements color contrast audit (1-1.5h), focus indicators (0.5-1h), screen reader testing (1-1.5h), and complete E2E coverage (1h). Total: 4-5 hours + WCAG training budget ($100-$300). Documentation location: src/components/ventures/VentureCreationPage.tsx:81-126',
    strategic_intent: 'Complete WCAG 2.1 AA compliance for VentureCreationPage to ensure accessibility for all users, including those with visual impairments and keyboard-only navigation requirements.',
    rationale: 'Complete WCAG 2.1 AA compliance deferred from SD-VWC-A11Y-001 Phase 1. User-approved scope split to manage time constraints while maintaining accessibility goals. Phase 1 completed semantic HTML and ARIA labels; Phase 2 addresses visual accessibility and comprehensive testing.',
    scope: 'Phase 2: Color contrast audit and fixes, focus indicator implementation, screen reader testing with NVDA/JAWS, complete E2E coverage for all accessibility features',
    strategic_objectives: [
      'Audit and fix all color contrast violations to meet WCAG AA (4.5:1 normal text, 3:1 large text)',
      'Implement visible focus indicators for all interactive elements',
      'Test complete user flow with NVDA and JAWS screen readers',
      'Create comprehensive E2E tests for keyboard navigation and ARIA labels',
      'Document accessibility patterns for reuse across application'
    ],
    success_criteria: [
      'All color combinations meet WCAG AA contrast ratios (4.5:1 minimum)',
      'Focus indicators clearly visible on all interactive elements',
      'Complete venture creation flow tested with NVDA and JAWS',
      'E2E tests cover all keyboard navigation paths',
      'Accessibility documentation updated with patterns and examples'
    ],
    key_changes: [
      'Color palette audit and contrast fixes for buttons, labels, and text',
      'CSS focus indicator styles (outline/ring) for all interactive elements',
      'Screen reader testing protocol and remediation',
      'Playwright E2E tests for keyboard navigation and screen reader compatibility',
      'Accessibility testing guide in docs/testing/'
    ],
    key_principles: [
      'WCAG 2.1 AA compliance mandatory',
      'Progressive enhancement: Accessibility features enhance, not replace existing UI',
      'Test with real assistive technology (NVDA/JAWS), not just automated tools',
      'Document patterns for team reuse',
      'Budget for WCAG training ($100-$300) if gaps identified'
    ],
    metadata: {
      parent_sd_id: 'SD-VWC-A11Y-001',
      phase: 2,
      deferred_from: 'SD-VWC-A11Y-001',
      deferred_date: '2025-10-21',
      framework_type: 'accessibility_compliance',
      target_users: 'All users (with focus on keyboard-only and screen reader users)',
      testing_strategy: 'Manual screen reader testing (NVDA/JAWS) + Playwright E2E + axe-core automated',
      time_estimate: '4-5 hours implementation + $100-$300 training budget',
      documentation_location: 'src/components/ventures/VentureCreationPage.tsx:81-126',
      wcag_level: 'AA',
      wcag_version: '2.1'
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // SD 2: Infrastructure Fixes
  {
    id: 'SD-INFRASTRUCTURE-FIX-001',
    sd_key: 'INFRASTRUCTURE-FIX-001',
    title: 'Critical LEO Protocol Infrastructure Issues',
    version: '1.0',
    status: 'pending_approval',
    category: 'infrastructure',
    priority: 'critical',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD',
    progress: 0,
    description: 'Fix 4 critical infrastructure issues discovered during SD-VWC-A11Y-001: (1) CI/CD workflow configuration failures, (2) RLS policy blocking handoff updates, (3) get_progress_breakdown() calculation bug reporting 40% when 100% complete, (4) Missing SUPABASE_SERVICE_ROLE_KEY. These block all SD completion workflows.',
    strategic_intent: 'Restore critical LEO Protocol infrastructure to enable reliable SD completion workflows, accurate progress tracking, and automated CI/CD pipelines.',
    rationale: 'Critical infrastructure failures block LEO Protocol workflow completion. Systemic issues affecting all future SDs require immediate resolution. Discovered during SD-VWC-A11Y-001 completion attempt where multiple core systems failed simultaneously.',
    scope: '4 infrastructure fixes: CI/CD workflow configuration, RLS policies for handoff updates, progress calculation function bug, SERVICE_ROLE_KEY environment setup',
    strategic_objectives: [
      'Fix CI/CD workflow configuration to enable automated testing and deployment',
      'Update RLS policies to allow authenticated handoff updates (currently blocking all writes)',
      'Fix get_progress_breakdown() calculation bug showing incorrect percentages',
      'Configure SUPABASE_SERVICE_ROLE_KEY for service-level operations',
      'Document infrastructure setup for future troubleshooting'
    ],
    success_criteria: [
      'CI/CD workflows execute successfully on push to main branch',
      'Handoff creation/updates succeed through unified-handoff-system.js',
      'get_progress_breakdown() returns accurate percentages (100% when complete)',
      'SERVICE_ROLE_KEY configured and validated in environment',
      'Infrastructure health check script passes all validations',
      'All infrastructure issues documented in retrospective'
    ],
    key_changes: [
      'Fix .github/workflows/*.yml configuration errors',
      'Update sd_phase_handoffs RLS policies (SELECT + INSERT + UPDATE for authenticated users)',
      'Fix get_progress_breakdown() SQL function calculation logic',
      'Add SUPABASE_SERVICE_ROLE_KEY to .env and deployment environment',
      'Create infrastructure health check script',
      'Document RLS policy patterns for future reference'
    ],
    key_principles: [
      'Database-first: RLS policies must support LEO Protocol workflow',
      'Security-aware: SERVICE_ROLE_KEY only for service-level operations',
      'Verification-first: Test each fix independently before integration',
      'Documentation-required: Infrastructure setup must be reproducible',
      'Retrospective-driven: Capture lessons learned for pattern recognition'
    ],
    metadata: {
      discovered_during: 'SD-VWC-A11Y-001',
      discovery_date: '2025-10-21',
      framework_type: 'infrastructure_fix',
      blocking_sds: 'All SDs requiring handoff completion',
      testing_strategy: 'Manual verification + automated health check script',
      time_estimate: '6-8 hours (2h per issue)',
      issues: [
        {
          issue: 'CI/CD workflow failures',
          impact: 'No automated testing or deployment',
          severity: 'critical'
        },
        {
          issue: 'RLS policy blocking handoff updates',
          impact: 'Cannot complete EXEC→PLAN or PLAN→LEAD handoffs',
          severity: 'critical'
        },
        {
          issue: 'get_progress_breakdown() calculation bug',
          impact: 'Inaccurate progress reporting (shows 40% when 100% complete)',
          severity: 'high'
        },
        {
          issue: 'Missing SUPABASE_SERVICE_ROLE_KEY',
          impact: 'Cannot bypass RLS for service-level operations',
          severity: 'high'
        }
      ]
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function insertStrategicDirective(sd) {
  console.log(`\n📋 Inserting ${sd.id}: ${sd.title}...`);

  try {
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', sd.id)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sd)
        .eq('id', sd.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} updated successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Category: ${data.category}`);
    } else {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} created successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Category: ${data.category}`);
    }
  } catch (error) {
    console.error(`❌ Error with ${sd.id}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating Follow-up Strategic Directives from SD-VWC-A11Y-001');
  console.log('='.repeat(70));
  console.log('\nCreating 2 Strategic Directives:');
  console.log('  1. SD-VWC-A11Y-002: Phase 2 Accessibility Compliance (HIGH priority)');
  console.log('  2. SD-INFRASTRUCTURE-FIX-001: Critical Infrastructure Issues (CRITICAL priority)');
  console.log('');

  // CRITICAL: One table at a time (CLAUDE_CORE.md line 126-159)
  for (const sd of strategicDirectives) {
    await insertStrategicDirective(sd);
  }

  console.log('\n✅ All Strategic Directives created successfully!');
  console.log('\nNext steps:');
  console.log('  1. Review SDs in dashboard: http://localhost:3000');
  console.log('  2. LEAD approval for both SDs');
  console.log('  3. Prioritize: SD-INFRASTRUCTURE-FIX-001 (CRITICAL) should be addressed first');
}

main().catch(console.error);
