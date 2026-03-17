#!/usr/bin/env node

/**
 * PRD Creation Script: SD-LEO-SDKEY-001
 * Centralize SD Creation Through /leo with Unified SDKeyGenerator
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_KEY = 'SD-LEO-SDKEY-001';
const PRD_TITLE = 'Centralize SD Creation Through /leo with Unified SDKeyGenerator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_KEY}`);
  console.log('='.repeat(70));

  // Fetch Strategic Directive - query by sd_key OR id
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority, description, scope')
    .or(`sd_key.eq.${SD_KEY},id.eq.${SD_KEY}`)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_KEY} not found`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   SD Key: ${sdData.sd_key}`);

  const sdUuid = sdData.id;
  const prdId = `PRD-${sdData.sd_key}`;

  console.log('\n2️⃣  Building PRD data...');

  const prdData = {
    id: prdId,
    sd_id: sdUuid,
    directive_id: sdUuid,

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: sdData.category || 'Infrastructure',
    priority: sdData.priority || 'high',

    executive_summary: `
This PRD defines the implementation of a centralized SD (Strategic Directive) creation system through the /leo command. Currently, SD creation is fragmented across 6+ independent scripts, each with different naming conventions, validation rules, and hierarchy handling.

The solution introduces:
1. A unified SDKeyGenerator module that produces consistent, hierarchy-aware SD keys
2. A /leo create subcommand as the single entry point for all SD creation
3. Refactored upstream scripts (UAT, /learn, /inbox, pattern-alert) that prepare context and delegate to the centralized system

This consolidation eliminates naming drift, ensures validation consistency, and properly handles parent-child-grandchild relationships across all SD sources.
    `.trim(),

    business_context: `
## Problem Statement
Six different SD creation paths exist with inconsistent naming:
- UAT: SD-UAT-###
- /learn: SD-LEARN-### or QF-YYYYMMDD-###
- create-sd.js: SD-{TYPE}-{WORDS}-###
- sd-from-feedback.js: SD-{FIX|FEAT}-{WORDS}-###
- pattern-alert: SD-PAT-FIX-{CATEGORY}-###
- child-sd-template.js: {PARENT}-P{N}

## Business Value
- **Reduced cognitive load**: One naming convention to understand
- **Improved traceability**: Source embedded in SD key
- **Better hierarchy visibility**: Parent-child relationships clear from key
- **Maintainability**: One place to update naming logic
    `.trim(),

    technical_context: `
## Current Architecture
- SD creation scattered across scripts/
- Each script has own key generation logic
- child-sd-template.js handles hierarchy but isn't integrated with other sources
- sd-id-normalizer.js exists but isn't used consistently

## Target Architecture
- SDKeyGenerator module as single source of truth
- /leo create command orchestrates creation flow
- Upstream scripts become "preparers" that call centralized creation
- Hierarchy encoding built into key generator
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create SDKeyGenerator module',
        description: 'Implement scripts/modules/sd-key-generator.js with unified naming logic, hierarchy support, and collision detection',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Exports generateSDKey() function accepting source, type, title, parentKey, hierarchyDepth',
          'Produces consistent format: SD-{SOURCE}-{TYPE}-{SEMANTIC}-### for root SDs',
          'Hierarchy suffixes: -A/-B/-C for children, -A1/-A2 for grandchildren',
          'Queries both sd_key and id columns to detect collisions',
          'Sequential numbering per namespace'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Implement /leo create subcommand',
        description: 'Enhance .claude/skills/leo.md with create subcommand supporting interactive and flag-based creation',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '/leo create launches interactive wizard',
          '/leo create --from-uat <id> creates from UAT finding',
          '/leo create --from-learn <id> creates from /learn pattern',
          '/leo create --from-feedback <id> creates from /inbox item',
          '/leo create --child <parent-key> creates child SD with proper hierarchy'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Refactor upstream SD creation scripts',
        description: 'Modify 6 scripts to use SDKeyGenerator instead of direct DB inserts',
        priority: 'HIGH',
        acceptance_criteria: [
          'uat-to-strategic-directive-ai.js uses SDKeyGenerator',
          'modules/learning/executor.js uses SDKeyGenerator',
          'sd-from-feedback.js uses SDKeyGenerator',
          'pattern-alert-sd-creator.js uses SDKeyGenerator',
          'create-sd.js uses SDKeyGenerator',
          'child-sd-template.js integrates with SDKeyGenerator'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Support 4-level hierarchy depth',
        description: 'Key generator must handle parent → child → grandchild → great-grandchild',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Depth 0 (root): SD-{SOURCE}-{TYPE}-{SEMANTIC}-###',
          'Depth 1 (child): {PARENT}-A, {PARENT}-B, etc.',
          'Depth 2 (grandchild): {PARENT}-A1, {PARENT}-A2, etc.',
          'Depth 3 (great-grandchild): {PARENT}-A1.1, {PARENT}-A1.2, etc.'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'backward_compatibility',
        requirement: 'Existing SDs remain valid',
        target_metric: '100% of existing SD keys continue to work'
      },
      {
        type: 'performance',
        requirement: 'Key generation completes quickly',
        target_metric: '<100ms for key generation including collision check'
      },
      {
        type: 'maintainability',
        requirement: 'Single source of truth for naming',
        target_metric: '1 module contains all key generation logic'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Module exports ESM-compatible',
        description: 'SDKeyGenerator must work with both ESM and CJS imports',
        dependencies: []
      },
      {
        id: 'TR-2',
        requirement: 'Supabase integration',
        description: 'Module queries strategic_directives_v2 for collision detection',
        dependencies: ['@supabase/supabase-js']
      }
    ],

    system_architecture: `
## Component Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                     /leo create                              │
│                   (Entry Point)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Interactive │  │ --from-uat  │  │ --from-learn│
│   Wizard    │  │ --from-fdbk │  │ --child     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │       SDKeyGenerator         │
         │  scripts/modules/sd-key-     │
         │       generator.js           │
         │                              │
         │  • generateSDKey()           │
         │  • validateKeyUnique()       │
         │  • getHierarchySuffix()      │
         └──────────────┬───────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │   strategic_directives_v2    │
         │        (Database)            │
         └──────────────────────────────┘
\`\`\`

## Data Flow

1. User invokes /leo create (or upstream source prepares context)
2. Context collected: source, type, title, parentKey (optional)
3. SDKeyGenerator.generateSDKey() called
4. Collision check against sd_key and id columns
5. Sequential number assigned per namespace
6. SD inserted with generated key
7. Handoff workflow initiated
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: ['id (UUID)', 'sd_key (TEXT)', 'parent_sd_id (UUID)', 'title', 'status'],
          relationships: ['parent_sd_id → strategic_directives_v2.id']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    implementation_approach: `
## Phase 1: SDKeyGenerator Module (Core)
- Create scripts/modules/sd-key-generator.js
- Implement generateSDKey() with all parameters
- Add collision detection logic
- Add hierarchy suffix generation
- Write unit tests

## Phase 2: /leo create Command
- Enhance .claude/skills/leo.md
- Add interactive wizard flow
- Add flag-based creation (--from-uat, --from-learn, --from-feedback, --child)
- Connect to SDKeyGenerator

## Phase 3: Upstream Refactoring
- Refactor uat-to-strategic-directive-ai.js
- Refactor modules/learning/executor.js
- Refactor sd-from-feedback.js
- Refactor pattern-alert-sd-creator.js
- Refactor create-sd.js
- Integrate child-sd-template.js
    `.trim(),

    technology_stack: [
      'Node.js',
      'ES Modules',
      'Supabase PostgreSQL',
      'Claude Code Skills (.claude/skills/)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'sd-id-normalizer.js',
        description: 'Existing module for resolving sd_key ↔ UUID'
      },
      {
        type: 'internal',
        name: 'child-sd-template.js',
        description: 'Existing hierarchy logic to integrate'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        name: 'Root SD creation',
        description: 'Create root SD via /leo create',
        steps: ['Invoke /leo create', 'Select source: manual', 'Enter type: fix', 'Enter title: Test Fix'],
        expected_result: 'SD created with key SD-MANUAL-FIX-TEST-001'
      },
      {
        id: 'TS-2',
        name: 'Child SD creation',
        description: 'Create child SD via /leo create --child',
        steps: ['Invoke /leo create --child SD-MANUAL-FIX-TEST-001', 'Enter child details'],
        expected_result: 'Child SD created with key SD-MANUAL-FIX-TEST-001-A'
      },
      {
        id: 'TS-3',
        name: 'UAT-sourced SD',
        description: 'Create SD from UAT finding',
        steps: ['Run /uat', 'At end, choose create SD', 'Verify key format'],
        expected_result: 'SD created with key SD-UAT-FIX-{SEMANTIC}-###'
      }
    ],

    acceptance_criteria: [
      'SDKeyGenerator module exists and exports generateSDKey()',
      '/leo create command functional with all flags',
      'All 6 upstream scripts refactored to use SDKeyGenerator',
      'Hierarchy works to 4 levels deep',
      'No existing SD keys broken',
      'Unit tests pass for SDKeyGenerator'
    ],

    metadata: {
      success_metrics: [
        { metric: 'Creation paths consolidated', target: '6 → 1', actual: null },
        { metric: 'Naming compliance', target: '100%', actual: null },
        { metric: 'Hierarchy depth', target: '4 levels', actual: null }
      ],
      risks_and_mitigations: [
        {
          risk: 'Breaking existing SD references',
          probability: 'Medium',
          impact: 'High',
          mitigation: 'Backward compatibility - new convention for new SDs only'
        },
        {
          risk: 'Complex refactoring across 6+ files',
          probability: 'High',
          impact: 'Medium',
          mitigation: 'Phased rollout, one script at a time'
        }
      ],
      out_of_scope: [
        'Migrating existing SD keys to new format',
        'Changing the strategic_directives_v2 schema',
        'Modifying SD display in UI dashboards'
      ],
      timeline: {
        start_date: new Date().toISOString().split('T')[0],
        phases: [
          { phase: 'Phase 1: SDKeyGenerator', duration: 'Session 1' },
          { phase: 'Phase 2: /leo create', duration: 'Session 1-2' },
          { phase: 'Phase 3: Refactoring', duration: 'Session 2-3' }
        ]
      },
      stakeholders: [
        { role: 'Developer', name: 'Claude', responsibility: 'Implementation' },
        { role: 'Product Owner', name: 'Rick', responsibility: 'Requirements & Approval' }
      ]
    },

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Check for existing PRD
  console.log('\n3️⃣  Checking for existing PRD...');
  const { data: existingPrd } = await supabase
    .from('prds')
    .select('id')
    .eq('id', prdId)
    .single();

  if (existingPrd) {
    console.log(`⚠️  PRD ${prdId} already exists. Updating...`);
    const { error: updateError } = await supabase
      .from('prds')
      .update(prdData)
      .eq('id', prdId);

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      process.exit(1);
    }
    console.log('✅ PRD updated successfully');
  } else {
    console.log('   Creating new PRD...');
    const { error: insertError } = await supabase
      .from('prds')
      .insert(prdData);

    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      process.exit(1);
    }
    console.log('✅ PRD created successfully');
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ PRD CREATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${prdId}`);
  console.log(`   SD Key: ${sdData.sd_key}`);
  console.log('   Status: planning');
  console.log('\n📋 Next Steps:');
  console.log('   1. Run PLAN-TO-EXEC handoff:');
  console.log(`      node scripts/handoff.js execute PLAN-TO-EXEC ${sdData.sd_key}`);
}

createPRD().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
