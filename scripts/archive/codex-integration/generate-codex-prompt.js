#!/usr/bin/env node

/**
 * Generate OpenAI Codex Prompt from PRD
 * Creates a formatted prompt for manual copy to OpenAI Codex
 * Part of the LEO Protocol Level 1 integration
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

class CodexPromptGenerator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  /**
   * Generate prompt for OpenAI Codex from PRD
   */
  async generatePrompt(prdId) {
    try {
      // Fetch PRD from database
      const { data: prd, error } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();

      if (error || !prd) {
        console.error('Query error:', error);
        throw new Error(`PRD not found: ${prdId}`);
      }

      // Create handoff record
      const handoffId = `CODEX-${Date.now()}`;
      const { error: handoffError } = await this.supabase
        .from('codex_handoffs')
        .insert({
          id: handoffId,
          prd_id: prdId,
          status: 'prompt_generated',
          prompt_generated_at: new Date().toISOString()
        });

      if (handoffError) {
        console.warn('Warning: Could not create handoff record:', handoffError.message);
      }

      // Build the prompt
      const prompt = this.buildPrompt(prd, handoffId);

      // Display the prompt
      this.displayPrompt(prompt, prd, handoffId);

      // Optionally copy to clipboard (macOS)
      this.copyToClipboard(prompt);

      return { prompt, handoffId, prd };

    } catch (error) {
      console.error(chalk.red('Error generating prompt:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Build the formatted prompt for Codex
   */
  buildPrompt(prd, handoffId) {
    const timestamp = new Date().toISOString();

    // Extract key requirements (handle JSON strings)
    const functionalReqs = typeof prd.functional_requirements === 'string'
      ? JSON.parse(prd.functional_requirements)
      : prd.functional_requirements || [];
    const technicalReqs = typeof prd.technical_requirements === 'string'
      ? JSON.parse(prd.technical_requirements)
      : prd.technical_requirements || [];
    const execChecklist = typeof prd.exec_checklist === 'string'
      ? JSON.parse(prd.exec_checklist)
      : prd.exec_checklist || [];
    const testScenarios = typeof prd.test_scenarios === 'string'
      ? JSON.parse(prd.test_scenarios)
      : prd.test_scenarios || [];

    // Identify files to modify from requirements
    const filesToModify = this.extractFilesToModify(prd);

    const prompt = `
=== LEO PROTOCOL HANDOFF TO OPENAI CODEX ===
Handoff ID: ${handoffId}
Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}
PRD ID: ${prd.id}
Title: ${prd.title}
Generated: ${timestamp}

CONTEXT:
You are the read-only Codex builder in the LEO Protocol dual-lane architecture.
Your role is to generate patches without direct write access.

DATABASE ACCESS (Read-Only):
\`\`\`javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  '${process.env.NEXT_PUBLIC_SUPABASE_URL}',
  '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}'
);

// Query the full PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', '${prd.id}')
  .single();
\`\`\`

REQUIREMENTS TO IMPLEMENT:

Functional Requirements:
${functionalReqs.slice(0, 5).map((req, i) => `${i + 1}. ${req.description || req}`).join('\n')}

Technical Requirements:
${technicalReqs.slice(0, 5).map((req, i) => `${i + 1}. ${req.description || req}`).join('\n')}

Implementation Checklist:
${execChecklist.filter(item => !item.completed).slice(0, 5).map((item, i) => `${i + 1}. ${item.task || item}`).join('\n')}

FILES TO MODIFY:
${filesToModify.map(f => `- ${f}`).join('\n')}

OUTPUT REQUIREMENTS:

1. Generate artifacts in /tmp/codex-artifacts/:
   - changes-{timestamp}.patch (unified diff format)
   - sbom-{timestamp}.cdx.json (CycloneDX 1.5)
   - attestation-{timestamp}.intoto (in-toto v1.0)
   - manifest-{timestamp}.json with:
     {
       "handoff_id": "${handoffId}",
       "prd_id": "${prd.id}",
       "timestamp": "{ISO-8601}",
       "files_modified": [...],
       "task_description": "..."
     }

2. Use git diff format for patches:
   \`\`\`diff
   --- a/path/to/file.js
   +++ b/path/to/file.js
   @@ -line,count +line,count @@
   \`\`\`

3. Mark completion with: [CODEX-READY:${prd.id}]

TEST SCENARIOS TO CONSIDER:
${testScenarios.slice(0, 3).map((scenario, i) => `${i + 1}. ${scenario.name || scenario}: ${scenario.description || ''}`).join('\n')}

IMPORTANT CONSTRAINTS:
- You CANNOT directly modify files (read-only)
- Generate patches that can be applied with 'git apply'
- Ensure all changes maintain backward compatibility
- Include appropriate error handling
- Follow existing code style and conventions

Please analyze the codebase and generate the complete artifact bundle.
===`;

    return prompt.trim();
  }

  /**
   * Extract files to modify from PRD
   */
  extractFilesToModify(prd) {
    const files = new Set();

    // Extract from various PRD fields
    const sources = [
      prd.functional_requirements,
      prd.technical_requirements,
      prd.implementation_approach,
      prd.exec_checklist
    ];

    sources.forEach(source => {
      if (!source) return;

      const text = JSON.stringify(source);
      // Look for file patterns
      const filePatterns = text.match(/[\/\w-]+\.(js|ts|jsx|tsx|json|md)/g);
      if (filePatterns) {
        filePatterns.forEach(f => files.add(f));
      }
    });

    // If no specific files found, suggest common locations
    if (files.size === 0) {
      files.add('src/components/[relevant-component].jsx');
      files.add('src/utils/[relevant-util].js');
      files.add('src/services/[relevant-service].js');
    }

    return Array.from(files);
  }

  /**
   * Display the prompt with formatting
   */
  displayPrompt(prompt, prd, handoffId) {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('📋 CODEX PROMPT GENERATED'));
    console.log(chalk.cyan('═'.repeat(60)));

    console.log(chalk.yellow('\nPRD Details:'));
    console.log(`  ID: ${chalk.white(prd.id)}`);
    console.log(`  Title: ${chalk.white(prd.title)}`);
    console.log(`  Priority: ${chalk.white(prd.priority)}`);
    console.log(`  Status: ${chalk.white(prd.status)}`);

    console.log(chalk.yellow('\nHandoff Details:'));
    console.log(`  Handoff ID: ${chalk.white(handoffId)}`);
    console.log(`  Artifact Directory: ${chalk.white('/tmp/codex-artifacts/')}`);

    console.log(chalk.green('\n▼ COPY THE FOLLOWING TO OPENAI CODEX ▼'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(prompt));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green('▲ END OF PROMPT ▲\n'));
  }

  /**
   * Copy prompt to clipboard (macOS)
   */
  copyToClipboard(prompt) {
    try {
      if (process.platform === 'darwin') {
        execSync('pbcopy', { input: prompt });
        console.log(chalk.green('✅ Prompt copied to clipboard!'));
        console.log(chalk.gray('   (macOS: Just paste with Cmd+V)'));
      } else if (process.platform === 'linux') {
        // Try xclip if available
        try {
          execSync('xclip -selection clipboard', { input: prompt });
          console.log(chalk.green('✅ Prompt copied to clipboard!'));
        } catch {
          console.log(chalk.yellow('ℹ️  Install xclip for clipboard support: apt-get install xclip'));
        }
      } else {
        console.log(chalk.yellow('ℹ️  Manual copy required (clipboard not supported on this platform)'));
      }
    } catch (_error) {
      console.log(chalk.yellow('ℹ️  Could not copy to clipboard. Please copy manually.'));
    }
  }

  /**
   * List available PRDs
   */
  async listPRDs() {
    const { data: prds, error } = await this.supabase
      .from('product_requirements_v2')
      .select('id, title, status, priority')
      .in('status', ['planning', 'approved'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Failed to fetch PRDs: ${error.message}`);
    }

    console.log(chalk.cyan('\nAvailable PRDs:'));
    console.log(chalk.gray('─'.repeat(60)));

    prds.forEach(prd => {
      const statusColor = prd.status === 'approved' ? chalk.green : chalk.yellow;
      const priorityColor = prd.priority === 'critical' ? chalk.red :
                          prd.priority === 'high' ? chalk.magenta :
                          chalk.blue;

      console.log(`  ${chalk.white(prd.id.padEnd(20))} ${statusColor(prd.status.padEnd(10))} ${priorityColor(prd.priority.padEnd(8))} ${prd.title}`);
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray('\nUsage: node generate-codex-prompt.js <PRD-ID>'));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const generator = new CodexPromptGenerator();
  const prdId = process.argv[2];

  if (!prdId) {
    console.log(chalk.yellow('Usage: node generate-codex-prompt.js <PRD-ID>\n'));
    generator.listPRDs().catch(console.error);
  } else {
    generator.generatePrompt(prdId).catch(console.error);
  }
}