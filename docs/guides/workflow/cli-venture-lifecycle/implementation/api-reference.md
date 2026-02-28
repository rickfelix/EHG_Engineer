
## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Eva Orchestrator](#eva-orchestrator)
  - [constructor(options)](#constructoroptions)
  - [initialize()](#initialize)
  - [processStage(stageId, options)](#processstagestageid-options)
  - [run(options)](#runoptions)
  - [getStatus()](#getstatus)
- [Decision Filter Engine](#decision-filter-engine)
  - [evaluateDecision(input, options)](#evaluatedecisioninput-options)
  - [Constants](#constants)
- [Reality Gates](#reality-gates)
  - [evaluateRealityGate(params)](#evaluaterealitygateparams)
  - [getBoundaryConfig(fromStage, toStage)](#getboundaryconfigfromstage-tostage)
  - [isGatedBoundary(fromStage, toStage)](#isgatedboundaryfromstage-tostage)
  - [Constants](#constants)
- [Chairman Preference Store](#chairman-preference-store)
  - [constructor({ supabaseClient })](#constructor-supabaseclient-)
  - [setPreference(params)](#setpreferenceparams)
  - [getPreference(params)](#getpreferenceparams)
  - [getPreferences(params)](#getpreferencesparams)
  - [deletePreference(params)](#deletepreferenceparams)
  - [linkDecisionToPreferences(params)](#linkdecisiontopreferencesparams)
- [Devil's Advocate](#devils-advocate)
  - [isDevilsAdvocateGate(stageId)](#isdevilsadvocategatestageid)
  - [getDevilsAdvocateReview(params, deps)](#getdevilsadvocatereviewparams-deps)
  - [buildArtifactRecord(ventureId, review)](#buildartifactrecordventureid-review)
- [Lifecycle-SD Bridge](#lifecycle-sd-bridge)
  - [convertSprintToSDs(params, deps)](#convertsprinttosdsparams-deps)
  - [buildBridgeArtifactRecord(ventureId, stageId, result)](#buildbridgeartifactrecordventureid-stageid-result)
- [Constraint Drift Detector](#constraint-drift-detector)
  - [detectConstraintDrift(params)](#detectconstraintdriftparams)
  - [buildFilterEnginePayload(driftResult)](#buildfilterenginepayloaddriftresult)
- [Cross-Venture Learning](#cross-venture-learning)
  - [analyzeCrossVenturePatterns(supabase, options)](#analyzecrossventurepatternssupabase-options)
- [Services](#services)
  - [VentureResearchService](#ventureresearchservice)
  - [BrandGenomeService](#brandgenomeservice)
  - [CompetitiveIntelligenceService](#competitiveintelligenceservice)
- [Stage Template Registry](#stage-template-registry)
  - [getTemplate(stageNumber)](#gettemplatestagenumber)
  - [getAllTemplates()](#getalltemplates)

---
Category: Implementation
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, implementation]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# API Reference

This document describes the public API surface of the Eva Orchestrator CLI Venture Lifecycle system. All modules are located under `lib/eva/`.

## Architecture Overview

```
+---------------------------+
|     CLI Entry Point       |
|  (commands/venture.js)    |
+------------+--------------+
             |
             v
+---------------------------+
|    Eva Orchestrator       |
| (eva-orchestrator.js)     |
+--+------+------+------+--+
   |      |      |      |
   v      v      v      v
+------+ +----+ +----+ +----------+
|Stage | |Dec.| |Real| |Chairman  |
|Templ.| |Filt| |Gate| |Pref Store|
+------+ +----+ +----+ +----------+
   |                        |
   v                        v
+------+              +-----------+
|Devil | <----------> |Chairman   |
|Advoc.| (advisory)   |Decisions  |
+------+              +-----------+
   |
   v
+---------------------------+
|   Lifecycle-SD Bridge     |
| (lifecycle-sd-bridge.js)  |
+---------------------------+
```

## Eva Orchestrator

**Module:** `lib/eva/eva-orchestrator.js`

The central coordination engine. Manages venture lifecycle progression, stage execution, and integration with all subsystems.

### constructor(options)

Creates a new Eva Orchestrator instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| options.ventureId | UUID (string) | Yes | Target venture identifier |
| options.chairmanId | UUID (string) | Yes | Chairman user identifier for preference resolution |
| options.db | SupabaseClient | Yes | Initialized Supabase client |
| options.llmClient | Object | No | LLM client instance (uses factory default if omitted) |
| options.logger | Object | No | Logger instance (uses console if omitted) |
| options.dryRun | boolean | No | If true, simulates operations without persisting (default: false) |

**Error Conditions:**
- Throws if `ventureId` is missing or not a valid UUID
- Throws if `chairmanId` is missing
- Throws if `db` is missing or not a valid Supabase client

### initialize()

Loads venture context, chairman preferences, lifecycle stage configuration, and initializes the internal state machine.

**Returns:** `Promise<void>`

**Side Effects:**
- Queries `ventures` table for current venture state
- Queries `lifecycle_stage_config` for all 25 stage definitions
- Queries `chairman_preferences` for resolved preference set
- Initializes internal state machine with current stage

**Error Conditions:**
- Throws `ContextLoadError` if venture not found
- Throws `ContextLoadError` if chairman preferences cannot be loaded
- Logs warning if stage config is incomplete (non-blocking)

**Must be called before:** `processStage()`, `run()`, or `getStatus()`

### processStage(stageId, options)

Processes a single lifecycle stage. This is the core execution unit.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| stageId | integer | Yes | Stage number (1-25) |
| options.force | boolean | No | Skip dependency checks (default: false) |
| options.skipAdvisory | boolean | No | Skip Devil's Advocate review even on advisory stages (default: false) |

**Returns:** `Promise<StatusResult>`

```
StatusResult {
  status: 'COMPLETED' | 'BLOCKED' | 'FAILED',
  stageId: integer,
  artifacts: ArtifactRecord[],
  transitions: TransitionRecord[],
  decisions: DecisionRecord[],
  gatResults: GateResult[],
  advisory: AdvisoryResult | null,
  duration_ms: integer,
  error: string | null
}
```

**Execution Flow:**

```
processStage(stageId)
    |
    +-> Load stage template (stage-templates/index.js)
    |
    +-> Check dependencies (lifecycle_stage_config.depends_on)
    |
    +-> Execute LLM generation (template.prompt + venture context)
    |
    +-> Evaluate Decision Filter (decision-filter-engine.js)
    |   +-> If Class B/C: create eva_decisions record
    |
    +-> Evaluate Reality Gates (reality-gates.js)
    |   +-> Kill gate, promotion gate, quality gate
    |
    +-> Devil's Advocate review (if advisory_enabled)
    |   +-> Stages 3, 5, 16 only
    |
    +-> Persist artifacts (venture_artifacts)
    |
    +-> Record transition (venture_stage_transitions)
    |
    +-> Emit events (eva_events)
    |
    +-> Return StatusResult
```

**Error Conditions:**
- Returns `FAILED` if template not found for stageId
- Returns `BLOCKED` if dependency stages not completed
- Returns `BLOCKED` if reality gate rejects transition
- Returns `FAILED` if state machine rejects transition
- Retries 3x with exponential backoff on LLM errors
- Retries 3x immediately on artifact persistence errors

### run(options)

Processes multiple stages sequentially, advancing through the lifecycle.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| options.fromStage | integer | No | Starting stage (default: current stage) |
| options.toStage | integer | No | Ending stage (default: fromStage + 1) |
| options.continueOnBlocked | boolean | No | Skip blocked stages and continue (default: false) |

**Returns:** `Promise<RunResult>`

```
RunResult {
  stagesProcessed: StatusResult[],
  stagesSkipped: integer[],
  finalStage: integer,
  overallStatus: 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'FAILED',
  duration_ms: integer
}
```

**Error Conditions:**
- Returns `BLOCKED` if first stage is blocked and `continueOnBlocked` is false
- Returns `PARTIAL` if some stages completed but execution stopped
- Returns `FAILED` if an unrecoverable error occurs

### getStatus()

Returns the current state of the orchestrator.

**Returns:** `Promise<StatusInfo>`

```
StatusInfo {
  ventureId: UUID,
  ventureName: string,
  currentStage: integer,
  ventureStatus: 'active' | 'paused' | 'killed' | 'graduated',
  healthScore: number,
  healthStatus: 'healthy' | 'warning' | 'critical',
  pendingDecisions: integer,
  completedStages: integer[],
  blockedStages: integer[],
  nextAvailableStage: integer | null
}
```

**Error Conditions:**
- Throws if orchestrator not initialized

---

## Decision Filter Engine

**Module:** `lib/eva/decision-filter-engine.js`

Evaluates whether a stage transition should auto-proceed or requires human/chairman intervention.

### evaluateDecision(input, options)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input.ventureId | UUID | Yes | Target venture |
| input.stageId | integer | Yes | Current stage number |
| input.metrics | Object | No | Current financial/health metrics |
| input.artifacts | Object[] | No | Stage artifacts for quality evaluation |
| input.preferences | Object | No | Resolved chairman preferences |
| options.dryRun | boolean | No | Simulate without side effects |

**Returns:** `Promise<DecisionResult>`

```
DecisionResult {
  auto_proceed: boolean,
  triggers: TriggerResult[],
  recommendation: 'proceed' | 'pivot' | 'fix' | 'kill' | 'pause',
  decision_class: 'A' | 'B' | 'C',
  rationale: string,
  engine_version: string
}

TriggerResult {
  type: string,        // TRIGGER_TYPES constant
  fired: boolean,
  value: any,
  threshold: any,
  message: string
}
```

**Error Conditions:**
- Returns conservative defaults if preferences unavailable
- Logs warning for unknown trigger types (non-blocking)

### Constants

| Constant | Description |
|----------|-------------|
| ENGINE_VERSION | Current engine version string |
| TRIGGER_TYPES | Enumeration of all trigger type identifiers |
| PREFERENCE_KEYS | All preference keys the engine reads |
| DEFAULTS | Default values when preferences are missing |

**Integration Notes:**
- The engine is stateless: all context must be passed in via `input`
- Preferences are resolved via ChairmanPreferenceStore before being passed here
- Trigger results are persisted in `eva_audit_log` for traceability
- Constraint drift results from `constraint-drift-detector.js` can be converted to filter triggers via `buildFilterEnginePayload()`

---

## Reality Gates

**Module:** `lib/eva/reality-gates.js`

Evaluates boundary conditions between lifecycle stages. Gates enforce quality thresholds, kill conditions, and promotion criteria.

### evaluateRealityGate(params)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.ventureId | UUID | Yes | Target venture |
| params.fromStage | integer | Yes | Current stage |
| params.toStage | integer | Yes | Destination stage |
| params.artifacts | Object[] | Yes | Artifacts to evaluate |
| params.metrics | Object | No | Current venture metrics |
| params.db | SupabaseClient | Yes | Database client |

**Returns:** `Promise<GateResult>`

```
GateResult {
  passed: boolean,
  gate_type: 'kill' | 'promotion' | 'quality' | 'boundary',
  reason_code: string,     // REASON_CODES constant
  details: string,
  score: number | null,
  threshold: number | null
}
```

**Error Conditions:**
- Returns `{ passed: false }` on database errors (fail-closed behavior)
- Logs error details for debugging

### getBoundaryConfig(fromStage, toStage)

Returns the gate configuration for a specific stage boundary, if one exists.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fromStage | integer | Yes | Origin stage |
| toStage | integer | Yes | Destination stage |

**Returns:** `BoundaryConfig | null`

```
BoundaryConfig {
  gate_type: string,
  min_quality_score: number,
  required_artifacts: string[],
  kill_conditions: Object[],
  promotion_criteria: Object[]
}
```

Returns `null` if no gate is configured for this boundary.

### isGatedBoundary(fromStage, toStage)

Quick check for whether a gate exists between two stages.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fromStage | integer | Yes | Origin stage |
| toStage | integer | Yes | Destination stage |

**Returns:** `boolean`

### Constants

| Constant | Description |
|----------|-------------|
| BOUNDARY_CONFIG | Configuration map of all gated boundaries |
| REASON_CODES | Enumeration of gate failure reason codes |
| MODULE_VERSION | Current module version string |

**Integration Notes:**
- Reality Gates are evaluated during `processStage()` before any transition is recorded
- Gates are fail-closed: any error results in gate failure (conservative)
- Not all stage boundaries have gates; ungated boundaries pass automatically
- Kill gates can trigger venture status change to 'killed'

---

## Chairman Preference Store

**Module:** `lib/eva/chairman-preference-store.js`

Manages scoped preferences for Chairman governance. Supports global defaults, venture-specific overrides, and batch operations.

### constructor({ supabaseClient })

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| supabaseClient | SupabaseClient | Yes | Initialized Supabase client |

### setPreference(params)

Sets or updates a preference value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.chairmanId | UUID | Yes | Chairman identifier |
| params.ventureId | UUID | No | NULL for global, UUID for venture-specific |
| params.key | string | Yes | Preference key name |
| params.value | any | Yes | Preference value (serialized to JSONB) |
| params.valueType | string | No | Type hint: 'number', 'string', 'boolean', 'object', 'array' |

**Returns:** `Promise<{ success: boolean, data: Object, error: string | null }>`

**Error Conditions:**
- Returns `{ success: false }` if database write fails
- Validates `valueType` against allowed values

### getPreference(params)

Retrieves a single preference with scope resolution.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.chairmanId | UUID | Yes | Chairman identifier |
| params.ventureId | UUID | No | Target venture for scope resolution |
| params.key | string | Yes | Preference key name |

**Returns:** `Promise<{ value: any, source: 'venture' | 'global' | 'default', error: string | null }>`

**Scope Resolution Order:**
1. Venture-specific preference (exact venture_id match)
2. Global preference (venture_id IS NULL)
3. System default from DEFAULTS constant

### getPreferences(params)

Retrieves multiple preferences in a batch operation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.chairmanId | UUID | Yes | Chairman identifier |
| params.ventureId | UUID | No | Target venture for scope resolution |
| params.keys | string[] | Yes | Array of preference key names |

**Returns:** `Promise<{ preferences: Object, errors: string[] }>`

The returned `preferences` object is keyed by preference name with resolved values.

**Performance Note:** Uses a 2-query batch pattern (one for venture-specific, one for global) rather than N individual queries.

### deletePreference(params)

Removes a specific preference.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.chairmanId | UUID | Yes | Chairman identifier |
| params.ventureId | UUID | No | NULL for global, UUID for venture-specific |
| params.key | string | Yes | Preference key to delete |

**Returns:** `Promise<{ success: boolean, error: string | null }>`

### linkDecisionToPreferences(params)

Creates an immutable preference snapshot and links it to a chairman decision record.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.chairmanId | UUID | Yes | Chairman identifier |
| params.ventureId | UUID | Yes | Venture context |
| params.decisionId | UUID | Yes | Target chairman_decisions record |
| params.preferenceKeys | string[] | No | Specific keys to snapshot (default: all) |

**Returns:** `Promise<{ success: boolean, snapshot: Object, error: string | null }>`

**Integration Notes:**
- The snapshot is stored in `chairman_decisions.preference_snapshot` as immutable JSONB
- Once linked, the snapshot cannot be modified even if underlying preferences change
- Used for audit trail: "what preferences were active when this decision was made?"

---

## Devil's Advocate

**Module:** `lib/eva/devils-advocate.js`

Provides contrarian review at advisory-enabled lifecycle stages. Challenges assumptions, identifies risks, and generates alternative perspectives.

### isDevilsAdvocateGate(stageId)

Checks whether a stage triggers Devil's Advocate review.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| stageId | integer | Yes | Stage number to check |

**Returns:** `boolean`

Currently returns `true` for stages 3, 5, and 16 (matching `lifecycle_stage_config.advisory_enabled`).

### getDevilsAdvocateReview(params, deps)

Generates a contrarian review of stage artifacts and venture direction.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.ventureId | UUID | Yes | Target venture |
| params.stageId | integer | Yes | Current stage |
| params.artifacts | Object[] | Yes | Stage artifacts to challenge |
| params.ventureContext | Object | Yes | Full venture state for context |
| deps.llmClient | Object | Yes | LLM client for review generation |
| deps.db | SupabaseClient | Yes | Database client |

**Returns:** `Promise<ReviewResult>`

```
ReviewResult {
  challenges: Challenge[],
  risks: Risk[],
  alternatives: Alternative[],
  overallAssessment: string,
  confidenceScore: number,
  recommendedAction: 'proceed' | 'reconsider' | 'pause'
}

Challenge {
  assumption: string,
  counterpoint: string,
  severity: 'low' | 'medium' | 'high'
}
```

**Error Conditions:**
- LLM API errors: non-blocking fallback (logs warning, returns empty review)
- Missing artifacts: returns partial review with warnings
- This is a non-blocking operation: failures do not prevent stage progression

### buildArtifactRecord(ventureId, review)

Converts a Devil's Advocate review into a venture_artifacts record for persistence.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ventureId | UUID | Yes | Target venture |
| review | ReviewResult | Yes | Review to persist |

**Returns:** `Object` (artifact record ready for database insertion)

---

## Lifecycle-SD Bridge

**Module:** `lib/eva/lifecycle-sd-bridge.js`

Converts lifecycle stage work into LEO Protocol Strategic Directives. This is the integration point between the venture lifecycle and the SD execution system.

### convertSprintToSDs(params, deps)

Converts a stage's work items into an orchestrator SD with child SDs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.ventureId | UUID | Yes | Source venture |
| params.stageId | integer | Yes | Stage to convert |
| params.sprintPlan | Object | Yes | Sprint plan from stage template |
| params.ventureCode | string | Yes | Venture code for SD key generation |
| deps.db | SupabaseClient | Yes | Database client |
| deps.sdCreator | Object | No | SD creation utility (default: leo-create-sd.js) |

**Returns:** `Promise<BridgeResult>`

```
BridgeResult {
  orchestratorSd: {
    sd_key: string,
    title: string,
    sd_type: string,
    status: string
  },
  childSds: Array<{
    sd_key: string,
    title: string,
    sd_type: string,
    parent_sd_key: string,
    status: string
  }>,
  artifact: Object
}
```

**Error Conditions:**
- Throws if stage config has `sd_required: false`
- Throws if sprint plan is empty or malformed
- SD creation failures are surfaced with full error context

### buildBridgeArtifactRecord(ventureId, stageId, result)

Creates an artifact record capturing the SD bridge output.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ventureId | UUID | Yes | Source venture |
| stageId | integer | Yes | Source stage |
| result | BridgeResult | Yes | Bridge output to record |

**Returns:** `Object` (artifact record for database insertion)

**Integration Notes:**
- SD keys are generated using the pattern: `SD-{VENTURE_CODE}-{SD_SUFFIX}-{SEQUENCE}`
- The `sd_suffix` comes from `lifecycle_stage_config.sd_suffix`
- Child SD types are inferred from the stage's `work_type`
- The bridge creates SDs in the `strategic_directives_v2` table

---

## Constraint Drift Detector

**Module:** `lib/eva/constraint-drift-detector.js`

Detects drift between baseline assumptions and current venture state. Identifies when ventures have deviated from their original constraints.

### detectConstraintDrift(params)

Analyzes a venture for constraint drift across multiple dimensions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params.ventureId | UUID | Yes | Target venture |
| params.baselineAssumptions | Object | Yes | Original assumption set |
| params.currentState | Object | Yes | Current venture metrics/state |
| params.stageId | integer | No | Current stage for context |

**Returns:** `Promise<DriftResult>`

```
DriftResult {
  hasDrift: boolean,
  driftScore: number,          // 0.0 to 1.0
  dimensions: DriftDimension[],
  recommendations: string[],
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

DriftDimension {
  name: string,
  baseline: any,
  current: any,
  driftPercentage: number,
  significance: 'low' | 'medium' | 'high'
}
```

### buildFilterEnginePayload(driftResult)

Converts a drift detection result into a trigger payload compatible with the Decision Filter Engine.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| driftResult | DriftResult | Yes | Drift analysis to convert |

**Returns:** `FilterTrigger` (compatible with `evaluateDecision()` input)

**Integration Notes:**
- Drift results feed into the Decision Filter Engine as constraint triggers
- High/critical drift may elevate decision class from A to B or C
- Baseline assumptions are stored in the `assumption_sets` table

---

## Cross-Venture Learning

**Module:** `lib/eva/cross-venture-learning.js`

Analyzes patterns across multiple ventures to identify reusable insights and common failure modes.

### analyzeCrossVenturePatterns(supabase, options)

Performs cross-venture pattern analysis.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| supabase | SupabaseClient | Yes | Database client |
| options.ventureIds | UUID[] | No | Specific ventures to analyze (default: all active) |
| options.minConfidence | number | No | Minimum pattern confidence threshold (default: 0.7) |
| options.patternTypes | string[] | No | Filter by pattern type |

**Returns:** `Promise<PatternResult>`

```
PatternResult {
  patterns: Pattern[],
  insights: Insight[],
  recommendations: Recommendation[],
  venturesAnalyzed: integer,
  analysisTimestamp: ISO8601
}
```

**Integration Notes:**
- Queries across multiple ventures' artifacts, transitions, and decisions
- Patterns are identified using statistical analysis, not LLM inference
- Results can be used to inform Decision Filter Engine thresholds

---

## Services

### VentureResearchService

**Module:** `lib/eva/services/venture-research.js`

Manages structured research sessions for ventures.

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| createSession(params) | ventureId, methodology, scope | SessionRecord | Start new research session |
| addFinding(params) | sessionId, finding, source, confidence | FindingRecord | Record a research finding |
| completeSession(sessionId) | sessionId | SessionSummary | Finalize and summarize session |
| getSessionsByVenture(ventureId) | ventureId | SessionRecord[] | List all sessions for venture |

### BrandGenomeService

**Module:** `lib/eva/services/brand-genome.js`

Manages brand identity data with completeness scoring.

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| createGenome(params) | ventureId, brandData | GenomeRecord | Initialize brand genome |
| updateGenome(params) | genomeId, updates | GenomeRecord | Update brand attributes |
| getCompleteness(genomeId) | genomeId | CompletenessScore | Calculate completion % |
| getGenomeByVenture(ventureId) | ventureId | GenomeRecord | Retrieve venture's genome |

### CompetitiveIntelligenceService

**Module:** `lib/eva/services/competitive-intelligence.js`

Tracks competitor data and market positioning.

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| addCompetitor(params) | ventureId, competitorData | CompetitorRecord | Register a competitor |
| updateIntelligence(params) | recordId, updates | CompetitorRecord | Update competitor data |
| getCompetitiveLandscape(ventureId) | ventureId | LandscapeAnalysis | Full competitive view |
| comparePositioning(ventureId) | ventureId | PositioningMatrix | Relative positioning |

---

## Stage Template Registry

**Module:** `lib/eva/stage-templates/index.js`

Dynamic template loader for lifecycle stage configurations.

### getTemplate(stageNumber)

Loads the template for a specific lifecycle stage.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| stageNumber | integer | Yes | Stage number (1-25) |

**Returns:** `Promise<StageTemplate>`

```
StageTemplate {
  stageNumber: integer,
  stageName: string,
  prompt: string,
  outputSchema: Object,
  estimatedTokens: integer,
  requiredContext: string[],
  artifacts: string[]
}
```

**Error Conditions:**
- Throws `TEMPLATE_NOT_FOUND` if no template exists for the stage number
- Throws `INVALID_TEMPLATE` if template fails schema validation

**Performance Note:** Templates are loaded via dynamic `import()` and cached after first load.

### getAllTemplates()

Returns all registered stage templates.

**Returns:** `Promise<StageTemplate[]>`

Useful for validation and introspection. Returns templates sorted by stage number.
