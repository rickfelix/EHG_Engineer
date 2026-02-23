# DESIGN Analysis: SD-MAN-FEAT-CORRECTIVE-VISION-GAP-009

**Title**: Corrective Vision Gap - Add outputSchema to stage templates and enhance contract-validator

**Type**: Infrastructure Feature (Backend Pipeline)

**Target Repository**: EHG_Engineer (main)

**Analysis Date**: 2026-02-22

---

## 1. COMPONENT ARCHITECTURE

### Current State

**Template Structure** (`lib/eva/stage-templates/stage-NN.js`):
```javascript
const TEMPLATE = {
  id: 'stage-01',
  slug: 'draft-idea',
  title: 'Idea Capture',
  version: '2.0.0',
  schema: {
    // Field definitions with type, constraints, required, derived flags
    description: { type: 'string', minLength: 50, required: true },
    problemStatement: { type: 'string', minLength: 20, required: true },
    sourceProvenance: { type: 'object', derived: true },  // ← excluded from output
  },
  defaultData: { /* ... */ },
  validate(data) { /* ... */ },
  computeDerived(data) { /* ... */ },
};
```

**Existing outputSchema Extraction** (`output-schema-extractor.js`):
- `extractOutputSchema(schema)` - Converts template schema to simple field contract
- Filters out: derived fields (`derived: true`) and upstream references (`stageNData`)
- Returns: `[{field, type, required}, ...]`
- `ensureOutputSchema(template)` - Mutates template to add outputSchema if missing

**Problem**:
- `outputSchema` property is NOT explicitly defined in stage templates 1-8
- Contract validator only checks ARTIFACT EXISTENCE, not SHAPE (field structure, types)
- No field-level validation when downstream stage consumes upstream data

### Proposed Changes

**Step 1: Add outputSchema Declaration to Stage Templates**

Each stage template (1-8) gains explicit `outputSchema` property after `schema` definition:

```javascript
const TEMPLATE = {
  id: 'stage-01',
  // ... existing fields ...
  schema: { /* ... */ },

  // NEW: Explicit output contract
  outputSchema: [
    { field: 'description', type: 'string', required: true },
    { field: 'problemStatement', type: 'string', required: true },
    { field: 'valueProp', type: 'string', required: true },
    { field: 'targetMarket', type: 'string', required: true },
    { field: 'archetype', type: 'string', required: true },
    { field: 'keyAssumptions', type: 'array', required: false },
    { field: 'moatStrategy', type: 'string', required: false },
    { field: 'successCriteria', type: 'array', required: false },
  ],

  defaultData: { /* ... */ },
};
```

**Implementation approach**:
- Use existing `extractOutputSchema()` function as generator
- Copy output into `outputSchema` array literal
- Avoid runtime mutation; make outputSchema a static, declarative property

**Benefit**:
- Schema contracts become explicit in template code
- Easier to audit downstream dependencies
- Self-documents what each stage PROMISES to downstream consumers

---

## 2. DATA FLOW: Schema Validation Integration

### Current Contract Validation Flow

```
venture-state-machine.js (handoff)
    ↓
validateContracts({ targetStage, ventureId })
    ↓
lib/eva/contract-validator.js
    ├─ Query venture_artifacts table (is_current=true)
    ├─ Filter by required upstream stages
    ├─ Check artifact EXISTS for each required stage
    └─ Return { passed: bool, satisfiedContracts[], missingContracts[] }
```

**Limitation**: Only validates EXISTENCE. Does not validate CONTENT SHAPE.

### Enhanced Flow: Add Shape Validation

```
venture-state-machine.js (handoff)
    ↓
validateContracts({ targetStage, ventureId })
    ↓
lib/eva/contract-validator.js
    ├─ [PHASE 1: EXISTENCE] Query artifacts, check upstream stages exist
    │   └─ satisfiedContracts[], missingContracts[]
    │
    ├─ [PHASE 2: SHAPE] For each satisfied artifact, validate field-level contract
    │   ├─ Load artifact data payload (JSON column: data)
    │   ├─ Fetch upstream stage template (to get outputSchema)
    │   ├─ For each declared output field:
    │   │   ├─ Check field EXISTS in artifact data
    │   │   ├─ Check field TYPE matches schema
    │   │   ├─ Check REQUIRED fields are non-null
    │   │   └─ Collect field-level errors
    │   └─ Contract shape validation results
    │
    └─ Return { passed: bool, satisfiedContracts[], missingContracts[], shapeErrors[] }
```

### Schema Validation Details

**Field Type Checking**:
```javascript
// Pseudo-code for type validation
const fieldSpec = outputSchema.find(f => f.field === 'description');
const actualValue = artifactData.description;

switch (fieldSpec.type) {
  case 'string':
    if (typeof actualValue !== 'string') {
      errors.push(`${stage}.description: expected string, got ${typeof actualValue}`);
    }
    break;
  case 'array':
    if (!Array.isArray(actualValue)) {
      errors.push(`${stage}.keyAssumptions: expected array, got ${typeof actualValue}`);
    }
    break;
  case 'object':
    if (typeof actualValue !== 'object' || Array.isArray(actualValue)) {
      errors.push(`${stage}.evidence: expected object, got ${typeof actualValue}`);
    }
    break;
  // ... etc
}
```

**Presence Checks**:
```javascript
if (fieldSpec.required && (actualValue === undefined || actualValue === null)) {
  errors.push(`${stage}.${fieldSpec.field}: required field is missing or null`);
}
```

### Backward Compatibility

**Stages without explicit outputSchema**:
- `ensureOutputSchema(template)` auto-generates from schema (non-breaking)
- Template loaders call this in initialization
- Existing stages continue to work without modification

**Opt-in Shape Validation**:
- New parameter: `validateContracts({ ..., validateShape: true })`
- Default: `validateShape: false` (existence-only, current behavior)
- Allows gradual rollout; tests can enable shape validation

---

## 3. ERROR REPORTING DESIGN

### Error Structure

Current (existence-only):
```javascript
{
  passed: false,
  targetStage: 3,
  ventureId: '...',
  missingContracts: [
    { stage: 1, reason: 'No current artifact found for stage 1' }
  ],
  satisfiedContracts: [
    { stage: 2, artifactType: 'venture_output', createdAt: '2026-02-22T...' }
  ],
  latencyMs: 45
}
```

Enhanced (with shape validation):
```javascript
{
  passed: false,
  targetStage: 3,
  ventureId: '...',
  requiredStages: [1, 2],

  // PHASE 1: Existence checks
  satisfiedContracts: [
    { stage: 2, artifactType: 'venture_output', createdAt: '...' }
  ],
  missingContracts: [
    { stage: 1, reason: 'No current artifact found for stage 1' }
  ],

  // PHASE 2: Shape validation (only for satisfied contracts, if validateShape=true)
  shapeErrors: [
    {
      stage: 2,
      field: 'metrics',
      errorType: 'missing_required_field',
      expectedType: 'object',
      actualValue: undefined,
      message: 'stage-02.metrics: required field is missing'
    },
    {
      stage: 2,
      field: 'analysis',
      errorType: 'type_mismatch',
      expectedType: 'object',
      actualValue: 'string value',
      message: 'stage-02.analysis: expected object, got string'
    }
  ],

  latencyMs: 72
}
```

### Error Message Patterns

**For Field Mismatch**:
```
stage-02.metrics: expected object, got string
stage-02.analysis.strategic: expected string (minLength: 20), got string of length 5
stage-02.metrics.marketFit: expected integer in range [0, 100], got 150
```

**For Missing Required Field**:
```
stage-02.metrics: required field is missing or null
stage-03.evidence: required field is missing
```

**For Array/Object Subfield Issues**:
```
stage-08.customerSegments.items[0].priority: expected integer, got string
stage-08.customerSegments: expected minimum 2 items, got 0
```

### Logging & Observability

Event emitted to `eva_orchestration_events` (existing pattern):
```javascript
{
  event_type: 'contract_validation_completed',
  event_source: 'contract_validator',
  venture_id: '...',
  event_data: {
    target_stage: 3,
    passed: false,
    satisfied_count: 1,
    missing_count: 1,
    shape_error_count: 2,  // NEW
    latency_ms: 72,
  },
  chairman_flagged: true,  // Flag if shape errors detected
}
```

---

## 4. TESTING STRATEGY

### Unit Tests: `contract-validator.test.js`

**Test Suite 1: Existence Validation (Current Behavior)**
- ✓ Passes when all required stages have artifacts
- ✓ Fails when upstream stage missing
- ✓ Correct event emission to eva_orchestration_events
- ✓ Respects explicit CROSS_STAGE_DEPS overrides

**Test Suite 2: Shape Validation (New)**

*Test 2a: Happy Path*
- ✓ Validates shape correctly when all fields present and types match
- ✓ Ignores undefined optional fields
- ✓ Passes when validateShape=true

*Test 2b: Type Mismatches*
- ✓ Detects string when object expected
- ✓ Detects number when string expected
- ✓ Detects non-array when array expected
- ✓ Collects ALL type errors (doesn't fail on first)

*Test 2c: Missing Required Fields*
- ✓ Detects missing required top-level field
- ✓ Detects null required field
- ✓ Allows undefined optional fields

*Test 2c: Nested Field Validation*
- ✓ Validates object subfields (e.g., `analysis.strategic`)
- ✓ Validates array item properties (e.g., `suggestions[].type`)
- ✓ Reports array length violations

*Test 2d: Backward Compatibility*
- ✓ Shape validation disabled by default (validateShape=false)
- ✓ Stages without outputSchema still pass existence checks
- ✓ No breaking changes to existing ventures

**Test Suite 3: Template Output Schema**

*Test 3a: Stage Templates 1-8*
- ✓ Each template has explicit outputSchema array
- ✓ outputSchema matches extractOutputSchema() output (when same template)
- ✓ No derived fields in outputSchema
- ✓ No upstream data references (stageNData) in outputSchema

*Test 3b: Integration*
- ✓ ensureOutputSchema() adds schema to templates that lack it
- ✓ Templates loaded in venture-state-machine have outputSchema

### Integration Tests: `eva-pipeline.integration.js`

**Scenario 1: Stage 1→2 Contract**
- Create stage-01 artifact with valid data
- Validate stage-02 contracts → should pass existence + shape

**Scenario 2: Stage 2→3 Contract (Kill Gate)**
- Create stage-02 artifact with incomplete metrics (missing one)
- Validate stage-03 contracts with validateShape=true → should report field error

**Scenario 3: Cross-Stage Dependencies**
- Create only stages 1, 3, skip 2
- Validate stage-03 with targetStage=3 → should detect missing stage 2

### Manual Test Cases

**Case A: Happy Path**
1. Create venture
2. Complete stages 1-8 with valid data
3. Call `validateContracts({ targetStage: 8, validateShape: true })`
4. Expected: `passed: true`, no shapeErrors

**Case B: Missing Field**
1. Create stage-02 artifact
2. Omit `metrics.marketFit` field
3. Call `validateContracts({ targetStage: 3, validateShape: true })`
4. Expected: shapeError for `stage-02.metrics` (type mismatch or missing)

**Case C: Type Mismatch**
1. Create stage-02 artifact with `metrics: "string"`
2. Call `validateContracts({ targetStage: 3, validateShape: true })`
3. Expected: shapeError for `stage-02.metrics: expected object, got string`

---

## 5. IMPLEMENTATION SEQUENCE

### Phase 1: Add outputSchema to Templates (Stages 1-8)
- Files: `stage-01.js` through `stage-08.js`
- Add static `outputSchema` property after `schema`
- Use extracted schema from existing `extractOutputSchema()` as reference
- No logic changes, purely declarative

### Phase 2: Enhance contract-validator.js
- Import stage templates to access outputSchema
- Add `validateShape` parameter (default: false)
- Implement Phase 2 validation logic (type checking, presence checks)
- Add shapeErrors to result object
- Enhance event emission to include shape error count
- Keep existing code path (Phase 1) unchanged

### Phase 3: Add Unit Tests
- `__tests__/contract-validator.test.js`
- Test existence validation (unchanged behavior)
- Test shape validation (new behavior)
- Test template outputSchema properties
- Test backward compatibility

### Phase 4: Integration Tests
- `__tests__/eva-pipeline.integration.js` (add cases)
- Test end-to-end validation with various artifact states

---

## 6. COMPONENT SIZING & QUALITY GATES

**contract-validator.js**:
- Current: ~140 lines
- Enhanced: ~280 lines (shape validation phase + helper functions)
- **Sweet spot**: 300-600 LOC ✓

**outputSchema additions per stage template**:
- Stage-01: +10 lines
- Stage-02: +15 lines (nested properties)
- ... (all within existing template structure)
- **Per-template impact**: <50 lines ✓

**New test files**:
- contract-validator.test.js: ~300-400 lines (6-8 test suites)
- eva-pipeline.integration.js additions: ~200-300 lines

**Total Scope**:
- LOC to write: ~150-200 (contract-validator enhancement)
- LOC to add (outputSchema): ~80 (all 8 templates)
- LOC to test: ~500-700
- **Total: ~700-1000 LOC** — Full SD scope appropriate

---

## 7. DESIGN CHECKLIST

### Architecture
- [x] Maintains backward compatibility (shape validation opt-in)
- [x] Reuses existing extractOutputSchema() function
- [x] Integrates cleanly with venture-state-machine call site
- [x] Single responsibility: contract-validator validates contracts
- [x] Separate concerns: shape validation logic isolated from existence checks

### Data Flow
- [x] Clear two-phase validation (existence → shape)
- [x] Error collection non-blocking (gathers all errors before returning)
- [x] Events emitted for observability
- [x] Result structure extensible (shapeErrors array)

### Error Reporting
- [x] Field-level error details (stage, field, type, actual value)
- [x] Clear, actionable messages
- [x] Includes error type (missing_required_field, type_mismatch, etc.)
- [x] Human-readable format for logging/debugging

### Testing
- [x] Unit test coverage for all validation paths
- [x] Integration tests for end-to-end flow
- [x] Backward compatibility tests
- [x] Template outputSchema validation

### Code Quality
- [x] No external dependencies added
- [x] Consistent with existing error handling patterns
- [x] JSDoc comments for new functions
- [x] Follows project code style

---

## 8. KNOWN CONSTRAINTS & EDGE CASES

**Edge Case 1: Nested Object Validation**
- Current templates use nested schema definitions (e.g., `properties`)
- outputSchema should flatten to top-level field list initially
- Deep field validation (e.g., `analysis.strategic`) can be added in future iteration

**Edge Case 2: Array Item Validation**
- Stage-08 (BMC) has complex array structure: `customerSegments.items[].{text, priority, evidence}`
- outputSchema represents top-level only
- Future: extend outputSchema to support nested item schemas

**Edge Case 3: Stages 9-25 Not Modified**
- This SD only modifies stages 1-8
- Stages 9-25 inherit behavior from ensureOutputSchema() auto-generation
- Future SDs can add explicit outputSchema to remaining stages

**Edge Case 4: Legacy Artifact Data**
- Ventures with old artifacts (before outputSchema era) may have incomplete data
- Shape validation should be backward-compatible: missing stages don't block validation
- Only validated if artifact exists AND validateShape=true

---

## 9. RISK MITIGATION

**Risk**: Shape validation too strict, breaks existing workflows
- **Mitigation**: Opt-in feature (validateShape=false default), gradual rollout via feature flag

**Risk**: Performance degradation from additional validation
- **Mitigation**: Validation only runs for satisfied contracts, latency already measured, goal <100ms added

**Risk**: False positives from type mismatches (e.g., 0 === null)
- **Mitigation**: Strict type checking, explicit null/undefined handling, comprehensive test coverage

---

## 10. SUMMARY

This SD adds explicit output contracts to EVA stage templates and enhances contract validation to check not just artifact EXISTENCE but also data SHAPE (field types, presence, structure).

**Key design principles**:
- **Backward compatible**: Shape validation is opt-in
- **Non-breaking**: Existing ventures and stages unaffected
- **Clear errors**: Field-level, actionable error messages
- **Observable**: Event emission for monitoring
- **Testable**: Comprehensive unit + integration test strategy

**Component sizing**: ~700-1000 LOC total, appropriate for full SD.

**Success criteria**:
1. All stage templates 1-8 have explicit outputSchema
2. contract-validator validates shape when enabled
3. All tests pass (unit + integration)
4. No breaking changes to existing ventures
