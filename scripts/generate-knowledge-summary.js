#!/usr/bin/env node
/**
 * KNOWLEDGE SUMMARY GENERATOR
 * SD-LEO-LEARN-001: Proactive Learning Integration
 *
 * Generates concise, AI-optimized lesson summaries from retrospectives and patterns.
 * Creates markdown files for quick agent reference during SD work.
 *
 * Usage:
 *   node scripts/generate-knowledge-summary.js --category database
 *   node scripts/generate-knowledge-summary.js --category all
 *   node scripts/generate-knowledge-summary.js --help
 *
 * Output: Markdown files in docs/summaries/lessons/
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CATEGORIES = [
  'database',
  'testing',
  'build',
  'deployment',
  'security',
  'protocol',
  'code_structure',
  'performance',
  'over_engineering',
  'general'
];

const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'summaries', 'lessons');

/**
 * Fetch top patterns by category
 */
async function fetchTopPatterns(category, limit = 10) {
  let queryBuilder = supabase
    .from('issue_patterns')
    .select('*')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false });

  if (category !== 'all') {
    queryBuilder = queryBuilder.eq('category', category);
  }

  const { data: patterns, error } = await queryBuilder.limit(limit);

  if (error) throw error;
  return patterns || [];
}

/**
 * Fetch top retrospectives by category
 */
async function fetchTopRetrospectives(category, limit = 5) {
  let queryBuilder = supabase
    .from('retrospectives')
    .select('*')
    .eq('status', 'PUBLISHED')
    .gte('quality_score', 80)
    .order('quality_score', { ascending: false });

  if (category !== 'all') {
    queryBuilder = queryBuilder.eq('learning_category', category.toUpperCase());
  }

  const { data: retrospectives, error } = await queryBuilder.limit(limit);

  if (error) throw error;
  return retrospectives || [];
}

/**
 * Generate markdown summary for a category
 */
function generateMarkdownSummary(category, patterns, retrospectives) {
  const timestamp = new Date().toISOString().split('T')[0];

  let markdown = `# ${category.toUpperCase()} - Knowledge Summary\n\n`;
  markdown += `**Generated**: ${timestamp}  \n`;
  markdown += `**Purpose**: Quick reference for ${category} lessons learned  \n`;
  markdown += `**Source**: ${patterns.length} patterns, ${retrospectives.length} retrospectives  \n\n`;
  markdown += '---\n\n';

  // Section 1: Top Patterns
  if (patterns.length > 0) {
    markdown += '## 📊 Top Issue Patterns\n\n';

    patterns.forEach((pattern, idx) => {
      const successRate = calculateSuccessRate(pattern);

      markdown += `### ${idx + 1}. ${pattern.pattern_id}: ${pattern.issue_summary}\n\n`;
      markdown += `- **Category**: ${pattern.category}\n`;
      markdown += `- **Severity**: ${pattern.severity}\n`;
      markdown += `- **Occurrences**: ${pattern.occurrence_count} times\n`;
      markdown += `- **Success Rate**: ${Math.round(successRate)}%\n`;
      markdown += `- **Status**: ${pattern.status}\n`;
      markdown += `- **Trend**: ${pattern.trend || 'N/A'}\n\n`;

      // Proven solutions
      if (pattern.proven_solutions && pattern.proven_solutions.length > 0) {
        markdown += '**Proven Solutions**:\n\n';
        pattern.proven_solutions
          .sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))
          .slice(0, 2)
          .forEach((solution, sIdx) => {
            markdown += `${sIdx + 1}. ${solution.solution}\n`;
            markdown += `   - Success: ${Math.round(solution.success_rate || 0)}%\n`;
            markdown += `   - Avg Time: ${Math.round(solution.avg_resolution_time_minutes || 0)} min\n`;
            markdown += `   - Applied: ${solution.times_applied || 0} times\n\n`;
          });
      }

      // Prevention checklist
      if (pattern.prevention_checklist && pattern.prevention_checklist.length > 0) {
        markdown += '**Prevention Checklist**:\n\n';
        pattern.prevention_checklist.slice(0, 3).forEach(item => {
          markdown += `- [ ] ${item}\n`;
        });
        markdown += '\n';
      }

      markdown += '---\n\n';
    });
  } else {
    markdown += '## 📊 Top Issue Patterns\n\n';
    markdown += '*No patterns found for this category.*\n\n';
  }

  // Section 2: Key Learnings from Retrospectives
  if (retrospectives.length > 0) {
    markdown += '## 🎓 Key Learnings from Retrospectives\n\n';

    retrospectives.forEach((retro, idx) => {
      markdown += `### ${idx + 1}. ${retro.title} (Quality: ${retro.quality_score}/100)\n\n`;
      markdown += `- **SD**: ${retro.sd_id}\n`;
      markdown += `- **Date**: ${new Date(retro.conducted_date).toLocaleDateString()}\n`;
      markdown += `- **Team Satisfaction**: ${retro.team_satisfaction}/10\n\n`;

      // Key learnings
      if (retro.key_learnings && retro.key_learnings.length > 0) {
        markdown += '**Key Learnings**:\n\n';
        retro.key_learnings.slice(0, 3).forEach(learning => {
          markdown += `- ${learning}\n`;
        });
        markdown += '\n';
      }

      // Success patterns
      if (retro.success_patterns && retro.success_patterns.length > 0) {
        markdown += '**Success Patterns**:\n\n';
        retro.success_patterns.slice(0, 2).forEach(pattern => {
          markdown += `- ✅ ${pattern}\n`;
        });
        markdown += '\n';
      }

      // Failure patterns (if any)
      if (retro.failure_patterns && retro.failure_patterns.length > 0) {
        markdown += '**Failure Patterns to Avoid**:\n\n';
        retro.failure_patterns.slice(0, 2).forEach(pattern => {
          markdown += `- ❌ ${pattern}\n`;
        });
        markdown += '\n';
      }

      markdown += '---\n\n';
    });
  } else {
    markdown += '## 🎓 Key Learnings from Retrospectives\n\n';
    markdown += '*No retrospectives found for this category.*\n\n';
  }

  // Section 3: Quick Reference
  markdown += '## ⚡ Quick Reference\n\n';
  markdown += '### High-Success Solutions (Apply Preemptively)\n\n';

  const highSuccessPatterns = patterns.filter(p => calculateSuccessRate(p) >= 85);
  if (highSuccessPatterns.length > 0) {
    highSuccessPatterns.slice(0, 5).forEach(pattern => {
      const bestSolution = pattern.proven_solutions
        ?.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))[0];

      if (bestSolution) {
        markdown += `- **${pattern.pattern_id}**: ${bestSolution.solution}\n`;
      }
    });
  } else {
    markdown += '*No high-success patterns (≥85%) found.*\n';
  }

  markdown += '\n### Common Pitfalls (Avoid These)\n\n';

  const lowSuccessPatterns = patterns.filter(p => calculateSuccessRate(p) < 50);
  if (lowSuccessPatterns.length > 0) {
    lowSuccessPatterns.slice(0, 3).forEach(pattern => {
      markdown += `- **${pattern.pattern_id}**: ${pattern.issue_summary}\n`;
    });
  } else {
    markdown += '*No low-success patterns (<50%) found.*\n';
  }

  markdown += '\n---\n\n';
  markdown += `**Last Updated**: ${timestamp}  \n`;
  markdown += '**Update Frequency**: Weekly (run `npm run knowledge:update` to refresh)  \n';
  markdown += '**Related**: See `docs/guides/learning-history-integration-guide.md` for full documentation\n';

  return markdown;
}

/**
 * Calculate success rate from pattern
 */
function calculateSuccessRate(pattern) {
  if (!pattern.proven_solutions || pattern.proven_solutions.length === 0) {
    return 0;
  }

  const totalApplied = pattern.proven_solutions.reduce((sum, s) => sum + (s.times_applied || 0), 0);
  const totalSuccessful = pattern.proven_solutions.reduce((sum, s) => sum + (s.times_successful || 0), 0);

  return totalApplied > 0 ? (totalSuccessful / totalApplied) * 100 : 0;
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

/**
 * Generate summary for a category
 */
async function generateSummary(category) {
  console.log(`\n📝 Generating knowledge summary for: ${category}`);

  const patterns = await fetchTopPatterns(category);
  const retrospectives = await fetchTopRetrospectives(category);

  console.log(`   ✅ Found ${patterns.length} patterns`);
  console.log(`   ✅ Found ${retrospectives.length} retrospectives`);

  const markdown = generateMarkdownSummary(category, patterns, retrospectives);

  const filename = `${category}-lessons.md`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await fs.writeFile(filepath, markdown, 'utf-8');

  console.log(`   ✅ Saved: ${filepath}`);

  return { category, patterns: patterns.length, retrospectives: retrospectives.length };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     📚 Knowledge Summary Generator                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log('Usage:');
    console.log('  node scripts/generate-knowledge-summary.js --category <category>');
    console.log('  node scripts/generate-knowledge-summary.js --category all\n');
    console.log('Available categories:');
    CATEGORIES.forEach(cat => console.log(`  - ${cat}`));
    console.log('\nExamples:');
    console.log('  node scripts/generate-knowledge-summary.js --category database');
    console.log('  node scripts/generate-knowledge-summary.js --category all\n');
    process.exit(0);
  }

  const categoryIndex = args.indexOf('--category');

  if (categoryIndex === -1) {
    console.error('\n❌ Error: --category flag is required\n');
    console.error('Usage: node scripts/generate-knowledge-summary.js --category <category>\n');
    console.error('Available categories: ' + CATEGORIES.join(', ') + ', all\n');
    process.exit(1);
  }

  const category = args[categoryIndex + 1];

  if (!category) {
    console.error('\n❌ Error: Category value is required\n');
    process.exit(1);
  }

  if (category !== 'all' && !CATEGORIES.includes(category)) {
    console.error(`\n❌ Error: Invalid category: ${category}\n`);
    console.error('Available categories: ' + CATEGORIES.join(', ') + ', all\n');
    process.exit(1);
  }

  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     📚 Generating Knowledge Summaries                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    await ensureOutputDir();
    console.log(`\n📁 Output directory: ${OUTPUT_DIR}`);

    const results = [];

    if (category === 'all') {
      console.log(`\n🔄 Generating summaries for all ${CATEGORIES.length} categories...\n`);

      for (const cat of CATEGORIES) {
        const result = await generateSummary(cat);
        results.push(result);
      }
    } else {
      const result = await generateSummary(category);
      results.push(result);
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     ✅ Generation Complete                                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:\n');
    results.forEach(r => {
      console.log(`  ${r.category}: ${r.patterns} patterns, ${r.retrospectives} retrospectives`);
    });

    const totalPatterns = results.reduce((sum, r) => sum + r.patterns, 0);
    const totalRetros = results.reduce((sum, r) => sum + r.retrospectives, 0);

    console.log(`\n  Total: ${totalPatterns} patterns, ${totalRetros} retrospectives`);
    console.log(`  Files created: ${results.length}`);
    console.log(`  Location: ${OUTPUT_DIR}\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check .env has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    console.error('  2. Ensure issue_patterns and retrospectives tables exist');
    console.error('  3. Verify write permissions for docs/summaries/lessons/\n');
    process.exit(1);
  }
}

main();
