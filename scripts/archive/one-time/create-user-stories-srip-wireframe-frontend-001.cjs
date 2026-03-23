require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Step 1: Probe schema
  const { data: probe, error: probeErr } = await supabase
    .from('user_stories')
    .select('*')
    .limit(1);

  if (probeErr) {
    console.error('Schema probe failed:', probeErr);
    process.exit(1);
  }

  if (probe && probe.length > 0) {
    console.log('User stories columns:', Object.keys(probe[0]).join(', '));
  } else {
    console.log('Table exists but empty; proceeding with known schema.');
  }

  const SD_ID = 'a9790c5e-0fd1-410c-9302-374856bf88ec';
  const PRD_ID = '76e48d09-a6d2-493f-94e2-1afff8c2d082';
  const SD_KEY = 'SD-LEO-FEAT-SRIP-WIREFRAME-FRONTEND-001';

  const stories = [
    {
      story_key: `${SD_KEY}:US-001`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'WireframeViewer renders ASCII wireframe layouts',
      user_role: 'Chairman',
      user_want: 'to view SRIP wireframe layouts as rendered ASCII art in the dashboard so I can review proposed UI structures',
      user_benefit: 'I can visually assess and approve wireframe designs without requiring external tools or design software',
      given_when_then: [
        {
          id: 'AC-001-1',
          scenario: 'Happy path - Wireframe data renders correctly',
          given: 'WireframeViewer component receives valid ASCII wireframe data from the SRIP pipeline',
          when: 'The component mounts and renders',
          then: 'ASCII wireframe is displayed in a monospace font container with correct alignment and spacing preserved'
        },
        {
          id: 'AC-001-2',
          scenario: 'Multiple wireframe sections render in sequence',
          given: 'Wireframe data contains multiple page/section layouts',
          when: 'WireframeViewer renders the data',
          then: 'Each section is rendered with clear visual separation and section labels'
        },
        {
          id: 'AC-001-3',
          scenario: 'Error path - Invalid wireframe data',
          given: 'WireframeViewer receives malformed or null wireframe data',
          when: 'The component attempts to render',
          then: 'A descriptive error message is shown instead of a blank screen or crash'
        }
      ],
      acceptance_criteria: [
        'WireframeViewer.tsx renders ASCII layouts in monospace font container',
        'Alignment and spacing of ASCII art is preserved',
        'Multiple sections render with visual separation',
        'Malformed data shows error message, not blank/crash'
      ],
      story_points: 3,
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        description: 'Create WireframeViewer.tsx component that renders ASCII wireframe layouts from SRIP pipeline data',
        key_files: [
          'src/components/chairman-v2/WireframeViewer.tsx'
        ],
        approach: 'Pre-formatted block with monospace font, split multi-section data, handle null/malformed gracefully'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Valid wireframe renders correctly', priority: 'P0' },
          { id: 'TC-002', scenario: 'Multi-section wireframe renders with separators', priority: 'P1' },
          { id: 'TC-003', scenario: 'Null/malformed data shows error state', priority: 'P0' }
        ]
      },
      technical_notes: ['Use <pre> or CSS white-space:pre for ASCII fidelity', 'Monospace font stack: Fira Code, Consolas, monospace'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: `${SD_KEY}:US-002`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'SripDashboard displays SRIP brand interview data',
      user_role: 'Chairman',
      user_want: 'to see SRIP brand interview results organized in a dashboard view so I can understand the brand positioning research at a glance',
      user_benefit: 'I can make informed strategic decisions based on consolidated brand interview insights without manually parsing raw data',
      given_when_then: [
        {
          id: 'AC-002-1',
          scenario: 'Happy path - Dashboard loads interview data',
          given: 'SripDashboard component receives SRIP brand interview data from the API',
          when: 'The dashboard mounts',
          then: 'Interview data is displayed in organized sections showing key brand attributes, themes, and interview summaries'
        },
        {
          id: 'AC-002-2',
          scenario: 'Dashboard shows structured brand metrics',
          given: 'Interview data includes quantitative brand metrics and qualitative themes',
          when: 'SripDashboard renders the data',
          then: 'Metrics are displayed with appropriate visual indicators and themes are grouped by category'
        },
        {
          id: 'AC-002-3',
          scenario: 'Edge case - Partial interview data',
          given: 'Some interview fields are missing or incomplete',
          when: 'SripDashboard renders',
          then: 'Available data is displayed and missing sections show appropriate placeholder text rather than broken layout'
        }
      ],
      acceptance_criteria: [
        'SripDashboard.tsx displays brand interview data in organized sections',
        'Key brand attributes and themes are grouped and labeled',
        'Quantitative metrics shown with visual indicators',
        'Partial/missing data renders gracefully with placeholders'
      ],
      story_points: 3,
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        description: 'Create SripDashboard.tsx that displays SRIP brand interview data with structured sections for attributes, themes, and summaries',
        key_files: [
          'src/components/chairman-v2/SripDashboard.tsx'
        ],
        approach: 'Card-based layout with sections for metrics, themes, and summaries; handle partial data with conditional rendering'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Full interview data renders all sections', priority: 'P0' },
          { id: 'TC-002', scenario: 'Partial data shows placeholders', priority: 'P1' },
          { id: 'TC-003', scenario: 'Empty data shows empty state', priority: 'P0' }
        ]
      },
      technical_notes: ['Use Shadcn Card components for section layout', 'Consider collapsible sections for lengthy interview content'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: `${SD_KEY}:US-003`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'Navigation flow visualization in WireframeViewer',
      user_role: 'Chairman',
      user_want: 'to see how screens connect and flow between each other in the wireframe viewer so I can evaluate the proposed user journey',
      user_benefit: 'I can validate navigation logic and user flow before development begins, catching UX issues early',
      given_when_then: [
        {
          id: 'AC-003-1',
          scenario: 'Happy path - Navigation flow arrows render',
          given: 'Wireframe data includes navigation flow metadata linking screens together',
          when: 'WireframeViewer renders with flow visualization enabled',
          then: 'Directional indicators (arrows or connectors) show navigation paths between wireframe sections'
        },
        {
          id: 'AC-003-2',
          scenario: 'Interactive flow navigation',
          given: 'Multiple screens with navigation connections are displayed',
          when: 'User clicks on a navigation indicator or target screen label',
          then: 'The view scrolls to or highlights the connected wireframe section'
        },
        {
          id: 'AC-003-3',
          scenario: 'Edge case - No flow data available',
          given: 'Wireframe data does not include navigation flow metadata',
          when: 'WireframeViewer renders',
          then: 'Wireframes render normally without flow indicators and no error is thrown'
        }
      ],
      acceptance_criteria: [
        'Navigation flow arrows/connectors render between linked wireframe sections',
        'Clicking a flow indicator scrolls to or highlights the target section',
        'Flow visualization degrades gracefully when no flow metadata exists',
        'Flow direction is visually clear (source -> target)'
      ],
      story_points: 2,
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        description: 'Add navigation flow visualization to WireframeViewer showing connections between screens',
        key_files: [
          'src/components/chairman-v2/WireframeViewer.tsx'
        ],
        approach: 'Parse flow metadata from wireframe data, render directional connectors between sections, add click-to-navigate behavior'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Flow arrows render between connected screens', priority: 'P0' },
          { id: 'TC-002', scenario: 'Click navigates to target section', priority: 'P1' },
          { id: 'TC-003', scenario: 'No flow metadata renders wireframes without errors', priority: 'P0' }
        ]
      },
      technical_notes: ['Use CSS-based arrows or SVG connectors for flow indicators', 'scrollIntoView for click-to-navigate'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: `${SD_KEY}:US-004`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'ARTIFACT_ICONS extended for SRIP types',
      user_role: 'EVA System',
      user_want: 'SRIP-specific artifact types to have dedicated icons in the artifact icon registry so they are visually distinct from other artifact types',
      user_benefit: 'Users can quickly identify SRIP artifacts (wireframes, brand interviews, navigation flows) by their unique icons in any artifact listing',
      given_when_then: [
        {
          id: 'AC-004-1',
          scenario: 'Happy path - SRIP artifact icons registered',
          given: 'ARTIFACT_ICONS constant/map is defined in the codebase',
          when: 'A new SRIP artifact type (wireframe, brand_interview, navigation_flow) is referenced',
          then: 'The corresponding SRIP-specific icon is returned from the registry'
        },
        {
          id: 'AC-004-2',
          scenario: 'Icons render in artifact listings',
          given: 'An artifact list includes SRIP-type artifacts',
          when: 'The list renders each artifact row',
          then: 'SRIP artifacts display their dedicated icons and non-SRIP artifacts continue using their existing icons'
        },
        {
          id: 'AC-004-3',
          scenario: 'Edge case - Unknown SRIP sub-type',
          given: 'An SRIP artifact has a sub-type not yet in the registry',
          when: 'The icon lookup occurs',
          then: 'A generic SRIP fallback icon is returned rather than undefined or a broken image'
        }
      ],
      acceptance_criteria: [
        'ARTIFACT_ICONS includes entries for wireframe, brand_interview, and navigation_flow types',
        'Each SRIP type has a visually distinct icon',
        'Unknown SRIP sub-types fall back to a generic SRIP icon',
        'Existing non-SRIP artifact icons are unaffected'
      ],
      story_points: 1,
      priority: 'high',
      status: 'ready',
      implementation_context: {
        description: 'Extend ARTIFACT_ICONS constant with SRIP-specific icon mappings for wireframe, brand_interview, and navigation_flow',
        key_files: [
          'src/components/chairman-v2/constants.ts'
        ],
        approach: 'Add new entries to ARTIFACT_ICONS map with Lucide or Shadcn icons; add SRIP fallback entry'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Each SRIP type returns correct icon', priority: 'P0' },
          { id: 'TC-002', scenario: 'Unknown sub-type returns fallback', priority: 'P1' },
          { id: 'TC-003', scenario: 'Existing icons unchanged', priority: 'P0' }
        ]
      },
      technical_notes: ['Lucide icons: Layout, MessageSquare, GitBranch as candidates', 'Ensure icon size consistency with existing entries'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: `${SD_KEY}:US-005`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'Export new SRIP components from index.ts',
      user_role: 'EVA System',
      user_want: 'WireframeViewer and SripDashboard to be exported from the chairman-v2 index.ts barrel file so they can be imported by other modules',
      user_benefit: 'Other parts of the application can import SRIP components through the standard barrel export pattern, maintaining codebase consistency',
      given_when_then: [
        {
          id: 'AC-005-1',
          scenario: 'Happy path - Components importable from barrel',
          given: 'WireframeViewer.tsx and SripDashboard.tsx exist in the chairman-v2 directory',
          when: 'Another module imports from the chairman-v2 index.ts barrel file',
          then: 'Both WireframeViewer and SripDashboard are available as named exports'
        },
        {
          id: 'AC-005-2',
          scenario: 'TypeScript compilation succeeds',
          given: 'index.ts includes export statements for the new SRIP components',
          when: 'TypeScript compiler runs (tsc --noEmit)',
          then: 'No type errors are produced and all exports resolve correctly'
        },
        {
          id: 'AC-005-3',
          scenario: 'Edge case - Tree-shaking compatibility',
          given: 'SRIP components are exported via named exports (not default)',
          when: 'A consuming module imports only WireframeViewer',
          then: 'SripDashboard is not included in the bundle (tree-shakeable)'
        }
      ],
      acceptance_criteria: [
        'index.ts exports WireframeViewer and SripDashboard as named exports',
        'TypeScript compilation passes with no errors',
        'Named exports are tree-shakeable',
        'Existing exports in index.ts are unchanged'
      ],
      story_points: 1,
      priority: 'high',
      status: 'ready',
      implementation_context: {
        description: 'Add export statements for WireframeViewer and SripDashboard to the chairman-v2 index.ts barrel file',
        key_files: [
          'src/components/chairman-v2/index.ts'
        ],
        approach: 'Add named re-exports: export { WireframeViewer } from ./WireframeViewer and export { SripDashboard } from ./SripDashboard'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Named exports available from barrel', priority: 'P0' },
          { id: 'TC-002', scenario: 'tsc --noEmit passes', priority: 'P0' }
        ]
      },
      technical_notes: ['Use named exports for tree-shaking support', 'Keep alphabetical order in barrel file'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: `${SD_KEY}:US-006`,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: 'Graceful empty states for SRIP components',
      user_role: 'Chairman',
      user_want: 'SRIP components to show meaningful empty states when no data is available so I understand the system status rather than seeing blank screens',
      user_benefit: 'I am never confused by blank areas in the dashboard and always know whether data is loading, unavailable, or not yet generated',
      given_when_then: [
        {
          id: 'AC-006-1',
          scenario: 'Happy path - WireframeViewer empty state',
          given: 'WireframeViewer receives no wireframe data (null or empty array)',
          when: 'The component renders',
          then: 'A styled empty state is shown with an icon, a message like "No wireframes available", and a brief explanation'
        },
        {
          id: 'AC-006-2',
          scenario: 'Happy path - SripDashboard empty state',
          given: 'SripDashboard receives no interview data',
          when: 'The component renders',
          then: 'A styled empty state is shown indicating no brand interview data is available with a suggestion to run the SRIP pipeline'
        },
        {
          id: 'AC-006-3',
          scenario: 'Loading state while data fetches',
          given: 'SRIP data is being fetched from the API',
          when: 'The component is in loading state',
          then: 'A skeleton loader or spinner is displayed, distinct from the empty state'
        },
        {
          id: 'AC-006-4',
          scenario: 'Error state on fetch failure',
          given: 'API call to fetch SRIP data fails with a network or server error',
          when: 'The component handles the error',
          then: 'An error state is shown with the error message and a retry option'
        }
      ],
      acceptance_criteria: [
        'WireframeViewer shows styled empty state with icon and message when no data',
        'SripDashboard shows styled empty state with action suggestion when no data',
        'Loading state shows skeleton/spinner distinct from empty state',
        'Error state shows message and retry button on fetch failure',
        'Empty states are visually consistent with existing chairman-v2 component patterns'
      ],
      story_points: 2,
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        description: 'Add empty, loading, and error states to WireframeViewer and SripDashboard components',
        key_files: [
          'src/components/chairman-v2/WireframeViewer.tsx',
          'src/components/chairman-v2/SripDashboard.tsx'
        ],
        approach: 'Use existing empty state patterns from chairman-v2 components; add loading skeleton and error boundary with retry'
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Null data shows empty state in WireframeViewer', priority: 'P0' },
          { id: 'TC-002', scenario: 'Null data shows empty state in SripDashboard', priority: 'P0' },
          { id: 'TC-003', scenario: 'Loading state shows skeleton', priority: 'P1' },
          { id: 'TC-004', scenario: 'Error state shows message and retry', priority: 'P1' }
        ]
      },
      technical_notes: ['Reuse existing empty state component if available in chairman-v2', 'Shadcn Skeleton component for loading state'],
      depends_on: [],
      blocks: []
    }
  ];

  console.log(`Inserting ${stories.length} user stories for ${SD_KEY}...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const story of stories) {
    const { data, error } = await supabase
      .from('user_stories')
      .upsert({
        story_key: story.story_key,
        sd_id: story.sd_id,
        prd_id: story.prd_id,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        given_when_then: story.given_when_then,
        acceptance_criteria: story.acceptance_criteria,
        story_points: story.story_points,
        priority: story.priority,
        status: story.status,
        implementation_context: story.implementation_context,
        testing_scenarios: story.testing_scenarios,
        technical_notes: story.technical_notes,
        depends_on: story.depends_on,
        blocks: story.blocks,
        validation_status: 'pending',
        e2e_test_status: 'not_created',
        created_by: 'STORIES-AGENT-v2.0.0'
      }, { onConflict: 'story_key' })
      .select('story_key, title');

    if (error) {
      console.error(`FAILED ${story.story_key}:`, error.message);
      console.error('  Details:', JSON.stringify(error, null, 2));
      failCount++;
    } else {
      console.log(`OK ${story.story_key}: ${story.title}`);
      successCount++;
    }
  }

  console.log(`\nResults: ${successCount} inserted, ${failCount} failed`);
  console.log(`Total story points: ${stories.reduce((sum, s) => sum + s.story_points, 0)}`);

  if (failCount > 0) {
    process.exit(1);
  }
})();
