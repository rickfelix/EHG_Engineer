#!/usr/bin/env node

/**
 * Supabase Schema Documentation Generator
 *
 * Generates comprehensive, auto-updating schema documentation from Supabase database.
 *
 * Features:
 * - Hybrid output: Quick reference overview + detailed per-table files
 * - Comprehensive: Tables, columns, constraints, indexes, RLS policies, triggers
 * - Intelligent: Skips internal tables, includes usage patterns for key tables
 * - Automated: Post-migration hooks + CI/CD integration
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
 *
 * Created: 2025-10-28
 * Pattern: Based on generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Client } = pg;

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Detect which database to document based on CLI flags
const isEHGApp = process.argv.includes('--app') || process.argv.includes('--ehg');
void (!isEHGApp); // Default to Engineer database

// Select database configuration
let supabaseUrl, supabaseKey, poolerUrl, databaseTarget;

if (isEHGApp) {
  // EHG Application database
  supabaseUrl = process.env.EHG_SUPABASE_URL;
  // Use service role key for full access to all tables (anon key blocked by RLS on some tables)
  supabaseKey = process.env.EHG_SUPABASE_SERVICE_ROLE_KEY || process.env.EHG_SUPABASE_ANON_KEY;
  poolerUrl = process.env.EHG_POOLER_URL;
  databaseTarget = 'ehg';
} else {
  // EHG_Engineer database (default)
  supabaseUrl = process.env.SUPABASE_URL;
  // Use service role key for full access to LEO tables (anon key blocked by RLS on some tables)
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  poolerUrl = process.env.SUPABASE_POOLER_URL;
  databaseTarget = 'engineer';
}

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '..', 'docs', 'reference', 'schema', databaseTarget),
  tablesDir: path.join(__dirname, '..', 'docs', 'reference', 'schema', databaseTarget, 'tables'),
  supabaseUrl,
  supabaseKey,
  poolerUrl,
  databaseTarget,
  verbose: process.argv.includes('--verbose'),
  singleTable: process.argv.includes('--table') ? process.argv[process.argv.indexOf('--table') + 1] : null,

  // Tables to skip (internal Supabase tables)
  skipTables: [
    'schema_migrations',
    'supabase_migrations',
    'supabase_functions_migrations',
    '_analytics_',
    '_realtime_'
  ],

  // High-traffic tables that should include usage examples (Engineer-specific)
  keyTablesEngineer: [
    'strategic_directives_v2',
    'product_requirements_v2',
    'retrospectives',
    'leo_protocols',
    'leo_sub_agents',
    'sd_phase_handoffs'
  ],

  // High-traffic tables that should include usage examples (EHG App-specific)
  keyTablesEHG: [
    'users',
    'ventures',
    'participants',
    'strategic_plans'
  ]
};

// Select appropriate key tables based on database
CONFIG.keyTables = isEHGApp ? CONFIG.keyTablesEHG : CONFIG.keyTablesEngineer;

class SchemaDocumentationGenerator {
  constructor() {
    this.supabase = null;
    this.pgClient = null;
    this.tables = [];
    this.generatedAt = new Date().toISOString();
    this.projectId = null;
  }

  async initialize() {
    this.log('🔌 Connecting to Supabase...');

    // Supabase client (for REST API)
    this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

    // PostgreSQL client (for advanced queries)
    this.pgClient = new Client({
      connectionString: CONFIG.poolerUrl,
      ssl: { rejectUnauthorized: false }
    });

    await this.pgClient.connect();
    this.log('✅ Connected to database');

    // Extract project ID from URL
    const urlMatch = CONFIG.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    this.projectId = urlMatch ? urlMatch[1] : 'unknown';

    // Determine application details based on database target and project ID
    // NOTE: As of SD-ARCH-EHG-006 (2025-11-30), both EHG and EHG_Engineer
    // now use the CONSOLIDATED database (dedlbzhpgkmetvhbkyzq).
    const dbMappings = {
      'dedlbzhpgkmetvhbkyzq': {
        name: CONFIG.databaseTarget === 'ehg' ? 'EHG' : 'EHG_Engineer',
        description: CONFIG.databaseTarget === 'ehg'
          ? 'Business Application (Customer-Facing) - CONSOLIDATED DB'
          : 'LEO Protocol Management Dashboard - CONSOLIDATED DB',
        path: CONFIG.databaseTarget === 'ehg' ? '/mnt/c/_EHG/EHG/' : '/mnt/c/_EHG/EHG_Engineer/',
        purpose: CONFIG.databaseTarget === 'ehg'
          ? 'Customer features, business logic, user-facing functionality'
          : 'Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration'
      }
    };

    const mapping = dbMappings[this.projectId];
    if (mapping) {
      this.appName = mapping.name;
      this.appDescription = mapping.description;
      this.appPath = mapping.path;
      this.appPurpose = mapping.purpose;
    } else {
      this.appName = `Unknown Application (${CONFIG.databaseTarget})`;
      this.appDescription = 'Unknown Database';
      this.appPath = 'Unknown';
      this.appPurpose = 'Unknown';
    }

    this.log(`📊 Application: ${this.appName}`);
    this.log(`📦 Database: ${this.projectId}`);
    this.log(`🎯 Purpose: ${this.appPurpose}`);
  }

  async generate() {
    try {
      await this.initialize();

      this.log('📊 Querying database schema...');

      // Create output directories
      this.ensureDirectories();

      // Get all tables
      if (CONFIG.singleTable) {
        this.log(`🎯 Generating documentation for single table: ${CONFIG.singleTable}`);
        await this.processTable(CONFIG.singleTable);
      } else {
        await this.queryAllTables();

        this.log(`📋 Found ${this.tables.length} tables to document`);

        // Process each table
        for (const table of this.tables) {
          await this.processTable(table.table_name);
        }

        // Generate overview and index
        await this.generateOverview();
        await this.generateIndex();
      }

      this.log('✅ Schema documentation generated successfully!');
      this.log(`📁 Output: ${CONFIG.outputDir}`);

    } catch (error) {
      console.error('❌ Error generating schema documentation:', error);
      throw error;
    } finally {
      if (this.pgClient) {
        await this.pgClient.end();
      }
    }
  }

  ensureDirectories() {
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.tablesDir)) {
      fs.mkdirSync(CONFIG.tablesDir, { recursive: true });
    }
  }

  async queryAllTables() {
    const query = `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        n.nspname AS schema_name,
        obj_description(c.oid) AS table_description,
        (
          SELECT COUNT(*)
          FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.schemaname = n.nspname
        ) AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE
        n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname;
    `;

    const result = await this.pgClient.query(query);

    // Filter out internal tables
    this.tables = result.rows.filter(table => {
      return !CONFIG.skipTables.some(skip => table.table_name.includes(skip));
    });
  }

  async processTable(tableName) {
    this.log(`  📋 Processing ${tableName}...`);

    try {
      const tableInfo = {
        name: tableName,
        columns: await this.queryColumns(tableName),
        constraints: await this.queryConstraints(tableName),
        indexes: await this.queryIndexes(tableName),
        rlsPolicies: await this.queryRLSPolicies(tableName),
        triggers: await this.queryTriggers(tableName),
        foreignKeys: await this.queryForeignKeys(tableName),
        rowCount: await this.queryRowCount(tableName),
        rlsEnabled: await this.isRLSEnabled(tableName)
      };

      const markdown = this.generateTableMarkdown(tableInfo);
      const filePath = path.join(CONFIG.tablesDir, `${tableName}.md`);

      fs.writeFileSync(filePath, markdown);
      this.log(`     ✅ Generated ${tableName}.md`);

    } catch (error) {
      console.error(`     ❌ Error processing ${tableName}:`, error.message);
    }
  }

  async queryColumns(tableName) {
    const query = `
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        c.ordinal_position,
        pg_catalog.col_description(
          (SELECT oid FROM pg_class WHERE relname = c.table_name AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
          c.ordinal_position
        ) AS column_description
      FROM information_schema.columns c
      WHERE c.table_name = $1
        AND c.table_schema = 'public'
      ORDER BY c.ordinal_position;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryConstraints(tableName) {
    const query = `
      SELECT
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        CASE con.contype
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'c' THEN 'CHECK'
          ELSE con.contype::text
        END AS constraint_type_label,
        pg_get_constraintdef(con.oid) AS constraint_definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = $1
        AND nsp.nspname = 'public'
      ORDER BY con.contype, con.conname;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryIndexes(tableName) {
    const query = `
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = $1
        AND schemaname = 'public'
      ORDER BY indexname;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryRLSPolicies(tableName) {
    const query = `
      SELECT
        policyname,
        cmd AS command,
        roles,
        qual AS using_expression,
        with_check AS with_check_expression
      FROM pg_policies
      WHERE tablename = $1
        AND schemaname = 'public'
      ORDER BY policyname;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryTriggers(tableName) {
    const query = `
      SELECT
        trigger_name,
        event_manipulation,
        action_timing,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = $1
        AND event_object_schema = 'public'
      ORDER BY trigger_name;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryForeignKeys(tableName) {
    const query = `
      SELECT
        con.conname AS constraint_name,
        att.attname AS column_name,
        ref_class.relname AS referenced_table,
        ref_att.attname AS referenced_column
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      JOIN pg_class ref_class ON ref_class.oid = con.confrelid
      JOIN pg_attribute ref_att ON ref_att.attrelid = con.confrelid AND ref_att.attnum = ANY(con.confkey)
      WHERE rel.relname = $1
        AND con.contype = 'f'
      ORDER BY con.conname;
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows;
  }

  async queryRowCount(tableName) {
    try {
      const { count, error } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      return error ? 'N/A (RLS restricted)' : count;
    } catch {
      return 'N/A';
    }
  }

  async isRLSEnabled(tableName) {
    const query = `
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = $1
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `;

    const result = await this.pgClient.query(query, [tableName]);
    return result.rows[0]?.relrowsecurity || false;
  }

  generateTableMarkdown(tableInfo) {
    const { name, columns, constraints, indexes, rlsPolicies, triggers, foreignKeys, rowCount, rlsEnabled } = tableInfo;

    let md = `# ${name} Table\n\n`;
    md += `**Application**: ${this.appName} - ${this.appDescription}\n`;
    md += `**Database**: ${this.projectId}\n`;
    md += `**Repository**: ${this.appPath}\n`;
    md += `**Purpose**: ${this.appPurpose}\n`;
    md += `**Generated**: ${this.generatedAt}\n`;
    md += `**Rows**: ${typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount}\n`;
    md += `**RLS**: ${rlsEnabled ? `Enabled (${rlsPolicies.length} ${rlsPolicies.length === 1 ? 'policy' : 'policies'})` : 'Disabled'}\n\n`;
    md += '⚠️ **This is a REFERENCE document** - Query database directly for validation\n\n';
    md += `⚠️ **CRITICAL**: This schema is for **${this.appName}** database. Implementations go in ${this.appPath}\n\n`;
    md += '---\n\n';

    // Columns
    md += `## Columns (${columns.length} total)\n\n`;
    md += '| Column | Type | Nullable | Default | Description |\n';
    md += '|--------|------|----------|---------|-------------|\n';

    for (const col of columns) {
      const type = this.formatDataType(col);
      const nullable = col.is_nullable === 'YES' ? 'YES' : '**NO**';
      const defaultVal = col.column_default ? `\`${col.column_default}\`` : '-';
      const description = col.column_description || '-';

      md += `| ${col.column_name} | ${type} | ${nullable} | ${defaultVal} | ${description} |\n`;
    }

    md += '\n';

    // Constraints
    if (constraints.length > 0) {
      md += '## Constraints\n\n';

      const pkConstraints = constraints.filter(c => c.constraint_type === 'p');
      const fkConstraints = constraints.filter(c => c.constraint_type === 'f');
      const uniqueConstraints = constraints.filter(c => c.constraint_type === 'u');
      const checkConstraints = constraints.filter(c => c.constraint_type === 'c');

      if (pkConstraints.length > 0) {
        md += '### Primary Key\n';
        for (const pk of pkConstraints) {
          md += `- \`${pk.constraint_name}\`: ${pk.constraint_definition}\n`;
        }
        md += '\n';
      }

      if (fkConstraints.length > 0) {
        md += '### Foreign Keys\n';
        for (const fk of fkConstraints) {
          const fkDetails = foreignKeys.find(fkd => fkd.constraint_name === fk.constraint_name);
          if (fkDetails) {
            md += `- \`${fk.constraint_name}\`: ${fkDetails.column_name} → ${fkDetails.referenced_table}(${fkDetails.referenced_column})\n`;
          } else {
            md += `- \`${fk.constraint_name}\`: ${fk.constraint_definition}\n`;
          }
        }
        md += '\n';
      }

      if (uniqueConstraints.length > 0) {
        md += '### Unique Constraints\n';
        for (const uc of uniqueConstraints) {
          md += `- \`${uc.constraint_name}\`: ${uc.constraint_definition}\n`;
        }
        md += '\n';
      }

      if (checkConstraints.length > 0) {
        md += '### Check Constraints\n';
        for (const cc of checkConstraints) {
          md += `- \`${cc.constraint_name}\`: ${cc.constraint_definition}\n`;
        }
        md += '\n';
      }
    }

    // Indexes
    if (indexes.length > 0) {
      md += '## Indexes\n\n';
      for (const idx of indexes) {
        md += `- \`${idx.indexname}\`\n`;
        md += `  \`\`\`sql\n  ${idx.indexdef}\n  \`\`\`\n`;
      }
      md += '\n';
    }

    // RLS Policies
    if (rlsPolicies.length > 0) {
      md += '## RLS Policies\n\n';

      for (let i = 0; i < rlsPolicies.length; i++) {
        const policy = rlsPolicies[i];
        md += `### ${i + 1}. ${policy.policyname} (${policy.command})\n\n`;

        // Roles can be an array or a string depending on PostgreSQL version
        const rolesDisplay = Array.isArray(policy.roles)
          ? policy.roles.join(', ')
          : policy.roles;
        md += `- **Roles**: ${rolesDisplay}\n`;

        if (policy.using_expression) {
          md += `- **Using**: \`${policy.using_expression}\`\n`;
        }

        if (policy.with_check_expression) {
          md += `- **With Check**: \`${policy.with_check_expression}\`\n`;
        }

        md += '\n';
      }
    }

    // Triggers
    if (triggers.length > 0) {
      md += '## Triggers\n\n';

      for (const trigger of triggers) {
        md += `### ${trigger.trigger_name}\n\n`;
        md += `- **Timing**: ${trigger.action_timing} ${trigger.event_manipulation}\n`;
        md += `- **Action**: \`${trigger.action_statement}\`\n\n`;
      }
    }

    // Usage Examples (for key tables)
    if (CONFIG.keyTables.includes(name)) {
      md += '## Usage Examples\n\n';
      md += '_Common query patterns for this table:_\n\n';
      md += this.generateUsageExamples(name);
    }

    // Back to overview
    md += '---\n\n';
    md += '[← Back to Schema Overview](../database-schema-overview.md)\n';

    return md;
  }

  formatDataType(column) {
    let type = column.data_type;

    if (column.character_maximum_length) {
      type += `(${column.character_maximum_length})`;
    } else if (column.numeric_precision && column.numeric_scale) {
      type += `(${column.numeric_precision},${column.numeric_scale})`;
    } else if (column.numeric_precision) {
      type += `(${column.numeric_precision})`;
    }

    return `\`${type}\``;
  }

  generateUsageExamples(tableName) {
    const examples = {
      strategic_directives_v2: `
\`\`\`javascript
// Get active SD by SD ID
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .single();

// Get all SDs in EXEC phase
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('sd_id, title, status, current_phase')
  .eq('current_phase', 'EXEC')
  .order('created_at', { ascending: false });
\`\`\`
`,
      product_requirements_v2: `
\`\`\`javascript
// Get PRD by PRD ID
const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('prd_id', 'PRD-XXX-001')
  .single();

// Get PRD with linked SD
const { data, error } = await supabase
  .from('product_requirements_v2')
  .select(\`
    *,
    strategic_directive:strategic_directives_v2(sd_id, title, status)
  \`)
  .eq('prd_id', 'PRD-XXX-001')
  .single();
\`\`\`
`,
      retrospectives: `
\`\`\`javascript
// Get retrospectives for SD
const { data, error } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .order('created_at', { ascending: false });

// Get high-quality retrospectives (score >= 85)
const { data, error } = await supabase
  .from('retrospectives')
  .select('sd_id, quality_score, key_learnings')
  .gte('quality_score', 85)
  .order('quality_score', { ascending: false });
\`\`\`
`,
      leo_protocols: `
\`\`\`javascript
// Get active protocol
const { data, error } = await supabase
  .from('leo_protocols')
  .select('*')
  .eq('status', 'active')
  .single();
\`\`\`
`,
      leo_sub_agents: `
\`\`\`javascript
// Get all active sub-agents
const { data, error } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('active', true)
  .order('priority', { ascending: false });

// Get sub-agent by code
const { data, error } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('code', 'DATABASE')
  .single();
\`\`\`
`,
      sd_phase_handoffs: `
\`\`\`javascript
// Get handoffs for SD
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .order('created_at', { ascending: false });

// Get specific handoff type
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .eq('handoff_type', 'exec_to_plan')
  .single();
\`\`\`
`
    };

    return examples[tableName] || '_No usage examples available for this table._\n\n';
  }

  async generateOverview() {
    this.log('📄 Generating overview document...');

    let md = '# Database Schema Overview\n\n';
    md += `**Application**: ${this.appName} - ${this.appDescription}\n`;
    md += `**Database**: ${this.projectId}\n`;
    md += `**Repository**: ${this.appPath}\n`;
    md += `**Purpose**: ${this.appPurpose}\n`;
    md += `**Generated**: ${this.generatedAt}\n`;
    md += `**Tables**: ${this.tables.length}\n`;
    md += '**Source**: Supabase PostgreSQL introspection\n\n';
    md += '⚠️ **This is a REFERENCE document** - Query database directly for validation\n\n';
    md += `⚠️ **CRITICAL**: This schema is for **${this.appName}** database. Implementations go in ${this.appPath}\n\n`;
    md += '---\n\n';

    // Table of Contents
    md += '## Table of Contents\n\n';
    md += '- [Quick Reference](#quick-reference)\n';
    md += '- [Tables by Category](#tables-by-category)\n';
    md += '- [RLS Policy Patterns](#rls-policy-patterns)\n';
    md += '- [Foreign Key Relationships](#foreign-key-relationships)\n';
    md += '- [Common Patterns](#common-patterns)\n\n';
    md += '---\n\n';

    // Quick Reference
    md += '## Quick Reference\n\n';
    md += '| Table | Rows | RLS | Policies | Description |\n';
    md += '|-------|------|-----|----------|-------------|\n';

    for (const table of this.tables) {
      const rowCount = await this.queryRowCount(table.table_name);
      const rlsEnabled = table.rls_enabled ? '✅' : '❌';
      const rowCountStr = typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount;
      const detailsLink = `[${table.table_name}](tables/${table.table_name}.md)`;

      md += `| ${detailsLink} | ${rowCountStr} | ${rlsEnabled} | ${table.policy_count || 0} | ${table.table_description || '-'} |\n`;
    }

    md += '\n';

    // Tables by Category
    md += '## Tables by Category\n\n';

    const categories = this.categorizesTables(this.tables);

    for (const [category, tables] of Object.entries(categories)) {
      md += `### ${category} (${tables.length} ${tables.length === 1 ? 'table' : 'tables'})\n\n`;

      for (const table of tables) {
        md += `- [${table.table_name}](tables/${table.table_name}.md)`;
        if (table.table_description) {
          md += ` - ${table.table_description}`;
        }
        md += '\n';
      }

      md += '\n';
    }

    // RLS Policy Patterns
    md += '## RLS Policy Patterns\n\n';
    md += 'Common RLS policy patterns found in this database:\n\n';
    md += '### Pattern 1: Public Read Access\n';
    md += '```sql\n';
    md += 'CREATE POLICY "select_all_policy" ON table_name\n';
    md += 'FOR SELECT TO anon, authenticated\n';
    md += 'USING (true);\n';
    md += '```\n\n';
    md += '### Pattern 2: Authenticated Write\n';
    md += '```sql\n';
    md += 'CREATE POLICY "insert_authenticated_policy" ON table_name\n';
    md += 'FOR INSERT TO authenticated\n';
    md += 'WITH CHECK (auth.uid() IS NOT NULL);\n';
    md += '```\n\n';
    md += '### Pattern 3: Row-Level Security by User\n';
    md += '```sql\n';
    md += 'CREATE POLICY "user_access_policy" ON table_name\n';
    md += 'FOR ALL TO authenticated\n';
    md += 'USING (user_id = auth.uid());\n';
    md += '```\n\n';

    // Foreign Key Relationships
    md += '## Foreign Key Relationships\n\n';
    md += '_Key relationships between tables:_\n\n';

    const relationships = await this.queryAllForeignKeys();
    const groupedRelationships = this.groupForeignKeysByTable(relationships);

    for (const [tableName, fks] of Object.entries(groupedRelationships)) {
      if (fks.length > 0) {
        md += `**${tableName}**:\n`;
        for (const fk of fks) {
          md += `- \`${fk.column_name}\` → \`${fk.referenced_table}.${fk.referenced_column}\`\n`;
        }
        md += '\n';
      }
    }

    // Common Patterns
    md += '## Common Patterns\n\n';
    md += '### Timestamps\n';
    md += 'Most tables include:\n';
    md += '- `created_at` (timestamptz) - Auto-set on insert\n';
    md += '- `updated_at` (timestamptz) - Auto-updated via trigger\n\n';
    md += '### UUID Primary Keys\n';
    md += 'Most tables use `uuid` type with `gen_random_uuid()` default\n\n';
    md += '### JSONB Fields\n';
    md += 'Complex data structures stored as `jsonb` for flexibility:\n';
    md += '- Enables querying with `->`, `->>`, `@>` operators\n';
    md += '- Indexed with GIN indexes for performance\n\n';

    // Footer
    md += '---\n\n';
    md += '*This documentation is auto-generated from the Supabase database.*\n';
    md += '*To regenerate: `npm run schema:docs`*\n';

    const filePath = path.join(CONFIG.outputDir, 'database-schema-overview.md');
    fs.writeFileSync(filePath, md);

    this.log('✅ Generated database-schema-overview.md');
  }

  async generateIndex() {
    this.log('📄 Generating README index...');

    let md = '# Database Schema Documentation\n\n';
    md += `**Application**: ${this.appName} - ${this.appDescription}\n`;
    md += `**Database**: ${this.projectId}\n`;
    md += `**Repository**: ${this.appPath}\n`;
    md += `**Purpose**: ${this.appPurpose}\n`;
    md += `**Generated**: ${this.generatedAt}\n`;
    md += `**Tables**: ${this.tables.length}\n\n`;
    md += `This directory contains comprehensive, auto-generated documentation for all tables in the **${this.appName}** Supabase database.\n\n`;
    md += `⚠️ **CRITICAL**: This schema is for **${this.appName}** database. Implementations go in ${this.appPath}\n\n`;
    md += '---\n\n';

    md += '## Quick Start\n\n';
    md += '- **[Database Schema Overview](database-schema-overview.md)** - Quick reference for all tables (15-20KB)\n';
    md += '- **[Detailed Table Docs](tables/)** - Individual files for each table (2-5KB each)\n\n';
    md += '---\n\n';

    md += `## All Tables (${this.tables.length})\n\n`;

    const categories = this.categorizesTables(this.tables);

    for (const [category, tables] of Object.entries(categories)) {
      md += `### ${category}\n\n`;

      for (const table of tables) {
        md += `- [${table.table_name}](tables/${table.table_name}.md)\n`;
      }

      md += '\n';
    }

    md += '---\n\n';
    md += '## Regenerating Documentation\n\n';
    md += '```bash\n';
    md += '# Generate all documentation\n';
    md += 'npm run schema:docs\n\n';
    md += '# Generate single table\n';
    md += 'npm run schema:docs:table users\n\n';
    md += '# Debug mode\n';
    md += 'npm run schema:docs --verbose\n';
    md += '```\n\n';
    md += 'Documentation is automatically regenerated:\n';
    md += '- After every successful migration (post-migration hook)\n';
    md += '- Weekly via CI/CD (GitHub Actions)\n';
    md += '- Manually via npm scripts\n\n';
    md += '---\n\n';
    md += '*Auto-generated by: `scripts/generate-schema-docs-from-db.js`*\n';

    const filePath = path.join(CONFIG.outputDir, 'README.md');
    fs.writeFileSync(filePath, md);

    this.log('✅ Generated README.md');
  }

  categorizesTables(tables) {
    const categories = {
      'LEO Protocol': [],
      'Strategic Directives': [],
      'Retrospectives': [],
      'Handoffs & Phases': [],
      'Sub-Agents': [],
      'Validation & Quality': [],
      'Knowledge & Learning': [],
      'Other': []
    };

    for (const table of tables) {
      const name = table.table_name;

      if (name.startsWith('leo_')) {
        if (name.includes('sub_agent')) {
          categories['Sub-Agents'].push(table);
        } else if (name.includes('validation')) {
          categories['Validation & Quality'].push(table);
        } else {
          categories['LEO Protocol'].push(table);
        }
      } else if (name.includes('strategic_directive') || name.includes('sd_')) {
        categories['Strategic Directives'].push(table);
      } else if (name.includes('retrospective')) {
        categories['Retrospectives'].push(table);
      } else if (name.includes('handoff') || name.includes('phase')) {
        categories['Handoffs & Phases'].push(table);
      } else if (name.includes('issue_pattern') || name.includes('knowledge')) {
        categories['Knowledge & Learning'].push(table);
      } else {
        categories['Other'].push(table);
      }
    }

    // Remove empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([_, tables]) => tables.length > 0)
    );
  }

  async queryAllForeignKeys() {
    const query = `
      SELECT
        rel.relname AS table_name,
        con.conname AS constraint_name,
        att.attname AS column_name,
        ref_class.relname AS referenced_table,
        ref_att.attname AS referenced_column
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      JOIN pg_class ref_class ON ref_class.oid = con.confrelid
      JOIN pg_attribute ref_att ON ref_att.attrelid = con.confrelid AND ref_att.attnum = ANY(con.confkey)
      WHERE nsp.nspname = 'public'
        AND con.contype = 'f'
      ORDER BY rel.relname, con.conname;
    `;

    const result = await this.pgClient.query(query);
    return result.rows;
  }

  groupForeignKeysByTable(foreignKeys) {
    const grouped = {};

    for (const fk of foreignKeys) {
      if (!grouped[fk.table_name]) {
        grouped[fk.table_name] = [];
      }
      grouped[fk.table_name].push(fk);
    }

    return grouped;
  }

  log(message) {
    if (CONFIG.verbose || !message.startsWith('  ')) {
      console.log(message);
    }
  }
}

// Main execution
const generator = new SchemaDocumentationGenerator();
generator.generate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
