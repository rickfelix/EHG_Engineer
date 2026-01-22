/**
 * Schema Documentation Generator - Table Generator
 * Generates markdown documentation for individual tables
 */

import { CONFIG } from './config.js';

/**
 * Generate markdown documentation for a table
 * @param {Object} tableInfo - Table information object
 * @param {Object} context - Generator context (appName, appDescription, etc.)
 * @returns {string} Markdown content
 */
export function generateTableMarkdown(tableInfo, context) {
  const { name, columns, constraints, indexes, rlsPolicies, triggers, foreignKeys, rowCount, rlsEnabled } = tableInfo;
  const { appName, appDescription, appPath, appPurpose, projectId, generatedAt } = context;

  let md = `# ${name} Table\n\n`;
  md += `**Application**: ${appName} - ${appDescription}\n`;
  md += `**Database**: ${projectId}\n`;
  md += `**Repository**: ${appPath}\n`;
  md += `**Purpose**: ${appPurpose}\n`;
  md += `**Generated**: ${generatedAt}\n`;
  md += `**Rows**: ${typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount}\n`;
  md += `**RLS**: ${rlsEnabled ? `Enabled (${rlsPolicies.length} ${rlsPolicies.length === 1 ? 'policy' : 'policies'})` : 'Disabled'}\n\n`;
  md += '⚠️ **This is a REFERENCE document** - Query database directly for validation\n\n';
  md += `⚠️ **CRITICAL**: This schema is for **${appName}** database. Implementations go in ${appPath}\n\n`;
  md += '---\n\n';

  // Columns section
  md += generateColumnsSection(columns);

  // Constraints section
  md += generateConstraintsSection(constraints, foreignKeys);

  // Indexes section
  md += generateIndexesSection(indexes);

  // RLS Policies section
  md += generateRLSSection(rlsPolicies);

  // Triggers section
  md += generateTriggersSection(triggers);

  // Usage Examples (for key tables)
  if (CONFIG.keyTables.includes(name)) {
    md += '## Usage Examples\n\n';
    md += '_Common query patterns for this table:_\n\n';
    md += generateUsageExamples(name);
  }

  // Back to overview
  md += '---\n\n';
  md += '[← Back to Schema Overview](../database-schema-overview.md)\n';

  return md;
}

/**
 * Generate columns section
 * @param {Array} columns - Column info array
 * @returns {string} Markdown content
 */
function generateColumnsSection(columns) {
  let md = `## Columns (${columns.length} total)\n\n`;
  md += '| Column | Type | Nullable | Default | Description |\n';
  md += '|--------|------|----------|---------|-------------|\n';

  for (const col of columns) {
    const type = formatDataType(col);
    const nullable = col.is_nullable === 'YES' ? 'YES' : '**NO**';
    const defaultVal = col.column_default ? `\`${col.column_default}\`` : '-';
    const description = col.column_description || '-';

    md += `| ${col.column_name} | ${type} | ${nullable} | ${defaultVal} | ${description} |\n`;
  }

  md += '\n';
  return md;
}

/**
 * Generate constraints section
 * @param {Array} constraints - Constraint info array
 * @param {Array} foreignKeys - Foreign key info array
 * @returns {string} Markdown content
 */
function generateConstraintsSection(constraints, foreignKeys) {
  if (constraints.length === 0) return '';

  let md = '## Constraints\n\n';

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

  return md;
}

/**
 * Generate indexes section
 * @param {Array} indexes - Index info array
 * @returns {string} Markdown content
 */
function generateIndexesSection(indexes) {
  if (indexes.length === 0) return '';

  let md = '## Indexes\n\n';
  for (const idx of indexes) {
    md += `- \`${idx.indexname}\`\n`;
    md += `  \`\`\`sql\n  ${idx.indexdef}\n  \`\`\`\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate RLS policies section
 * @param {Array} rlsPolicies - RLS policy info array
 * @returns {string} Markdown content
 */
function generateRLSSection(rlsPolicies) {
  if (rlsPolicies.length === 0) return '';

  let md = '## RLS Policies\n\n';

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

  return md;
}

/**
 * Generate triggers section
 * @param {Array} triggers - Trigger info array
 * @returns {string} Markdown content
 */
function generateTriggersSection(triggers) {
  if (triggers.length === 0) return '';

  let md = '## Triggers\n\n';

  for (const trigger of triggers) {
    md += `### ${trigger.trigger_name}\n\n`;
    md += `- **Timing**: ${trigger.action_timing} ${trigger.event_manipulation}\n`;
    md += `- **Action**: \`${trigger.action_statement}\`\n\n`;
  }

  return md;
}

/**
 * Format data type for display
 * @param {Object} column - Column info
 * @returns {string} Formatted type string
 */
export function formatDataType(column) {
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

/**
 * Generate usage examples for key tables
 * @param {string} tableName - Table name
 * @returns {string} Usage examples markdown
 */
export function generateUsageExamples(tableName) {
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
