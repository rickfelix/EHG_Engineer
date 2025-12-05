-- Add AI-Powered Russian Judge Quality Assessment Documentation to LEO Protocol
-- Migration: 20251205_ai_quality_russian_judge_docs.sql
-- Purpose: Document the new AI-powered quality rubrics that replaced pattern-matching validation
-- Context: LEO Protocol v4.3.3 - Russian Judge multi-criterion weighted scoring

-- Get current protocol ID and next order_index
DO $$
DECLARE
    v_protocol_id VARCHAR(50);
    v_max_order INTEGER;
    v_section1_order INTEGER;
    v_section2_order INTEGER;
BEGIN
    -- Get active protocol
    SELECT id INTO v_protocol_id
    FROM leo_protocols
    WHERE status = 'active'
    LIMIT 1;

    IF v_protocol_id IS NULL THEN
        RAISE EXCEPTION 'No active protocol found';
    END IF;

    -- Get current max order_index
    SELECT COALESCE(MAX(order_index), 0) INTO v_max_order
    FROM leo_protocol_sections;

    v_section1_order := v_max_order + 1;
    v_section2_order := v_max_order + 2;

    -- Section 1: AI-Powered Russian Judge Quality Assessment (CLAUDE_CORE.md)
    INSERT INTO leo_protocol_sections
        (protocol_id, section_type, title, content, order_index, metadata)
    VALUES
        (v_protocol_id, 'ai_quality_russian_judge', 'AI-Powered Russian Judge Quality Assessment',
'## AI-Powered Russian Judge Quality Assessment

**Status**: ACTIVE - Replaced pattern-matching validation in LEO Protocol v4.3.3
**Model**: gpt-5-mini (NOT gpt-4o-mini)
**Temperature**: 0.3 (balance consistency + nuance)
**Threshold**: 70% weighted score to pass
**Storage**: ai_quality_assessments table

### Overview

LEO Protocol uses AI-powered multi-criterion weighted scoring ("Russian Judge" pattern) to evaluate deliverable quality across all phases. Each rubric evaluates content on a 0-10 scale per criterion, applies weights, and generates graduated feedback (required vs recommended improvements).

**Why Russian Judge?**: Like Olympic judging, multiple criteria are evaluated independently, weighted by importance, and combined for a final score. This prevents one strong criterion from masking weaknesses in others.

### Four Core Rubrics

#### 1. Strategic Directive (SD) Quality Rubric
**Phase**: LEAD (Strategic Approval)
**Content Type**: sd
**Criteria**:
- **Description Quality (35%)**: WHAT + WHY + business value + technical approach
  - 0-3: Missing, generic ("implement feature"), or pure boilerplate
  - 7-8: Clear WHAT + WHY with business value articulated
  - 9-10: Comprehensive with measurable impact
- **Strategic Objectives Measurability (30%)**: SMART criteria compliance
  - 0-3: No objectives or vague ("improve quality", "enhance UX")
  - 7-8: Most objectives are specific and measurable
  - 9-10: All objectives follow SMART criteria with clear success metrics
- **Success Metrics Quantifiability (25%)**: Baseline + target + method + timeline
  - 0-3: No metrics or vague ("better performance")
  - 7-8: Metrics with baseline and target ("reduce from 2s to 1s")
  - 9-10: Complete metrics with measurement method and timeline
- **Risk Assessment Depth (10%)**: Mitigation + contingency + probability
  - 0-3: No risks or listed without mitigation
  - 7-8: Risks with specific mitigation strategies
  - 9-10: Risks with mitigation + contingency plans + probability estimates

#### 2. Product Requirements Document (PRD) Quality Rubric
**Phase**: PLAN (Requirements & Architecture)
**Content Type**: prd
**Criteria**:
- **Requirements Depth & Specificity (40%)**: Avoid "To be defined" placeholders
  - 0-3: Mostly placeholders ("To be defined", "TBD", generic statements)
  - 7-8: Most requirements are specific, actionable, and complete
  - 9-10: All requirements are detailed, specific, testable with clear acceptance criteria
- **Architecture Explanation Quality (30%)**: Components, data flow, integration points
  - 0-3: No architecture details or vague high-level statements
  - 7-8: Clear architecture with components, data flow, and integration points
  - 9-10: Comprehensive architecture + trade-offs + scalability considerations
- **Test Scenario Sophistication (20%)**: Happy path + edge cases + error conditions
  - 0-3: No test scenarios or only trivial happy path
  - 7-8: Happy path + common edge cases + error handling scenarios
  - 9-10: Comprehensive test coverage including performance and security tests
- **Risk Analysis Completeness (10%)**: Technical risks + mitigation + rollback plan
  - 0-3: No technical risks identified or listed without mitigation
  - 7-8: Specific technical risks with concrete mitigation strategies
  - 9-10: Comprehensive risk analysis with rollback plan + monitoring strategy

**Hierarchical Context Enhancement**: PRD rubric receives SD context (strategic objectives, success metrics, business problem) for holistic evaluation that ensures PRD aligns with strategic goals.

#### 3. User Story Quality Rubric
**Phase**: PLAN (Granular Requirements)
**Content Type**: user_story
**Criteria**:
- **Acceptance Criteria Clarity (40%)**: Specific, testable, pass/fail criteria
- **INVEST Principles Compliance (35%)**: Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Technical Feasibility Assessment (15%)**: Implementation approach clarity
- **Context Completeness (10%)**: User context + rationale + dependencies

**Hierarchical Context Enhancement**: User Story rubric receives PRD context for alignment validation.

#### 4. Retrospective Quality Rubric
**Phase**: EXEC (Post-Implementation Review)
**Content Type**: retrospective
**Criteria**:
- **Issue Analysis Depth (40%)**: Root cause identification + pattern recognition
- **Solution Specificity (30%)**: Actionable, concrete, testable solutions
- **Lesson Articulation (20%)**: Clear, transferable learnings
- **Metadata Completeness (10%)**: Effort, cost, timeline accuracy

**Hierarchical Context Enhancement**: Retrospective rubric receives SD context to validate outcomes against strategic objectives.

### Hierarchical Context Pattern

**Purpose**: Provide parent context to enable holistic evaluation

**Context Flow**:
```
Strategic Directive (SD)
  ├─> PRD (receives SD context)
  │    └─> User Story (receives PRD context)
  └─> Retrospective (receives SD context)
```

**Implementation**:
- PRD validation: Fetches SD via `prd.sd_uuid → strategic_directives_v2.uuid_id`
- User Story validation: Fetches PRD via `user_story.prd_id → prds.id`
- Retrospective validation: Fetches SD via `retrospective.sd_id → strategic_directives_v2.sd_id`

**Why**: Prevents locally optimal but strategically misaligned deliverables. For example, a PRD might have perfect technical architecture (score 10/10) but completely miss the strategic business objective (SD context reveals misalignment).

### Anti-Patterns Heavily Penalized

**LEO Protocol values specificity and rejects boilerplate**:
- **Placeholder text**: "To be defined", "TBD", "during planning" → Score 0-3
- **Generic benefits**: "improve UX", "better system", "enhance functionality" → Score 0-3
- **Boilerplate acceptance criteria**: "all tests passing", "code review completed" → Score 4-6
- **Missing architecture details**: No data flow, no integration points → Score 0-3

### Scoring Scale Philosophy

**0-3: Completely inadequate** (missing, boilerplate, or unusable)
- Use for placeholder text, missing sections, pure boilerplate
- Example: "To be defined" in requirements

**4-6: Present but needs significant improvement**
- Use for generic statements that lack specificity
- Example: "improve system performance" (no baseline, no target)

**7-8: Good quality with minor issues**
- Use for specific, actionable content with clear intent
- Example: "Reduce page load from 2s to 1s" (has baseline + target)

**9-10: Excellent, exemplary quality** (reserve for truly exceptional work)
- Use ONLY for comprehensive, deeply thoughtful content
- Example: "Reduce page load from 2s to 1s (measured via Lighthouse, baseline from Google Analytics, target validated with UX research showing 1s = 15% bounce rate reduction, 3-month timeline)"

**Grade Inflation Prevention**: Rubrics are intentionally strict. Scores of 9-10 should be rare. Most good work scores 7-8. Mediocre work scores 4-6.

### Assessment Storage and History

**Table**: ai_quality_assessments

**Schema**:
```sql
CREATE TABLE ai_quality_assessments (
  id UUID PRIMARY KEY,
  content_type TEXT NOT NULL,           -- ''sd'', ''prd'', ''user_story'', ''retrospective''
  content_id TEXT NOT NULL,             -- ID of content being assessed
  model TEXT NOT NULL,                  -- ''gpt-5-mini''
  temperature NUMERIC,                  -- 0.3
  scores JSONB NOT NULL,                -- Criterion-level scores + reasoning
  weighted_score INTEGER NOT NULL,      -- 0-100 final score
  feedback JSONB,                       -- {required: [], recommended: []}
  assessed_at TIMESTAMP,                -- When assessment ran
  assessment_duration_ms INTEGER,       -- Performance tracking
  tokens_used JSONB,                    -- {prompt_tokens, completion_tokens, total_tokens}
  cost_usd NUMERIC,                     -- AI API cost (gpt-5-mini: $0.15/1M input, $0.60/1M output)
  rubric_version TEXT                   -- ''v1.0.0''
);
```

**Why Store Assessments?**:
1. **Audit trail**: Track quality trends over time
2. **Cost transparency**: Monitor AI API spend
3. **Rubric evolution**: Compare quality before/after rubric changes
4. **Performance optimization**: Identify slow evaluations

### Integration with LEO Protocol Handoffs

**PLAN → EXEC Handoff (validate-plan-handoff.js)**:
- PRD quality validation: `PRDQualityRubric.validatePRDQuality(prd, sd)`
- User Story quality validation: `UserStoryQualityRubric.validateUserStoryQuality(userStory, prd)`
- Threshold: 70% weighted score to pass
- On failure: Returns FAIL with `issues` and `warnings` for PLAN agent to address

**EXEC → Retrospective**:
- Retrospective quality validation: `RetrospectiveQualityRubric.validateRetrospectiveQuality(retro, sd)`
- Ensures lessons learned are actionable and measurable

**LEAD → PLAN Handoff**:
- SD quality validation: `SDQualityRubric.validateSDQuality(sd)`
- Validates strategic clarity before PRD creation

### When to Use AI Quality Assessment

**Use AI Assessment When**:
- Evaluating subjective quality ("Is this requirement specific enough?")
- Validating completeness ("Are all required fields present AND meaningful?")
- Checking for anti-patterns (placeholder text, boilerplate)
- Ensuring strategic alignment (PRD → SD, User Story → PRD)

**Use Traditional Validation When**:
- Checking objective constraints (field presence, data types)
- Verifying database schema (foreign key integrity)
- Testing code functionality (unit tests, E2E tests)
- Enforcing hard rules (no merge without passing tests)

**Best Practice**: Combine both. Traditional validation catches structural issues ("description field is missing"). AI assessment catches quality issues ("description is present but generic boilerplate").

### Cost and Performance

**Typical Costs** (gpt-5-mini pricing):
- SD assessment: ~$0.001-0.003 per evaluation
- PRD assessment: ~$0.003-0.008 per evaluation (larger content)
- User Story assessment: ~$0.001-0.002 per evaluation
- Retrospective assessment: ~$0.002-0.005 per evaluation

**Performance**:
- Average assessment duration: 2-5 seconds
- Max tokens: 1000 (prevents runaway costs)
- Timeout: 30 seconds (with 3 retry attempts)
- Retry backoff: Exponential (1s, 2s, 4s)

**User Prioritization**: Quality over cost. The user explicitly prioritizes deliverable quality and is willing to accept AI costs for better validation.

### Migration from Pattern-Matching Validation

**Before (Pattern-Matching)**:
```javascript
// Naive keyword counting
const hasTBD = prd.requirements.some(r => r.includes(''TBD''));
if (hasTBD) return { passed: false };
```

**After (AI Russian Judge)**:
```javascript
// Holistic multi-criterion evaluation
const assessment = await prdRubric.validatePRDQuality(prd, sd);
// Returns: { passed: true/false, score: 0-100, issues: [], warnings: [], details: {...} }
```

**Why AI is Better**:
- Evaluates **meaning**, not just keywords ("To be determined" detected same as "TBD")
- Multi-dimensional scoring (can''t hide one weakness behind one strength)
- Provides actionable feedback ("Requirements need baseline metrics, not just targets")
- Hierarchical context (PRD evaluated in light of SD strategic objectives)

### Files Reference

**Rubric Implementations**:
- `/scripts/modules/rubrics/sd-quality-rubric.js`
- `/scripts/modules/rubrics/prd-quality-rubric.js`
- `/scripts/modules/rubrics/user-story-quality-rubric.js`
- `/scripts/modules/rubrics/retrospective-quality-rubric.js`

**Base Class**:
- `/scripts/modules/ai-quality-evaluator.js`

**Integration Points**:
- `/scripts/validate-plan-handoff.js` (PRD + User Story validation)
- `/scripts/validate-lead-handoff.js` (SD validation)
- Retrospective validation (TBD - future integration)

**Database Schema**:
- `/database/schema/` (ai_quality_assessments table)

### Example: PRD Validation Flow

1. **PLAN agent creates PRD** in database
2. **User calls**: `npm run handoff` (PLAN → EXEC)
3. **validate-plan-handoff.js runs**:
   - Fetches PRD from database
   - Fetches parent SD via `prd.sd_uuid`
   - Calls `PRDQualityRubric.validatePRDQuality(prd, sd)`
4. **AI evaluator**:
   - Formats PRD content + SD context
   - Builds multi-criterion prompt
   - Calls OpenAI API (gpt-5-mini)
   - Parses scores, calculates weighted score
   - Generates graduated feedback
   - Stores assessment in `ai_quality_assessments` table
5. **Handoff script**:
   - If score ≥ 70: PASS → Proceed to EXEC
   - If score < 70: FAIL → Return `issues` to PLAN agent for revision
6. **User receives**: Structured feedback with criterion-level scores + reasoning

### Quality Philosophy Alignment

**LEO Protocol Core Values**:
1. **Database-first**: All requirements in database (not markdown)
2. **Anti-boilerplate**: Reject generic, placeholder text
3. **Specific & testable**: Every requirement has clear pass/fail criteria
4. **Measured progress**: Track quality trends over time

**How Russian Judge Supports This**:
1. **Database-first**: Assessments stored in `ai_quality_assessments` table (audit trail)
2. **Anti-boilerplate**: Rubrics explicitly penalize "To be defined", "TBD", generic statements
3. **Specific & testable**: Criteria prompt for baseline, target, measurement method, timeline
4. **Measured progress**: `cost_usd`, `assessment_duration_ms`, `weighted_score` tracked per assessment

**Result**: Objective quality gates that enforce LEO Protocol''s philosophy without relying on human judgment.',
        v_section1_order,
        '{"target_file": "CLAUDE_CORE.md", "added_date": "2025-12-05", "version": "4.3.3", "replaces": "pattern-matching validation"}'::jsonb
    );

    -- Section 2: Quality Assessment Integration in Handoffs (CLAUDE_PLAN.md)
    INSERT INTO leo_protocol_sections
        (protocol_id, section_type, title, content, order_index, metadata)
    VALUES
        (v_protocol_id, 'handoff_quality_gates', 'Quality Assessment Integration in Handoffs',
'## Quality Assessment Integration in Handoffs

**Context**: AI-powered Russian Judge quality assessment is integrated into PLAN → EXEC handoffs to validate PRD and User Story quality before implementation begins.

### When Quality Assessment Runs

**PLAN → EXEC Handoff** (`npm run handoff` from PLAN phase):
1. **PRD Quality Validation**: Evaluates PRD against 4 weighted criteria (see AI-Powered Russian Judge section)
2. **User Story Quality Validation**: Evaluates User Stories against INVEST principles + acceptance criteria clarity
3. **Threshold**: Both must score ≥70% to proceed to EXEC phase

**Why At Handoff Time?**:
- Catches quality issues BEFORE implementation starts (prevents rework)
- Forces PLAN agent to address ambiguity and placeholder text
- Ensures EXEC agent receives implementation-ready requirements

### Hierarchical Context in Handoff Validation

**PRD Validation**:
```javascript
// Automatic parent context fetching
const assessment = await prdRubric.validatePRDQuality(prd, sd);
```

**What Happens**:
1. Handoff script fetches PRD from database
2. If `prd.sd_uuid` exists, fetches parent SD from `strategic_directives_v2`
3. Passes both PRD + SD context to AI evaluator
4. AI evaluates PRD requirements against SD strategic objectives
5. Returns holistic assessment ("PRD architecture is solid but doesn''t address SD''s cost reduction objective")

**User Story Validation**:
```javascript
// Fetch PRD context for alignment check
const assessment = await userStoryRubric.validateUserStoryQuality(userStory, prd);
```

**What Happens**:
1. Handoff script fetches User Story from database
2. Fetches parent PRD via `user_story.prd_id`
3. Passes both User Story + PRD context to AI evaluator
4. AI validates User Story acceptance criteria align with PRD requirements

### Handoff Failure Handling

**If Quality Assessment Fails (score < 70)**:

**Handoff Script Returns**:
```javascript
{
  status: ''FAIL'',
  phase: ''PLAN'',
  issues: [
    ''requirements_depth_specificity: Needs significant improvement (4/10) - Most requirements contain placeholder text like "To be defined" which prevents implementation'',
    ''architecture_explanation_quality: Room for improvement (6/10) - Architecture mentions React components but missing data flow and API integration details''
  ],
  warnings: [
    ''test_scenario_sophistication: Room for improvement (6/10) - Test scenarios cover happy path but missing edge cases for error conditions''
  ],
  weighted_score: 62,
  threshold: 70
}
```

**PLAN Agent Must**:
1. **Address all `issues`** (score < 5/10) - These are blockers
2. **Consider `warnings`** (score 5-7/10) - Recommended improvements
3. **Regenerate PRD/User Stories** in database
4. **Re-run handoff validation** (`npm run handoff`)

**Quality Gate Enforcement**: Handoff script will NOT create EXEC handoff entry until PRD/User Story quality passes threshold.

### Integration with PRD Schema

**PRD Database Schema** (`prds` table):
- `id`: PRD identifier
- `sd_uuid`: Foreign key to parent Strategic Directive
- `functional_requirements`: JSONB array of requirements
- `ui_ux_requirements`: JSONB array of UI requirements
- `technical_architecture`: JSONB object (overview, components, data_flow, integration_points)
- `test_scenarios`: JSONB array of test scenarios
- `acceptance_criteria`: JSONB array of criteria
- `risks`: JSONB array of risks + mitigation
- `status`: PRD lifecycle status

**AI Assessment Validates**:
- **Depth**: Are requirements specific or generic?
- **Architecture**: Are components, data flow, and integration points explained?
- **Tests**: Do scenarios cover happy path + edge cases + error conditions?
- **Risks**: Are technical risks identified with mitigation + rollback plans?

**Quality Before Quantity**: Better to have 5 deeply detailed requirements (score 8/10) than 20 placeholder requirements (score 3/10).

### Common Quality Issues and AI Feedback

**Issue**: Placeholder Text in Requirements
```
AI Feedback: "requirements_depth_specificity: Needs significant improvement (3/10) -
Functional requirement #4 states ''Authentication flow to be defined during implementation''.
This prevents EXEC agent from implementing. Specify: authentication method (OAuth, JWT),
user roles, session timeout, error handling."
```

**Issue**: Missing Architecture Details
```
AI Feedback: "architecture_explanation_quality: Room for improvement (5/10) -
Architecture mentions ''React components and Node.js backend'' but missing:
- How do components communicate? (Props, Context, Redux?)
- What is the API structure? (REST endpoints, GraphQL schema?)
- Where is state managed? (Client-side, server-side, hybrid?)"
```

**Issue**: Trivial Test Scenarios
```
AI Feedback: "test_scenario_sophistication: Room for improvement (6/10) -
Test scenarios only cover happy path (''user logs in successfully''). Missing:
- Edge cases: user enters wrong password, network timeout, expired session
- Error conditions: database unavailable, rate limiting, concurrent login attempts
- Performance tests: login under load, response time validation"
```

### Best Practices for PLAN Phase

**To Pass PRD Quality Gate (≥70%)**:
1. **Replace ALL placeholders** ("To be defined", "TBD") with specific details
2. **Add baseline + target metrics** for measurable requirements ("reduce from X to Y")
3. **Document data flow and integration points** in technical architecture
4. **Include edge cases and error conditions** in test scenarios
5. **Provide specific mitigation strategies** (not "test thoroughly") for risks

**To Pass User Story Quality Gate (≥70%)**:
1. **Write specific, testable acceptance criteria** ("Given X, When Y, Then Z")
2. **Follow INVEST principles** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
3. **Provide user context** (who is the user? what problem are they solving?)
4. **Link to parent PRD requirements** for traceability

### Quality Assessment vs Traditional Validation

**Traditional Validation** (still used):
- Field presence: "Does `functional_requirements` exist?"
- Data types: "Is `test_scenarios` a JSONB array?"
- Foreign keys: "Does `sd_uuid` reference a valid Strategic Directive?"

**AI Quality Assessment** (new):
- Content depth: "Are requirements specific or generic?"
- Semantic meaning: "Does PRD align with SD strategic objectives?"
- Anti-patterns: "Does content contain placeholder text or boilerplate?"

**Both Required**: Traditional validation catches structural issues. AI assessment catches quality issues. A PRD can pass traditional validation (all fields present) but fail AI assessment (all fields contain "To be defined").

### Performance and Cost in Handoffs

**Typical PLAN → EXEC Handoff**:
- PRD validation: ~3-8 seconds, $0.003-0.008
- User Story validation (×5 stories): ~5-10 seconds, $0.005-0.010
- **Total**: ~10-20 seconds, $0.01-0.02 per handoff

**User Prioritization**: Quality over speed. Better to wait 20 seconds for thorough validation than proceed with ambiguous requirements and waste hours in EXEC rework.

**Caching Strategy**: Assessments stored in `ai_quality_assessments` table. If PRD unchanged since last assessment, can reuse previous score (optimization for future implementation).

### Example: Successful PLAN → EXEC Handoff

1. **PLAN agent creates PRD** with specific requirements, detailed architecture, comprehensive tests
2. **User runs**: `npm run handoff`
3. **PRD Quality Assessment**:
   - requirements_depth_specificity: 8/10 (all requirements specific and actionable)
   - architecture_explanation_quality: 9/10 (components, data flow, integration points explained)
   - test_scenario_sophistication: 7/10 (happy path + edge cases covered)
   - risk_analysis_completeness: 8/10 (risks with mitigation + rollback plans)
   - **Weighted Score**: 82/100 ✅ PASS
4. **User Story Quality Assessment**: All stories score ≥70% ✅ PASS
5. **Handoff Entry Created**: `from_phase=PLAN`, `to_phase=EXEC`, `status=pending`
6. **EXEC Agent Proceeds**: Implementation with clear, unambiguous requirements

**Result**: No rework, no ambiguity, faster implementation.

### Files Reference

**Handoff Validation Script**:
- `/scripts/validate-plan-handoff.js` (PRD + User Story quality checks)

**Rubric Implementations**:
- `/scripts/modules/rubrics/prd-quality-rubric.js`
- `/scripts/modules/rubrics/user-story-quality-rubric.js`

**Database Tables**:
- `prds`: Product Requirements Documents
- `user_stories`: User Stories linked to PRDs
- `ai_quality_assessments`: Assessment history and scores
- `handoffs`: Handoff status tracking (includes quality gate results)',
        v_section2_order,
        '{"target_file": "CLAUDE_PLAN.md", "added_date": "2025-12-05", "version": "4.3.3", "integration_points": ["validate-plan-handoff.js", "PRD rubric", "User Story rubric"]}'::jsonb
    );

    RAISE NOTICE 'Successfully added AI Quality Russian Judge documentation sections:';
    RAISE NOTICE '  - Section 1: ai_quality_russian_judge (order_index: %)', v_section1_order;
    RAISE NOTICE '  - Section 2: handoff_quality_gates (order_index: %)', v_section2_order;
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Run: node scripts/generate-claude-md-from-db.js';
    RAISE NOTICE '  2. Verify sections appear in CLAUDE_CORE.md and CLAUDE_PLAN.md';
END $$;
