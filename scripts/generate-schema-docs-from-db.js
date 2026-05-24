#!/usr/bin/env node

/**
 * Supabase Schema Documentation Generator
 *
 * Generates comprehensive, auto-updating schema documentation from Supabase database.
 *
 * REFACTORED: Modularized from 956 LOC to ~120 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, queries, table-generator, overview-generator, index-generator, utils
 *
 * Usage:
 *   npm run schema:docs                    # Generate all documentation
 *   npm run schema:docs:table users        # Generate single table doc
 *   npm run schema:docs --verbose          # Debug mode
 *
 * Output:
 *   docs/reference/schema/
 *   ├── README.md                          (index with TOC)
 *   ├── database-schema-overview.md        (quick reference, 15-20KB)
 *   └── tables/
 *       ├── strategic_directives_v2.md
 *       ├── product_requirements_v2.md
 *       └── ... (one per table)
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
// SD-FDBK-INFRA-RESTORE-STRICT-TLS-001 (FR-4): strict TLS via the bundled
// Supabase CA instead of a hardcoded rejectUnauthorized:false bypass.
import { getSSLConfig } from './lib/supabase-connection.js';

const { Client } = pg;

// Import from decomposed modules
import {
  CONFIG,
  DB_MAPPINGS,
  queryAllTables,
  queryColumns,
  queryConstraints,
  queryIndexes,
  queryRLSPolicies,
  queryTriggers,
  queryForeignKeys,
  queryRowCount,
  isRLSEnabled,
  generateTableMarkdown,
  generateOverview,
  generateIndex,
  ensureDirectories,
  log
} from './schema-docs-generator/index.js';

class SchemaDocumentationGenerator {
  constructor() {
    this.supabase = null;
    this.pgClient = null;
    this.tables = [];
    this.generatedAt = new Date().toISOString();
    this.projectId = null;
  }

  async initialize() {
    log('🔌 Connecting to Supabase...');

    // Supabase client (for REST API)
    this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

    // PostgreSQL client (for advanced queries)
    this.pgClient = new Client({
      connectionString: CONFIG.poolerUrl,
      ssl: getSSLConfig()
    });

    await this.pgClient.connect();
    log('✅ Connected to database');

    // Extract project ID from URL
    const urlMatch = CONFIG.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    this.projectId = urlMatch ? urlMatch[1] : 'unknown';

    // Determine application details
    const mapping = DB_MAPPINGS[this.projectId];
    if (mapping) {
      this.appName = mapping.getName(CONFIG.databaseTarget);
      this.appDescription = mapping.getDescription(CONFIG.databaseTarget);
      this.appPath = mapping.getPath(CONFIG.databaseTarget);
      this.appPurpose = mapping.getPurpose(CONFIG.databaseTarget);
    } else {
      this.appName = `Unknown Application (${CONFIG.databaseTarget})`;
      this.appDescription = 'Unknown Database';
      this.appPath = 'Unknown';
      this.appPurpose = 'Unknown';
    }

    log(`📊 Application: ${this.appName}`);
    log(`📦 Database: ${this.projectId}`);
    log(`🎯 Purpose: ${this.appPurpose}`);
  }

  getContext() {
    return {
      appName: this.appName,
      appDescription: this.appDescription,
      appPath: this.appPath,
      appPurpose: this.appPurpose,
      projectId: this.projectId,
      generatedAt: this.generatedAt
    };
  }

  async generate() {
    try {
      await this.initialize();
      log('📊 Querying database schema...');
      ensureDirectories();

      if (CONFIG.singleTable) {
        log(`🎯 Generating documentation for single table: ${CONFIG.singleTable}`);
        await this.processTable(CONFIG.singleTable);
      } else {
        this.tables = await queryAllTables(this.pgClient);
        log(`📋 Found ${this.tables.length} tables to document`);

        for (const table of this.tables) {
          await this.processTable(table.table_name);
        }

        // Generate overview and index
        const overviewMd = await generateOverview(this.tables, this.getContext(), this.pgClient, this.supabase);
        fs.writeFileSync(path.join(CONFIG.outputDir, 'database-schema-overview.md'), overviewMd);
        log('✅ Generated database-schema-overview.md');

        const indexMd = generateIndex(this.tables, this.getContext());
        fs.writeFileSync(path.join(CONFIG.outputDir, 'README.md'), indexMd);
        log('✅ Generated README.md');
      }

      log('✅ Schema documentation generated successfully!');
      log(`📁 Output: ${CONFIG.outputDir}`);

    } catch (error) {
      console.error('❌ Error generating schema documentation:', error);
      throw error;
    } finally {
      if (this.pgClient) {
        await this.pgClient.end();
      }
    }
  }

  async processTable(tableName) {
    log(`  📋 Processing ${tableName}...`);

    try {
      const tableInfo = {
        name: tableName,
        columns: await queryColumns(this.pgClient, tableName),
        constraints: await queryConstraints(this.pgClient, tableName),
        indexes: await queryIndexes(this.pgClient, tableName),
        rlsPolicies: await queryRLSPolicies(this.pgClient, tableName),
        triggers: await queryTriggers(this.pgClient, tableName),
        foreignKeys: await queryForeignKeys(this.pgClient, tableName),
        rowCount: await queryRowCount(this.supabase, tableName),
        rlsEnabled: await isRLSEnabled(this.pgClient, tableName)
      };

      const markdown = generateTableMarkdown(tableInfo, this.getContext());
      const filePath = path.join(CONFIG.tablesDir, `${tableName}.md`);

      fs.writeFileSync(filePath, markdown);
      log(`     ✅ Generated ${tableName}.md`);

    } catch (error) {
      console.error(`     ❌ Error processing ${tableName}:`, error.message);
    }
  }
}

// Main execution
const generator = new SchemaDocumentationGenerator();
generator.generate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
