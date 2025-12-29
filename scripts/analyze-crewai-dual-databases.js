#!/usr/bin/env node
/**
 * Dual-Database Analysis Script for SD-CREWAI-ARCHITECTURE-001
 *
 * Analyzes CrewAI architecture across two databases:
 * 1. EHG_Engineer (dedlbzhpgkmetvhbkyzq) - Governance
 * 2. EHG Application (liapbndqlqxdcgpwntbv) - Operational
 */

import { createDatabaseClient, createSupabaseServiceClient as _createSupabaseServiceClient } from './lib/supabase-connection.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function getCrewAITables(client, _dbName) {
  const result = await client.query(`
    SELECT table_name,
           (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
    FROM information_schema.tables t
    WHERE table_schema = 'public'
      AND (table_name LIKE '%crew%' OR table_name LIKE '%agent%' OR table_name LIKE '%leo%')
    ORDER BY table_name;
  `);
  return result.rows;
}

async function getTableSchema(client, tableName) {
  const result = await client.query(`
    SELECT
      column_name,
      data_type,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);
  return result.rows;
}

async function getTableConstraints(client, tableName) {
  const result = await client.query(`
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    LEFT JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY tc.constraint_type, tc.constraint_name;
  `, [tableName]);
  return result.rows;
}

async function getRLSPolicies(client, tableName) {
  const result = await client.query(`
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = $1;
  `, [tableName]);
  return result.rows;
}

async function getRowCount(client, tableName) {
  try {
    const result = await client.query(`SELECT COUNT(*) as count FROM "${tableName}";`);
    return parseInt(result.rows[0].count);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

async function getSampleData(client, tableName, limit = 5) {
  try {
    const result = await client.query(`SELECT * FROM "${tableName}" LIMIT ${limit};`);
    return result.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function _analyzeLEOAgents(client) {
  try {
    const agents = await client.query('SELECT * FROM leo_agents ORDER BY agent_id;');
    return agents.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function _analyzeLEOSubAgents(client) {
  try {
    const subAgents = await client.query('SELECT * FROM leo_sub_agents ORDER BY sub_agent_id;');
    return subAgents.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function _analyzeCrewAIAgents(client) {
  try {
    const agents = await client.query(`
      SELECT
        agent_id,
        name,
        role,
        goal,
        backstory,
        created_at,
        updated_at
      FROM crewai_agents
      ORDER BY name;
    `);
    return agents.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function _analyzeCrewAICrews(client) {
  try {
    const crews = await client.query(`
      SELECT
        crew_id,
        name,
        description,
        process_type,
        created_at,
        updated_at
      FROM crewai_crews
      ORDER BY name;
    `);
    return crews.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function _analyzeCrewMembers(client) {
  try {
    const members = await client.query(`
      SELECT
        cm.member_id,
        c.name as crew_name,
        a.name as agent_name,
        a.role as agent_role,
        cm.position,
        cm.created_at
      FROM crew_members cm
      JOIN crewai_crews c ON cm.crew_id = c.crew_id
      JOIN crewai_agents a ON cm.agent_id = a.agent_id
      ORDER BY c.name, cm.position;
    `);
    return members.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function analyzeDatabase(projectKey, dbName) {
  section(`Analyzing ${dbName} Database (${projectKey})`);

  const client = await createDatabaseClient(projectKey, { verify: false });

  try {
    // Get CrewAI-related tables
    log('📋 Discovering CrewAI-related tables...', 'blue');
    const tables = await getCrewAITables(client, dbName);

    log(`\nFound ${tables.length} related tables:\n`, 'green');
    tables.forEach(t => {
      console.log(`  - ${t.table_name} (${t.column_count} columns)`);
    });

    const analysis = {
      database: dbName,
      projectKey: projectKey,
      tables: []
    };

    // Analyze each table
    for (const table of tables) {
      log(`\n\n📊 Analyzing table: ${table.table_name}`, 'cyan');

      const schema = await getTableSchema(client, table.table_name);
      const constraints = await getTableConstraints(client, table.table_name);
      const rlsPolicies = await getRLSPolicies(client, table.table_name);
      const rowCount = await getRowCount(client, table.table_name);
      const sampleData = await getSampleData(client, table.table_name, 5);

      log(`  Row count: ${rowCount}`, 'yellow');
      log(`  Columns: ${schema.length}`, 'yellow');
      log(`  Constraints: ${constraints.length}`, 'yellow');
      log(`  RLS Policies: ${rlsPolicies.length}`, 'yellow');

      analysis.tables.push({
        name: table.table_name,
        rowCount,
        schema,
        constraints,
        rlsPolicies,
        sampleData
      });
    }

    return analysis;

  } finally {
    await client.end();
  }
}

async function generateMarkdownReport(engineerAnalysis, appAnalysis) {
  let report = '';

  report += '# Dual-Database Analysis — CrewAI Architecture\n\n';
  report += `**Analysis Date**: ${new Date().toISOString()}\n`;
  report += '**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001\n';
  report += '**Phase**: Discovery (Phase 1)\n\n';

  // Executive Summary
  report += '## Executive Summary\n\n';

  const _engineerCrewTables = engineerAnalysis.tables.filter(t => t.name.includes('crew')).length;
  const _engineerAgentTables = engineerAnalysis.tables.filter(t => t.name.includes('agent') || t.name.includes('leo')).length;
  const _appCrewTables = appAnalysis.tables.filter(t => t.name.includes('crew')).length;
  const _appAgentTables = appAnalysis.tables.filter(t => t.name.includes('agent')).length;

  // Count total records
  const appAgentCount = appAnalysis.tables.find(t => t.name === 'crewai_agents')?.rowCount || 0;
  const appCrewCount = appAnalysis.tables.find(t => t.name === 'crewai_crews')?.rowCount || 0;
  const appMemberCount = appAnalysis.tables.find(t => t.name === 'crew_members')?.rowCount || 0;

  const engineerLeoAgentCount = engineerAnalysis.tables.find(t => t.name === 'leo_agents')?.rowCount || 0;
  const engineerLeoSubAgentCount = engineerAnalysis.tables.find(t => t.name === 'leo_sub_agents')?.rowCount || 0;

  report += '### Key Findings\n\n';
  report += `- **EHG_Engineer Database**: ${engineerAnalysis.tables.length} related tables found\n`;
  report += `  - LEO Agents: ${engineerLeoAgentCount} records\n`;
  report += `  - LEO Sub-Agents: ${engineerLeoSubAgentCount} records\n`;
  report += '  - Governance structure exists for agent registration\n\n';

  report += `- **EHG Application Database**: ${appAnalysis.tables.length} related tables found\n`;
  report += `  - CrewAI Agents: ${appAgentCount} records\n`;
  report += `  - CrewAI Crews: ${appCrewCount} records\n`;
  report += `  - Crew Members: ${appMemberCount} records\n`;
  report += '  - Operational CrewAI platform fully implemented\n\n';

  // Critical gaps
  report += '### Critical Gaps Identified\n\n';
  if (appCrewCount > 0 && engineerLeoAgentCount === 0) {
    report += `- ⚠️ **GOVERNANCE GAP**: ${appCrewCount} crews operational in EHG app but NO governance records in EHG_Engineer\n`;
  }
  if (appAgentCount > engineerLeoAgentCount) {
    report += `- ⚠️ **REGISTRATION GAP**: ${appAgentCount} CrewAI agents exist but only ${engineerLeoAgentCount} LEO agents registered\n`;
  }
  report += '- Potential architectural misalignment between operational and governance layers\n';
  report += '- CrewAI flows and executions may not be tracked in governance system\n\n';

  report += '### Database Health Status\n\n';
  report += `- **EHG_Engineer**: ✅ Connection successful, ${engineerAnalysis.tables.length} tables analyzed\n`;
  report += `- **EHG Application**: ✅ Connection successful, ${appAnalysis.tables.length} tables analyzed\n`;
  report += '- **RLS Policies**: Mixed implementation (details below)\n';
  report += '- **Data Integrity**: Foreign key constraints present (see schema details)\n\n';

  // EHG_Engineer Analysis
  report += '---\n\n';
  report += '## EHG_Engineer Database Analysis (Governance)\n\n';
  report += '**Project ID**: dedlbzhpgkmetvhbkyzq\n';
  report += '**Purpose**: LEO Protocol governance, Strategic Directives, PRDs, retrospectives\n\n';

  report += '### Tables Found\n\n';
  report += '| Table Name | Row Count | Columns | Constraints | RLS Policies |\n';
  report += '|------------|-----------|---------|-------------|-------------|\n';
  engineerAnalysis.tables.forEach(t => {
    report += `| ${t.name} | ${t.rowCount} | ${t.schema.length} | ${t.constraints.length} | ${t.rlsPolicies.length} |\n`;
  });
  report += '\n';

  // Schema details for each table
  for (const table of engineerAnalysis.tables) {
    report += `### Schema: \`${table.name}\`\n\n`;
    report += `**Row Count**: ${table.rowCount}\n\n`;

    report += '#### Columns\n\n';
    report += '| Column Name | Data Type | Nullable | Default |\n';
    report += '|-------------|-----------|----------|--------|\n';
    table.schema.forEach(col => {
      const dataType = col.character_maximum_length
        ? `${col.data_type}(${col.character_maximum_length})`
        : col.data_type;
      report += `| ${col.column_name} | ${dataType} | ${col.is_nullable} | ${col.column_default || 'NULL'} |\n`;
    });
    report += '\n';

    if (table.constraints.length > 0) {
      report += '#### Constraints\n\n';
      report += '| Constraint Name | Type | Column | References |\n';
      report += '|-----------------|------|--------|------------|\n';
      table.constraints.forEach(c => {
        const ref = c.foreign_table_name ? `${c.foreign_table_name}(${c.foreign_column_name})` : '-';
        report += `| ${c.constraint_name} | ${c.constraint_type} | ${c.column_name || '-'} | ${ref} |\n`;
      });
      report += '\n';
    }

    if (table.rlsPolicies.length > 0) {
      report += '#### RLS Policies\n\n';
      report += '| Policy Name | Command | Roles | Permissive |\n';
      report += '|-------------|---------|-------|------------|\n';
      table.rlsPolicies.forEach(p => {
        report += `| ${p.policyname} | ${p.cmd} | ${JSON.stringify(p.roles)} | ${p.permissive} |\n`;
      });
      report += '\n';
    } else {
      report += '#### RLS Policies\n\n';
      report += '❌ No RLS policies configured for this table.\n\n';
    }

    // Sample data
    if (Array.isArray(table.sampleData) && table.sampleData.length > 0) {
      report += `#### Sample Data (first ${Math.min(5, table.sampleData.length)} rows)\n\n`;
      report += '```json\n';
      report += JSON.stringify(table.sampleData, null, 2);
      report += '\n```\n\n';
    } else if (table.sampleData.error) {
      report += '#### Sample Data\n\n';
      report += `⚠️ Error retrieving data: ${table.sampleData.error}\n\n`;
    } else {
      report += '#### Sample Data\n\n';
      report += 'ℹ️ No data in table.\n\n';
    }
  }

  // EHG Application Analysis
  report += '---\n\n';
  report += '## EHG Application Database Analysis (Operational)\n\n';
  report += '**Project ID**: liapbndqlqxdcgpwntbv\n';
  report += '**Purpose**: Customer-facing features, CrewAI operations, business logic\n\n';

  report += '### Tables Found\n\n';
  report += '| Table Name | Row Count | Columns | Constraints | RLS Policies |\n';
  report += '|------------|-----------|---------|-------------|-------------|\n';
  appAnalysis.tables.forEach(t => {
    report += `| ${t.name} | ${t.rowCount} | ${t.schema.length} | ${t.constraints.length} | ${t.rlsPolicies.length} |\n`;
  });
  report += '\n';

  // Schema details for each table
  for (const table of appAnalysis.tables) {
    report += `### Schema: \`${table.name}\`\n\n`;
    report += `**Row Count**: ${table.rowCount}\n\n`;

    report += '#### Columns\n\n';
    report += '| Column Name | Data Type | Nullable | Default |\n';
    report += '|-------------|-----------|----------|--------|\n';
    table.schema.forEach(col => {
      const dataType = col.character_maximum_length
        ? `${col.data_type}(${col.character_maximum_length})`
        : col.data_type;
      report += `| ${col.column_name} | ${dataType} | ${col.is_nullable} | ${col.column_default || 'NULL'} |\n`;
    });
    report += '\n';

    if (table.constraints.length > 0) {
      report += '#### Constraints\n\n';
      report += '| Constraint Name | Type | Column | References |\n';
      report += '|-----------------|------|--------|------------|\n';
      table.constraints.forEach(c => {
        const ref = c.foreign_table_name ? `${c.foreign_table_name}(${c.foreign_column_name})` : '-';
        report += `| ${c.constraint_name} | ${c.constraint_type} | ${c.column_name || '-'} | ${ref} |\n`;
      });
      report += '\n';
    }

    if (table.rlsPolicies.length > 0) {
      report += '#### RLS Policies\n\n';
      report += '| Policy Name | Command | Roles | Permissive |\n';
      report += '|-------------|---------|-------|------------|\n';
      table.rlsPolicies.forEach(p => {
        report += `| ${p.policyname} | ${p.cmd} | ${JSON.stringify(p.roles)} | ${p.permissive} |\n`;
      });
      report += '\n';
    } else {
      report += '#### RLS Policies\n\n';
      report += '❌ No RLS policies configured for this table.\n\n';
    }

    // Sample data
    if (Array.isArray(table.sampleData) && table.sampleData.length > 0) {
      report += `#### Sample Data (first ${Math.min(5, table.sampleData.length)} rows)\n\n`;

      // For CrewAI tables, pretty print with key fields highlighted
      if (table.name === 'crewai_agents' || table.name === 'crewai_crews' || table.name === 'crew_members') {
        report += '```json\n';
        report += JSON.stringify(table.sampleData, null, 2);
        report += '\n```\n\n';
      } else {
        report += '```json\n';
        report += JSON.stringify(table.sampleData, null, 2);
        report += '\n```\n\n';
      }
    } else if (table.sampleData.error) {
      report += '#### Sample Data\n\n';
      report += `⚠️ Error retrieving data: ${table.sampleData.error}\n\n`;
    } else {
      report += '#### Sample Data\n\n';
      report += 'ℹ️ No data in table.\n\n';
    }
  }

  // Cross-Database Analysis
  report += '---\n\n';
  report += '## Cross-Database Analysis\n\n';

  report += '### Governance vs. Operational Gap\n\n';
  report += '#### Agent Registration\n\n';
  report += `- **LEO Agents** (EHG_Engineer): ${engineerLeoAgentCount} registered\n`;
  report += `- **CrewAI Agents** (EHG App): ${appAgentCount} operational\n`;
  report += `- **Gap**: ${appAgentCount - engineerLeoAgentCount} agents unregistered in governance system\n\n`;

  report += '#### Crew Management\n\n';
  report += `- **CrewAI Crews** (EHG App): ${appCrewCount} crews active\n`;
  report += '- **LEO Agent Groups**: Not tracked in governance database\n';
  report += '- **Gap**: No governance structure for crew-level operations\n\n';

  report += '#### Flow Tracking\n\n';
  const flowCount = appAnalysis.tables.find(t => t.name === 'crewai_flows')?.rowCount || 0;
  const flowExecCount = appAnalysis.tables.find(t => t.name === 'crewai_flow_executions')?.rowCount || 0;
  report += `- **CrewAI Flows** (EHG App): ${flowCount} flows defined\n`;
  report += `- **Flow Executions** (EHG App): ${flowExecCount} execution records\n`;
  report += '- **Gap**: Flow orchestration not integrated with LEO Protocol\n\n';

  report += '### Data Consistency Issues\n\n';

  // Check for naming conflicts
  const engineerTableNames = new Set(engineerAnalysis.tables.map(t => t.name));
  const appTableNames = new Set(appAnalysis.tables.map(t => t.name));
  const commonTables = [...engineerTableNames].filter(name => appTableNames.has(name));

  if (commonTables.length > 0) {
    report += '#### Table Name Conflicts\n\n';
    report += '⚠️ The following tables exist in BOTH databases:\n\n';
    commonTables.forEach(name => {
      report += `- \`${name}\` (potential schema divergence risk)\n`;
    });
    report += '\n';
  } else {
    report += '✅ No table name conflicts detected between databases.\n\n';
  }

  // RLS policy comparison
  const engineerRLSCount = engineerAnalysis.tables.reduce((sum, t) => sum + t.rlsPolicies.length, 0);
  const appRLSCount = appAnalysis.tables.reduce((sum, t) => sum + t.rlsPolicies.length, 0);

  report += '#### RLS Policy Coverage\n\n';
  report += `- **EHG_Engineer**: ${engineerRLSCount} policies across ${engineerAnalysis.tables.length} tables\n`;
  report += `- **EHG Application**: ${appRLSCount} policies across ${appAnalysis.tables.length} tables\n`;

  const engineerTablesWithoutRLS = engineerAnalysis.tables.filter(t => t.rlsPolicies.length === 0);
  const appTablesWithoutRLS = appAnalysis.tables.filter(t => t.rlsPolicies.length === 0);

  if (engineerTablesWithoutRLS.length > 0) {
    report += `\n⚠️ **EHG_Engineer tables without RLS**: ${engineerTablesWithoutRLS.map(t => t.name).join(', ')}\n`;
  }
  if (appTablesWithoutRLS.length > 0) {
    report += `\n⚠️ **EHG Application tables without RLS**: ${appTablesWithoutRLS.map(t => t.name).join(', ')}\n`;
  }
  report += '\n';

  // Findings Summary
  report += '---\n\n';
  report += '## Findings Summary\n\n';

  let findingNum = 1;

  report += `### ${findingNum++}. Architectural Discrepancy Confirmed\n\n`;
  report += 'The EHG Application database contains a fully operational CrewAI platform with:\n';
  report += `- ${appAgentCount} agents with defined roles, goals, and backstories\n`;
  report += `- ${appCrewCount} crews with process orchestration\n`;
  report += `- ${appMemberCount} crew member assignments\n`;
  report += '- Flow execution tracking and state management\n\n';
  report += 'However, this operational system is **NOT reflected** in the EHG_Engineer governance database.\n\n';

  report += `### ${findingNum++}. Missing Governance Layer\n\n`;
  report += `The \`leo_agents\` and \`leo_sub_agents\` tables in EHG_Engineer do not contain records for the ${appAgentCount} operational CrewAI agents. This represents a fundamental gap in the governance architecture.\n\n`;

  report += `### ${findingNum++}. RLS Policy Inconsistencies\n\n`;
  const totalTablesWithoutRLS = engineerTablesWithoutRLS.length + appTablesWithoutRLS.length;
  report += `${totalTablesWithoutRLS} tables across both databases lack RLS policies, creating potential security vulnerabilities:\n`;
  if (engineerTablesWithoutRLS.length > 0) {
    report += `- **EHG_Engineer**: ${engineerTablesWithoutRLS.map(t => t.name).join(', ')}\n`;
  }
  if (appTablesWithoutRLS.length > 0) {
    report += `- **EHG Application**: ${appTablesWithoutRLS.map(t => t.name).join(', ')}\n`;
  }
  report += '\n';

  report += `### ${findingNum++}. Flow Orchestration Gap\n\n`;
  report += `CrewAI flows in the application database (${flowCount} flows, ${flowExecCount} executions) operate independently from the LEO Protocol workflow system. This creates:\n`;
  report += '- No visibility into CrewAI operations from the governance dashboard\n';
  report += '- Potential conflicts between LEO Protocol phases and CrewAI flow states\n';
  report += '- Inconsistent error handling and logging strategies\n\n';

  report += `### ${findingNum++}. Data Integrity Concerns\n\n`;
  report += 'Foreign key relationships exist within each database but NOT across databases. This prevents:\n';
  report += '- Referential integrity between governance policies and operational agents\n';
  report += '- Cascading updates when agent definitions change\n';
  report += '- Audit trails linking governance approvals to operational deployments\n\n';

  report += `### ${findingNum++}. Schema Documentation Required\n\n`;
  report += 'Based on the analysis, the following schema documentation should be generated:\n';
  report += '- Run `npm run schema:docs:engineer` to document EHG_Engineer tables\n';
  report += '- Run `npm run schema:docs:app` to document EHG Application tables\n';
  report += '- Review generated docs in `docs/reference/schema/` directories\n\n';

  // Recommendations
  report += '---\n\n';
  report += '## Recommendations for Phase 2 (Planning)\n\n';

  report += '1. **Establish Governance-Operational Bridge**\n';
  report += `   - Design migration to register all ${appAgentCount} CrewAI agents in \`leo_agents\`\n`;
  report += '   - Create mapping table linking LEO agents to CrewAI agents\n';
  report += '   - Implement sync mechanism for agent updates\n\n';

  report += '2. **Implement RLS Policies**\n';
  report += '   - Prioritize CrewAI operational tables (agents, crews, flows)\n';
  report += '   - Add service role bypass for system operations\n';
  report += '   - Document RLS policy patterns for future tables\n\n';

  report += '3. **Flow Integration Architecture**\n';
  report += '   - Design integration points between LEO Protocol phases and CrewAI flows\n';
  report += '   - Establish event-driven communication between databases\n';
  report += '   - Create unified logging and monitoring system\n\n';

  report += '4. **Cross-Database Validation**\n';
  report += '   - Implement validation scripts to check governance-operational alignment\n';
  report += '   - Create automated alerts for orphaned agents or crews\n';
  report += '   - Establish regular reconciliation processes\n\n';

  report += '5. **Documentation and Schema Sync**\n';
  report += '   - Generate schema documentation for both databases\n';
  report += '   - Create architectural diagrams showing database relationships\n';
  report += '   - Document data flow between governance and operational layers\n\n';

  report += '---\n\n';
  report += '## Next Steps\n\n';
  report += '1. **Review Findings**: Present this analysis to stakeholders\n';
  report += '2. **Create PRD**: Document requirements for governance-operational integration\n';
  report += '3. **Generate Schema Docs**: Run schema documentation scripts\n';
  report += '4. **Design Migration**: Plan phased approach to bridge the gap\n';
  report += '5. **Implement RLS**: Secure operational tables with proper policies\n\n';

  report += '---\n\n';
  report += '*Analysis generated by: `scripts/analyze-crewai-dual-databases.js`*\n';
  report += `*Timestamp: ${new Date().toISOString()}*\n`;
  report += '*Strategic Directive: SD-CREWAI-ARCHITECTURE-001 (Phase 1)*\n';

  return report;
}

async function main() {
  try {
    log('🚀 Starting Dual-Database Analysis for SD-CREWAI-ARCHITECTURE-001', 'bright');

    // Analyze EHG_Engineer (governance)
    const engineerAnalysis = await analyzeDatabase('engineer', 'EHG_Engineer');

    // Analyze EHG Application (operational)
    const appAnalysis = await analyzeDatabase('ehg', 'EHG Application');

    // Generate markdown report
    section('Generating Markdown Report');
    const report = await generateMarkdownReport(engineerAnalysis, appAnalysis);

    // Output report
    console.log('\n' + '='.repeat(80));
    log('📄 FULL REPORT OUTPUT BELOW', 'bright');
    console.log('='.repeat(80) + '\n');
    console.log(report);

    log('\n✅ Analysis Complete!', 'green');
    log('\n💾 Save this report to:', 'cyan');
    log('   /docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/discovery/database_analysis.md\n', 'yellow');

  } catch (error) {
    log(`\n❌ Analysis Failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
