#!/usr/bin/env node
/**
 * Generate CLAUDE.md Dynamically from Database (V2 - Pure Database-Driven)
 * All content comes from database, script only handles formatting
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('⚠️ CLAUDE.md will not be updated');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class CLAUDEMDGeneratorV2 {
  constructor() {
    this.outputPath = path.join(__dirname, '..', 'CLAUDE.md');
  }

  async generate() {
    console.log('🔄 Generating CLAUDE.md from database (V2 - Pure DB)...\n');

    try {
      // Fetch all required data
      const protocol = await this.getActiveProtocol();
      const agents = await this.getAgents();
      const subAgents = await this.getSubAgents();
      const handoffTemplates = await this.getHandoffTemplates();
      const validationRules = await this.getValidationRules();

      // Generate CLAUDE.md content
      const content = this.generateContent({
        protocol,
        agents,
        subAgents,
        handoffTemplates,
        validationRules
      });

      // Write to file
      fs.writeFileSync(this.outputPath, content);

      console.log('✅ CLAUDE.md generated successfully!');
      console.log(`📄 Version: LEO Protocol v${protocol.version}`);
      console.log(`📊 Sub-agents documented: ${subAgents.length}`);
      console.log(`📋 Handoff templates: ${handoffTemplates.length}`);
      console.log(`📚 Protocol sections: ${protocol.sections.length}`);
      console.log('\n🎯 CLAUDE.md is now synchronized with database!');

    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  }

  async getActiveProtocol() {
    const { data, error } = await supabase
      .from('leo_protocols')
      .select('*')
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error('No active protocol found in database');
    }

    // Also get sections (ordered)
    const { data: sections } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .eq('protocol_id', data.id)
      .order('order_index');

    data.sections = sections || [];
    return data;
  }

  async getAgents() {
    const { data } = await supabase
      .from('leo_agents')
      .select('*')
      .order('agent_code');

    return data || [];
  }

  async getSubAgents() {
    const { data } = await supabase
      .from('leo_sub_agents')
      .select(`
        *,
        triggers:leo_sub_agent_triggers(*)
      `)
      .eq('active', true)
      .order('priority', { ascending: false });

    return data || [];
  }

  async getHandoffTemplates() {
    const { data } = await supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('active', true);

    return data || [];
  }

  async getValidationRules() {
    const { data } = await supabase
      .from('leo_validation_rules')
      .select('*')
      .eq('active', true);

    return data || [];
  }

  getSectionByType(sections, type) {
    const section = sections.find(s => s.section_type === type);
    return section ? `## ${section.title}\n\n${section.content}\n` : '';
  }

  generateContent({ protocol, agents, subAgents, handoffTemplates, validationRules }) {
    const today = new Date().toISOString().split('T')[0];
    const sections = protocol.sections || [];

    // Get all sections from database
    const fileWarning = this.getSectionByType(sections, 'file_warning');
    const sessionPrologue = this.getSectionByType(sections, 'session_prologue');
    const applicationArchitecture = this.getSectionByType(sections, 'application_architecture');
    const execImplementationRequirements = this.getSectionByType(sections, 'exec_implementation_requirements');
    const gitCommitGuidelines = this.getSectionByType(sections, 'git_commit_guidelines');
    const prSizeGuidelines = this.getSectionByType(sections, 'pr_size_guidelines');
    const communicationContext = this.getSectionByType(sections, 'communication_context');
    const parallelExecution = this.getSectionByType(sections, 'parallel_execution');
    const subagentParallelExecution = this.getSectionByType(sections, 'subagent_parallel_execution');
    const leadOperations = this.getSectionByType(sections, 'lead_operations');
    const directiveSubmissionReview = this.getSectionByType(sections, 'directive_submission_review');
    const databaseMigrationValidation = this.getSectionByType(sections, 'database_migration_validation');
    const unifiedHandoffSystem = this.getSectionByType(sections, 'unified_handoff_system');
    const databaseSchemaOverview = this.getSectionByType(sections, 'database_schema_overview');
    const supabaseOperations = this.getSectionByType(sections, 'supabase_operations');
    const developmentWorkflow = this.getSectionByType(sections, 'development_workflow');

    // Get other database-backed sections (dynamic content)
    const protocolSections = sections
      .filter(section => ![
        'file_warning', 'session_prologue', 'application_architecture',
        'exec_implementation_requirements', 'git_commit_guidelines', 'pr_size_guidelines',
        'communication_context', 'parallel_execution', 'subagent_parallel_execution',
        'lead_operations', 'directive_submission_review', 'database_migration_validation',
        'unified_handoff_system', 'database_schema_overview', 'supabase_operations',
        'development_workflow'
      ].includes(section.section_type))
      .map(section => `## ${section.title}\n\n${section.content}`)
      .join('\n\n');

    return `# CLAUDE.md - LEO Protocol Workflow Guide for AI Agents

${fileWarning}

${sessionPrologue}

${applicationArchitecture}

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: ${today} ${new Date().toLocaleTimeString()}
**Source**: Supabase Database (not files)
**Auto-Update**: Run \`node scripts/generate-claude-md-from-db.js\` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: v${protocol.version}

**CRITICAL**: This is the ACTIVE version from database
**ID**: ${protocol.id}
**Status**: ${protocol.status.toUpperCase()}
**Title**: ${protocol.title}

### 📅 Protocol Management

**Database-First Architecture**:
- Protocol stored in \`leo_protocols\` table
- Sub-agents in \`leo_sub_agents\` table
- Handoffs in \`leo_handoff_templates\` table
- Single source of truth - no file conflicts

**To update protocol version**:
\`\`\`sql
-- Only via database operations
UPDATE leo_protocols SET status = 'active' WHERE version = 'new_version';
UPDATE leo_protocols SET status = 'superseded' WHERE version != 'new_version';
\`\`\`

## Agent Responsibilities

${this.generateAgentSection(agents)}

${execImplementationRequirements}

${gitCommitGuidelines}

${prSizeGuidelines}

${communicationContext}

${parallelExecution}

## Progress Calculation

\`\`\`
Total = ${agents.map(a => `${a.agent_code}: ${a.total_percentage}%`).join(' + ')} = 100%
\`\`\`

${leadOperations}

${directiveSubmissionReview}

${databaseMigrationValidation}

${protocolSections}

## Mandatory Handoff Requirements

Every handoff MUST include these 7 elements:
${handoffTemplates.length > 0 ? handoffTemplates[0].template_structure.sections.map((s, i) => `${i+1}. ${s}`).join('\n') : '(Loading from database...)'}

Missing ANY element = AUTOMATIC REJECTION

${unifiedHandoffSystem}

## Sub-Agent System (Database-Driven)

### Active Sub-Agents

| Sub-Agent | Code | Activation | Priority |
|-----------|------|------------|----------|
${this.generateSubAgentListWithDescriptions(subAgents)}

### Sub-Agent Activation Triggers

${this.generateSubAgentTriggers(subAgents)}

### Sub-Agent Activation Process

When triggers are detected, EXEC MUST:

1. **Query Database for Active Triggers**
   \`\`\`sql
   SELECT * FROM leo_sub_agent_triggers
   WHERE active = true
   AND trigger_phrase IN (detected_phrases);
   \`\`\`

2. **Create Formal Handoff** (7 elements from database template)

3. **Execute Sub-Agent**
   - Option A: Run tool from \`script_path\` field
   - Option B: Use context from \`context_file\` field
   - Option C: Document analysis if no tool exists

4. **Store Results in Database**
   \`\`\`sql
   INSERT INTO sub_agent_executions (sub_agent_id, results, ...);
   \`\`\`

### Handoff Templates

${this.generateHandoffTemplates(handoffTemplates)}

## Validation Rules (From Database)

${this.generateValidationRules(validationRules)}

${databaseSchemaOverview}

${supabaseOperations}

${developmentWorkflow}

${subagentParallelExecution}

---

*Generated from Database: ${today}*
*Protocol Version: v${protocol.version}*
*Database-First Architecture: ACTIVE*
`;
  }

  generateAgentSection(agents) {
    return agents.map(agent => {
      // Add supervisor note for PLAN
      const supervisorNote = agent.agent_code === 'PLAN'
        ? '\n- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents'
        : '';

      return `
### ${agent.name} (${agent.agent_code})
- **Responsibilities**: ${agent.responsibilities}${supervisorNote}
- **Planning**: ${agent.planning_percentage || 0}%
- **Implementation**: ${agent.implementation_percentage || 0}%
- **Verification**: ${agent.verification_percentage || 0}%
- **Approval**: ${agent.approval_percentage || 0}%
- **Total**: ${agent.total_percentage}%`;
    }).join('\n');
  }

  extractBriefDescription(fullDescription) {
    if (!fullDescription) return 'No description available';

    // Remove markdown headers, bullet points, and code blocks from beginning
    let cleanDesc = fullDescription
      .replace(/^#+\s+.+$/gm, '') // Remove markdown headers
      .replace(/^-\s+/gm, '')       // Remove bullet points
      .replace(/^```[\s\S]*?```/gm, '') // Remove code blocks
      .replace(/^\*\*/gm, '')       // Remove bold markers at start
      .trim();

    // Extract first 1-2 sentences (up to ~150 chars or 2 periods)
    const sentences = cleanDesc
      .split(/\.[\s\n]/)
      .filter(s => s.trim().length > 0 && !s.trim().startsWith('#'));

    if (sentences.length === 0) return 'No description available';

    // Take first sentence, or first two if first is very short
    let brief = sentences[0].trim();
    if (brief.length < 50 && sentences.length > 1) {
      brief += '. ' + sentences[1].trim();
    }

    // Clean up any remaining markdown
    brief = brief.replace(/\*\*/g, ''); // Remove bold
    brief = brief.replace(/\*/g, '');   // Remove italics

    // Ensure it ends with a period
    if (!brief.endsWith('.')) brief += '.';

    // Limit to ~150 chars
    if (brief.length > 150) {
      brief = brief.substring(0, 147) + '...';
    }

    return brief;
  }

  generateSubAgentListWithDescriptions(subAgents) {
    return subAgents.map(sa => {
      const briefDesc = this.extractBriefDescription(sa.description);
      return `| ${sa.name} | ${sa.code} | ${sa.activation_type} | ${sa.priority} |\n  ${briefDesc}`;
    }).join('\n');
  }

  generateSubAgentTriggers(subAgents) {
    const triggers = [];

    for (const sa of subAgents) {
      if (sa.triggers && sa.triggers.length > 0) {
        triggers.push(`\n#### ${sa.name} Triggers:`);
        triggers.push(sa.triggers.map(t =>
          `- "${t.trigger_phrase}" (${t.trigger_type}) in ${t.trigger_context || 'any'} context`
        ).join('\n'));
      }
    }

    return triggers.join('\n') || 'No triggers defined in database';
  }

  generateHandoffTemplates(templates) {
    if (templates.length === 0) return 'No templates in database';

    return templates.map(t => `
#### ${t.from_agent} → ${t.to_agent} (${t.handoff_type})
Elements: ${t.template_structure.sections ? t.template_structure.sections.join(', ') : 'Not defined'}
Required: ${t.required_elements ? t.required_elements.join(', ') : 'None'}
`).join('\n');
  }

  generateValidationRules(rules) {
    if (rules.length === 0) return 'No validation rules in database';

    return rules.map(r => `
- **${r.rule_name}** (${r.rule_type})
  - Severity: ${r.severity}
  - Definition: ${JSON.stringify(r.rule_definition)}
`).join('\n');
  }
}

// Export for use in other scripts
export { CLAUDEMDGeneratorV2 };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const generator = new CLAUDEMDGeneratorV2();
    await generator.generate();
  }

  main().catch(console.error);
}
