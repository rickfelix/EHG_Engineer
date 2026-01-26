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

## API Reference

### Core Functions

#### `generateSDKey(options)`

Generates a new SD key with collision detection.

**Parameters**:
```javascript
{
  source: string,        // 'UAT', 'LEARN', 'FEEDBACK', 'PATTERN', 'MANUAL', 'LEO'
  type: string,          // 'fix', 'feature', 'refactor', 'infrastructure', etc.
  title: string,         // SD title for semantic extraction
  parentKey?: string,    // Parent SD key (for hierarchies)
  hierarchyDepth?: number, // 0=root, 1=child, 2=grandchild, 3+=great-grandchild
  siblingIndex?: number  // Index among siblings (for suffix)
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
/leo create --child <parent-key> [index]
```

See `.claude/commands/leo.md` for full command documentation.

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

## Related Documentation

- **Command Documentation**: `.claude/commands/leo.md` - /leo create command
- **Hierarchy Guide**: `docs/reference/sd-hierarchy-schema-guide.md` - Parent-child relationships
- **Schema Reference**: `docs/database/strategic_directives_v2_field_reference.md` - Database fields
- **npm Scripts**: `docs/reference/npm-scripts-guide.md` - CLI commands

---

**Last Updated**: 2026-01-20
**Maintainer**: Claude (LEO Protocol)
**SD**: SD-LEO-SDKEY-001
