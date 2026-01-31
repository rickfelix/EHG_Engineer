# SDKeyGenerator Module - Reference Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, api, testing, migration

**Module**: `scripts/modules/sd-key-generator.js`
**SD**: SD-LEO-SDKEY-001
**Purpose**: Centralized Strategic Directive key generation with source traceability
**Status**: Active (implemented 2026-01-20)

---

## Overview

The SDKeyGenerator module provides unified SD key generation across all SD creation paths, replacing 6+ different implementations with a single, consistent system.

### Key Format

```
SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
```

**Example**: `SD-UAT-FIX-NAV-ROUTE-001`

Where:
- **SOURCE**: Origin of the SD (UAT, LEARN, FEEDBACK, PATTERN, MANUAL, LEO)
- **TYPE**: SD type abbreviation (FIX, FEAT, INFRA, DOC, etc.)
- **SEMANTIC**: 1-3 meaningful words from title (e.g., NAV-ROUTE)
- **NUM**: Sequential 3-digit number with collision detection (001, 002, etc.)

### Hierarchy Support

The module supports 4-level hierarchies:

| Level | Format | Example | Description |
|-------|--------|---------|-------------|
| Root | `SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}` | `SD-UAT-FIX-NAV-001` | Parent SD |
| Child | `{PARENT}-{LETTER}` | `SD-UAT-FIX-NAV-001-A` | Direct child |
| Grandchild | `{CHILD}{NUMBER}` | `SD-UAT-FIX-NAV-001-A1` | Child of child |
| Great-grandchild | `{GRANDCHILD}.{NUMBER}` | `SD-UAT-FIX-NAV-001-A1.1` | 3rd level |

---

## Protocol File Validation (MANDATORY)

**CRITICAL**: Before generating any SD key, the SDKeyGenerator enforces that **both CLAUDE_CORE.md and CLAUDE_LEAD.md** have been fully read in the current session.

### Why This Matters

These protocol files contain essential information for SD creation:

| File | Contains |
|------|----------|
| **CLAUDE_CORE.md** | • Sub-agent trigger keywords and invocation patterns<br>• SD type definitions and validation requirements<br>• Protocol phase structure (LEAD → PLAN → EXEC)<br>• Required validation patterns |
| **CLAUDE_LEAD.md** | • Required SD fields (sd_key, title, description, rationale)<br>• Success criteria/metrics requirements<br>• SD type-specific validation requirements<br>• Strategic validation questions (9-question gate)<br>• Handoff chain requirements |

### Validation Functions

#### `validateCoreFileRead()`

Checks if CLAUDE_CORE.md has been fully read (no limit/offset parameters).

**Returns**: `{valid: boolean, error: string|null, remediation: string|null}`

**Example**:
```javascript
import { validateCoreFileRead } from './modules/sd-key-generator.js';

const result = validateCoreFileRead();
if (!result.valid) {
  console.error(result.remediation);
  // Outputs formatted error message with action required
}
```

#### `validateLeadFileRead()`

Checks if CLAUDE_LEAD.md has been fully read (no limit/offset parameters).

**Returns**: `{valid: boolean, error: string|null, remediation: string|null}`

**Example**:
```javascript
import { validateLeadFileRead } from './modules/sd-key-generator.js';

const result = validateLeadFileRead();
if (!result.valid) {
  console.error(result.remediation);
  // Outputs formatted error message with action required
}
```

#### `validateProtocolFilesRead()`

Checks both CLAUDE_CORE.md and CLAUDE_LEAD.md in sequence. Used internally by `generateSDKey()`.

**Returns**: `{valid: boolean, error: string|null, remediation: string|null}`

**Example**:
```javascript
import { validateProtocolFilesRead } from './modules/sd-key-generator.js';

const result = validateProtocolFilesRead();
if (!result.valid) {
  // First violation encountered (CORE or LEAD)
  console.error(result.error);
}
```

### Validation Errors

When validation fails, you'll see a formatted error message:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Protocol Core File Not Read                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_CORE.md must be read COMPLETELY before creating Strategic           │
│ Directives. This file contains critical information about:                 │
│                                                                             │
│   • Sub-agent invocation requirements and triggers                         │
│   • SD type definitions and validation requirements                        │
│   • Protocol phase structure (LEAD → PLAN → EXEC)                          │
│   • Required validation patterns                                           │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Read CLAUDE_CORE.md completely (no limit parameter)                   │
│   2. Then retry SD key generation                                          │
│                                                                             │
│ HINT: Use Read tool with file_path="CLAUDE_CORE.md" (no limit)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Partial Read Detection

The module detects **partial reads** (when files are read with `limit` or `offset` parameters):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Partial Read Detected                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_LEAD.md was read with limit/offset parameters:                      │
│   • Limit: 200        Offset: 0                                            │
│   • Read at: 2026-01-31T12:34:56.789Z                                      │
│                                                                             │
│ Critical requirements may be MISSING from later sections:                  │
│   • Lines 370-476: Strategic Directive Creation Process                    │
│   • Lines 552-674: Common SD Creation Errors and Solutions                 │
│   • Lines 677-823: SDKeyGenerator Errors section                           │
│   • Lines 825-1030: PRD Enrichment and Evaluation Checklist                │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Re-read CLAUDE_LEAD.md completely (WITHOUT limit parameter)           │
│   2. Then retry SD key generation                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bypassing Validation (Emergency Use Only)

For testing or emergency scenarios, validation can be bypassed:

**JavaScript API**:
```javascript
const sdKey = await generateSDKey({
  source: 'LEO',
  type: 'feature',
  title: 'Test SD',
  skipLeadValidation: true  // ⚠️ EMERGENCY USE ONLY
});
```

**CLI**:
```bash
# Skip validation (NOT RECOMMENDED)
node scripts/modules/sd-key-generator.js --skip-validation LEO feature "Test SD"
```

**WARNING**: Bypassing validation should only be used for:
- Automated testing
- Emergency hotfixes when protocol files are unavailable
- Internal tooling where validation is handled elsewhere

**Production SD creation should NEVER skip validation.**

### CLI Validation Commands

Check validation status from command line:

```bash
# Check both protocol files
node scripts/modules/sd-key-generator.js --check-protocol

# Check CLAUDE_CORE.md only
node scripts/modules/sd-key-generator.js --check-core

# Check CLAUDE_LEAD.md only
node scripts/modules/sd-key-generator.js --check-lead
```

**Output**:
```
✅ CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read - ready for SD creation
```

or

```
❌ Validation failed (displays remediation message)
```

### Session State Integration

The validation system uses the unified session state file:

**Location**: `.claude/unified-session-state.json`

**Tracked Data**:
```json
{
  "protocolFilesRead": ["CLAUDE_CORE.md", "CLAUDE_LEAD.md"],
  "protocolFileReadStatus": {
    "CLAUDE_CORE.md": {
      "lastReadWasPartial": false,
      "lastFullRead": {
        "readAt": "2026-01-31T12:00:00.000Z"
      }
    },
    "CLAUDE_LEAD.md": {
      "lastReadWasPartial": false,
      "lastFullRead": {
        "readAt": "2026-01-31T12:00:05.000Z"
      }
    }
  }
}
```

**How It Works**:
1. When Claude reads a protocol file, the Read tool updates this session state
2. SDKeyGenerator queries the session state before generating keys
3. If files haven't been read or were only partially read, generation is blocked

---

## API Reference

### Core Functions

#### `generateSDKey(options)`

Generates a new SD key with collision detection.

**Parameters**:
```javascript
{
  source: string,              // 'UAT', 'LEARN', 'FEEDBACK', 'PATTERN', 'MANUAL', 'LEO'
  type: string,                // 'fix', 'feature', 'refactor', 'infrastructure', etc.
  title: string,               // SD title for semantic extraction
  parentKey?: string,          // Parent SD key (for hierarchies)
  hierarchyDepth?: number,     // 0=root, 1=child, 2=grandchild, 3+=great-grandchild
  siblingIndex?: number,       // Index among siblings (for suffix)
  skipLeadValidation?: boolean // Skip protocol file validation (EMERGENCY USE ONLY)
}
```

**Returns**: `Promise<string>` - Generated SD key

**Example**:
```javascript
import { generateSDKey } from './modules/sd-key-generator.js';

const sdKey = await generateSDKey({
  source: 'UAT',
  type: 'bugfix',
  title: 'Navigation route not working'
});
// Returns: SD-UAT-FIX-NAVIGATION-ROUTE-001
```

#### `generateChildKey(parentKey, childIndex)`

Generates a child SD key.

**Parameters**:
- `parentKey` (string): Parent SD key
- `childIndex` (number): Zero-based index (0=A, 1=B, etc.)

**Returns**: `string` - Child SD key

**Example**:
```javascript
import { generateChildKey } from './modules/sd-key-generator.js';

const childKey = generateChildKey('SD-UAT-FIX-NAV-001', 0);
// Returns: SD-UAT-FIX-NAV-001-A
```

#### `generateGrandchildKey(parentKey, grandchildIndex)`

Generates a grandchild SD key.

**Parameters**:
- `parentKey` (string): Parent (child) SD key (e.g., "SD-FIX-NAV-001-A")
- `grandchildIndex` (number): Zero-based index

**Returns**: `string` - Grandchild SD key

**Example**:
```javascript
import { generateGrandchildKey } from './modules/sd-key-generator.js';

const grandchildKey = generateGrandchildKey('SD-UAT-FIX-NAV-001-A', 0);
// Returns: SD-UAT-FIX-NAV-001-A1
```

#### `parseSDKey(sdKey)`

Parses an SD key into its components.

**Parameters**:
- `sdKey` (string): SD key to parse

**Returns**: `Object | null` - Parsed components or null if invalid

**Example**:
```javascript
import { parseSDKey } from './modules/sd-key-generator.js';

const parsed = parseSDKey('SD-UAT-FIX-NAV-ROUTE-001');
// Returns:
// {
//   isRoot: true,
//   source: 'UAT',
//   type: 'FIX',
//   semantic: 'NAV-ROUTE',
//   number: 1,
//   hierarchyDepth: 0,
//   parentKey: null
// }
```

### Utility Functions

#### `extractSemanticWords(title, maxWords)`

Extracts meaningful words from a title for key generation.

**Parameters**:
- `title` (string): SD title
- `maxWords` (number, optional): Maximum words to extract (default: 3)

**Returns**: `string` - Semantic portion (e.g., "NAV-ROUTE-FIX")

**Example**:
```javascript
import { extractSemanticWords } from './modules/sd-key-generator.js';

const semantic = extractSemanticWords('Fix the navigation route error', 3);
// Returns: "FIX-NAVIGATION-ROUTE"
```

#### `keyExists(proposedKey)`

Checks if an SD key already exists in the database.

**Parameters**:
- `proposedKey` (string): Key to check

**Returns**: `Promise<boolean>` - True if key exists

**Example**:
```javascript
import { keyExists } from './modules/sd-key-generator.js';

const exists = await keyExists('SD-UAT-FIX-NAV-001');
// Returns: true or false
```

#### `getNextSequentialNumber(prefix)`

Finds the next available sequential number for a key namespace.

**Parameters**:
- `prefix` (string): Key prefix (e.g., "SD-UAT-FIX-NAV")

**Returns**: `Promise<number>` - Next available number

---

## Constants

### `SD_SOURCES`

Valid SD sources:

```javascript
{
  UAT: 'UAT',           // From UAT process
  LEARN: 'LEARN',       // From /learn command
  FEEDBACK: 'FDBK',     // From /inbox or sd-from-feedback
  PATTERN: 'PAT',       // From pattern-alert-sd-creator
  MANUAL: 'MAN',        // From create-sd.js or manual creation
  LEO: 'LEO'            // From /leo create
}
```

### `SD_TYPES`

Valid SD types (maps user-friendly names to abbreviations):

```javascript
{
  fix: 'FIX',
  bugfix: 'FIX',
  feature: 'FEAT',
  feat: 'FEAT',
  refactor: 'REFAC',
  infrastructure: 'INFRA',
  infra: 'INFRA',
  documentation: 'DOC',
  doc: 'DOC',
  enhancement: 'ENH',
  testing: 'TEST',
  orchestrator: 'ORCH'
}
```

---

## Integration Points

### Scripts Using SDKeyGenerator

All SD creation scripts have been refactored to use the centralized generator:

| Script | Source | Usage |
|--------|--------|-------|
| `leo-create-sd.js` | LEO | Direct import for /leo create command |
| `uat-to-strategic-directive-ai.js` | UAT | Replaced local generateUATSDKey() |
| `sd-from-feedback.js` | FEEDBACK | Replaced local generateSdKey() |
| `pattern-alert-sd-creator.js` | PATTERN | Replaced local generateSDKey() |
| `create-sd.js` | MANUAL | Replaced local generateSdKey() |
| `modules/learning/executor.js` | LEARN | Replaced local generateSDId() |

### Command Integration

The `/leo create` command uses SDKeyGenerator through `leo-create-sd.js`:

```bash
# Interactive mode
/leo create

# Flag-based creation
/leo create --from-uat <test-id>
/leo create --from-learn <pattern-id>
/leo create --from-feedback <feedback-id>
/leo create --from-plan [path]      # NEW: Create from Claude Code plan
/leo create --child <parent-key> [index]
```

See `.claude/commands/leo.md` for full command documentation.

#### Plan-Aware SD Creation (NEW)

Create SDs directly from Claude Code plan files:

```bash
# Auto-detect most recent plan
/leo create --from-plan

# Auto-detect without confirmation
/leo create --from-plan --yes

# Use specific plan file
/leo create --from-plan ~/.claude/plans/my-plan.md
```

**What It Does**:
- Parses plan file to extract title, goal, steps, and file modifications
- Infers SD type from plan content keywords
- Archives original plan to `docs/plans/archived/{sd-key}-plan.md`
- Populates SD fields: title, description, scope, success_criteria, key_changes, strategic_objectives, risks
- Stores full plan content in `metadata.plan_content` for reference

**Plan Parsing**:
- **Title**: Extracted from `# Plan: Title` or first `# Heading`
- **Summary**: From `## Goal` or `## Summary` section
- **Success Criteria**: From `- [ ]` checklist items (max 10)
- **Scope**: From file modification tables (`| path | ACTION |`)
- **Key Changes**: From implementation sections and file tables
- **Risks**: From `## Risks` or `## Concerns` sections
- **SD Type**: Inferred from keywords (security, bug, refactor, infrastructure, documentation)

**Modules Used**:
- `scripts/modules/plan-parser.js` - Parses plan file structure
- `scripts/modules/plan-archiver.js` - Archives plans and finds recent ones

---

## Database Integration

### Collision Detection

The module checks both `sd_key` and `id` columns to prevent collisions:

```javascript
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .or(`sd_key.eq.${proposedKey},id.eq.${proposedKey}`)
  .limit(1);
```

This handles cases where legacy SDs used the key format directly in the `id` column.

### Sequential Numbering

Sequential numbers are determined by querying existing keys with the same prefix:

```sql
SELECT sd_key, id
FROM strategic_directives_v2
WHERE sd_key ILIKE 'SD-UAT-FIX-NAV-%' OR id ILIKE 'SD-UAT-FIX-NAV-%'
ORDER BY created_at DESC;
```

The module extracts used numbers and finds the first gap in the sequence.

---

## Usage Examples

### Create Root SD from UAT

```javascript
import { generateSDKey } from './modules/sd-key-generator.js';

const sdKey = await generateSDKey({
  source: 'UAT',
  type: 'bugfix',
  title: 'Login button not responding'
});

// Returns: SD-UAT-FIX-LOGIN-BUTTON-001
```

### Create Child SD

```javascript
import { generateSDKey } from './modules/sd-key-generator.js';

const childKey = await generateSDKey({
  source: 'LEO',
  type: 'bugfix',
  title: 'Fix database schema',
  parentKey: 'SD-UAT-FIX-LOGIN-001',
  hierarchyDepth: 1,
  siblingIndex: 0  // First child (A)
});

// Returns: SD-UAT-FIX-LOGIN-001-A
```

### Create SD from Feedback

```javascript
import { generateSDKey } from './modules/sd-key-generator.js';

const sdKey = await generateSDKey({
  source: 'FEEDBACK',
  type: 'feature',
  title: 'Add dark mode toggle'
});

// Returns: SD-FDBK-FEAT-ADD-DARK-MODE-001
```

### Create SD from Plan File (NEW)

```javascript
import { generateSDKey } from './modules/sd-key-generator.js';
import { parsePlanFile } from './modules/plan-parser.js';
import { readPlanFile } from './modules/plan-archiver.js';

// MANDATORY: Read protocol files first (enforced by validation)
// Read tool: CLAUDE_CORE.md
// Read tool: CLAUDE_LEAD.md

// Read and parse plan
const content = readPlanFile('~/.claude/plans/my-plan.md');
const parsed = parsePlanFile(content);

// Generate SD key (validation will check protocol files were read)
const sdKey = await generateSDKey({
  source: 'LEO',
  type: parsed.type,  // Inferred from plan content
  title: parsed.title
});

// Returns: SD-LEO-[TYPE]-[SEMANTIC]-001
// Example: SD-LEO-FIX-ENHANCE-LEO-CREATE-001
```

### Parse Existing Key

```javascript
import { parseSDKey } from './modules/sd-key-generator.js';

const components = parseSDKey('SD-UAT-FIX-NAV-001-A1');

// Returns:
// {
//   isRoot: false,
//   parentKey: 'SD-UAT-FIX-NAV-001-A',
//   hierarchyDepth: 2,
//   siblingIndex: 0
// }
```

---

## CLI Usage

The module supports direct CLI invocation for testing:

```bash
# Generate root SD key
node scripts/modules/sd-key-generator.js UAT fix "Navigation route not working"

# Generate child key
node scripts/modules/sd-key-generator.js --child SD-UAT-FIX-NAV-001 0

# Parse SD key
node scripts/modules/sd-key-generator.js --parse SD-UAT-FIX-NAV-001-A
```

---

## Migration Notes

### Before (Legacy Approach)

Each creation script had its own key generation:

- **UAT**: `SD-UAT-###`
- **/learn**: `SD-LEARN-###` or `QF-YYYYMMDD-###`
- **Feedback**: `SD-FIX-{WORDS}-{RANDOM}` or `SD-FEAT-{WORDS}-{RANDOM}`
- **Pattern**: `SD-PAT-FIX-{CATEGORY}-###`
- **Manual**: `SD-{TYPE}-{WORDS}-{RANDOM}`

### After (Unified Approach)

All scripts use SDKeyGenerator with consistent format:

```
SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
```

**Backward Compatibility**: Existing SDs are not migrated. New convention applies only to newly created SDs.

---

## Troubleshooting

### Common Issues

#### Issue: "sd_type constraint violation"

**Error**: `new row for relation "strategic_directives_v2" violates check constraint "sd_type_check"`

**Cause**: The `type` parameter doesn't map to a valid database `sd_type`.

**Solution**: Use the type mapping in `leo-create-sd.js`:

```javascript
// Valid database sd_types:
// bugfix, database, docs, documentation, feature, infrastructure,
// orchestrator, qa, refactor, security, implementation

// User-friendly mappings:
fix → bugfix
feature → feature
enhancement → feature
infra → infrastructure
doc → documentation
```

#### Issue: Collision detected

**Error**: `Collision detected for SD-UAT-FIX-NAV-001, incrementing...`

**Cause**: The proposed key already exists in `sd_key` or `id` column.

**Solution**: The module automatically increments and retries. If this persists, check for corrupted data:

```sql
SELECT id, sd_key FROM strategic_directives_v2
WHERE sd_key ILIKE 'SD-UAT-FIX-NAV%' OR id ILIKE 'SD-UAT-FIX-NAV%';
```

#### Issue: Semantic extraction returns "GEN"

**Cause**: Title contains only stop words or very short words.

**Solution**: Use a more descriptive title with technical terms:

```javascript
// Bad: "Fix the thing"
// Returns: SD-UAT-FIX-GEN-001

// Good: "Fix navigation route error"
// Returns: SD-UAT-FIX-NAVIGATION-ROUTE-001
```

---

## Module Exports

The SDKeyGenerator module exports the following:

### Functions
- `generateSDKey(options)` - Generate SD key with validation
- `generateChildKey(parentKey, childIndex)` - Generate child SD key
- `generateGrandchildKey(parentKey, grandchildIndex)` - Generate grandchild SD key
- `parseSDKey(sdKey)` - Parse SD key into components
- `extractSemanticWords(title, maxWords)` - Extract semantic words from title
- `getHierarchySuffix(depth, index)` - Get hierarchy suffix for depth/index
- `keyExists(proposedKey)` - Check if SD key exists in database
- `getNextSequentialNumber(prefix)` - Find next available sequential number
- `validateCoreFileRead()` - Validate CLAUDE_CORE.md has been read *(NEW)*
- `validateLeadFileRead()` - Validate CLAUDE_LEAD.md has been read *(NEW)*
- `validateProtocolFilesRead()` - Validate both protocol files have been read *(NEW)*

### Constants
- `SD_SOURCES` - Valid SD source mappings
- `SD_TYPES` - Valid SD type mappings

---

## Related Documentation

- **Command Documentation**: `.claude/commands/leo.md` - /leo create command
- **Protocol Files**: `CLAUDE_CORE.md`, `CLAUDE_LEAD.md` - Required reading before SD creation
- **Session State**: `.claude/unified-session-state.json` - Tracks protocol file read status
- **Hierarchy Guide**: `docs/reference/sd-hierarchy-schema-guide.md` - Parent-child relationships
- **Schema Reference**: `docs/database/strategic_directives_v2_field_reference.md` - Database fields
- **npm Scripts**: `docs/reference/npm-scripts-guide.md` - CLI commands

---

**Last Updated**: 2026-01-31
**Maintainer**: Claude (LEO Protocol)
**SD**: SD-LEO-SDKEY-001, SD-LEO-INFRA-PLAN-AWARE-SD-CREATION-001

**Changelog**:
- **2026-01-31** (evening): Added protocol file validation enforcement
  - New validation functions: `validateCoreFileRead()`, `validateLeadFileRead()`, `validateProtocolFilesRead()`
  - Mandatory validation: CLAUDE_CORE.md and CLAUDE_LEAD.md must be read before SD creation
  - Partial read detection: Blocks SD creation if files read with limit/offset parameters
  - CLI validation commands: `--check-protocol`, `--check-core`, `--check-lead`
  - Emergency bypass: `skipLeadValidation` parameter (testing/emergency use only)
  - Session state integration: Tracks protocol file read status in `.claude/unified-session-state.json`
- **2026-01-31** (morning): Added `--from-plan` documentation (plan-aware SD creation)
  - New modules: `plan-parser.js`, `plan-archiver.js`
  - Plan parsing: extracts title, summary, steps, files, key changes, risks
  - Plan archiving: preserves original plan to `docs/plans/archived/`
  - Type inference: determines SD type from plan content keywords
