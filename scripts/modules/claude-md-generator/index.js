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
  generateAdam,
  generateCoordinator,
  generateSolomon,
  generateAdamManual,
  generateAdamProvenance,
  assertSharedSectionsNotCopied
} from './file-generators.js';

import {
  generateRouterDigest,
  generateCoreDigest,
  generateLeadDigest,
  generatePlanDigest,
  generateExecDigest,
  generateAdamDigest,
  generateCoordinatorDigest,
  generateSolomonDigest
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
      // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-2 (chairman decision A-GOVERN). The
      // contract references both companions BY NAME; before this they were generated by nothing,
      // which made the reference a forwarding address with no forwarding.
      ['CLAUDE_ADAM_MANUAL.md', (d) => generateAdamManual(d, this.fileMapping), 'full'],
      ['CLAUDE_ADAM_PROVENANCE.md', (d) => generateAdamProvenance(d, this.fileMapping), 'full'],
      ['CLAUDE_COORDINATOR.md', (d) => generateCoordinator(d, this.fileMapping), 'full'],
      ['CLAUDE_SOLOMON.md', (d) => generateSolomon(d, this.fileMapping), 'full'],
    ];
    if (this.options.generateDigest) {
      specs.push(
        ['CLAUDE_DIGEST.md', (d) => generateRouterDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_CORE_DIGEST.md', (d) => generateCoreDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_LEAD_DIGEST.md', (d) => generateLeadDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_PLAN_DIGEST.md', (d) => generatePlanDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_EXEC_DIGEST.md', (d) => generateExecDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_ADAM_DIGEST.md', (d) => generateAdamDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_COORDINATOR_DIGEST.md', (d) => generateCoordinatorDigest(d, this.digestMapping, digestMetadata), 'digest'],
        ['CLAUDE_SOLOMON_DIGEST.md', (d) => generateSolomonDigest(d, this.digestMapping, digestMetadata), 'digest'],
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

    // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 (FR-4): refuse to render when a section shared by
    // two output files has been COPIED into another section instead of included from its one
    // governed row. Checked HERE rather than in generate() so the drift-check render path
    // (renderAll) is held to the same rule — a duplicate that only the write path rejects would
    // still show green on the check people actually run.
    assertSharedSectionsNotCopied(protocol.sections, this.fileMapping);

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

    // file_content_hash: body = content minus every VOLATILE line (see stripVolatileLines);
    // header = sha256(body)[:16]. QF-20260727-510 — the hash previously excluded only its own
    // line, so the generation timestamp sat INSIDE the hashed region and the hash could never
    // answer "did the content actually change?" with no. The guard defeated itself.
    const HASH_LINE_RE = /^<!-- file_content_hash: [^>]*-->\r?\n/m;
    const bodyHash = this.computeHash(stripVolatileLines(content));
    if (HASH_LINE_RE.test(content)) {
      content = content.replace(HASH_LINE_RE, `<!-- file_content_hash: ${bodyHash} -->\n`);
    } else {
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
    // QF-20260727-510 (c): hash the STRIPPED body, not the raw render. This value is stored as
    // the manifest's per-file content_hash, and hashing the timestamped render made all 16
    // entries change on every run — which churned the manifest even once the .md files
    // themselves had stopped moving. Measured: two consecutive runs differed ONLY in
    // generated_at and all 16 content_hash values. Same input as the header hash, so the two
    // now agree by construction instead of by coincidence.
    const contentHash = this.computeHash(stripVolatileLines(content));

    // QF-20260727-510 (b) — SKIP THE WRITE when the substantive body is unchanged.
    //
    // (a) alone makes the hash HONEST; it does not stop the churn, because the rendered
    // content still carries a fresh timestamp and writing it still dirties the file. This is
    // the half that actually keeps the shared root clean: regeneration with no DB change
    // becomes a true no-op, so `git status --porcelain` stays clean, shared-root-freshness can
    // pull again, and tree-currency stops refusing spawns from an un-healable tree.
    //
    // Compared on the STRIPPED body, so a differing timestamp alone is not a reason to write.
    // Fail-OPEN by design: any read problem (missing file, unreadable, first generation) falls
    // through to the write. A generator that silently skipped writing because it could not read
    // the old file would be a far worse defect than an extra write.
    let unchanged = false;
    try {
      if (fs.existsSync(filePath)) {
        const onDisk = fs.readFileSync(filePath, 'utf-8');
        unchanged = this.computeHash(stripVolatileLines(onDisk)) === this.computeHash(stripVolatileLines(content));
      }
    } catch {
      unchanged = false; // unreadable -> write
    }

    if (!unchanged) writeFileAtomic(filePath, content);

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

    // QF-20260727-510 (c) — the manifest churned 34+34 lines per run for the same reason the
    // .md files did: it stores the self-invalidating hashes plus its own volatile stamps. With
    // (a) the per-file hashes are now stable, so the only remaining churn is metadata that
    // carries no information about whether the protocol content changed.
    //
    // `path` is included in the ignore set deliberately, and it is NOT in the row: the manifest
    // records ABSOLUTE paths, so regenerating from any linked worktree rewrites all 16 of them
    // to that worktree's location and dirties the tracked file in the shared root. Comparing
    // without them stops a worktree run from claiming the shared root's manifest. The values are
    // still written whenever a real change lands; they are only excluded from the "did anything
    // meaningful change?" decision.
    //
    // Same fail-OPEN posture as the file write: any read/parse problem falls through to writing.
    // Canonical (key-ORDER-independent) serialisation. JSON.stringify preserves insertion
    // order, so the parsed on-disk object and the freshly-built one can hold identical content
    // yet stringify differently — which silently defeated the skip on the first attempt and
    // rewrote the manifest every run for a differing `generated_at` alone. Sort keys so the
    // comparison is about CONTENT, not construction order.
    const canonical = (v) => {
      if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
      if (v && typeof v === 'object') {
        return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
      }
      return JSON.stringify(v);
    };
    const stripManifestVolatile = (m) => {
      try {
        const { generated_at: _g, git_commit: _c, ...rest } = m || {};
        const files = Object.fromEntries(
          Object.entries(rest.files || {}).map(([k, v]) => {
            const { path: _p, ...fileRest } = v || {};
            return [k, fileRest];
          }),
        );
        return canonical({ ...rest, files });
      } catch { return null; }
    };

    let manifestUnchanged = false;
    try {
      if (fs.existsSync(manifestPath)) {
        const onDisk = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const a = stripManifestVolatile(onDisk);
        const b = stripManifestVolatile(this.manifest);
        manifestUnchanged = a !== null && b !== null && a === b;
      }
    } catch {
      manifestUnchanged = false;
    }

    if (!manifestUnchanged) writeFileAtomic(manifestPath, JSON.stringify(this.manifest, null, 2));
    console.log('\nManifest written: claude-generation-manifest.json');
  }
}

export { CLAUDEMDGeneratorV3 };

// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-4): the complete generated-file
// set, used to validate --only targets (unknown names fail loud listing these).
export const KNOWN_GENERATED_FILES = [
  'CLAUDE.md', 'CLAUDE_CORE.md', 'CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_EXEC.md', 'CLAUDE_ADAM.md', 'CLAUDE_ADAM_MANUAL.md', 'CLAUDE_ADAM_PROVENANCE.md', 'CLAUDE_COORDINATOR.md', 'CLAUDE_SOLOMON.md',
  'CLAUDE_DIGEST.md', 'CLAUDE_CORE_DIGEST.md', 'CLAUDE_LEAD_DIGEST.md', 'CLAUDE_PLAN_DIGEST.md', 'CLAUDE_EXEC_DIGEST.md', 'CLAUDE_ADAM_DIGEST.md', 'CLAUDE_COORDINATOR_DIGEST.md', 'CLAUDE_SOLOMON_DIGEST.md',
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

/**
 * QF-20260727-510 — strip every line whose value changes on EVERY regeneration regardless of
 * whether the DB content changed, so file_content_hash means what it claims: "did the
 * substantive body change?"
 *
 * THE SELF-DEFEATING GUARD THIS FIXES. The hash previously excluded only its own line, so the
 * generation timestamp was INSIDE the hashed region. Every regeneration therefore produced a
 * different hash even when the protocol text was byte-identical, which dirtied ~17 tracked
 * files (CLAUDE.md + the CLAUDE_* family + their _DIGEST siblings + the manifest) on every run.
 *
 * THAT NOISE BROKE TWO SAFETY MECHANISMS AND ONE OPERATOR ACTION:
 *   - shared-root-freshness pulls only when `git status --porcelain` is clean, so it could
 *     NEVER pull and the shared root could not self-heal;
 *   - tree-currency refuses to spawn from a stale tree that is not safely healable, and
 *     dirty=true is exactly what makes it unhealable;
 *   - observed live: the chairman clicked "Start the coordinator" and got
 *     "[tree-currency] REFUSED ... NOT safely healable (dirty=true)". The guard was working
 *     correctly on a tree a generator had made permanently un-healable.
 *
 * The line shapes below were ENUMERATED FROM THE LIVE GENERATED FILES, not guessed:
 *   <!-- file_content_hash: … -->   the hash's own line (cannot hash itself)
 *   <!-- generated_at: … -->        DIGEST header timestamp
 *   <!-- git_commit: … -->          DIGEST header commit stamp — changes with HEAD, not content
 *   **Generated**: …                CLAUDE_CORE and siblings
 *   *DIGEST generated: …*           DIGEST footer
 *   *Generated: … | Protocol: … | Source: Database*   CLAUDE.md footer
 *
 * The timestamp is deliberately NOT removed from the files — the row forbids that without
 * checking readers. It stays visible; it simply stops being hashed.
 *
 * MUST be shared by the compute and verify sides. If they ever strip different sets, the drift
 * check (scripts/check-claude-md-drift.cjs) reports drift on every file forever.
 */
const VOLATILE_LINE_RE = new RegExp(
  [
    String.raw`^<!-- file_content_hash: [^>]*-->\r?\n?`,
    String.raw`^<!-- generated_at: [^>]*-->\r?\n?`,
    String.raw`^<!-- git_commit: [^>]*-->\r?\n?`,
    String.raw`^\*\*Generated\*\*:.*\r?\n?`,
    String.raw`^\*DIGEST generated:.*\r?\n?`,
    String.raw`^\*Generated:.*\r?\n?`,
  ].join('|'),
  'gm',
);

export function stripVolatileLines(content) {
  return String(content == null ? '' : content).replace(VOLATILE_LINE_RE, '');
}

export function verifyFileContentHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const m = content.match(/^<!-- file_content_hash: ([0-9a-f]{16}) -->\r?\n/m);
  if (!m) return { ok: false, expected: null, actual: null };
  // Same stripping as the compute side — see stripVolatileLines. These MUST agree.
  const expected = crypto.createHash('sha256').update(stripVolatileLines(content)).digest('hex').substring(0, 16);
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
