/**
 * TypeScript Type Generator Wrapper
 * SD-DATABASE-VALIDATION-001: Phase 1 - Core Validation
 *
 * Wraps Supabase CLI type generation with:
 * - Caching to avoid unnecessary regeneration
 * - Schema change detection
 * - CI/CD integration
 * - Output validation
 *
 * Usage:
 *   node scripts/db-validate/type-generator.js [--project=engineer|ehg] [--force] [--check]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';

/**
 * Type generation result
 * @typedef {Object} GenerationResult
 * @property {boolean} success - Whether generation succeeded
 * @property {boolean} changed - Whether types changed
 * @property {string} [outputPath] - Path to generated types
 * @property {string} [error] - Error message if failed
 * @property {Object} metadata - Generation metadata
 */

/**
 * Project configuration
 * NOTE: As of SD-ARCH-EHG-006 (2025-11-30), both EHG and EHG_Engineer
 * now use the CONSOLIDATED database (dedlbzhpgkmetvhbkyzq).
 */
const PROJECT_CONFIGS = {
  engineer: {
    projectRef: 'dedlbzhpgkmetvhbkyzq',
    outputPath: 'types/database.ts',
    cacheFile: '.schema-cache/engineer-types.hash'
  },
  ehg: {
    projectRef: 'dedlbzhpgkmetvhbkyzq',  // CONSOLIDATED: migrated from liapbndqlqxdcgpwntbv (SD-ARCH-EHG-006)
    outputPath: '../ehg/src/types/database.ts',
    cacheFile: '.schema-cache/ehg-types.hash'
  }
};

export class TypeGenerator {
  constructor(project = 'engineer', options = {}) {
    this.project = project;
    this.config = PROJECT_CONFIGS[project];
    this.force = options.force || false;
    this.checkOnly = options.checkOnly || false;
    this.verbose = options.verbose || false;

    if (!this.config) {
      throw new Error(`Unknown project: ${project}. Must be 'engineer' or 'ehg'`);
    }
  }

  /**
   * Get current schema hash for change detection
   * @returns {Promise<string>} SHA-256 hash of schema
   */
  async getSchemaHash() {
    const client = await createDatabaseClient(this.project, { verify: false });

    try {
      // Get table structure that affects types
      const result = await client.query(`
        SELECT
          t.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON t.table_name = c.table_name
          AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      `);

      const schemaString = JSON.stringify(result.rows);
      return crypto.createHash('sha256').update(schemaString).digest('hex');
    } finally {
      await client.end();
    }
  }

  /**
   * Get cached schema hash
   * @returns {string|null} Cached hash or null if not cached
   */
  getCachedHash() {
    try {
      const cacheDir = path.dirname(this.config.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      if (fs.existsSync(this.config.cacheFile)) {
        return fs.readFileSync(this.config.cacheFile, 'utf-8').trim();
      }
    } catch {
      // Cache read failed, return null
    }
    return null;
  }

  /**
   * Save schema hash to cache
   * @param {string} hash - Hash to cache
   */
  saveCachedHash(hash) {
    const cacheDir = path.dirname(this.config.cacheFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(this.config.cacheFile, hash);
  }

  /**
   * Check if schema has changed
   * @returns {Promise<{changed: boolean, currentHash: string, cachedHash: string|null}>}
   */
  async checkSchemaChanged() {
    const currentHash = await this.getSchemaHash();
    const cachedHash = this.getCachedHash();

    return {
      changed: cachedHash !== currentHash,
      currentHash,
      cachedHash
    };
  }

  /**
   * Check if Supabase CLI is available
   * @returns {boolean}
   */
  isSupabaseCLIAvailable() {
    try {
      execSync('npx supabase --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate types using Supabase CLI
   * @returns {Promise<GenerationResult>}
   */
  async generateTypes() {
    const startTime = Date.now();

    // Check for schema changes first
    const schemaCheck = await this.checkSchemaChanged();

    if (!this.force && !schemaCheck.changed) {
      if (this.verbose) {
        console.log('Schema unchanged, skipping type generation');
      }
      return {
        success: true,
        changed: false,
        outputPath: this.config.outputPath,
        metadata: {
          skipped: true,
          reason: 'schema_unchanged',
          hash: schemaCheck.currentHash,
          duration: Date.now() - startTime
        }
      };
    }

    if (this.checkOnly) {
      return {
        success: true,
        changed: schemaCheck.changed,
        metadata: {
          checkOnly: true,
          schemaChanged: schemaCheck.changed,
          currentHash: schemaCheck.currentHash,
          cachedHash: schemaCheck.cachedHash,
          duration: Date.now() - startTime
        }
      };
    }

    // Check Supabase CLI
    if (!this.isSupabaseCLIAvailable()) {
      return {
        success: false,
        changed: schemaCheck.changed,
        error: 'Supabase CLI not available. Run: npm install supabase',
        metadata: { duration: Date.now() - startTime }
      };
    }

    // Generate types
    try {
      const outputDir = path.dirname(this.config.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const command = `npx supabase gen types typescript --project-id ${this.config.projectRef}`;

      if (this.verbose) {
        console.log(`Executing: ${command}`);
      }

      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 60000 // 60 second timeout
      });

      // Write output to file
      fs.writeFileSync(this.config.outputPath, output);

      // Validate output
      const validationResult = this.validateGeneratedTypes(output);
      if (!validationResult.valid) {
        return {
          success: false,
          changed: true,
          error: `Generated types invalid: ${validationResult.errors.join(', ')}`,
          metadata: { duration: Date.now() - startTime }
        };
      }

      // Update cache
      this.saveCachedHash(schemaCheck.currentHash);

      return {
        success: true,
        changed: true,
        outputPath: this.config.outputPath,
        metadata: {
          hash: schemaCheck.currentHash,
          previousHash: schemaCheck.cachedHash,
          tableCount: validationResult.tableCount,
          duration: Date.now() - startTime
        }
      };
    } catch (error) {
      return {
        success: false,
        changed: true,
        error: error.message,
        metadata: { duration: Date.now() - startTime }
      };
    }
  }

  /**
   * Validate generated TypeScript types
   * @param {string} content - Generated type content
   * @returns {{valid: boolean, errors: string[], tableCount: number}}
   */
  validateGeneratedTypes(content) {
    const errors = [];
    let tableCount = 0;

    // Check for basic structure
    if (!content.includes('export type Database')) {
      errors.push('Missing Database type export');
    }

    if (!content.includes('export type Tables')) {
      errors.push('Missing Tables type export');
    }

    // Count tables
    const tableMatches = content.match(/Tables<"[^"]+"\)/g);
    tableCount = tableMatches ? tableMatches.length : 0;

    // Check for TypeScript syntax validity (basic check)
    if (content.includes('syntax error') || content.includes('SyntaxError')) {
      errors.push('Contains syntax errors');
    }

    // Check minimum content length
    if (content.length < 500) {
      errors.push('Generated content suspiciously short');
    }

    return {
      valid: errors.length === 0,
      errors,
      tableCount
    };
  }

  /**
   * Log generation result
   * @param {GenerationResult} result - Generation result
   */
  logResult(result) {
    if (result.success) {
      if (result.changed) {
        console.log('\x1b[32m%s\x1b[0m', 'Type generation SUCCEEDED');
        console.log(`  Output: ${result.outputPath}`);
        if (result.metadata.tableCount) {
          console.log(`  Tables: ${result.metadata.tableCount}`);
        }
      } else {
        console.log('\x1b[33m%s\x1b[0m', 'Type generation SKIPPED (no changes)');
      }
    } else {
      console.log('\x1b[31m%s\x1b[0m', 'Type generation FAILED');
      console.log(`  Error: ${result.error}`);
    }

    if (this.verbose && result.metadata) {
      console.log('\nMetadata:');
      console.log(JSON.stringify(result.metadata, null, 2));
    }
  }
}

/**
 * Generate types from database schema directly (fallback when Supabase CLI unavailable)
 * This is a simplified version that creates basic types
 */
export async function generateTypesFromSchema(project = 'engineer') {
  const client = await createDatabaseClient(project, { verify: false });

  try {
    // Get all tables and their columns
    const result = await client.query(`
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON t.table_name = c.table_name
        AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    `);

    // Group by table
    const tables = {};
    for (const row of result.rows) {
      if (!tables[row.table_name]) {
        tables[row.table_name] = [];
      }
      tables[row.table_name].push(row);
    }

    // Generate TypeScript
    let output = `/**
 * Auto-generated database types
 * Generated: ${new Date().toISOString()}
 * Project: ${project}
 *
 * WARNING: This is a fallback generator.
 * For full types, use Supabase CLI: npx supabase gen types typescript
 */

`;

    for (const [tableName, columns] of Object.entries(tables)) {
      const interfaceName = toPascalCase(tableName);
      output += `export interface ${interfaceName} {\n`;

      for (const col of columns) {
        const tsType = pgTypeToTs(col.udt_name);
        const nullable = col.is_nullable === 'YES' ? ' | null' : '';
        output += `  ${col.column_name}: ${tsType}${nullable};\n`;
      }

      output += '}\n\n';
    }

    // Add Database type
    output += 'export interface Database {\n';
    output += '  public: {\n';
    output += '    Tables: {\n';

    for (const tableName of Object.keys(tables)) {
      const interfaceName = toPascalCase(tableName);
      output += `      ${tableName}: {\n`;
      output += `        Row: ${interfaceName};\n`;
      output += `        Insert: Partial<${interfaceName}>;\n`;
      output += `        Update: Partial<${interfaceName}>;\n`;
      output += '      };\n';
    }

    output += '    };\n';
    output += '  };\n';
    output += '}\n';

    return output;
  } finally {
    await client.end();
  }
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str) {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Map PostgreSQL types to TypeScript types
 */
function pgTypeToTs(pgType) {
  const typeMap = {
    'text': 'string',
    'varchar': 'string',
    'char': 'string',
    'uuid': 'string',
    'int2': 'number',
    'int4': 'number',
    'int8': 'number',
    'float4': 'number',
    'float8': 'number',
    'numeric': 'number',
    'bool': 'boolean',
    'timestamp': 'string',
    'timestamptz': 'string',
    'date': 'string',
    'time': 'string',
    'timetz': 'string',
    'json': 'unknown',
    'jsonb': 'unknown',
    '_text': 'string[]',
    '_int4': 'number[]',
    '_uuid': 'string[]'
  };

  return typeMap[pgType] || 'unknown';
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';
  const force = args.includes('--force');
  const checkOnly = args.includes('--check');
  const verbose = args.includes('--verbose');
  const fallback = args.includes('--fallback');

  async function main() {
    try {
      if (fallback) {
        // Use fallback generator
        console.log(`Generating fallback types for ${project}...`);
        const types = await generateTypesFromSchema(project);
        console.log(types);
      } else {
        // Use Supabase CLI wrapper
        const generator = new TypeGenerator(project, { force, checkOnly, verbose });
        const result = await generator.generateTypes();
        generator.logResult(result);
        process.exit(result.success ? 0 : 1);
      }
    } catch (error) {
      console.error('Type generation error:', error.message);
      process.exit(1);
    }
  }

  main();
}
