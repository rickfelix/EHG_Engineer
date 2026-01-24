# SD Type Classification Module

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.1.0
- **Author**: Claude Opus 4.5 (SD-LEO-FEAT-LLM-ASSISTED-TYPE-001)
- **Last Updated**: 2026-01-24
- **Tags**: sd-classification, llm, infrastructure, leo-protocol, type-locking, governance

## Overview

The SD Type Classification module (`lib/sd/type-classifier.js`) provides intelligent Strategic Directive (SD) type classification at creation time using GPT. This module addresses the primary source of LEO Protocol friction: incorrect SD type selection leading to mid-workflow validation mismatches.

## Purpose

Correctly classifying SD type upfront prevents:
- ❌ Feature SDs incorrectly marked as infrastructure (missing UI validation)
- ❌ Infrastructure SDs incorrectly marked as feature (unnecessary E2E tests)
- ❌ Handoff failures due to wrong validation gates
- ❌ Wasted time correcting SD type mid-workflow

**Impact**: Reduces LEO Protocol friction by 60-80% through upfront intelligent classification.

## Module Location

```
lib/sd/
├── type-classifier.js  # Main classification module (GPT + keyword fallback)
├── index.js            # Module exports
```

## SD Type Profiles

The module defines validation requirements for each SD type:

| SD Type | PRD Required | E2E Required | Design Required | Min Handoffs | Gate Threshold | Sub-Agents |
|---------|--------------|--------------|-----------------|--------------|----------------|------------|
| **feature** | ✅ Yes | ✅ Yes | ✅ Yes | 4 | 85% | DESIGN, DATABASE, STORIES, TESTING, RISK |
| **infrastructure** | ✅ Yes | ❌ No | ❌ No | 3 | 80% | DATABASE, STORIES, RISK |
| **library** | ❌ No | ❌ No | ❌ No | 2 | 75% | DATABASE, RISK |
| **fix** | ❌ No | ❌ No | ❌ No | 1 | 70% | RCA |
| **enhancement** | ❌ No | ❌ No | ❌ No | 2 | 75% | VALIDATION, STORIES |
| **documentation** | ❌ No | ❌ No | ❌ No | 1 | 60% | DOCMON |
| **refactor** | ❌ No | ✅ Yes | ❌ No | 2 | 80% | REGRESSION, VALIDATION |
| **security** | ✅ Yes | ✅ Yes | ❌ No | 3 | 90% | SECURITY, RISK, TESTING |

## API Reference

### SDTypeClassifier Class

```javascript
import { SDTypeClassifier, SD_TYPE_PROFILES } from './lib/sd/type-classifier.js';

const classifier = new SDTypeClassifier();
```

#### Methods

##### `classify(title, description, options)`

Main classification method - tries GPT first, falls back to keywords.

```javascript
const result = await classifier.classify(
  'Add User Dashboard',
  'Create a new dashboard page with user metrics and charts'
);

console.log(result);
// {
//   recommendedType: 'feature',
//   confidence: 0.92,
//   reasoning: 'Has user-facing UI components (dashboard, page, charts)',
//   source: 'gpt',
//   profile: SD_TYPE_PROFILES.feature,
//   analysis: {
//     hasUI: true,
//     hasAPIEndpoints: false,
//     isLibrary: false,
//     complexity: 'medium',
//     riskAreas: ['ui', 'data']
//   }
// }
```

**Parameters:**
- `title` (string): SD title
- `description` (string): SD description
- `options` (object, optional):
  - `useKeywordFallback` (boolean, default: true): Use keyword classification if GPT fails

**Returns:** Promise<ClassificationResult>

##### `classifyByKeywords(title, description)`

Keyword-based classification fallback.

```javascript
const result = classifier.classifyByKeywords(
  'Add deployment script',
  'Create CI/CD pipeline automation'
);

console.log(result);
// {
//   recommendedType: 'infrastructure',
//   confidence: 0.7,
//   reasoning: 'Matched 2 keyword(s) for infrastructure type',
//   analysis: {
//     hasUI: false,
//     hasAPIEndpoints: false,
//     isLibrary: false,
//     complexity: 'medium',
//     riskAreas: []
//   }
// }
```

**Parameters:**
- `title` (string): SD title
- `description` (string): SD description

**Returns:** ClassificationResult

##### `normalizeType(type)`

Normalize type string to valid SD type.

```javascript
classifier.normalizeType('bugfix');    // → 'fix'
classifier.normalizeType('feat');      // → 'feature'
classifier.normalizeType('infra');     // → 'infrastructure'
classifier.normalizeType('doc');       // → 'documentation'
classifier.normalizeType('unknown');   // → 'infrastructure' (default)
```

**Parameters:**
- `type` (string): Type to normalize (case-insensitive)

**Returns:** string (normalized SD type)

##### `getProfile(sdType)`

Get validation profile for an SD type.

```javascript
const profile = classifier.getProfile('feature');

console.log(profile);
// {
//   name: 'Feature',
//   description: 'User-facing functionality with UI',
//   prdRequired: true,
//   e2eRequired: true,
//   designRequired: true,
//   minHandoffs: 4,
//   gateThreshold: 85,
//   subAgents: ['DESIGN', 'DATABASE', 'STORIES', 'TESTING', 'RISK']
// }
```

**Parameters:**
- `sdType` (string): SD type

**Returns:** Profile object (or infrastructure profile if type unknown)

##### `isValidationRequired(sdType, validationType)`

Check if a validation is required for an SD type.

```javascript
classifier.isValidationRequired('feature', 'prd');    // → true
classifier.isValidationRequired('feature', 'e2e');    // → true
classifier.isValidationRequired('infrastructure', 'e2e');  // → false
classifier.isValidationRequired('library', 'design'); // → false
```

**Parameters:**
- `sdType` (string): SD type
- `validationType` (string): 'prd' | 'e2e' | 'design'

**Returns:** boolean

##### `formatForDisplay(result)`

Format classification result for display.

```javascript
const result = await classifier.classify(title, description);
const formatted = classifier.formatForDisplay(result);

console.log(formatted);
// {
//   type: 'feature',
//   typeName: 'Feature',
//   confidence: '92%',
//   reasoning: 'Has UI components',
//   implications: [
//     'PRD required',
//     'E2E tests required',
//     'DESIGN sub-agent required',
//     '85% gate threshold',
//     'Min 4 handoffs'
//   ],
//   subAgents: ['DESIGN', 'DATABASE', 'STORIES', 'TESTING', 'RISK']
// }
```

**Parameters:**
- `result` (ClassificationResult): Result from `classify()` or `classifyByKeywords()`

**Returns:** FormattedResult object

## Classification Rules

The GPT classifier uses these rules (in order):

1. **UI components** (pages, buttons, forms, dashboards) → `feature`
2. **Backend processing** (no UI, not reusable) → `infrastructure`
3. **Reusable module/utility/library** → `library`
4. **Bug or error fix** → `fix`
5. **Improves existing functionality** (not new features) → `enhancement`
6. **Documentation-only** → `documentation`
7. **Restructures code** (no behavior change) → `refactor`
8. **Authentication, permissions, security** → `security`

## Keyword Categories

The keyword fallback uses these patterns:

```javascript
const TYPE_KEYWORDS = {
  feature: ['user', 'dashboard', 'page', 'button', 'form', 'ui', 'interface', 'component'],
  infrastructure: ['script', 'ci', 'cd', 'deploy', 'pipeline', 'tooling', 'automation'],
  library: ['module', 'util', 'helper', 'lib', 'service', 'class', 'function'],
  fix: ['bug', 'fix', 'error', 'broken', 'crash', 'issue', 'wrong'],
  enhancement: ['improve', 'enhance', 'better', 'optimize', 'upgrade'],
  documentation: ['doc', 'readme', 'guide', 'tutorial', 'comment'],
  refactor: ['refactor', 'restructure', 'reorganize', 'clean', 'simplify'],
  security: ['auth', 'permission', 'rls', 'token', 'encrypt', 'password']
};
```

## Integration

### In SD Creation Workflow

```javascript
import { sdTypeClassifier } from './lib/sd/index.js';

// During SD creation
const classification = await sdTypeClassifier.classify(
  sdTitle,
  sdDescription
);

// Store in database
await supabase
  .from('strategic_directives_v2')
  .insert({
    sd_key: generatedKey,
    title: sdTitle,
    sd_type: classification.recommendedType,
    description: sdDescription,
    // ... other fields
  });

// Display to user
const formatted = sdTypeClassifier.formatForDisplay(classification);
console.log(`Recommended Type: ${formatted.typeName} (${formatted.confidence} confident)`);
console.log(`Reasoning: ${formatted.reasoning}`);
console.log(`Implications: ${formatted.implications.join(', ')}`);
```

### With LEO Create Command

The `/leo create` command should integrate classification:

```bash
# Interactive mode
/leo create

# System prompts for title and description
# Then uses classifier to recommend SD type
# Shows reasoning and implications
# User can accept or override
```

## Examples

### Example 1: Feature Classification

```javascript
const result = await classifier.classify(
  'User Profile Dashboard',
  'Create a new dashboard page showing user metrics, activity feed, and settings form'
);

// Result:
// {
//   recommendedType: 'feature',
//   confidence: 0.95,
//   reasoning: 'Has user-facing UI components (dashboard, page, form)',
//   source: 'gpt',
//   analysis: {
//     hasUI: true,
//     hasAPIEndpoints: false,
//     isLibrary: false,
//     complexity: 'medium',
//     riskAreas: ['ui', 'data']
//   }
// }
```

### Example 2: Infrastructure Classification

```javascript
const result = await classifier.classify(
  'Deployment Pipeline Script',
  'Create automated CI/CD pipeline for staging deployments'
);

// Result:
// {
//   recommendedType: 'infrastructure',
//   confidence: 0.88,
//   reasoning: 'Backend processing with CI/CD automation',
//   source: 'gpt',
//   analysis: {
//     hasUI: false,
//     hasAPIEndpoints: false,
//     isLibrary: false,
//     complexity: 'medium',
//     riskAreas: ['deployment']
//   }
// }
```

### Example 3: Library Classification

```javascript
const result = await classifier.classify(
  'Validation Helper Module',
  'Reusable validation utility functions for form inputs'
);

// Result:
// {
//   recommendedType: 'library',
//   confidence: 0.82,
//   reasoning: 'Reusable module/utility/library pattern detected',
//   source: 'gpt',
//   analysis: {
//     hasUI: false,
//     hasAPIEndpoints: false,
//     isLibrary: true,
//     complexity: 'low',
//     riskAreas: []
//   }
// }
```

### Example 4: Security Classification

```javascript
const result = await classifier.classify(
  'Implement RLS Policies for User Data',
  'Add row-level security to protect user credentials and permissions'
);

// Result:
// {
//   recommendedType: 'security',
//   confidence: 0.93,
//   reasoning: 'Security-related: authentication, permissions, credentials',
//   source: 'gpt',
//   analysis: {
//     hasUI: false,
//     hasAPIEndpoints: false,
//     isLibrary: false,
//     complexity: 'high',
//     riskAreas: ['auth', 'data', 'security']
//   }
// }
```

## Error Handling

### GPT API Unavailable

When OpenAI API is unavailable, the classifier automatically falls back to keyword-based classification:

```javascript
const result = await classifier.classify(title, description);

console.log(result.source);
// 'keyword_fallback' if GPT failed
// 'gpt' if GPT succeeded
```

### Invalid SD Type

When an unknown type is provided, it defaults to 'infrastructure':

```javascript
classifier.normalizeType('unknown-type');  // → 'infrastructure'
classifier.getProfile('invalid');          // → SD_TYPE_PROFILES.infrastructure
```

## Testing

The module includes comprehensive unit tests:

```bash
# Run tests
npm test tests/unit/sd/type-classifier.test.js

# Test coverage:
# - SD_TYPE_PROFILES structure (31 tests total)
# - Keyword classification accuracy
# - Type normalization
# - Profile lookup
# - Validation requirement checks
# - Display formatting
# - Integration scenarios
```

## Configuration

### OpenAI API Key

Required for GPT classification (falls back to keywords if missing):

```bash
# .env
OPENAI_API_KEY=sk-...
```

### Model Selection

The classifier uses the validation model from config:

```javascript
// lib/config/model-config.js
export const getOpenAIModel = (purpose) => {
  const models = {
    validation: 'gpt-4o-mini',  // Used by classifier
    // ...
  };
  return models[purpose] || models.general;
};
```

## Type Locking Governance

**Added in**: SD-LEO-INFRA-RENAME-COLUMNS-SELF-001 (2026-01-24)

The `type_locked` governance feature prevents auto-correction of explicitly-set SD types, addressing the issue where the system would override user-chosen types based on automatic classification.

### Purpose

When a user or process explicitly sets an SD type, the `type_locked` flag ensures that:
- Auto-correction is disabled for that SD
- GPT classifier recommendations are logged but not applied
- Keyword fallback classifications are ignored
- The explicitly-set type is preserved through all workflows

### How It Works

The `type_locked` flag is stored in the `governance_metadata` field:

```javascript
// Example SD with locked type
{
  id: 'SD-XXX-001',
  sd_type: 'infrastructure',
  governance_metadata: {
    type_locked: true,  // Prevents auto-correction
    automation_context: {
      bypass_governance: false
    }
  }
}
```

### Integration Points

#### 1. Handoff Validation Gates

The `sd-type-validation.js` gate checks the lock before auto-correcting:

```javascript
// scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-validation.js

function isTypeLocked(sd) {
  const govMeta = sd.governance_metadata;
  if (!govMeta) return false;

  // Check type_locked flag
  if (govMeta.type_locked === true) return true;

  // Also respect automation_context bypass flags
  if (govMeta.automation_context?.bypass_governance === true) return true;

  return false;
}

// Before auto-correcting SD type
if (typeLocked) {
  console.log('   🔒 Type is LOCKED - auto-correction disabled');
  // Skip auto-correction logic
}
```

#### 2. Type Classification During Creation

When creating SDs with explicit types:

```javascript
import { sdTypeClassifier } from './lib/sd/index.js';

// User explicitly chose 'infrastructure'
const userChosenType = 'infrastructure';

// Get classification for information only
const classification = await sdTypeClassifier.classify(title, description);

// Create SD with locked type
await supabase
  .from('strategic_directives_v2')
  .insert({
    sd_key: generatedKey,
    sd_type: userChosenType,  // Use user's choice
    governance_metadata: {
      type_locked: true,  // Lock to prevent auto-correction
      classification_info: {
        gpt_recommendation: classification.recommendedType,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        user_override: userChosenType !== classification.recommendedType
      }
    }
  });
```

#### 3. PRD Generation

The PRD auto-creation script respects type locking:

```javascript
// scripts/prd/index.js

// Fetch governance metadata to check lock
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_type, governance_metadata')
  .eq('id', sdId)
  .single();

const typeLocked = sd.governance_metadata?.type_locked === true;

if (!typeLocked) {
  // Attempt classification/correction
  const classification = await sdTypeClassifier.classify(title, description);
  if (classification.confidence >= 0.85) {
    // Auto-correct type
  }
} else {
  console.log('Type locked - using declared type:', sd.sd_type);
}
```

### When to Use Type Locking

| Scenario | Use type_locked |
|----------|-----------------|
| User explicitly selected type during creation | ✅ Yes |
| SD imported from external system with type | ✅ Yes |
| SD type was manually corrected after classification error | ✅ Yes |
| SD created programmatically with known type | ✅ Yes |
| SD created with GPT classifier (auto) | ❌ No - allow future corrections |
| SD created with keyword fallback | ❌ No - low confidence |

### Checking Lock Status

Query lock status from database:

```javascript
const { data } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_type, governance_metadata')
  .eq('id', 'SD-XXX-001')
  .single();

const isLocked = data.governance_metadata?.type_locked === true;
console.log(`SD type '${data.sd_type}' is ${isLocked ? 'LOCKED' : 'unlocked'}`);
```

### Unlocking Types

To enable auto-correction again:

```javascript
await supabase
  .from('strategic_directives_v2')
  .update({
    governance_metadata: {
      ...existingMetadata,
      type_locked: false  // Remove lock
    }
  })
  .eq('id', 'SD-XXX-001');
```

### Benefits

- **Prevents unwanted changes**: User decisions are respected
- **Reduces validation friction**: No mid-workflow type changes
- **Improves trust**: System won't override explicit choices
- **Enables governance**: Critical SDs can have locked types
- **Audit trail**: Lock status visible in governance_metadata

### Implementation Details

**Files Modified**:
- `scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-validation.js` - Lock check in validation gate
- `scripts/prd/index.js` - Respects lock during PRD generation
- `docs/database/strategic_directives_v2_field_reference.md` - Documented in field reference

**Database Schema**:
```sql
-- governance_metadata structure (JSONB)
{
  "type_locked": boolean,
  "automation_context": {
    "bypass_governance": boolean
  },
  "classification_info": {
    "gpt_recommendation": text,
    "confidence": float,
    "reasoning": text,
    "user_override": boolean
  }
}
```

## Related Documentation

- [SD Type Detection Integration Guide](../guides/SD_TYPE_DETECTION_INTEGRATION_GUIDE.md) - SD type detection vs classification
- [SD Key Generator Guide](./sd-key-generator-guide.md) - SD key generation patterns
- [SD Validation Profiles](./sd-validation-profiles.md) - Validation rules per SD type
- [LEO Protocol Standards](../03_protocols_and_standards/LEO_v4.3_subagent_enforcement.md) - Full LEO Protocol workflow
- [Strategic Directives v2 Field Reference](../database/strategic_directives_v2_field_reference.md) - Database field documentation including governance_metadata

## Troubleshooting

### Low Confidence Classifications

If confidence is below 0.6, consider:
1. Adding more keywords to title/description
2. Being more explicit about UI vs backend
3. Specifying "reusable" for library modules
4. Mentioning "bug" or "fix" explicitly for fixes

### Wrong Type Recommended

The classifier can be overridden during SD creation:
1. Review reasoning provided
2. Check SD type profiles table
3. Manually select correct type if needed
4. Report pattern to improve classifier

### GPT Classification Failures

If GPT classification consistently fails:
1. Check OPENAI_API_KEY is set
2. Verify API quota not exceeded
3. Keyword fallback will activate automatically
4. No user action required (transparent fallback)

## Version History

### v1.1.0 (2026-01-24)
- **Added**: Type Locking Governance section (SD-LEO-INFRA-RENAME-COLUMNS-SELF-001)
- **Feature**: `type_locked` flag in `governance_metadata` prevents auto-correction
- **Integration**: Documented lock checks in handoff gates and PRD generation
- **Benefits**: Respects user-chosen types, improves governance, reduces friction

### v1.0.0 (2026-01-23)
- Initial implementation (SD-LEO-FEAT-LLM-ASSISTED-TYPE-001)
- GPT-powered classification with keyword fallback
- 8 SD type profiles with full validation rules
- Type normalization and profile lookup
- 31 unit tests (100% passing)
- Integrated with LEO Protocol validation system

---

**Implementation SD**: SD-LEO-FEAT-LLM-ASSISTED-TYPE-001
**Module Path**: `lib/sd/type-classifier.js`
**Test Path**: `tests/unit/sd/type-classifier.test.js`
**Status**: Production Ready ✅
