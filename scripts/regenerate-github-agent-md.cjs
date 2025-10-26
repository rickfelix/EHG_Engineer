/**
 * Regenerate .claude/agents/github-agent.md from Database
 *
 * Database-First: LEO Protocol v4.2.0
 * Reads GITHUB sub-agent from leo_sub_agents table
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

async function regenerateGitHubAgentMarkdown() {
  console.log('📝 Regenerating .claude/agents/github-agent.md from database...\n');

  try {
    // Read GITHUB sub-agent from database
    const { data: agent, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('code', 'GITHUB')
      .single();

    if (error) throw error;

    console.log('✓ Retrieved GITHUB sub-agent from database');
    console.log(`  Name: ${agent.name}`);
    console.log(`  Code: ${agent.code}`);
    console.log(`  Description: ${agent.description.length} chars`);
    console.log(`  Capabilities: ${agent.capabilities?.length || 0} capabilities`);
    console.log(`  Version: ${agent.metadata?.version || 'N/A'}\n`);

    // Generate markdown content
    const markdown = `---
name: github-agent
description: "MUST BE USED PROACTIVELY for all CI/CD and GitHub Actions tasks. Handles pipeline verification, workflow validation, deployment checks, and refactoring safety. Trigger on keywords: GitHub Actions, CI/CD, pipeline, workflow, deployment, build, actions, refactor."
tools: Bash, Read, Write
model: inherit
---

${agent.description}
`;

    // Write to file
    const filePath = path.join(process.cwd(), '.claude', 'agents', 'github-agent.md');
    await fs.writeFile(filePath, markdown, 'utf8');

    console.log('✅ GitHub agent markdown file generated successfully!\n');
    console.log(`📄 File: ${filePath}`);
    console.log(`📏 Size: ${markdown.length} chars\n`);

    // Display metadata
    if (agent.metadata?.enhancements) {
      console.log('🚀 Enhancements included:');
      const e = agent.metadata.enhancements;
      console.log(`  - Refactoring Safety Protocol: ${e.refactoring_safety_protocol ? 'Yes' : 'No'}`);
      console.log(`  - Issue Patterns: ${e.issue_patterns_integrated?.join(', ')}`);
      console.log(`  - Incident Lessons: ${e.incident_lessons?.length || 0} lessons`);
      console.log(`  - Mandatory Checklists: ${e.mandatory_checklists?.join(', ')}`);
      console.log(`  - Impact: ${e.estimated_impact_hours_saved}\n`);
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
regenerateGitHubAgentMarkdown();
