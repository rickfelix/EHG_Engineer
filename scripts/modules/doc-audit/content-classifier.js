/**
 * D14 Content Accuracy — Deterministic document classifier.
 *
 * Classifications:
 *   ACCURATE (100)      — Content matches codebase reality
 *   VISIONARY (85)      — Grounded in DB schema/architecture, not code artifacts
 *   UNVERIFIABLE (75)   — Insufficient code references to verify
 *   DRIFTED (50)        — Some content doesn't match current state
 *   STALE (25)          — Old content with unverified references
 *   ASPIRATIONAL (0)    — Describes features that don't exist
 *
 * Uses 7 deterministic heuristics (no LLM):
 *   1. Code artifact cross-reference
 *   2. Stage number validation (>25 = invalid)
 *   3. DOCMON template detection
 *   4. TAM/market claim detection
 *   5. Content-code ratio analysis
 *   6. Database schema cross-reference (tables, views, functions)
 *   7. Template-aware reclassification (DOCMON → UNVERIFIABLE)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.sql']);
const SOURCE_DIRS = ['src', 'lib', 'scripts', 'database'];
const MAX_STAGE = 25;

// ── Code Artifact Index ─────────────────────────────────────────────

/**
 * Scan source files and build an index of exported artifacts.
 * @param {string} rootDir - Project root directory
 * @returns {Map<string, string>} Map of artifact name → source file relative path
 */
export function buildCodeArtifactIndex(rootDir) {
  const index = new Map();
  for (const dir of SOURCE_DIRS) {
    const absDir = join(rootDir, dir);
    if (existsSync(absDir)) walkDir(absDir, rootDir, index);
  }
  return index;
}

function walkDir(dir, rootDir, index) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.temp') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, rootDir, index);
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      extractSourceArtifacts(fullPath, rootDir, index);
    }
  }
}

function extractSourceArtifacts(filePath, rootDir, index) {
  let content;
  try { content = readFileSync(filePath, 'utf8'); } catch { return; }
  const relPath = relative(rootDir, filePath).replace(/\\/g, '/');
  const ext = extname(filePath);

  const patterns = ext === '.sql'
    ? [
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      ]
    : [
        /export\s+(?:async\s+)?function\s+([A-Za-z_$]\w*)/g,
        /export\s+class\s+([A-Za-z_$]\w*)/g,
        /export\s+(?:const|let|var)\s+([A-Za-z_$]\w*)/g,
        /exports\.([A-Za-z_$]\w*)\s*=/g,
        /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$]\w*)/g,
        /(?:^|\n)\s*class\s+([A-Za-z_$]\w*)/g,
        /export\s+interface\s+([A-Za-z_$]\w*)/g,
        /export\s+type\s+([A-Za-z_$]\w*)/g,
      ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].length > 1) index.set(match[1], relPath);
    }
  }
}

// ── Database Schema Index ────────────────────────────────────────────

const MIGRATION_DIR = 'database/migrations';

/**
 * Scan SQL migration files and build an index of database objects.
 * Extracts table names, view names, function names, and column names.
 * @param {string} rootDir - Project root directory
 * @returns {Set<string>} Set of known database object names (lowercase)
 */
export function buildSchemaIndex(rootDir) {
  const schemaNames = new Set();
  const migDir = join(rootDir, MIGRATION_DIR);
  if (!existsSync(migDir)) return schemaNames;

  let files;
  try { files = readdirSync(migDir); } catch { return schemaNames; }

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    let sql;
    try { sql = readFileSync(join(migDir, file), 'utf8'); } catch { continue; }

    // Table names
    const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let m;
    while ((m = tablePattern.exec(sql)) !== null) schemaNames.add(m[1].toLowerCase());

    // View names
    const viewPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((m = viewPattern.exec(sql)) !== null) schemaNames.add(m[1].toLowerCase());

    // Function names
    const funcPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((m = funcPattern.exec(sql)) !== null) schemaNames.add(m[1].toLowerCase());

    // Column names from CREATE TABLE blocks
    const colPattern = /^\s+([a-z_][a-z0-9_]*)\s+(?:text|varchar|integer|bigint|boolean|jsonb|json|uuid|timestamp|numeric|serial|smallint|date|real|double)/gim;
    while ((m = colPattern.exec(sql)) !== null) {
      if (m[1].length > 3) schemaNames.add(m[1].toLowerCase());
    }
  }

  return schemaNames;
}

/**
 * Count how many of a document's unresolved names match known DB schema objects.
 * @param {string[]} unresolvedNames - Code names not found in source code
 * @param {Set<string>} schemaIndex - Known DB object names (lowercase)
 * @returns {number} Count of names that match schema objects
 */
function countSchemaMatches(unresolvedNames, schemaIndex) {
  let count = 0;
  for (const name of unresolvedNames) {
    // Try direct lowercase match
    if (schemaIndex.has(name.toLowerCase())) { count++; continue; }
    // Try snake_case conversion of PascalCase/camelCase
    const snake = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    if (schemaIndex.has(snake)) { count++; continue; }
  }
  return count;
}

// ── Document Artifact Extraction ────────────────────────────────────

const EXCLUDE_NAMES = new Set([
  'README', 'TODO', 'FIXME', 'NOTE', 'WARNING', 'ERROR', 'INFO', 'DEBUG',
  'JavaScript', 'TypeScript', 'PostgreSQL', 'Supabase', 'GitHub', 'GitLab',
  'NodeJs', 'GraphQL', 'WebSocket', 'DevOps', 'SaaS', 'PaaS', 'IaaS',
  'CloudFlare', 'MongoDB', 'Firebase', 'ReactJs', 'NextJs', 'VueJs',
]);

function extractDocArtifacts(content) {
  const codeNames = new Set();
  const fileRefs = new Set();

  // 1. Backtick-quoted identifiers (high confidence)
  const backtickPatterns = [
    /`([A-Za-z_$]\w*)\(\)`/g,                     // `functionName()`
    /`([A-Za-z_$]\w*)\(`/g,                        // `functionName(`
    /`(fn_[a-z_]+)`/g,                             // `fn_snake_case`
    /`([A-Z][a-z]+(?:[A-Z][a-z]*)+)`/g,            // `PascalCaseCompound` (2+ words)
  ];
  for (const p of backtickPatterns) {
    let m; while ((m = p.exec(content)) !== null) codeNames.add(m[1]);
  }

  // 2. Code block analysis (interface/class declarations + type references)
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  for (const block of codeBlocks) {
    const blockPatterns = [
      /interface\s+([A-Z]\w+)/g,
      /class\s+([A-Z]\w+)/g,
      /:\s*([A-Z][a-z]+(?:[A-Z][a-z]*)+)(?:\s*[;,\[\]{}])/g,
    ];
    for (const p of blockPatterns) {
      let m; while ((m = p.exec(block)) !== null) codeNames.add(m[1]);
    }
  }

  // 3. Full file path references
  const pathPatterns = [
    /`((?:scripts|src|lib|database|docs)\/[\w/.+-]+\.(?:js|ts|mjs|cjs|tsx|jsx|sql|md))`/g,
    /(?:^|\s)((?:scripts|src|lib|database)\/[\w/.+-]+\.(?:js|ts|mjs|cjs|sql))/gm,
  ];
  for (const p of pathPatterns) {
    let m; while ((m = p.exec(content)) !== null) fileRefs.add(m[1]);
  }

  // 4. Standalone filenames in backticks (migration files, etc.)
  const filenamePattern = /`([A-Za-z0-9_.-]+\.(?:js|ts|mjs|cjs|sql))`/g;
  let m;
  while ((m = filenamePattern.exec(content)) !== null) fileRefs.add(m[1]);

  const filtered = [...codeNames].filter(n => !EXCLUDE_NAMES.has(n) && n.length > 2);
  return { codeNames: filtered, fileRefs: [...fileRefs] };
}

// ── Heuristics ──────────────────────────────────────────────────────

function checkStageReferences(content) {
  const pattern = /\bStage\s+(\d+)\b/gi;
  const invalid = [];
  let m;
  while ((m = pattern.exec(content)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > MAX_STAGE) invalid.push({ stage: n, text: m[0] });
  }
  return invalid;
}

function detectDocmonTemplate(fileInfo, content) {
  const markers = [];
  if (fileInfo.metadata) {
    const tags = Array.isArray(fileInfo.metadata.tags) ? fileInfo.metadata.tags : [];
    if (tags.includes('auto-generated')) markers.push('tag: auto-generated');
    if (fileInfo.metadata.author === 'DOCMON') markers.push('author: DOCMON');
    if (fileInfo.metadata.author === 'auto-fixer') markers.push('author: auto-fixer');
  }
  if (/\*This enhanced PRD establishes .+ as the .+ foundation/i.test(content)) {
    markers.push('DOCMON template boilerplate');
  }
  return markers;
}

function detectTAMClaims(content) {
  const pattern = /\$[\d,.]+\s*[BMT](?:illion)?\b/gi;
  const claims = [];
  let m;
  while ((m = pattern.exec(content)) !== null) claims.push(m[0]);
  return claims;
}

/**
 * Check if a standalone filename exists in common project directories.
 */
function resolveStandaloneFile(filename, rootDir) {
  const searchDirs = ['database/migrations', 'scripts', 'src', 'lib', 'database'];
  for (const dir of searchDirs) {
    if (existsSync(join(rootDir, dir, filename))) return true;
  }
  return false;
}

// ── Classification ──────────────────────────────────────────────────

/**
 * Classify a single documentation file.
 * @param {object} fileInfo - Scanner FileInfo object
 * @param {Map} codeIndex - Code artifact index from buildCodeArtifactIndex
 * @param {string} rootDir - Project root directory
 * @param {Set<string>} [schemaIndex] - Optional DB schema index from buildSchemaIndex
 * @returns {{ classification: string, score: number, evidence: string[] }}
 */
export function classifyDocument(fileInfo, codeIndex, rootDir, schemaIndex) {
  const fullPath = join(rootDir, fileInfo.relPath);
  let content;
  try { content = readFileSync(fullPath, 'utf8'); }
  catch { return { classification: 'UNVERIFIABLE', score: 75, evidence: ['File not readable'] }; }

  const evidence = [];
  const { codeNames, fileRefs } = extractDocArtifacts(content);

  // Cross-reference code names against index
  const resolvedNames = codeNames.filter(n => codeIndex.has(n));
  const unresolvedNames = codeNames.filter(n => !codeIndex.has(n));

  // Cross-reference file paths against filesystem
  const resolvedFiles = fileRefs.filter(f => {
    if (f.includes('/')) return existsSync(join(rootDir, f));
    return resolveStandaloneFile(f, rootDir);
  });
  const unresolvedFiles = fileRefs.filter(f => {
    if (f.includes('/')) return !existsSync(join(rootDir, f));
    return !resolveStandaloneFile(f, rootDir);
  });

  const totalRefs = codeNames.length + fileRefs.length;
  const resolvedCount = resolvedNames.length + resolvedFiles.length;
  const unresolvedCount = unresolvedNames.length + unresolvedFiles.length;
  const unresolvedPct = totalRefs > 0 ? (unresolvedCount / totalRefs) * 100 : 0;

  if (totalRefs > 0) {
    evidence.push(`References: ${resolvedCount}/${totalRefs} resolved (${Math.round(unresolvedPct)}% unresolved)`);
    if (unresolvedNames.length > 0) {
      const sample = unresolvedNames.slice(0, 5).join(', ');
      const more = unresolvedNames.length > 5 ? ` (+${unresolvedNames.length - 5} more)` : '';
      evidence.push(`Unresolved code: ${sample}${more}`);
    }
    if (unresolvedFiles.length > 0) {
      const sample = unresolvedFiles.slice(0, 3).join(', ');
      const more = unresolvedFiles.length > 3 ? ` (+${unresolvedFiles.length - 3} more)` : '';
      evidence.push(`Unresolved files: ${sample}${more}`);
    }
  }

  const invalidStages = checkStageReferences(content);
  if (invalidStages.length > 0) {
    evidence.push(`Invalid stages: ${invalidStages.map(s => s.text).join(', ')}`);
  }

  const templateMarkers = detectDocmonTemplate(fileInfo, content);
  if (templateMarkers.length > 0) {
    evidence.push(`Template: ${templateMarkers.join(', ')}`);
  }

  const tamClaims = detectTAMClaims(content);
  if (tamClaims.length > 0) {
    evidence.push(`TAM claims: ${tamClaims.join(', ')}`);
  }

  const wordCount = content.split(/\s+/).length;

  // ── Schema cross-reference (heuristic 6) ──
  const schemaMatches = schemaIndex ? countSchemaMatches(unresolvedNames, schemaIndex) : 0;
  const hasSchemaGrounding = schemaMatches >= 2;
  if (schemaMatches > 0) {
    evidence.push(`Schema matches: ${schemaMatches} unresolved name(s) found in DB schema`);
  }

  // ── Template detection flag (heuristic 7) ──
  const isTemplate = templateMarkers.length > 0;

  // ── Decision tree ──

  // ASPIRATIONAL: majority of references unresolved AND not a template AND no schema grounding
  if (totalRefs > 0 && unresolvedPct > 50) {
    // Template documents with unresolved refs → UNVERIFIABLE (not aspirational)
    // Template content is auto-generated; it's unverifiable, not aspirational
    if (isTemplate) {
      evidence.push('Template reclassified: ASPIRATIONAL → UNVERIFIABLE');
      return { classification: 'UNVERIFIABLE', score: 75, evidence };
    }
    // Documents grounded in DB schema → VISIONARY (architecture-aligned)
    if (hasSchemaGrounding) {
      evidence.push('Schema-grounded: references verified DB objects');
      return { classification: 'VISIONARY', score: 85, evidence };
    }
    return { classification: 'ASPIRATIONAL', score: 0, evidence };
  }

  // ASPIRATIONAL: invalid stages + notable unresolved
  if (invalidStages.length > 0 && unresolvedPct > 20) {
    if (isTemplate) {
      evidence.push('Template reclassified: ASPIRATIONAL → UNVERIFIABLE');
      return { classification: 'UNVERIFIABLE', score: 75, evidence };
    }
    if (hasSchemaGrounding) {
      evidence.push('Schema-grounded: references verified DB objects');
      return { classification: 'VISIONARY', score: 85, evidence };
    }
    return { classification: 'ASPIRATIONAL', score: 0, evidence };
  }

  // DRIFTED: some invalid stages or moderate unresolved
  if (invalidStages.length > 0 || (totalRefs > 0 && unresolvedPct > 20)) {
    return { classification: 'DRIFTED', score: 50, evidence };
  }

  // STALE: old file with some unresolved references
  if (fileInfo.gitLastModified) {
    const ageDays = (Date.now() - new Date(fileInfo.gitLastModified).getTime()) / 86400000;
    if (ageDays > 180 && totalRefs > 0 && unresolvedPct > 10) {
      evidence.push(`Last updated: ${Math.round(ageDays)} days ago`);
      return { classification: 'STALE', score: 25, evidence };
    }
  }

  // UNVERIFIABLE: heavy content but few verifiable references
  if (wordCount > 500 && totalRefs > 0 && resolvedCount < 3) {
    evidence.push(`${wordCount} words, only ${resolvedCount} verified reference(s)`);
    return { classification: 'UNVERIFIABLE', score: 75, evidence };
  }

  // ACCURATE
  if (totalRefs > 0) {
    evidence.push(`${resolvedCount} reference(s) verified`);
  } else {
    evidence.push('No code references to verify');
  }
  return { classification: 'ACCURATE', score: 100, evidence };
}

// ── Batch Operations ────────────────────────────────────────────────

/**
 * Classify all documentation files from a scan result.
 * @param {object} scanResult - Result from scanDocs()
 * @param {Map} codeIndex - Code artifact index
 * @param {string} rootDir - Project root directory
 * @param {Set<string>} [schemaIndex] - Optional DB schema index from buildSchemaIndex
 * @returns {Map<string, { classification: string, score: number, evidence: string[] }>}
 */
export function classifyAll(scanResult, codeIndex, rootDir, schemaIndex) {
  const results = new Map();
  for (const fileInfo of scanResult.files) {
    results.set(fileInfo.relPath, classifyDocument(fileInfo, codeIndex, rootDir, schemaIndex));
  }
  return results;
}

/**
 * Get classification distribution counts.
 * @param {Map} classifications - Results from classifyAll()
 * @returns {{ ACCURATE: number, DRIFTED: number, ASPIRATIONAL: number, STALE: number, UNVERIFIABLE: number }}
 */
export function getDistribution(classifications) {
  const dist = { ACCURATE: 0, VISIONARY: 0, DRIFTED: 0, ASPIRATIONAL: 0, STALE: 0, UNVERIFIABLE: 0 };
  for (const [, result] of classifications) {
    dist[result.classification] = (dist[result.classification] || 0) + 1;
  }
  return dist;
}
