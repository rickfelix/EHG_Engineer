#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-DOC-EXCELLENCE-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-DOC-EXCELLENCE-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Documentation Excellence Initiative - Comprehensive Cleanup & Gap Resolution'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'documentation',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
Comprehensive documentation improvement initiative to address organizational debt identified by 3 DOCMON sub-agents. Current documentation health score has regressed from 75/100 to 65/100, with critical issues in version consistency, directory organization, and discoverability.

This SD will execute a 3-phase improvement plan: (1) Critical fixes including version consistency and database-first compliance, (2) Organization including root-level cleanup and index creation, and (3) Gap resolution including missing guides and catalogs.

Target outcomes: Documentation health score 85+/100, new developer navigation time <5 minutes (currently 15-20 min), 100% version consistency with LEO Protocol v4.3.3, and complete database-first compliance.
    `.trim(),

    business_context: `
Developer Experience Impact:
- New developers currently take 15-20 minutes to find relevant documentation (target: <5 min)
- Version inconsistency causes confusion (v4.3.3 vs v4.0, v4.1, v4.2, v3.x references)
- 53 root-level files make navigation difficult (target: ≤10)
- 57 subdirectories with poor organization (target: ≤20)

Business Objectives:
- Reduce onboarding friction for new developers
- Ensure all documentation follows database-first principles
- Create discoverable, well-indexed documentation structure
- Establish automated documentation health monitoring
    `.trim(),

    technical_context: `
Current State (from DOCMON audit):
- 1,778 markdown files audited
- Documentation health score: 65/100 (regressed from 75)
- Version inconsistencies across 6+ files
- File-based SDs/PRDs/handoffs directories violating database-first principle
- ~10% broken cross-references
- Missing navigation indexes for 60+ guides and 70+ references

Source Documents:
- docs/DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md
- docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md
- docs/DOCUMENTATION_IMPROVEMENT_SUMMARY.md
- docs/DOCUMENTATION_MAP.md
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Fix version inconsistency across all documentation',
        description: 'Update all documentation to reference LEO Protocol v4.3.3 consistently. Remove references to v3.x, v4.0, v4.1, v4.2.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'grep -r "v4.[0-2]" docs/ returns 0 results',
          'All CLAUDE*.md files reference v4.3.3',
          'Protocol guides reference v4.3.3'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Enforce database-first compliance',
        description: 'Verify strategic data exists in database and remove file-based SDs/PRDs/handoffs directories.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'No docs/strategic-directives/ directory',
          'No docs/product-requirements/ directory',
          'No docs/handoffs/ directory',
          'All strategic data accessible via database queries'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Reduce root-level documentation clutter',
        description: 'Move 43+ root-level markdown files to appropriate subdirectories.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Root-level files ≤10',
          'All moved files have updated cross-references'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Create comprehensive navigation indexes',
        description: 'Create README.md indexes for guides and reference directories.',
        priority: 'HIGH',
        acceptance_criteria: [
          'docs/guides/README.md exists with categorized index',
          'docs/reference/README.md exists with categorized index',
          '60+ guides properly categorized',
          '70+ references properly categorized'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Consolidate duplicate directories',
        description: 'Merge duplicate directories (architecture/, testing/) and reduce total from 57 to ≤20.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Subdirectory count ≤20',
          'No duplicate directory structures',
          'All directories have README.md'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Fix broken cross-references',
        description: 'Identify and fix all broken internal markdown links.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'markdown-link-check passes with 0 errors',
          'All internal links resolve correctly'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'usability',
        requirement: 'New developer navigation time',
        target_metric: '<5 minutes to find relevant documentation'
      },
      {
        type: 'maintainability',
        requirement: 'Documentation health score',
        target_metric: '≥85/100 on documentation audit'
      },
      {
        type: 'consistency',
        requirement: 'Version uniformity',
        target_metric: '100% v4.3.3 references'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Markdown file organization',
        description: 'Follow established directory structure from DOCUMENTATION_STRUCTURE_ASSESSMENT.md',
        dependencies: ['Git for version control', 'markdown-link-check for validation']
      },
      {
        id: 'TR-2',
        requirement: 'Database-first verification',
        description: 'Use Supabase queries to verify all SDs/PRDs exist in database before removing file copies',
        dependencies: ['Supabase client', 'strategic_directives_v2 table', 'product_requirements_v2 table']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Documentation Architecture

### Directory Structure (Target)
- /docs/
  - 01_architecture/ - System architecture documentation
  - 02_api/ - API documentation
  - 03_protocols_and_standards/ - LEO Protocol and standards
  - 04_operations/ - Operational guides
  - 05_testing/ - Testing documentation
  - guides/ - How-to guides with README.md index
  - reference/ - Reference documentation with README.md index
  - archive/ - Deprecated documentation

### Navigation Model
- Role-based entry points (FOR_NEW_DEVELOPERS.md, FOR_LEO_USERS.md, FOR_OPERATIONS.md)
- Category-based indexes in each major directory
- Cross-reference validation via markdown-link-check

### Source of Truth
- Strategic Directives: strategic_directives_v2 table (NOT markdown files)
- PRDs: product_requirements_v2 table (NOT markdown files)
- Handoffs: sd_phase_handoffs table (NOT markdown files)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'No database changes - documentation only SD',
          columns: [],
          relationships: []
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    // Implementation
    implementation_approach: `
## Phase 1: Critical Fixes (4-6 hours)
1. Version Consistency
   - Find all v4.[0-2] and v3.x references
   - Update to v4.3.3
   - Verify with grep validation
2. Database-First Compliance
   - Query database for existing SDs/PRDs
   - Backup file directories
   - Remove file-based directories
3. Core Documentation Updates
   - Update dates in README files
   - Refresh core navigation files

## Phase 2: Organization (6-8 hours)
1. Root Cleanup
   - Categorize 43+ root files
   - Move to appropriate subdirectories
   - Update all cross-references
2. Index Creation
   - Create docs/guides/README.md
   - Create docs/reference/README.md
   - Categorize all guides and references
3. Directory Consolidation
   - Merge duplicate directories
   - Add READMEs to 11+ directories

## Phase 3: Gap Resolution (6-8 hours)
1. Link Validation
   - Run markdown-link-check
   - Fix all broken links
2. Entry Points
   - Create role-based entry files
   - Test navigation paths
3. Final Validation
   - Run DOCMON sub-agent
   - Verify health score ≥85
   - Generate retrospective
    `.trim(),

    technology_stack: [
      'Markdown',
      'Git',
      'markdown-link-check',
      'Supabase (verification only)',
      'DOCMON sub-agent'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Version consistency validation',
        description: 'Verify no outdated version references exist',
        expected_result: 'grep -r "v4.[0-2]" docs/ returns 0 results',
        test_type: 'validation'
      },
      {
        id: 'TS-2',
        scenario: 'Root-level file count',
        description: 'Verify root-level markdown files are reduced',
        expected_result: 'find docs -maxdepth 1 -name "*.md" | wc -l returns ≤10',
        test_type: 'validation'
      },
      {
        id: 'TS-3',
        scenario: 'Subdirectory count',
        description: 'Verify directories are consolidated',
        expected_result: 'Total subdirectories ≤20',
        test_type: 'validation'
      },
      {
        id: 'TS-4',
        scenario: 'Broken link check',
        description: 'Verify all internal links resolve',
        expected_result: 'markdown-link-check passes with 0 errors',
        test_type: 'validation'
      },
      {
        id: 'TS-5',
        scenario: 'DOCMON health score',
        description: 'Run DOCMON sub-agent validation',
        expected_result: 'Documentation health score ≥85/100',
        test_type: 'validation'
      }
    ],

    acceptance_criteria: [
      'Documentation health score ≥85/100',
      'New developer navigation time <5 minutes',
      '100% version consistency (all docs reference v4.3.3)',
      '100% database-first compliance',
      'Root-level files ≤10',
      'Subdirectories ≤20',
      'All directories have README.md',
      'Zero broken cross-references',
      'Guides index created and complete',
      'References index created and complete',
      'DOCMON sub-agent validation passed',
      'Retrospective generated with lessons learned'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Documentation audit reviewed', checked: true },
      { text: 'Directory structure plan defined', checked: true },
      { text: 'Implementation phases documented', checked: true },
      { text: 'Validation scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'DOCMON validation approach defined', checked: true }
    ],

    exec_checklist: [
      { text: 'Phase 1: Version consistency fixed', checked: false },
      { text: 'Phase 1: Database-first compliance verified', checked: false },
      { text: 'Phase 1: Core documentation dates updated', checked: false },
      { text: 'Phase 2: Root-level files reorganized', checked: false },
      { text: 'Phase 2: Guides index created', checked: false },
      { text: 'Phase 2: Reference index created', checked: false },
      { text: 'Phase 2: Directories consolidated', checked: false },
      { text: 'Phase 3: Broken links fixed', checked: false },
      { text: 'Phase 3: Entry points created', checked: false },
      { text: 'Phase 3: DOCMON validation passed', checked: false }
    ],

    validation_checklist: [
      { text: 'Documentation health score ≥85/100', checked: false },
      { text: 'Version consistency 100%', checked: false },
      { text: 'Root-level files ≤10', checked: false },
      { text: 'Subdirectories ≤20', checked: false },
      { text: 'Zero broken cross-references', checked: false },
      { text: 'Retrospective generated', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Data Loss',
        risk: 'Removing file-based directories before verifying database content',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Loss of strategic directive or PRD data',
        mitigation: 'Query database to verify all content exists before removing any directories'
      },
      {
        category: 'Broken References',
        risk: 'Moving files without updating cross-references',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Broken internal links affecting navigation',
        mitigation: 'Update references in same commit as file moves'
      },
      {
        category: 'Context Overflow',
        risk: 'Large scope causing context overflow during execution',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Session interruption requiring restart',
        mitigation: 'Work in focused sessions per phase. Use DOCMON sub-agent for validation'
      }
    ],

    constraints: [
      {
        type: 'scope',
        constraint: 'Documentation changes only - no code modifications',
        impact: 'Cannot fix any code issues discovered during cleanup'
      },
      {
        type: 'database-first',
        constraint: 'Must verify database content before removing file-based directories',
        impact: 'Additional verification step required before cleanup'
      }
    ],

    assumptions: [
      {
        assumption: 'All strategic data has been migrated to database',
        validation_method: 'Query strategic_directives_v2 and product_requirements_v2 tables'
      },
      {
        assumption: 'DOCMON sub-agent is available for validation',
        validation_method: 'Run node lib/sub-agent-executor.js DOCMON --help'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
