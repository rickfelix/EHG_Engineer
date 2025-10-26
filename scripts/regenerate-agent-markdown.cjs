#!/usr/bin/env node
/**
 * Regenerate Agent Markdown from Database
 *
 * Database-First: LEO Protocol v4.2.0
 * Reads from leo_sub_agents table and generates .claude/agents/*.md files
 *
 * Usage:
 *   node scripts/regenerate-agent-markdown.cjs PERFORMANCE      # Regenerate single agent
 *   node scripts/regenerate-agent-markdown.cjs --all            # Regenerate all agents
 *   node scripts/regenerate-agent-markdown.cjs --missing        # Only generate missing markdown files
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Map agent codes to markdown filenames
const CODE_TO_FILENAME = {
  'API': 'api-agent.md',
  'DATABASE': 'database-agent.md',
  'DEPENDENCY': 'dependency-agent.md',
  'DESIGN': 'design-agent.md',
  'DOCMON': 'docmon-agent.md',
  'GITHUB': 'github-agent.md',
  'PERFORMANCE': 'performance-agent.md',
  'RETRO': 'retro-agent.md',
  'RISK': 'risk-agent.md',
  'SECURITY': 'security-agent.md',
  'STORIES': 'stories-agent.md',
  'TESTING': 'testing-agent.md',
  'UAT': 'uat-agent.md',
  'VALIDATION': 'validation-agent.md',
};

// Map agent codes to trigger keyword strings
const CODE_TO_TRIGGER_STRING = {
  'API': 'API, REST, GraphQL, endpoint, route, controller, middleware, API design',
  'DATABASE': 'database, migration, schema, table, RLS, SQL, Postgres',
  'DEPENDENCY': 'dependency, npm, package, vulnerability, CVE, outdated, upgrade, npm audit',
  'DESIGN': 'UI, UX, design, component, interface, accessibility, a11y, layout, responsive',
  'DOCMON': 'documentation, docs, README, guide, documentation generation, workflow docs',
  'GITHUB': 'GitHub Actions, CI/CD, pipeline, workflow, deployment, build, actions, refactor',
  'PERFORMANCE': 'performance, optimization, speed, latency, load, scalability, caching, indexing',
  'RETRO': 'retrospective, retro, lessons learned, continuous improvement, post-mortem',
  'RISK': 'risk, mitigation, contingency, risk assessment, risk management',
  'SECURITY': 'security, auth, RLS, permissions, roles, authentication, authorization, vulnerability, OWASP',
  'STORIES': 'user story, story, acceptance criteria, user journey',
  'TESTING': 'test, testing, QA, E2E, Playwright, coverage, test cases, user stories',
  'UAT': 'UAT, user acceptance, acceptance testing, user journey, acceptance criteria',
  'VALIDATION': 'validation, verify, check, validate, gate, approval, handoff',
};

async function regenerateAgent(code) {
  try {
    console.log(`📝 Regenerating ${code} agent markdown...\n`);

    // Read agent from database
    const { data: agent, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('code', code)
      .single();

    if (error) throw error;

    if (!agent) {
      console.error(`❌ Agent '${code}' not found in database`);
      return false;
    }

    console.log(`✓ Retrieved ${agent.name} from database`);
    console.log(`  Code: ${agent.code}`);
    console.log(`  Description: ${agent.description?.length || 0} chars`);
    console.log(`  Capabilities: ${agent.capabilities?.length || 0} capabilities`);
    console.log(`  Version: ${agent.metadata?.version || 'N/A'}\n`);

    // Get trigger keywords
    const triggerString = CODE_TO_TRIGGER_STRING[code] ||
                          agent.trigger_keywords?.join(', ') ||
                          code.toLowerCase();

    // Generate markdown content with frontmatter
    const markdown = `---
name: ${CODE_TO_FILENAME[code]?.replace('.md', '')}
description: "MUST BE USED PROACTIVELY for all ${agent.name.toLowerCase()} tasks. Trigger on keywords: ${triggerString}."
tools: Bash, Read, Write
model: inherit
---

${agent.description || `# ${agent.name}\n\n(No description available)`}
`;

    // Determine file path
    const filename = CODE_TO_FILENAME[code] || `${code.toLowerCase()}-agent.md`;
    const filePath = path.join(process.cwd(), '.claude', 'agents', filename);

    // Write to file
    await fs.writeFile(filePath, markdown, 'utf8');

    console.log(`✅ Agent markdown generated successfully!\n`);
    console.log(`📄 File: ${filePath}`);
    console.log(`📏 Size: ${markdown.length} chars\n`);

    // Display metadata if available
    if (agent.metadata?.enhancements) {
      console.log('🚀 Enhancements included:');
      const e = agent.metadata.enhancements;
      Object.entries(e).forEach(([key, value]) => {
        console.log(`  - ${key}: ${JSON.stringify(value)}`);
      });
      console.log('');
    }

    // Display capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      console.log(`💪 Capabilities (${agent.capabilities.length}):`);
      agent.capabilities.slice(0, 5).forEach(cap => {
        console.log(`  - ${cap}`);
      });
      if (agent.capabilities.length > 5) {
        console.log(`  ... and ${agent.capabilities.length - 5} more`);
      }
      console.log('');
    }

    return true;
  } catch (error) {
    console.error(`❌ Error regenerating ${code}:`, error.message);
    return false;
  }
}

async function regenerateAll() {
  console.log('📝 Regenerating ALL agent markdown files from database...\n');

  try {
    // Get all agents from database
    const { data: agents, error } = await supabase
      .from('leo_sub_agents')
      .select('code, name')
      .order('code');

    if (error) throw error;

    console.log(`Found ${agents.length} agents in database\n`);

    let success = 0;
    let failed = 0;

    for (const agent of agents) {
      const result = await regenerateAgent(agent.code);
      if (result) {
        success++;
      } else {
        failed++;
      }
      console.log('---\n');
    }

    console.log(`\n✅ Regeneration complete!`);
    console.log(`   Success: ${success}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${agents.length}\n`);

    return failed === 0;
  } catch (error) {
    console.error('❌ Error regenerating all agents:', error.message);
    return false;
  }
}

async function regenerateMissing() {
  console.log('📝 Regenerating MISSING agent markdown files...\n');

  try {
    // Get all agents from database
    const { data: agents, error } = await supabase
      .from('leo_sub_agents')
      .select('code, name')
      .order('code');

    if (error) throw error;

    console.log(`Found ${agents.length} agents in database\n`);

    let generated = 0;
    let skipped = 0;

    for (const agent of agents) {
      // Check if markdown file exists
      const filename = CODE_TO_FILENAME[agent.code] || `${agent.code.toLowerCase()}-agent.md`;
      const filePath = path.join(process.cwd(), '.claude', 'agents', filename);

      try {
        await fs.access(filePath);
        console.log(`⏭️  ${agent.code}: Markdown already exists, skipping`);
        skipped++;
      } catch {
        console.log(`🆕 ${agent.code}: Missing markdown, generating...`);
        const result = await regenerateAgent(agent.code);
        if (result) {
          generated++;
        }
        console.log('---\n');
      }
    }

    console.log(`\n✅ Missing markdown generation complete!`);
    console.log(`   Generated: ${generated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${agents.length}\n`);

    return true;
  } catch (error) {
    console.error('❌ Error regenerating missing agents:', error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Agent Markdown Regeneration Script
Database-First: LEO Protocol v4.2.0

Usage:
  node scripts/regenerate-agent-markdown.cjs <CODE>     # Regenerate specific agent
  node scripts/regenerate-agent-markdown.cjs --all      # Regenerate all agents
  node scripts/regenerate-agent-markdown.cjs --missing  # Only generate missing files

Examples:
  node scripts/regenerate-agent-markdown.cjs PERFORMANCE
  node scripts/regenerate-agent-markdown.cjs --all
  node scripts/regenerate-agent-markdown.cjs --missing

Available Codes:
  API, DATABASE, DEPENDENCY, DESIGN, DOCMON, GITHUB, PERFORMANCE,
  RETRO, RISK, SECURITY, STORIES, TESTING, UAT, VALIDATION
`);
    process.exit(1);
  }

  const command = args[0];

  if (command === '--all') {
    const success = await regenerateAll();
    process.exit(success ? 0 : 1);
  } else if (command === '--missing') {
    const success = await regenerateMissing();
    process.exit(success ? 0 : 1);
  } else {
    const code = command.toUpperCase();
    const success = await regenerateAgent(code);
    process.exit(success ? 0 : 1);
  }
}

// Execute
if (require.main === module) {
  main();
}

module.exports = { regenerateAgent, regenerateAll, regenerateMissing };
