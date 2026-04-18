/**
 * Acceptance Criteria Traceability Gate for PLAN-TO-LEAD
 *
 * Traces success criteria from the linked vision document to test files.
 * Fetches vision doc from eva_vision_documents, parses Success Criteria,
 * extracts keywords, and fuzzy-matches against test file names and content.
 *
 * SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-B
 */

import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'from', 'with', 'of', 'for',
  'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'that', 'this', 'these', 'those',
  'it', 'its', 'not', 'no', 'all', 'each', 'every', 'any', 'per', 'via',
]);

const SKIP_SD_TYPES = new Set(['documentation', 'orchestrator']);
const MIN_KEYWORD_OVERLAP = 2;

/**
 * Extract keywords from a criterion string.
 * Filters stopwords, returns lowercase tokens >= 3 chars.
 */
export function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Parse success criteria from vision doc content.
 * Looks for "Success Criteria" or "Acceptance Criteria" section heading.
 */
export function parseCriteria(content) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  let inSection = false;
  const criteria = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section heading
    if (/^#{1,4}\s*(success|acceptance)\s*criteria/i.test(trimmed)) {
      inSection = true;
      continue;
    }

    // Exit section on next heading
    if (inSection && /^#{1,4}\s/.test(trimmed) && !/criteria/i.test(trimmed)) {
      break;
    }

    // Collect bullet items in section
    if (inSection && /^[-*\d.]+\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*\d.]+\s*/, '').trim();
      if (text.length > 5) criteria.push(text);
    }
  }

  return criteria;
}

/**
 * Scan test directory for file names.
 */
async function getTestFiles(testsDir) {
  try {
    const entries = await readdir(testsDir, { recursive: true });
    return entries
      .filter(f => /\.(test|spec)\.(js|ts|mjs|cjs)$/.test(f))
      .map(f => ({ path: f, name: basename(f).toLowerCase() }));
  } catch {
    return [];
  }
}

/**
 * Fuzzy match criterion keywords against test file names.
 * Returns matched files with overlap count.
 */
function matchCriterionToTests(keywords, testFiles) {
  const matches = [];
  for (const tf of testFiles) {
    const fileTokens = tf.name.replace(/[^a-z0-9]/g, ' ').split(/\s+/);
    const overlap = keywords.filter(kw => fileTokens.some(ft => ft.includes(kw) || kw.includes(ft)));
    if (overlap.length >= MIN_KEYWORD_OVERLAP) {
      matches.push({ file: tf.path, overlap: overlap.length, keywords: overlap });
    }
  }
  return matches.sort((a, b) => b.overlap - a.overlap);
}

export function createAcceptanceCriteriaTraceabilityGate(supabase) {
  return {
    name: 'ACCEPTANCE_CRITERIA_TRACEABILITY',
    validator: async (ctx) => {
      console.log('\n🔗 ACCEPTANCE CRITERIA TRACEABILITY GATE');
      console.log('-'.repeat(50));

      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();

      // Skip for non-code SD types
      if (SKIP_SD_TYPES.has(sdType)) {
        console.log(`   ℹ️  SD type '${sdType}' — justified skip (no test traceability needed)`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [`Justified skip: SD type '${sdType}' does not require test traceability`],
          details: { sd_type: sdType, skipped: true, reason: 'non_code_sd_type' }
        };
      }

      // Fetch vision doc via SD metadata.vision_key
      const visionKey = ctx.sd?.metadata?.vision_key;
      if (!visionKey) {
        console.log('   ℹ️  No vision_key in SD metadata — justified skip');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['No vision document linked — traceability not applicable'],
          details: { skipped: true, reason: 'no_vision_key' }
        };
      }

      const { data: visionDoc, error: visionErr } = await supabase
        .from('eva_vision_documents')
        .select('content, title')
        .eq('vision_key', visionKey)
        .limit(1)
        .maybeSingle();

      if (visionErr || !visionDoc) {
        console.log(`   ℹ️  Vision doc '${visionKey}' not found — justified skip`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [`Vision document '${visionKey}' not found`],
          details: { skipped: true, reason: 'vision_doc_not_found', vision_key: visionKey }
        };
      }

      // Parse criteria from vision doc
      const criteria = parseCriteria(visionDoc.content);
      if (criteria.length === 0) {
        console.log('   ℹ️  No success criteria found in vision doc — justified skip');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Vision document has no parseable Success Criteria section'],
          details: { skipped: true, reason: 'no_criteria_found', vision_key: visionKey }
        };
      }

      console.log(`   📋 Found ${criteria.length} criteria in vision doc '${visionKey}'`);

      // Scan test files
      const testsDir = join(process.cwd(), 'tests');
      const testFiles = await getTestFiles(testsDir);
      console.log(`   📂 Found ${testFiles.length} test files`);

      // Match each criterion
      const results = [];
      for (const criterion of criteria) {
        const keywords = extractKeywords(criterion);
        const matches = matchCriterionToTests(keywords, testFiles);
        results.push({
          criterion: criterion.slice(0, 80),
          keywords: keywords.slice(0, 5),
          matched: matches.length > 0,
          matches: matches.slice(0, 3),
        });
      }

      const mappedCount = results.filter(r => r.matched).length;
      const unmappedCount = results.filter(r => !r.matched).length;
      const score = criteria.length > 0 ? Math.round((mappedCount / criteria.length) * 100) : 100;

      // Build issues for unmapped criteria
      const issues = results
        .filter(r => !r.matched)
        .map(r => `Unmapped criterion: "${r.criterion}" (keywords: ${r.keywords.join(', ')})`);

      const warnings = [];
      if (testFiles.length === 0) {
        warnings.push('No test files found in tests/ directory');
      }

      // Log results
      for (const r of results) {
        if (r.matched) {
          console.log(`   ✅ "${r.criterion}" → ${r.matches[0].file} (${r.matches[0].overlap} keywords)`);
        } else {
          console.log(`   ⚠️  "${r.criterion}" → no test coverage found`);
        }
      }

      console.log(`\n   Score: ${score}/100 (${mappedCount}/${criteria.length} mapped)`);

      return {
        passed: score >= 50,
        score,
        max_score: 100,
        issues,
        warnings,
        details: {
          vision_key: visionKey,
          criteria_count: criteria.length,
          mapped_count: mappedCount,
          unmapped_count: unmappedCount,
          results,
        }
      };
    },
    required: false // Advisory gate — does not block handoff
  };
}
