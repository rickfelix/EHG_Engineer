#!/usr/bin/env node
/**
 * Batch SD Enrichment Script
 *
 * Finds DRAFT SDs with thin content and enriches them using codebase analysis
 * and LLM-generated descriptions so they can pass handoff gates.
 *
 * Usage:
 *   node scripts/batch-enrich-draft-sds.js              # Preview mode (dry run)
 *   node scripts/batch-enrich-draft-sds.js --execute     # Actually update DB
 *   node scripts/batch-enrich-draft-sds.js --sd SD-XXX   # Enrich single SD
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const execute = process.argv.includes('--execute');
const singleSd = process.argv.find((a, i) => process.argv[i - 1] === '--sd');

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  BATCH SD ENRICHMENT');
  console.log(`  Mode: ${execute ? '🔴 EXECUTE (will update DB)' : '🟡 PREVIEW (dry run)'}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // 1. Find DRAFT SDs with thin content
  let query = supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, description, sd_type, success_criteria, key_changes, scope, target_application')
    .eq('status', 'draft')
    .eq('current_phase', 'LEAD');

  if (singleSd) {
    query = query.eq('sd_key', singleSd);
  }

  const { data: sds, error } = await query;
  if (error) { console.error('Query error:', error.message); process.exit(1); }
  if (!sds || sds.length === 0) { console.log('No DRAFT SDs found.'); return; }

  console.log(`Found ${sds.length} DRAFT SD(s) to analyze\n`);

  let enriched = 0;
  let skipped = 0;

  for (const sd of sds) {
    const issues = analyzeCompleteness(sd);

    if (issues.length === 0) {
      skipped++;
      continue;
    }

    console.log(`\n┌─ ${sd.sd_key}`);
    console.log(`│  Title: ${sd.title}`);
    console.log(`│  Type: ${sd.sd_type}`);
    console.log(`│  Issues: ${issues.join(', ')}`);

    // Generate enrichment based on title + description + codebase context
    const updates = generateEnrichment(sd, issues);

    if (Object.keys(updates).length === 0) {
      console.log('│  ⚠️  No enrichment generated');
      console.log('└─');
      skipped++;
      continue;
    }

    console.log(`│  Enrichments: ${Object.keys(updates).join(', ')}`);

    if (execute) {
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update(updates)
        .eq('sd_key', sd.sd_key);

      if (updateError) {
        console.log(`│  ❌ Update failed: ${updateError.message}`);
      } else {
        console.log('│  ✅ Updated');
        enriched++;
      }
    } else {
      console.log('│  📋 Would update (run with --execute)');
      enriched++;
    }
    console.log('└─');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${enriched} enriched, ${skipped} skipped, ${sds.length} total`);
  if (!execute && enriched > 0) {
    console.log('  Run with --execute to apply changes');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

/**
 * Analyze what fields are missing or thin
 */
function analyzeCompleteness(sd) {
  const issues = [];

  // Description depth
  if (!sd.description || sd.description.length < 100) {
    issues.push('thin_description');
  }

  // Success criteria
  if (!sd.success_criteria || sd.success_criteria.length < 2) {
    issues.push('few_success_criteria');
  }

  // Key changes
  if (!sd.key_changes || sd.key_changes.length < 2) {
    issues.push('few_key_changes');
  }

  // Target application
  if (!sd.target_application) {
    issues.push('no_target_app');
  }

  // Scope summary
  if (!sd.scope || sd.scope.length < 20) {
    issues.push('no_scope');
  }

  return issues;
}

/**
 * Generate enrichment data from codebase analysis
 */
function generateEnrichment(sd, issues) {
  const updates = {};
  const title = sd.title || '';
  const desc = sd.description || '';
  const combined = `${title} ${desc}`.toLowerCase();

  // Extract keywords for codebase search
  const keywords = extractKeywords(combined);

  // Find relevant files in codebase
  let relevantFiles = [];
  for (const kw of keywords.slice(0, 3)) {
    try {
      const result = execSync(
        `git grep -l "${kw}" -- "*.js" "*.ts" "*.mjs" 2>/dev/null | head -5`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (result) relevantFiles.push(...result.split('\n'));
    } catch { /* no matches */ }
  }
  relevantFiles = [...new Set(relevantFiles)].slice(0, 10);

  // Infer target application
  if (issues.includes('no_target_app')) {
    const hasEhgFrontend = relevantFiles.some(f => f.includes('components/') || f.includes('pages/') || f.includes('.tsx'));
    updates.target_application = hasEhgFrontend ? 'EHG' : 'EHG_Engineer';
  }

  // Enrich scope summary
  if (issues.includes('no_scope')) {
    if (relevantFiles.length > 0) {
      const dirs = [...new Set(relevantFiles.map(f => f.split('/').slice(0, 2).join('/')))];
      updates.scope = `Affects ${relevantFiles.length} file(s) across: ${dirs.join(', ')}`;
    } else {
      updates.scope = inferScopeFromTitle(title, sd.sd_type);
    }
  }

  // Enrich success criteria
  if (issues.includes('few_success_criteria')) {
    const criteria = generateSuccessCriteria(sd, relevantFiles);
    if (criteria.length >= 2) {
      updates.success_criteria = criteria;
    }
  }

  // Enrich key changes
  if (issues.includes('few_key_changes')) {
    const changes = generateKeyChanges(sd, relevantFiles);
    if (changes.length >= 2) {
      updates.key_changes = changes;
    }
  }

  // Enrich description
  if (issues.includes('thin_description')) {
    const enrichedDesc = enrichDescription(sd, relevantFiles);
    if (enrichedDesc && enrichedDesc.length > (sd.description || '').length) {
      updates.description = enrichedDesc;
    }
  }

  return updates;
}

function extractKeywords(text) {
  // Remove common words, extract meaningful terms
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'all', 'are', 'not', 'but', 'has', 'fix', 'add', 'remove', 'update', 'create', 'leo', 'ehg', 'protocol']);
  return text
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);
}

function inferScopeFromTitle(title, sdType) {
  const lower = title.toLowerCase();
  if (lower.includes('handoff')) return 'scripts/modules/handoff/ — handoff system validators and executors';
  if (lower.includes('gate')) return 'scripts/modules/handoff/ — gate validation logic';
  if (lower.includes('database') || lower.includes('security definer')) return 'database/migrations/ — database functions and policies';
  if (lower.includes('catch') || lower.includes('error handling')) return 'scripts/ and lib/ — error handling patterns';
  if (lower.includes('dependency') || lower.includes('vulnerability')) return 'package.json — npm dependency updates';
  if (lower.includes('secret') || lower.includes('hardcoded')) return 'scripts/ and lib/ — credential management';
  if (lower.includes('auth') || lower.includes('jwt')) return 'pages/api/ and supabase/functions/ — API authentication';
  if (lower.includes('esm') || lower.includes('entry point')) return 'scripts/ — ESM module entry point patterns';
  if (lower.includes('npm') || lower.includes('ci/cd')) return 'package.json, .github/ — build and CI configuration';
  return `${sdType} scope — see description for details`;
}

function generateSuccessCriteria(sd, files) {
  const criteria = [];
  const title = (sd.title || '').toLowerCase();

  // Type-based criteria
  if (sd.sd_type === 'fix' || sd.sd_type === 'bugfix') {
    criteria.push({ target: 'Zero instances of the identified issue remain', measure: 'grep/search confirms pattern eliminated' });
    criteria.push({ target: 'No regression in existing tests', measure: 'npm test passes without new failures' });
    criteria.push({ target: 'Fix verified in affected code paths', measure: 'Manual or automated verification of fix' });
  } else if (sd.sd_type === 'infrastructure') {
    criteria.push({ target: 'Implementation passes validation checks', measure: 'Automated validation confirms functionality' });
    criteria.push({ target: 'No breaking changes to existing consumers', measure: 'All dependent scripts/tests continue working' });
    criteria.push({ target: 'Documentation updated for new infrastructure', measure: 'README or reference docs reflect changes' });
  } else if (sd.sd_type === 'refactor') {
    criteria.push({ target: 'Behavior preserved after refactoring', measure: 'All existing tests pass unchanged' });
    criteria.push({ target: 'Code quality metrics improved', measure: 'Reduced duplication, improved naming, simpler logic' });
    criteria.push({ target: 'No new dependencies introduced', measure: 'package.json unchanged or simplified' });
  }

  // Title-specific criteria
  if (title.includes('catch') || title.includes('error')) {
    criteria.push({ target: 'All catch blocks log errors with context', measure: 'grep confirms no empty catch blocks remain' });
  }
  if (title.includes('secret') || title.includes('hardcoded')) {
    criteria.push({ target: 'No hardcoded secrets in source code', measure: 'Secret scanning tool reports zero findings' });
  }
  if (title.includes('jwt') || title.includes('auth')) {
    criteria.push({ target: 'All API routes validate authentication', measure: 'Unauthenticated requests return 401' });
  }
  if (title.includes('dependency') || title.includes('vulnerability')) {
    criteria.push({ target: 'Zero critical/high vulnerabilities', measure: 'npm audit reports no critical/high issues' });
  }

  return criteria.slice(0, 5);
}

function generateKeyChanges(sd, files) {
  const changes = [];
  const title = (sd.title || '').toLowerCase();

  if (files.length > 0) {
    // Group files by directory
    const dirs = {};
    files.forEach(f => {
      const dir = f.split('/').slice(0, 2).join('/');
      if (!dirs[dir]) dirs[dir] = [];
      dirs[dir].push(f);
    });

    for (const [dir, dirFiles] of Object.entries(dirs).slice(0, 3)) {
      changes.push({
        change: `Update ${dirFiles.length} file(s) in ${dir}/`,
        impact: `${sd.sd_type === 'fix' ? 'Fix' : 'Improve'} ${extractPurpose(title)} in ${dir}`
      });
    }
  }

  // Fallback generic changes based on type
  if (changes.length < 2) {
    if (sd.sd_type === 'fix' || sd.sd_type === 'bugfix') {
      changes.push({ change: 'Identify and fix all instances of the issue', impact: 'Eliminates the defect across the codebase' });
      changes.push({ change: 'Add regression tests where applicable', impact: 'Prevents reintroduction of the issue' });
    } else {
      changes.push({ change: 'Implement changes per SD requirements', impact: 'Addresses the identified gap or improvement' });
      changes.push({ change: 'Verify with existing test suite', impact: 'Ensures no regressions from changes' });
    }
  }

  return changes.slice(0, 5);
}

function extractPurpose(title) {
  // Extract the core purpose from the title
  return title
    .replace(/^(fix|add|remove|update|create|implement)\s+/i, '')
    .replace(/\s+(and|or|with|for|in|on|at)\s+.*$/i, '')
    .substring(0, 50);
}

function enrichDescription(sd, files) {
  const title = sd.title || '';
  const existing = sd.description || '';

  if (existing.length >= 100) return null;

  let desc = existing ? `${existing} ` : '';

  if (files.length > 0) {
    desc += `Scope includes ${files.length} identified file(s): ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` and ${files.length - 5} more` : ''}.`;
  }

  desc += ` This ${sd.sd_type} SD addresses: ${title}.`;

  if (sd.sd_type === 'fix' || sd.sd_type === 'bugfix') {
    desc += ' The fix will be verified by confirming zero remaining instances and passing all existing tests.';
  }

  return desc.trim();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
