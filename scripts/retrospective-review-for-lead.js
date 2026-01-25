#!/usr/bin/env node
/**
 * 📊 Retrospective Review for LEAD Agent
 *
 * BMAD Enhancement: Learn from past SDs before approving new ones
 *
 * Purpose:
 * - Analyze retrospectives from similar completed SDs
 * - Extract lessons learned and patterns
 * - Provide recommendations for current SD based on history
 * - Identify recurring issues to avoid
 *
 * Usage:
 *   node scripts/retrospective-review-for-lead.js <SD-ID>
 *   node scripts/retrospective-review-for-lead.js SD-NEW-001 --similar-count 5
 *
 * Output:
 * - Lessons learned from similar SDs
 * - Success patterns to replicate
 * - Failure patterns to avoid
 * - Risk mitigation strategies
 * - Estimated effort adjustments
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Main retrospective review function
 */
async function reviewRetrospectives(sdId, options = {}) {
  console.log('\n📊 RETROSPECTIVE REVIEW FOR LEAD AGENT');
  console.log('═'.repeat(60));
  console.log(`SD: ${sdId}`);
  console.log(`Similar SDs to analyze: ${options.similarCount || 5}\n`);

  const results = {
    sd_id: sdId,
    timestamp: new Date().toISOString(),
    key_learnings: [],
    success_patterns: [],
    failure_patterns: [],
    risk_mitigations: [],
    effort_adjustments: {},
    recommendations: []
  };

  try {
    // ============================================
    // 1. FETCH CURRENT SD
    // ============================================
    console.log('📋 Step 1: Fetching current SD...');
    const { data: currentSD, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !currentSD) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'SD not found'}`);
    }

    console.log(`   ✓ SD: ${currentSD.title}`);
    console.log(`   Category: ${currentSD.category || 'Not set'}`);
    console.log(`   Priority: ${currentSD.priority || 'Not set'}`);

    // ============================================
    // 2. FIND SIMILAR COMPLETED SDs
    // ============================================
    console.log('\n🔍 Step 2: Finding similar completed SDs...');
    const similarSDs = await findSimilarSDs(currentSD, options.similarCount || 5);
    console.log(`   ✓ Found ${similarSDs.length} similar completed SDs`);

    if (similarSDs.length === 0) {
      console.log('   ⚠️  No similar SDs found - limited recommendations available');
      results.recommendations.push({
        title: 'No Historical Data',
        description: 'No similar completed SDs found. Proceed with standard risk assessment and conservative estimates.'
      });
      return results;
    }

    // ============================================
    // 3. FETCH RETROSPECTIVES
    // ============================================
    console.log('\n📚 Step 3: Fetching retrospectives...');
    const { data: retrospectives, error: retroError } = await supabase
      .from('retrospectives')
      .select('*')
      .in('sd_id', similarSDs.map(sd => sd.id))
      .eq('status', 'PUBLISHED')
      .order('quality_score', { ascending: false });

    if (retroError) {
      throw new Error(`Failed to fetch retrospectives: ${retroError.message}`);
    }

    console.log(`   ✓ Found ${retrospectives?.length || 0} retrospectives`);

    // ============================================
    // 4. EXTRACT LESSONS LEARNED
    // ============================================
    console.log('\n💡 Step 4: Extracting lessons learned...');
    results.key_learnings = extractLessonsLearned(retrospectives);
    console.log(`   ✓ Extracted ${results.key_learnings.length} lessons`);

    // ============================================
    // 5. IDENTIFY SUCCESS PATTERNS
    // ============================================
    console.log('\n✅ Step 5: Identifying success patterns...');
    results.success_patterns = identifySuccessPatterns(retrospectives);
    console.log(`   ✓ Identified ${results.success_patterns.length} success patterns`);

    // ============================================
    // 6. IDENTIFY FAILURE PATTERNS
    // ============================================
    console.log('\n❌ Step 6: Identifying failure patterns...');
    results.failure_patterns = identifyFailurePatterns(retrospectives);
    console.log(`   ✓ Identified ${results.failure_patterns.length} failure patterns`);

    // ============================================
    // 7. GENERATE RISK MITIGATIONS
    // ============================================
    console.log('\n🛡️ Step 7: Generating risk mitigations...');
    results.risk_mitigations = generateRiskMitigations(
      currentSD,
      results.failure_patterns,
      retrospectives
    );
    console.log(`   ✓ Generated ${results.risk_mitigations.length} mitigations`);

    // ============================================
    // 8. CALCULATE EFFORT ADJUSTMENTS
    // ============================================
    console.log('\n⏱️ Step 8: Calculating effort adjustments...');
    results.effort_adjustments = calculateEffortAdjustments(retrospectives);
    console.log(`   ✓ Effort adjustment factor: ${results.effort_adjustments.factor}x`);

    // ============================================
    // 9. GENERATE RECOMMENDATIONS
    // ============================================
    console.log('\n📋 Step 9: Generating recommendations...');
    results.recommendations = generateRecommendations(results, currentSD);
    console.log(`   ✓ Generated ${results.recommendations.length} recommendations`);

    // ============================================
    // 10. DISPLAY SUMMARY
    // ============================================
    console.log('\n' + '═'.repeat(60));
    console.log('📊 RETROSPECTIVE REVIEW SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Similar SDs Analyzed: ${similarSDs.length}`);
    console.log(`Retrospectives Reviewed: ${retrospectives?.length || 0}`);
    console.log(`Key Learnings: ${results.key_learnings.length}`);
    console.log(`Success Patterns: ${results.success_patterns.length}`);
    console.log(`Failure Patterns: ${results.failure_patterns.length}`);
    console.log(`Risk Mitigations: ${results.risk_mitigations.length}`);
    console.log(`Effort Adjustment: ${results.effort_adjustments.factor}x (${results.effort_adjustments.direction})`);
    console.log('═'.repeat(60));

    // Display top recommendations
    console.log('\n🎯 TOP RECOMMENDATIONS:\n');
    results.recommendations.slice(0, 5).forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec.title}`);
      console.log(`   ${rec.description}\n`);
    });

    return results;

  } catch (_error) {
    console.error('\n❌ Retrospective review failed:', error.message);
    throw error;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function findSimilarSDs(currentSD, limit = 5) {
  // Find SDs with similar category, scope, or keywords
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, status')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit * 2); // Get more to filter

  if (error || !data) return [];

  // Filter by similarity
  const currentKeywords = extractKeywords(currentSD.title + ' ' + currentSD.description);

  return data
    .map(sd => {
      const sdKeywords = extractKeywords(sd.title);
      const similarity = calculateSimilarity(currentKeywords, sdKeywords);
      return { ...sd, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 3)
    .filter(word => !['that', 'this', 'with', 'from', 'have', 'been'].includes(word));
}

function calculateSimilarity(keywords1, keywords2) {
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = [...set1].filter(k => set2.has(k)).length;
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}

function extractLessonsLearned(retrospectives) {
  const lessons = [];

  retrospectives?.forEach(retro => {
    // Extract from key_learnings
    if (retro.key_learnings && Array.isArray(retro.key_learnings)) {
      retro.key_learnings.forEach(learning => {
        lessons.push({
          sd_id: retro.sd_id,
          lesson: learning,
          source: 'key_learnings',
          quality_score: retro.quality_score
        });
      });
    }

    // Extract from BMAD insights
    if (retro.bmad_insights?.risk_lessons) {
      retro.bmad_insights.risk_lessons.forEach(lesson => {
        lessons.push({
          sd_id: retro.sd_id,
          lesson,
          source: 'bmad_risk_lessons',
          quality_score: retro.quality_score
        });
      });
    }
  });

  // Sort by quality score and deduplicate
  return lessons
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    .slice(0, 10);
}

function identifySuccessPatterns(retrospectives) {
  const patterns = [];

  retrospectives?.forEach(retro => {
    // Look for high-quality retrospectives (score >= 80)
    if (retro.quality_score >= 80) {
      // Extract what went well
      if (retro.what_went_well && Array.isArray(retro.what_went_well)) {
        retro.what_went_well.forEach(item => {
          patterns.push({
            pattern: item,
            sd_id: retro.sd_id,
            quality_score: retro.quality_score,
            frequency: 1
          });
        });
      }
    }
  });

  // Group similar patterns and count frequency
  const groupedPatterns = [];
  patterns.forEach(p => {
    const existing = groupedPatterns.find(gp =>
      gp.pattern.toLowerCase().includes(p.pattern.toLowerCase().split(' ').slice(0, 3).join(' '))
    );
    if (existing) {
      existing.frequency++;
    } else {
      groupedPatterns.push(p);
    }
  });

  return groupedPatterns
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
}

function identifyFailurePatterns(retrospectives) {
  const patterns = [];

  retrospectives?.forEach(retro => {
    // Extract challenges
    if (retro.challenges_faced && Array.isArray(retro.challenges_faced)) {
      retro.challenges_faced.forEach(challenge => {
        patterns.push({
          pattern: challenge,
          sd_id: retro.sd_id,
          impact: retro.time_saved_hours < 0 ? 'HIGH' : 'MEDIUM',
          frequency: 1
        });
      });
    }
  });

  // Group and count frequency
  const groupedPatterns = [];
  patterns.forEach(p => {
    const existing = groupedPatterns.find(gp =>
      gp.pattern.toLowerCase().includes(p.pattern.toLowerCase().split(' ').slice(0, 3).join(' '))
    );
    if (existing) {
      existing.frequency++;
    } else {
      groupedPatterns.push(p);
    }
  });

  return groupedPatterns
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
}

function generateRiskMitigations(currentSD, failurePatterns, _retrospectives) {
  const mitigations = [];

  failurePatterns.forEach(pattern => {
    mitigations.push({
      risk: pattern.pattern,
      mitigation: `Based on ${pattern.frequency} occurrence(s) in similar SDs, implement early validation and checkpoints.`,
      priority: pattern.impact,
      evidence: `${pattern.frequency} similar SDs encountered this issue`
    });
  });

  // Add BMAD-specific mitigations
  mitigations.push({
    risk: 'Late-stage errors',
    mitigation: 'Use checkpoint pattern for large SDs (>8 user stories). Break into 3-4 checkpoints with interim validation.',
    priority: 'MEDIUM',
    evidence: 'BMAD enhancement: Proven to reduce rework by 30-40%'
  });

  return mitigations.slice(0, 5);
}

function calculateEffortAdjustments(retrospectives) {
  if (!retrospectives || retrospectives.length === 0) {
    return { factor: 1.0, direction: 'baseline', confidence: 0 };
  }

  // Calculate average time overrun
  let totalOverrun = 0;
  let count = 0;

  retrospectives.forEach(retro => {
    if (retro.estimated_effort_hours && retro.actual_effort_hours) {
      const overrun = retro.actual_effort_hours / retro.estimated_effort_hours;
      totalOverrun += overrun;
      count++;
    }
  });

  if (count === 0) {
    return { factor: 1.0, direction: 'baseline', confidence: 0 };
  }

  const averageOverrun = totalOverrun / count;
  const direction = averageOverrun > 1.1 ? 'increase' : averageOverrun < 0.9 ? 'decrease' : 'baseline';

  return {
    factor: Math.round(averageOverrun * 10) / 10,
    direction,
    confidence: Math.min(count * 20, 100), // 20% confidence per retrospective, max 100%
    sample_size: count
  };
}

function generateRecommendations(results, _currentSD) {
  const recommendations = [];

  // Recommendation based on success patterns
  if (results.success_patterns.length > 0) {
    const topPattern = results.success_patterns[0];
    recommendations.push({
      title: 'Replicate Success Pattern',
      description: `${topPattern.frequency} similar SD(s) succeeded by: ${topPattern.pattern}. Apply this approach.`,
      priority: 'HIGH'
    });
  }

  // Recommendation based on failure patterns
  if (results.failure_patterns.length > 0) {
    const topFailure = results.failure_patterns[0];
    recommendations.push({
      title: 'Avoid Common Failure',
      description: `${topFailure.frequency} similar SD(s) encountered: ${topFailure.pattern}. Implement mitigation early.`,
      priority: 'HIGH'
    });
  }

  // Recommendation based on effort adjustments
  if (results.effort_adjustments.factor > 1.1) {
    recommendations.push({
      title: 'Adjust Effort Estimates',
      description: `Similar SDs took ${results.effort_adjustments.factor}x longer than estimated. Increase timeline by ${Math.round((results.effort_adjustments.factor - 1) * 100)}%.`,
      priority: 'MEDIUM'
    });
  }

  // Recommendation based on risk mitigations
  results.risk_mitigations.forEach(mit => {
    if (mit.priority === 'HIGH') {
      recommendations.push({
        title: `Mitigate: ${mit.risk}`,
        description: mit.mitigation,
        priority: 'HIGH'
      });
    }
  });

  // BMAD-specific recommendations
  recommendations.push({
    title: 'Use BMAD Enhancements',
    description: 'Leverage RISK assessment (multi-domain analysis), STORIES context engineering (detailed implementation guidance), and Checkpoint Pattern (early error detection).',
    priority: 'MEDIUM'
  });

  return recommendations.slice(0, 8);
}

// ============================================
// CLI EXECUTION
// ============================================
async function main() {
  const sdId = process.argv[2];
  const similarCount = parseInt(process.argv[4]) || 5;

  if (!sdId) {
    console.error('Usage: node scripts/retrospective-review-for-lead.js <SD-ID> [--similar-count N]');
    console.error('Example: node scripts/retrospective-review-for-lead.js SD-NEW-001 --similar-count 5');
    process.exit(1);
  }

  try {
    const _results = await reviewRetrospectives(sdId, { similarCount });
    process.exit(0);
  } catch (catchError) {
    console.error('Fatal error:', catchError);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { reviewRetrospectives };
