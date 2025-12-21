#!/usr/bin/env node

/**
 * Scan CrewAI Python Platform - Crew and Agent Inventory
 * For: SD-CREWAI-ARCHITECTURE-001 Phase 1 Discovery
 * Purpose: Generate CSV inventories of all Python crews and agents
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const AGENT_PLATFORM_PATH = '/mnt/c/_EHG/EHG/agent-platform';
const OUTPUT_DIR = '/mnt/c/_EHG/EHG_Engineer/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/discovery/artifacts';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🔍 Scanning CrewAI Python Platform...\n');

// ============================================
// 1. SCAN CREWS
// ============================================

console.log('📋 Scanning crews...');
const crewFiles = execSync(
  `find ${AGENT_PLATFORM_PATH}/app/crews -name "*.py" -type f ! -name "__*" | sort`,
  { encoding: 'utf-8' }
).trim().split('\n').filter(Boolean);

const crewInventory = [];

crewFiles.forEach((filePath, index) => {
  const fileName = path.basename(filePath, '.py');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract class name (e.g., "class BoardDirectorsCrew")
  const classMatch = content.match(/class\s+(\w+Crew)\s*[\(:]?/);
  const className = classMatch ? classMatch[1] : 'N/A';

  // Count number of agents in crew (look for agent assignments)
  const agentMatches = content.match(/self\.\w+_agent\s*=/g) || [];
  const agentCount = agentMatches.length;

  // Extract docstring
  const docstringMatch = content.match(/class\s+\w+Crew[^:]*:\s*"""([^"]+)"""/);
  const description = docstringMatch ? docstringMatch[1].trim().replace(/\n/g, ' ') : '';

  // Get line count
  const lineCount = content.split('\n').length;

  // Check if registered in database (we'll mark as NO for now, cross-reference later)
  const inDatabase = 'NO';

  crewInventory.push({
    index: index + 1,
    file_name: fileName,
    file_path: filePath.replace('/mnt/c/_EHG/EHG/', ''),
    class_name: className,
    agent_count: agentCount,
    line_count: lineCount,
    in_database: inDatabase,
    description: description.substring(0, 100) // Truncate for CSV
  });
});

console.log(`   Found ${crewInventory.length} crews\n`);

// ============================================
// 2. SCAN AGENTS
// ============================================

console.log('👤 Scanning agents...');
const agentFiles = execSync(
  `find ${AGENT_PLATFORM_PATH}/app/agents -name "*.py" -type f ! -name "__*" | sort`,
  { encoding: 'utf-8' }
).trim().split('\n').filter(Boolean);

const agentInventory = [];

agentFiles.forEach((filePath, index) => {
  const fileName = path.basename(filePath, '.py');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract class name (e.g., "class CEOAgent" or "BaseAgent")
  const classMatch = content.match(/class\s+(\w+Agent)\s*[\(:]?/);
  const className = classMatch ? classMatch[1] : 'N/A';

  // Extract role (look for @agent decorator or self.role)
  const roleMatch = content.match(/role\s*=\s*["']([^"']+)["']/);
  const role = roleMatch ? roleMatch[1] : '';

  // Extract goal
  const goalMatch = content.match(/goal\s*=\s*["']([^"']+)["']/);
  const goal = goalMatch ? goalMatch[1].substring(0, 100) : '';

  // Extract docstring
  const docstringMatch = content.match(/class\s+\w+Agent[^:]*:\s*"""([^"]+)"""/);
  const description = docstringMatch ? docstringMatch[1].trim().replace(/\n/g, ' ') : '';

  // Determine category from file path
  const pathParts = filePath.split('/');
  const category = pathParts.includes('advertising') ? 'advertising' :
                   pathParts.includes('branding') ? 'branding' :
                   pathParts.includes('customer_success') ? 'customer_success' :
                   pathParts.includes('finance') ? 'finance' :
                   pathParts.includes('investor_relations') ? 'investor_relations' :
                   pathParts.includes('legal') ? 'legal' :
                   pathParts.includes('marketing') ? 'marketing' :
                   pathParts.includes('product') ? 'product' :
                   pathParts.includes('rd') ? 'rd' :
                   pathParts.includes('sales') ? 'sales' :
                   'core';

  // Get line count
  const lineCount = content.split('\n').length;

  // Check if registered in database (we'll mark as NO for now)
  const inDatabase = 'NO';

  agentInventory.push({
    index: index + 1,
    file_name: fileName,
    file_path: filePath.replace('/mnt/c/_EHG/EHG/', ''),
    class_name: className,
    category: category,
    role: role,
    goal: goal,
    line_count: lineCount,
    in_database: inDatabase,
    description: description.substring(0, 100)
  });
});

console.log(`   Found ${agentInventory.length} agents\n`);

// ============================================
// 3. GENERATE CSV FILES
// ============================================

console.log('💾 Generating CSV files...\n');

// Crew CSV
const crewCsvPath = path.join(OUTPUT_DIR, 'crew_inventory_python.csv');
const crewCsvHeader = 'Index,File Name,File Path,Class Name,Agent Count,Line Count,In Database,Description\n';
const crewCsvRows = crewInventory.map(crew =>
  `${crew.index},"${crew.file_name}","${crew.file_path}","${crew.class_name}",${crew.agent_count},${crew.line_count},${crew.in_database},"${crew.description}"`
).join('\n');
fs.writeFileSync(crewCsvPath, crewCsvHeader + crewCsvRows);
console.log(`✅ Crew inventory: ${crewCsvPath}`);

// Agent CSV
const agentCsvPath = path.join(OUTPUT_DIR, 'agent_inventory_python.csv');
const agentCsvHeader = 'Index,File Name,File Path,Class Name,Category,Role,Goal,Line Count,In Database,Description\n';
const agentCsvRows = agentInventory.map(agent =>
  `${agent.index},"${agent.file_name}","${agent.file_path}","${agent.class_name}","${agent.category}","${agent.role}","${agent.goal}",${agent.line_count},${agent.in_database},"${agent.description}"`
).join('\n');
fs.writeFileSync(agentCsvPath, agentCsvHeader + agentCsvRows);
console.log(`✅ Agent inventory: ${agentCsvPath}`);

// ============================================
// 4. GENERATE SUMMARY STATISTICS
// ============================================

console.log('\n📊 Summary Statistics:\n');
console.log(`   Total Crews:  ${crewInventory.length}`);
console.log(`   Total Agents: ${agentInventory.length}`);
console.log(`   Total LOC (Crews): ${crewInventory.reduce((sum, c) => sum + c.line_count, 0)}`);
console.log(`   Total LOC (Agents): ${agentInventory.reduce((sum, a) => sum + a.line_count, 0)}`);

const categoryBreakdown = agentInventory.reduce((acc, agent) => {
  acc[agent.category] = (acc[agent.category] || 0) + 1;
  return acc;
}, {});

console.log('\n   Agents by Category:');
Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`      ${cat}: ${count}`);
});

// ============================================
// 5. GENERATE MARKDOWN SUMMARY
// ============================================

const summaryMd = `# Python Platform Inventory — CrewAI

**Generated**: ${new Date().toISOString().split('T')[0]}
**For**: SD-CREWAI-ARCHITECTURE-001 Phase 1 Discovery

---

## Summary Statistics

| Metric | Count | Total LOC |
|--------|-------|-----------|
| **Crews** | ${crewInventory.length} | ${crewInventory.reduce((sum, c) => sum + c.line_count, 0)} |
| **Agents** | ${agentInventory.length} | ${agentInventory.reduce((sum, a) => sum + a.line_count, 0)} |

---

## Crews Inventory

${crewInventory.map(c => `- **${c.class_name}** (\`${c.file_name}.py\`) — ${c.agent_count} agents, ${c.line_count} LOC`).join('\n')}

---

## Agents by Category

${Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `- **${cat}**: ${count} agents`).join('\n')}

---

## Files Generated

1. \`crew_inventory_python.csv\` — Complete crew inventory (${crewInventory.length} rows)
2. \`agent_inventory_python.csv\` — Complete agent inventory (${agentInventory.length} rows)

---

<!-- Python Platform Inventory | SD-CREWAI-ARCHITECTURE-001 | ${new Date().toISOString().split('T')[0]} -->
`;

const summaryMdPath = path.join(OUTPUT_DIR, 'python_platform_summary.md');
fs.writeFileSync(summaryMdPath, summaryMd);
console.log(`\n✅ Summary: ${summaryMdPath}\n`);

console.log('✨ Scan complete!\n');
