#!/usr/bin/env node
/**
 * One-time: Update user stories for SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 * Enriches implementation_context, architecture_references, and given_when_then
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Story 1: Template upgrade to v2.0.0 (stages 17-22)
  const story1Update = {
    implementation_context: `## Implementation Guidance

**File Locations:**
- Templates: lib/eva/stage-templates/stage-17.js through stage-22.js
- New analysis steps: lib/eva/stage-templates/analysis-steps/stage-17-build-readiness.js, stage-18-sprint-planning.js, stage-19-sprint-execution.js, stage-20-qa.js, stage-21-build-review.js, stage-22-release-readiness.js
- Analysis step registry: lib/eva/stage-templates/analysis-steps/index.js
- LLM client: lib/llm/index.js (getLLMClient)

**Upgrade Pattern (proven across stages 1-16):**
1. Add import at top: import { analyzeStageNN } from './analysis-steps/stage-NN-slug.js'
2. Bump version: version: '2.0.0' (was '1.0.0')
3. Attach: TEMPLATE.analysisStep = analyzeStageNN
4. Register in analysis-steps/index.js exports + getAnalysisStep loader map

**Each analysis step module structure:**
- Module-level SYSTEM_PROMPT const with JSON schema
- Single exported async function: analyzeStageNN({ stage1Data, ...upstreamData, ventureName })
- Module-private parseJSON(text) helper stripping markdown fences
- Module-private clamp(val, min, max) for number normalization
- Import getLLMClient({ purpose: 'content-generation' }) from ../../../llm/index.js

**Dependencies:** getLLMClient from lib/llm/index.js (existing, no changes needed)`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md Section 8.5 (THE BUILD LOOP phase specs, stages 17-22)',
      'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js (reference analysis step pattern)',
      'lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js (reference analysis step pattern)',
      'lib/eva/stage-templates/stage-13.js (v2.0.0 upgrade pattern from Blueprint)',
      'lib/eva/stage-templates/stage-17.js (existing v1.0.0 template to upgrade)'
    ],

    given_when_then: [
      {
        given: 'Stage template files stage-17.js through stage-22.js exist with version 1.0.0 and no analysisStep property',
        when: 'I import each template and check TEMPLATE.version and TEMPLATE.analysisStep',
        then: 'Each template returns version 2.0.0 and analysisStep is an async function'
      },
      {
        given: 'The analysis-steps/index.js registry currently exports stages 1-16',
        when: 'I import { analyzeStage17, analyzeStage18, analyzeStage19, analyzeStage20, analyzeStage21, analyzeStage22 } from the registry',
        then: 'All six functions are defined and are async functions'
      },
      {
        given: 'A stage-17.js template file at v1.0.0 with existing validate() and computeDerived() functions',
        when: 'I upgrade it to v2.0.0 by adding analysisStep import and attachment',
        then: 'The existing validate() still works with v1.0 data (backward compatible) and analysisStep is additionally available'
      }
    ]
  };

  // Story 2: Analysis steps with decision objects
  const story2Update = {
    implementation_context: `## Implementation Guidance

**Files to create:**
- lib/eva/stage-templates/analysis-steps/stage-17-build-readiness.js
- lib/eva/stage-templates/analysis-steps/stage-18-sprint-planning.js
- lib/eva/stage-templates/analysis-steps/stage-19-sprint-execution.js
- lib/eva/stage-templates/analysis-steps/stage-20-qa.js
- lib/eva/stage-templates/analysis-steps/stage-21-build-review.js
- lib/eva/stage-templates/analysis-steps/stage-22-release-readiness.js

**Stage 17 - Build Readiness:**
Function: export async function analyzeStage17({ stage1Data, stage13Data, stage14Data, stage15Data, stage16Data, ventureName })
Output: { readinessItems[].priority (critical|high|medium|low), blockers[].severity enum, buildReadiness: { decision: go|conditional_go|no_go, rationale, conditions[] } }

**Stage 18 - Sprint Planning:**
Function: export async function analyzeStage18({ stage1Data, stage13Data, stage14Data, stage17Data, ventureName })
Output: { sprintGoal, sprintItems[].architectureLayer + milestoneRef, sdBridgeOutput (derived) }

**Stage 19 - Sprint Execution:**
Function: export async function analyzeStage19({ stage1Data, stage18Data, ventureName })
Output: { tasks[].status (pending|in_progress|done|blocked), issues[].severity + status enums, sprintCompletion: { decision: complete|continue|blocked, readyForQa, rationale } }

**Stage 20 - QA:**
Function: export async function analyzeStage20({ stage1Data, stage18Data, stage19Data, ventureName })
Output: { testSuites[].type (unit|integration|e2e), knownDefects[].severity + status enums, qualityDecision: { decision: pass|conditional_pass|fail, rationale } }

**Stage 21 - Build Review:**
Function: export async function analyzeStage21({ stage1Data, stage14Data, stage19Data, stage20Data, ventureName })
Output: { integrations[].environment (development|staging|production) + severity enum, reviewDecision: { decision: approve|conditional|reject, rationale, conditions[] } }

**Stage 22 - Release Readiness:**
Function: export async function analyzeStage22({ stage1Data, stage5Data, stage13Data, stage15Data, stage20Data, stage21Data, ventureName })
Output: { releaseItems[].category (feature|bugfix|infrastructure|documentation|configuration), releaseDecision: { decision: release|hold|cancel, rationale, approver }, sprintRetrospective: { wentWell[], wentPoorly[], actionItems[] } }

**Shared patterns:** getLLMClient, parseJSON, clamp, optional chaining, fallback context strings`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md lines 878-993 (Stages 17-22 v2.0 target schemas)',
      'lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix.js (risk scoring pattern for severity enums)',
      'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js (financial analysis pattern)',
      'lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js (decision object pattern)',
      'lib/eva/stage-templates/stage-22.js (existing evaluatePromotionGate function to update)'
    ],

    given_when_then: [
      {
        given: 'stage13Data with milestones and stage14Data with architecture layers from THE BLUEPRINT phase',
        when: 'analyzeStage17({ stage1Data, stage13Data, stage14Data, stage15Data, stage16Data, ventureName }) is called',
        then: 'Returns readinessItems[] with priority enum (critical|high|medium|low), blockers[] with severity enum, and buildReadiness object with decision (go|conditional_go|no_go)'
      },
      {
        given: 'stage13Data with now-priority milestones and stage14Data with architecture layers',
        when: 'analyzeStage18({ stage1Data, stage13Data, stage14Data, stage17Data, ventureName }) is called',
        then: 'Returns sprintGoal string, sprintItems[] with architectureLayer from Stage 14 and milestoneRef from Stage 13'
      },
      {
        given: 'stage18Data with sprint items',
        when: 'analyzeStage19({ stage1Data, stage18Data, ventureName }) is called',
        then: 'Returns tasks[] with status enum (pending|in_progress|done|blocked), issues[] with severity and status enums, and sprintCompletion.decision (complete|continue|blocked)'
      },
      {
        given: 'stage19Data with completed tasks and readyForQa=true',
        when: 'analyzeStage20({ stage1Data, stage18Data, stage19Data, ventureName }) is called',
        then: 'Returns testSuites[] with type enum (unit|integration|e2e), overallPassRate >=95 threshold, and qualityDecision.decision (pass|conditional_pass|fail)'
      },
      {
        given: 'LLM returns severity="urgent" (invalid enum) for a blocker in Stage 17',
        when: 'Normalization runs on the parsed output',
        then: 'severity is normalized to "critical" (default fallback) and the output passes schema validation'
      }
    ]
  };

  // Story 3: Promotion Gate update
  const story3Update = {
    implementation_context: `## Implementation Guidance

**File to modify:** lib/eva/stage-templates/stage-22.js

**Current P0 Bug:** evaluatePromotionGate references stale boolean contracts:
- stage20.quality_gate_passed (boolean) -> must change to stage20.qualityDecision.decision === 'pass' || === 'conditional_pass'
- stage21.all_passing (boolean) -> must change to stage21.reviewDecision.decision === 'approve' || === 'conditional'

**Updated evaluatePromotionGate logic:**
1. Stage 17: Check buildReadiness.decision !== 'no_go' (was: categories present + readiness >=80%)
2. Stage 18: Check sprintItems.length >= 1 (unchanged)
3. Stage 19: Check sprintCompletion.decision !== 'blocked' (was: completion_pct >= 80%)
4. Stage 20: Check qualityDecision.decision !== 'fail' (was: quality_gate_passed boolean)
5. Stage 21: Check reviewDecision.decision !== 'reject' (was: all_passing boolean)
6. Stage 22: Check all release items approved (unchanged)

**Backward compatibility:** Keep existing parameter structure but add new decision object checks. If old boolean fields exist, still check them as fallback.

**New fields on Stage 22 analysisStep:**
- releaseDecision: { decision: release|hold|cancel, rationale, approver }
- sprintRetrospective: { wentWell[], wentPoorly[], actionItems[] }
- sprintSummary: { sprintGoal, itemsPlanned, itemsCompleted, qualityAssessment, integrationStatus }`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md lines 976-993 (Stage 22 v2.0 target schema + P0 fix note)',
      'lib/eva/stage-templates/stage-22.js (existing evaluatePromotionGate function, lines 116-189)',
      'lib/eva/stage-templates/stage-20.js (MIN_COVERAGE_PCT constant imported by stage-22)',
      'lib/eva/stage-templates/stage-17.js (CHECKLIST_CATEGORIES imported by stage-22)'
    ],

    given_when_then: [
      {
        given: 'Stage 20 output with qualityDecision.decision="pass" and Stage 21 with reviewDecision.decision="approve"',
        when: 'evaluatePromotionGate is called with v2.0 decision objects',
        then: 'Returns { pass: true } with no blockers related to quality or review'
      },
      {
        given: 'Stage 20 output with qualityDecision.decision="fail" (tests failing)',
        when: 'evaluatePromotionGate is called',
        then: 'Returns { pass: false, blockers: ["Quality gate failed: test failures detected"] }'
      },
      {
        given: 'Stage 21 output with reviewDecision.decision="reject"',
        when: 'evaluatePromotionGate is called',
        then: 'Returns { pass: false, blockers: ["Build review rejected"] }'
      },
      {
        given: 'Legacy v1.0 data with stage20.quality_gate_passed=true and stage21.all_passing=true (boolean contracts)',
        when: 'evaluatePromotionGate is called without v2.0 decision objects',
        then: 'Falls back to boolean checks and returns { pass: true } (backward compatible)'
      }
    ]
  };

  const updates = [
    { id: '647eade0-1906-43ac-a1fe-a8c880fa6803', ...story1Update },
    { id: 'b7b957f2-5e38-4ab1-9228-4487be10fdc1', ...story2Update },
    { id: '04071127-2386-44c7-93a5-247101eabaa7', ...story3Update },
  ];

  for (const { id, ...fields } of updates) {
    const { error } = await supabase
      .from('user_stories')
      .update(fields)
      .eq('id', id);

    if (error) {
      console.log('Error updating', id, ':', error.message);
    } else {
      console.log('Updated story:', id);
    }
  }

  console.log('All 3 stories updated with enriched context');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
