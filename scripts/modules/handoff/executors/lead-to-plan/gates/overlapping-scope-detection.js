/**
 * OVERLAPPING_SCOPE_DETECTION Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 10)
 *
 * Detects overlapping scope between this SD and other active SDs.
 * Uses keyword extraction from scope text for similarity matching.
 *
 * Phase: LEAD-TO-PLAN
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'OVERLAPPING_SCOPE_DETECTION';
const OVERLAP_THRESHOLD = 0.5; // 50% keyword overlap triggers warning
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'will',
  'has', 'have', 'been', 'not', 'but', 'all', 'can', 'had', 'her', 'one',
  'our', 'out', 'use', 'add', 'new', 'now', 'old', 'see', 'way', 'may',
  'each', 'make', 'like', 'than', 'them', 'then', 'into', 'some', 'when'
]);

/**
 * Extract pattern IDs (PAT-*) from text for /learn SD differentiation.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-085: /learn SDs share generic titles
 * but target different pattern IDs — include these as discriminating keywords.
 */
function extractPatternIds(text) {
  if (!text) return [];
  const matches = text.match(/PAT-[A-Z0-9-]+/g) || [];
  return matches.map(id => id.toLowerCase());
}

/**
 * Extract meaningful keywords from text.
 */
function extractKeywords(text) {
  if (!text) return new Set();
  const normalized = typeof text === 'string' ? text : JSON.stringify(text);
  const words = new Set(
    normalized.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  );
  // Add pattern IDs as discriminating keywords for /learn SDs
  for (const patId of extractPatternIds(text)) {
    words.add(patId);
  }
  return words;
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 */
function calculateSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

export function createOverlappingScopeDetectionGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔄 SEMANTIC GATE: Overlapping Scope Detection');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      const { applicable, level } = getGateApplicability(GATE_NAME, sdType);
      if (!applicable) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType}`);
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot check scope overlap — missing context']
        });
      }

      try {
        // Get this SD's scope
        const { data: thisSd, error: thisError } = await supabase
          .from('strategic_directives_v2')
          .select('scope, title, description, key_changes')
          .eq('id', sdId)
          .single();

        if (thisError || !thisSd) {
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: ['SD not found for overlap check']
          });
        }

        // Get other active SDs (not this one)
        const { data: activeSDs, error: activeError } = await supabase
          .from('strategic_directives_v2')
          .select('id, title, scope, description')
          .in('status', ['draft', 'in_progress', 'ready', 'planning'])
          .neq('id', sdId)
          .limit(50);

        if (activeError || !activeSDs || activeSDs.length === 0) {
          console.log('   ℹ️  No other active SDs to compare against');
          return buildSemanticResult({
            passed: true, score: 100, confidence: 0.9,
            details: { activeSDs: 0, overlaps: [] }
          });
        }

        // Extract keywords from this SD
        const thisKeywords = extractKeywords(
          `${thisSd.title} ${thisSd.scope || ''} ${thisSd.description || ''} ${JSON.stringify(thisSd.key_changes || [])}`
        );

        if (thisKeywords.size < 3) {
          console.log('   ⚠️  Too few keywords extracted — insufficient scope text');
          return buildSemanticResult({
            passed: true, score: 70, confidence: 0.4,
            warnings: ['Insufficient scope text for meaningful overlap detection'],
            details: { keywords: thisKeywords.size }
          });
        }

        // Compare against each active SD
        const overlaps = [];
        for (const other of activeSDs) {
          const otherKeywords = extractKeywords(
            `${other.title} ${other.scope || ''} ${other.description || ''}`
          );

          const similarity = calculateSimilarity(thisKeywords, otherKeywords);

          if (similarity >= OVERLAP_THRESHOLD) {
            const sharedWords = [...thisKeywords].filter(w => otherKeywords.has(w));
            overlaps.push({
              sdId: other.id,
              title: other.title,
              similarity: Math.round(similarity * 100),
              sharedKeywords: sharedWords.slice(0, 10)
            });
          }
        }

        overlaps.sort((a, b) => b.similarity - a.similarity);

        const hasHighOverlap = overlaps.some(o => o.similarity >= 70);
        const confidence = computeConfidence({
          dataPoints: activeSDs.length,
          expectedPoints: 5
        });

        // Overlap is advisory (warning) not blocking — it's informational
        const score = overlaps.length === 0 ? 100 : (hasHighOverlap ? 40 : 70);
        const passed = level === 'OPT' ? true : !hasHighOverlap;

        console.log(`   📊 Compared against ${activeSDs.length} active SDs`);
        console.log(`   📊 Overlaps found: ${overlaps.length} (threshold: ${OVERLAP_THRESHOLD * 100}%)`);

        if (overlaps.length > 0) {
          console.log('   Overlapping SDs:');
          overlaps.slice(0, 5).forEach(o =>
            console.log(`      - ${o.title} (${o.similarity}% similarity, shared: ${o.sharedKeywords.slice(0, 5).join(', ')})`)
          );
        }

        console.log(`   ${passed ? '✅' : '⚠️'} Score: ${score}/100 | Confidence: ${confidence}`);

        return buildSemanticResult({
          passed,
          score,
          confidence,
          issues: hasHighOverlap ? [`High scope overlap detected with ${overlaps.filter(o => o.similarity >= 70).length} SD(s)`] : [],
          warnings: overlaps.length > 0 && !hasHighOverlap ? [`Moderate scope overlap with ${overlaps.length} SD(s)`] : [],
          details: {
            activeSDs: activeSDs.length,
            thisKeywordCount: thisKeywords.size,
            overlaps: overlaps.slice(0, 10),
            threshold: OVERLAP_THRESHOLD * 100
          },
          remediation: hasHighOverlap
            ? `Review overlapping SDs for potential duplication: ${overlaps.filter(o => o.similarity >= 70).map(o => o.title).join(', ')}`
            : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Overlap detection error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.6
  };
}
