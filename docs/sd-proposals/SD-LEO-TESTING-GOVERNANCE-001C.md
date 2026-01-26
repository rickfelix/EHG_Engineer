# Strategic Directive Proposal: SD-LEO-TESTING-GOVERNANCE-001C


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, migration, schema

## Schema Documentation Loading in Phase Preflight

**Proposed ID:** SD-LEO-TESTING-GOVERNANCE-001C
**Parent SD:** SD-LEO-TESTING-GOVERNANCE-001
**Type:** Feature (Child SD)
**Category:** protocol
**Priority:** MEDIUM
**Target Application:** EHG_Engineer
**Estimated Effort:** 10-15 hours

---

## 1. Strategic Intent

Add proactive schema documentation loading to the phase-preflight.js script for PLAN and EXEC phases. This reduces schema mismatch errors by providing relevant table documentation before implementation begins.

---

## 2. Rationale

### Evidence Base
- **42-95 hours/year** lost to schema mismatches (documented)
- **3+ critical mismatches** documented (retrospectives, sub_agent_execution_results, handoffs)
- **90+ scripts** with field mismatches (100% of PRD audit sample)
- Schema docs exist but are NOT loaded in phase-preflight.js

### Current State
- phase-preflight.js loads: issue patterns, retrospectives, SD metadata, exploration data
- Schema documentation exists in `docs/reference/schema/engineer/`
- `generate-schema-docs-from-db.js` keeps docs current
- **NO schema context loaded during preflight**

### Target State
- New `lib/schema-context-loader.js` module
- Extracts table names from SD description
- Loads pre-generated schema docs (no live queries)
- Displays relevant columns, constraints, relationships
- Integrated into phase-preflight.js for PLAN/EXEC phases

---

## 3. Scope

### In Scope
- Create `lib/schema-context-loader.js` module
- Integrate into `scripts/phase-preflight.js`
- Extract table names from SD title/description
- Load schema docs from `docs/reference/schema/engineer/tables/`
- Display schema context in preflight output

### Out of Scope
- Live database schema queries
- Schema doc generation improvements
- RLS policy documentation
- Migration impact analysis

---

## 4. Key Changes

### New File: `lib/schema-context-loader.js`

```javascript
/**
 * Schema Context Loader - LEO Protocol v4.4.2
 *
 * Extracts table names from SD description and loads relevant schema docs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_BASE = path.join(__dirname, '..', 'docs', 'reference', 'schema', 'engineer');
const TABLES_DIR = path.join(SCHEMA_BASE, 'tables');

// Known database tables
const KNOWN_TABLES = [
  'strategic_directives_v2', 'product_requirements_v2', 'retrospectives',
  'sd_phase_handoffs', 'user_stories', 'test_runs', 'test_results',
  'story_test_mappings', 'sub_agent_execution_results', 'issue_patterns',
  // ... (full list in implementation)
];

/**
 * Extract table names from text
 */
export function extractTableNames(text) {
  if (!text) return [];
  const tables = new Set();
  const searchText = text.toLowerCase();

  for (const table of KNOWN_TABLES) {
    if (searchText.includes(table.toLowerCase())) {
      tables.add(table);
    }
  }

  return Array.from(tables);
}

/**
 * Load schema documentation for a table
 */
export function loadTableSchema(tableName) {
  const filePath = path.join(TABLES_DIR, `${tableName}.md`);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    tableName,
    filePath,
    columns: parseColumns(content),
    rawContent: content.substring(0, 5000)
  };
}

/**
 * Main function: Load schema context for SD
 */
export async function loadSchemaContext(sd, options = {}) {
  const { includeOverview = false, maxTables = 5 } = options;

  const searchText = [
    sd.title || '', sd.description || '', sd.scope || '',
    sd.technical_approach || '', JSON.stringify(sd.strategic_objectives || [])
  ].join(' ');

  const tableNames = extractTableNames(searchText);
  const schemas = tableNames.slice(0, maxTables)
    .map(t => loadTableSchema(t))
    .filter(Boolean);

  return { tablesFound: tableNames, schemasLoaded: schemas };
}

/**
 * Format schema context for terminal display
 */
export function formatSchemaContext(ctx) {
  let output = ['', '📊 SCHEMA CONTEXT (Auto-Loaded)', '='.repeat(50)];

  if (ctx.tablesFound.length > 0) {
    output.push(`Tables Detected: ${ctx.tablesFound.join(', ')}`);
  }

  for (const schema of ctx.schemasLoaded) {
    output.push(`\n📄 ${schema.tableName}`);
    output.push(`   Columns: ${schema.columns.length}`);
    const keyColumns = schema.columns.slice(0, 5);
    for (const col of keyColumns) {
      output.push(`   - ${col.name}: ${col.type}`);
    }
  }

  return output.join('\n');
}

export default { extractTableNames, loadTableSchema, loadSchemaContext, formatSchemaContext };
```

### File: `scripts/phase-preflight.js`

**Add import (after line 20):**
```javascript
import { loadSchemaContext, formatSchemaContext } from '../lib/schema-context-loader.js';
```

**Add schema loading (after line 719, before displayResults):**
```javascript
// LEO v4.4.2: Load schema context for PLAN/EXEC phases
if (phase === 'PLAN' || phase === 'EXEC') {
  console.log('\n📊 Loading schema context...');

  try {
    const schemaContext = await loadSchemaContext(sd, {
      includeOverview: phase === 'PLAN',
      maxTables: phase === 'PLAN' ? 8 : 5
    });

    if (schemaContext.schemasLoaded.length > 0) {
      console.log(formatSchemaContext(schemaContext));
      strategy.schemaContext = schemaContext;
    } else {
      console.log('   ℹ️  No relevant schema docs found for this SD');
    }
  } catch (err) {
    console.log(`   ⚠️  Schema loading error: ${err.message}`);
  }
}
```

---

## 5. Success Criteria

| Criterion | Metric | Pass Threshold |
|-----------|--------|----------------|
| Tables detected | Table names extracted from SD | When present |
| Schemas loaded | Pre-generated docs loaded | 100% |
| Context displayed | Schema shown in preflight | For PLAN/EXEC |
| No performance impact | Preflight time increase | <500ms |
| Graceful fallback | Missing docs handled | No errors |

---

## 6. Schema Docs Location

```
docs/reference/schema/engineer/
├── database-schema-overview.md      # Full overview (15-20KB)
└── tables/
    ├── retrospectives.md
    ├── strategic_directives_v2.md
    ├── test_runs.md
    └── ... (159+ tables)
```

---

## 7. Acceptance Testing

- [ ] Table names extracted from SD title
- [ ] Table names extracted from SD description
- [ ] Schema docs loaded from docs/reference/schema/engineer/tables/
- [ ] Column information displayed in preflight
- [ ] PLAN phase loads more tables than EXEC (8 vs 5)
- [ ] Missing schema docs produce warning, not error
- [ ] Non-database SDs show "no relevant schema docs"
- [ ] Preflight completes in <3 seconds total

---

## 8. Estimated LOC

- schema-context-loader.js: ~200 lines
- phase-preflight.js modifications: ~35 lines
- formatSchemaContext helper: ~40 lines
- **Total: ~275 lines**

---

*Part of SD-LEO-TESTING-GOVERNANCE-001 orchestrator*
