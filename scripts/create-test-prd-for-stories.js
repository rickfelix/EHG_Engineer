#!/usr/bin/env node

/**
 * Create Test PRD for Story Generation Demo
 * Creates a PRD with acceptance criteria for SD-2025-09-EMB
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestPRD() {
  console.log('🔧 Creating test PRD for story generation...\n');

  // First check if SD-2025-09-EMB exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title')
    .eq('legacy_id', 'SD-2025-09-EMB')
    .single();

  let sdId;
  if (!sd) {
    // Create the SD if it doesn't exist
    console.log('Creating SD-2025-09-EMB...');

    // Generate a UUID for the ID
    const { v4: uuidv4 } = await import('uuid');
    const sdUuid = uuidv4();

    const { data: newSD, error: createError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdUuid,
        legacy_id: 'SD-2025-09-EMB',
        title: 'EHG Backlog Import System',
        description: 'Import and manage EHG backlog items with user story verification',
        category: 'engineering',
        priority: 'high',
        status: 'active',
        created_by: 'test-script',
        version: '1.0',
        rationale: 'Need comprehensive backlog management with story verification for release gates',
        scope: 'Backlog import, story generation, verification tracking, and release gate calculations',
        strategic_objectives: ['Implement comprehensive backlog management', 'Enable story verification'],
        success_criteria: ['All stories tracked', '80% test coverage'],
        metadata: {
          source: 'test-generation',
          purpose: 'story-demo'
        }
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating SD:', createError);
      return;
    }
    sdId = newSD.id;
    console.log('✅ Created SD:', newSD.legacy_id);
  } else {
    sdId = sd.id;
    console.log('Found existing SD:', sd.legacy_id);
  }

  // Check if PRD already exists
  const { data: existingPRD } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdId)
    .single();

  if (existingPRD) {
    console.log('PRD already exists for this SD');
    console.log('PRD ID:', existingPRD.id);
    return existingPRD.id;
  }

  // Create comprehensive acceptance criteria
  const acceptanceCriteria = [
    {
      id: 'AC-001',
      title: 'User can import backlog items from CSV',
      description: 'System allows users to upload CSV files containing backlog items and validates the format before import',
      priority: 'high',
      testable: true
    },
    {
      id: 'AC-002',
      title: 'Duplicate detection during import',
      description: 'System detects and prevents duplicate backlog items based on title and description matching',
      priority: 'high',
      testable: true
    },
    {
      id: 'AC-003',
      title: 'Real-time import progress display',
      description: 'Users see a progress bar and status messages during the import process',
      priority: 'medium',
      testable: true
    },
    {
      id: 'AC-004',
      title: 'Export backlog to multiple formats',
      description: 'Users can export backlog items to CSV, JSON, and PDF formats',
      priority: 'medium',
      testable: true
    },
    {
      id: 'AC-005',
      title: 'Backlog item prioritization',
      description: 'Users can drag and drop to reorder backlog items by priority',
      priority: 'medium',
      testable: true
    },
    {
      id: 'AC-006',
      title: 'Story verification status tracking',
      description: 'Each backlog item shows its verification status (passing/failing/not_run)',
      priority: 'high',
      testable: true
    },
    {
      id: 'AC-007',
      title: 'Automated story generation from criteria',
      description: 'System generates user stories from acceptance criteria with unique keys',
      priority: 'high',
      testable: true
    },
    {
      id: 'AC-008',
      title: 'Release gate calculation',
      description: 'Dashboard shows percentage of stories passing and overall release readiness',
      priority: 'high',
      testable: true
    }
  ];

  // Create PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      sd_id: sdId,
      title: 'EHG Backlog Import and Story Management System',
      description: 'Complete system for importing, managing, and verifying backlog items with automated story generation',
      acceptance_criteria: acceptanceCriteria,
      technical_requirements: {
        database: 'PostgreSQL with RLS',
        api: 'REST endpoints with rate limiting',
        ui: 'React with real-time updates',
        testing: 'Playwright E2E with story annotations'
      },
      success_metrics: {
        story_coverage: '80%',
        import_speed: '< 5 seconds for 100 items',
        ui_responsiveness: 'P95 < 200ms'
      },
      status: 'approved',
      created_by: 'test-script',
      metadata: {
        test_data: true,
        for_demo: 'story-generation'
      }
    })
    .select()
    .single();

  if (prdError) {
    console.error('Error creating PRD:', prdError);
    return;
  }

  console.log('\n✅ PRD Created Successfully!');
  console.log('PRD ID:', prd.id);
  console.log('Title:', prd.title);
  console.log('Acceptance Criteria:', acceptanceCriteria.length, 'items');
  console.log('\nYou can now generate stories using:');
  console.log('make stories-generate SD=SD-2025-09-EMB');
  console.log('\nOr directly:');
  console.log('curl -X POST http://localhost:3000/api/stories/generate \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '{"sd_key":"SD-2025-09-EMB","prd_id":"${prd.id}","mode":"dry_run"}'`);

  return prd.id;
}

// Run the script
createTestPRD().catch(console.error);