#!/usr/bin/env node
/**
 * Dependency Checker Module
 * Enhanced QA Engineering Director v2.0
 *
 * Checks for cross-SD dependencies to prevent build conflicts.
 * Impact: Saves 10-15 minutes of debugging build failures.
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Check for cross-SD dependencies
 * @param {string} sd_id - Current Strategic Directive ID
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Dependency check results
 */
export async function checkCrossSDDependencies(sd_id, targetApp = 'ehg') {
  console.log(`🔍 Dependency Checker: Analyzing cross-SD dependencies for ${sd_id}...`);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Get other in-progress SDs
  const { data: inProgressSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, progress, status, metadata')
    .in('status', ['in_progress', 'active', 'pending_approval'])
    .neq('id', sd_id);

  if (error) {
    console.error('   ⚠️  Could not query in-progress SDs:', error.message);
    return {
      verdict: 'SKIP',
      message: 'Could not check dependencies - database query failed',
      error: error.message
    };
  }

  if (!inProgressSDs || inProgressSDs.length === 0) {
    return {
      verdict: 'NO_CONFLICTS',
      message: 'No other in-progress SDs found',
      sd_id
    };
  }

  console.log(`   Found ${inProgressSDs.length} other in-progress SD(s)`);

  // Analyze imports in current SD code
  const imports = await analyzeSDImports(sd_id, targetApp);

  // Check for conflicts
  const conflicts = [];

  for (const importPath of imports) {
    const conflictingSD = findConflictingSD(importPath, inProgressSDs);

    if (conflictingSD) {
      const risk = conflictingSD.progress < 50 ? 'high' : 'medium';
      conflicts.push({
        import_path: importPath,
        conflicting_sd: conflictingSD.id,
        conflicting_sd_title: conflictingSD.title,
        progress: conflictingSD.progress,
        status: conflictingSD.status,
        risk
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      verdict: 'WARNING',
      conflicts,
      conflicts_count: conflicts.length,
      recommendations: generateDependencyRecommendations(conflicts),
      sd_id,
      app: targetApp,
      summary: `${conflicts.length} potential conflict(s) detected`
    };
  }

  return {
    verdict: 'NO_CONFLICTS',
    message: 'No cross-SD dependency conflicts detected',
    checked_sds: inProgressSDs.length,
    imports_analyzed: imports.length,
    sd_id,
    app: targetApp
  };
}

/**
 * Analyze imports in SD code
 */
async function analyzeSDImports(sd_id, targetApp) {
  const appPath = targetApp === 'ehg'
    ? '/mnt/c/_EHG/EHG/src'
    : '/mnt/c/_EHG/EHG_Engineer/src';

  try {
    // Search for import statements
    const grepCommand = `grep -rh "^import.*from" ${appPath} 2>/dev/null || echo ""`;
    const output = execSync(grepCommand, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // Extract unique import paths
    const importPaths = new Set();
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/from ['"]([^'"]+)['"]/);
      if (match) {
        importPaths.add(match[1]);
      }
    }

    return Array.from(importPaths);
  } catch (error) {
    console.error('   ⚠️  Could not analyze imports:', error.message);
    return [];
  }
}

/**
 * Find SD that might conflict with import
 */
function findConflictingSD(importPath, inProgressSDs) {
  // Common library patterns to exclude (prevent false positives)
  const EXCLUDED_PATTERNS = [
    'react', 'lodash', 'axios', '@supabase', '@tanstack',
    'chart', 'date-fns', 'lucide', 'recharts', 'zod',
    '@radix', 'clsx', 'tailwind', 'vite', 'vitest'
  ];

  // Skip common libraries
  const lowerPath = importPath.toLowerCase();
  if (EXCLUDED_PATTERNS.some(pattern => lowerPath.includes(pattern))) {
    return null;
  }

  // Common words to exclude from title matching
  const COMMON_WORDS = [
    'feature', 'system', 'integration', 'service', 'component',
    'management', 'analytics', 'dashboard', 'platform', 'framework'
  ];

  for (const sd of inProgressSDs) {
    // Extract SD slug variations
    const sdSlug = sd.id.toLowerCase().replace('sd-', '').replace(/-/g, '_');
    const sdSlugDash = sd.id.toLowerCase().replace('sd-', '');

    // Strict matching: SD slug must appear as path segment (not partial match)
    // Match patterns: /sd_slug/ or /sd-slug/ or ending with /sd_slug or /sd-slug
    const sdSlugRegex = new RegExp(`[/\\\\]${sdSlug}([/\\\\]|$)`, 'i');
    const sdSlugDashRegex = new RegExp(`[/\\\\]${sdSlugDash}([/\\\\]|$)`, 'i');

    if (sdSlugRegex.test(importPath) || sdSlugDashRegex.test(importPath)) {
      return sd;
    }

    // Check SD title keywords (more conservative)
    // Only match words >5 chars AND not in common words list
    const titleWords = sd.title?.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 5 && !COMMON_WORDS.includes(w)) || [];

    for (const word of titleWords) {
      // Word must appear as complete path segment or filename part
      const wordRegex = new RegExp(`[/\\\\]${word}[/\\\\]|[/\\\\]${word}\\.|^${word}[/\\\\]`, 'i');
      if (wordRegex.test(importPath)) {
        return sd;
      }
    }
  }

  return null;
}

/**
 * Generate recommendations for dependency conflicts
 */
function generateDependencyRecommendations(conflicts) {
  return conflicts.map(conflict => ({
    action: conflict.risk === 'high'
      ? 'Create stub file or wait for SD completion'
      : 'Monitor dependency SD progress',
    sd: conflict.conflicting_sd,
    sd_title: conflict.conflicting_sd_title,
    current_progress: conflict.progress,
    priority: conflict.risk,
    details: conflict.progress < 50
      ? 'Dependency SD is <50% complete - high risk of incomplete implementation'
      : 'Dependency SD is >50% complete - medium risk'
  }));
}
