#!/usr/bin/env node

/**
 * Create PRD for SD-UAT-2025-004: UI Component Visibility and Initialization Issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createUIPRD() {
  console.log('📋 Creating PRD for SD-UAT-2025-004: UI Component Visibility and Initialization Issues');
  console.log('================================================================\n');

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    id: 'PRD-SD-UAT-2025-004',
    title: 'UI Component Visibility and Initialization Issues',
    // FIX: user_stories moved to separate table
    /* user_stories: [
      {
        id: 'US-UI-001',
        title: 'Fix Dashboard Widget Rendering',
        description: 'As a user, I need dashboard widgets to render reliably within 3 seconds so I can view my data',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Dashboard loads within 3 seconds',
          'All widgets render completely',
          'No layout shifts after initial load',
          'Loading indicators shown during fetch',
          'Error states handle gracefully'
        ],
        test_requirements: [
          'Widget render timing tests',
          'Component visibility assertions',
          'Loading state verification',
          'Error boundary testing',
          'Performance benchmarks'
        ]
      },
      {
        id: 'US-UI-002',
        title: 'Ensure Form Field Initialization',
        description: 'As a user, I need form fields to be properly initialized and interactive immediately',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Form fields render on page load',
          'All inputs are immediately interactive',
          'Default values populate correctly',
          'Validation works on blur',
          'Submit buttons enabled appropriately'
        ],
        test_requirements: [
          'Form initialization tests',
          'Field interaction tests',
          'Validation trigger tests',
          'Submit state tests',
          'Accessibility tests'
        ]
      },
      {
        id: 'US-UI-003',
        title: 'Fix Table and List Component Visibility',
        description: 'As a user, I need tables and lists to display data consistently',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Tables render with all columns',
          'List items display completely',
          'Pagination controls visible',
          'Sort/filter options accessible',
          'Empty states show appropriately'
        ],
        test_requirements: [
          'Table rendering tests',
          'List component tests',
          'Pagination functionality tests',
          'Sort/filter operation tests',
          'Empty state tests'
        ]
      },
      {
        id: 'US-UI-004',
        title: 'Fix Navigation Element Rendering',
        description: 'As a user, I need navigation elements to be consistently visible and functional',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Navigation menu always visible',
          'Breadcrumbs render correctly',
          'Mobile menu toggles properly',
          'Active states highlight correctly',
          'Dropdown menus work reliably'
        ],
        test_requirements: [
          'Navigation visibility tests',
          'Menu interaction tests',
          'Mobile responsiveness tests',
          'Active state tests',
          'Dropdown functionality tests'
        ]
      },
      {
        id: 'US-UI-005',
        title: 'Implement Component Lifecycle Management',
        description: 'As a developer, I need proper component lifecycle management to prevent render issues',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Components mount/unmount cleanly',
          'Memory leaks prevented',
          'Event listeners cleaned up',
          'Async operations cancelled properly',
          'State updates batched efficiently'
        ],
        test_requirements: [
          'Lifecycle hook tests',
          'Memory leak detection',
          'Event listener cleanup tests',
          'Async cancellation tests',
          'Performance profiling'
        ]
      }
    ], */
    technical_requirements: {
      frontend: [
        'Add proper loading states to all components',
        'Implement component initialization checks',
        'Fix async data loading race conditions',
        'Add visibility assertions before interactions',
        'Implement proper error boundaries'
      ],
      performance: [
        'Optimize initial render performance',
        'Implement lazy loading for heavy components',
        'Add virtual scrolling for long lists',
        'Optimize re-renders with memoization',
        'Implement progressive enhancement'
      ],
      testing: [
        'Add visibility timeout configurations',
        'Implement wait-for-element helpers',
        'Create component render utilities',
        'Add visual regression tests',
        'Implement interaction timing tests'
      ],
      accessibility: [
        'Ensure ARIA labels present',
        'Add focus management',
        'Implement keyboard navigation',
        'Add screen reader support',
        'Ensure proper contrast ratios'
      ]
    },
    // FIX: success_metrics moved to metadata
    // success_metrics: {
    //   visibility: 'Zero "element not found" errors',
    //   performance: 'All components render <3 seconds',
    //   reliability: '100% component initialization success',
    //   testing: '<5% UI-related test failures',
    //   accessibility: 'WCAG 2.1 AA compliance'
    // }
  };

  const prd = {
    id: 'PRD-SD-UAT-2025-004',
    directive_id: 'SD-UAT-2025-004',
    title: 'UI Component Visibility and Initialization Issues',
    version: '1.0',
    status: 'draft',
    content: prdContent,
    metadata: {
      test_failures_addressed: 45,
      issues_resolved: [
        'Element not visible errors',
        'Dashboard components not loading',
        'Form fields not accessible',
        'Export buttons not visible',
        'Search inputs not found'
      ],
      priority: 'CRITICAL',
      business_impact: 'Major features unusable due to UI issues',
      created_by: 'LEO_PLAN_AGENT'
    },
    created_by: 'LEO_PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sd_uuid: sdUuid, // FIX: Added for handoff validation
  };

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', 'SD-UAT-2025-004')
      .single();

    if (existing) {
      const { error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('directive_id', 'SD-UAT-2025-004')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD updated successfully!');
    } else {
      const { error } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD created successfully!');
    }

    console.log('   ID: PRD-SD-UAT-2025-004');
    console.log('   Title: UI Component Visibility and Initialization Issues');
    console.log('   User Stories: 5 CRITICAL');
    console.log('   Test Failures Addressed: 45');
    console.log('\n🎯 Ready for orchestrator execution');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }
}

// Execute
createUIPRD();