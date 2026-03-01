/**
 * Doc-Audit Coverage Scorer — D11-D14 coverage dimensions
 *
 * D11-D13: Database-backed — query Supabase for vision docs, architecture
 *          plans, and completed SDs, then match keywords against scanned docs.
 * D14:     Filesystem-backed — classify doc content accuracy via code
 *          artifact cross-referencing (no LLM, deterministic).
 *
 * Used by:
 *   scripts/modules/doc-audit/scorer.js  (async scoring path)
 */

import { buildCodeArtifactIndex, classifyAll, getDistribution } from './content-classifier.js';

// ─── Stop words for keyword extraction ───────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very',
  'just', 'about', 'up', 'out', 'that', 'this', 'it', 'its',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'into', 'over', 'after',
  'before', 'between', 'under', 'above', 'through', 'during', 'without',
  'also', 'new', 'used', 'using', 'use', 'based', 'system', 'support',
]);

// ─── Keyword extraction ──────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from text.
 * Tokenizes, lowercases, removes stop words and short tokens.
 * @param {string} text
 * @returns {string[]}
 */
export function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[\s\-_/,.:;()\[\]{}|]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

// ─── Doc matching ────────────────────────────────────────────────────────────

/**
 * Search scanned files for keyword matches.
 * @param {string[]} keywords - Keywords to search for
 * @param {Array} files - Scanned file objects with headings + contentSnippet
 * @param {number} threshold - Minimum keyword matches to count as covered (default 2)
 * @returns {string[]} Matching file relPaths
 */
export function findMatchingDocs(keywords, files, threshold = 2) {
  if (keywords.length === 0) return [];

  const matches = [];
  for (const file of files) {
    // Build searchable text from headings + snippet + filename
    const searchText = [
      ...(file.headings || []),
      file.contentSnippet || '',
      file.name.replace(/\.md$/, '').replace(/[-_]/g, ' '),
    ].join(' ').toLowerCase();

    let hitCount = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) hitCount++;
    }

    if (hitCount >= Math.min(threshold, keywords.length)) {
      matches.push(file.relPath);
    }
  }
  return matches;
}

// ─── D11: Vision Coverage (10%) ──────────────────────────────────────────────

/**
 * Score vision capability documentation coverage.
 * @param {Array} files - Scanned doc files
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{score: number, findings: string[], gaps: string[]}>}
 */
export async function scoreD11(files, supabase) {
  const findings = [];
  const gaps = [];

  const { data: visions, error } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, extracted_dimensions, status')
    .eq('status', 'active');

  if (error) {
    return { score: 0, findings: [`Database error: ${error.message}`], gaps: [] };
  }

  if (!visions || visions.length === 0) {
    return { score: 100, findings: ['No active vision documents found'], gaps: [] };
  }

  // Extract capabilities from extracted_dimensions JSONB
  const capabilities = [];
  for (const v of visions) {
    const dims = v.extracted_dimensions;
    if (!Array.isArray(dims)) continue;
    for (const dim of dims) {
      if (dim.name) {
        capabilities.push({
          name: dim.name,
          description: dim.description || '',
          visionKey: v.vision_key,
        });
      }
    }
  }

  if (capabilities.length === 0) {
    return { score: 100, findings: ['No capabilities extracted from vision documents'], gaps: [] };
  }

  let covered = 0;
  for (const cap of capabilities) {
    const keywords = extractKeywords(`${cap.name} ${cap.description}`);
    const matches = findMatchingDocs(keywords, files);

    if (matches.length > 0) {
      covered++;
    } else {
      gaps.push(`${cap.visionKey}: "${cap.name}" — no documentation found`);
    }
  }

  const score = Math.round((covered / capabilities.length) * 100);
  findings.push(`${covered}/${capabilities.length} vision capabilities documented across ${visions.length} vision docs`);

  return { score, findings, gaps };
}

// ─── D12: Architecture Coverage (8%) ─────────────────────────────────────────

/**
 * Score architecture component documentation coverage.
 * @param {Array} files - Scanned doc files
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{score: number, findings: string[], gaps: string[]}>}
 */
export async function scoreD12(files, supabase) {
  const findings = [];
  const gaps = [];

  const { data: plans, error } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, extracted_dimensions, status')
    .eq('status', 'active');

  if (error) {
    return { score: 0, findings: [`Database error: ${error.message}`], gaps: [] };
  }

  if (!plans || plans.length === 0) {
    return { score: 100, findings: ['No active architecture plans found'], gaps: [] };
  }

  // Extract components from extracted_dimensions JSONB
  const components = [];
  for (const p of plans) {
    const dims = p.extracted_dimensions;
    if (!Array.isArray(dims)) continue;
    for (const dim of dims) {
      if (dim.name) {
        components.push({
          name: dim.name,
          description: dim.description || '',
          planKey: p.plan_key,
        });
      }
    }
  }

  if (components.length === 0) {
    return { score: 100, findings: ['No components extracted from architecture plans'], gaps: [] };
  }

  let covered = 0;
  for (const comp of components) {
    const keywords = extractKeywords(`${comp.name} ${comp.description}`);
    const matches = findMatchingDocs(keywords, files);

    if (matches.length > 0) {
      covered++;
    } else {
      gaps.push(`${comp.planKey}: "${comp.name}" — no documentation found`);
    }
  }

  const score = Math.round((covered / components.length) * 100);
  findings.push(`${covered}/${components.length} architecture components documented across ${plans.length} plans`);

  return { score, findings, gaps };
}

// ─── D13: SD Documentation Coverage (12%) ────────────────────────────────────

/**
 * Score completed SD documentation coverage.
 * Only checks feature/api/infrastructure SDs completed in last 180 days.
 * @param {Array} files - Scanned doc files
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{score: number, findings: string[], gaps: string[]}>}
 */
export async function scoreD13(files, supabase) {
  const findings = [];
  const gaps = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 180);

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, key_changes, delivers_capabilities, sd_type')
    .eq('status', 'completed')
    .in('sd_type', ['feature', 'api', 'infrastructure'])
    .gte('completion_date', cutoffDate.toISOString());

  if (error) {
    return { score: 0, findings: [`Database error: ${error.message}`], gaps: [] };
  }

  if (!sds || sds.length === 0) {
    return { score: 100, findings: ['No qualifying completed SDs in last 180 days'], gaps: [] };
  }

  let covered = 0;
  for (const sd of sds) {
    // Build keyword text from title + key_changes + delivers_capabilities
    const parts = [sd.title || ''];
    if (Array.isArray(sd.key_changes)) parts.push(...sd.key_changes);
    else if (typeof sd.key_changes === 'string') parts.push(sd.key_changes);
    if (Array.isArray(sd.delivers_capabilities)) parts.push(...sd.delivers_capabilities);
    else if (typeof sd.delivers_capabilities === 'string') parts.push(sd.delivers_capabilities);

    const keywords = extractKeywords(parts.join(' '));
    const matches = findMatchingDocs(keywords, files);

    if (matches.length > 0) {
      covered++;
    } else {
      gaps.push(`${sd.sd_key}: "${sd.title}" (${sd.sd_type}) — no documentation found`);
    }
  }

  const score = Math.round((covered / sds.length) * 100);
  findings.push(`${covered}/${sds.length} qualifying SDs have documentation (${sds.length} ${['feature', 'api', 'infrastructure'].join('/')} SDs in last 180d)`);

  return { score, findings, gaps };
}

// ─── D14: Content Accuracy (8%) ──────────────────────────────────────────────

/**
 * Score documentation content accuracy by classifying files against
 * the actual codebase using deterministic heuristics (no LLM).
 *
 * Classification scores: ACCURATE=100, UNVERIFIABLE=75, DRIFTED=50,
 *                        STALE=25, ASPIRATIONAL=0
 *
 * @param {{ files: object[] }} scanResult - Result from scanDocs()
 * @param {string} rootDir - Project root directory
 * @returns {Promise<{score: number, findings: string[], gaps: string[]}>}
 */
export async function scoreD14(scanResult, rootDir) {
  const findings = [];
  const gaps = [];

  const codeIndex = buildCodeArtifactIndex(rootDir);
  findings.push(`Code artifact index: ${codeIndex.size} artifacts indexed`);

  const classifications = classifyAll(scanResult, codeIndex, rootDir);
  const dist = getDistribution(classifications);
  const total = classifications.size;

  if (total === 0) {
    return { score: 100, findings: ['No documentation files to classify'], gaps };
  }

  // Weighted average score
  const SCORES = { ACCURATE: 100, UNVERIFIABLE: 75, DRIFTED: 50, STALE: 25, ASPIRATIONAL: 0 };
  let weightedSum = 0;
  for (const [, result] of classifications) {
    weightedSum += SCORES[result.classification] ?? 75;
  }
  const score = Math.round(weightedSum / total);

  // Distribution summary
  findings.push(
    `Classification: ${dist.ACCURATE} accurate, ${dist.UNVERIFIABLE} unverifiable, ` +
    `${dist.DRIFTED} drifted, ${dist.STALE} stale, ${dist.ASPIRATIONAL} aspirational`
  );

  // Gaps: ASPIRATIONAL and DRIFTED files with evidence
  for (const [relPath, result] of classifications) {
    if (result.classification === 'ASPIRATIONAL') {
      gaps.push(`${relPath} — ASPIRATIONAL: ${result.evidence.join('; ')}`);
    } else if (result.classification === 'DRIFTED') {
      gaps.push(`${relPath} — DRIFTED: ${result.evidence.join('; ')}`);
    } else if (result.classification === 'STALE') {
      gaps.push(`${relPath} — STALE: ${result.evidence.join('; ')}`);
    }
  }

  return { score, findings, gaps };
}
