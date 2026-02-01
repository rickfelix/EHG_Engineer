#!/usr/bin/env node
/**
 * Auto-Learning Capture Engine
 * SD-LEO-SELF-IMPROVE-001D - Automated Learning Capture for Non-SD Sessions
 *
 * Called by auto-learning-capture.cjs hook after non-SD work is shipped.
 * Analyzes git context and creates appropriate learning entries.
 *
 * What it does:
 * 1. Get PR metadata (files changed, commits, title, body)
 * 2. Classify work type from files changed
 * 3. Extract learnings from commit messages
 * 4. Create retrospective with generated_by: 'AUTO_HOOK'
 * 5. Create issue_pattern if corrective action detected
 *
 * Created: 2026-02-01
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Learning signal keywords that indicate valuable learnings
const LEARNING_SIGNALS = [
  { pattern: /\bfix(?:ed)?:/i, type: 'correction' },
  { pattern: /\bshould use\b/i, type: 'best_practice' },
  { pattern: /\binstead of\b/i, type: 'correction' },
  { pattern: /\bcorrect approach\b/i, type: 'best_practice' },
  { pattern: /\broot cause\b/i, type: 'rca' },
  { pattern: /\bthe issue was\b/i, type: 'diagnosis' },
  { pattern: /\bresilien(?:t|ce)\b/i, type: 'improvement' },
  { pattern: /\bworkaround\b/i, type: 'alternative' },
  { pattern: /\balternative\b/i, type: 'alternative' },
  { pattern: /\bactually\b/i, type: 'correction' },
  { pattern: /\bmissing\b/i, type: 'gap' },
  { pattern: /\bincorrect\b/i, type: 'correction' },
  { pattern: /\bwrong\b/i, type: 'correction' },
  { pattern: /\bdocument(?:ation)?\s+(?:fix|update|correct)/i, type: 'docs_correction' }
];

// Learning-worthy file paths that indicate important changes
const LEARNING_WORTHY_PATHS = {
  'docs/reference/': 'reference_docs',
  'CLAUDE': 'protocol',
  '.claude/agents/': 'agent_config',
  '.claude/skills/': 'skill_config',
  '.claude/commands/': 'command_config',
  'lib/keyword-intent-scorer.js': 'subagent_triggers',
  'scripts/modules/learning/': 'learning_system',
  'scripts/hooks/': 'hook_system',
  'database/migrations/': 'database_schema',
  'supabase/migrations/': 'database_schema'
};

// Work type classification based on file patterns
const WORK_TYPE_CLASSIFIERS = {
  protocol_fix: [/CLAUDE.*\.md$/i, /\.claude\//],
  documentation_correction: [/docs\//, /README/i, /\.md$/],
  hook_improvement: [/scripts\/hooks\//],
  database_change: [/migrations\/.*\.sql$/i],
  configuration: [/\.json$/, /\.yaml$/, /\.yml$/],
  test_fix: [/\.test\./, /\.spec\./, /tests\//],
  ui_polish: [/components\//, /pages\//, /\.tsx$/],
  api_fix: [/api\//, /routes\//, /controllers\//]
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { prNumber: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pr' && args[i + 1]) {
      parsed.prNumber = args[i + 1];
      i++;
    }
  }

  return parsed;
}

/**
 * Get PR details using gh CLI
 * @param {string} prNumber - PR number
 * @returns {Promise<Object>} PR data
 */
async function getPRDetails(prNumber) {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --json number,title,body,mergedAt,mergeCommit,headRefName,files,commits`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return JSON.parse(output);
  } catch (error) {
    console.error(`Error getting PR details: ${error.message}`);
    return null;
  }
}

/**
 * Get files changed in PR
 * @param {string} prNumber - PR number
 * @returns {Promise<Array>} Array of file objects
 */
async function getPRFiles(prNumber) {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --json files`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const data = JSON.parse(output);
    return data.files || [];
  } catch (error) {
    console.error(`Error getting PR files: ${error.message}`);
    return [];
  }
}

/**
 * Classify work type based on files changed
 * @param {Array} files - Array of file objects with path property
 * @returns {string} Work type classification
 */
function classifyWorkType(files) {
  const filePaths = files.map(f => f.path || f);

  for (const [workType, patterns] of Object.entries(WORK_TYPE_CLASSIFIERS)) {
    const matches = filePaths.some(filePath =>
      patterns.some(pattern =>
        typeof pattern === 'string'
          ? filePath.includes(pattern)
          : pattern.test(filePath)
      )
    );
    if (matches) {
      return workType;
    }
  }

  return 'general';
}

/**
 * Check if files are in learning-worthy paths
 * @param {Array} files - Array of file objects
 * @returns {Array} Array of matched categories
 */
function getLearningWorthyCategories(files) {
  const filePaths = files.map(f => f.path || f);
  const categories = new Set();

  for (const filePath of filePaths) {
    for (const [pathPattern, category] of Object.entries(LEARNING_WORTHY_PATHS)) {
      if (filePath.includes(pathPattern)) {
        categories.add(category);
      }
    }
  }

  return Array.from(categories);
}

/**
 * Extract learnings from commit messages
 * @param {Array} commits - Array of commit objects
 * @param {string} prTitle - PR title
 * @param {string} prBody - PR body
 * @returns {Array} Array of learning objects
 */
function extractLearnings(commits, prTitle, prBody) {
  const learnings = [];

  // Combine all text sources
  const commitMessages = commits
    .map(c => c.messageHeadline || c.message || '')
    .join('\n');

  const allText = `${prTitle}\n${prBody || ''}\n${commitMessages}`;

  // Check for learning signals
  for (const signal of LEARNING_SIGNALS) {
    if (signal.pattern.test(allText)) {
      // Extract the sentence containing the signal
      const sentences = allText.split(/[.!?\n]+/);
      const relevantSentences = sentences.filter(s => signal.pattern.test(s));

      for (const sentence of relevantSentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 500) {
          learnings.push({
            text: trimmed,
            type: signal.type,
            source: 'commit_message'
          });
        }
      }
    }
  }

  // If no specific learnings found, use PR title as the learning
  if (learnings.length === 0 && prTitle) {
    learnings.push({
      text: prTitle,
      type: 'general',
      source: 'pr_title'
    });
  }

  // Deduplicate
  const seen = new Set();
  return learnings.filter(l => {
    const key = l.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Check if any learning indicates a corrective action
 * @param {Array} learnings - Array of learning objects
 * @returns {boolean}
 */
function hasCorrectiveAction(learnings) {
  const correctiveTypes = ['correction', 'docs_correction', 'gap', 'rca'];
  return learnings.some(l => correctiveTypes.includes(l.type));
}

/**
 * Map work type to retrospective learning category
 * @param {string} workType - Work type
 * @returns {string} Learning category
 */
function mapWorkTypeToCategory(workType) {
  const mapping = {
    protocol_fix: 'PROCESS_IMPROVEMENT',
    documentation_correction: 'DOCUMENTATION',
    hook_improvement: 'INFRASTRUCTURE',
    database_change: 'DATABASE',
    configuration: 'CONFIGURATION',
    test_fix: 'TESTING',
    ui_polish: 'UI_UX',
    api_fix: 'API',
    general: 'GENERAL'
  };
  return mapping[workType] || 'GENERAL';
}

/**
 * Map work type to issue pattern category
 * @param {string} workType - Work type
 * @returns {string} Pattern category
 */
function mapWorkTypeToPatternCategory(workType) {
  const mapping = {
    protocol_fix: 'protocol',
    documentation_correction: 'documentation',
    hook_improvement: 'infrastructure',
    database_change: 'database',
    configuration: 'configuration',
    test_fix: 'testing',
    ui_polish: 'ui',
    api_fix: 'api',
    general: 'general'
  };
  return mapping[workType] || 'general';
}

/**
 * Generate a unique pattern ID
 * @returns {string} Pattern ID
 */
async function generatePatternId() {
  // Get the highest existing auto pattern number
  const { data: lastPattern } = await supabase
    .from('issue_patterns')
    .select('pattern_id')
    .like('pattern_id', 'PAT-AUTO-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let num = 1;
  if (lastPattern?.pattern_id) {
    const match = lastPattern.pattern_id.match(/PAT-AUTO-(\d+)/);
    if (match) {
      num = parseInt(match[1], 10) + 1;
    }
  }

  return `PAT-AUTO-${String(num).padStart(4, '0')}`;
}

/**
 * Create a retrospective entry
 * @param {Object} data - Retrospective data
 * @returns {Promise<Object>} Created retrospective
 */
async function createRetrospective(data) {
  const retrospective = {
    title: `Auto-Captured: ${data.prTitle || 'Non-SD Work'}`,
    description: `Automatically captured learning from non-SD work merged via PR #${data.prNumber}`,
    retro_type: 'NON_SD_CAPTURE',
    retrospective_type: 'NON_SD_CAPTURE',
    conducted_date: new Date().toISOString(),
    what_went_well: [
      'Work completed and merged successfully',
      'Learning captured automatically without manual steps'
    ],
    what_needs_improvement: [],
    key_learnings: data.learnings.map(l => ({
      learning: l.text,
      category: l.type,
      evidence: `PR #${data.prNumber}`
    })),
    action_items: [],
    status: 'PUBLISHED',
    quality_score: 70,
    generated_by: 'AUTO_HOOK',
    trigger_event: 'NON_SD_MERGE',
    target_application: 'EHG_Engineer',
    learning_category: data.workType,
    affected_components: data.files.slice(0, 10),
    metadata: {
      pr_number: data.prNumber,
      pr_url: data.prUrl,
      work_type: data.workType,
      learning_worthy_categories: data.learningWorthyCategories,
      auto_captured: true,
      captured_at: new Date().toISOString()
    }
  };

  const { data: created, error } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select('id')
    .single();

  if (error) {
    console.error('Error creating retrospective:', error.message);
    return null;
  }

  return created;
}

/**
 * Create an issue pattern entry
 * @param {Object} data - Pattern data
 * @returns {Promise<Object>} Created pattern
 */
async function createIssuePattern(data) {
  const patternId = await generatePatternId();

  const pattern = {
    pattern_id: patternId,
    category: data.category,
    severity: 'medium',
    issue_summary: data.learnings[0]?.text || data.prTitle,
    occurrence_count: 1,
    first_seen_sd_id: null, // Not from an SD
    last_seen_sd_id: null,
    proven_solutions: [{
      solution: data.prTitle,
      times_applied: 1,
      times_successful: 1,
      success_rate: 100,
      from_pr: data.prNumber
    }],
    prevention_checklist: [],
    related_sub_agents: [],
    trend: 'stable',
    status: 'active',
    source: 'auto_hook',
    metadata: {
      pr_number: data.prNumber,
      pr_url: data.prUrl,
      work_type: data.workType,
      auto_captured: true,
      captured_at: new Date().toISOString()
    }
  };

  const { data: created, error } = await supabase
    .from('issue_patterns')
    .insert(pattern)
    .select('pattern_id')
    .single();

  if (error) {
    console.error('Error creating issue pattern:', error.message);
    return null;
  }

  return created;
}

/**
 * Main capture function
 * @param {string} prNumber - PR number
 */
async function captureLearningSFromMerge(prNumber) {
  console.log('\n========================================');
  console.log('  AUTO-LEARNING CAPTURE ENGINE');
  console.log('========================================');
  console.log(`  PR: #${prNumber}`);
  console.log('');

  // 1. Get PR metadata
  const pr = await getPRDetails(prNumber);
  if (!pr) {
    console.error('Failed to get PR details. Aborting.');
    return { success: false, error: 'PR details not found' };
  }

  const files = pr.files || await getPRFiles(prNumber);
  const commits = pr.commits || [];

  console.log(`  Files changed: ${files.length}`);
  console.log(`  Commits: ${commits.length}`);

  // 2. Classify work type from files changed
  const workType = classifyWorkType(files);
  console.log(`  Work type: ${workType}`);

  // 3. Get learning-worthy categories
  const learningWorthyCategories = getLearningWorthyCategories(files);
  if (learningWorthyCategories.length > 0) {
    console.log(`  Learning-worthy: ${learningWorthyCategories.join(', ')}`);
  }

  // 4. Extract learnings from commits
  const learnings = extractLearnings(commits, pr.title, pr.body);
  console.log(`  Learnings extracted: ${learnings.length}`);

  // 5. Determine if issue_pattern should be created
  const shouldCreatePattern =
    workType === 'protocol_fix' ||
    workType === 'documentation_correction' ||
    learningWorthyCategories.length > 0 ||
    hasCorrectiveAction(learnings);

  const captureData = {
    prNumber,
    prTitle: pr.title,
    prUrl: `https://github.com/${process.env.GITHUB_REPO || 'rickfelix/ehg-engineer'}/pull/${prNumber}`,
    workType: mapWorkTypeToCategory(workType),
    learningWorthyCategories,
    learnings,
    files: files.map(f => f.path || f)
  };

  // 6. Create retrospective
  console.log('\n  Creating retrospective...');
  const retro = await createRetrospective(captureData);

  if (retro) {
    console.log(`    Created: retrospective ${retro.id}`);
  } else {
    console.log('    Failed to create retrospective');
  }

  // 7. Create issue_pattern if corrective action
  let pattern = null;
  if (shouldCreatePattern) {
    console.log('  Creating issue pattern...');
    pattern = await createIssuePattern({
      ...captureData,
      category: mapWorkTypeToPatternCategory(workType)
    });

    if (pattern) {
      console.log(`    Created: ${pattern.pattern_id}`);
    } else {
      console.log('    Failed to create pattern');
    }
  }

  // 8. Summary
  console.log('\n========================================');
  console.log('  CAPTURE SUMMARY');
  console.log('========================================');
  console.log(`  Retrospective: ${retro ? retro.id : 'FAILED'}`);
  console.log(`  Pattern: ${pattern ? pattern.pattern_id : shouldCreatePattern ? 'FAILED' : 'N/A (not corrective)'}`);
  console.log(`  Learnings: ${learnings.length} captured`);
  console.log('========================================\n');

  return {
    success: true,
    retrospective_id: retro?.id,
    pattern_id: pattern?.pattern_id,
    learnings_captured: learnings.length
  };
}

// Main execution
async function main() {
  const args = parseArgs();

  if (!args.prNumber) {
    console.error('Usage: node auto-learning-capture.js --pr <PR_NUMBER>');
    process.exit(1);
  }

  try {
    const result = await captureLearningSFromMerge(args.prNumber);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Auto-learning capture failed:', error.message);
    process.exit(1);
  }
}

main();
