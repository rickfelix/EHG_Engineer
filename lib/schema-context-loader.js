/**
 * Schema Context Loader - LEO Protocol v4.4.2
 * SD-LEO-TESTING-GOVERNANCE-001C
 *
 * Extracts table names from SD description and loads relevant schema docs.
 * Reduces schema mismatch errors by providing context during PLAN/EXEC phases.
 *
 * Evidence: 42-95 hours/year lost to schema mismatches (documented)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_BASE = path.join(__dirname, '..', 'docs', 'reference', 'schema', 'engineer');
const TABLES_DIR = path.join(SCHEMA_BASE, 'tables');

// Known database tables (commonly used in EHG_Engineer)
const KNOWN_TABLES = [
  // Core LEO Protocol tables
  'strategic_directives_v2',
  'product_requirements_v2',
  'retrospectives',
  'sd_phase_handoffs',
  'user_stories',
  'backlog_items',
  'leo_protocols',
  'leo_handoff_executions',

  // Test management tables
  'test_runs',
  'test_results',
  'story_test_mappings',
  'test_coverage_metrics',

  // Sub-agent tables
  'sub_agent_execution_results',
  'sub_agents',
  'sub_agent_contracts',
  'sub_agent_artifacts',

  // Governance tables
  'issue_patterns',
  'root_cause_reports',
  'risk_assessments',
  'sd_scope_deliverables',

  // Feature tables
  'ventures',
  'members',
  'content_items',
  'analytics_events',

  // Support tables
  'profiles',
  'roles',
  'permissions',
  'audit_logs'
];

/**
 * Extract table names from text
 * @param {string} text - Text to search for table names
 * @returns {string[]} - Array of found table names
 */
export function extractTableNames(text) {
  if (!text) return [];

  const tables = new Set();
  const searchText = text.toLowerCase();

  for (const table of KNOWN_TABLES) {
    // Match table name (case-insensitive)
    if (searchText.includes(table.toLowerCase())) {
      tables.add(table);
    }

    // Also match without _v2 suffix for common references
    const withoutV2 = table.replace('_v2', '');
    if (withoutV2 !== table && searchText.includes(withoutV2.toLowerCase())) {
      tables.add(table);
    }
  }

  return Array.from(tables);
}

/**
 * Parse columns from schema markdown content
 * @param {string} content - Markdown content
 * @returns {Array<{name: string, type: string, nullable: boolean}>}
 */
function parseColumns(content) {
  const columns = [];

  // Look for column table in markdown (| column | type | ... |)
  const lines = content.split('\n');
  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    if (line.includes('| Column') || line.includes('| Name')) {
      inTable = true;
      continue;
    }

    if (inTable && line.startsWith('|--') || line.startsWith('| --')) {
      headerPassed = true;
      continue;
    }

    if (inTable && headerPassed && line.startsWith('|')) {
      const parts = line.split('|').filter(p => p.trim());
      if (parts.length >= 2) {
        columns.push({
          name: parts[0]?.trim() || '',
          type: parts[1]?.trim() || '',
          nullable: parts[2]?.toLowerCase().includes('yes') || false
        });
      }
    }

    // End of table
    if (inTable && headerPassed && !line.startsWith('|') && line.trim()) {
      break;
    }
  }

  return columns;
}

/**
 * Load schema documentation for a table
 * @param {string} tableName - Table name to load schema for
 * @returns {Object|null} - Schema info or null if not found
 */
export function loadTableSchema(tableName) {
  const filePath = path.join(TABLES_DIR, `${tableName}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const columns = parseColumns(content);

    return {
      tableName,
      filePath,
      columns,
      columnCount: columns.length,
      rawContent: content.substring(0, 5000) // Limit to first 5KB
    };
  } catch (err) {
    console.warn(`   Warning: Could not read schema for ${tableName}: ${err.message}`);
    return null;
  }
}

/**
 * Load schema overview document
 * @returns {string|null} - Overview content or null
 */
export function loadSchemaOverview() {
  const overviewPath = path.join(SCHEMA_BASE, 'database-schema-overview.md');

  if (!fs.existsSync(overviewPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(overviewPath, 'utf-8');
    // Return first 10KB for context
    return content.substring(0, 10000);
  } catch (_err) {
    return null;
  }
}

/**
 * Main function: Load schema context for SD
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Loading options
 * @returns {Promise<Object>} - Schema context
 */
export async function loadSchemaContext(sd, options = {}) {
  const { includeOverview = false, maxTables = 5 } = options;

  // Build search text from SD fields
  const searchText = [
    sd.title || '',
    sd.description || '',
    sd.scope?.included?.join(' ') || '',
    sd.scope?.excluded?.join(' ') || '',
    sd.technical_approach || '',
    JSON.stringify(sd.strategic_objectives || []),
    JSON.stringify(sd.success_metrics || [])
  ].join(' ');

  // Extract table names
  const tableNames = extractTableNames(searchText);

  // Load schemas for found tables (limited to maxTables)
  const schemas = tableNames
    .slice(0, maxTables)
    .map(t => loadTableSchema(t))
    .filter(Boolean);

  // Load overview if requested and available
  let overview = null;
  if (includeOverview) {
    overview = loadSchemaOverview();
  }

  return {
    tablesFound: tableNames,
    schemasLoaded: schemas,
    overview,
    loadedAt: new Date().toISOString()
  };
}

/**
 * Format schema context for terminal display
 * @param {Object} ctx - Schema context object
 * @returns {string} - Formatted output string
 */
export function formatSchemaContext(ctx) {
  const output = [];

  output.push('');
  output.push('📊 SCHEMA CONTEXT (Auto-Loaded)');
  output.push('='.repeat(50));

  if (ctx.tablesFound.length > 0) {
    output.push(`Tables Detected: ${ctx.tablesFound.join(', ')}`);
  } else {
    output.push('ℹ️  No relevant tables detected in SD');
  }

  if (ctx.schemasLoaded.length > 0) {
    output.push('');
    output.push('📄 Schema Documentation:');

    for (const schema of ctx.schemasLoaded) {
      output.push(`\n   ${schema.tableName} (${schema.columnCount} columns)`);

      // Show first 5 key columns
      const keyColumns = schema.columns.slice(0, 5);
      for (const col of keyColumns) {
        const nullable = col.nullable ? '?' : '';
        output.push(`      - ${col.name}: ${col.type}${nullable}`);
      }

      if (schema.columns.length > 5) {
        output.push(`      ... and ${schema.columns.length - 5} more columns`);
      }
    }
  }

  if (ctx.overview) {
    output.push('');
    output.push('📚 Schema Overview Loaded (see docs/reference/schema/engineer/)');
  }

  output.push('='.repeat(50));

  return output.join('\n');
}

/**
 * Check if schema documentation exists
 * @returns {boolean} - True if schema docs directory exists
 */
export function schemaDocsExist() {
  return fs.existsSync(TABLES_DIR);
}

export default {
  extractTableNames,
  loadTableSchema,
  loadSchemaContext,
  formatSchemaContext,
  loadSchemaOverview,
  schemaDocsExist,
  KNOWN_TABLES
};
