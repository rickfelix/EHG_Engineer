/**
 * GATE_CROSS_CHILD_INTEGRATION for orchestrator completion
 *
 * Extracts data contracts (table names, column references) from child SD
 * deliverables_manifest records, cross-references them across siblings,
 * and reports mismatches. Advisory (non-blocking) for initial rollout.
 *
 * Part of SD-LEO-INFRA-CROSS-CHILD-INTEGRATION-001
 * Evidence: S17-to-S19 column mismatch incident (lifecycle_stage vs stage_number)
 */

const GATE_NAME = 'CROSS_CHILD_INTEGRATION';

// Regex patterns for extracting table/column references from free-text manifests
const TABLE_PATTERNS = [
  /(?:CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE|DELETE\s+FROM|SELECT\s+FROM|FROM)\s+["`]?(\w+)["`]?/gi,
  /(?:table|tables?)[\s:]+["`]?(\w+)["`]?/gi,
  /(\w+_(?:v2|documents|plans|payloads|results|log|flags|capabilities|deliverables|handoffs|stories))\b/gi,
];

const COLUMN_PATTERNS = [
  /(?:column|columns?)[\s:]+["`]?(\w+)["`]?/gi,
  /\.([a-z_]+)\s*(?:=|IS|LIKE|IN\b)/gi,
  /(?:SET|WHERE)\s+["`]?(\w+)["`]?\s*=/gi,
];

/**
 * Extract data contracts from a deliverables_manifest string.
 * Returns { tables: [{name, operation}], columns: [{table, column, operation}] }
 */
export function extractContracts(manifest, childKey) {
  if (!manifest || typeof manifest !== 'string') {
    return { childKey, tables: [], columns: [], raw: manifest };
  }

  const tables = new Map();
  const columns = new Map();

  for (const pattern of TABLE_PATTERNS) {
    // Reset lastIndex for each pattern since they use /g flag
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(manifest)) !== null) {
      const tableName = match[1].toLowerCase();
      // Skip common false positives
      if (['the', 'all', 'for', 'and', 'not', 'set', 'get', 'has', 'was', 'are'].includes(tableName)) continue;
      if (tableName.length < 3) continue;
      if (!tables.has(tableName)) {
        tables.set(tableName, { name: tableName, operations: new Set() });
      }
      // Infer operation from context
      const contextBefore = manifest.substring(Math.max(0, match.index - 20), match.index).toLowerCase();
      if (contextBefore.includes('create') || contextBefore.includes('insert')) {
        tables.get(tableName).operations.add('write');
      } else if (contextBefore.includes('select') || contextBefore.includes('from') || contextBefore.includes('read')) {
        tables.get(tableName).operations.add('read');
      } else if (contextBefore.includes('update') || contextBefore.includes('alter')) {
        tables.get(tableName).operations.add('write');
      } else {
        tables.get(tableName).operations.add('reference');
      }
    }
  }

  for (const pattern of COLUMN_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(manifest)) !== null) {
      const colName = match[1].toLowerCase();
      if (colName.length < 3) continue;
      if (['the', 'all', 'for', 'and', 'not'].includes(colName)) continue;
      const key = colName;
      if (!columns.has(key)) {
        columns.set(key, { column: colName, mentions: 1 });
      } else {
        columns.get(key).mentions++;
      }
    }
  }

  return {
    childKey,
    tables: Array.from(tables.values()).map(t => ({
      name: t.name,
      operations: Array.from(t.operations),
    })),
    columns: Array.from(columns.values()),
  };
}

/**
 * Detect mismatches across sibling contract maps.
 * Returns array of violations: { type, severity, details }
 */
export function detectMismatches(contractMaps) {
  const violations = [];

  if (contractMaps.length < 2) return violations;

  // Build a table->children index: which children reference which tables
  const tableIndex = new Map(); // tableName -> [{childKey, operations}]
  for (const contract of contractMaps) {
    for (const table of contract.tables) {
      if (!tableIndex.has(table.name)) {
        tableIndex.set(table.name, []);
      }
      tableIndex.set(table.name, [...tableIndex.get(table.name), {
        childKey: contract.childKey,
        operations: table.operations,
      }]);
    }
  }

  // Check for tables referenced by multiple children with conflicting operations
  for (const [tableName, refs] of tableIndex) {
    if (refs.length < 2) continue;

    const writers = refs.filter(r => r.operations.includes('write'));
    const readers = refs.filter(r => r.operations.includes('read'));

    // Multiple writers to same table = potential conflict
    if (writers.length > 1) {
      violations.push({
        type: 'MULTIPLE_WRITERS',
        severity: 'warning',
        table: tableName,
        children: writers.map(w => w.childKey),
        details: `Multiple children write to table '${tableName}': ${writers.map(w => w.childKey).join(', ')}. Verify column compatibility.`,
      });
    }

    // Writer + reader on same table = check column alignment
    if (writers.length > 0 && readers.length > 0) {
      const writerKeys = writers.map(w => w.childKey);
      const readerKeys = readers.map(r => r.childKey);
      // If writer and reader are different children, flag for review
      const crossChildPairs = writerKeys.filter(w => !readerKeys.includes(w));
      if (crossChildPairs.length > 0) {
        violations.push({
          type: 'CROSS_CHILD_TABLE_DEPENDENCY',
          severity: 'info',
          table: tableName,
          writers: writerKeys,
          readers: readerKeys,
          details: `Table '${tableName}' is written by [${writerKeys.join(', ')}] and read by [${readerKeys.join(', ')}]. Ensure column schemas are compatible.`,
        });
      }
    }
  }

  // Check for column name conflicts across children referencing the same table
  // Build column->table->children index
  const childColumnSets = new Map(); // childKey -> Set of column names
  for (const contract of contractMaps) {
    const colSet = new Set(contract.columns.map(c => c.column));
    childColumnSets.set(contract.childKey, colSet);
  }

  // For tables with multiple children, check if the children's column sets conflict
  for (const [tableName, refs] of tableIndex) {
    if (refs.length < 2) continue;
    const childKeys = refs.map(r => r.childKey);
    // Compare column sets between pairs of children for this table
    for (let i = 0; i < childKeys.length; i++) {
      for (let j = i + 1; j < childKeys.length; j++) {
        const colsA = childColumnSets.get(childKeys[i]);
        const colsB = childColumnSets.get(childKeys[j]);
        if (!colsA || !colsB) continue;

        // Look for near-miss column names (e.g., stage_number vs lifecycle_stage)
        for (const colA of colsA) {
          for (const colB of colsB) {
            if (colA === colB) continue;
            // Check if columns share a common word (potential rename/mismatch)
            const wordsA = colA.split('_');
            const wordsB = colB.split('_');
            const shared = wordsA.filter(w => wordsB.includes(w) && w.length > 2);
            if (shared.length > 0 && shared.length < Math.max(wordsA.length, wordsB.length)) {
              violations.push({
                type: 'COLUMN_NAME_MISMATCH',
                severity: 'warning',
                table: tableName,
                childA: childKeys[i],
                childB: childKeys[j],
                columnA: colA,
                columnB: colB,
                sharedWords: shared,
                details: `Potential column mismatch on table '${tableName}': child '${childKeys[i]}' uses '${colA}' while child '${childKeys[j]}' uses '${colB}' (shared: ${shared.join(', ')}).`,
              });
            }
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Create the cross-child integration gate validator.
 * Follows BaseExecutor gate pattern.
 */
export function createCrossChildIntegrationGate(supabase) {
  return {
    name: GATE_NAME,
    required: false, // Advisory mode
    weight: 5,
    async validator(ctx) {
      const { sd } = ctx;

      // Only run for orchestrators (has children)
      const { data: children } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title')
        .eq('parent_sd_id', sd.id || sd.sd_key);

      if (!children || children.length === 0) {
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { skipped: true, reason: 'Not an orchestrator (no children)' },
        };
      }

      // Fetch child deliverables_manifest from EXEC-TO-PLAN handoffs
      const childIds = children.map(c => c.id);
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('sd_id, deliverables_manifest, handoff_type')
        .in('sd_id', childIds)
        .eq('status', 'accepted');

      // Build manifest per child
      const manifestsByChild = new Map();
      for (const h of (handoffs || [])) {
        const child = children.find(c => c.id === h.sd_id);
        const key = child?.sd_key || h.sd_id;
        if (!manifestsByChild.has(key)) {
          manifestsByChild.set(key, []);
        }
        if (h.deliverables_manifest) {
          manifestsByChild.get(key).push(h.deliverables_manifest);
        }
      }

      // Extract contracts from each child's manifests
      const contractMaps = [];
      for (const [childKey, manifests] of manifestsByChild) {
        const combined = manifests.join('\n');
        contractMaps.push(extractContracts(combined, childKey));
      }

      // Detect mismatches
      const mismatches = detectMismatches(contractMaps);

      const totalContracts = contractMaps.reduce((sum, c) => sum + c.tables.length, 0);
      const warnings = mismatches.map(m => m.details);
      const hasWarnings = mismatches.filter(m => m.severity === 'warning').length > 0;

      // Advisory: always pass, report warnings
      const score = hasWarnings ? 70 : 100;

      const result = {
        passed: true, // Advisory — never blocks
        score,
        max_score: 100,
        issues: [],
        warnings,
        details: {
          gate: GATE_NAME,
          advisory: true,
          blocking: false,
          children_analyzed: children.length,
          children_with_manifests: manifestsByChild.size,
          contracts_extracted: totalContracts,
          mismatches_count: mismatches.length,
          mismatches,
          contracts: contractMaps.map(c => ({
            childKey: c.childKey,
            tables: c.tables.length,
            columns: c.columns.length,
          })),
          cross_child_integration: {
            contracts_extracted: totalContracts,
            mismatches: mismatches,
            verdict: hasWarnings ? 'WARN' : 'PASS',
          },
        },
      };

      return result;
    },
  };
}
