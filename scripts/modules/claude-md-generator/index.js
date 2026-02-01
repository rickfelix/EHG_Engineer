/**
 * CLAUDE.md Generator Module
 * Main entry point for modular CLAUDE file generation
 *
 * Supports dual-generation (FULL + DIGEST) per SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

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

import {
  generateRouterDigest,
  generateCoreDigest,
  generateLeadDigest,
  generatePlanDigest,
  generateExecDigest
} from './digest-generators.js';

/**
 * CLAUDE.md Generator V3 - Modular Architecture with Dual Generation
 *
 * Generates both FULL and DIGEST protocol files from the same DB snapshot.
 * Per SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001
 */
class CLAUDEMDGeneratorV3 {
  /**
   * Create a new generator instance
   * @param {Object} supabase - Supabase client
   * @param {string} baseDir - Base directory for output files
   * @param {string} mappingPath - Path to section-file-mapping.json
   * @param {Object} options - Generation options
   */
  constructor(supabase, baseDir, mappingPath, options = {}) {
    this.supabase = supabase;
    this.baseDir = baseDir;
    this.mappingPath = mappingPath;
    this.digestMappingPath = mappingPath.replace('.json', '-digest.json');
    this.fileMapping = null;
    this.digestMapping = null;
    this.options = {
      generateDigest: options.generateDigest !== false, // Default: true
      tokenBudget: options.tokenBudget || 25000,
      ...options
    };
    this.manifest = {
      generated_at: null,
      git_commit: null,
      db_snapshot_hash: null,
      files: {}
    };
  }

  /**
   * Compute SHA-256 hash of content
   * @param {string} content - Content to hash
   * @returns {string} Hex hash
   */
  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get current git commit SHA
   * @returns {string} Git commit SHA or 'unknown'
   */
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().substring(0, 8);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Compute DB snapshot hash from data
   * @param {Object} data - All data from database
   * @returns {string} Hash representing DB state
   */
  computeDbSnapshotHash(data) {
    const snapshot = JSON.stringify({
      protocolId: data.protocol?.id,
      protocolVersion: data.protocol?.version,
      sectionCount: data.protocol?.sections?.length,
      subAgentCount: data.subAgents?.length,
      hotPatternsHash: this.computeHash(JSON.stringify(data.hotPatterns || [])),
      retrospectivesHash: this.computeHash(JSON.stringify(data.recentRetrospectives || []))
    });
    return this.computeHash(snapshot);
  }

  /**
   * Estimate token count (rough: 4 chars per token)
   * @param {string} content - Content to measure
   * @returns {number} Estimated tokens
   */
  estimateTokens(content) {
    return Math.ceil(content.length / 4);
  }

  /**
   * Load section-to-file mappings (full and digest)
   */
  loadMappings() {
    if (!fs.existsSync(this.mappingPath)) {
      throw new Error(`Mapping file not found: ${this.mappingPath}`);
    }
    this.fileMapping = JSON.parse(fs.readFileSync(this.mappingPath, 'utf-8'));
    console.log('Loaded section-to-file mapping (FULL)');

    if (this.options.generateDigest) {
      if (!fs.existsSync(this.digestMappingPath)) {
        throw new Error(`Digest mapping file not found: ${this.digestMappingPath}`);
      }
      this.digestMapping = JSON.parse(fs.readFileSync(this.digestMappingPath, 'utf-8'));
      console.log('Loaded section-to-file mapping (DIGEST)');
    }
  }

  /**
   * Generate all CLAUDE files (FULL + DIGEST)
   * @returns {Object} Generation manifest
   */
  async generate() {
    console.log('Generating modular CLAUDE files from database (V3.1 - Dual Generation)...\n');

    try {
      this.loadMappings();

      // Fetch all data from database
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

      // Initialize manifest
      this.manifest.generated_at = new Date().toISOString();
      this.manifest.git_commit = this.getGitCommit();
      this.manifest.db_snapshot_hash = this.computeDbSnapshotHash(data);

      // Metadata for digest headers
      const digestMetadata = {
        generatedAt: this.manifest.generated_at,
        gitCommit: this.manifest.git_commit,
        dbSnapshotHash: this.manifest.db_snapshot_hash
      };

      console.log('=== FULL FILES ===\n');

      // Generate FULL files
      this.generateFile('CLAUDE.md', data, (d) => generateRouter(d, this.fileMapping), 'full');
      this.generateFile('CLAUDE_CORE.md', data, (d) => generateCore(d, this.fileMapping), 'full');
      this.generateFile('CLAUDE_LEAD.md', data, (d) => generateLead(d, this.fileMapping), 'full');
      this.generateFile('CLAUDE_PLAN.md', data, (d) => generatePlan(d, this.fileMapping), 'full');
      this.generateFile('CLAUDE_EXEC.md', data, (d) => generateExec(d, this.fileMapping), 'full');

      // Calculate FULL totals
      const fullFiles = Object.entries(this.manifest.files).filter(([_, f]) => f.type === 'full');
      const fullTotalChars = fullFiles.reduce((sum, [_, f]) => sum + f.chars, 0);
      const fullTotalTokens = fullFiles.reduce((sum, [_, f]) => sum + f.estimated_tokens, 0);

      console.log(`\n   FULL Total: ${(fullTotalChars / 1024).toFixed(1)} KB (~${fullTotalTokens} tokens)`);

      // Generate DIGEST files if enabled
      if (this.options.generateDigest) {
        console.log('\n=== DIGEST FILES ===\n');

        this.generateFile('CLAUDE_DIGEST.md', data,
          (d) => generateRouterDigest(d, this.digestMapping, digestMetadata), 'digest');
        this.generateFile('CLAUDE_CORE_DIGEST.md', data,
          (d) => generateCoreDigest(d, this.digestMapping, digestMetadata), 'digest');
        this.generateFile('CLAUDE_LEAD_DIGEST.md', data,
          (d) => generateLeadDigest(d, this.digestMapping, digestMetadata), 'digest');
        this.generateFile('CLAUDE_PLAN_DIGEST.md', data,
          (d) => generatePlanDigest(d, this.digestMapping, digestMetadata), 'digest');
        this.generateFile('CLAUDE_EXEC_DIGEST.md', data,
          (d) => generateExecDigest(d, this.digestMapping, digestMetadata), 'digest');

        // Calculate DIGEST totals
        const digestFiles = Object.entries(this.manifest.files).filter(([_, f]) => f.type === 'digest');
        const digestTotalChars = digestFiles.reduce((sum, [_, f]) => sum + f.chars, 0);
        const digestTotalTokens = digestFiles.reduce((sum, [_, f]) => sum + f.estimated_tokens, 0);

        console.log(`\n   DIGEST Total: ${(digestTotalChars / 1024).toFixed(1)} KB (~${digestTotalTokens} tokens)`);

        // Check token budget
        if (digestTotalTokens > this.options.tokenBudget) {
          console.error(`\n   TOKEN BUDGET EXCEEDED: ${digestTotalTokens} > ${this.options.tokenBudget}`);
          console.error('   Per-file breakdown:');
          digestFiles.forEach(([name, f]) => {
            console.error(`     ${name}: ${f.estimated_tokens} tokens`);
          });
          throw new Error(`DIGEST token budget exceeded: ${digestTotalTokens} > ${this.options.tokenBudget}`);
        } else {
          console.log(`   Token budget OK: ${digestTotalTokens}/${this.options.tokenBudget} (${Math.round(digestTotalTokens / this.options.tokenBudget * 100)}%)`);
        }

        // Calculate savings
        const savingsPercent = Math.round((1 - digestTotalTokens / fullTotalTokens) * 100);
        console.log(`\n   Token Savings: ${savingsPercent}% (${fullTotalTokens - digestTotalTokens} tokens saved)`);
      }

      // Write manifest
      this.writeManifest();

      console.log('\n=== SUMMARY ===');
      console.log(`Protocol Version: LEO v${protocol.version}`);
      console.log(`DB Snapshot Hash: ${this.manifest.db_snapshot_hash}`);
      console.log(`Git Commit: ${this.manifest.git_commit}`);
      console.log(`Files Generated: ${Object.keys(this.manifest.files).length}`);
      console.log(`Manifest: claude-generation-manifest.json`);

      return this.manifest;

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
   * @param {string} type - File type ('full' or 'digest')
   */
  generateFile(filename, data, generatorFn, type = 'full') {
    const filePath = path.join(this.baseDir, filename);
    const content = generatorFn(data);
    const contentHash = this.computeHash(content);

    fs.writeFileSync(filePath, content);

    const size = (content.length / 1024).toFixed(1);
    const charCount = content.length;
    const tokens = this.estimateTokens(content);

    // Add to manifest
    this.manifest.files[filename] = {
      type,
      chars: charCount,
      estimated_tokens: tokens,
      content_hash: contentHash,
      path: filePath
    };

    console.log(`   ${filename.padEnd(25)} ${size.padStart(6)} KB  ~${String(tokens).padStart(5)} tokens  [${contentHash}]`);
  }

  /**
   * Write generation manifest to file
   */
  writeManifest() {
    const manifestPath = path.join(this.baseDir, 'claude-generation-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2));
    console.log(`\nManifest written: claude-generation-manifest.json`);
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

export {
  generateRouterDigest,
  generateCoreDigest,
  generateLeadDigest,
  generatePlanDigest,
  generateExecDigest
} from './digest-generators.js';
