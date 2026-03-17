#!/usr/bin/env node
/**
 * Generate CLAUDE.md files from Database (V3 - Multi-File Context-Tiered)
 * Generates 5 files based on context_tier classification:
 * - CLAUDE.md (ROUTER tier)
 * - CLAUDE_CORE.md (CORE tier)
 * - CLAUDE_LEAD.md (CORE + PHASE_LEAD tiers)
 * - CLAUDE_PLAN.md (CORE + PHASE_PLAN tiers)
 * - CLAUDE_EXEC.md (CORE + PHASE_EXEC tiers)
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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class CLAUDEMDGeneratorV3 {
  constructor() {
    this.rootPath = path.join(__dirname, '..');
    this.refDocsPath = path.join(this.rootPath, 'docs', 'reference');
  }

  async generate() {
    console.log('🔄 Generating context-tiered CLAUDE files from database (V3)...\n');

    try {
      // Fetch protocol and metadata
      const protocol = await this.getActiveProtocol();
      const agents = await this.getAgents();
      const _subAgents = await this.getSubAgents();
      const _handoffTemplates = await this.getHandoffTemplates();

      // Get sections by tier
      const sections = await this.getSectionsByTier(protocol.id);

      console.log('📊 Section Distribution:');
      console.log(`   ROUTER: ${sections.ROUTER.length} sections`);
      console.log(`   CORE: ${sections.CORE.length} sections`);
      console.log(`   PHASE_LEAD: ${sections.PHASE_LEAD.length} sections`);
      console.log(`   PHASE_PLAN: ${sections.PHASE_PLAN.length} sections`);
      console.log(`   PHASE_EXEC: ${sections.PHASE_EXEC.length} sections`);
      console.log(`   REFERENCE: ${sections.REFERENCE.length} sections\n`);

      // Generate files
      const files = [];

      // 1. CLAUDE.md (Router only)
      const routerContent = this.generateRouter(sections.ROUTER);
      files.push({
        name: 'CLAUDE.md',
        content: routerContent,
        path: path.join(this.rootPath, 'CLAUDE.md')
      });

      // 2. CLAUDE_CORE.md (Core sections only)
      const coreContent = this.generateCoreFile(sections.CORE, protocol, agents);
      files.push({
        name: 'CLAUDE_CORE.md',
        content: coreContent,
        path: path.join(this.rootPath, 'CLAUDE_CORE.md')
      });

      // 3. CLAUDE_LEAD.md (Core + LEAD sections)
      const leadContent = this.generatePhaseFile('LEAD', sections.CORE, sections.PHASE_LEAD, protocol);
      files.push({
        name: 'CLAUDE_LEAD.md',
        content: leadContent,
        path: path.join(this.rootPath, 'CLAUDE_LEAD.md')
      });

      // 4. CLAUDE_PLAN.md (Core + PLAN sections)
      const planContent = this.generatePhaseFile('PLAN', sections.CORE, sections.PHASE_PLAN, protocol);
      files.push({
        name: 'CLAUDE_PLAN.md',
        content: planContent,
        path: path.join(this.rootPath, 'CLAUDE_PLAN.md')
      });

      // 5. CLAUDE_EXEC.md (Core + EXEC sections)
      const execContent = this.generatePhaseFile('EXEC', sections.CORE, sections.PHASE_EXEC, protocol);
      files.push({
        name: 'CLAUDE_EXEC.md',
        content: execContent,
        path: path.join(this.rootPath, 'CLAUDE_EXEC.md')
      });

      // Write all files
      console.log('📝 Writing files...\n');
      for (const file of files) {
        fs.writeFileSync(file.path, file.content);
        const sizeK = Math.round(file.content.length / 1000);
        console.log(`✅ ${file.name.padEnd(20)} | ${sizeK.toString().padStart(3)}k chars`);
      }

      // Extract reference docs (optional)
      if (sections.REFERENCE.length > 0) {
        await this.extractReferenceDocs(sections.REFERENCE);
      }

      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('🎯 Context Optimization Results:');
      console.log('='.repeat(60));
      const routerSize = Math.round(routerContent.length / 1000);
      const coreSize = Math.round(coreContent.length / 1000);
      const leadSize = Math.round(leadContent.length / 1000);
      const planSize = Math.round(planContent.length / 1000);
      const execSize = Math.round(execContent.length / 1000);

      console.log(`Session start:    Router (${routerSize}k) + Core (${coreSize}k) = ${routerSize + coreSize}k chars`);
      console.log(`With LEAD phase:  Core (${coreSize}k) + LEAD (${leadSize - coreSize}k) = ${leadSize}k chars`);
      console.log(`With PLAN phase:  Core (${coreSize}k) + PLAN (${planSize - coreSize}k) = ${planSize}k chars`);
      console.log(`With EXEC phase:  Core (${coreSize}k) + EXEC (${execSize - coreSize}k) = ${execSize}k chars`);
      console.log('\n💾 Context Savings:');
      console.log('   Before: 123k chars (old CLAUDE.md)');
      console.log(`   After:  ${routerSize + coreSize}k chars (router + core)`);
      console.log(`   Saved:  ${123 - (routerSize + coreSize)}k chars (${Math.round((123 - (routerSize + coreSize)) / 123 * 100)}% reduction)`);
      console.log('='.repeat(60));

      console.log('\n✅ Multi-file generation complete!');
      console.log(`📄 Protocol: LEO v${protocol.version}`);
      console.log(`📊 Total sections processed: ${Object.values(sections).flat().length}`);

    } catch (error) {
      console.error('❌ Generation failed:', error.message);
      console.error(error.stack);
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
      throw new Error('No active protocol found');
    }

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
      .select('*')
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

  async getSectionsByTier(protocolId) {
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .eq('protocol_id', protocolId)
      .order('order_index');

    if (error) {
      throw new Error(`Failed to get sections: ${error.message}`);
    }

    // Group by context_tier
    const grouped = {
      ROUTER: [],
      CORE: [],
      PHASE_LEAD: [],
      PHASE_PLAN: [],
      PHASE_EXEC: [],
      REFERENCE: []
    };

    for (const section of data) {
      const tier = section.context_tier || 'REFERENCE'; // Default to REFERENCE if not classified
      if (grouped[tier]) {
        grouped[tier].push(section);
      }
    }

    return grouped;
  }

  generateRouter(routerSections) {
    if (routerSections.length === 0) {
      return '# CLAUDE.md - Router section not found in database';
    }

    // Router should be a single section
    const router = routerSections[0];
    return router.content;
  }

  generateCoreFile(coreSections, protocol, agents) {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    let content = `# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: ${today} ${time}
**Protocol**: LEO v${protocol.version}
**Purpose**: Essential workflow context for all sessions (15k chars)

---

`;

    // Add each core section
    for (const section of coreSections) {
      content += `## ${section.title}\n\n${section.content}\n\n`;
    }

    // Add agent responsibilities table
    content += `## Agent Responsibilities\n\n${this.generateAgentTable(agents)}\n\n`;

    content += '---\n\n*Generated from database: leo_protocol_sections*\n';
    content += '*Context tier: CORE*\n';
    content += `*Protocol: ${protocol.version}*\n`;

    return content;
  }

  generatePhaseFile(phaseName, coreSections, phaseSections, protocol) {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    let content = `# CLAUDE_${phaseName}.md - LEO Protocol ${phaseName} Phase Context

**Generated**: ${today} ${time}
**Protocol**: LEO v${protocol.version}
**Purpose**: ${phaseName} phase operations + core context

---

## 📋 What's Included

This file contains:
1. **Core Context** (9 sections) - Essential for all sessions
2. **${phaseName} Phase Context** (${phaseSections.length} sections) - Phase-specific operations

**Total Size**: ~${Math.round((coreSections.length + phaseSections.length) * 3)}k chars

---

`;

    // Add core sections first
    content += '# CORE CONTEXT (Essential)\n\n';
    for (const section of coreSections) {
      content += `## ${section.title}\n\n${section.content}\n\n`;
    }

    // Add phase-specific sections
    content += `\n---\n\n# ${phaseName} PHASE CONTEXT\n\n`;
    for (const section of phaseSections) {
      content += `## ${section.title}\n\n${section.content}\n\n`;
    }

    content += '---\n\n*Generated from database: leo_protocol_sections*\n';
    content += `*Context tiers: CORE + PHASE_${phaseName}*\n`;
    content += `*Protocol: ${protocol.version}*\n`;

    return content;
  }

  async extractReferenceDocs(referenceSections) {
    console.log(`\n📂 Extracting ${referenceSections.length} reference docs to docs/reference/...\n`);

    // Create reference docs directory if it doesn't exist
    if (!fs.existsSync(this.refDocsPath)) {
      fs.mkdirSync(this.refDocsPath, { recursive: true });
    }

    let extracted = 0;
    for (const section of referenceSections) {
      // Generate filename from section_type
      const filename = `${section.section_type.replace(/_/g, '-')}.md`;
      const filepath = path.join(this.refDocsPath, filename);

      const content = `# ${section.title}

**Generated**: ${new Date().toISOString()}
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

${section.content}

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
`;

      fs.writeFileSync(filepath, content);
      extracted++;
    }

    console.log(`✅ Extracted ${extracted} reference docs to docs/reference/`);
  }

  generateAgentTable(agents) {
    let table = '| Agent | Code | Responsibilities | % Split |\n';
    table += '|-------|------|------------------|----------|\n';

    agents.forEach(agent => {
      const resp = agent.responsibilities.substring(0, 80) + '...';
      const percentages = [];
      if (agent.planning_percentage) percentages.push(`P:${agent.planning_percentage}`);
      if (agent.implementation_percentage) percentages.push(`I:${agent.implementation_percentage}`);
      if (agent.verification_percentage) percentages.push(`V:${agent.verification_percentage}`);
      if (agent.approval_percentage) percentages.push(`A:${agent.approval_percentage}`);
      const split = percentages.join(' ') + ` = ${agent.total_percentage}%`;

      table += `| ${agent.name} | ${agent.agent_code} | ${resp} | ${split} |\n`;
    });

    table += '\n**Legend**: P=Planning, I=Implementation, V=Verification, A=Approval\n';
    table += '**Total**: EXEC (30%) + LEAD (35%) + PLAN (35%) = 100%';

    return table;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const generator = new CLAUDEMDGeneratorV3();
    await generator.generate();
  }

  main().catch(console.error);
}

export { CLAUDEMDGeneratorV3 };
