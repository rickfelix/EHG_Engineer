/**
 * Regenerate .claude/agents/dependency-agent.md from Database
 *
 * Database-First: LEO Protocol v4.2.0
 * Reads DEPENDENCY sub-agent from leo_sub_agents table
 * Generates markdown file for Claude Code agent configuration
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function regenerateDependencyAgentMarkdown() {
  console.log('📝 Regenerating .claude/agents/dependency-agent.md from database...\n');

  try {
    // Read DEPENDENCY sub-agent from database
    const { data: agent, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('code', 'DEPENDENCY')
      .single();

    if (error) throw error;

    console.log('✓ Retrieved DEPENDENCY sub-agent from database');
    console.log(`  Name: ${agent.name}`);
    console.log(`  Code: ${agent.code}`);
    console.log(`  Description: ${agent.description.length} chars`);
    console.log(`  Capabilities: ${agent.capabilities?.length || 0} capabilities`);
    console.log(`  Version: ${agent.metadata?.version || 'N/A'}\n`);

    // Generate markdown content
    const markdown = `---
name: dependency-agent
description: "MUST BE USED PROACTIVELY for all dependency-related tasks. Handles npm/package updates, security vulnerabilities (CVE), dependency conflicts, version management, and CI/CD dependency failures. Trigger on keywords: dependency, npm, package, vulnerability, CVE, outdated, upgrade, npm audit."
tools: Bash, Read, Write
model: inherit
---

${agent.description}
`;

    // Write to file
    const filePath = path.join(process.cwd(), '.claude', 'agents', 'dependency-agent.md');
    await fs.writeFile(filePath, markdown, 'utf8');

    console.log('✅ Dependency agent markdown file generated successfully!\n');
    console.log(`📄 File: ${filePath}`);
    console.log(`📏 Size: ${markdown.length} chars\n`);

    // Display metadata
    if (agent.metadata?.enhancements) {
      console.log('🚀 Enhancements included:');
      const e = agent.metadata.enhancements;
      console.log(`  - Issue Pattern: ${e.issue_pattern_integrated}`);
      console.log(`  - Real-World Patterns: ${e.real_world_patterns?.join(', ')}`);
      console.log(`  - Proven Solutions: ${e.proven_solutions}`);
      console.log(`  - Evidence: ${e.evidence_based}\n`);
    }

    // Display capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      console.log('💪 Capabilities:');
      agent.capabilities.forEach(cap => {
        console.log(`  - ${cap}`);
      });
      console.log('');
    }

    console.log('Next step: Commit changes');
    return filePath;
  } catch (error) {
    console.error('❌ Error regenerating markdown:', error.message);
    process.exit(1);
  }
}

// Execute
regenerateDependencyAgentMarkdown();
