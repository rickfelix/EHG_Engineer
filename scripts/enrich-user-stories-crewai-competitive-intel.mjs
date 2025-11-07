#!/usr/bin/env node

/**
 * Enrich User Stories for SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Context: PLAN phase - BMAD validation requires ≥80% implementation context coverage
 * Purpose: Update 3 placeholder user stories with comprehensive implementation guidance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function enrichUserStories() {
  console.log('\n📝 User Story Enrichment: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('═'.repeat(70));

  // Step 1: Fetch existing user stories
  console.log('\n📋 Step 1: Fetching existing user stories...');
  const { data: stories, error: fetchError } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .order('story_key');

  if (fetchError) {
    console.error('❌ Error fetching stories:', fetchError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${stories.length} user stories`);

  // Step 2: Define enriched user stories based on PRD functional requirements
  const enrichedStories = [
    {
      story_key: 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001:US-001',
      title: 'Backend CrewAI Integration with Marketing Department Crew',
      user_role: 'Developer',
      user_want: 'implement session_type: "deep" routing in research_orchestrator.py to Marketing Department Crew',
      user_benefit: 'Stage 4 can execute 4-agent competitive intelligence analysis via CrewAI',
      story_points: 5,
      priority: 'high',
      implementation_context: `
IMPLEMENTATION GUIDANCE:

1. File: /mnt/c/_EHG/ehg/agent-platform/app/services/research_orchestrator.py
   Location: Add _execute_deep_competitive() method to ResearchOrchestrator class

2. Routing Logic:
   - Check session_type parameter in POST /api/research/sessions
   - If session_type == "deep", route to Marketing Department Crew
   - If session_type != "deep", route to existing competitive_mapper (baseline)

3. Crew Execution:
   - Crew: Marketing Department Crew (4 agents)
   - Agents: pain_point_analysis → competitive_analysis → market_positioning → customer_segmentation
   - Input: venture_drafts record (venture_name, description, stage_data)
   - Output: JSONB structure for venture_drafts.research_results.deep_competitive

4. Data Structure (venture_drafts.research_results):
   {
     "quick_validation": { /* Stage 2 baseline */ },
     "deep_competitive": {
       "pain_points": [...],
       "competitive_landscape": {...},
       "market_positioning": {...},
       "customer_segments": [...]
     }
   }

5. Error Handling:
   - Wrap crew execution in try/except
   - On failure: Log error, return baseline results only
   - Set metadata.crew_failed = true for UI fallback banner

6. Performance SLA:
   - Target: ≤25 min P95 execution time
   - Log execution_time_ms for monitoring
   - Feature flag: stage4.crewaiDeep (default OFF in production)

7. Testing Requirements:
   - Unit test: _execute_deep_competitive() with mock crew
   - Integration test: Full flow from API → crew → database
   - Verify: research_results JSONB contains deep_competitive structure
`,
      architecture_references: JSON.stringify([
        'agent-platform/app/services/research_orchestrator.py (existing patterns)',
        'docs/workflow/stage_dossiers/stage-04/06_agent-orchestration.md (LEAD agent prescription)',
        'agent-platform/crews/marketing_department.py (4-agent crew definition)'
      ]),
      example_code_patterns: JSON.stringify([
        'Existing crew invocation pattern in research_orchestrator.py',
        'JSONB update pattern for venture_drafts.research_results',
        'Feature flag check: if config.get("stage4.crewaiDeep", False):'
      ]),
      testing_scenarios: JSON.stringify([
        {
          scenario: 'TS-UNIT-001: Backend routing validation',
          input: 'POST /api/research/sessions with session_type: "deep"',
          expected: 'Crew invocation logged, 4 agents queued'
        },
        {
          scenario: 'TS-INT-001: Backend integration test',
          input: 'Full flow from API → crew → storage',
          expected: 'research_results JSONB contains deep_competitive structure'
        }
      ])
    },
    {
      story_key: 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001:US-002',
      title: 'Frontend Auto-Trigger and Progress Indicator for Deep Analysis',
      user_role: 'Developer',
      user_want: 'implement auto-trigger for deep analysis on Stage 4 mount with real-time progress indicator',
      user_benefit: 'users see 4-agent crew execution status and results without manual intervention',
      story_points: 5,
      priority: 'high',
      implementation_context: `
IMPLEMENTATION GUIDANCE:

1. File: /mnt/c/_EHG/ehg/src/components/ventures/Stage4CompetitiveIntelResults.tsx
   Or: Create new component if reusing existing CompetitiveIntelResults.tsx

2. Auto-Trigger on Mount:
   - useEffect hook: triggers on component mount
   - Call: ventureResearch.createResearchSession({ venture_id, session_type: "deep" })
   - Feature flag check: stage4.crewaiDeep (localStorage, default ON dev/stage, OFF prod)

3. Progress Indicator:
   - Display 4 agent statuses: pain_point → competitive → positioning → segmentation
   - Update via polling (every 2 sec) or WebSocket (if available)
   - Agent states: pending, in_progress, complete, failed
   - Show estimated time remaining based on P95 SLA (≤25 min)

4. UI Display Pattern:
   - Side-by-side comparison:
     - Left: Stage 2 baseline (competitive_mapper, always shown)
     - Right: Stage 4 deep analysis (Marketing Department Crew results)
   - Reuse: ComparisonViewComponent.tsx (671 LOC, existing component)

5. Fallback Handling:
   - If crew_failed === true: Show banner "Deep analysis unavailable, showing baseline"
   - Automatically display baseline results from Stage 2
   - No error thrown to user (graceful degradation)

6. Feature Flag Integration:
   - localStorage key: stage4.crewaiDeep
   - Default values:
     - dev/staging: true (auto-trigger enabled)
     - production: false (auto-trigger disabled, manual button only)
   - Override: Admin settings panel (future enhancement, out of scope)

7. Testing Requirements:
   - E2E test: TS-E2E-001 (auto-trigger happy path)
   - E2E test: TS-E2E-002 (crew failure fallback)
   - E2E test: TS-E2E-003 (feature flag disabled)
   - E2E test: TS-E2E-004 (progress indicator updates)
`,
      architecture_references: JSON.stringify([
        'src/components/ventures/Stage4CompetitiveIntelResults.tsx (target file)',
        'src/components/shared/ComparisonViewComponent.tsx (reusable 671 LOC component)',
        'src/services/ventureResearch.ts (API client, createResearchSession method)'
      ]),
      example_code_patterns: JSON.stringify([
        'useEffect(() => { if (featureFlags.stage4.crewaiDeep) { triggerDeepAnalysis(); } }, []);',
        'const [agentStatus, setAgentStatus] = useState({ pain_point: "pending", competitive: "pending", ... });',
        'Polling pattern: const interval = setInterval(() => fetchProgress(), 2000);'
      ]),
      testing_scenarios: JSON.stringify([
        {
          scenario: 'TS-E2E-001: Auto-trigger happy path',
          input: 'Navigate to Stage 4 with venture in Quick Validation complete',
          expected: 'Baseline displayed, deep analysis auto-triggers, 4 agents execute, side-by-side display'
        },
        {
          scenario: 'TS-E2E-002: Crew failure fallback',
          input: 'Mock crew failure response',
          expected: 'Banner shown, baseline displayed, no error thrown'
        }
      ])
    },
    {
      story_key: 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001:US-003',
      title: 'Testing Strategy Implementation and Performance Validation',
      user_role: 'QA Engineer',
      user_want: 'implement comprehensive 3-tier testing strategy with Tier 1 smoke tests, Tier 2 E2E tests, and Tier 3 performance tests',
      user_benefit: 'the CrewAI integration is validated for correctness, resilience, and SLA compliance',
      story_points: 8,
      priority: 'high',
      implementation_context: `
IMPLEMENTATION GUIDANCE:

1. Tier 1: Smoke Tests (MANDATORY, <2 min execution)
   Files to create:
   - agent-platform/tests/test_research_orchestrator.py (backend unit test)
   - src/services/ventureResearch.test.ts (frontend unit test)

   Test scenarios:
   - TS-UNIT-001: research_orchestrator.py _execute_deep_competitive() routing
   - TS-UNIT-002: ventureResearch.createResearchSession with session_type: "deep"
   - TS-UNIT-003: Feature flag stage4.crewaiDeep=false skips deep trigger
   - TS-INT-001: Backend integration test (mocked crew execution)

2. Tier 2: E2E Tests (RECOMMENDED, <10 min execution)
   Files to create:
   - tests/e2e/stage4-crewai-integration.spec.ts
   - tests/e2e/stage4-crewai-fallback.spec.ts
   - tests/e2e/stage4-feature-flag.spec.ts
   - tests/e2e/stage4-crewai-progress.spec.ts

   Test scenarios:
   - TS-E2E-001: Happy path auto-trigger (with mocked crew for speed)
   - TS-E2E-002: Crew failure fallback banner + baseline display
   - TS-E2E-003: Feature flag OFF prevents deep trigger
   - TS-E2E-004: Progress indicator updates within 2 sec

3. Tier 3: Performance Tests (SITUATIONAL, ~9 hours execution)
   Files to create:
   - tests/performance/stage4-crewai-sla.spec.ts
   - tests/performance/stage4-progress-latency.spec.ts
   - tests/performance/stage4-concurrent-load.spec.ts
   - tests/performance/stage4-fallback-latency.spec.ts

   Test scenarios:
   - TS-PERF-001: P95 execution time ≤25 min (20 iterations with REAL crew)
   - TS-PERF-002: UI progress updates <2 sec delay
   - TS-PERF-003: 10 concurrent users, no timeouts
   - TS-PERF-004: Fallback display time ≤1 sec

4. Test Data Management:
   Create fixtures:
   - tests/fixtures/ventures/venture-stage4-baseline-ready.json
   - tests/fixtures/ventures/venture-stage4-simple.json
   - tests/fixtures/ventures/venture-stage4-complex.json
   - tests/mocks/crew-responses/marketing-department-crew-success.json
   - tests/mocks/crew-responses/marketing-department-crew-failure.json

5. CI/CD Integration:
   File: .github/workflows/stage4-crewai-tests.yml
   Jobs:
   - tier1-smoke: Runs on every commit (BLOCKER if fails)
   - tier2-e2e: Runs on PR creation (WARN if >2 tests fail)
   - tier3-performance: Runs nightly or on-demand (manual review)

6. Testing Checklist (Pre-Merge):
   - ✅ All Tier 1 tests pass (100% requirement)
   - ✅ ≥75% Tier 2 tests pass (3/4 tests)
   - ✅ Code coverage ≥80% for new code
   - ✅ No regressions in existing tests

7. Testing Strategy Documentation:
   File: docs/strategic_directives/SD-CREWAI-COMPETITIVE-INTELLIGENCE-001/testing-strategy.md
   Content: Already created (366 lines, comprehensive 3-tier strategy)
`,
      architecture_references: JSON.stringify([
        'docs/strategic_directives/SD-CREWAI-COMPETITIVE-INTELLIGENCE-001/testing-strategy.md (366 lines)',
        'tests/e2e/stage4-*.spec.ts (E2E test pattern examples)',
        'agent-platform/tests/test_research_*.py (backend test patterns)'
      ]),
      example_code_patterns: JSON.stringify([
        'Playwright E2E pattern: await page.goto("/ventures/123/stage/4"); await expect(page.locator(".progress-indicator")).toBeVisible();',
        'Mock crew response: const mockCrew = { verdict: "PASS", results: {...} };',
        'Performance validation: const p95 = calculateP95(executionTimes); expect(p95).toBeLessThan(25 * 60 * 1000);'
      ]),
      testing_scenarios: JSON.stringify([
        {
          scenario: 'Tier 1 validation',
          input: 'Run npm run test:unit && pytest agent-platform/tests/',
          expected: '4 tests pass in <2 min'
        },
        {
          scenario: 'Tier 2 validation',
          input: 'Run npx playwright test tests/e2e/stage4-crewai-*.spec.ts',
          expected: '4 tests pass (or 3/4) in <10 min'
        },
        {
          scenario: 'Tier 3 validation',
          input: 'Run performance tests with REAL crew',
          expected: 'P95 ≤25 min across 20 iterations'
        }
      ])
    }
  ];

  // Step 3: Update each user story
  console.log('\n✨ Step 2: Enriching user stories...\n');

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const enriched = enrichedStories[i];

    console.log(`   ${i+1}. ${enriched.story_key}`);
    console.log(`      Title: ${enriched.title}`);

    const { error: updateError } = await supabase
      .from('user_stories')
      .update({
        title: enriched.title,
        user_role: enriched.user_role,
        user_want: enriched.user_want,
        user_benefit: enriched.user_benefit,
        story_points: enriched.story_points,
        priority: enriched.priority,
        implementation_context: enriched.implementation_context.trim(),
        architecture_references: enriched.architecture_references,
        example_code_patterns: enriched.example_code_patterns,
        testing_scenarios: enriched.testing_scenarios,
        updated_at: new Date().toISOString()
      })
      .eq('id', story.id);

    if (updateError) {
      console.error(`      ❌ Error: ${updateError.message}`);
    } else {
      console.log(`      ✅ Enriched (${enriched.implementation_context.trim().length} chars context)`);
    }
  }

  // Step 4: Verify coverage
  console.log('\n📊 Step 3: Verifying coverage...\n');

  const { data: updated } = await supabase
    .from('user_stories')
    .select('id, story_key, implementation_context')
    .eq('sd_id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .order('story_key');

  const totalStories = updated.length;
  const enrichedCount = updated.filter(s => s.implementation_context && s.implementation_context.length > 100).length;
  const coverage = Math.round((enrichedCount / totalStories) * 100);

  console.log(`Coverage: ${coverage}% (${enrichedCount}/${totalStories} stories)`);
  console.log(coverage >= 80 ? '✅ PASS (≥80% required by BMAD validation)' : '❌ FAIL (<80%)');

  console.log('\n' + '═'.repeat(70));
  console.log('✅ User story enrichment complete!');
  console.log('═'.repeat(70));
}

enrichUserStories();
