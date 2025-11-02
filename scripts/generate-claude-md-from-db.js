#!/usr/bin/env node
/**
 * Generate Modular CLAUDE Files from Database (V3 - Router Architecture)
 * Creates 5 files: CLAUDE.md (router), CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
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
  console.log('⚠️ CLAUDE files will not be updated');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class CLAUDEMDGeneratorV3 {
  constructor() {
    this.baseDir = path.join(__dirname, '..');
    this.mappingPath = path.join(__dirname, 'section-file-mapping.json');
    this.fileMapping = null;
  }

  loadMapping() {
    if (!fs.existsSync(this.mappingPath)) {
      throw new Error(`Mapping file not found: ${this.mappingPath}`);
    }
    this.fileMapping = JSON.parse(fs.readFileSync(this.mappingPath, 'utf-8'));
    console.log('✅ Loaded section-to-file mapping');
  }

  async generate() {
    console.log('🔄 Generating modular CLAUDE files from database (V3 - Router Architecture)...\n');

    try {
      // Load mapping
      this.loadMapping();

      // Fetch all required data
      const protocol = await this.getActiveProtocol();
      const agents = await this.getAgents();
      const subAgents = await this.getSubAgents();
      const handoffTemplates = await this.getHandoffTemplates();
      const validationRules = await this.getValidationRules();

      const data = {
        protocol,
        agents,
        subAgents,
        handoffTemplates,
        validationRules
      };

      // Generate each file
      console.log('📝 Generating files...\n');

      this.generateFile('CLAUDE.md', data, this.generateRouter.bind(this));
      this.generateFile('CLAUDE_CORE.md', data, this.generateCore.bind(this));
      this.generateFile('CLAUDE_LEAD.md', data, this.generateLead.bind(this));
      this.generateFile('CLAUDE_PLAN.md', data, this.generatePlan.bind(this));
      this.generateFile('CLAUDE_EXEC.md', data, this.generateExec.bind(this));

      console.log('\n✅ All CLAUDE files generated successfully!');
      console.log(`📄 Protocol Version: LEO v${protocol.version}`);
      console.log(`📊 Sub-agents: ${subAgents.length}`);
      console.log(`📋 Handoff templates: ${handoffTemplates.length}`);
      console.log(`📚 Protocol sections: ${protocol.sections.length}`);
      console.log('\n🎯 Router architecture implemented!');
      console.log('   → Initial context load: ~18k chars (9% of 200k budget)');
      console.log('   → Down from: 173k chars (87% of budget)');

    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  }

  generateFile(filename, data, generatorFn) {
    const filePath = path.join(this.baseDir, filename);
    const content = generatorFn(data);
    fs.writeFileSync(filePath, content);

    const size = (content.length / 1024).toFixed(1);
    const charCount = content.length;
    console.log(`   ✓ ${filename.padEnd(20)} ${size.padStart(6)} KB (${charCount} chars)`);
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

    // Get sections (ordered)
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

  getSectionsByMapping(sections, fileKey) {
    const mappedTypes = this.fileMapping[fileKey]?.sections || [];
    return sections.filter(s => mappedTypes.includes(s.section_type));
  }

  formatSection(section) {
    // Remove duplicate header if content already starts with ## Title
    let content = section.content;
    const headerPattern = new RegExp(`^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'i');
    content = content.replace(headerPattern, '');
    return `## ${section.title}\n\n${content}`;
  }

  getMetadata(protocol) {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();
    return { today, time, protocol };
  }

  generateRouter(data) {
    const { protocol } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get router-specific sections
    const fileWarning = sections.find(s => s.section_type === 'file_warning');
    const smartRouter = sections.find(s => s.section_type === 'smart_router');
    const sessionPrologue = sections.find(s => s.section_type === 'session_prologue');

    return `# CLAUDE.md - LEO Protocol Context Router

${fileWarning ? fileWarning.content : '⚠️ DO NOT EDIT THIS FILE DIRECTLY - Generated from database'}

${sessionPrologue ? this.formatSection(sessionPrologue) : ''}

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: ${today} ${time}
**Source**: Supabase Database (not files)
**Auto-Update**: Run \`node scripts/generate-claude-md-from-db.js\` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: ${protocol.version}

**CRITICAL**: This is the ACTIVE version from database
**ID**: ${protocol.id}
**Status**: ${protocol.status.toUpperCase()}
**Title**: ${protocol.title}

${smartRouter ? smartRouter.content : '## Context Router\n\n**Load Strategy**: Read CLAUDE_CORE.md first, then phase-specific files as needed.'}

---

*Router generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Part of LEO Protocol router architecture*
`;
  }

  generateCore(data) {
    const { protocol, agents } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get core sections
    const coreSections = this.getSectionsByMapping(sections, 'CLAUDE_CORE.md');
    const coreContent = coreSections.map(s => this.formatSection(s)).join('\n\n');

    return `# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

${coreContent}

## Agent Responsibilities

${this.generateAgentSection(agents)}

## Progress Calculation

\`\`\`
Total = ${agents.map(a => `${a.agent_code}: ${a.total_percentage}%`).join(' + ')} = 100%
\`\`\`

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load this file first in all sessions*
`;
  }

  generateLead(data) {
    const { protocol } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get LEAD sections
    const leadSections = this.getSectionsByMapping(sections, 'CLAUDE_LEAD.md');
    const leadContent = leadSections.map(s => this.formatSection(s)).join('\n\n');

    return `# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

${leadContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
`;
  }

  generatePlan(data) {
    const { protocol, handoffTemplates, validationRules } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get PLAN sections
    const planSections = this.getSectionsByMapping(sections, 'CLAUDE_PLAN.md');
    const planContent = planSections.map(s => this.formatSection(s)).join('\n\n');

    return `# CLAUDE_PLAN.md - PLAN Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: PLAN agent operations, PRD creation, validation gates (30-35k chars)

---

${planContent}

## Handoff Templates

${this.generateHandoffTemplates(handoffTemplates)}

## Validation Rules

${this.generateValidationRules(validationRules)}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions PLAN, PRD, validation, or testing strategy*
`;
  }

  generateExec(data) {
    const { protocol } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get EXEC sections
    const execSections = this.getSectionsByMapping(sections, 'CLAUDE_EXEC.md');
    const execContent = execSections.map(s => this.formatSection(s)).join('\n\n');

    return `# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: EXEC agent implementation requirements and testing (20-25k chars)

---

${execContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions EXEC, implementation, coding, or testing*
`;
  }

  generateAgentSection(agents) {
    let table = '| Agent | Code | Responsibilities | % Split |\n';
    table += '|-------|------|------------------|----------|\n';

    agents.forEach(agent => {
      const responsibilities = agent.responsibilities.substring(0, 80) + (agent.responsibilities.length > 80 ? '...' : '');
      const percentages = [];
      if (agent.planning_percentage) percentages.push(`P:${agent.planning_percentage}`);
      if (agent.implementation_percentage) percentages.push(`I:${agent.implementation_percentage}`);
      if (agent.verification_percentage) percentages.push(`V:${agent.verification_percentage}`);
      if (agent.approval_percentage) percentages.push(`A:${agent.approval_percentage}`);
      const split = percentages.join(' ') + ` = ${agent.total_percentage}%`;

      table += `| ${agent.name} | ${agent.agent_code} | ${responsibilities} | ${split} |\n`;
    });

    table += '\n**Legend**: P=Planning, I=Implementation, V=Verification, A=Approval\n';
    table += '**Total**: EXEC (30%) + LEAD (35%) + PLAN (35%) = 100%';

    return table;
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
export { CLAUDEMDGeneratorV3 };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const generator = new CLAUDEMDGeneratorV3();
    await generator.generate();
  }

  main().catch(console.error);
}
