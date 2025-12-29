#!/usr/bin/env node
/**
 * Add User Stories for SD-VENTURE-STAGE0-UI-001
 * Stage 0 Inception & 25-Stage Ventures UI Integration
 *
 * Creates user stories based on design requirements:
 * - US-001: Create venture via Manual Entry path (Stage 0)
 * - US-002: Create venture via Competitor Clone path (Stage 0)
 * - US-003: Create venture via Blueprint Browse path (Stage 0)
 * - US-004: Filter ventures by Stage 0 (INCEPTION phase)
 * - US-005: Display dynamic stage labels from database
 * - US-006: Filter ventures by phase (INCEPTION, Foundation, etc.)
 * - US-007: Promote venture from Stage 0 to Stage 1
 *
 * INVEST Criteria Compliance:
 * - Independent: Each story can be developed separately
 * - Negotiable: Implementation details flexible
 * - Valuable: Clear user benefit for each story
 * - Estimable: 3-8 story points per story
 * - Small: Each story completable in 1-2 days
 * - Testable: Given-When-Then acceptance criteria with E2E tests
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-VENTURE-STAGE0-UI-001';
// const PRD_ID = 'PRD-SD-VENTURE-STAGE0-UI-001'; // Removed - PRD not created yet

// User stories following INVEST criteria with Given-When-Then acceptance criteria
// story_key format: {SD-ID}:US-XXX (required by valid_story_key constraint)
const userStories = [
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-001',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Create Venture via Manual Entry (Stage 0 - INCEPTION)',
    user_role: 'Venture Creator',
    user_want: 'Create a new venture from scratch using manual entry, starting at Stage 0 (INCEPTION)',
    user_benefit: 'Can quickly capture venture ideas as they come to me, without needing existing competitors or blueprints',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Create venture manually',
        given: 'User is on the Ventures page AND user is authenticated',
        when: 'User clicks "Create Venture" button AND selects "Manual Entry" path AND fills required fields (name, description, category) AND clicks "Submit"',
        then: 'Venture is created in database with stage_id = 0 (INCEPTION) AND user sees success message "Venture created in Stage 0: INCEPTION" AND venture appears in ventures grid with Stage 0 badge'
      },
      {
        id: 'AC-001-2',
        scenario: 'Validation - Required fields',
        given: 'User is on Manual Entry form',
        when: 'User leaves venture name empty AND clicks "Submit"',
        then: 'Form shows validation error "Venture name is required" AND venture NOT created AND user stays on form'
      },
      {
        id: 'AC-001-3',
        scenario: 'Stage 0 assignment - Automatic',
        given: 'User creates venture via Manual Entry',
        when: 'Venture is saved to database',
        then: 'Venture record has stage_id = 0 AND stage_name = "INCEPTION" AND phase = "INCEPTION"'
      },
      {
        id: 'AC-001-4',
        scenario: 'UI feedback - Stage badge display',
        given: 'Venture is created successfully',
        when: 'User views ventures grid',
        then: 'Venture shows Stage 0 badge with "INCEPTION" label AND badge has distinctive styling (e.g., blue color for inception phase)'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-001-manual-entry-stage0.spec.ts',
      'Test covers happy path (successful manual creation)',
      'Test covers validation errors (required fields)',
      'Test verifies stage_id = 0 assignment',
      'Test validates Stage 0 badge display in UI',
      'Manual Entry path integrated into CreateVentureDialog',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Manual Entry is the simplest creation path - no external data needed. Should default to stage_id = 0. Edge cases: Very long venture names (>200 chars), special characters in name/description, duplicate venture names, creating venture while offline (should queue), rapid successive creations (race conditions).',
    implementation_approach: 'Add "Manual Entry" option to CreateVentureDialog. On submit, call API with stage_id = 0. Update VenturesManager to display Stage 0 ventures.',
    implementation_context: 'This is the first of three creation paths. Manual Entry is the baseline - other paths (Competitor Clone, Blueprint Browse) will build on this pattern.',
    architecture_references: [
      'src/components/ventures/CreateVentureDialog.tsx - Existing dialog to extend',
      'src/components/ventures/VenturesManager.tsx - Grid display component',
      'src/components/ventures/VentureStageDisplay.tsx - NEW component for stage badges',
      'src/hooks/useVentures.ts - Data fetching hook',
      'src/lib/supabase.ts - Database client',
      'Database: ventures table (stage_id column)',
      'Database: venture_lifecycle_stages table (stage 0 definition)'
    ],
    example_code_patterns: {
      manual_entry_form: `
const handleManualEntry = async (formData) => {
  const { data, error } = await supabase
    .from('ventures')
    .insert({
      name: formData.name,
      description: formData.description,
      category: formData.category,
      stage_id: 0, // INCEPTION
      created_by: user.id
    })
    .select()
    .single();

  if (error) {
    toast.error('Failed to create venture: ' + error.message);
    return;
  }

  toast.success('Venture created in Stage 0: INCEPTION');
  onSuccess(data);
};`,
      stage_badge_component: `
// VentureStageDisplay.tsx
export const VentureStageDisplay = ({ stageId, stageName, phase }) => {
  const phaseColors = {
    'INCEPTION': 'bg-blue-100 text-blue-800',
    'Foundation': 'bg-green-100 text-green-800',
    // ... other phases
  };

  return (
    <Badge className={\`\${phaseColors[phase]} font-medium\`}>
      Stage {stageId}: {stageName}
    </Badge>
  );
};`
    },
    testing_scenarios: [
      { scenario: 'Create venture with all required fields', type: 'e2e', priority: 'P0' },
      { scenario: 'Validation error on missing venture name', type: 'e2e', priority: 'P1' },
      { scenario: 'Stage 0 badge displays correctly in grid', type: 'e2e', priority: 'P1' },
      { scenario: 'Duplicate venture name handling', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-002',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Create Venture via Competitor Clone (Stage 0 - INCEPTION)',
    user_role: 'Venture Creator',
    user_want: 'Create a new venture by cloning an existing competitor venture, starting at Stage 0',
    user_benefit: 'Can quickly replicate successful venture patterns and adapt them to my own ideas',
    priority: 'high',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Clone competitor venture',
        given: 'User is on Ventures page AND at least one venture exists to clone',
        when: 'User clicks "Create Venture" AND selects "Competitor Clone" AND selects source venture AND modifies name AND clicks "Submit"',
        then: 'New venture is created with stage_id = 0 AND venture inherits description, category, tags from source AND user sees success message AND new venture appears in grid'
      },
      {
        id: 'AC-002-2',
        scenario: 'Validation - Name must be unique',
        given: 'User is cloning a venture',
        when: 'User keeps the same name as source venture AND clicks "Submit"',
        then: 'Form shows validation error "Venture name must be unique" AND venture NOT created'
      },
      {
        id: 'AC-002-3',
        scenario: 'Data inheritance - Selective copying',
        given: 'User clones a venture from Stage 5 (Market Validation)',
        when: 'Clone is created',
        then: 'New venture has stage_id = 0 (not Stage 5) AND inherits: description, category, tags BUT NOT: stage, financials, metrics, tasks, notes'
      },
      {
        id: 'AC-002-4',
        scenario: 'UI preview - Show what will be copied',
        given: 'User selects source venture to clone',
        when: 'User reviews clone preview',
        then: 'Preview shows: "Will copy: Description, Category, Tags" AND "Will NOT copy: Stage progress, Financial data, Metrics"'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-002-competitor-clone-stage0.spec.ts',
      'Test covers happy path (successful clone)',
      'Test covers validation (unique name required)',
      'Test verifies selective data inheritance',
      'Test validates Stage 0 assignment for cloned venture',
      'Competitor Clone path integrated into CreateVentureDialog',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Clone should copy structural data (description, category, tags) but NOT progress data (stage, financials, metrics). New venture always starts at Stage 0 regardless of source stage. Edge cases: Cloning from Stage 25 venture, cloning venture with very long description (>5000 chars), cloning venture with broken tags JSON, source venture deleted during clone operation, concurrent clones of same source venture.',
    implementation_approach: 'Add "Competitor Clone" option to CreateVentureDialog. Show venture picker. On selection, pre-fill form with source data. On submit, copy allowed fields and set stage_id = 0.',
    implementation_context: 'Second of three creation paths. More complex than Manual Entry due to source selection and selective copying. Competitor Clone helps users leverage existing venture patterns.',
    architecture_references: [
      'src/components/ventures/CreateVentureDialog.tsx - Extend with clone mode',
      'src/components/ventures/VenturePicker.tsx - NEW component for selecting source venture',
      'src/components/ventures/ClonePreview.tsx - NEW component showing what will be copied',
      'src/hooks/useVentures.ts - Fetch source venture data',
      'Database: ventures table (source and target records)',
      'Database: venture_lifecycle_stages table'
    ],
    example_code_patterns: {
      clone_logic: `
const handleCompetitorClone = async (sourceVentureId, formData) => {
  // Fetch source venture
  const { data: source, error: fetchError } = await supabase
    .from('ventures')
    .select('description, category, tags')
    .eq('id', sourceVentureId)
    .single();

  if (fetchError) {
    toast.error('Failed to load source venture');
    return;
  }

  // Create new venture at Stage 0 with inherited data
  const { data: newVenture, error: createError } = await supabase
    .from('ventures')
    .insert({
      name: formData.name, // Must be unique
      description: source.description, // Inherited
      category: source.category, // Inherited
      tags: source.tags, // Inherited
      stage_id: 0, // Always start at Stage 0
      created_by: user.id,
      cloned_from: sourceVentureId // Track clone source
    })
    .select()
    .single();

  if (createError) {
    toast.error('Failed to clone venture: ' + createError.message);
    return;
  }

  toast.success(\`Venture cloned successfully (Stage 0: INCEPTION)\`);
  onSuccess(newVenture);
};`,
      venture_picker: `
// VenturePicker.tsx
export const VenturePicker = ({ onSelect }) => {
  const { data: ventures } = useVentures();

  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select venture to clone" />
      </SelectTrigger>
      <SelectContent>
        {ventures?.map(v => (
          <SelectItem key={v.id} value={v.id}>
            {v.name} (Stage {v.stage_id})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};`
    },
    testing_scenarios: [
      { scenario: 'Clone venture and verify data inheritance', type: 'e2e', priority: 'P0' },
      { scenario: 'Validation error on duplicate name', type: 'e2e', priority: 'P1' },
      { scenario: 'Clone from advanced stage (Stage 20) still creates Stage 0', type: 'e2e', priority: 'P1' },
      { scenario: 'Preview shows correct inheritance rules', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-003',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Create Venture via Blueprint Browse (Stage 0 - INCEPTION)',
    user_role: 'Venture Creator',
    user_want: 'Create a new venture by selecting a pre-defined blueprint template, starting at Stage 0',
    user_benefit: 'Can leverage expert-designed venture frameworks and best practices without starting from scratch',
    priority: 'high',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Create from blueprint',
        given: 'User is on Ventures page AND blueprints are available',
        when: 'User clicks "Create Venture" AND selects "Blueprint Browse" AND selects blueprint (e.g., "SaaS Startup") AND customizes name AND clicks "Submit"',
        then: 'Venture is created with stage_id = 0 AND venture inherits blueprint structure (milestones, tasks, metrics) AND user sees success message AND venture appears in grid'
      },
      {
        id: 'AC-003-2',
        scenario: 'Blueprint catalog - Browse options',
        given: 'User selects Blueprint Browse path',
        when: 'User views blueprint catalog',
        then: 'User sees categorized blueprints (SaaS, E-commerce, Services, etc.) AND each blueprint shows preview (description, key milestones, difficulty)'
      },
      {
        id: 'AC-003-3',
        scenario: 'Blueprint inheritance - Structure copying',
        given: 'User creates venture from "SaaS Startup" blueprint',
        when: 'Venture is created',
        then: 'Venture has stage_id = 0 AND inherits: recommended stage progression, milestone templates, suggested metrics, task checklists BUT user can customize before submit'
      },
      {
        id: 'AC-003-4',
        scenario: 'Error path - No blueprints available',
        given: 'No blueprints are configured in system',
        when: 'User selects Blueprint Browse',
        then: 'User sees message "No blueprints available. Try Manual Entry or Competitor Clone." AND Blueprint Browse option is disabled'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-003-blueprint-browse-stage0.spec.ts',
      'Test covers happy path (create from blueprint)',
      'Test covers blueprint catalog browsing',
      'Test verifies blueprint structure inheritance',
      'Test validates Stage 0 assignment',
      'Blueprint Browse path integrated into CreateVentureDialog',
      'At least 3 sample blueprints created in database',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Blueprint is a template system - different from cloning an existing venture. Blueprints provide recommended structure but allow customization. Edge cases: Blueprint with 100+ milestone templates, blueprint references deleted metrics, blueprint has invalid JSON structure, user modifies blueprint data before submit, blueprint catalog has 50+ blueprints (pagination needed).',
    implementation_approach: 'Add "Blueprint Browse" option to CreateVentureDialog. Create BlueprintCatalog component. On blueprint selection, show preview and customization form. On submit, create venture at Stage 0 with blueprint structure.',
    implementation_context: 'Third of three creation paths. Most complex due to blueprint catalog and structure inheritance. Blueprints provide guided venture creation for less experienced users.',
    architecture_references: [
      'src/components/ventures/CreateVentureDialog.tsx - Extend with blueprint mode',
      'src/components/ventures/BlueprintCatalog.tsx - NEW component for browsing blueprints',
      'src/components/ventures/BlueprintPreview.tsx - NEW component showing blueprint details',
      'src/hooks/useBlueprints.ts - NEW hook for fetching blueprints',
      'Database: venture_blueprints table - NEW table for blueprint templates',
      'Database: ventures table (target record)',
      'Database: venture_lifecycle_stages table'
    ],
    example_code_patterns: {
      blueprint_fetch: `
// useBlueprints.ts
export const useBlueprints = () => {
  return useQuery({
    queryKey: ['blueprints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venture_blueprints')
        .select('*')
        .eq('is_active', true)
        .order('category, name');

      if (error) throw error;
      return data;
    }
  });
};`,
      create_from_blueprint: `
const handleBlueprintCreate = async (blueprintId, formData) => {
  // Fetch blueprint template
  const { data: blueprint, error: fetchError } = await supabase
    .from('venture_blueprints')
    .select('*')
    .eq('id', blueprintId)
    .single();

  if (fetchError) {
    toast.error('Failed to load blueprint');
    return;
  }

  // Create venture with blueprint structure
  const { data: newVenture, error: createError } = await supabase
    .from('ventures')
    .insert({
      name: formData.name,
      description: formData.description || blueprint.default_description,
      category: blueprint.category,
      stage_id: 0, // Always start at Stage 0
      blueprint_id: blueprintId, // Track which blueprint was used
      milestone_templates: blueprint.milestones, // JSON array
      metric_templates: blueprint.metrics, // JSON array
      created_by: user.id
    })
    .select()
    .single();

  if (createError) {
    toast.error('Failed to create venture: ' + createError.message);
    return;
  }

  toast.success(\`Venture created from \${blueprint.name} blueprint (Stage 0: INCEPTION)\`);
  onSuccess(newVenture);
};`,
      blueprint_catalog: `
// BlueprintCatalog.tsx
export const BlueprintCatalog = ({ onSelect }) => {
  const { data: blueprints, isLoading } = useBlueprints();

  if (isLoading) return <Spinner />;

  const groupedByCategory = groupBy(blueprints, 'category');

  return (
    <div className="space-y-4">
      {Object.entries(groupedByCategory).map(([category, items]) => (
        <div key={category}>
          <h3 className="font-semibold text-lg mb-2">{category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {items.map(blueprint => (
              <Card key={blueprint.id}
                    className="cursor-pointer hover:border-blue-500"
                    onClick={() => onSelect(blueprint.id)}>
                <CardHeader>
                  <CardTitle>{blueprint.name}</CardTitle>
                  <CardDescription>{blueprint.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {blueprint.milestones.length} milestones •
                    {blueprint.metrics.length} metrics
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};`
    },
    testing_scenarios: [
      { scenario: 'Browse blueprint catalog and select blueprint', type: 'e2e', priority: 'P0' },
      { scenario: 'Create venture from SaaS blueprint', type: 'e2e', priority: 'P0' },
      { scenario: 'Verify blueprint structure inheritance', type: 'e2e', priority: 'P1' },
      { scenario: 'Handle empty blueprint catalog gracefully', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-004',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Filter Ventures by Stage 0 (INCEPTION Phase)',
    user_role: 'Venture Manager',
    user_want: 'Filter the ventures grid to show only ventures in Stage 0 (INCEPTION)',
    user_benefit: 'Can focus on early-stage ventures that need initial development and planning',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Filter by Stage 0',
        given: 'User is on Ventures page AND ventures exist in multiple stages (0, 1, 2, etc.)',
        when: 'User selects "Stage 0: INCEPTION" from stage filter dropdown',
        then: 'Grid displays only ventures with stage_id = 0 AND filter badge shows "Stage 0: INCEPTION" AND count shows number of Stage 0 ventures'
      },
      {
        id: 'AC-004-2',
        scenario: 'Clear filter - Show all stages',
        given: 'Stage 0 filter is active',
        when: 'User clicks "Clear filter" or selects "All Stages"',
        then: 'Grid displays ventures from all stages (0-25) AND filter badge is removed'
      },
      {
        id: 'AC-004-3',
        scenario: 'Empty state - No Stage 0 ventures',
        given: 'No ventures exist in Stage 0',
        when: 'User selects Stage 0 filter',
        then: 'Grid shows empty state message "No ventures in Stage 0 (INCEPTION). Create your first venture!" AND shows "Create Venture" button'
      },
      {
        id: 'AC-004-4',
        scenario: 'Filter persistence - URL query param',
        given: 'User applies Stage 0 filter',
        when: 'User refreshes page or shares URL',
        then: 'Filter remains active (via ?stage=0 query param) AND grid still shows only Stage 0 ventures'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-004-filter-stage0.spec.ts',
      'Test covers happy path (filter to Stage 0)',
      'Test covers clear filter functionality',
      'Test covers empty state',
      'Test verifies URL query param persistence',
      'Stage filter dropdown includes Stage 0 option',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Stage 0 is a new addition to existing stage filter. Ensure backward compatibility with existing stage filters (1-25). Filter should use URL query params for shareability. Edge cases: Filtering Stage 0 with 1000+ ventures (performance), filtering with other active filters (category + stage), applying Stage 0 filter when already filtered by different stage, URL manipulation (?stage=999 should show empty or error).',
    implementation_approach: 'Extend existing stage filter dropdown to include Stage 0. Update VenturesManager query to filter by stage_id = 0. Add URL query param support (?stage=0).',
    implementation_context: 'Builds on existing filtering system. Stage 0 is a new stage, so filter dropdown needs update. Existing stages 1-25 should continue to work.',
    architecture_references: [
      'src/components/ventures/VenturesManager.tsx - Main grid component with filters',
      'src/components/ventures/StageFilter.tsx - EXISTING filter dropdown to extend',
      'src/hooks/useVentures.ts - Data fetching with filter params',
      'Database: ventures table (stage_id column)',
      'Database: venture_lifecycle_stages table (stage 0 definition)'
    ],
    example_code_patterns: {
      stage_filter_update: `
// StageFilter.tsx - Add Stage 0 to dropdown
const StageFilter = ({ value, onChange }) => {
  const { data: stages } = useStages(); // Fetches 0-25 from database

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="All Stages" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Stages</SelectItem>
        {stages?.map(stage => (
          <SelectItem key={stage.id} value={String(stage.id)}>
            Stage {stage.id}: {stage.name}
            {stage.phase && \` (\${stage.phase})\`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};`,
      ventures_query_filter: `
// useVentures.ts - Filter by stage
const { data: ventures } = useQuery({
  queryKey: ['ventures', stageFilter, categoryFilter],
  queryFn: async () => {
    let query = supabase
      .from('ventures')
      .select(\`
        *,
        stage:venture_lifecycle_stages(id, name, phase)
      \`);

    if (stageFilter && stageFilter !== 'all') {
      query = query.eq('stage_id', parseInt(stageFilter));
    }

    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
});`,
      url_query_param: `
// VenturesManager.tsx - URL persistence
const [searchParams, setSearchParams] = useSearchParams();
const stageFilter = searchParams.get('stage') || 'all';

const handleStageFilterChange = (newStage) => {
  const params = new URLSearchParams(searchParams);
  if (newStage === 'all') {
    params.delete('stage');
  } else {
    params.set('stage', newStage);
  }
  setSearchParams(params);
};`
    },
    testing_scenarios: [
      { scenario: 'Apply Stage 0 filter and verify results', type: 'e2e', priority: 'P0' },
      { scenario: 'Clear filter returns to all stages', type: 'e2e', priority: 'P1' },
      { scenario: 'URL query param persists on page refresh', type: 'e2e', priority: 'P1' },
      { scenario: 'Empty state shows when no Stage 0 ventures', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-005',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Display Dynamic Stage Labels from Database',
    user_role: 'Venture Manager',
    user_want: 'See stage labels (0-25) loaded from the database instead of hardcoded values',
    user_benefit: 'Stage names stay consistent across the application and can be updated centrally without code changes',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Dynamic labels displayed',
        given: 'Ventures exist in various stages (0, 1, 5, 10, 25)',
        when: 'User views ventures grid',
        then: 'Each venture shows stage badge with label from database (e.g., "Stage 0: INCEPTION", "Stage 1: Foundation Setup") AND labels match venture_lifecycle_stages table'
      },
      {
        id: 'AC-005-2',
        scenario: 'Stage data loading - API call',
        given: 'User opens Ventures page',
        when: 'Page loads',
        then: 'System fetches stage definitions from venture_lifecycle_stages table AND caches results for performance AND displays loading state while fetching'
      },
      {
        id: 'AC-005-3',
        scenario: 'Fallback - Stage not in database',
        given: 'Venture has stage_id = 99 BUT stage 99 does not exist in venture_lifecycle_stages',
        when: 'System tries to display stage label',
        then: 'System shows fallback label "Stage 99: Unknown" AND logs warning to console'
      },
      {
        id: 'AC-005-4',
        scenario: 'Phase context - Display alongside stage',
        given: 'Venture is in Stage 0 (INCEPTION phase)',
        when: 'User views stage badge',
        then: 'Badge shows "Stage 0: INCEPTION" AND uses phase-specific styling (blue for INCEPTION) AND tooltip shows full phase name'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-005-dynamic-stage-labels.spec.ts',
      'Test covers dynamic label display from database',
      'Test covers loading state',
      'Test covers fallback for missing stages',
      'Test verifies phase-specific styling',
      'StageConfigService created for centralized stage data',
      'VentureStageDisplay component uses dynamic labels',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Replace hardcoded 7-stage labels with dynamic 25-stage labels from database. Create service layer (StageConfigService) to fetch and cache stage data. Use React Query for caching and automatic refetching. Edge cases: Database connection fails (show cached/default labels), stage_lifecycle_stages table is empty, stage label is updated in database (cache invalidation), stage has null or empty name in database.',
    implementation_approach: 'Create StageConfigService to fetch stages from database. Use React Query to cache results. Update VentureStageDisplay to use dynamic labels. Add phase-based styling.',
    implementation_context: 'Critical for 25-stage system. Replaces old 7-stage hardcoded system. Enables dynamic stage management without code deployments.',
    architecture_references: [
      'src/services/StageConfigService.ts - NEW service for stage configuration',
      'src/hooks/useStages.ts - NEW hook for fetching stages',
      'src/components/ventures/VentureStageDisplay.tsx - Update to use dynamic labels',
      'src/components/ventures/VenturesManager.tsx - Grid component',
      'Database: venture_lifecycle_stages table (25 stage definitions)',
      'src/lib/react-query.ts - Query client configuration'
    ],
    example_code_patterns: {
      stage_config_service: `
// StageConfigService.ts
import { supabase } from '@/lib/supabase';

export class StageConfigService {
  private static stageCache: Map<number, Stage> = new Map();

  static async fetchStages() {
    const { data, error } = await supabase
      .from('venture_lifecycle_stages')
      .select('*')
      .order('id');

    if (error) throw error;

    // Cache results
    data.forEach(stage => {
      this.stageCache.set(stage.id, stage);
    });

    return data;
  }

  static getStage(stageId: number): Stage | null {
    return this.stageCache.get(stageId) || null;
  }

  static getStageName(stageId: number): string {
    const stage = this.getStage(stageId);
    return stage ? stage.name : \`Unknown Stage \${stageId}\`;
  }
}`,
      use_stages_hook: `
// useStages.ts
import { useQuery } from '@tanstack/react-query';
import { StageConfigService } from '@/services/StageConfigService';

export const useStages = () => {
  return useQuery({
    queryKey: ['venture-stages'],
    queryFn: () => StageConfigService.fetchStages(),
    staleTime: 1000 * 60 * 60, // 1 hour (stages rarely change)
    cacheTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};

export const useStage = (stageId: number) => {
  const { data: stages } = useStages();
  return stages?.find(s => s.id === stageId);
};`,
      venture_stage_display_dynamic: `
// VentureStageDisplay.tsx - Updated for dynamic labels
import { useStage } from '@/hooks/useStages';

export const VentureStageDisplay = ({ stageId }) => {
  const stage = useStage(stageId);

  if (!stage) {
    return (
      <Badge variant="outline">
        Stage {stageId}: Unknown
      </Badge>
    );
  }

  const phaseColors = {
    'INCEPTION': 'bg-blue-100 text-blue-800 border-blue-300',
    'Foundation': 'bg-green-100 text-green-800 border-green-300',
    'Development': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'Market Entry': 'bg-orange-100 text-orange-800 border-orange-300',
    'Growth': 'bg-purple-100 text-purple-800 border-purple-300',
    'Maturity': 'bg-gray-100 text-gray-800 border-gray-300',
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge className={\`\${phaseColors[stage.phase] || 'bg-gray-100'} font-medium\`}>
          Stage {stage.id}: {stage.name}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p><strong>Phase:</strong> {stage.phase}</p>
        <p><strong>Description:</strong> {stage.description}</p>
      </TooltipContent>
    </Tooltip>
  );
};`
    },
    testing_scenarios: [
      { scenario: 'Display ventures with dynamic stage labels (0-25)', type: 'e2e', priority: 'P0' },
      { scenario: 'Verify stage labels match database values', type: 'e2e', priority: 'P0' },
      { scenario: 'Show loading state while fetching stages', type: 'e2e', priority: 'P1' },
      { scenario: 'Fallback label for stage not in database', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-006',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Filter Ventures by Phase (INCEPTION, Foundation, etc.)',
    user_role: 'Venture Manager',
    user_want: 'Filter ventures by lifecycle phase (INCEPTION, Foundation, Development, Market Entry, Growth, Maturity)',
    user_benefit: 'Can group and manage ventures by high-level phase instead of individual stages, making it easier to focus on ventures in similar lifecycle stages',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - Filter by INCEPTION phase',
        given: 'Ventures exist in multiple phases AND user is on Ventures page',
        when: 'User selects "INCEPTION" from phase filter dropdown',
        then: 'Grid displays only ventures in INCEPTION phase (Stage 0) AND filter badge shows "Phase: INCEPTION" AND count shows number of ventures'
      },
      {
        id: 'AC-006-2',
        scenario: 'Multi-stage phase - Foundation',
        given: 'User selects "Foundation" phase (Stages 1-5)',
        when: 'Filter is applied',
        then: 'Grid displays ventures in Stages 1, 2, 3, 4, or 5 AND filter shows "Phase: Foundation (Stages 1-5)"'
      },
      {
        id: 'AC-006-3',
        scenario: 'Phase dropdown - Dynamic from database',
        given: 'User opens phase filter dropdown',
        when: 'Dropdown renders',
        then: 'Dropdown shows 6 phases: INCEPTION, Foundation, Development, Market Entry, Growth, Maturity AND each shows stage range (e.g., "Foundation (Stages 1-5)")'
      },
      {
        id: 'AC-006-4',
        scenario: 'Combine filters - Phase + Category',
        given: 'User has filtered by "Technology" category',
        when: 'User also selects "INCEPTION" phase',
        then: 'Grid shows only Technology ventures in INCEPTION phase AND both filter badges are visible'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-006-filter-by-phase.spec.ts',
      'Test covers filtering by each phase (6 phases)',
      'Test covers multi-stage phase filtering (Foundation = Stages 1-5)',
      'Test covers combined filters (phase + category)',
      'Test verifies dynamic phase dropdown from database',
      'PhaseFilter component created',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Phase is a grouping of stages: INCEPTION (Stage 0), Foundation (1-5), Development (6-10), Market Entry (11-15), Growth (16-20), Maturity (21-25). Phase filter is higher-level than stage filter - selecting phase should filter by all stages in that phase. Edge cases: Phase definitions change in database (dynamic loading needed), filtering phase with 1000+ ventures per phase, combining phase filter with stage filter (should stage filter override?), empty phase (no stages defined).',
    implementation_approach: 'Create PhaseFilter component with dropdown. Fetch phase definitions from database (venture_lifecycle_stages, group by phase). Filter ventures by stage_id IN (stages for selected phase).',
    implementation_context: 'Phase filtering provides higher-level view than stage filtering. Useful for portfolio management and reporting. Phase definitions come from database.',
    architecture_references: [
      'src/components/ventures/PhaseFilter.tsx - NEW component for phase filtering',
      'src/components/ventures/VenturesManager.tsx - Grid component with filters',
      'src/hooks/usePhases.ts - NEW hook for fetching phase definitions',
      'src/services/StageConfigService.ts - Service for stage/phase data',
      'Database: venture_lifecycle_stages table (phase column)',
      'Database: ventures table (stage_id column for filtering)'
    ],
    example_code_patterns: {
      phase_filter_component: `
// PhaseFilter.tsx
import { usePhases } from '@/hooks/usePhases';

export const PhaseFilter = ({ value, onChange }) => {
  const { data: phases, isLoading } = usePhases();

  if (isLoading) return <Spinner />;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="All Phases" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Phases</SelectItem>
        {phases?.map(phase => (
          <SelectItem key={phase.name} value={phase.name}>
            {phase.name} (Stages {phase.startStage}-{phase.endStage})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};`,
      use_phases_hook: `
// usePhases.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const usePhases = () => {
  return useQuery({
    queryKey: ['venture-phases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venture_lifecycle_stages')
        .select('id, name, phase')
        .order('id');

      if (error) throw error;

      // Group stages by phase
      const phaseMap = new Map();
      data.forEach(stage => {
        if (!phaseMap.has(stage.phase)) {
          phaseMap.set(stage.phase, {
            name: stage.phase,
            stages: [],
            startStage: stage.id,
            endStage: stage.id
          });
        }
        const phase = phaseMap.get(stage.phase);
        phase.stages.push(stage.id);
        phase.endStage = Math.max(phase.endStage, stage.id);
      });

      return Array.from(phaseMap.values());
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};`,
      ventures_filter_by_phase: `
// useVentures.ts - Filter by phase
const { data: ventures } = useQuery({
  queryKey: ['ventures', phaseFilter, categoryFilter],
  queryFn: async () => {
    let query = supabase
      .from('ventures')
      .select(\`
        *,
        stage:venture_lifecycle_stages!inner(id, name, phase)
      \`);

    if (phaseFilter && phaseFilter !== 'all') {
      query = query.eq('stage.phase', phaseFilter);
    }

    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
});`
    },
    testing_scenarios: [
      { scenario: 'Filter by INCEPTION phase (Stage 0 only)', type: 'e2e', priority: 'P0' },
      { scenario: 'Filter by Foundation phase (Stages 1-5)', type: 'e2e', priority: 'P0' },
      { scenario: 'Combine phase filter with category filter', type: 'e2e', priority: 'P1' },
      { scenario: 'Verify phase dropdown shows all 6 phases', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VENTURE-STAGE0-UI-001:US-007',
    // prd_id: PRD_ID, // Removed - PRD not created yet
    sd_id: SD_ID,
    title: 'Promote Venture from Stage 0 to Stage 1',
    user_role: 'Venture Manager',
    user_want: 'Promote a venture from Stage 0 (INCEPTION) to Stage 1 (Foundation Setup) when ready',
    user_benefit: 'Can move ventures through the lifecycle as they progress, maintaining accurate stage tracking',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Happy path - Promote to Stage 1',
        given: 'Venture is in Stage 0 (INCEPTION) AND user has permission to edit venture',
        when: 'User clicks "Promote to Stage 1" button AND confirms promotion',
        then: 'Venture stage_id updates to 1 AND venture badge shows "Stage 1: Foundation Setup" AND success message shown "Venture promoted to Stage 1"'
      },
      {
        id: 'AC-007-2',
        scenario: 'Validation - Stage 0 readiness check',
        given: 'Venture is in Stage 0 BUT has not completed required fields (name, description, category)',
        when: 'User attempts to promote to Stage 1',
        then: 'System shows validation error "Complete all required fields before promoting to Stage 1" AND promotion is blocked'
      },
      {
        id: 'AC-007-3',
        scenario: 'Confirmation dialog - Prevent accidental promotion',
        given: 'User clicks "Promote to Stage 1"',
        when: 'Promotion is initiated',
        then: 'Confirmation dialog appears: "Ready to move to Stage 1 (Foundation Setup)? This will start the formal venture development process." AND user can confirm or cancel'
      },
      {
        id: 'AC-007-4',
        scenario: 'Stage history - Track progression',
        given: 'Venture is promoted from Stage 0 to Stage 1',
        when: 'Promotion completes',
        then: 'System records stage change in venture_stage_history table (stage_from = 0, stage_to = 1, changed_at = timestamp, changed_by = user_id)'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/ventures/US-007-promote-stage0-to-1.spec.ts',
      'Test covers happy path (successful promotion)',
      'Test covers validation (readiness check)',
      'Test covers confirmation dialog',
      'Test verifies stage history tracking',
      'Promote button added to Stage 0 ventures',
      'venture_stage_history table tracks changes',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Stage promotion is a critical workflow - must be reversible (demotion) and auditable (history tracking). Stage 0 to Stage 1 is the first promotion in the 25-stage lifecycle. Future stages may have additional readiness checks (e.g., Stage 10 requires market validation data). Edge cases: Promoting venture that another user is editing (conflict), network failure during promotion (rollback needed), promoting venture that was deleted (404 error), rapid successive promotions (debounce), promoting to Stage 1 when Stage 1 definition is missing in database.',
    implementation_approach: 'Add "Promote to Stage 1" button to Stage 0 ventures. Create promotion dialog with validation checks. Update venture.stage_id via API. Record change in venture_stage_history table.',
    implementation_context: 'First stage promotion in 25-stage lifecycle. Establishes pattern for future stage promotions (1→2, 2→3, etc.). Promotion requires validation and confirmation.',
    architecture_references: [
      'src/components/ventures/PromoteStageButton.tsx - NEW component for promotion',
      'src/components/ventures/PromoteStageDialog.tsx - NEW confirmation dialog',
      'src/components/ventures/VenturesManager.tsx - Shows promote button for Stage 0',
      'src/hooks/usePromoteVenture.ts - NEW mutation hook for promotion',
      'Database: ventures table (stage_id update)',
      'Database: venture_stage_history table - NEW table for audit trail',
      'API: PATCH /api/ventures/:id (update stage_id)'
    ],
    example_code_patterns: {
      promote_stage_button: `
// PromoteStageButton.tsx
export const PromoteStageButton = ({ venture }) => {
  const [showDialog, setShowDialog] = useState(false);

  // Only show for Stage 0 ventures
  if (venture.stage_id !== 0) return null;

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        variant="outline"
        className="text-green-600 hover:text-green-700"
      >
        <ArrowRight className="w-4 h-4 mr-2" />
        Promote to Stage 1
      </Button>

      {showDialog && (
        <PromoteStageDialog
          venture={venture}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
};`,
      promote_stage_dialog: `
// PromoteStageDialog.tsx
import { usePromoteVenture } from '@/hooks/usePromoteVenture';

export const PromoteStageDialog = ({ venture, onClose }) => {
  const promoteMutation = usePromoteVenture();

  const handlePromote = async () => {
    try {
      await promoteMutation.mutateAsync({
        ventureId: venture.id,
        fromStage: 0,
        toStage: 1
      });
      toast.success('Venture promoted to Stage 1: Foundation Setup');
      onClose();
    } catch (error) {
      toast.error(\`Failed to promote venture: \${error.message}\`);
    }
  };

  // Readiness validation
  const isReady = venture.name && venture.description && venture.category;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to Stage 1?</DialogTitle>
          <DialogDescription>
            Ready to move to Stage 1 (Foundation Setup)?
            This will start the formal venture development process.
          </DialogDescription>
        </DialogHeader>

        {!isReady && (
          <Alert variant="destructive">
            <AlertTitle>Venture not ready</AlertTitle>
            <AlertDescription>
              Complete all required fields (name, description, category)
              before promoting to Stage 1.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handlePromote}
            disabled={!isReady || promoteMutation.isPending}
          >
            {promoteMutation.isPending ? 'Promoting...' : 'Confirm Promotion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};`,
      use_promote_venture_hook: `
// usePromoteVenture.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const usePromoteVenture = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ventureId, fromStage, toStage }) => {
      // Update venture stage
      const { data: venture, error: updateError } = await supabase
        .from('ventures')
        .update({ stage_id: toStage, updated_at: new Date() })
        .eq('id', ventureId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Record in stage history
      const { error: historyError } = await supabase
        .from('venture_stage_history')
        .insert({
          venture_id: ventureId,
          stage_from: fromStage,
          stage_to: toStage,
          changed_at: new Date(),
          changed_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (historyError) {
        console.error('Failed to record stage history:', historyError);
        // Don't fail the mutation, just log
      }

      return venture;
    },
    onSuccess: () => {
      // Invalidate ventures query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['ventures'] });
    }
  });
};`
    },
    testing_scenarios: [
      { scenario: 'Promote venture from Stage 0 to Stage 1', type: 'e2e', priority: 'P0' },
      { scenario: 'Block promotion if required fields missing', type: 'e2e', priority: 'P1' },
      { scenario: 'Verify stage history record created', type: 'e2e', priority: 'P1' },
      { scenario: 'Confirmation dialog can be cancelled', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  }
];

async function insertUserStories() {
  console.log('Inserting user stories for SD-VENTURE-STAGE0-UI-001...\n');

  for (const story of userStories) {
    console.log(`Inserting story: ${story.story_key} - ${story.title}`);

    const { data: _data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error inserting ${story.story_key}:`, error.message);
      // Continue with other stories even if one fails
    } else {
      console.log(`✅ Successfully inserted ${story.story_key}`);
    }
  }

  console.log('\n✅ User stories insertion complete!');
  console.log(`Total stories: ${userStories.length}`);
  console.log('\nStory Summary:');
  userStories.forEach(s => {
    console.log(`  - ${s.story_key}: ${s.title} (${s.story_points} pts, ${s.priority})`);
  });
}

// Run the script
insertUserStories().catch(console.error);
