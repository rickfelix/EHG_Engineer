#!/usr/bin/env node
/**
 * Agent Registry CLI
 *
 * Quick command-line interface for agent discovery
 *
 * Usage:
 *   node lib/agents/registry-cli.cjs list              # List all agents
 *   node lib/agents/registry-cli.cjs get VALIDATION    # Get specific agent
 *   node lib/agents/registry-cli.cjs search security   # Search by keyword
 *   node lib/agents/registry-cli.cjs stats             # Show statistics
 *   node lib/agents/registry-cli.cjs validate GITHUB   # Validate agent
 */

const { initializeRegistry } = require('./registry.cjs');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    const registry = await initializeRegistry();

    switch (command.toLowerCase()) {
      case 'list':
        await listAgents(registry);
        break;

      case 'get':
        await getAgent(registry, args[1]);
        break;

      case 'search':
        await searchAgents(registry, args[1]);
        break;

      case 'stats':
        await showStats(registry);
        break;

      case 'validate':
        await validateAgent(registry, args[1]);
        break;

      case 'phase':
        await getAgentsByPhase(registry, args[1]);
        break;

      case 'category':
        await getAgentsByCategory(registry, args[1]);
        break;

      case 'capability':
        await getAgentsByCapability(registry, args[1]);
        break;

      case 'export':
        await exportRegistry(registry);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Agent Registry CLI - Query LEO Protocol Sub-Agents

Usage:
  registry-cli <command> [arguments]

Commands:
  list                    List all agents
  get <CODE>             Get specific agent details
  search <keyword>       Search agents by keyword
  stats                  Show registry statistics
  validate <CODE>        Validate agent configuration
  phase <PHASE>          Get agents for specific phase
  category <CATEGORY>    Get agents in category
  capability <CAP>       Get agents with capability
  export                 Export registry to JSON

Examples:
  node lib/agents/registry-cli.cjs list
  node lib/agents/registry-cli.cjs get VALIDATION
  node lib/agents/registry-cli.cjs search "security"
  node lib/agents/registry-cli.cjs stats
  `);
}

async function listAgents(registry) {
  const agents = registry.getAllAgents();
  console.log(`\n📋 All Agents (${agents.length} total):\n`);

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.code})`);
    console.log(`   Version: ${agent.metadata?.version || 'N/A'}`);
    console.log(`   Capabilities: ${agent.capabilities.length}`);
    if (agent.trigger_keywords.length > 0) {
      console.log(`   Triggers: ${agent.trigger_keywords.slice(0, 3).join(', ')}${agent.trigger_keywords.length > 3 ? '...' : ''}`);
    }
    console.log('');
  });
}

async function getAgent(registry, code) {
  if (!code) {
    console.error('Error: Agent code required');
    console.log('Usage: registry-cli get <CODE>');
    process.exit(1);
  }

  const agent = registry.getAgent(code.toUpperCase());
  if (!agent) {
    console.error(`Agent '${code}' not found`);
    process.exit(1);
  }

  console.log(`\n🔍 Agent Details: ${agent.name} (${agent.code})\n`);
  console.log(`Version: ${agent.metadata?.version || 'N/A'}`);
  console.log(`Category: ${agent.category || 'N/A'}`);
  console.log(`\nCapabilities (${agent.capabilities.length}):`);
  agent.capabilities.forEach((cap, i) => console.log(`  ${i + 1}. ${cap}`));

  if (agent.trigger_keywords.length > 0) {
    console.log(`\nTrigger Keywords (${agent.trigger_keywords.length}):`);
    console.log(`  ${agent.trigger_keywords.join(', ')}`);
  }

  if (agent.execution_phases.length > 0) {
    console.log(`\nExecution Phases: ${agent.execution_phases.join(', ')}`);
  }

  console.log(`\nMarkdown: ${agent.markdownPath}`);
  console.log(`JS Implementation: ${agent.jsPath}`);
  console.log('');
}

async function searchAgents(registry, keyword) {
  if (!keyword) {
    console.error('Error: Search keyword required');
    console.log('Usage: registry-cli search <keyword>');
    process.exit(1);
  }

  const agents = registry.searchByKeyword(keyword);
  console.log(`\n🔍 Search Results for "${keyword}" (${agents.length} matches):\n`);

  if (agents.length === 0) {
    console.log('No agents found matching that keyword.');
    return;
  }

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.code})`);
    console.log(`   Capabilities: ${agent.capabilities.length}`);
    console.log('');
  });
}

async function showStats(registry) {
  const stats = registry.getStats();
  console.log('\n📊 Registry Statistics:\n');
  console.log(`Total Agents: ${stats.totalAgents}`);
  console.log(`Total Capabilities: ${stats.totalCapabilities}`);
  console.log(`Average Capabilities per Agent: ${stats.avgCapabilitiesPerAgent}`);

  if (stats.phases.length > 0) {
    console.log(`\nPhases: ${stats.phases.join(', ')}`);
  }

  if (stats.categories.length > 0) {
    console.log(`Categories: ${stats.categories.join(', ')}`);
  }

  console.log('');
}

async function validateAgent(registry, code) {
  if (!code) {
    console.error('Error: Agent code required');
    console.log('Usage: registry-cli validate <CODE>');
    process.exit(1);
  }

  const result = await registry.validateAgent(code.toUpperCase());

  console.log(`\n✅ Validation Results for ${code.toUpperCase()}:\n`);

  if (result.valid) {
    console.log('Status: ✅ VALID');
  } else {
    console.log('Status: ❌ INVALID');
  }

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  console.log('');
}

async function getAgentsByPhase(registry, phase) {
  if (!phase) {
    console.error('Error: Phase required');
    console.log('Usage: registry-cli phase <PHASE>');
    process.exit(1);
  }

  const agents = registry.getAgentsForPhase(phase.toUpperCase());
  console.log(`\n📋 Agents for ${phase.toUpperCase()} phase (${agents.length} total):\n`);

  if (agents.length === 0) {
    console.log('No agents found for this phase.');
    return;
  }

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.code})`);
  });
  console.log('');
}

async function getAgentsByCategory(registry, category) {
  if (!category) {
    console.error('Error: Category required');
    console.log('Usage: registry-cli category <CATEGORY>');
    process.exit(1);
  }

  const agents = registry.getAgentsByCategory(category.toLowerCase());
  console.log(`\n📋 Agents in "${category}" category (${agents.length} total):\n`);

  if (agents.length === 0) {
    console.log('No agents found in this category.');
    return;
  }

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.code})`);
  });
  console.log('');
}

async function getAgentsByCapability(registry, capability) {
  if (!capability) {
    console.error('Error: Capability required');
    console.log('Usage: registry-cli capability <CAPABILITY>');
    process.exit(1);
  }

  const agents = registry.getAgentsByCapability(capability);
  console.log(`\n📋 Agents with "${capability}" capability (${agents.length} total):\n`);

  if (agents.length === 0) {
    console.log('No agents found with this capability.');
    return;
  }

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.code})`);
    console.log(`   Total capabilities: ${agent.capabilities.length}`);
    console.log('');
  });
}

async function exportRegistry(registry) {
  const json = registry.toJSON();
  console.log(JSON.stringify(json, null, 2));
}

// Run CLI
if (require.main === module) {
  main();
}

module.exports = { main };
