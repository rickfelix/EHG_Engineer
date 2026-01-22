/**
 * Schema Documentation Generator - Overview Generator
 * Generates the database schema overview document
 */

import { queryRowCount, queryAllForeignKeys } from './queries.js';
import { groupForeignKeysByTable } from './utils.js';

/**
 * Generate the overview document
 * @param {Array} tables - Array of table info
 * @param {Object} context - Generator context
 * @param {Client} pgClient - PostgreSQL client
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Promise<string>} Markdown content
 */
export async function generateOverview(tables, context, pgClient, supabase) {
  const { appName, appDescription, appPath, appPurpose, projectId, generatedAt } = context;

  let md = '# Database Schema Overview\n\n';
  md += `**Application**: ${appName} - ${appDescription}\n`;
  md += `**Database**: ${projectId}\n`;
  md += `**Repository**: ${appPath}\n`;
  md += `**Purpose**: ${appPurpose}\n`;
  md += `**Generated**: ${generatedAt}\n`;
  md += `**Tables**: ${tables.length}\n`;
  md += '**Source**: Supabase PostgreSQL introspection\n\n';
  md += '⚠️ **This is a REFERENCE document** - Query database directly for validation\n\n';
  md += `⚠️ **CRITICAL**: This schema is for **${appName}** database. Implementations go in ${appPath}\n\n`;
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

  for (const table of tables) {
    const rowCount = await queryRowCount(supabase, table.table_name);
    const rlsEnabled = table.rls_enabled ? '✅' : '❌';
    const rowCountStr = typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount;
    const detailsLink = `[${table.table_name}](tables/${table.table_name}.md)`;

    md += `| ${detailsLink} | ${rowCountStr} | ${rlsEnabled} | ${table.policy_count || 0} | ${table.table_description || '-'} |\n`;
  }

  md += '\n';

  // Tables by Category
  md += '## Tables by Category\n\n';

  const categories = categorizeTables(tables);

  for (const [category, categoryTables] of Object.entries(categories)) {
    md += `### ${category} (${categoryTables.length} ${categoryTables.length === 1 ? 'table' : 'tables'})\n\n`;

    for (const table of categoryTables) {
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

  const relationships = await queryAllForeignKeys(pgClient);
  const groupedRelationships = groupForeignKeysByTable(relationships);

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

  return md;
}

/**
 * Categorize tables by their naming patterns
 * @param {Array} tables - Array of table info
 * @returns {Object} Categories with their tables
 */
export function categorizeTables(tables) {
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
    Object.entries(categories).filter(([_, categoryTables]) => categoryTables.length > 0)
  );
}
