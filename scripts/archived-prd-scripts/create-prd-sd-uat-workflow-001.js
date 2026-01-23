#!/usr/bin/env node

/**
 * PRD Creation Script for SD-UAT-WORKFLOW-001
 * UAT-to-SD Workflow Process Improvements
 *
 * This PRD addresses workflow gaps discovered during first UAT execution.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_KEY = 'SD-UAT-WORKFLOW-001';
const PRD_TITLE = 'UAT-to-SD Workflow Process Improvements';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_KEY}`);
  console.log('='.repeat(70));

  // Fetch SD using sd_key (not id)
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority')
    .eq('sd_key', SD_KEY)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_KEY} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   SD Key: ${sdData.sd_key}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_KEY}`;

  const prdData = {
    id: prdId,
    sd_id: sdData.id,              // FK uses UUID, not sd_key
    directive_id: sdData.id,       // Backward compatibility

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: sdData.category || 'Infrastructure',
    priority: sdData.priority || 'high',

    executive_summary: `
This PRD addresses critical workflow gaps discovered during the first UAT execution of SD-UAT-NAV-001 on 2026-01-19.

**Problem Statement:**
The current UAT → triage → SD creation workflow has significant friction points:
1. Raw user feedback is not automatically persisted, risking data loss
2. Database schema constraints (valid values for status, type, source_type) are undocumented
3. SD creation fails repeatedly due to type-specific validation requirements being unknown
4. No automation exists to convert triaged feedback items into SDs

**Solution:**
Implement four improvements:
1. Auto-save raw feedback in /uat command before processing
2. Document all schema constraints for feedback and SD tables
3. Create SD helper script with type-aware validation profiles
4. Create npm script to bulk-convert feedback items to SDs

**Impact:**
- Eliminate risk of losing UAT feedback data
- Reduce SD creation failures from ~80% to <5%
- Accelerate feedback-to-SD turnaround from hours to minutes
    `.trim(),

    business_context: `
**Business Value:**
- The UAT process is central to quality assurance in the LEO Protocol
- Every failed SD creation attempt costs 10-15 minutes of troubleshooting
- Lost UAT feedback means lost quality insights and potential rework
- Manual SD creation is error-prone and doesn't scale

**User Pain Points:**
- User provides detailed voice feedback; if session ends early, all lost
- Developer doesn't know valid enum values for feedback.source_type or SD.status
- Developer creates SD, validation fails, must trial-and-error to discover constraints
- Converting 10 feedback items to SDs takes 1+ hours manually

**Success Metrics:**
- UAT feedback auto-save rate: 0% → 100%
- SD creation first-attempt success: 20% → 95%
- Feedback-to-SD conversion time: 60min → 5min (for batch of 10)
    `.trim(),

    technical_context: `
**Existing Systems:**
- /uat skill (.claude/skills/uat.md) - executes UAT scenarios
- lib/uat/result-recorder.js - records UAT results to feedback table
- feedback table - stores issues and enhancements
- strategic_directives_v2 table - stores SDs with type-specific requirements
- scripts/handoff.js - validates SD completeness for phase transitions

**Architecture Patterns:**
- Skills are markdown files in .claude/skills/
- Lib modules use ES modules with Supabase client
- NPM scripts defined in package.json
- Database constraints enforce data integrity

**Integration Points:**
- /uat → lib/uat/result-recorder.js → feedback table
- feedback table → new sd:from-feedback script → strategic_directives_v2
- scripts/create-sd.js → strategic_directives_v2 (with validation)
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Auto-save raw UAT feedback to markdown file',
        description: 'After each user response in /uat command, automatically save raw feedback to uat-sessions/<SD>_<date>_raw-feedback.md before any processing',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Running /uat and providing feedback creates markdown file in uat-sessions/',
          'File contains verbatim user input with timestamp',
          'File is created even if processing fails',
          'File path follows pattern: uat-sessions/<sd_key>_<YYYY-MM-DD>_raw-feedback.md'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Document schema constraints for UAT-related tables',
        description: 'Add inline documentation and/or README for valid enum values in feedback and strategic_directives_v2 tables',
        priority: 'HIGH',
        acceptance_criteria: [
          'feedback.source_type valid values documented (uat_failure, manual_feedback)',
          'feedback.type valid values documented (issue, enhancement)',
          'SD.status valid values documented (draft, in_progress, active, pending_approval, completed, deferred, cancelled)',
          'SD.sd_type valid values documented with which fields each requires'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Create SD helper script with type-aware validation',
        description: 'New scripts/create-sd.js that requires sd_type and auto-includes required fields based on validation profile',
        priority: 'HIGH',
        acceptance_criteria: [
          'Script requires --type argument',
          'For bugfix/feature: prompts for smoke_test_steps',
          'For refactor: prompts for intensity_level',
          'Script validates all required fields before insert',
          'Script uses correct SD.id (UUID) generation'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Create feedback-to-SD automation script',
        description: 'New npm run sd:from-feedback script that shows triaged feedback and creates SDs with correct validation profiles',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Script queries feedback table for open items',
          'Script displays items in table format for selection',
          'Script creates SDs with correct sd_type based on feedback.type',
          'Script handles parent_sd_id for orchestrator grouping',
          'Script passes handoff validation on first attempt'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'reliability',
        requirement: 'Raw feedback must be saved before any processing',
        target_metric: '100% save rate even on errors'
      },
      {
        type: 'usability',
        requirement: 'SD creation helper must have clear prompts',
        target_metric: 'Developer can create any SD type with ≤3 prompts'
      },
      {
        type: 'maintainability',
        requirement: 'Schema constraints documented inline',
        target_metric: 'Valid values visible at point of use'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use ES modules for new lib files',
        description: 'All new lib/ files must use ES module syntax (import/export)',
        dependencies: ['Node.js 18+', '@supabase/supabase-js']
      },
      {
        id: 'TR-2',
        requirement: 'NPM script follows existing patterns',
        description: 'sd:from-feedback follows existing sd:* script conventions',
        dependencies: ['package.json scripts section']
      }
    ],

    system_architecture: `
## Architecture Overview

\`\`\`
User ─→ /uat command ─→ result-recorder.js ─→ feedback table
                                │
                                └─→ uat-sessions/*.md (NEW: raw feedback)

feedback table ─→ sd:from-feedback ─→ create-sd.js ─→ strategic_directives_v2
                      (NEW)              (NEW)
\`\`\`

## Components

1. **lib/uat/feedback-saver.js** (NEW)
   - saveRawFeedback(sdKey, rawText) → writes to uat-sessions/
   - Called by /uat skill before processing

2. **scripts/create-sd.js** (NEW)
   - CLI tool with --type, --title, --description args
   - Loads validation profile based on sd_type
   - Prompts for type-specific required fields
   - Generates UUID, validates, inserts

3. **scripts/sd-from-feedback.js** (NEW)
   - Lists open feedback items
   - Interactive selection
   - Calls create-sd.js with correct parameters

4. **lib/uat/README.md** (NEW or UPDATE)
   - Documents all schema constraints
   - Valid enum values with descriptions

## Data Flow

1. User runs /uat SD-XXX-001
2. User provides voice feedback
3. feedback-saver.js writes raw-feedback.md (before processing)
4. result-recorder.js processes and saves to feedback table
5. User runs npm run sd:from-feedback
6. Script shows feedback items, user selects
7. create-sd.js creates SD with correct fields
8. SD passes handoff validation
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'feedback',
          columns: ['id', 'type', 'title', 'priority', 'status', 'source_type', 'sd_id', 'created_at'],
          relationships: ['sd_id → strategic_directives_v2.id']
        },
        {
          name: 'strategic_directives_v2',
          columns: ['id', 'sd_key', 'title', 'sd_type', 'status', 'smoke_test_steps', 'intensity_level', 'rationale'],
          relationships: ['parent_sd_id → strategic_directives_v2.id (self-ref)']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'This SD creates CLI tools and lib modules, no new API endpoints',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'CLI: create-sd.js',
        description: 'Clear prompts with examples, error messages with valid values',
        wireframe: 'N/A (CLI)'
      },
      {
        component: 'CLI: sd-from-feedback.js',
        description: 'Table view of feedback items, arrow-key selection',
        wireframe: 'N/A (CLI)'
      }
    ],

    implementation_approach: `
## Phase 1: Raw Feedback Auto-Save

1. Create lib/uat/feedback-saver.js
   - Function: saveRawFeedback(sdKey, rawText, timestamp)
   - Creates uat-sessions/ dir if not exists
   - Writes <sdKey>_<date>_raw-feedback.md

2. Update /uat skill documentation
   - Add instruction to call feedback-saver before processing
   - Document expected file location

## Phase 2: Schema Documentation

1. Create docs/reference/sd-validation-profiles.md
   - Table: sd_type → required fields
   - List: valid enum values per column

2. Update lib/uat/result-recorder.js
   - Add comments with valid source_type and type values

## Phase 3: SD Creation Helper

1. Create scripts/create-sd.js
   - Parse CLI args (--type, --title, --description, --parent)
   - Load validation profile for sd_type
   - Prompt for missing required fields
   - Generate UUID
   - Validate and insert

2. Add to package.json
   - "sd:create": "node scripts/create-sd.js"

## Phase 4: Feedback-to-SD Automation

1. Create scripts/sd-from-feedback.js
   - Query open feedback items
   - Display in table format
   - Allow selection (single or multi)
   - Map feedback.type to sd_type (issue→bugfix, enhancement→feature)
   - Call create-sd.js for each

2. Add to package.json
   - "sd:from-feedback": "node scripts/sd-from-feedback.js"
    `.trim(),

    technology_stack: [
      'Node.js 18+',
      '@supabase/supabase-js',
      'ES Modules',
      'inquirer (for CLI prompts)',
      'chalk (for CLI colors)',
      'cli-table3 (for table display)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'lib/uat/result-recorder.js',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'feedback table schema',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'strategic_directives_v2 table schema',
        status: 'completed',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Raw feedback auto-save',
        description: 'Run /uat, provide feedback, verify markdown file created',
        expected_result: 'File exists in uat-sessions/ with verbatim content',
        test_type: 'manual'
      },
      {
        id: 'TS-2',
        scenario: 'SD creation helper - bugfix type',
        description: 'Run create-sd.js --type bugfix, verify smoke_test_steps prompted',
        expected_result: 'Script prompts for smoke_test_steps, SD created with field populated',
        test_type: 'manual'
      },
      {
        id: 'TS-3',
        scenario: 'Feedback-to-SD conversion',
        description: 'Create feedback item, run sd:from-feedback, select item',
        expected_result: 'SD created with correct type and passes handoff validation',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'FR-1: Raw feedback auto-saved before processing',
      'FR-2: All schema constraints documented',
      'FR-3: SD creation helper works for all sd_types',
      'FR-4: sd:from-feedback creates valid SDs',
      'All smoke_test_steps from SD executed successfully',
      'No regression in existing /uat functionality'
    ],

    performance_requirements: {
      page_load_time: 'N/A',
      api_response_time: 'N/A',
      cli_response_time: '<2s for feedback save, <5s for SD creation'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Files to create/modify identified', checked: true },
      { text: 'Dependencies verified available', checked: true }
    ],

    exec_checklist: [
      { text: 'lib/uat/feedback-saver.js created', checked: false },
      { text: 'docs/reference/sd-validation-profiles.md created', checked: false },
      { text: 'scripts/create-sd.js created', checked: false },
      { text: 'scripts/sd-from-feedback.js created', checked: false },
      { text: 'package.json scripts added', checked: false },
      { text: 'All smoke tests pass', checked: false },
      { text: 'Documentation updated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Smoke test steps verified', checked: false },
      { text: 'No regressions in /uat command', checked: false },
      { text: 'Code review completed', checked: false }
    ],

    progress: 15,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 15,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'File write permissions in uat-sessions/',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Feedback not saved',
        mitigation: 'Check/create directory on startup, fail fast with clear error'
      },
      {
        category: 'Process',
        risk: '/uat skill modification may require careful testing',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Could break existing UAT workflow',
        mitigation: 'Make feedback-saver optional/additive, test with existing UAT SDs first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use ES modules',
        impact: 'Cannot use require() syntax'
      },
      {
        type: 'scope',
        constraint: 'Infrastructure SD - no E2E tests required',
        impact: 'Manual verification via smoke tests instead'
      }
    ],

    assumptions: [
      {
        assumption: 'uat-sessions/ directory can be created if not exists',
        validation_method: 'Test directory creation on first run'
      },
      {
        assumption: 'inquirer and chalk available or can be added',
        validation_method: 'Check package.json dependencies'
      }
    ],

    stakeholders: [
      {
        name: 'Developer',
        role: 'Primary user of SD creation tools',
        involvement_level: 'high'
      },
      {
        name: 'UAT Tester',
        role: 'Benefits from feedback auto-save',
        involvement_level: 'medium'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days

    metadata: {
      exploration_summary: [
        {
          file_path: 'lib/uat/result-recorder.js',
          purpose: 'Understand existing UAT result recording',
          key_findings: 'Uses recordDefect() to save to feedback table, has source_type/type constraints'
        },
        {
          file_path: '.claude/skills/uat.md',
          purpose: 'Understand /uat command structure',
          key_findings: 'Markdown skill file, can add instructions for feedback-saver call'
        },
        {
          file_path: 'database/migrations/20251228_fix_sd_type_constraint.sql',
          purpose: 'Find valid sd_type values',
          key_findings: 'Valid types: bugfix, database, docs, feature, infrastructure, orchestrator, qa, refactor, security, etc.'
        },
        {
          file_path: 'database/schema/add_cancelled_status.sql',
          purpose: 'Find valid status values',
          key_findings: 'Valid statuses: draft, in_progress, active, pending_approval, completed, deferred, cancelled'
        },
        {
          file_path: 'lib/utils/sd-type-validation.js',
          purpose: 'Understand type-specific validation',
          key_findings: 'Has getValidationRequirements(sd) function mapping sd_type to required fields'
        }
      ],
      affected_files: [
        'lib/uat/feedback-saver.js (NEW)',
        'docs/reference/sd-validation-profiles.md (NEW)',
        'scripts/create-sd.js (NEW)',
        'scripts/sd-from-feedback.js (NEW)',
        'package.json (UPDATE)',
        'lib/uat/result-recorder.js (UPDATE - comments)',
        '.claude/skills/uat.md (UPDATE - feedback-saver instruction)'
      ]
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Validate PRD schema
  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // Check for existing PRD
  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Status: ${existing.status}`);
    console.log('   Deleting and recreating...');

    await supabase.from('product_requirements_v2').delete().eq('id', prdId);
  }

  // Insert PRD
  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    process.exit(1);
  }

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Run PLAN-TO-EXEC handoff');
  console.log('   2. Implement the 4 deliverables');
  console.log('   3. Run smoke tests');
  console.log('   4. Complete LEAD-FINAL-APPROVAL');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  process.exit(1);
});
