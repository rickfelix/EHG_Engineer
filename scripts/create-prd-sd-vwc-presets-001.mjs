#!/usr/bin/env node

/**
 * PRD Creation Script for SD-VWC-PRESETS-001
 * Venture Creation: Preset Selector Component
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_ID = 'SD-VWC-PRESETS-001';
const PRD_TITLE = 'Venture Creation: Preset Selector Component - Technical Implementation';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch Strategic Directive
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);

  // Build PRD Data
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,
    sd_id: SD_ID,

    // Core Metadata
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'User Experience',
    priority: 'medium',

    // Executive & Context
    executive_summary: `
Implement a PresetSelector component that allows power users to save and reuse venture configuration templates. Users can create presets for frequently-used tier/ideation combinations, reducing venture creation time from 2-3 minutes to <30 seconds.

**Scope**: ~220 LOC implementation covering PresetSelector UI component, preset management service, local storage persistence, and preset CRUD operations.

**Impact**: 40% time savings for power users creating multiple ventures with similar configurations. Improves power user experience and reduces friction in repetitive workflows.
    `.trim(),

    business_context: `
**User Pain Points:**
- Power users repeatedly configure the same tier/ideation combinations
- Venture creation takes 2-3 minutes even for familiar configurations
- No way to save or share common venture templates
- Context switching between documentation and wizard

**Business Objectives:**
- Reduce venture creation time by 60% for power users (2-3 min → <30 sec)
- Increase venture creation frequency by 25%
- Improve power user satisfaction (NPS +15 points)
- Enable team-wide best practices through preset sharing

**Success Metrics:**
- 40% of ventures created using presets within 30 days
- Average preset load time <500ms
- 5+ presets created per active power user
- 80%+ power user adoption rate
    `.trim(),

    technical_context: `
**Existing Systems:**
- VentureWizard multi-step form (src/components/ventures/VentureWizard.tsx)
- Wizard step components (Tier0Selection, IdeationMethodSelector, etc.)
- Shadcn/UI components (Select, Button, Dialog, Card)
- React Hook Form for form state management

**Architecture Patterns:**
- Component composition pattern for wizard steps
- Local storage for preset persistence
- React hooks for state management
- TypeScript for type safety

**Integration Points:**
- VentureWizard form state
- TierService (tier configuration)
- IdeationMethodService (ideation settings)
- Local storage API (preset persistence)
    `.trim(),

    // Requirements
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'PresetSelector Component',
        description: 'Dropdown component to select and load saved presets',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Dropdown displays list of saved presets',
          'Selecting preset loads tier and ideation configuration',
          'Empty state message when no presets exist',
          'Preset name and description visible in dropdown'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Preset Creation',
        description: 'Allow users to save current configuration as preset',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '"Save as Preset" button visible in wizard',
          'Modal dialog for preset name and description',
          'Validation: name required, max 50 chars',
          'Success toast after preset saved'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Preset Management',
        description: 'Edit and delete existing presets',
        priority: 'HIGH',
        acceptance_criteria: [
          'Edit preset: update name/description',
          'Delete preset: with confirmation dialog',
          'List view showing all presets',
          'Last used timestamp displayed'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Preset Data Model',
        description: 'Define preset structure with tier and ideation config',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Preset stores tier selection (tier0, tier1, tier2)',
          'Preset stores ideation method and settings',
          'Preset includes metadata (name, description, created_at)',
          'TypeScript interface exported for preset type'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Preset loading must be instantaneous',
        target_metric: '<500ms from selection to form population'
      },
      {
        type: 'usability',
        requirement: 'Preset workflow must be discoverable',
        target_metric: '80% of power users find feature without documentation'
      },
      {
        type: 'data_persistence',
        requirement: 'Presets must persist across sessions',
        target_metric: 'Local storage with fallback handling'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PresetSelector UI Component',
        description: 'React component with Shadcn/UI Select component',
        dependencies: ['Shadcn UI Select', 'React Hook Form', 'TypeScript']
      },
      {
        id: 'TR-2',
        requirement: 'Preset Service Layer',
        description: 'Service for CRUD operations on presets',
        dependencies: ['Local Storage API', 'TypeScript']
      },
      {
        id: 'TR-3',
        requirement: 'VentureWizard Integration',
        description: 'Add PresetSelector to wizard step 1',
        dependencies: ['VentureWizard component', 'React Hook Form']
      }
    ],

    // Architecture
    system_architecture: `
## Architecture Overview
PresetSelector Component
   ↓
PresetService (CRUD operations)
   ↓
Local Storage API (persistence)
   ↓
VentureWizard Form State

## Data Flow
1. User opens venture creation wizard
2. PresetSelector displays saved presets
3. User selects preset
4. PresetService loads preset data
5. VentureWizard form auto-fills with preset values
6. User continues wizard with pre-populated fields

## Component Hierarchy
VentureWizard
  └─ Step1: TierSelection
      ├─ PresetSelector (NEW)
      │   ├─ PresetDropdown
      │   ├─ CreatePresetButton
      │   └─ ManagePresetsDialog
      └─ Tier0Selection (existing)

## Integration Points
- VentureWizard setValue() method (React Hook Form)
- TierService for tier configuration
- IdeationMethodService for ideation settings
- Local storage for preset persistence
    `.trim(),

    data_model: {
      description: 'Preset data stored in browser local storage',
      entities: [
        {
          name: 'VenturePreset',
          description: 'Saved venture configuration template',
          fields: [
            { name: 'id', type: 'string', required: true, description: 'UUID' },
            { name: 'name', type: 'string', required: true, description: 'Preset name (max 50 chars)' },
            { name: 'description', type: 'string', required: false, description: 'Optional description' },
            { name: 'tier', type: 'string', required: true, description: 'Selected tier (tier0/tier1/tier2)' },
            { name: 'ideation_method', type: 'string', required: true, description: 'Ideation method key' },
            { name: 'ideation_config', type: 'object', required: false, description: 'Method-specific settings' },
            { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
            { name: 'last_used_at', type: 'timestamp', required: false, description: 'Last used timestamp' }
          ]
        }
      ]
    },

    api_specifications: [], // No backend API needed (local storage only)

    ui_ux_requirements: [
      {
        component: 'PresetSelector',
        description: 'Dropdown selector placed at top of wizard Step 1. Shows list of presets with name and description. Includes "Manage Presets" button.',
        wireframe: 'Shadcn Select component with preset list'
      },
      {
        component: 'CreatePresetDialog',
        description: 'Modal dialog triggered by "Save as Preset" button. Contains name input (required), description textarea (optional), save/cancel buttons.',
        wireframe: 'Shadcn Dialog with form inputs'
      },
      {
        component: 'ManagePresetsDialog',
        description: 'Modal dialog showing all presets in table format. Actions: edit, delete. Shows last used timestamp.',
        wireframe: 'Shadcn Dialog with Table component'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Core Service (1 hour)
- Create src/services/presetService.ts
- Implement CRUD operations (create, read, update, delete)
- Add local storage persistence
- Define VenturePreset TypeScript interface

## Phase 2: UI Components (2 hours)
- Create PresetSelector dropdown component
- Create CreatePresetDialog modal
- Create ManagePresetsDialog modal
- Integrate with VentureWizard form state

## Phase 3: Integration (0.5 hours)
- Add PresetSelector to VentureWizard Step 1
- Wire up form setValue() for preset loading
- Test preset load/save flows

## Phase 4: Testing (0.5 hours)
- Unit tests for presetService
- E2E tests for preset workflows
- Manual verification across browsers
    `.trim(),

    technology_stack: [
      'TypeScript 5',
      'React 18',
      'Shadcn UI (Select, Dialog, Button, Table)',
      'React Hook Form',
      'Local Storage API',
      'Vitest (unit tests)',
      'Playwright (E2E tests)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'VentureWizard component',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Shadcn UI components',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'React Hook Form',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Create Preset',
        description: 'User saves current configuration as preset',
        expected_result: 'Preset created with name, tier, and ideation settings. Success toast displayed.',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Load Preset',
        description: 'User selects preset from dropdown',
        expected_result: 'Form auto-fills with preset tier and ideation configuration',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Edit Preset',
        description: 'User edits preset name/description',
        expected_result: 'Preset updated in local storage, changes reflected in dropdown',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Delete Preset',
        description: 'User deletes preset with confirmation',
        expected_result: 'Preset removed from storage, no longer appears in list',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'Empty State',
        description: 'No presets exist',
        expected_result: 'Empty state message displayed with "Create Preset" prompt',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'Local Storage Persistence',
        description: 'Presets persist across browser sessions',
        expected_result: 'Presets available after page reload',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'PresetSelector component integrated into VentureWizard Step 1',
      'Users can create presets with name and description',
      'Users can load presets to auto-fill form',
      'Users can edit existing presets',
      'Users can delete presets with confirmation',
      'Presets persist in local storage across sessions',
      'Unit tests passing (100% coverage for presetService)',
      'E2E tests passing (all preset workflows verified)',
      'Empty state handled gracefully',
      'Form auto-fills correctly when preset loaded'
    ],

    performance_requirements: {
      preset_load_time: '<500ms',
      preset_save_time: '<100ms',
      dropdown_render_time: '<200ms',
      storage_quota: '<50KB for 20 presets'
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Integration points verified', checked: true }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'PresetService implemented', checked: false },
      { text: 'UI components created', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Preset workflows verified in all scenarios', checked: false },
      { text: 'Local storage tested across browsers', checked: false },
      { text: 'User feedback collected (power users)', checked: false }
    ],

    // Progress
    progress: 10,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks
    risks: [
      {
        category: 'Technical',
        risk: 'Local storage quota exceeded',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Presets cannot be saved after quota limit',
        mitigation: 'Implement preset limit (max 20 presets). Add cleanup for old unused presets.'
      },
      {
        category: 'Implementation',
        risk: 'Browser compatibility issues',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Presets not available in some browsers',
        mitigation: 'Fallback to in-memory storage. Test across Chrome, Firefox, Safari, Edge.'
      },
      {
        category: 'UX',
        risk: 'Feature discoverability',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Power users don\'t find/use preset feature',
        mitigation: 'Prominent placement in wizard. Tooltip on first visit. In-app announcement.'
      }
    ],

    constraints: [
      {
        type: 'Technical',
        description: 'Must use local storage (no backend API for Phase 1)',
        workaround: null
      },
      {
        type: 'Scope',
        description: 'Limited to 220 LOC implementation',
        workaround: 'Focus on core CRUD operations. Defer advanced features (export, sharing) to future SD.'
      },
      {
        type: 'UX',
        description: 'Must integrate seamlessly with existing wizard',
        workaround: 'Use Shadcn UI components matching wizard design system.'
      }
    ],

    // Metadata for additional info
    metadata: {
      estimated_loc: 220,
      estimated_hours: 4,
      deliverables: [
        'presetService.ts (80 LOC)',
        'PresetSelector.tsx (60 LOC)',
        'CreatePresetDialog.tsx (40 LOC)',
        'ManagePresetsDialog.tsx (40 LOC)',
        'Unit Tests (60 LOC)',
        'E2E Tests (80 LOC)'
      ]
    }
  };

  // Insert PRD
  console.log('\n3️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      console.log('⏭️  PRD already exists, updating...');

      const { data: updatedPRD, error: updateError } = await supabase
        .from('product_requirements_v2')
        .update(prdData)
        .eq('id', prdId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error updating PRD:', updateError.message);
        console.error('   Details:', updateError);
        process.exit(1);
      }

      console.log('✅ PRD updated successfully');
    } else {
      console.error('\n❌ Error inserting PRD:', insertError.message);
      console.error('   Details:', insertError);
      process.exit(1);
    }
  } else {
    console.log('✅ PRD created successfully');
    console.log(`   ID: ${insertedPRD.id}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ PRD Creation Complete');
  console.log(`   PRD ID: ${prdId}`);
  console.log(`   Status: ${prdData.status}`);
  console.log(`   Progress: ${prdData.progress}%`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Create user stories for SD-VWC-PRESETS-001');
  console.log('   2. Execute PLAN→EXEC handoff');
  console.log('   3. Begin implementation');
}

createPRD().catch(console.error);
