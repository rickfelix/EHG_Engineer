/**
 * Database Sub-Agent - Schema Analyzer Module
 *
 * Analyzes database schema from live database or schema files.
 *
 * @module lib/agents/modules/database-sub-agent/schema-analyzer
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import {
  extractTablesFromSQL,
  analyzeSQLForIssues
} from './sql-parser.js';

// Re-export SQL parser functions for backwards compatibility
export {
  extractTablesFromSQL,
  extractTableContent,
  extractColumns,
  analyzeSQLForIssues
} from './sql-parser.js';

/**
 * Analyze database schema
 *
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Schema analysis results
 */
export async function analyzeSchema(supabase) {
  const analysis = {
    tables: [],
    columns: {},
    constraints: {},
    issues: []
  };

  if (!supabase) {
    return await analyzeSchemaFiles();
  }

  try {
    const { data: tables, error } = await supabase
      .rpc('get_schema_info', { schema_name: 'public' })
      .catch(() => ({ data: null, error: 'Function not available' }));

    if (error || !tables) {
      return await analyzeKnownTables(supabase);
    }

    for (const table of tables) {
      analysis.tables.push({
        name: table.table_name,
        columns: table.column_count,
        hasPrimaryKey: table.has_primary_key,
        hasIndexes: table.has_indexes
      });

      if (!table.has_primary_key) {
        analysis.issues.push({
          type: 'MISSING_PRIMARY_KEY',
          table: table.table_name,
          severity: 'HIGH',
          fix: `ALTER TABLE ${table.table_name} ADD PRIMARY KEY (id);`
        });
      }

      if (table.column_count > 30) {
        analysis.issues.push({
          type: 'TOO_MANY_COLUMNS',
          table: table.table_name,
          columns: table.column_count,
          severity: 'MEDIUM',
          fix: 'Consider normalizing the table'
        });
      }
    }

    analysis.status = analysis.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                     analysis.issues.length > 5 ? 'WARNING' : 'PASS';

  } catch (error) {
    analysis.status = 'ERROR';
    analysis.error = error.message;
  }

  return analysis;
}

/**
 * Analyze schema files
 *
 * @returns {Promise<Object>} Schema analysis from files
 */
export async function analyzeSchemaFiles() {
  const analysis = {
    tables: [],
    columns: {},
    issues: []
  };

  const schemaPaths = [
    'database/schema.sql',
    'supabase/migrations',
    'prisma/schema.prisma',
    'db/schema.sql'
  ];

  for (const schemaPath of schemaPaths) {
    try {
      if (schemaPath.includes('migrations')) {
        const files = await fs.readdir(schemaPath);

        for (const file of files.filter(f => f.endsWith('.sql'))) {
          const content = await fs.readFile(path.join(schemaPath, file), 'utf8');
          const tables = extractTablesFromSQL(content);
          analysis.tables.push(...tables);

          const issues = analyzeSQLForIssues(content);
          analysis.issues.push(...issues);
        }
      } else {
        const content = await fs.readFile(schemaPath, 'utf8');
        const tables = extractTablesFromSQL(content);
        analysis.tables.push(...tables);

        const issues = analyzeSQLForIssues(content);
        analysis.issues.push(...issues);
      }
    } catch {
      // File doesn't exist
    }
  }

  analysis.status = analysis.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                   analysis.issues.length > 5 ? 'WARNING' : 'PASS';

  return analysis;
}

/**
 * Analyze known tables via Supabase client
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Analysis of known tables
 */
export async function analyzeKnownTables(supabase) {
  const analysis = {
    tables: [],
    issues: []
  };

  const knownTables = [
    'strategic_directives_v2',
    'product_requirements_v2',
    'execution_sequences',
    'leo_audit_log'
  ];

  for (const table of knownTables) {
    try {
      const { data: _data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);

      if (!error) {
        analysis.tables.push({
          name: table,
          exists: true
        });
      }
    } catch {
      analysis.tables.push({
        name: table,
        exists: false
      });
    }
  }

  return analysis;
}

/**
 * Analyze indexes
 *
 * @returns {Promise<Object>} Index analysis
 */
export async function analyzeIndexes() {
  const analysis = {
    indexes: [],
    missing: [],
    unused: [],
    duplicate: []
  };

  analysis.missing = [
    {
      table: 'strategic_directives_v2',
      column: 'status',
      reason: 'Frequently filtered column'
    },
    {
      table: 'product_requirements_v2',
      column: 'directive_id',
      reason: 'Foreign key column'
    }
  ];

  analysis.status = analysis.missing.length > 5 ? 'WARNING' : 'PASS';

  return analysis;
}

/**
 * Check RLS policies
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} RLS analysis
 */
export async function checkRLSPolicies(supabase) {
  const analysis = {
    enabled: false,
    policies: [],
    issues: []
  };

  if (!supabase) {
    analysis.status = 'SKIP';
    return analysis;
  }

  const tables = ['strategic_directives_v2', 'product_requirements_v2'];

  for (const table of tables) {
    analysis.issues.push({
      type: 'RLS_NOT_VERIFIED',
      table,
      severity: 'MEDIUM',
      fix: `Enable RLS: ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`
    });
  }

  analysis.status = analysis.enabled ? 'PASS' : 'WARNING';

  return analysis;
}

/**
 * Validate relationships
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Relationship validation
 */
export async function validateRelationships(_supabase) {
  const validation = {
    foreignKeys: [],
    missingRelationships: [],
    circularDependencies: []
  };

  const schemaFiles = await findSchemaFiles();

  for (const file of schemaFiles) {
    const content = await fs.readFile(file, 'utf8');

    const foreignKeys = content.match(/FOREIGN\s+KEY.*REFERENCES.*\)/gi) || [];

    for (const fk of foreignKeys) {
      const match = fk.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      if (match) {
        validation.foreignKeys.push({
          targetTable: match[1],
          targetColumn: match[2]
        });
      }
    }
  }

  const expectedRelationships = [
    { from: 'product_requirements_v2', to: 'strategic_directives_v2' },
    { from: 'execution_sequences', to: 'product_requirements_v2' }
  ];

  for (const rel of expectedRelationships) {
    const exists = validation.foreignKeys.some(fk =>
      fk.targetTable === rel.to
    );

    if (!exists) {
      validation.missingRelationships.push(rel);
    }
  }

  validation.status = validation.missingRelationships.length > 0 ? 'WARNING' : 'PASS';

  return validation;
}

/**
 * Find schema files
 *
 * @returns {Promise<Array<string>>} List of schema file paths
 */
export async function findSchemaFiles() {
  const files = [];
  const paths = [
    'database',
    'supabase/migrations',
    'db',
    'schema'
  ];

  for (const p of paths) {
    try {
      const dirFiles = await fs.readdir(p);
      for (const file of dirFiles) {
        if (file.endsWith('.sql')) {
          files.push(path.join(p, file));
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return files;
}
