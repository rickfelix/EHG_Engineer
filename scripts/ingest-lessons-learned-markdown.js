#!/usr/bin/env node
/**
 * INGEST LESSONS LEARNED MARKDOWN FILES
 * LEO Protocol v4.3.2 Enhancement
 *
 * Parses docs/lessons-learned-*.md files and migrates content to issue_patterns table
 * This is a one-time migration script to backfill existing lessons.
 *
 * Usage: node scripts/ingest-lessons-learned-markdown.js [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Category mapping based on keywords in content
 */
const CATEGORY_KEYWORDS = {
  database: ['database', 'schema', 'migration', 'rls', 'policy', 'postgres', 'supabase', 'sql'],
  testing: ['test', 'playwright', 'e2e', 'jest', 'spec', 'coverage'],
  deployment: ['deploy', 'ci', 'cd', 'github', 'actions', 'pipeline'],
  security: ['security', 'auth', 'rls', 'permission', 'token'],
  build: ['build', 'vite', 'compile', 'bundle'],
  protocol: ['leo', 'handoff', 'sub-agent', 'phase'],
  code_structure: ['import', 'component', 'refactor', 'architecture']
};

/**
 * Sub-agent mapping by category
 */
const CATEGORY_SUBAGENT_MAPPING = {
  database: ['DATABASE', 'SECURITY'],
  testing: ['TESTING', 'UAT'],
  deployment: ['GITHUB', 'DEPENDENCY'],
  security: ['SECURITY', 'DATABASE'],
  build: ['GITHUB', 'DEPENDENCY'],
  protocol: ['RETRO', 'DOCMON', 'VALIDATION'],
  code_structure: ['VALIDATION', 'DESIGN']
};

/**
 * Parse markdown file and extract structured content
 * Enhanced v2: Handles JSON blocks, Executive Summary, Key Insights, and more formats
 */
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  console.log(`\n📄 Parsing: ${fileName}`);

  const result = {
    fileName,
    filePath,
    title: '',
    context: '',
    date: null,
    patterns: [],
    solutions: [],
    prevention: []
  };

  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Extract date from content or filename
  const dateMatch = content.match(/\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    result.date = dateMatch[1];
  }

  // Extract context
  const contextMatch = content.match(/\*\*Context\*\*:\s*(.+)/);
  if (contextMatch) {
    result.context = contextMatch[1].trim();
  }

  // Extract Executive Summary as pattern (often contains key issue description)
  const execSummaryMatch = content.match(/##\s*Executive\s+Summary[\s\S]*?(?=\n##|$)/i);
  if (execSummaryMatch) {
    // Get first meaningful paragraph
    const paragraphs = execSummaryMatch[0].split('\n\n').filter(p =>
      p.trim() && !p.startsWith('##') && !p.startsWith('**Key')
    );
    if (paragraphs.length > 0) {
      const summary = paragraphs[0].replace(/\n/g, ' ').trim();
      if (summary.length >= 50) {
        result.patterns.push(summary);
      }
    }
  }

  // Extract Key Learnings/Insights section (multiple formats)
  const keyLearningsPatterns = [
    /##.*Key\s+(?:Learnings?|Lessons?|Takeaways?|Insights?|Achievements?)[\s\S]*?(?=\n##|$)/gi,
    /\*\*Key\s+(?:Learning|Lesson|Insight)\*\*:?\s*([^\n]+)/gi
  ];

  for (const pattern of keyLearningsPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const section = match[1] || match[0];
      const bullets = section.match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        result.patterns.push(...bullets.map(b => b.replace(/^[-*]\s+/, '').trim()));
      }
    }
  }

  // Extract Problem Statement section
  const problemMatch = content.match(/##.*(?:Problem|Issue|Root\s+Cause|Initial\s+Symptom)[\s\S]*?(?=\n##|$)/i);
  if (problemMatch) {
    const bullets = problemMatch[0].match(/^[-*]\s+(.+)$/gm);
    if (bullets) {
      result.patterns.push(...bullets.map(b => b.replace(/^[-*]\s+/, '').trim()));
    }
    // Also extract **Blocked**: lines
    const blockedLines = problemMatch[0].match(/\*\*(?:Blocked|Impact|Risk)\*\*:?\s*([^\n]+)/gi);
    if (blockedLines) {
      result.patterns.push(...blockedLines.map(b => b.replace(/\*\*/g, '').trim()));
    }
  }

  // Extract Solutions section
  const solutionsMatch = content.match(/##.*(?:Solution|Fix|Resolution|Remediation|Implementation)[\s\S]*?(?=\n##|$)/i);
  if (solutionsMatch) {
    const bullets = solutionsMatch[0].match(/^(?:[-*]|\d+\.)\s+(.+)$/gm);
    if (bullets) {
      result.solutions.push(...bullets.map(b => b.replace(/^(?:[-*]|\d+\.)\s+/, '').trim()));
    }
    // Extract **Rationale**: lines as solutions context
    const rationaleLines = solutionsMatch[0].match(/\*\*(?:Rationale|Key\s+Insight)\*\*:?\s*([^\n]+)/gi);
    if (rationaleLines) {
      result.solutions.push(...rationaleLines.map(r => r.replace(/\*\*/g, '').trim()));
    }
  }

  // Extract Prevention Checklist from multiple sources
  const preventionPatterns = [
    /##.*(?:Prevention|Checklist|Best\s+Practices?|Verification)[\s\S]*?(?=\n##|$)/i,
    /"prevention_checklist":\s*\[([\s\S]*?)\]/i  // JSON format
  ];

  for (const pattern of preventionPatterns) {
    const match = content.match(pattern);
    if (match) {
      if (pattern.toString().includes('prevention_checklist')) {
        // Parse JSON array
        try {
          const items = match[1].match(/"([^"]+)"/g);
          if (items) {
            result.prevention.push(...items.map(i => i.replace(/"/g, '').trim()));
          }
        } catch (e) {
          // Ignore parse errors
        }
      } else {
        const bullets = match[0].match(/^[-*]\s+(.+)$/gm);
        if (bullets) {
          result.prevention.push(...bullets.map(b => b.replace(/^[-*]\s+/, '').trim()));
        }
      }
    }
  }

  // Extract "Do NOT" patterns (anti-patterns to avoid)
  const doNotPatterns = content.match(/(?:Do\s+NOT|Don't|Avoid|Never)\s+[^.\n]+[.!]?/gi);
  if (doNotPatterns) {
    result.prevention.push(...doNotPatterns.map(p => p.trim()));
  }

  // Extract **Key Learning**: inline patterns
  const inlineKeyLearnings = content.matchAll(/\*\*(?:Key\s+Learning|Lesson|Discovery|Insight)\*\*:?\s*([^\n]+)/gi);
  for (const match of inlineKeyLearnings) {
    if (match[1] && match[1].length > 20) {
      result.patterns.push(match[1].trim());
    }
  }

  // Deduplicate all arrays
  result.patterns = [...new Set(result.patterns)].filter(p => p.length >= 20);
  result.solutions = [...new Set(result.solutions)].filter(s => s.length >= 10);
  result.prevention = [...new Set(result.prevention)].filter(p => p.length >= 10);

  console.log(`   Title: ${result.title}`);
  console.log(`   Patterns: ${result.patterns.length}`);
  console.log(`   Solutions: ${result.solutions.length}`);
  console.log(`   Prevention: ${result.prevention.length}`);

  return result;
}

/**
 * Determine category from content
 */
function determineCategory(content) {
  const lowerContent = content.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchCount = keywords.filter(kw => lowerContent.includes(kw)).length;
    if (matchCount >= 2) {
      return category;
    }
  }

  // Check for single strong match
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Determine severity from content
 */
function determineSeverity(content) {
  const lower = content.toLowerCase();

  if (lower.includes('critical') || lower.includes('blocker') || lower.includes('security')) {
    return 'critical';
  }
  if (lower.includes('high') || lower.includes('blocked') || lower.includes('failed')) {
    return 'high';
  }
  if (lower.includes('low') || lower.includes('minor')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Generate next pattern ID
 */
async function getNextPatternId(prefix = 'PAT') {
  const { data } = await supabase
    .from('issue_patterns')
    .select('pattern_id')
    .like('pattern_id', `${prefix}-%`)
    .order('pattern_id', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return `${prefix}-001`;
  }

  const match = data.pattern_id.match(new RegExp(`${prefix}-(\\d+)`));
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }

  return `${prefix}-001`;
}

/**
 * Create pattern from parsed markdown
 */
async function createPatternFromMarkdown(parsed, dryRun = false) {
  const fullContent = [parsed.title, parsed.context, ...parsed.patterns, ...parsed.solutions].join(' ');
  const category = determineCategory(fullContent);
  const severity = determineSeverity(fullContent);
  const relatedSubAgents = CATEGORY_SUBAGENT_MAPPING[category] || ['VALIDATION'];

  // Create issue summary from title or first pattern
  const issueSummary = parsed.patterns.length > 0
    ? parsed.patterns[0]
    : parsed.title;

  // Format proven solutions
  const provenSolutions = parsed.solutions.slice(0, 3).map((sol, idx) => ({
    solution: sol,
    method: `From ${parsed.fileName}`,
    success_rate: 100,
    times_applied: 1,
    times_successful: 1
  }));

  // Format prevention checklist
  const preventionChecklist = parsed.prevention.slice(0, 5);

  const pattern = {
    pattern_id: await getNextPatternId('PAT'),
    category,
    severity,
    issue_summary: issueSummary.substring(0, 500),
    occurrence_count: 1,
    proven_solutions: provenSolutions,
    prevention_checklist: preventionChecklist,
    related_sub_agents: relatedSubAgents,
    status: 'active',
    trend: 'stable'
  };

  console.log('\n   📊 Pattern to create:');
  console.log(`      ID: ${pattern.pattern_id}`);
  console.log(`      Category: ${category}`);
  console.log(`      Severity: ${severity}`);
  console.log(`      Sub-agents: ${relatedSubAgents.join(', ')}`);
  console.log(`      Solutions: ${provenSolutions.length}`);
  console.log(`      Prevention: ${preventionChecklist.length}`);

  if (dryRun) {
    console.log(`   ⏸️  DRY RUN - would create pattern ${pattern.pattern_id}`);
    return { pattern, dryRun: true };
  }

  const { data, error } = await supabase
    .from('issue_patterns')
    .insert([pattern])
    .select()
    .single();

  if (error) {
    console.error(`   ❌ Error creating pattern: ${error.message}`);
    return { pattern, error };
  }

  console.log(`   ✅ Created pattern: ${data.pattern_id}`);
  return { pattern: data, success: true };
}

/**
 * Main ingestion function
 */
async function ingestLessonsLearned(dryRun = false) {
  console.log('\n📚 LESSONS LEARNED MARKDOWN INGESTION');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);

  const docsDir = path.join(process.cwd(), 'docs');

  // Find all lessons-learned-*.md files
  let files = [];
  try {
    const allFiles = fs.readdirSync(docsDir);
    files = allFiles.filter(f =>
      f.startsWith('lessons-learned-') && f.endsWith('.md')
    );
  } catch (error) {
    console.error(`❌ Could not read docs directory: ${error.message}`);
    return;
  }

  if (files.length === 0) {
    console.log('\nℹ️  No lessons-learned-*.md files found in docs/');
    return;
  }

  console.log(`\nFound ${files.length} lessons-learned files to process`);

  const results = {
    processed: 0,
    created: 0,
    errors: 0,
    skipped: 0
  };

  for (const file of files) {
    const filePath = path.join(docsDir, file);

    try {
      const parsed = parseMarkdownFile(filePath);

      // Skip if no meaningful content extracted
      if (parsed.patterns.length === 0 && parsed.solutions.length === 0) {
        console.log(`   ⏭️  Skipping ${file} - no patterns or solutions extracted`);
        results.skipped++;
        continue;
      }

      const result = await createPatternFromMarkdown(parsed, dryRun);

      if (result.success || result.dryRun) {
        results.created++;
      } else if (result.error) {
        results.errors++;
      }

      results.processed++;

    } catch (error) {
      console.error(`\n❌ Error processing ${file}: ${error.message}`);
      results.errors++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 INGESTION SUMMARY');
  console.log(`   Files processed: ${results.processed}`);
  console.log(`   Patterns created: ${results.created}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`   Errors: ${results.errors}`);

  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('   Run without --dry-run to create patterns');
  }

  return results;
}

// CLI
const dryRun = process.argv.includes('--dry-run');
ingestLessonsLearned(dryRun)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
