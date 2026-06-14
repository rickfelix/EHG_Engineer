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
import { writeFileAtomic } from '../../../lib/utils/atomic-write.js';

import {
  getActiveProtocol,
  getAgents,
  getSubAgents,
  getHandoffTemplates,
  getValidationRules,
  getSchemaConstraints,
  getProcessScripts,
  getHotPatterns,
  getKnownFrictionPoints,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives,
  getVisionGapInsights
} from './db-queries.js';

import {
  generateRouter,
  generateCore,
  generateLead,
  generatePlan,
  generateExec,
  generateAdam
} from './file-generators.js';

import {
  generateRouterDigest,
  generateCoreDigest,
  generateLeadDigest,
  generatePlanDigest,
  generateExecDigest,
  generateAdamDigest
} from './digest-generators.js';

// SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-5): every generated file carries a
// prominent DO-NOT-edit banner. It is DETERMINISTIC (no timestamp), so it is identically
// present in both the in-memory render and the on-disk file and never causes a drift
// false-positive. Pure ASCII to keep the byte-comparison encoding-stable.
export const GENERATED_BANNER = '<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->';

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
   * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): the single ordered list of every
   * generated file and its generator fn. generate() (write path) and renderAll() (the
   * drift-check render path) BOTH iterate this — ONE source of truth, never a divergent
   * re-derivation. Digest files are included only when generateDigest is enabled.
   * @param {Object} digestMetadata - { generatedAt, gitCommit, dbSnapshotHash }
   * @returns {Array<[string, Function, string]>} [filename, generatorFn, type]
   */
  getFileSpecs(digestMetadata) {
    const specs = [
      ['CLAUDE.md', (d) => generateRouter(d, this.fileMapping), 'full'],
      ['CLAUDE_CORE.md', (d) => generateCore(d, this.fileMapping), 'full'],
      ['CLAUDE_LEAD.md', (d) => generateLead(d, this.fileMapping), 'full'],
      ['CLAUDE_PLAN.md', (d) => generatePlan(d, this.fileMapping), 'full'],
      ['CLAUDE_EXEC.md', (d) => generateExec(d, this.fileMapping), 'full'],
      ['CLAUDE_ADAM.md', (d) => generateAdam(d, this.fileMapping), 'full'],
    ];
    if (this.options.generateDigest) {
      specs.push(
        ['CLAUDE_DIGEST.md', (d) => generateRouterDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_CORE_DIGEST.md', (d) => generateCoreDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_LEAD_DIGEST.md', (d) => generateLeadDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_PLAN_DIGEST.md', (d) => generatePlanDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_EXEC_DIGEST.md', (d) => generateExecDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_ADAM_DIGEST.md', (d) => generateAdamDigest(d, this.digestMapping, digestMetadata), 'digest'],
      );
    }
    return specs;
  }

  /**
   * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): load every DB input + init the
   * manifest header (generated_at / git_commit / db_snapshot_hash) and the digest metadata.
   * Extracted from generate() so renderAll() (the drift check) consumes IDENTICAL inputs
   * without re-deriving the fetches.
   * @returns {Promise<{ data: Object, digestMetadata: Object, protocol: Object }>}
   */
  async loadData() {
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
    // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-4b: known friction points from worker /signal aggregation
    const knownFrictionPoints = await getKnownFrictionPoints(this.supabase, 5);
    const recentRetrospectives = await getRecentRetrospectives(this.supabase, 30, 5);
    const gateHealth = await getGateHealth(this.supabase);
    const pendingProposals = await getPendingProposals(this.supabase, 5);
    const autonomousDirectives = await getAutonomousDirectives(this.supabase);
    // SD-LEO-INFRA-VISION-PROTOCOL-FEEDBACK-001: live VGAP data for protocol injection
    const visionGapInsights = await getVisionGapInsights(this.supabase, 3);

    const data = {
      protocol,
      agents,
      subAgents,
      handoffTemplates,
      validationRules,
      schemaConstraints,
      processScripts,
      hotPatterns,
      knownFrictionPoints,
      recentRetrospectives,
      gateHealth,
      pendingProposals,
      autonomousDirectives,
      visionGapInsights
    };

    // Initialize manifest header
    this.manifest.generated_at = new Date().toISOString();
    this.manifest.git_commit = this.getGitCommit();
    this.manifest.db_snapshot_hash = this.computeDbSnapshotHash(data);
    // SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1): persist per-section content digests
    // so the drift check can detect a section CONTENT edit (which the coarse db_snapshot_hash,
    // a count-only hash, misses) WITHOUT false positives from rendered-file telemetry/timestamps.
    this.manifest.section_digests = computeSectionDigests(protocol.sections);

    // Metadata for digest headers
    const digestMetadata = {
      generatedAt: this.manifest.generated_at,
      gitCommit: this.manifest.git_commit,
      dbSnapshotHash: this.manifest.db_snapshot_hash
    };

    return { data, digestMetadata, protocol };
  }

  /**
   * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): pure render of one file's FINAL
   * content (FR-5 banner + file_content_hash injected), with NO disk write and NO manifest
   * mutation. generateFile() calls this then writes; renderAll() calls this and compares.
   * One render path => the drift check can never diverge from what is actually written.
   * @returns {string} final content, identical to what generateFile() writes
   */
  renderFileContent(generatorFn, data) {
    let content = generatorFn(data);

    // FR-5: prepend the deterministic GENERATED banner (idempotent).
    if (!content.startsWith(GENERATED_BANNER)) {
      content = `${GENERATED_BANNER}\n${content}`;
    }

    // file_content_hash: body = content minus the hash line; header = sha256(body)[:16].
    const HASH_LINE_RE = /^<!-- file_content_hash: [^>]*-->\r?\n/m;
    if (HASH_LINE_RE.test(content)) {
      const body = content.replace(HASH_LINE_RE, '');
      const bodyHash = this.computeHash(body);
      content = content.replace(HASH_LINE_RE, `<!-- file_content_hash: ${bodyHash} -->\n`);
    } else {
      const bodyHash = this.computeHash(content);
      content = `<!-- file_content_hash: ${bodyHash} -->\n${content}`;
    }
    return content;
  }

  /**
   * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): render every generated file in
   * memory from the live DB and return { filename: content } WITHOUT writing to disk or
   * mutating the manifest. This is the render half of the drift-check primitive
   * (scripts/check-claude-md-drift.cjs).
   * @returns {Promise<Object<string,string>>}
   */
  async renderAll() {
    const { data, digestMetadata } = await this.loadData();
    const rendered = {};
    for (const [filename, generatorFn] of this.getFileSpecs(digestMetadata)) {
      rendered[filename] = this.renderFileContent(generatorFn, data);
    }
    return rendered;
  }

  /**
   * Generate all CLAUDE files (FULL + DIGEST)
   * @returns {Object} Generation manifest
   */
  async generate() {
    console.log('Generating modular CLAUDE files from database (V3.1 - Dual Generation)...\n');

    try {
      const { data, digestMetadata, protocol } = await this.loadData();

      console.log('=== GENERATING FILES (FULL + DIGEST) ===\n');
      // SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): iterate the single getFileSpecs()
      // list so the write path and the drift-check render path never diverge.
      for (const [filename, generatorFn, type] of this.getFileSpecs(digestMetadata)) {
        this.generateFile(filename, data, generatorFn, type);
      }

      // Totals + token-budget enforcement (computed from the populated manifest).
      const fullFiles = Object.entries(this.manifest.files).filter(([_, f]) => f.type === 'full');
      const digestFiles = Object.entries(this.manifest.files).filter(([_, f]) => f.type === 'digest');
      const fullTotalTokens = fullFiles.reduce((sum, [_, f]) => sum + f.estimated_tokens, 0);
      const digestTotalTokens = digestFiles.reduce((sum, [_, f]) => sum + f.estimated_tokens, 0);

      if (this.options.generateDigest && digestFiles.length > 0) {
        if (digestTotalTokens > this.options.tokenBudget) {
          console.error(`\n   TOKEN BUDGET EXCEEDED: ${digestTotalTokens} > ${this.options.tokenBudget}`);
          console.error('   Per-file breakdown:');
          digestFiles.forEach(([name, f]) => {
            console.error(`     ${name}: ${f.estimated_tokens} tokens`);
          });
          throw new Error(`DIGEST token budget exceeded: ${digestTotalTokens} > ${this.options.tokenBudget}`);
        }
        console.log(`   Token budget OK: ${digestTotalTokens}/${this.options.tokenBudget} (${Math.round(digestTotalTokens / this.options.tokenBudget * 100)}%)`);
        if (fullTotalTokens > 0) {
          const savingsPercent = Math.round((1 - digestTotalTokens / fullTotalTokens) * 100);
          console.log(`   Token Savings: ${savingsPercent}% (${fullTotalTokens - digestTotalTokens} tokens saved)`);
        }
      }

      // Write manifest
      this.writeManifest();

      console.log('\n=== SUMMARY ===');
      console.log(`Protocol Version: LEO v${protocol.version}`);
      console.log(`DB Snapshot Hash: ${this.manifest.db_snapshot_hash}`);
      console.log(`Git Commit: ${this.manifest.git_commit}`);
      console.log(`Files Generated: ${Object.keys(this.manifest.files).length}`);
      console.log('Manifest: claude-generation-manifest.json');

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
    // SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-4): --only scoped regen.
    // options.only = array of filenames; anything else is skipped (not rendered,
    // not written, not in the manifest) so untouched files stay byte-identical.
    if (Array.isArray(this.options.only) && this.options.only.length > 0 &&
        !this.options.only.includes(filename)) {
      console.log(`   ${filename.padEnd(25)} skipped (--only)`);
      return;
    }

    const filePath = path.join(this.baseDir, filename);
    // SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1b): single shared render path
    // (FR-5 banner + file_content_hash injection) — byte-identical to renderAll()'s
    // output, so the drift check can never diverge from what is written here.
    const content = this.renderFileContent(generatorFn, data);
    const contentHash = this.computeHash(content);

    writeFileAtomic(filePath, content);

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
    writeFileAtomic(manifestPath, JSON.stringify(this.manifest, null, 2));
    console.log('\nManifest written: claude-generation-manifest.json');
  }
}

export { CLAUDEMDGeneratorV3 };

// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-4): the complete generated-file
// set, used to validate --only targets (unknown names fail loud listing these).
export const KNOWN_GENERATED_FILES = [
  'CLAUDE.md', 'CLAUDE_CORE.md', 'CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_EXEC.md', 'CLAUDE_ADAM.md',
  'CLAUDE_DIGEST.md', 'CLAUDE_CORE_DIGEST.md', 'CLAUDE_LEAD_DIGEST.md', 'CLAUDE_PLAN_DIGEST.md', 'CLAUDE_EXEC_DIGEST.md', 'CLAUDE_ADAM_DIGEST.md',
];

// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-3): verify a generated file's
// header hash against its body. Contract (mirrors generateFile): body = content with
// the single `<!-- file_content_hash: ... -->` line removed; expected = sha256(body)[:16].
// Returns { ok, expected, actual } — ok=false with actual=null when no hash line exists
// (pre-FR-3 file or hand-edited header), making staleness/tamper checks one call.
// SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1): content-aware per-section digest of
// leo_protocol_sections — the SOURCE prose that determines the generated docs, and the only
// sound drift signal. (The coarse db_snapshot_hash hashes section COUNT, not content; the
// rendered files additionally embed volatile live telemetry — hotPatterns/gateHealth/retros —
// so neither a count hash nor a render-diff is a reliable drift detector.) Hashes ONLY the
// stable rendering-relevant fields, never volatile row metadata (updated_at/created_at).
// Single source of the hashing logic — imported by scripts/check-claude-md-drift.cjs so the
// writer (manifest) and the consumer (drift check) can never diverge.
// @param {Array<Object>} sections - leo_protocol_sections rows for the active protocol
// @returns {{ global: string, byId: Object<string,string>, meta: Object<string,Object> }}
export function computeSectionDigests(sections) {
  const byId = {};
  const meta = {};
  const seq = [];
  // Iterate in the PASSED (render) order — callers pass protocol.sections exactly as
  // getActiveProtocol returns them (deterministic via the order_index,id sort), so the
  // `global` hash below faithfully reflects rendered section order. Do NOT re-sort here, or
  // the digest would decouple from the renderer (the false-negative this guard exists to avoid).
  for (const s of (sections || [])) {
    const id = String(s.id);
    // Hash ONLY fields that flow into rendered output: section_type (controls file membership
    // via section-file-mapping), title + content (the body), and order_index (controls section
    // ORDER). context_tier and the target_file COLUMN are intentionally excluded — neither is
    // rendered (placement is keyed off section_type via the mapping), so hashing them produced
    // false-positive "drift" on edits that change no rendered byte.
    const payload = JSON.stringify({
      section_type: s.section_type ?? null,
      title: s.title ?? null,
      content: s.content ?? null,
      order_index: s.order_index ?? null,
    });
    const h = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    byId[id] = h;
    meta[id] = { section_type: s.section_type ?? null, target_file: s.target_file ?? null, title: s.title ?? null };
    seq.push(`${id}:${h}`);
  }
  // global = hash over the render-order sequence, so a pure REORDERING (no per-section content
  // change) still flips global and is caught by diffSectionDigests (which consults globalMatch).
  const global = crypto.createHash('sha256').update(seq.join('|')).digest('hex').substring(0, 16);
  return { global, byId, meta };
}

export function verifyFileContentHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const m = content.match(/^<!-- file_content_hash: ([0-9a-f]{16}) -->\r?\n/m);
  if (!m) return { ok: false, expected: null, actual: null };
  const body = content.replace(/^<!-- file_content_hash: [^>]*-->\r?\n/m, '');
  const expected = crypto.createHash('sha256').update(body).digest('hex').substring(0, 16);
  return { ok: expected === m[1], expected, actual: m[1] };
}

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
