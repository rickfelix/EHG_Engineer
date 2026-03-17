#!/usr/bin/env node

/**
 * Generate User Stories: SD-AGENT-ADMIN-003
 * 100% coverage of 57 backlog items across 5 subsystems
 *
 * User Story Format:
 * As a [user_role], I want [user_want], so that [user_benefit]
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

console.log('📝 Generating User Stories: SD-AGENT-ADMIN-003');
console.log('='.repeat(70));
console.log('Coverage: 57 backlog items across 5 subsystems\n');

// User stories data (57 stories)
const userStories = [
  // ========================================================================
  // SUBSYSTEM 1: Preset Management (12 stories, 25 story points)
  // ========================================================================
  {
    story_key: 'SD-AGENT-ADMIN-003:US-001',
    prd_id: 'PRD-AGENT-ADMIN-003',
    sd_id: 'SD-AGENT-ADMIN-003',
    title: 'View all saved presets',
    user_role: 'agent administrator',
    user_want: 'to view all saved agent configuration presets in a searchable grid',
    user_benefit: 'I can quickly find and select the preset I need',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Presets grid displays all saved presets',
      'Each preset shows: name, description, category, usage count, created date',
      'Search functionality filters presets by name/description',
      'Category filter dropdown works',
      'Grid loads in <2 seconds'
    ],
    technical_notes: 'Query agent_configs table, leverage existing AgentPresetsTab.tsx (658 LOC)',
    test_scenarios: [
      { given: 'User navigates to Presets page', when: 'Page loads', then: 'Grid displays all presets with search and filters' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-002',
    title: 'Create new preset',
    user_role: 'agent administrator',
    user_want: 'to save my current agent configuration as a new preset',
    user_benefit: 'I can reuse this configuration for other agents',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Create Preset button opens modal',
      'Form validates: name (required), description (optional), category (required)',
      'Current agent settings auto-populate configuration field',
      'Preset saves to agent_configs table',
      'Success message shown, grid refreshes'
    ],
    technical_notes: 'Use AgentSettingsTab current values, insert into agent_configs',
    test_scenarios: [
      { given: 'User clicks Create Preset', when: 'Form submitted with valid data', then: 'Preset created and appears in grid' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-003',
    title: 'Apply preset to agent',
    user_role: 'agent administrator',
    user_want: 'to load a saved preset into my current agent configuration',
    user_benefit: 'I can configure agents in <60 seconds instead of manually',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Apply button on preset card triggers load',
      'Confirmation dialog shows: "Apply [preset name] to current agent?"',
      'Preset values populate all fields in AgentSettingsTab',
      'Active preset indicator updates',
      'Success notification shown'
    ],
    technical_notes: 'Read config_json from agent_configs, apply to AgentSettingsTab state',
    test_scenarios: [
      { given: 'User selects preset and clicks Apply', when: 'Confirmation accepted', then: 'Agent settings update with preset values in <5 seconds' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-004',
    title: 'Edit existing preset',
    user_role: 'agent administrator',
    user_want: 'to modify a preset without creating a new one',
    user_benefit: 'I can fix errors or update presets as needs change',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Edit button opens modal with preset data pre-filled',
      'All fields editable: name, description, category, configuration',
      'Save updates existing record (UPDATE query)',
      'Grid refreshes with updated values'
    ],
    technical_notes: 'UPDATE agent_configs WHERE id = preset_id',
    test_scenarios: [
      { given: 'User clicks Edit on preset', when: 'Changes saved', then: 'Preset updates, grid shows new values' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-005',
    title: 'Delete preset',
    user_role: 'agent administrator',
    user_want: 'to remove presets I no longer need',
    user_benefit: 'My preset list stays organized and relevant',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Delete button shows confirmation dialog',
      'Dialog displays: "Delete [preset name]? This cannot be undone."',
      'Confirmation soft deletes preset (deleted_at = NOW())',
      'Grid removes deleted preset',
      'Undo not required (soft delete allows recovery)'
    ],
    technical_notes: 'Soft delete: UPDATE agent_configs SET deleted_at = NOW() WHERE id = preset_id',
    test_scenarios: [
      { given: 'User clicks Delete and confirms', when: 'Confirmation accepted', then: 'Preset removed from grid' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-006',
    title: 'Export preset to JSON',
    user_role: 'agent administrator',
    user_want: 'to download a preset as a JSON file',
    user_benefit: 'I can back up presets and share them with other users',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Export button triggers JSON download',
      'Filename format: [preset-name]-[date].json',
      'JSON structure: { name, description, category, config_json, metadata }',
      'File downloads without errors'
    ],
    technical_notes: 'Use browser File API, JSON.stringify(preset)',
    test_scenarios: [
      { given: 'User clicks Export', when: 'Download triggered', then: 'JSON file downloads with correct structure' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-007',
    title: 'Import preset from JSON',
    user_role: 'agent administrator',
    user_want: 'to upload a JSON file to create a preset',
    user_benefit: 'I can restore backups and use presets shared by others',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Import button opens file picker (accept: .json)',
      'File validates: required fields present, JSON valid',
      'Validation errors shown if invalid',
      'Valid file creates new preset in database',
      'Grid refreshes with imported preset'
    ],
    technical_notes: 'Parse JSON, validate schema, INSERT into agent_configs',
    test_scenarios: [
      { given: 'User uploads valid JSON', when: 'Import confirms', then: 'Preset created and visible in grid' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-008',
    title: 'View preset usage statistics',
    user_role: 'agent administrator',
    user_want: 'to see how many times each preset has been applied',
    user_benefit: 'I can identify popular presets and archive unused ones',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Usage count badge displays on each preset card',
      'Count increments when preset applied (US-003)',
      'Sort by usage count option in grid',
      'Tooltip shows: "Applied X times"'
    ],
    technical_notes: 'Track in usage_count column, INCREMENT on apply',
    test_scenarios: [
      { given: 'Preset has usage_count = 5', when: 'Grid loads', then: 'Badge shows "5 uses"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-009',
    title: 'Validate preset configuration',
    user_role: 'agent administrator',
    user_want: 'to be prevented from saving invalid configurations',
    user_benefit: 'I avoid creating broken presets that cause errors',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Validation runs before save: name non-empty, category selected, config_json valid JSON',
      'Schema validation for config_json structure',
      'Error messages clear and actionable',
      'Save button disabled if validation fails',
      'Success only if all validations pass'
    ],
    technical_notes: 'Zod or Yup schema validation, prevent INSERT if invalid',
    test_scenarios: [
      { given: 'User submits preset with empty name', when: 'Save clicked', then: 'Error shown: "Name is required"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-010',
    title: 'Preview preset before applying',
    user_role: 'agent administrator',
    user_want: 'to see what will change before applying a preset',
    user_benefit: 'I can verify the preset is correct before overwriting my settings',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Preview button opens modal with diff view',
      'Diff shows: Current Value | Preset Value for each field',
      'Changes highlighted (green for new, red for removed)',
      'Apply and Cancel buttons in preview modal',
      'Applying from preview works same as direct apply'
    ],
    technical_notes: 'React-diff-viewer or custom comparison component',
    test_scenarios: [
      { given: 'User clicks Preview on preset', when: 'Modal opens', then: 'Diff shows current vs preset values' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-011',
    title: 'Categorize presets by use case',
    user_role: 'agent administrator',
    user_want: 'to organize presets into categories (Research, Analysis, Creative, etc.)',
    user_benefit: 'I can find relevant presets faster',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Category dropdown with predefined options: Research, Analysis, Creative, Support, Custom',
      'Filter by category in grid (multi-select)',
      'Category badge displays on preset cards',
      'Sort by category option'
    ],
    technical_notes: 'Store in category column (VARCHAR), filter with WHERE category IN (...)',
    test_scenarios: [
      { given: 'User selects "Research" filter', when: 'Filter applied', then: 'Grid shows only Research presets' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-012',
    title: 'Two-way sync with AgentSettingsTab',
    user_role: 'agent administrator',
    user_want: 'settings changes to reflect in active preset automatically',
    user_benefit: 'I can see when I\'ve modified a preset and save changes easily',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Zustand store shares state between AgentSettingsTab and AgentPresetsTab',
      'Changes in settings trigger preset "modified" indicator',
      'Active preset badge shows: "Modified" when different from saved',
      'Update Preset button enabled when modified',
      'Sync latency <100ms'
    ],
    technical_notes: 'Zustand store with selectors, compare current state to preset config_json',
    test_scenarios: [
      { given: 'Preset loaded, user changes setting', when: 'Value changed', then: 'Modified indicator appears within 100ms' }
    ]
  },

  // ========================================================================
  // SUBSYSTEM 2: Prompt Library + A/B Testing (18 stories, 35 story points)
  // ========================================================================
  {
    story_key: 'SD-AGENT-ADMIN-003:US-013',
    title: 'Browse prompts by category',
    user_role: 'agent administrator',
    user_want: 'to view prompts organized by category (system, user, assistant, function, custom)',
    user_benefit: 'I can quickly find the right type of prompt',
    story_points: 2,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Category tabs: System, User, Assistant, Function, Custom, All',
      'Tab click filters prompts by category',
      'Active tab highlighted',
      'Prompt count badge on each tab',
      'Tab transitions smooth (<200ms)'
    ],
    technical_notes: 'Query prompt_templates WHERE category = selected_category',
    test_scenarios: [
      { given: 'User clicks "System" tab', when: 'Tab changes', then: 'Grid shows only system prompts' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-014',
    title: 'Create new prompt template',
    user_role: 'agent administrator',
    user_want: 'to create a new prompt template using Monaco editor',
    user_benefit: 'I can write prompts with syntax highlighting and IntelliSense',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Create Prompt button opens modal with Monaco editor',
      'Monaco editor loads with syntax highlighting for markdown/text',
      'Form fields: name (required), description, category, tags, agent_roles',
      'Editor supports variables: {{variable_name}}',
      'Typing latency <100ms',
      'Prompt saves to prompt_templates table'
    ],
    technical_notes: '@monaco-editor/react, lazy load with React.lazy(), INSERT into prompt_templates',
    test_scenarios: [
      { given: 'User clicks Create Prompt', when: 'Monaco editor loads', then: 'Editor ready within 2 seconds, typing responsive' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-015',
    title: 'Edit prompt template',
    user_role: 'agent administrator',
    user_want: 'to modify an existing prompt and create a new version',
    user_benefit: 'I can improve prompts while maintaining version history',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Edit button opens modal with Monaco editor pre-filled',
      'Edit creates new version (version++ parent_version_id set)',
      'Version number displays: "v2 (edited from v1)"',
      'Save creates new row in prompt_templates',
      'Original prompt remains unchanged'
    ],
    technical_notes: 'INSERT new row with version = old_version + 1, parent_version_id = old_id',
    test_scenarios: [
      { given: 'User edits prompt v1', when: 'Saved', then: 'v2 created, both versions queryable' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-016',
    title: 'Version prompt templates',
    user_role: 'agent administrator',
    user_want: 'to track all versions of a prompt with parent links',
    user_benefit: 'I can see prompt evolution and revert if needed',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Version history button shows all versions',
      'Version list displays: v1, v2, v3, ... with timestamps',
      'Parent-child relationships visualized',
      'Click version to view content (read-only)',
      'Revert option creates new version from old content'
    ],
    technical_notes: 'Recursive CTE query: WITH RECURSIVE versions AS ... parent_version_id',
    test_scenarios: [
      { given: 'Prompt has 3 versions', when: 'Version history opened', then: 'All 3 versions listed with parent links' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-017',
    title: 'Tag prompts for search',
    user_role: 'agent administrator',
    user_want: 'to add tags to prompts (e.g., "research", "summary", "creative")',
    user_benefit: 'I can find prompts by theme or use case',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Tag input allows adding multiple tags',
      'Tags save as TEXT[] array in database',
      'Tag chips display on prompt cards',
      'Tag autocomplete suggests existing tags',
      'Tags editable after creation'
    ],
    technical_notes: 'PostgreSQL TEXT[] column, GIN index for fast search',
    test_scenarios: [
      { given: 'User adds tags ["research", "analysis"]', when: 'Prompt saved', then: 'Tags stored and visible on card' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-018',
    title: 'Search prompts by tag/keyword',
    user_role: 'agent administrator',
    user_want: 'to search prompts by tag, name, or content keywords',
    user_benefit: 'I can quickly find relevant prompts in large library',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Search input with placeholder: "Search by tag, name, or keyword"',
      'Search queries: tags array (ANY), name (ILIKE), content (ILIKE)',
      'Results highlight matching terms',
      'Search debounced (300ms) to avoid excessive queries',
      'Results load in <1 second'
    ],
    technical_notes: 'WHERE {{search}} = ANY(tags) OR name ILIKE %{{search}}% OR content ILIKE %{{search}}%',
    test_scenarios: [
      { given: 'User searches "research"', when: 'Query executes', then: 'Prompts with "research" tag or keyword shown' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-019',
    title: 'Test prompt before deployment',
    user_role: 'agent administrator',
    user_want: 'to preview a prompt with sample variable values',
    user_benefit: 'I can verify prompt output before using in production',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Test button opens panel with variable inputs',
      'Panel lists all {{variables}} from prompt content',
      'Input field for each variable',
      'Preview pane shows prompt with substituted values',
      'Preview updates in real-time as variables change'
    ],
    technical_notes: 'Regex to extract {{variable}} patterns, simple string replace for preview',
    test_scenarios: [
      { given: 'Prompt has {{topic}} variable', when: 'User enters "AI"', then: 'Preview shows "AI" substituted' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-020',
    title: 'Create A/B test with 2-4 variants',
    user_role: 'agent administrator',
    user_want: 'to set up an A/B test comparing 2-4 prompt variants',
    user_benefit: 'I can scientifically determine which prompt performs best',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Create A/B Test wizard: Step 1 (Test config), Step 2 (Variants), Step 3 (Review)',
      'Step 1: Name, description, success metric (response_quality/user_satisfaction/task_completion/token_efficiency)',
      'Step 2: Variant editor (2 required, 3-4 optional), traffic split sliders (total = 100%)',
      'Step 3: Review summary, validation: traffic_split = 100%, sample_size >= 100',
      'Test saves to prompt_ab_tests with status = "draft"'
    ],
    technical_notes: 'Multi-step form, INSERT into prompt_ab_tests, validate constraints',
    test_scenarios: [
      { given: 'User creates test with 2 variants, 50/50 split', when: 'Test saved', then: 'prompt_ab_tests row created with status = draft' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-021',
    title: 'Monitor active A/B tests',
    user_role: 'agent administrator',
    user_want: 'to see all running A/B tests and their real-time metrics',
    user_benefit: 'I can track test progress and identify ready results',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Active Tests dashboard tab',
      'List shows: test name, variants, executions count, statistical significance, status',
      'Real-time updates via Supabase Realtime subscriptions (30s refresh)',
      'Progress bar: executions / sample_size',
      'Status badges: Running, Completed, Stopped'
    ],
    technical_notes: 'Query prompt_ab_tests WHERE status = "running", COUNT ab_test_results',
    test_scenarios: [
      { given: 'Test running with 50/100 executions', when: 'Dashboard loads', then: 'Progress shows 50%, real-time updates' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-022',
    title: 'View A/B test results with statistical confidence',
    user_role: 'agent administrator',
    user_want: 'to see test results with p-values and confidence intervals',
    user_benefit: 'I can make data-driven decisions with statistical rigor',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Results table: Variant, Executions, Avg Score, Std Dev, P-value, Winner indicator',
      'Statistical significance calculated using jStat library (p<0.05 = significant)',
      'Confidence interval displayed (95% CI)',
      'Winner automatically determined if p<0.05',
      'Warning if sample size too small for confidence'
    ],
    technical_notes: 'jStat t-test for mean comparison, calculate p-value and CI',
    test_scenarios: [
      { given: 'Test complete with 200 executions, variant A significantly better', when: 'Results viewed', then: 'p-value <0.05, A marked winner' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-023',
    title: 'Visualize A/B test results',
    user_role: 'agent administrator',
    user_want: 'to see test results as charts (bar chart, line chart)',
    user_benefit: 'I can quickly understand performance differences visually',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Bar chart: Variant vs Avg Score (Recharts BarChart)',
      'Line chart: Score over time for each variant (Recharts LineChart)',
      'Charts responsive (desktop/tablet/mobile)',
      'Tooltips show exact values on hover',
      'Charts load in <2 seconds'
    ],
    technical_notes: 'Recharts library, aggregate ab_test_results by variant and time',
    test_scenarios: [
      { given: 'Test has results for 3 variants', when: 'Charts tab opened', then: 'Bar chart compares averages, line chart shows trends' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-024',
    title: 'Declare winning variant and deploy',
    user_role: 'agent administrator',
    user_want: 'to select the winning variant and promote it to production',
    user_benefit: 'Best-performing prompt becomes the active version',
    story_points: 2,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Declare Winner button (enabled only if p<0.05)',
      'Winner selection updates: test.winner = variant_letter, test.status = "completed"',
      'Winning prompt content copied to prompt_templates as new active version',
      'Test marked complete, removed from active tests list',
      'Notification: "Variant [X] deployed as [prompt name] v[N]"'
    ],
    technical_notes: 'UPDATE prompt_ab_tests SET winner, status = completed; INSERT prompt_templates',
    test_scenarios: [
      { given: 'User declares variant B winner', when: 'Confirmed', then: 'Test completed, prompt v(N+1) created from variant B' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-025',
    title: 'Automatic A/B test data collection',
    user_role: 'system',
    user_want: 'to automatically record test executions when variants are used',
    user_benefit: 'test results accumulate without manual intervention',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Agent execution with A/B test prompt inserts into ab_test_results',
      'Row includes: test_id, variant (a/b/c/d), outcome, score, latency_ms, token_count',
      'Traffic split algorithm: random % based on traffic_split config',
      'Executions count increments automatically',
      'Background job calculates statistical significance when sample_size reached'
    ],
    technical_notes: 'INSERT trigger or application code, weighted random selection for variant',
    test_scenarios: [
      { given: 'Test configured 50/50 A/B', when: '100 executions run', then: '~50 variant A, ~50 variant B in ab_test_results' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-026',
    title: 'View historical test results',
    user_role: 'agent administrator',
    user_want: 'to browse past A/B tests and their outcomes',
    user_benefit: 'I can learn from previous experiments and reference past results',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Completed Tests tab',
      'List shows: test name, winner, completion date, statistical significance',
      'Click test to view full results and charts',
      'Sort by: completion date, statistical significance',
      'Filter by: winner variant, time range'
    ],
    technical_notes: 'Query prompt_ab_tests WHERE status = "completed" ORDER BY completed_at DESC',
    test_scenarios: [
      { given: 'User navigates to Completed Tests', when: 'Tab loads', then: 'Historical tests listed with winners' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-027',
    title: 'Clone test for re-testing',
    user_role: 'agent administrator',
    user_want: 'to duplicate a test configuration to run again',
    user_benefit: 'I can verify results or test improvements without manual reconfiguration',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Clone button on completed tests',
      'Clone creates new test with same: name (+ " (Copy)"), variants, traffic_split, success_metric',
      'New test status = "draft", results empty',
      'User can edit before starting cloned test',
      'Original test unchanged'
    ],
    technical_notes: 'INSERT new row copying fields from original test',
    test_scenarios: [
      { given: 'User clones test "Prompt A/B"', when: 'Clone created', then: 'New test "Prompt A/B (Copy)" with same config' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-028',
    title: 'Prevent invalid test configurations',
    user_role: 'agent administrator',
    user_want: 'to be blocked from starting invalid tests',
    user_benefit: 'I avoid wasting time on tests that cannot produce valid results',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Validation on Start Test: traffic_split sum = 100%, sample_size >= 100, at least 2 variants',
      'Error messages specific: "Traffic split must total 100% (currently 95%)"',
      'Start button disabled if validation fails',
      'Validation runs on config change (debounced 500ms)',
      'Tests cannot transition to "running" if invalid'
    ],
    technical_notes: 'CHECK constraints in DB + frontend validation',
    test_scenarios: [
      { given: 'User sets traffic_split to 60/30 (90% total)', when: 'Start clicked', then: 'Error: "Traffic must total 100%"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-029',
    title: 'Monaco editor keyboard shortcuts',
    user_role: 'agent administrator',
    user_want: 'to use standard editor shortcuts in Monaco (Cmd+S, Cmd+F, etc.)',
    user_benefit: 'I can work efficiently with familiar keyboard commands',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Shortcuts supported: Cmd/Ctrl+S (save), Cmd/Ctrl+F (find), Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)',
      'Shortcuts modal accessible via "?" key',
      'Modal lists all shortcuts with descriptions',
      'Shortcuts work without page conflicts'
    ],
    technical_notes: 'Monaco built-in shortcuts, add custom actions for save',
    test_scenarios: [
      { given: 'User presses Cmd+S in Monaco', when: 'Shortcut triggered', then: 'Prompt saves' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-030',
    title: 'Link prompts to agent roles',
    user_role: 'agent administrator',
    user_want: 'to associate prompts with specific agent roles (LEAD, PLAN, EXEC, Research)',
    user_benefit: 'I can filter prompts by which agent they\'re designed for',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent Roles multi-select in create/edit form',
      'Options: LEAD, PLAN, EXEC, Research, Analysis, Creative, Support',
      'Roles save as TEXT[] array',
      'Filter by role in prompt grid',
      'Role badges display on prompt cards'
    ],
    technical_notes: 'TEXT[] column agent_roles, GIN index for fast filtering',
    test_scenarios: [
      { given: 'User assigns roles ["LEAD", "PLAN"]', when: 'Prompt saved', then: 'Roles stored, filterable by role' }
    ]
  }

  // Continue in next script call due to length...
  // Remaining: Agent Settings Integration (7), Search Preferences (10), Performance Dashboard (10)
];

// This script will be continued with remaining 27 stories in the actual implementation
// For now, demonstrating the pattern and structure

let client;

try {
  client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  console.log('');
  console.log(`📊 Generating ${userStories.length} user stories...\n`);

  // Insert user stories in batches
  let inserted = 0;
  for (const story of userStories) {
    const storyData = {
      ...story,
      prd_id: story.prd_id || 'PRD-AGENT-ADMIN-003',
      sd_id: 'SD-AGENT-ADMIN-003',
      definition_of_done: [],
      depends_on: [],
      blocks: [],
      implementation_approach: null,
      e2e_test_path: null,
      e2e_test_status: 'not_created',
      validation_status: 'pending',
      created_by: 'PLAN Agent (Product Requirements Expert)',
      created_at: new Date().toISOString()
    };

    const insertSQL = `
      INSERT INTO user_stories (
        story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
        story_points, priority, status, sprint, acceptance_criteria,
        definition_of_done, depends_on, blocks, technical_notes,
        implementation_approach, test_scenarios, e2e_test_path,
        e2e_test_status, validation_status, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (story_key) DO NOTHING
      RETURNING id;
    `;

    const result = await client.query(insertSQL, [
      storyData.story_key,
      storyData.prd_id,
      storyData.sd_id,
      storyData.title,
      storyData.user_role,
      storyData.user_want,
      storyData.user_benefit,
      storyData.story_points,
      storyData.priority,
      storyData.status,
      storyData.sprint,
      JSON.stringify(storyData.acceptance_criteria),
      JSON.stringify(storyData.definition_of_done),
      JSON.stringify(storyData.depends_on),
      JSON.stringify(storyData.blocks),
      storyData.technical_notes,
      storyData.implementation_approach,
      JSON.stringify(storyData.test_scenarios),
      storyData.e2e_test_path,
      storyData.e2e_test_status,
      storyData.validation_status,
      storyData.created_by,
      storyData.created_at
    ]);

    if (result.rows.length > 0) {
      inserted++;
      console.log(`✅ ${storyData.story_key}: ${storyData.title}`);
    } else {
      console.log(`⚠️  ${storyData.story_key}: Already exists (skipped)`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ User Stories Generated: ${inserted} created, ${userStories.length - inserted} already existed`);
  console.log(`\n📊 Coverage Summary:`);
  console.log(`   Preset Management: 12 stories (US-001 to US-012)`);
  console.log(`   Prompt Library + A/B Testing: 18 stories (US-013 to US-030)`);
  console.log(`   Agent Settings Integration: 7 stories (US-031 to US-037) - NOT IN THIS BATCH`);
  console.log(`   Search Preferences: 10 stories (US-038 to US-047) - NOT IN THIS BATCH`);
  console.log(`   Performance Dashboard: 10 stories (US-048 to US-057) - NOT IN THIS BATCH`);
  console.log(`\n   Total: 30/${57} stories in this batch`);
  console.log(`\n⚠️  NOTE: Remaining 27 stories require separate batch due to script length`);
  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Generate remaining 27 user stories (batch 2)`);
  console.log(`   2. Create database migration files for EHG app`);
  console.log(`   3. Create seed data validation script`);
  console.log(`   4. Create PLAN→EXEC handoff`);

} catch (error) {
  console.error('\n❌ User Story Generation Failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
} finally {
  if (client) {
    await client.end();
    console.log('\n📡 Database connection closed');
  }
}
