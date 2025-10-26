#!/usr/bin/env node
/**
 * Agent Metrics Dashboard CLI
 *
 * Part of C1.3 - Agent Observability Metrics
 * View and analyze agent performance metrics
 *
 * Usage:
 *   node lib/agents/metrics-dashboard.cjs              # Show summary
 *   node lib/agents/metrics-dashboard.cjs agent VALIDATION
 *   node lib/agents/metrics-dashboard.cjs top 10
 *   node lib/agents/metrics-dashboard.cjs active
 *   node lib/agents/metrics-dashboard.cjs compare VALIDATION TESTING
 */

const { AgentObservability } = require('./observability.cjs');
const { AgentRegistry } = require('./registry.cjs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Display summary of all agents
 * @param {AgentObservability} obs - Observability instance
 * @param {AgentRegistry} registry - Registry instance
 */
async function displaySummary(obs, registry) {
  console.log(`\n${colors.bright}${colors.blue}📊 Agent Performance Summary${colors.reset}\n`);
  console.log('═'.repeat(80));

  const metrics = await obs.getAllMetrics({ limit: 7 });

  if (metrics.length === 0) {
    console.log(`\n${colors.yellow}No metrics data available yet.${colors.reset}`);
    console.log(`${colors.dim}Use the observability system to start tracking agent usage.${colors.reset}\n`);
    return;
  }

  // Sort by total executions
  metrics.sort((a, b) => b.summary.totalExecutions - a.summary.totalExecutions);

  console.log(`\n${colors.bright}Agent Performance (Last 7 Days)${colors.reset}\n`);

  // Table header
  console.log([
    'Agent Code'.padEnd(20),
    'Executions'.padStart(12),
    'Success Rate'.padStart(14),
    'Avg Time'.padStart(12),
    'Status'.padStart(10),
  ].join('  '));
  console.log('─'.repeat(80));

  metrics.forEach(metric => {
    const { agentCode, summary } = metric;
    const agent = registry.getAgent(agentCode);

    const successRatePercent = (summary.successRate * 100).toFixed(1);
    const successRateColor = summary.successRate >= 0.9 ? colors.green :
                             summary.successRate >= 0.7 ? colors.yellow :
                             colors.red;

    const statusIcon = summary.successRate >= 0.9 ? '✓' :
                       summary.successRate >= 0.7 ? '⚠' : '✗';

    const statusColor = summary.successRate >= 0.9 ? colors.green :
                       summary.successRate >= 0.7 ? colors.yellow :
                       colors.red;

    console.log([
      `${agent ? agent.name : agentCode}`.padEnd(20),
      `${summary.totalExecutions}`.padStart(12),
      `${successRateColor}${successRatePercent}%${colors.reset}`.padStart(14 + 10), // +10 for color codes
      `${summary.avgExecutionTime}ms`.padStart(12),
      `${statusColor}${statusIcon}${colors.reset}`.padStart(10 + 10),
    ].join('  '));
  });

  console.log('\n' + '═'.repeat(80));

  // Overall statistics
  const totalExecutions = metrics.reduce((sum, m) => sum + m.summary.totalExecutions, 0);
  const totalSuccessful = metrics.reduce((sum, m) => sum + m.summary.successfulExecutions, 0);
  const overallSuccessRate = totalExecutions > 0 ? (totalSuccessful / totalExecutions * 100).toFixed(1) : 0;

  console.log(`\n${colors.bright}Overall Statistics:${colors.reset}`);
  console.log(`  Total Agents Tracked: ${metrics.length}`);
  console.log(`  Total Executions:     ${totalExecutions.toLocaleString()}`);
  console.log(`  Overall Success Rate: ${overallSuccessRate}%`);
  console.log();
}

/**
 * Display detailed metrics for specific agent
 * @param {AgentObservability} obs - Observability instance
 * @param {AgentRegistry} registry - Registry instance
 * @param {string} agentCode - Agent code
 */
async function displayAgentDetails(obs, registry, agentCode) {
  const agent = registry.getAgent(agentCode);

  console.log(`\n${colors.bright}${colors.cyan}📈 Agent Details: ${agent ? agent.name : agentCode}${colors.reset}\n`);
  console.log('═'.repeat(80));

  if (agent) {
    console.log(`${colors.bright}Agent Information:${colors.reset}`);
    console.log(`  Code:        ${agent.code}`);
    console.log(`  Category:    ${agent.category || 'N/A'}`);
    console.log(`  Description: ${agent.description || 'N/A'}`);
    console.log();
  }

  const metrics = await obs.getAgentMetrics(agentCode, { limit: 30 });

  if (metrics.records.length === 0) {
    console.log(`${colors.yellow}No performance data available for this agent.${colors.reset}\n`);
    return;
  }

  console.log(`${colors.bright}Performance Summary (Last 30 Days):${colors.reset}`);
  console.log(`  Total Executions:      ${metrics.summary.totalExecutions.toLocaleString()}`);
  console.log(`  Successful:            ${metrics.summary.successfulExecutions} (${(metrics.summary.successRate * 100).toFixed(1)}%)`);
  console.log(`  Failed:                ${metrics.summary.failedExecutions}`);
  console.log(`  Avg Execution Time:    ${metrics.summary.avgExecutionTime}ms`);
  console.log(`  Max Execution Time:    ${metrics.summary.maxExecutionTime}ms`);
  console.log(`  First Seen:            ${metrics.summary.firstSeen || 'N/A'}`);
  console.log(`  Last Seen:             ${metrics.summary.lastSeen || 'N/A'}`);
  console.log();

  // Show recent daily metrics
  console.log(`${colors.bright}Daily Metrics (Last 7 Days):${colors.reset}\n`);

  console.log([
    'Date'.padEnd(12),
    'Executions'.padStart(12),
    'Success'.padStart(10),
    'Failed'.padStart(10),
    'Avg Time'.padStart(12),
  ].join('  '));
  console.log('─'.repeat(60));

  metrics.records.slice(0, 7).forEach(record => {
    const successRate = record.total_executions > 0 ?
      (record.successful_executions / record.total_executions * 100).toFixed(0) : 0;

    console.log([
      record.measurement_date.padEnd(12),
      `${record.total_executions}`.padStart(12),
      `${record.successful_executions} (${successRate}%)`.padStart(10),
      `${record.failed_executions}`.padStart(10),
      `${Math.round(record.avg_execution_time)}ms`.padStart(12),
    ].join('  '));
  });

  console.log('\n' + '═'.repeat(80) + '\n');
}

/**
 * Display top performing agents
 * @param {AgentObservability} obs - Observability instance
 * @param {AgentRegistry} registry - Registry instance
 * @param {number} limit - Number of agents to show
 */
async function displayTopAgents(obs, registry, limit = 10) {
  console.log(`\n${colors.bright}${colors.green}🏆 Top ${limit} Performing Agents${colors.reset}\n`);
  console.log('═'.repeat(80));

  const topAgents = await obs.getTopAgents(limit);

  if (topAgents.length === 0) {
    console.log(`\n${colors.yellow}No metrics data available yet.${colors.reset}\n`);
    return;
  }

  console.log([
    'Rank'.padEnd(6),
    'Agent'.padEnd(25),
    'Executions'.padStart(12),
    'Success Rate'.padStart(14),
    'Avg Time'.padStart(12),
  ].join('  '));
  console.log('─'.repeat(80));

  topAgents.forEach((metric, index) => {
    const agent = registry.getAgent(metric.agentCode);
    const rank = `${index + 1}.`;

    const successRatePercent = (metric.summary.successRate * 100).toFixed(1);
    const successRateColor = metric.summary.successRate >= 0.9 ? colors.green :
                             metric.summary.successRate >= 0.7 ? colors.yellow :
                             colors.red;

    console.log([
      rank.padEnd(6),
      (agent ? agent.name : metric.agentCode).padEnd(25),
      `${metric.summary.totalExecutions}`.padStart(12),
      `${successRateColor}${successRatePercent}%${colors.reset}`.padStart(14 + 10),
      `${metric.summary.avgExecutionTime}ms`.padStart(12),
    ].join('  '));
  });

  console.log('\n' + '═'.repeat(80) + '\n');
}

/**
 * Display active trackers (currently executing agents)
 * @param {AgentObservability} obs - Observability instance
 * @param {AgentRegistry} registry - Registry instance
 */
async function displayActiveTrackers(obs, registry) {
  console.log(`\n${colors.bright}${colors.cyan}⚡ Active Agent Executions${colors.reset}\n`);
  console.log('═'.repeat(80));

  const trackers = obs.getActiveTrackers();

  if (trackers.length === 0) {
    console.log(`\n${colors.dim}No agents currently executing.${colors.reset}\n`);
    return;
  }

  console.log([
    'Agent'.padEnd(20),
    'Duration'.padStart(12),
    'Started'.padEnd(20),
  ].join('  '));
  console.log('─'.repeat(60));

  trackers.forEach(tracker => {
    const agent = registry.getAgent(tracker.agentCode);
    const durationSec = (tracker.duration / 1000).toFixed(1);
    const startTime = new Date(tracker.startTime).toLocaleTimeString();

    console.log([
      (agent ? agent.name : tracker.agentCode).padEnd(20),
      `${durationSec}s`.padStart(12),
      startTime.padEnd(20),
    ].join('  '));
  });

  console.log('\n' + '═'.repeat(80) + '\n');
}

/**
 * Compare two agents side by side
 * @param {AgentObservability} obs - Observability instance
 * @param {AgentRegistry} registry - Registry instance
 * @param {string} agent1Code - First agent code
 * @param {string} agent2Code - Second agent code
 */
async function compareAgents(obs, registry, agent1Code, agent2Code) {
  console.log(`\n${colors.bright}${colors.cyan}⚖️  Agent Comparison${colors.reset}\n`);
  console.log('═'.repeat(80));

  const agent1 = registry.getAgent(agent1Code);
  const agent2 = registry.getAgent(agent2Code);
  const metrics1 = await obs.getAgentMetrics(agent1Code, { limit: 30 });
  const metrics2 = await obs.getAgentMetrics(agent2Code, { limit: 30 });

  console.log([
    'Metric'.padEnd(25),
    (agent1 ? agent1.name : agent1Code).padEnd(25),
    (agent2 ? agent2.name : agent2Code).padEnd(25),
  ].join('  '));
  console.log('─'.repeat(80));

  const compareRow = (label, value1, value2, better = 'higher') => {
    const v1Str = String(value1).padEnd(25);
    const v2Str = String(value2).padEnd(25);

    let v1Color = colors.reset;
    let v2Color = colors.reset;

    if (better === 'higher') {
      if (value1 > value2) v1Color = colors.green;
      else if (value1 < value2) v2Color = colors.green;
    } else if (better === 'lower') {
      if (value1 < value2) v1Color = colors.green;
      else if (value1 > value2) v2Color = colors.green;
    }

    console.log([
      label.padEnd(25),
      `${v1Color}${v1Str}${colors.reset}`,
      `${v2Color}${v2Str}${colors.reset}`,
    ].join('  '));
  };

  compareRow('Total Executions', metrics1.summary.totalExecutions, metrics2.summary.totalExecutions, 'higher');
  compareRow('Success Rate', `${(metrics1.summary.successRate * 100).toFixed(1)}%`, `${(metrics2.summary.successRate * 100).toFixed(1)}%`, 'higher');
  compareRow('Avg Execution Time', `${metrics1.summary.avgExecutionTime}ms`, `${metrics2.summary.avgExecutionTime}ms`, 'lower');
  compareRow('Max Execution Time', `${metrics1.summary.maxExecutionTime}ms`, `${metrics2.summary.maxExecutionTime}ms`, 'lower');
  compareRow('Failed Executions', metrics1.summary.failedExecutions, metrics2.summary.failedExecutions, 'lower');

  console.log('\n' + '═'.repeat(80) + '\n');
}

/**
 * Display help
 */
function displayHelp() {
  console.log(`
${colors.bright}Agent Metrics Dashboard${colors.reset}

${colors.bright}USAGE:${colors.reset}
  node lib/agents/metrics-dashboard.cjs [command] [options]

${colors.bright}COMMANDS:${colors.reset}
  ${colors.cyan}summary${colors.reset}                      Show summary of all agents (default)
  ${colors.cyan}agent <code>${colors.reset}                 Show detailed metrics for specific agent
  ${colors.cyan}top [limit]${colors.reset}                  Show top performing agents (default: 10)
  ${colors.cyan}active${colors.reset}                       Show currently executing agents
  ${colors.cyan}compare <code1> <code2>${colors.reset}      Compare two agents side by side
  ${colors.cyan}help${colors.reset}                         Show this help message

${colors.bright}EXAMPLES:${colors.reset}
  ${colors.dim}# Show summary dashboard${colors.reset}
  node lib/agents/metrics-dashboard.cjs

  ${colors.dim}# View VALIDATION agent metrics${colors.reset}
  node lib/agents/metrics-dashboard.cjs agent VALIDATION

  ${colors.dim}# Show top 5 agents${colors.reset}
  node lib/agents/metrics-dashboard.cjs top 5

  ${colors.dim}# Compare two agents${colors.reset}
  node lib/agents/metrics-dashboard.cjs compare VALIDATION TESTING

  ${colors.dim}# Show active executions${colors.reset}
  node lib/agents/metrics-dashboard.cjs active
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'summary';

  try {
    // Initialize systems
    const obs = new AgentObservability();
    const registry = new AgentRegistry();

    await Promise.all([
      obs.initialize(),
      registry.initialize(),
    ]);

    // Route commands
    switch (command) {
      case 'summary':
        await displaySummary(obs, registry);
        break;

      case 'agent':
        if (!args[1]) {
          console.error(`${colors.red}Error: Agent code required${colors.reset}`);
          console.log('Usage: metrics-dashboard agent <code>');
          process.exit(1);
        }
        await displayAgentDetails(obs, registry, args[1]);
        break;

      case 'top':
        const limit = parseInt(args[1]) || 10;
        await displayTopAgents(obs, registry, limit);
        break;

      case 'active':
        await displayActiveTrackers(obs, registry);
        break;

      case 'compare':
        if (!args[1] || !args[2]) {
          console.error(`${colors.red}Error: Two agent codes required${colors.reset}`);
          console.log('Usage: metrics-dashboard compare <code1> <code2>');
          process.exit(1);
        }
        await compareAgents(obs, registry, args[1], args[2]);
        break;

      case 'help':
      case '--help':
      case '-h':
        displayHelp();
        break;

      default:
        console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
        console.log('Run "metrics-dashboard help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  displaySummary,
  displayAgentDetails,
  displayTopAgents,
  displayActiveTrackers,
  compareAgents,
};
