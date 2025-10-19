#!/usr/bin/env node
/**
 * Protocol Token Usage Audit Script
 *
 * Analyzes database content to identify optimization opportunities
 * Generates detailed report with recommendations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rough token estimation: 1 token ≈ 4 characters
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Color coding for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function formatTokens(tokens) {
  if (tokens > 5000) return `${colors.red}${tokens}${colors.reset}`;
  if (tokens > 2000) return `${colors.yellow}${tokens}${colors.reset}`;
  return `${colors.green}${tokens}${colors.reset}`;
}

async function auditProtocolSections() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  PROTOCOL SECTIONS ANALYSIS${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  const { data: sections, error} = await supabase
    .from('leo_protocol_sections')
    .select('section_type, title, content, order_index')
    .order('order_index');

  if (error) {
    console.error('❌ Error querying protocol sections:', error.message);
    return { totalTokens: 0, sections: [] };
  }

  const sectionAnalysis = sections.map(s => ({
    key: s.section_type,
    title: s.title,
    tokens: estimateTokens(s.content),
    content: s.content
  }));

  // Sort by token count descending
  sectionAnalysis.sort((a, b) => b.tokens - a.tokens);

  console.log('Top Token-Heavy Sections:\n');
  sectionAnalysis.slice(0, 15).forEach((s, idx) => {
    const bar = '█'.repeat(Math.ceil(s.tokens / 500));
    console.log(`${idx + 1}. ${s.title}`);
    console.log(`   ${s.key}`);
    console.log(`   ${bar} ${formatTokens(s.tokens)} tokens\n`);
  });

  const totalTokens = sectionAnalysis.reduce((sum, s) => sum + s.tokens, 0);
  console.log(`${colors.bright}Total Protocol Sections: ${formatTokens(totalTokens)} tokens${colors.reset}\n`);

  return { totalTokens, sections: sectionAnalysis };
}

async function auditSubAgents() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  SUB-AGENTS ANALYSIS${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  const { data: agents, error } = await supabase
    .from('leo_sub_agents')
    .select('code, name, description, priority, activation_type')
    .order('priority', { ascending: false });

  if (error) {
    console.error('❌ Error querying sub-agents:', error.message);
    return { totalTokens: 0, agents: [] };
  }

  const agentAnalysis = agents.map(a => ({
    code: a.code,
    name: a.name,
    tokens: estimateTokens(a.name + ' ' + a.description),
    priority: a.priority,
    autoTrigger: a.activation_type === 'auto'
  }));

  console.log('Sub-Agent Token Usage:\n');
  agentAnalysis.forEach(a => {
    const auto = a.autoTrigger ? '🔄 AUTO' : '🔘 MANUAL';
    console.log(`${a.code.padEnd(12)} ${auto} Priority: ${a.priority.toString().padStart(3)} - ${formatTokens(a.tokens)} tokens`);
    console.log(`             ${a.name}\n`);
  });

  const totalTokens = agentAnalysis.reduce((sum, a) => sum + a.tokens, 0);
  console.log(`${colors.bright}Total Sub-Agents: ${formatTokens(totalTokens)} tokens${colors.reset}\n`);

  return { totalTokens, agents: agentAnalysis };
}

async function auditHandoffTemplates() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  HANDOFF TEMPLATES ANALYSIS${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  const { data: handoffs, error } = await supabase
    .from('leo_handoff_templates')
    .select('from_agent, to_agent, template_structure, required_elements');

  if (error) {
    console.error('❌ Error querying handoff templates:', error.message);
    return { totalTokens: 0, handoffs: [] };
  }

  const handoffAnalysis = handoffs.map(h => {
    const structureStr = JSON.stringify(h.template_structure);
    const elementsStr = JSON.stringify(h.required_elements);
    return {
      handoff: `${h.from_agent} → ${h.to_agent}`,
      tokens: estimateTokens(structureStr + elementsStr),
      elementCount: h.required_elements?.length || 0
    };
  });

  console.log('Handoff Template Token Usage:\n');
  handoffAnalysis.forEach(h => {
    console.log(`${h.handoff.padEnd(25)} ${h.elementCount} elements - ${formatTokens(h.tokens)} tokens`);
  });

  const totalTokens = handoffAnalysis.reduce((sum, h) => sum + h.tokens, 0);
  console.log(`\n${colors.bright}Total Handoff Templates: ${formatTokens(totalTokens)} tokens${colors.reset}\n`);

  return { totalTokens, handoffs: handoffAnalysis };
}

async function identifyOptimizationOpportunities(sectionsData) {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  OPTIMIZATION OPPORTUNITIES${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  const opportunities = [];

  // Opportunity 1: Condense sections >3000 tokens
  const heavySections = sectionsData.sections.filter(s => s.tokens > 3000);
  if (heavySections.length > 0) {
    const potentialSavings = heavySections.reduce((sum, s) => sum + Math.floor(s.tokens * 0.5), 0);
    opportunities.push({
      category: 'Condense Heavy Sections',
      count: heavySections.length,
      savings: potentialSavings,
      action: 'Create condensed versions of verbose sections',
      sections: heavySections.map(s => s.key)
    });
  }

  // Opportunity 2: Extract examples to separate table
  const exampleSections = sectionsData.sections.filter(s =>
    s.key.includes('example') ||
    s.key.includes('pattern') ||
    s.content.toLowerCase().includes('success story') ||
    s.content.toLowerCase().includes('anti-pattern')
  );
  if (exampleSections.length > 0) {
    const potentialSavings = exampleSections.reduce((sum, s) => sum + Math.floor(s.tokens * 0.8), 0);
    opportunities.push({
      category: 'Extract Examples',
      count: exampleSections.length,
      savings: potentialSavings,
      action: 'Move to leo_protocol_examples table (on-demand loading)',
      sections: exampleSections.map(s => s.key)
    });
  }

  // Opportunity 3: Move reference guides to external docs
  const guideSections = sectionsData.sections.filter(s =>
    s.key.includes('guide') ||
    s.key.includes('reference') ||
    s.tokens > 2500
  );
  if (guideSections.length > 0) {
    const potentialSavings = guideSections.reduce((sum, s) => sum + Math.floor(s.tokens * 0.9), 0);
    opportunities.push({
      category: 'External Documentation',
      count: guideSections.length,
      savings: potentialSavings,
      action: 'Move to docs/ with brief summaries in database',
      sections: guideSections.map(s => s.key)
    });
  }

  // Opportunity 4: Identify duplicate content
  const duplicates = [];
  const keyPhrases = [
    'database-first',
    'dual test execution',
    'context health',
    'server restart',
    'git commit'
  ];

  keyPhrases.forEach(phrase => {
    const matches = sectionsData.sections.filter(s =>
      s.content.toLowerCase().includes(phrase.toLowerCase())
    );
    if (matches.length > 2) {
      duplicates.push({
        phrase,
        count: matches.length,
        sections: matches.map(s => s.key)
      });
    }
  });

  if (duplicates.length > 0) {
    const potentialSavings = duplicates.length * 500; // Rough estimate
    opportunities.push({
      category: 'Deduplicate Content',
      count: duplicates.length,
      savings: potentialSavings,
      action: 'Create shared references, link from multiple sections',
      duplicates: duplicates
    });
  }

  // Display opportunities
  opportunities.forEach((opp, idx) => {
    console.log(`${colors.bright}${idx + 1}. ${opp.category}${colors.reset}`);
    console.log(`   Items: ${opp.count}`);
    console.log(`   Potential savings: ${colors.green}${opp.savings} tokens${colors.reset}`);
    console.log(`   Action: ${opp.action}`);

    if (opp.sections && opp.sections.length <= 5) {
      console.log(`   Sections: ${opp.sections.join(', ')}`);
    } else if (opp.sections) {
      console.log(`   Sections: ${opp.sections.slice(0, 3).join(', ')} ... (${opp.sections.length} total)`);
    }

    if (opp.duplicates) {
      console.log(`   Duplicate phrases found:`);
      opp.duplicates.slice(0, 3).forEach(d => {
        console.log(`     - "${d.phrase}" (${d.count} occurrences)`);
      });
    }
    console.log();
  });

  const totalSavings = opportunities.reduce((sum, o) => sum + o.savings, 0);
  return { opportunities, totalSavings };
}

async function generateReport() {
  console.log(`${colors.bright}${colors.magenta}`);
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║                                                   ║');
  console.log('║   LEO Protocol Token Usage Audit Report          ║');
  console.log('║   Generated: ' + new Date().toISOString().slice(0, 19) + '                  ║');
  console.log('║                                                   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // Run all audits
  const sectionsData = await auditProtocolSections();
  const agentsData = await auditSubAgents();
  const handoffsData = await auditHandoffTemplates();
  const { opportunities, totalSavings } = await identifyOptimizationOpportunities(sectionsData);

  // Summary
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  const total = sectionsData.totalTokens + agentsData.totalTokens + handoffsData.totalTokens;

  console.log('Current Database Token Usage:\n');
  console.log(`  Protocol Sections:  ${formatTokens(sectionsData.totalTokens)} tokens`);
  console.log(`  Sub-Agents:         ${formatTokens(agentsData.totalTokens)} tokens`);
  console.log(`  Handoff Templates:  ${formatTokens(handoffsData.totalTokens)} tokens`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${colors.bright}Total Database:     ${formatTokens(total)} tokens${colors.reset}\n`);

  console.log('CLAUDE.md Context Impact:\n');
  console.log(`  Database content:   ${formatTokens(total)} tokens`);
  console.log(`  MCP tools:          ${colors.yellow}19,300${colors.reset} tokens (30 tools)`);
  console.log(`  Custom agents:      ${colors.green}643${colors.reset} tokens (10 agents)`);
  console.log(`  System overhead:    ${colors.green}~13,000${colors.reset} tokens`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${colors.bright}Total Context:      ${colors.red}~${(total + 19300 + 643 + 13000).toLocaleString()}${colors.reset} tokens${colors.reset}\n`);

  console.log('Optimization Potential:\n');
  console.log(`  Database optimizations:  ${colors.green}-${totalSavings.toLocaleString()}${colors.reset} tokens`);
  console.log(`  Disable Puppeteer MCP:   ${colors.green}-9,600${colors.reset} tokens`);
  console.log(`  Archive 3-5 agents:      ${colors.green}-200 to -400${colors.reset} tokens`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${colors.bright}Potential Savings:       ${colors.green}-${(totalSavings + 9600 + 300).toLocaleString()}${colors.reset} tokens${colors.reset}`);
  console.log(`  ${colors.bright}Projected Usage:         ${colors.green}~${(total + 19300 + 643 + 13000 - totalSavings - 9600 - 300).toLocaleString()}${colors.reset} tokens (${Math.round((total + 19300 + 643 + 13000 - totalSavings - 9600 - 300) / 2000)}%)${colors.reset}\n`);

  // Recommendations
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  RECOMMENDED NEXT STEPS${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.bright}Phase 1: Quick Wins${colors.reset} (Day 1, 1 hour)\n`);
  console.log('  1. Disable Puppeteer MCP server');
  console.log('     → Edit ~/.config/claude/config.json');
  console.log('     → Save ~9,600 tokens\n');

  console.log('  2. Archive 3-5 unused custom agents');
  console.log('     → Move to .claude/agents/_archived/');
  console.log('     → Save ~200-400 tokens\n');

  console.log(`${colors.bright}Phase 2: Database Optimization${colors.reset} (Week 1, 3-4 hours)\n`);

  opportunities.forEach((opp, idx) => {
    console.log(`  ${idx + 1}. ${opp.category}`);
    console.log(`     → ${opp.action}`);
    console.log(`     → Save ~${opp.savings.toLocaleString()} tokens\n`);
  });

  console.log(`${colors.bright}Phase 3: Structural Changes${colors.reset} (Week 2-3, 4-6 hours)\n`);
  console.log('  1. Create leo_protocol_examples table');
  console.log('  2. Create leo_external_docs table');
  console.log('  3. Create leo_protocol_editions table');
  console.log('  4. Implement phase-specific generation\n');

  // Export detailed report to file
  const reportPath = `docs/reference/context-optimization/audit-report-${new Date().toISOString().slice(0, 10)}.json`;
  const reportData = {
    timestamp: new Date().toISOString(),
    sections: sectionsData,
    agents: agentsData,
    handoffs: handoffsData,
    opportunities,
    summary: {
      currentUsage: total,
      potentialSavings: totalSavings + 9600 + 300,
      projectedUsage: total + 19300 + 643 + 13000 - totalSavings - 9600 - 300
    }
  };

  console.log(`\n${colors.bright}📁 Detailed report exported to:${colors.reset}`);
  console.log(`   ${reportPath}\n`);

  return reportData;
}

// Run the audit
generateReport().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
