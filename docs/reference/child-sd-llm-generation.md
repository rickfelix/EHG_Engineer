# Child SD LLM-Based Strategic Field Generation

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude (Documentation Agent)
- **Last Updated**: 2026-01-25
- **Tags**: child-sd, llm, strategic-fields, orchestrator, automation

## Overview

This document explains the AI-powered strategic field generation system for Child Strategic Directives. When child SDs are created from a parent orchestrator, the system uses GPT-4o to generate context-appropriate strategic_objectives, key_principles, success_criteria, success_metrics, and smoke_test_steps instead of using generic templates.

**Root Cause**: Child SDs were being created with empty or generic strategic fields, causing them to fail LEAD-TO-PLAN validation (which requires 90% completeness). This blocked AUTO-PROCEED mode from continuing through child SDs.

**Solution**: Enhanced LLM service that generates strategic fields based on:
1. Child SD context (title, description, scope, sd_type)
2. Parent SD context (overall goal, objectives)
3. Sibling SD context (other children in the orchestrator)
4. Similar completed SDs (pattern reference from successful implementations)
5. Inferred implementation scope (technical areas involved)

## Architecture

### Module Structure

```
scripts/modules/
├── child-sd-template.js          # Child SD generation (sync + async)
├── child-sd-llm-service.mjs      # AI-powered strategic field generation
└── sd-creation-validator.js      # Validation for created SDs

scripts/
└── fix-incomplete-child-sds.mjs  # Batch enrichment tool
```

### Key Functions

#### child-sd-template.js

```javascript
// Async methods (preferred - uses AI)
generateChildSDAsync(parentSD, config)      // Generate with AI-powered fields
generatePhaseChildrenAsync(parentSD, phases) // Batch generate children

// Sync methods (fallback - template-based)
generateChildSD(parentSD, config)           // Generate with templates
generatePhaseChildren(parentSD, phases)     // Batch generate (sync)

// Utilities
inferSDType(title, scope, description)      // Auto-detect SD type from keywords
inheritStrategicFields(parentSD, context)   // Fallback template inheritance
```

#### child-sd-llm-service.mjs

```javascript
// LLM generation
generateStrategicFieldsWithLLM(childContext, parentContext, options)
enrichChildSDWithLLM(childSD, parentSD)
batchEnrichChildSDs(childSDs, parentSD)

// Context enhancement
fetchSiblingContext(parentSdId, currentChildId)
fetchSimilarCompletedSDs(sdType, titleKeywords, limit)
inferImplementationScope(title, description, scope)
buildChildSDContext(childContext, parentContext, enhancedContext)

// Validation
validateGeneratedFields(fields)
```

## LLM Context Building

The system builds comprehensive context for the LLM to generate appropriate fields:

### 1. Child SD Context (Primary)
- **Title**: What this child implements
- **Description**: Detailed explanation
- **Scope**: Specific boundaries
- **Rationale**: Why this child exists
- **SD Type**: database, feature, infrastructure, api, etc.
- **Phase Number**: Position in orchestrator sequence

### 2. Parent SD Context (Alignment)
- **Parent Title**: Overall orchestrator goal
- **Parent Description**: Big picture context
- **Parent Strategic Objectives**: High-level goals to support
- **Parent Rationale**: Why the orchestrator exists

### 3. Sibling SD Context (Sequence Understanding)
- **Other Children**: List of sibling SDs with their status
- **Phase Sequence**: Understanding where this child fits
- **Dependency Awareness**: Which siblings must complete first

Example:
```
## SIBLING SDs IN THIS ORCHESTRATOR (9 others)

- ✅ SD-LEO-ENH-AUTO-PROCEED-001-01: Design AUTO-PROCEED Architecture (infrastructure)
- ✅ SD-LEO-ENH-AUTO-PROCEED-001-02: Add AUTO-PROCEED flag to handoff.js (infrastructure)
- ⏳ SD-LEO-ENH-AUTO-PROCEED-001-06: Verify/Create auto_proceed_sessions Table (database)
- ⏳ SD-LEO-ENH-AUTO-PROCEED-001-07: Implement Skip-and-Continue for Failed SDs (feature)
```

### 4. Similar Completed SDs (Pattern Reference)
- **Same SD Type**: Find completed SDs with same type (database, feature, etc.)
- **Example Objectives**: Real strategic objectives from successful SDs
- **Example Principles**: Real key principles that worked
- **Field Counts**: How many criteria/metrics similar SDs had
- **Smoke Test Presence**: Whether similar SDs defined smoke tests

Example:
```
## SIMILAR COMPLETED SDs FOR PATTERN REFERENCE

### SD-DATABASE-MIGRATE-001: Migrate to RLS-enabled schema
- Example objective: "Complete schema migration with zero data loss" (metric: 100% data integrity verified)
- Example principle: "Backward compatibility maintained during transition"
- Had 4 success criteria, 5 metrics
- Had smoke tests defined
```

### 5. Implementation Scope Inference
- **Likely Areas**: Inferred from keywords (database/migrations, API endpoints, frontend components, etc.)
- **Technical Keywords**: Extracted technologies (SQL, React, Node.js, etc.)
- **Complexity Factors**: Flags like refactoring, integration, batch processing

Example:
```
## INFERRED IMPLEMENTATION SCOPE

Based on the title and description, this SD likely involves:
- **Areas**: database/migrations, scripts/modules
- **Technical aspects**: SQL, schema design, data integrity, Node.js, CLI design
- **Complexity factors**: refactoring, integration
```

### 6. SD Type-Specific Guidance

The system provides tailored guidance for each SD type:

| SD Type | Guidance Focus |
|---------|---------------|
| **database** | Schema correctness, migration safety, RLS policies, index design, backward compatibility, SQL verification queries |
| **api** | Endpoint design, request/response validation, authentication, error handling, API documentation, curl/HTTP test commands |
| **feature** | User-facing functionality, UI/UX, integration, test coverage, user interaction steps |
| **infrastructure** | Reliability, performance, backward compatibility, deployment, rollback procedures, service verification commands |
| **security** | Threat model, authentication/authorization, input validation, audit logging, unauthorized access verification |
| **testing** | Test coverage targets, test reliability, regression prevention, CI/CD integration, meta-tests |
| **refactor** | NO BEHAVIOR CHANGES, code quality, technical debt reduction, baseline capture, before/after comparison |
| **bugfix** | Root cause addressed, regression test added, related areas checked, issue resolution metrics |

## SD Type Detection

The system automatically infers SD type from title/scope keywords:

```javascript
const SD_TYPE_KEYWORDS = {
  documentation: ['research', 'analysis', 'mapping', 'documentation', 'docs', 'audit'],
  infrastructure: ['migration', 'infrastructure', 'setup', 'configuration', 'deployment'],
  feature: ['ui', 'ux', 'user interface', 'dashboard', 'form', 'page', 'component'],
  testing: ['e2e', 'end-to-end', 'test', 'testing', 'qa', 'quality', 'validation'],
  refactor: ['refactor', 'restructure', 'cleanup', 'optimize', 'consolidate'],
  bugfix: ['fix', 'bug', 'issue', 'hotfix', 'patch', 'repair'],
  database: ['table', 'schema', 'migration', 'rls', 'postgres', 'column'],
  api: ['api', 'endpoint', 'route', 'rest', 'graphql', 'controller']
};
```

Confidence scoring:
- Matches keywords → confidence increases
- Multiple keywords → higher confidence
- Unique to one type → high confidence (80-95%)
- No clear matches → defaults to 'implementation' (50%)

## Quality Rubric

The LLM is instructed to generate fields meeting these criteria:

### Strategic Objectives (min 2 required)
- **Specificity**: Must be specific to this child's scope, NOT generic
- **Measurability**: Must have concrete metrics
- **Format**: `{ "objective": "...", "metric": "..." }`
- **Example**: ❌ "Complete the work" → ✅ "Implement orchestrator completion hook with <5ms latency overhead"

### Key Principles (min 2 required)
- **Actionability**: Must provide implementable constraints
- **Guidance**: Should guide technical decisions
- **Format**: `{ "principle": "...", "description": "..." }`
- **Example**: ❌ "Write good code" → ✅ "Fail-open design: Hook failures must not block SD completion"

### Success Criteria (min 3 required)
- **Testability**: Must be yes/no verifiable
- **Coverage**: Different aspects (functionality, quality, integration)
- **Format**: `{ "criterion": "...", "measure": "..." }`
- **Example**: ❌ "Works correctly" → ✅ "Hook fires exactly once per orchestrator completion (idempotent)"

### Success Metrics (min 3 required)
- **Quantifiability**: Must have numeric targets
- **Units**: Must specify unit of measurement
- **Format**: `{ "metric": "...", "target": <number>, "unit": "..." }`
- **Example**: ❌ "Good performance" → ✅ `{ "metric": "Hook execution time", "target": 50, "unit": "milliseconds" }`

### Smoke Test Steps (min 3 required)
- **Observability**: Must be user-observable value demonstration
- **Type-Appropriate**: Matches SD type (SQL for database, curl for API, UI clicks for feature)
- **Format**: `{ "step_number": N, "instruction": "...", "expected_outcome": "..." }`
- **Example**: ❌ "Check that it works" → ✅ `{ "step_number": 1, "instruction": "Query SELECT * FROM auto_proceed_sessions", "expected_outcome": "Table exists with expected schema" }`

## Usage

### Creating New Child SDs with AI (Recommended)

```javascript
import { generateChildSDAsync } from './modules/child-sd-template.js';

const parentSD = await getParentSD('SD-ORCHESTRATOR-001');

const childConfig = {
  phaseNumber: 1,
  phaseTitle: 'Database Migration',
  phaseDescription: 'Migrate schema to support auto_proceed_sessions table',
  phaseScope: 'Create table, add indexes, define RLS policies',
  phaseObjective: 'Database schema supports AUTO-PROCEED session tracking',
  // SD type will be auto-inferred from title/description
  // Strategic fields will be AI-generated
};

const childSD = await generateChildSDAsync(parentSD, childConfig);
// Result: Complete child SD with AI-generated strategic fields

// Insert into database
await supabase.from('strategic_directives_v2').insert(childSD);
```

### Batch Generation

```javascript
import { generatePhaseChildrenAsync } from './modules/child-sd-template.js';

const phases = [
  {
    phaseNumber: 1,
    phaseTitle: 'Foundation Setup',
    phaseDescription: '...',
    phaseScope: '...',
    phaseObjective: '...'
  },
  {
    phaseNumber: 2,
    phaseTitle: 'Core Implementation',
    phaseDescription: '...',
    phaseScope: '...',
    phaseObjective: '...'
  }
];

const result = await generatePhaseChildrenAsync(parentSD, phases);
// result.children: Array of validated child SDs
// result.llmUsed: Count of AI-generated vs template-based
// result.errors: Any validation failures
```

### Fixing Existing Incomplete Children

```bash
# Dry run - see what would be fixed
node scripts/fix-incomplete-child-sds.mjs --parent-id SD-ORCHESTRATOR-001 --dry-run --verbose

# Apply fixes
node scripts/fix-incomplete-child-sds.mjs --parent-id SD-ORCHESTRATOR-001

# Fix all incomplete children across all orchestrators
node scripts/fix-incomplete-child-sds.mjs
```

## Validation

Generated fields are validated before being returned:

```javascript
// Automatically checked:
- strategic_objectives: min 2, each with objective + metric
- key_principles: min 2, each with principle + description
- success_criteria: min 3, each with criterion + measure
- success_metrics: min 3, each with metric + target + unit
- smoke_test_steps: min 3, each with instruction + expected_outcome
- risks: optional (can be empty array for low-risk SDs)
```

Validation failures trigger fallback to template-based inheritance.

## LLM Configuration

```javascript
export const CHILD_SD_LLM_CONFIG = {
  model: 'gpt-4o',        // Production model for quality
  temperature: 0.5,       // Lower for structured, consistent output
  maxTokens: 4000,        // Sufficient for strategic fields JSON
  enabled: process.env.CHILD_SD_LLM_GENERATION !== 'false'
};
```

**Environment Variables**:
- `OPENAI_API_KEY`: Required for LLM generation
- `CHILD_SD_LLM_GENERATION`: Set to 'false' to disable (falls back to templates)
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`: For context fetching
- `SUPABASE_SERVICE_ROLE_KEY`: For database queries

## Fallback Behavior

If LLM generation fails (no API key, timeout, validation failure), the system falls back to template-based inheritance:

```javascript
// Fallback uses parent SD fields as templates
const inherited = inheritStrategicFields(parentSD, {
  phaseNumber,
  phaseTitle,
  phaseObjective
});

// Adds phase context to parent's fields
// Example: "Complete parent objective (P2 contribution)"
```

## Metadata Tracking

Generated child SDs include metadata tracking the generation source:

```javascript
metadata: {
  phase_number: 2,
  parent_sd_key: 'SD-ORCHESTRATOR-001',
  generation_date: '2026-01-25T18:30:00.000Z',
  strategic_fields_source: 'llm',  // or 'template' for fallback
  sd_type_inference: {
    inferred_type: 'database',
    confidence: 85,
    matched_keywords: ['table', 'schema', 'migration'],
    explicit_override: false
  }
}
```

## Performance Considerations

- **LLM Call**: ~2-5 seconds per child SD
- **Context Fetching**: ~200-500ms (sibling + similar SD queries)
- **Batch Processing**: Includes 500ms delay between calls to avoid rate limiting
- **Cost**: ~$0.01-0.03 per child SD (GPT-4o pricing)

For orchestrators with 10+ children, budget 30-60 seconds for AI generation.

## Troubleshooting

### Issue: LLM returns generic/vague fields

**Cause**: Insufficient context (child has minimal description/scope)

**Solution**: Provide richer description and scope in child config before calling `generateChildSDAsync`

### Issue: Generated fields don't pass validation

**Cause**: LLM output didn't meet minimum field counts

**Solution**: System automatically falls back to templates. Check console warnings for details.

### Issue: "LLM service not available"

**Cause**: Missing `OPENAI_API_KEY` environment variable

**Solution**: Set API key: `export OPENAI_API_KEY=sk-...`

### Issue: Child SD has template-based fields instead of AI

**Cause**: Check `childSD.metadata.strategic_fields_source`
- If 'template': LLM failed, check console logs
- If 'llm': AI was used successfully

## Related Documentation

- [Child SD Pattern for Phased Work](../recommendations/child-sd-pattern-for-phased-work.md) - When and why to use child SDs
- [SD Creation Validator](../../scripts/modules/sd-creation-validator.js) - Validation rules
- [LEAD-TO-PLAN Handoff Verification](../leo/handoffs/lead-to-plan.md) - Required fields for LEAD-TO-PLAN

## Version History

- **v1.0.0** (2026-01-25): Initial documentation of AI-powered child SD generation
  - Enhanced context building (sibling, similar SDs, implementation scope)
  - SD type-specific guidance for all types
  - Smoke test generation included
  - Validation and fallback behavior

---

*This is a living document. Update when child SD generation logic changes.*
