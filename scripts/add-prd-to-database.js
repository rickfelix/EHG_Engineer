#!/usr/bin/env node

/**
 * Add PRD to database
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * Part of Phase 3.2: User story validation enforcement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';
dotenv.config();

async function addPRDToDatabase(sdId, prdTitle) {
  console.log(`📋 Adding PRD for ${sdId} to database...\n`);
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Generate PRD ID
  const prdId = `PRD-${sdId}`;
  
  try {
    // First check if table exists
    const { error: checkError } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation')) {
      console.log('❌ Table product_requirements_v2 does not exist!');
      console.log('\n📝 Please create it first by running this SQL in Supabase SQL Editor:');
      console.log('----------------------------------------');
      console.log(`
CREATE TABLE IF NOT EXISTS product_requirements_v2 (
    id VARCHAR(100) PRIMARY KEY,
    directive_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(50) DEFAULT 'draft',
    category VARCHAR(50) DEFAULT 'technical',
    priority VARCHAR(20) DEFAULT 'high',
    executive_summary TEXT,
    plan_checklist JSONB DEFAULT '[]'::jsonb,
    exec_checklist JSONB DEFAULT '[]'::jsonb,
    validation_checklist JSONB DEFAULT '[]'::jsonb,
    progress INTEGER DEFAULT 0,
    phase VARCHAR(50) DEFAULT 'planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'PLAN',
    content TEXT
);
      `);
      console.log('----------------------------------------');
      console.log(`\nGo to: ${supabaseUrl}`);
      console.log('Navigate to: SQL Editor → New Query');
      console.log('Paste the SQL above and click "Run"');
      process.exit(1);
    }

    // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('uuid_id')
      .eq('id', sdId)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${sdId} not found in database`);
      console.log('   Create SD first before creating PRD');
      process.exit(1);
    }

    const sdUuid = sdData.uuid_id;
    console.log(`   SD uuid_id: ${sdUuid}`);

    // Create PRD entry
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert({
        id: prdId,
        directive_id: sdId,
        sd_uuid: sdUuid,  // FIX: Populate sd_uuid for handoff validation
        title: prdTitle || `Product Requirements for ${sdId}`,
        status: 'planning',
        category: 'technical',
        priority: 'high',
        executive_summary: `Product requirements document for Strategic Directive ${sdId}`,
        phase: 'planning',
        created_by: 'PLAN',
        plan_checklist: [
          { text: 'PRD created and saved', checked: true },
          { text: 'SD requirements mapped to technical specs', checked: false },
          { text: 'Technical architecture defined', checked: false },
          { text: 'Implementation approach documented', checked: false },
          { text: 'Test scenarios defined', checked: false },
          { text: 'Acceptance criteria established', checked: false },
          { text: 'Resource requirements estimated', checked: false },
          { text: 'Timeline and milestones set', checked: false },
          { text: 'Risk assessment completed', checked: false }
        ],
        exec_checklist: [
          { text: 'Development environment setup', checked: false },
          { text: 'Core functionality implemented', checked: false },
          { text: 'Unit tests written', checked: false },
          { text: 'Integration tests completed', checked: false },
          { text: 'Code review completed', checked: false },
          { text: 'Documentation updated', checked: false }
        ],
        validation_checklist: [
          { text: 'All acceptance criteria met', checked: false },
          { text: 'Performance requirements validated', checked: false },
          { text: 'Security review completed', checked: false },
          { text: 'User acceptance testing passed', checked: false },
          { text: 'Deployment readiness confirmed', checked: false }
        ],
        progress: 10,
        content: `# Product Requirements Document

## Strategic Directive
${sdId}

## Status
Planning

## Executive Summary
This PRD defines the technical requirements and implementation approach for ${sdId}.

## Functional Requirements
- To be defined based on SD objectives

## Technical Requirements  
- To be defined based on technical analysis

## Implementation Approach
- To be defined by EXEC agent

## Test Scenarios
- To be defined during planning

## Acceptance Criteria
- To be defined based on success metrics
`
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  PRD ${prdId} already exists in database`);
      } else {
        console.error('❌ Database insert error:', error.message);
      }
      process.exit(1);
    }
    
    console.log(`✅ ${prdId} added to database successfully!`);
    console.log('Database record:', JSON.stringify(data, null, 2));

    // Auto-trigger Product Requirements Expert sub-agent
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🤖 AUTO-TRIGGER: Product Requirements Expert');
    console.log('═══════════════════════════════════════════════════');

    try {
      const storiesResult = await autoTriggerStories(supabase, sdId, prdId, {
        skipIfExists: true,
        notifyOnSkip: true,
        logExecution: true
      });

      if (storiesResult.skipped) {
        console.log('✅ User stories already exist, auto-trigger skipped');
      } else if (storiesResult.executed) {
        console.log('✅ User stories generated successfully');
      } else if (storiesResult.recommendation) {
        console.log('⚠️  User stories need to be generated manually');
        console.log(`   Recommendation: ${storiesResult.recommendation}`);
      }
    } catch (triggerError) {
      console.warn('⚠️  Auto-trigger warning:', triggerError.message);
      console.log('   User stories will need to be created manually');
    }

    console.log('\n📝 Next steps:');
    console.log('1. Update PRD with actual requirements');
    console.log('2. Mark checklist items as complete');
    console.log('3. Update phase as work progresses');
    console.log('4. If user stories not auto-generated, run: node scripts/create-user-stories-[sd-id].mjs');
    
  } catch (error) {
    console.error('❌ Error adding PRD to database:', error.message);
    process.exit(1);
  }
}

// Get parameters from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]');
  console.log('Example: node scripts/add-prd-to-database.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
  process.exit(1);
}

const sdId = args[0];
const prdTitle = args.slice(1).join(' ');
addPRDToDatabase(sdId, prdTitle);