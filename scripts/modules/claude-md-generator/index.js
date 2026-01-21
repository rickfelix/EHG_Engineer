/**
 * CLAUDE.md Generator Module
 * Main entry point for modular CLAUDE file generation
 */

import fs from 'fs';
import path from 'path';

import {
  getActiveProtocol,
  getAgents,
  getSubAgents,
  getHandoffTemplates,
  getValidationRules,
  getSchemaConstraints,
  getProcessScripts,
  getHotPatterns,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives
} from './db-queries.js';

import {
  generateRouter,
  generateCore,
  generateLead,
  generatePlan,
  generateExec
} from './file-generators.js';

/**
 * CLAUDE.md Generator V3 - Modular Architecture
 */
class CLAUDEMDGeneratorV3 {
  /**
   * Create a new generator instance
   * @param {Object} supabase - Supabase client
   * @param {string} baseDir - Base directory for output files
   * @param {string} mappingPath - Path to section-file-mapping.json
   */
  constructor(supabase, baseDir, mappingPath) {
    this.supabase = supabase;
    this.baseDir = baseDir;
    this.mappingPath = mappingPath;
    this.fileMapping = null;
  }

  /**
   * Load section-to-file mapping
   */
  loadMapping() {
    if (!fs.existsSync(this.mappingPath)) {
      throw new Error(`Mapping file not found: ${this.mappingPath}`);
    }
    this.fileMapping = JSON.parse(fs.readFileSync(this.mappingPath, 'utf-8'));
    console.log('Loaded section-to-file mapping');
  }

  /**
   * Generate all CLAUDE files
   */
  async generate() {
    console.log('Generating modular CLAUDE files from database (V3 - Router Architecture)...\n');

    try {
      this.loadMapping();

      const protocol = await getActiveProtocol(this.supabase);
      const agents = await getAgents(this.supabase);
      const subAgents = await getSubAgents(this.supabase);
      const handoffTemplates = await getHandoffTemplates(this.supabase);
      const validationRules = await getValidationRules(this.supabase);
      const schemaConstraints = await getSchemaConstraints(this.supabase);
      const processScripts = await getProcessScripts(this.supabase);
      const hotPatterns = await getHotPatterns(this.supabase, 5);
      const recentRetrospectives = await getRecentRetrospectives(this.supabase, 30, 5);
      const gateHealth = await getGateHealth(this.supabase);
      const pendingProposals = await getPendingProposals(this.supabase, 5);
      const autonomousDirectives = await getAutonomousDirectives(this.supabase);

      const data = {
        protocol,
        agents,
        subAgents,
        handoffTemplates,
        validationRules,
        schemaConstraints,
        processScripts,
        hotPatterns,
        recentRetrospectives,
        gateHealth,
        pendingProposals,
        autonomousDirectives
      };

      console.log('Generating files...\n');

      this.generateFile('CLAUDE.md', data, (d) => generateRouter(d, this.fileMapping));
      this.generateFile('CLAUDE_CORE.md', data, (d) => generateCore(d, this.fileMapping));
      this.generateFile('CLAUDE_LEAD.md', data, (d) => generateLead(d, this.fileMapping));
      this.generateFile('CLAUDE_PLAN.md', data, (d) => generatePlan(d, this.fileMapping));
      this.generateFile('CLAUDE_EXEC.md', data, (d) => generateExec(d, this.fileMapping));

      console.log('\nAll CLAUDE files generated successfully!');
      console.log(`Protocol Version: LEO v${protocol.version}`);
      console.log(`Sub-agents: ${subAgents.length}`);
      console.log(`Handoff templates: ${handoffTemplates.length}`);
      console.log(`Protocol sections: ${protocol.sections.length}`);
      console.log(`Hot patterns: ${hotPatterns.length}`);
      console.log(`Recent retrospectives: ${recentRetrospectives.length}`);
      console.log(`Pending proposals: ${pendingProposals.length}`);
      console.log(`Autonomous directives: ${autonomousDirectives.length}`);
      console.log('\nRouter architecture implemented!');
      console.log('   Initial context load: ~18k chars (9% of 200k budget)');
      console.log('   Down from: 173k chars (87% of budget)');
      console.log('   Now includes: operational intelligence (patterns + lessons)');

    } catch (error) {
      console.error('Generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate a single file
   * @param {string} filename - Output filename
   * @param {Object} data - Data for generation
   * @param {Function} generatorFn - Generator function
   */
  generateFile(filename, data, generatorFn) {
    const filePath = path.join(this.baseDir, filename);
    const content = generatorFn(data);
    fs.writeFileSync(filePath, content);

    const size = (content.length / 1024).toFixed(1);
    const charCount = content.length;
    console.log(`   ${filename.padEnd(20)} ${size.padStart(6)} KB (${charCount} chars)`);
  }
}

export { CLAUDEMDGeneratorV3 };

export {
  getActiveProtocol,
  getAgents,
  getSubAgents,
  getHandoffTemplates,
  getValidationRules,
  getSchemaConstraints,
  getProcessScripts,
  getHotPatterns,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives
} from './db-queries.js';

export {
  generateRouter,
  generateCore,
  generateLead,
  generatePlan,
  generateExec
} from './file-generators.js';

export {
  formatSection,
  getMetadata,
  generateAgentSection,
  generateSubAgentSection,
  generateTriggerQuickReference,
  generateHandoffTemplates,
  generateValidationRules,
  generateSchemaConstraintsSection,
  generateProcessScriptsSection
} from './section-formatters.js';

export {
  generateHotPatternsSection,
  generateRecentLessonsSection,
  generateGateHealthSection,
  generateProposalsSection,
  generateAutonomousDirectivesSection
} from './operational-sections.js';
