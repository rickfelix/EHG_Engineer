#!/usr/bin/env node

/**
 * User Story Generation for SD-FOUNDATION-V3-008
 * Four Buckets Decision Evidence End-to-End
 *
 * Following STORIES Agent v2.0.0 Guidelines:
 * - INVEST criteria validation
 * - Given-When-Then acceptance criteria
 * - Rich implementation context
 * - E2E test mapping placeholders
 * - Architecture references
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-FOUNDATION-V3-008';
const SD_ID = 'SD-FOUNDATION-V3-008'; // Same as key in v2 table

/**
 * User Stories for Four Buckets Decision Evidence
 *
 * FR-001: Wire venture_artifacts epistemic data (CRITICAL)
 * FR-002: Integrate assumption_sets validation (HIGH)
 * FR-003: Include cost context from token ledger (MEDIUM)
 * FR-004: Remove all placeholder evidence (CRITICAL)
 */
const USER_STORIES = [
  {
    story_key: 'SD-FOUNDATION-V3-008:US-001',
    title: 'Wire venture_artifacts epistemic data to decision evidence API',
    user_role: 'Chairman (Rick)',
    user_want: 'see real Facts/Assumptions/Simulations/Unknowns from venture_artifacts epistemic classification',
    user_benefit: 'I can make informed decisions based on actual epistemic status of information, not placeholder data',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - retrieve epistemic facts',
        given: 'venture_artifacts table has records with epistemic_category = "fact" AND epistemic_confidence >= 0.8',
        when: 'Chairman views decision evidence for a venture',
        then: 'API returns actual facts in evidence.facts array AND each fact includes artifact_id, content, confidence_score, and source_reference',
        test_data: {
          venture_id: 'test-venture-001',
          artifact_type: 'market_analysis',
          epistemic_category: 'fact',
          epistemic_confidence: 0.9
        }
      },
      {
        id: 'AC-001-2',
        scenario: 'Happy path - classify all four buckets',
        given: 'venture has artifacts with all epistemic categories (fact, assumption, simulation, unknown)',
        when: 'Chairman requests decision evidence',
        then: 'API returns populated arrays for facts[], assumptions[], simulations[], unknowns[] AND each bucket contains only artifacts matching that category',
        expected_buckets: ['facts', 'assumptions', 'simulations', 'unknowns']
      },
      {
        id: 'AC-001-3',
        scenario: 'Edge case - no epistemic data',
        given: 'venture has no artifacts OR all artifacts have NULL epistemic_category',
        when: 'Chairman requests decision evidence',
        then: 'API returns empty arrays for all buckets (not null) AND logs warning about missing epistemic classification',
        expected_error: null
      },
      {
        id: 'AC-001-4',
        scenario: 'Data quality - confidence threshold',
        given: 'venture has facts with varying epistemic_confidence scores',
        when: 'API retrieves fact-type evidence',
        then: 'Only artifacts with confidence >= 0.7 are returned AND artifacts are sorted by confidence DESC',
        test_data: {
          confidence_threshold: 0.7
        }
      }
    ],
    story_points: 5,
    priority: 'critical',
    functional_requirement: 'FR-001',
    implementation_context: {
      description: 'Create API endpoint to query venture_artifacts by epistemic_category and map to Four Buckets structure',
      architecture_references: [
        'database/schema/venture_artifacts table (epistemic_category, epistemic_confidence columns)',
        'pages/api/ventures/[id]/decision-evidence.ts (existing endpoint to modify)',
        'src/types/ventures.ts (Evidence type definition)'
      ],
      example_code_patterns: {
        database_query: `
// Query facts from venture_artifacts
const { data: facts, error } = await supabase
  .from('venture_artifacts')
  .select('id, content, artifact_type, epistemic_confidence, created_at')
  .eq('venture_id', ventureId)
  .eq('epistemic_category', 'fact')
  .gte('epistemic_confidence', 0.7)
  .order('epistemic_confidence', { ascending: false });
`,
        response_mapping: `
// Map to Evidence structure
const evidence = {
  facts: facts.map(f => ({
    artifact_id: f.id,
    content: f.content,
    confidence: f.epistemic_confidence,
    source: f.artifact_type,
    timestamp: f.created_at
  })),
  assumptions: [], // Similar mapping
  simulations: [],
  unknowns: []
};
`
      },
      integration_points: [
        'venture_artifacts table - source of epistemic data',
        'decision-evidence API endpoint - consumer of mapped data',
        'Chairman decision UI - displays Four Buckets'
      ],
      edge_cases: [
        'Venture has no artifacts - return empty arrays',
        'Artifacts missing epistemic_category - log warning, exclude from results',
        'Low confidence facts (< 0.7) - exclude or flag separately',
        'Duplicate artifacts - deduplicate by artifact_id'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-001-epistemic-evidence.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Retrieve facts for venture with epistemic data', priority: 'P0' },
        { id: 'TC-002', scenario: 'All four buckets populated correctly', priority: 'P0' },
        { id: 'TC-003', scenario: 'Empty arrays when no epistemic data', priority: 'P1' },
        { id: 'TC-004', scenario: 'Confidence threshold filtering', priority: 'P2' }
      ]
    }
  },

  {
    story_key: 'SD-FOUNDATION-V3-008:US-002',
    title: 'Integrate assumption_sets validation status into Assumptions bucket',
    user_role: 'Chairman (Rick)',
    user_want: 'see which assumptions have been validated vs still need validation',
    user_benefit: 'I can identify which beliefs are verified vs speculative, reducing decision risk',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - show validation status',
        given: 'assumption_sets table has records with reality_status values (validated, invalidated, pending)',
        when: 'Chairman views Assumptions bucket in decision evidence',
        then: 'Each assumption shows validation_status AND reality_status AND validation_date if validated',
        test_data: {
          assumption_id: 'test-assumption-001',
          reality_status: 'validated',
          validation_method: 'market_research'
        }
      },
      {
        id: 'AC-002-2',
        scenario: 'Data integration - join assumptions with artifacts',
        given: 'assumption_sets references venture_artifacts via artifact_id',
        when: 'API retrieves Assumptions bucket',
        then: 'Assumptions include both artifact content AND assumption_set validation metadata',
        expected_fields: ['content', 'validation_status', 'reality_status', 'confidence']
      },
      {
        id: 'AC-002-3',
        scenario: 'Edge case - invalidated assumptions',
        given: 'assumption has reality_status = "invalidated"',
        when: 'Chairman views Assumptions bucket',
        then: 'Invalidated assumption is flagged prominently AND includes invalidation_reason AND suggests re-evaluation',
        expected_warning: 'This assumption has been invalidated'
      }
    ],
    story_points: 5,
    priority: 'high',
    functional_requirement: 'FR-002',
    implementation_context: {
      description: 'Join assumption_sets with venture_artifacts to enrich Assumptions bucket with validation metadata',
      architecture_references: [
        'database/schema/assumption_sets table (reality_status, validation_method)',
        'database/schema/venture_artifacts table (epistemic_category = "assumption")',
        'pages/api/ventures/[id]/decision-evidence.ts (Assumptions bucket logic)'
      ],
      example_code_patterns: {
        database_query: `
// Join assumptions with validation status
const { data: assumptions, error } = await supabase
  .from('venture_artifacts')
  .select(\`
    id,
    content,
    epistemic_confidence,
    assumption_sets (
      id,
      reality_status,
      validation_method,
      validation_date,
      invalidation_reason
    )
  \`)
  .eq('venture_id', ventureId)
  .eq('epistemic_category', 'assumption');
`,
        response_mapping: `
// Map to Assumption structure
const assumptions = data.map(a => ({
  artifact_id: a.id,
  content: a.content,
  confidence: a.epistemic_confidence,
  validation_status: a.assumption_sets[0]?.reality_status || 'pending',
  validation_method: a.assumption_sets[0]?.validation_method,
  validated_at: a.assumption_sets[0]?.validation_date,
  needs_revalidation: a.assumption_sets[0]?.reality_status === 'invalidated'
}));
`
      },
      integration_points: [
        'assumption_sets table - validation metadata',
        'venture_artifacts table - assumption content',
        'Chairman UI - displays validation status badges'
      ],
      edge_cases: [
        'Assumption with no assumption_set record - default to "pending"',
        'Multiple assumption_sets for same artifact - use most recent',
        'Invalidated assumption still used in decision - show warning'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-002-assumption-validation.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Show validation status for all assumptions', priority: 'P0' },
        { id: 'TC-002', scenario: 'Flag invalidated assumptions prominently', priority: 'P0' },
        { id: 'TC-003', scenario: 'Handle assumptions without validation records', priority: 'P1' }
      ]
    }
  },

  {
    story_key: 'SD-FOUNDATION-V3-008:US-003',
    title: 'Include cost/investment context from venture_token_ledger in decision evidence',
    user_role: 'Chairman (Rick)',
    user_want: 'see how much I have invested in gathering each piece of evidence',
    user_benefit: 'I can evaluate ROI of evidence gathering and prioritize high-value information sources',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - show token costs',
        given: 'venture_token_ledger has records tracking token usage for artifact generation',
        when: 'Chairman views decision evidence',
        then: 'Each evidence item shows tokens_used AND estimated_cost AND generation_method',
        test_data: {
          artifact_id: 'test-artifact-001',
          tokens_used: 5000,
          model: 'claude-opus-4-5'
        }
      },
      {
        id: 'AC-003-2',
        scenario: 'Aggregation - total evidence cost',
        given: 'venture has multiple pieces of evidence with associated token costs',
        when: 'Chairman views full decision evidence',
        then: 'Summary shows total_tokens_used AND total_estimated_cost AND cost_by_bucket breakdown',
        expected_fields: ['total_cost', 'facts_cost', 'assumptions_cost', 'simulations_cost']
      },
      {
        id: 'AC-003-3',
        scenario: 'Edge case - no cost data',
        given: 'artifact has no corresponding venture_token_ledger record',
        when: 'API retrieves cost context',
        then: 'Cost fields show null (not error) AND artifact is still returned in evidence',
        expected_cost: null
      }
    ],
    story_points: 2,
    priority: 'medium',
    functional_requirement: 'FR-003',
    implementation_context: {
      description: 'Join venture_token_ledger to enrich evidence items with cost context',
      architecture_references: [
        'database/schema/venture_token_ledger table (tokens_used, model)',
        'pages/api/ventures/[id]/decision-evidence.ts (cost aggregation logic)'
      ],
      example_code_patterns: {
        database_query: `
// Get token costs for artifacts
const { data: costs, error } = await supabase
  .from('venture_token_ledger')
  .select('artifact_id, tokens_used, model, estimated_cost')
  .in('artifact_id', artifactIds);

// Create cost lookup
const costMap = costs.reduce((acc, c) => {
  acc[c.artifact_id] = {
    tokens: c.tokens_used,
    cost: c.estimated_cost,
    model: c.model
  };
  return acc;
}, {});
`,
        cost_calculation: `
// Estimate cost if not in ledger
const COST_PER_1K_TOKENS = {
  'claude-opus-4-5': 0.015,
  'claude-sonnet-4-5': 0.003
};

function estimateCost(tokens, model) {
  const rate = COST_PER_1K_TOKENS[model] || 0.003;
  return (tokens / 1000) * rate;
}
`
      },
      integration_points: [
        'venture_token_ledger table - cost tracking',
        'venture_artifacts table - artifact generation metadata',
        'Chairman UI - cost display badges'
      ],
      edge_cases: [
        'Artifact generated without token tracking - estimate based on content length',
        'Unknown model in ledger - use default rate',
        'Negative or zero token counts - flag as data error'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-003-evidence-costs.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Display token costs for each evidence item', priority: 'P1' },
        { id: 'TC-002', scenario: 'Calculate total cost across all buckets', priority: 'P1' },
        { id: 'TC-003', scenario: 'Handle missing cost data gracefully', priority: 'P2' }
      ]
    }
  },

  {
    story_key: 'SD-FOUNDATION-V3-008:US-004',
    title: 'Remove all placeholder evidence data from production API',
    user_role: 'Chairman (Rick)',
    user_want: 'only real data in decision evidence, never placeholder/mock data',
    user_benefit: 'I trust the evidence shown is genuine and can make high-stakes decisions confidently',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Validation - no placeholder data',
        given: 'decision evidence API has been updated to use real data sources',
        when: 'Any venture is queried for decision evidence',
        then: 'Response contains ONLY data from database tables (venture_artifacts, assumption_sets, token_ledger) AND zero hardcoded placeholder objects',
        test_data: {
          validation_method: 'grep for "placeholder", "mock", "TODO" in API code'
        }
      },
      {
        id: 'AC-004-2',
        scenario: 'Code review - remove placeholder code',
        given: 'API endpoint previously returned placeholder data',
        when: 'Code is reviewed for US-F3-008-004',
        then: 'All placeholder/mock data logic is deleted AND replaced with real database queries AND git diff shows removal of placeholder code',
        expected_removals: ['evidence: { facts: [], assumptions: [], simulations: [], unknowns: [] }']
      },
      {
        id: 'AC-004-3',
        scenario: 'Edge case - empty results vs placeholder',
        given: 'venture has no artifacts in database',
        when: 'Decision evidence is requested',
        then: 'API returns empty arrays (which is correct) AND NOT placeholder data AND response clearly indicates "no evidence available"',
        expected_response: { facts: [], assumptions: [], simulations: [], unknowns: [], message: 'No evidence available for this venture' }
      }
    ],
    story_points: 2,
    priority: 'critical',
    functional_requirement: 'FR-004',
    implementation_context: {
      description: 'Search and destroy all placeholder/mock data in decision evidence API, replace with real database queries',
      architecture_references: [
        'pages/api/ventures/[id]/decision-evidence.ts (primary file to clean)',
        'src/types/ventures.ts (ensure Evidence type supports real data structure)'
      ],
      example_code_patterns: {
        before_placeholder: `
// REMOVE THIS
const evidence = {
  facts: [],
  assumptions: [],
  simulations: [],
  unknowns: []
};
`,
        after_real_data: `
// REPLACE WITH THIS
const evidence = await getDecisionEvidenceFromDatabase(ventureId);
// evidence populated from venture_artifacts, assumption_sets, token_ledger
`,
        validation_test: `
// E2E test to ensure no placeholder data
test('US-F3-008-004: No placeholder evidence in production', async () => {
  const response = await fetch('/api/ventures/test-id/decision-evidence');
  const data = await response.json();

  // Check that data came from database (has real IDs, timestamps, etc)
  if (data.evidence.facts.length > 0) {
    expect(data.evidence.facts[0]).toHaveProperty('artifact_id');
    expect(data.evidence.facts[0]).toHaveProperty('timestamp');
    expect(data.evidence.facts[0].artifact_id).not.toBe('placeholder');
  }
});
`
      },
      integration_points: [
        'pages/api/ventures/[id]/decision-evidence.ts - file to modify',
        'All real data sources wired in US-F3-008-001, 002, 003'
      ],
      edge_cases: [
        'Empty database tables - return empty arrays (not placeholder)',
        'Partial data availability - return what exists (not fill with placeholders)',
        'API errors - return error message (not fall back to placeholder data)'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-004-no-placeholders.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Verify zero placeholder data in API response', priority: 'P0' },
        { id: 'TC-002', scenario: 'Code contains no "placeholder" or "mock" strings', priority: 'P0' },
        { id: 'TC-003', scenario: 'Empty data returns empty arrays, not placeholders', priority: 'P1' }
      ]
    }
  },

  {
    story_key: 'SD-FOUNDATION-V3-008:US-005',
    title: 'Display Four Buckets evidence in Chairman decision UI with epistemic indicators',
    user_role: 'Chairman (Rick)',
    user_want: 'visual distinction between Facts, Assumptions, Simulations, and Unknowns in the UI',
    user_benefit: 'I can quickly assess the epistemic quality of my information at a glance',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - display all four buckets',
        given: 'Decision evidence API returns data for all four buckets',
        when: 'Chairman views venture decision page',
        then: 'UI shows four distinct sections labeled Facts, Assumptions, Simulations, Unknowns AND each section uses distinct visual styling (color, icon)',
        test_data: {
          bucket_colors: {
            facts: 'green',
            assumptions: 'yellow',
            simulations: 'blue',
            unknowns: 'gray'
          }
        }
      },
      {
        id: 'AC-005-2',
        scenario: 'Data display - show epistemic metadata',
        given: 'Each evidence item has confidence score and validation status',
        when: 'Chairman hovers over or clicks evidence item',
        then: 'UI shows confidence score, source, timestamp, cost AND validation status for assumptions',
        expected_fields: ['confidence_badge', 'source_label', 'cost_indicator']
      },
      {
        id: 'AC-005-3',
        scenario: 'Edge case - empty buckets',
        given: 'One or more buckets have no evidence items',
        when: 'Chairman views decision evidence',
        then: 'Empty buckets show "No [bucket] available" message AND do not hide section (keep visible for clarity)',
        expected_message: 'No facts available for this venture'
      },
      {
        id: 'AC-005-4',
        scenario: 'Interaction - filter by bucket',
        given: 'Chairman wants to focus on specific evidence type',
        when: 'Chairman clicks bucket filter (e.g., "Show only Facts")',
        then: 'UI highlights selected bucket AND dims others AND updates evidence count',
        expected_interaction: 'toggle_filter'
      }
    ],
    story_points: 5,
    priority: 'high',
    functional_requirement: 'FR-001 (UI component)',
    implementation_context: {
      description: 'Create React component to display Four Buckets evidence with epistemic visual indicators',
      architecture_references: [
        'src/client/src/components/ventures/ (create EvidenceBuckets.tsx)',
        'src/client/src/pages/ventures/[id]/decision.tsx (integrate component)',
        'src/client/src/hooks/useVentures.ts (fetch decision evidence)'
      ],
      example_code_patterns: {
        component_structure: `
// EvidenceBuckets.tsx
interface EvidenceBucketsProps {
  evidence: DecisionEvidence;
}

const BUCKET_CONFIG = {
  facts: { color: 'green', icon: CheckCircle, label: 'Facts' },
  assumptions: { color: 'yellow', icon: AlertTriangle, label: 'Assumptions' },
  simulations: { color: 'blue', icon: TrendingUp, label: 'Simulations' },
  unknowns: { color: 'gray', icon: HelpCircle, label: 'Unknowns' }
};

export const EvidenceBuckets: React.FC<EvidenceBucketsProps> = ({ evidence }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Object.entries(BUCKET_CONFIG).map(([bucket, config]) => (
        <BucketCard
          key={bucket}
          title={config.label}
          items={evidence[bucket]}
          color={config.color}
          icon={config.icon}
        />
      ))}
    </div>
  );
};
`,
        data_fetching: `
// useDecisionEvidence.ts
export function useDecisionEvidence(ventureId: string) {
  return useQuery({
    queryKey: ['decision-evidence', ventureId],
    queryFn: async () => {
      const res = await fetch(\`/api/ventures/\${ventureId}/decision-evidence\`);
      if (!res.ok) throw new Error('Failed to fetch evidence');
      return res.json();
    }
  });
}
`
      },
      integration_points: [
        'pages/api/ventures/[id]/decision-evidence.ts - data source',
        'src/client/src/components/ventures/EvidenceBuckets.tsx - new UI component',
        'src/client/src/pages/ventures/[id]/decision.tsx - page integration'
      ],
      edge_cases: [
        'All buckets empty - show message "No evidence available yet"',
        'Very long evidence content - truncate with "Read more"',
        'High number of items - paginate or virtual scroll',
        'Loading state - show skeleton loaders for each bucket'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-005-ui-buckets.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Display all four buckets with correct styling', priority: 'P0' },
        { id: 'TC-002', scenario: 'Show epistemic metadata on hover', priority: 'P1' },
        { id: 'TC-003', scenario: 'Handle empty buckets gracefully', priority: 'P1' },
        { id: 'TC-004', scenario: 'Filter/highlight functionality works', priority: 'P2' }
      ]
    }
  },

  {
    story_key: 'SD-FOUNDATION-V3-008:US-006',
    title: 'Implement epistemic provenance chain for evidence traceability',
    user_role: 'Chairman (Rick)',
    user_want: 'trace each piece of evidence back to its original source and transformation history',
    user_benefit: 'I can verify the lineage of information and assess its trustworthiness based on provenance',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - show provenance chain',
        given: 'Evidence item has artifact_id linking to venture_artifacts with source_reference',
        when: 'Chairman clicks "View provenance" on evidence item',
        then: 'UI displays provenance chain: original_source → transformation_method → current_artifact AND includes timestamps and confidence changes',
        test_data: {
          provenance_chain: [
            { step: 'Market research PDF uploaded', timestamp: '2025-01-15' },
            { step: 'Claude extracted key facts', timestamp: '2025-01-16' },
            { step: 'Validated by assumption_set', timestamp: '2025-01-20' }
          ]
        }
      },
      {
        id: 'AC-006-2',
        scenario: 'Data integrity - provenance validation',
        given: 'Evidence item claims to be a "fact"',
        when: 'Provenance chain is examined',
        then: 'Chain shows validation method AND confidence score progression AND any reality checks performed',
        expected_validation: ['source_verified', 'confidence_calculated', 'reality_status']
      },
      {
        id: 'AC-006-3',
        scenario: 'Edge case - broken provenance',
        given: 'Artifact references source that no longer exists',
        when: 'Provenance is requested',
        then: 'UI shows warning "Provenance incomplete" AND displays available chain AND flags missing link',
        expected_warning: 'Source artifact not found'
      }
    ],
    story_points: 8,
    priority: 'medium',
    functional_requirement: 'Non-functional (traceability)',
    implementation_context: {
      description: 'Build provenance tracking system that links evidence items back through their transformation history',
      architecture_references: [
        'database/schema/venture_artifacts table (source_reference, parent_artifact_id columns)',
        'src/client/src/components/ventures/ProvenanceViewer.tsx (new component)',
        'pages/api/ventures/artifacts/[id]/provenance.ts (new API endpoint)'
      ],
      example_code_patterns: {
        provenance_query: `
// Recursive CTE to get full provenance chain
WITH RECURSIVE provenance_chain AS (
  -- Base case: start with target artifact
  SELECT
    id,
    content,
    artifact_type,
    source_reference,
    parent_artifact_id,
    epistemic_confidence,
    created_at,
    1 as depth
  FROM venture_artifacts
  WHERE id = $1

  UNION ALL

  -- Recursive case: follow parent chain
  SELECT
    va.id,
    va.content,
    va.artifact_type,
    va.source_reference,
    va.parent_artifact_id,
    va.epistemic_confidence,
    va.created_at,
    pc.depth + 1
  FROM venture_artifacts va
  JOIN provenance_chain pc ON va.id = pc.parent_artifact_id
  WHERE pc.depth < 10 -- Prevent infinite recursion
)
SELECT * FROM provenance_chain ORDER BY depth DESC;
`,
        ui_component: `
// ProvenanceViewer.tsx
export const ProvenanceViewer = ({ artifactId }) => {
  const { data: chain, isLoading } = useProvenanceChain(artifactId);

  return (
    <div className="provenance-timeline">
      {chain?.map((step, idx) => (
        <ProvenanceStep
          key={step.id}
          step={step}
          isFirst={idx === 0}
          isLast={idx === chain.length - 1}
        />
      ))}
    </div>
  );
};
`
      },
      integration_points: [
        'venture_artifacts.parent_artifact_id - provenance links',
        'venture_artifacts.source_reference - original source',
        'assumption_sets - validation events in chain',
        'venture_token_ledger - transformation costs'
      ],
      edge_cases: [
        'Circular reference in provenance chain - detect and break',
        'Very long chain (>10 steps) - paginate or collapse',
        'Multiple parent artifacts (merge scenario) - show branching',
        'External source (URL) - validate link still active'
      ]
    },
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/ventures/US-F3-008-006-provenance.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Display full provenance chain', priority: 'P1' },
        { id: 'TC-002', scenario: 'Validate provenance integrity', priority: 'P1' },
        { id: 'TC-003', scenario: 'Handle broken provenance gracefully', priority: 'P2' }
      ]
    }
  }
];

/**
 * INVEST Criteria Validation
 */
function validateINVESTCriteria(story) {
  const issues = [];

  // Independent
  if (!story.depends_on || story.depends_on.length === 0) {
    // Good - no dependencies
  } else if (story.depends_on.length > 2) {
    issues.push('Too many dependencies - consider reordering');
  }

  // Valuable
  if (!story.user_role || !story.user_benefit) {
    issues.push('Missing user persona or benefit statement');
  }

  // Estimable
  if (!story.story_points) {
    issues.push('Missing complexity estimate');
  }

  // Small
  if (story.acceptance_criteria?.length > 5) {
    issues.push(`Too many acceptance criteria (${story.acceptance_criteria.length}) - consider splitting`);
  }

  // Testable
  const hasGWT = story.acceptance_criteria?.some(ac =>
    ac.given && ac.when && ac.then
  );
  if (!hasGWT) {
    issues.push('No Given-When-Then format in acceptance criteria');
  }

  return {
    valid: issues.length === 0,
    issues,
    score: calculateINVESTScore(story, issues)
  };
}

function calculateINVESTScore(story, issues) {
  const maxScore = 100;
  const penaltyPerIssue = 15;
  return Math.max(0, maxScore - (issues.length * penaltyPerIssue));
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🚀 Generating User Stories for SD-FOUNDATION-V3-008');
  console.log('   Four Buckets Decision Evidence End-to-End\n');

  // Verify SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, current_phase')
    .eq('sd_key', SD_KEY)
    .single();

  if (sdError) {
    console.error('❌ SD not found:', sdError);
    process.exit(1);
  }

  console.log(`✓ Found SD: ${sd.title}`);
  console.log(`  Phase: ${sd.current_phase}\n`);

  // INVEST validation
  console.log('📋 Validating INVEST Criteria...\n');
  let investPassed = 0;
  let investFailed = 0;

  USER_STORIES.forEach(story => {
    const validation = validateINVESTCriteria(story);
    if (validation.valid) {
      console.log(`  ✓ ${story.story_key}: INVEST Score ${validation.score}/100`);
      investPassed++;
    } else {
      console.log(`  ⚠ ${story.story_key}: INVEST Score ${validation.score}/100`);
      validation.issues.forEach(issue => console.log(`    - ${issue}`));
      investFailed++;
    }
  });

  console.log(`\n  INVEST Summary: ${investPassed} passed, ${investFailed} with warnings\n`);

  // Insert user stories
  console.log('💾 Inserting User Stories...\n');

  for (const story of USER_STORIES) {
    const { data: _data, error } = await supabase
      .from('user_stories')
      .insert({
        sd_id: SD_ID,
        story_key: story.story_key,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        acceptance_criteria: story.acceptance_criteria,
        story_points: story.story_points,
        priority: story.priority,
        implementation_context: story.implementation_context,
        testing_scenarios: story.testing_scenarios,
        validation_status: 'pending',
        e2e_test_status: 'not_created'
      })
      .select();

    if (error) {
      console.error(`  ❌ Failed to insert ${story.story_key}:`, error);
    } else {
      console.log(`  ✓ Inserted ${story.story_key}: ${story.title}`);
    }
  }

  console.log('\n✅ User Story Generation Complete!');
  console.log('\nNext Steps:');
  console.log('  1. Review user stories in database');
  console.log('  2. Create E2E test files (tests/e2e/ventures/US-F3-008-*.spec.ts)');
  console.log('  3. Run: node scripts/map-e2e-tests-to-user-stories.js (when tests exist)');
  console.log('  4. Proceed to EXEC phase implementation\n');

  console.log('📊 Story Summary:');
  console.log(`  Total Stories: ${USER_STORIES.length}`);
  console.log(`  CRITICAL: ${USER_STORIES.filter(s => s.priority === 'critical').length}`);
  console.log(`  HIGH: ${USER_STORIES.filter(s => s.priority === 'high').length}`);
  console.log(`  MEDIUM: ${USER_STORIES.filter(s => s.priority === 'medium').length}`);
  console.log(`  Complexity: ${USER_STORIES.filter(s => s.complexity === 'S').length}S / ${USER_STORIES.filter(s => s.complexity === 'M').length}M / ${USER_STORIES.filter(s => s.complexity === 'L').length}L`);
}

main().catch(console.error);
