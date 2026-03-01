---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [guide, auto-generated]
---

## Table of Contents

- [Stage Template Architecture](#stage-template-architecture)
- [Adding a New Stage Template](#adding-a-new-stage-template)
  - [Step 1: Create the Template File](#step-1-create-the-template-file)
  - [Step 2: Register in the Template Registry](#step-2-register-in-the-template-registry)
  - [Step 3: Add Database Configuration](#step-3-add-database-configuration)
  - [Step 4: Update Dependency Arrays](#step-4-update-dependency-arrays)
  - [Step 5: Add Required Artifacts](#step-5-add-required-artifacts)
  - [Step 6: Configure Gates (If Applicable)](#step-6-configure-gates-if-applicable)
  - [Step 7: Validate the Template](#step-7-validate-the-template)
  - [Complete Checklist for New Stages](#complete-checklist-for-new-stages)
- [Modifying Existing Templates](#modifying-existing-templates)
  - [Updating the Analysis Prompt](#updating-the-analysis-prompt)
  - [Adjusting Required Inputs](#adjusting-required-inputs)
  - [Changing the LLM Tier](#changing-the-llm-tier)
  - [Updating Token Budget](#updating-token-budget)
- [Adding New Gate Boundaries](#adding-new-gate-boundaries)
  - [Reality Gate Boundaries](#reality-gate-boundaries)
  - [Kill Gate Configuration](#kill-gate-configuration)
  - [Gate Interaction Pattern](#gate-interaction-pattern)
- [Adding New Filter Triggers](#adding-new-filter-triggers)
  - [Step 1: Add Trigger Type](#step-1-add-trigger-type)
  - [Step 2: Implement Evaluation Logic](#step-2-implement-evaluation-logic)
  - [Step 3: Add Chairman Preference Key](#step-3-add-chairman-preference-key)
  - [Step 4: Update Documentation](#step-4-update-documentation)
  - [Filter Evaluation Flow](#filter-evaluation-flow)
- [Best Practices](#best-practices)
  - [Template Design](#template-design)
  - [Dependency Management](#dependency-management)
  - [Gate Placement](#gate-placement)
  - [Testing New Templates](#testing-new-templates)
  - [Version Control](#version-control)
- [Template Reference Table](#template-reference-table)
- [Related Documentation](#related-documentation)

---
Category: Guide
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, guide]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Extending Stages Guide

This guide covers how to add new stage templates, modify existing ones, add
gate boundaries, and extend the decision filter system in the Eva Orchestrator.

## Stage Template Architecture

```
lib/eva/stage-templates/
    |
    +-- index.js              Registry (maps stage numbers to modules)
    +-- validation.js         Template validation utility
    +-- stage-01.js           Identity: Purpose & Vision
    +-- stage-02.js           Identity: Target Customer
    +-- ...
    +-- stage-30.js           Growth: Graduation Review
    +-- __tests__/            Per-template test files
```

Each template is a self-contained ES module that exports three members:

```
+-------------------------------------------------------+
|  Stage Template (stage-{NN}.js)                       |
|                                                       |
|  STAGE_METADATA        Declarative configuration      |
|    - stageNumber       Stage identifier (1-30)        |
|    - stageName         Human-readable label           |
|    - stageCategory     identity/blueprint/build/...   |
|    - llmTier           haiku/sonnet/opus              |
|    - estimatedTokens   Token budget for LLM call      |
|    - requiredInputs    Artifact types needed as input  |
|    - outputArtifactTypes  Artifact types produced     |
|    - dependsOn         Stage numbers that must run first|
|                                                       |
|  ANALYSIS_PROMPT       LLM prompt template string     |
|    - Contains {{variable}} placeholders               |
|    - Includes output format specification             |
|    - Defines quality scoring criteria                 |
|                                                       |
|  execute(inputs, llmClient)  Async execution function |
|    - Receives gathered inputs and LLM client          |
|    - Returns { output, qualityScore }                 |
|    - Handles input validation                         |
|    - Handles output parsing                           |
+-------------------------------------------------------+
```

## Adding a New Stage Template

Follow these steps to add a new stage template to the lifecycle.

### Step 1: Create the Template File

Create a new file at `lib/eva/stage-templates/stage-{NN}.js` where `{NN}` is
the zero-padded stage number.

The file must export these three members:

**STAGE_METADATA** - A plain object with declarative configuration:

| Field | Type | Description |
|-------|------|-------------|
| `stageNumber` | number | Must match the `{NN}` in the filename |
| `stageName` | string | Descriptive name (e.g., "Market Sizing Analysis") |
| `stageCategory` | string | One of: `identity`, `blueprint`, `build`, `launch`, `growth` |
| `llmTier` | string | LLM quality tier: `haiku`, `sonnet`, or `opus` |
| `estimatedTokens` | number | Expected token usage for the LLM call |
| `requiredInputs` | string[] | Artifact types from prior stages needed as input |
| `outputArtifactTypes` | string[] | Artifact types this stage produces |
| `dependsOn` | number[] | Stage numbers that must complete before this one |

**ANALYSIS_PROMPT** - A string template with `{{variable}}` placeholders:

- Placeholders are populated from gathered inputs at runtime
- Must include explicit output format specification (JSON schema)
- Should include quality scoring criteria for the LLM to self-evaluate
- Must instruct the LLM to respond with valid JSON only

**execute(inputs, llmClient)** - An async function:

- `inputs`: Object with keys matching `requiredInputs`, values are artifacts
- `llmClient`: LLM client instance (from the factory, matching `llmTier`)
- Must return `{ output: object, qualityScore: number }`
- `qualityScore` must be between 0 and 1
- Should validate inputs before calling LLM
- Should parse and validate LLM output before returning

### Step 2: Register in the Template Registry

Add the new template to `lib/eva/stage-templates/index.js`:

The registry maps stage numbers to their template modules. It uses dynamic
imports for lazy loading, so templates are only loaded when requested.

Add an entry that maps the new stage number to its module path. The registry's
`getStageTemplate()` function will then be able to resolve it.

### Step 3: Add Database Configuration

Insert a row into the `lifecycle_stage_config` table:

| Column | Value |
|--------|-------|
| `stage_number` | The new stage number |
| `stage_name` | Same as `STAGE_METADATA.stageName` |
| `stage_category` | Same as `STAGE_METADATA.stageCategory` |
| `depends_on` | Array of prerequisite stage numbers |
| `required_artifacts` | Artifact types required before this stage |
| `gate_type` | `null` (no gate), `kill`, `reality`, or `promotion` |
| `is_active` | `true` |

Use the DATABASE sub-agent to execute the migration for this insert.

### Step 4: Update Dependency Arrays

If the new stage is a dependency for other stages, update those stages:

1. Update `depends_on` arrays in `lifecycle_stage_config` for downstream stages
2. Update `dependsOn` in the `STAGE_METADATA` of downstream template files
3. Update `requiredInputs` in downstream templates if they consume this
   stage's artifacts

### Step 5: Add Required Artifacts

If other stages need artifacts from this new stage:

1. Document the artifact types in `outputArtifactTypes`
2. Add matching entries to downstream stages' `requiredInputs`
3. Ensure the artifact type names are consistent across all references

### Step 6: Configure Gates (If Applicable)

If the new stage sits at a phase boundary or requires gate enforcement:

#### For Reality Gates

Add a boundary entry to `BOUNDARY_CONFIG` in `lib/eva/gates/reality-gates.js`:

| Config Field | Purpose |
|--------------|---------|
| `fromStage` | Last stage before the boundary |
| `toStage` | First stage after the boundary |
| `requiredArtifacts` | Array of artifact types that must exist |
| `minimumScores` | Map of artifact type to minimum quality score |

#### For Kill Gates

Add a kill gate configuration in `lib/eva/gates/stage-gates.js`:

| Config Field | Purpose |
|--------------|---------|
| `stageNumber` | Stage where the kill gate fires |
| `scoreField` | Which output field to evaluate |
| `defaultThreshold` | Fallback threshold if Chairman has no preference |

#### For Promotion Gates

Add a promotion gate checklist to the Chairman preferences schema:

| Config Field | Purpose |
|--------------|---------|
| `stageNumber` | Stage where promotion is evaluated |
| `checklistItems` | Array of condition descriptions |
| `requireAll` | Whether all items must pass (vs. majority) |

### Step 7: Validate the Template

Run the validation utility to catch configuration errors:

```bash
node lib/eva/stage-templates/validation.js --stage {NN} --verbose
```

The validator checks:

- All three exports exist (`STAGE_METADATA`, `ANALYSIS_PROMPT`, `execute`)
- `STAGE_METADATA` has all required fields with correct types
- `stageNumber` matches the filename
- `stageCategory` is a valid category
- `llmTier` is a valid tier
- `dependsOn` references only valid stage numbers
- `requiredInputs` can be satisfied by outputs of dependency stages
- No circular dependencies exist

### Complete Checklist for New Stages

```
+---+----------------------------------------------+
| # | Action                                       |
+---+----------------------------------------------+
| 1 | Create lib/eva/stage-templates/stage-{NN}.js |
| 2 | Export STAGE_METADATA, ANALYSIS_PROMPT, execute |
| 3 | Register in stage-templates/index.js         |
| 4 | Insert row in lifecycle_stage_config table    |
| 5 | Update depends_on for dependent stages        |
| 6 | Add required_artifacts to lifecycle_stage_config |
| 7 | Add gate boundary (if gated stage)            |
| 8 | Add kill/promotion gate config (if applicable)|
| 9 | Run validation: validation.js --stage {NN}    |
+---+----------------------------------------------+
```

## Modifying Existing Templates

### Updating the Analysis Prompt

The `ANALYSIS_PROMPT` drives the LLM's analysis. To change what analysis
is performed:

1. Modify the prompt text in the template file
2. Ensure `{{variable}}` placeholders still match available inputs
3. If adding new placeholders, add corresponding entries to `requiredInputs`
4. Update `estimatedTokens` if the prompt length changed significantly
5. Run the template through validation
6. Run unit tests to verify output schema compatibility

**Considerations**:

- Changes to output format require updating the `execute()` function's
  parsing logic
- Changes to quality scoring criteria affect gate evaluations downstream
- Major prompt changes should be tested against real venture data

### Adjusting Required Inputs

To change what artifacts a stage consumes:

1. Update `requiredInputs` in `STAGE_METADATA`
2. Update `dependsOn` if the input comes from a stage not previously listed
3. Update `{{variable}}` placeholders in `ANALYSIS_PROMPT`
4. Update the `execute()` function's input handling
5. Run validation to check dependency consistency

### Changing the LLM Tier

To adjust the cost/quality tradeoff for a stage:

| Tier | When to Use |
|------|-------------|
| `haiku` | Simple classification, formatting, summarization |
| `sonnet` | Multi-factor analysis, structured output, moderate reasoning |
| `opus` | Complex strategic reasoning, high-stakes decisions |

After changing `llmTier`:

1. Update `estimatedTokens` (different models have different capacities)
2. Review prompt complexity - simpler models need clearer instructions
3. Consider output quality impact on downstream gate evaluations

### Updating Token Budget

If a stage consistently runs into token limits or uses far less than budgeted:

1. Check actual token usage from `eva_events` (logged per stage execution)
2. Update `estimatedTokens` in `STAGE_METADATA` to reflect actual usage
3. Add a 20% buffer above observed maximum for safety

## Adding New Gate Boundaries

### Reality Gate Boundaries

Reality gates enforce artifact completeness at phase transitions. To add
a new boundary:

1. Identify the transition point (between which two stages)
2. Determine required artifacts (what must exist to proceed)
3. Set minimum quality scores per artifact type

Add the configuration to `BOUNDARY_CONFIG` in `lib/eva/gates/reality-gates.js`.

**Boundary Configuration Structure**:

```
BOUNDARY_CONFIG entry:
  |
  +-- boundary: string       Human-readable boundary name
  +-- fromStage: number      Last stage before boundary
  +-- toStage: number        First stage after boundary
  +-- requiredArtifacts:     Array of:
  |     +-- artifactType: string   Type identifier
  |     +-- minimumScore: number   0-1 quality threshold
  |     +-- required: boolean      Hard requirement vs advisory
  +-- description: string    Why this boundary exists
```

### Kill Gate Configuration

Kill gates evaluate whether a venture should continue. To add a new
kill gate boundary:

1. Determine which stage output should be evaluated
2. Set the score field within the stage output to evaluate
3. Configure the default threshold
4. Update the gate evaluation logic in `lib/eva/gates/stage-gates.js`

Kill gates always defer to the Chairman's `kill_gate_threshold` preference
if one is set. The default threshold is used only when no preference exists.

### Gate Interaction Pattern

```
Stage Completes
    |
    +-- Is this a reality gate boundary?
    |     |
    |     YES: Check all required artifacts
    |     |     |
    |     |     All present → PASS
    |     |     Any missing → BLOCK (list missing)
    |     |
    |     NO: Continue
    |
    +-- Is this a kill gate stage?
    |     |
    |     YES: Evaluate quality score
    |     |     |
    |     |     Score >= threshold → PASS
    |     |     Score < threshold → KILL RECOMMENDATION
    |     |       |
    |     |       Chairman decides: persevere / pivot / terminate
    |     |
    |     NO: Continue
    |
    +-- Is this a promotion gate boundary?
          |
          YES: Check promotion checklist
          |     |
          |     All items satisfied → PROMOTE to next phase
          |     Items missing → BLOCK (list incomplete)
          |
          NO: Continue to next stage
```

## Adding New Filter Triggers

The Decision Filter Engine at `lib/eva/decision-filter-engine.js` applies
Chairman preferences to stage decisions. To add a new filter trigger:

### Step 1: Add Trigger Type

Add a new trigger type to `TRIGGER_TYPES` in `decision-filter-engine.js`.

The trigger type defines:

| Field | Purpose |
|-------|---------|
| `name` | Unique trigger identifier |
| `description` | What this trigger evaluates |
| `evaluateAt` | When the trigger fires (pre-stage, post-stage, gate) |
| `defaultBehavior` | What happens if no Chairman preference is set |

### Step 2: Implement Evaluation Logic

Add the evaluation function for the new trigger. The function receives:

- `stageOutput`: The current stage's output object
- `ventureContext`: The active venture's metadata and history
- `preferences`: Current Chairman preferences

The function must return a filter result:

| Field | Type | Purpose |
|-------|------|---------|
| `triggered` | boolean | Whether the filter condition was met |
| `action` | string | What to do: `allow`, `warn`, `block`, `escalate` |
| `reason` | string | Human-readable explanation |
| `metadata` | object | Additional context for the decision |

### Step 3: Add Chairman Preference Key

Add the corresponding preference key to the Chairman preference schema
so the Chairman can configure the trigger's behavior.

Preference keys follow the naming convention:
`filter_{trigger_name}_{parameter}`

Example: `filter_market_size_minimum_tam` for a market size trigger.

### Step 4: Update Documentation

After adding a new trigger:

1. Document the trigger in this file's filter triggers section
2. Add the preference key to the developer setup guide's preference table
3. Update any affected stage templates that might interact with the filter

### Filter Evaluation Flow

```
+---------------------+
| Stage Output Ready  |
+---------+-----------+
          |
+---------v-----------+
| Load Active Filters |
| (from preferences)  |
+---------+-----------+
          |
+---------v-----------+
| For each filter:    |
|   evaluate(output,  |
|     context, prefs) |
+---------+-----------+
          |
     +----+----+
     |         |
  No triggers  One or more
  fired        triggered
     |         |
+----v----+ +--v-----------+
| PASS    | | Apply action |
| Continue| | (warn/block/ |
+---------+ |  escalate)   |
            +--+-----------+
               |
          +----+----+
          |         |
       Allow     Block
          |         |
     +----v----+ +--v---------+
     | Log     | | Halt stage |
     | warning | | processing |
     +---------+ | Chairman   |
                  | decides    |
                  +------------+
```

## Best Practices

### Template Design

- Keep `ANALYSIS_PROMPT` focused on a single analytical dimension
- Use `{{variable}}` placeholders consistently with `requiredInputs`
- Include explicit JSON output format specification in every prompt
- Include quality scoring criteria so the LLM can self-evaluate
- Keep `estimatedTokens` accurate to avoid unnecessary costs

### Dependency Management

- Minimize the dependency chain length (avoid A depends on B depends on C
  depends on D chains longer than 3 levels)
- Use direct dependencies only - do not list transitive dependencies
- When a stage's inputs come from multiple prior stages, list all direct
  source stages in `dependsOn`

### Gate Placement

- Place kill gates at natural phase boundaries (every 6 stages)
- Place reality gates where artifact completeness is critical for the
  next phase's success
- Avoid placing gates on every stage - this creates excessive friction
- Use promotion gates for major phase transitions only

### Testing New Templates

1. Run validation first: `validation.js --stage {NN}`
2. Write unit tests with mock dependencies
3. Run integration test with a test venture
4. Verify the template's output feeds correctly into downstream stages
5. Check that any gate at this stage boundary evaluates correctly

### Version Control

- Stage template changes should be tracked as code changes
- Database configuration changes (lifecycle_stage_config) should have
  corresponding migration files
- Gate configuration changes should be reviewed for downstream impact

## Template Reference Table

| Stage | Category | Gates | Key Artifacts |
|-------|----------|-------|---------------|
| 1-6 | Identity | Kill @ 6 | purpose, customer, value-prop |
| 7-12 | Blueprint | Kill @ 12 | revenue-model, operations, financials |
| 13-18 | Build | Kill @ 18, Bridge | mvp-spec, architecture, launch-plan |
| 19-24 | Launch | Kill @ 24 | go-to-market, sales, metrics |
| 25-30 | Growth | Kill @ 30 | drift-analysis, partnerships, graduation |

Reality gates exist between each category boundary (6→7, 12→13, 18→19, 24→25).

## Related Documentation

- Developer Setup: `docs/workflow/cli-venture-lifecycle/guides/developer-setup.md`
- Running a Venture: `docs/workflow/cli-venture-lifecycle/guides/running-a-venture.md`
- Testing Guide: `docs/workflow/cli-venture-lifecycle/guides/testing-guide.md`
- Troubleshooting: `docs/workflow/cli-venture-lifecycle/guides/troubleshooting.md`
- Stage Reference: `docs/workflow/cli-venture-lifecycle/reference/`
