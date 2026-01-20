#!/usr/bin/env node
/**
 * PATTERN ALERT SD CREATOR
 * LEO Protocol v4.3.2 Enhancement
 *
 * Monitors issue_patterns for critical thresholds and auto-creates
 * Strategic Directives to address root causes.
 *
 * Threshold for auto-SD creation:
 * - Occurrence count >= 5 AND severity = 'critical'
 * - Occurrence count >= 7 AND severity = 'high'
 * - Trend = 'increasing' AND occurrence count >= 4
 *
 * Created SDs are always CRITICAL priority to ensure immediate attention.
 *
 * Usage:
 *   node scripts/pattern-alert-sd-creator.js [--dry-run] [--threshold=N]
 *
 * Integrates with: pattern-maintenance.js, generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
// SD-LEO-SDKEY-001: Centralized SD key generation
import { generateSDKey as generateCentralizedSDKey } from './modules/sd-key-generator.js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');
const CUSTOM_THRESHOLD = parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0');

/**
 * Configuration for auto-SD creation
 */
const CONFIG = {
  // Thresholds for auto-SD creation
  CRITICAL_SEVERITY_THRESHOLD: CUSTOM_THRESHOLD || 5,
  HIGH_SEVERITY_THRESHOLD: CUSTOM_THRESHOLD || 7,
  INCREASING_TREND_THRESHOLD: CUSTOM_THRESHOLD || 4,

  // SD metadata
  SD_PREFIX: 'SD-PAT-FIX',
  SD_PRIORITY: 'critical', // Always critical to ensure immediate attention
  SD_STATUS: 'draft', // Start as draft for review before approval

  // Category to team mapping for assignment suggestions
  CATEGORY_TEAMS: {
    database: 'database-team',
    security: 'security-team',
    testing: 'qa-team',
    deployment: 'devops-team',
    build: 'devops-team',
    performance: 'platform-team',
    protocol: 'leo-maintainers'
  },

  // Pattern category to SD category mapping
  PATTERN_TO_SD_CATEGORY: {
    database: 'Technical Debt',
    security: 'security',
    testing: 'quality_assurance',
    deployment: 'infrastructure',
    build: 'Technical Debt',
    performance: 'Performance',
    protocol: 'Process Improvement',
    code_structure: 'Code Quality',
    code_quality: 'Code Quality',
    general: 'Technical Debt',
    implementation: 'Technical Debt',
    process: 'Process Improvement',
    query: 'Technical Debt'
  }
};

/**
 * Check if a pattern already has an associated SD
 */
async function hasExistingSD(patternId) {
  // Check for existing SD with pattern ID in title or description
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .or(`title.ilike.%${patternId}%,description.ilike.%${patternId}%`)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .limit(1);

  if (error) {
    console.error(`  Error checking existing SD: ${error.message}`);
    return false;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Get patterns that exceed alert thresholds
 */
async function getAlertablePatterns() {
  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('*')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false });

  if (error) {
    console.error(`Error fetching patterns: ${error.message}`);
    return [];
  }

  if (!patterns) return [];

  // Filter patterns that meet threshold criteria
  return patterns.filter(p => {
    // Critical severity with 5+ occurrences
    if (p.severity === 'critical' && p.occurrence_count >= CONFIG.CRITICAL_SEVERITY_THRESHOLD) {
      return true;
    }

    // High severity with 7+ occurrences
    if (p.severity === 'high' && p.occurrence_count >= CONFIG.HIGH_SEVERITY_THRESHOLD) {
      return true;
    }

    // Increasing trend with 4+ occurrences (regardless of severity)
    if (p.trend === 'increasing' && p.occurrence_count >= CONFIG.INCREASING_TREND_THRESHOLD) {
      return true;
    }

    return false;
  });
}

/**
 * Generate SD key
 * SD-LEO-SDKEY-001: Uses centralized SDKeyGenerator for consistent naming
 */
async function generateSDKey(pattern) {
  // Use centralized SDKeyGenerator for consistent naming across all SD sources
  return generateCentralizedSDKey({
    source: 'PATTERN',
    type: 'bugfix', // Patterns are always bugfix type
    title: pattern.issue_summary || `Pattern ${pattern.pattern_id}`
  });
}

/**
 * Create Strategic Directive for pattern
 */
async function createSDForPattern(pattern) {
  // Check for existing SD first
  const existingSD = await hasExistingSD(pattern.pattern_id);
  if (existingSD) {
    console.log(`  SD already exists: ${existingSD.sd_key} (${existingSD.status})`);
    return { skipped: true, existing: existingSD };
  }

  // SD-LEO-SDKEY-001: Pass full pattern for semantic key generation
  const sdKey = await generateSDKey(pattern);
  const suggestedTeam = CONFIG.CATEGORY_TEAMS[pattern.category] || 'engineering';
  const sdCategory = CONFIG.PATTERN_TO_SD_CATEGORY[pattern.category] || 'Technical Debt';

  // Build SD description with context
  const provenSolutionsSummary = pattern.proven_solutions?.length > 0
    ? pattern.proven_solutions.map(s => `- ${s.solution} (${s.success_rate || 0}% success)`).join('\n')
    : 'No proven solutions documented yet.';

  const preventionSummary = pattern.prevention_checklist?.length > 0
    ? pattern.prevention_checklist.map(p => `- [ ] ${p}`).join('\n')
    : 'No prevention checklist available.';

  const sdData = {
    id: uuidv4(),
    sd_key: sdKey,
    title: `[${pattern.pattern_id}] Resolve Root Cause: ${pattern.issue_summary.substring(0, 100)}`,
    category: sdCategory,
    description: `## Auto-Generated from Issue Pattern

**Pattern ID:** ${pattern.pattern_id}
**Category:** ${pattern.category}
**Severity:** ${pattern.severity}
**Occurrences:** ${pattern.occurrence_count}
**Trend:** ${pattern.trend}

### Issue Summary
${pattern.issue_summary}

### Why This SD Was Created
This pattern has exceeded the alert threshold:
- ${pattern.severity} severity with ${pattern.occurrence_count} occurrences
- Trend: ${pattern.trend}

Recurring issues indicate a systemic problem that needs root cause resolution.

### Proven Solutions to Date
${provenSolutionsSummary}

### Prevention Checklist
${preventionSummary}

### Acceptance Criteria
1. Root cause identified and documented
2. Permanent fix implemented
3. Pattern occurrence count stabilizes or decreases
4. Prevention checklist updated with new learnings
5. Pattern marked as resolved: \`npm run pattern:resolve ${pattern.pattern_id} "Resolution notes"\`

### Suggested Team
${suggestedTeam}

---
*Auto-generated by pattern-alert-sd-creator.js*
*Pattern first seen: ${pattern.first_seen_sd_id || 'Unknown'}*
*Pattern last seen: ${pattern.last_seen_sd_id || 'Unknown'}*`,
    status: CONFIG.SD_STATUS,
    priority: CONFIG.SD_PRIORITY,
    rationale: `This pattern has occurred ${pattern.occurrence_count} times with ${pattern.severity} severity. Recurring issues indicate a systemic problem requiring root cause resolution.`,
    scope: `Pattern Category: ${pattern.category}`,
    created_at: new Date().toISOString(),
    metadata: {
      source: 'pattern-alert-sd-creator',
      pattern_id: pattern.pattern_id,
      pattern_category: pattern.category,
      pattern_severity: pattern.severity,
      pattern_occurrences: pattern.occurrence_count,
      auto_generated: true
    }
  };

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create SD: ${sdKey}`);
    console.log(`    Title: ${sdData.title.substring(0, 60)}...`);
    console.log(`    Priority: ${sdData.priority}`);
    return { dryRun: true, sdKey };
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sdData])
    .select()
    .single();

  if (error) {
    console.error(`  Error creating SD: ${error.message}`);
    return { error };
  }

  console.log(`  Created SD: ${data.sd_key}`);
  return { success: true, sd: data };
}

/**
 * Main alert check and SD creation
 */
async function checkPatternsAndCreateSDs() {
  console.log('\n PATTERN ALERT SD CREATOR');
  console.log('═'.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Thresholds:');
  console.log(`   Critical severity: ${CONFIG.CRITICAL_SEVERITY_THRESHOLD}+ occurrences`);
  console.log(`   High severity: ${CONFIG.HIGH_SEVERITY_THRESHOLD}+ occurrences`);
  console.log(`   Increasing trend: ${CONFIG.INCREASING_TREND_THRESHOLD}+ occurrences`);

  // Get alertable patterns
  const patterns = await getAlertablePatterns();

  if (patterns.length === 0) {
    console.log('\n No patterns exceed alert thresholds');
    return { created: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n Found ${patterns.length} patterns exceeding thresholds\n`);

  const stats = {
    created: 0,
    skipped: 0,
    errors: 0
  };

  for (const pattern of patterns) {
    console.log(`\n${pattern.pattern_id} (${pattern.category}/${pattern.severity})`);
    console.log(`   Occurrences: ${pattern.occurrence_count}, Trend: ${pattern.trend}`);
    console.log(`   "${pattern.issue_summary.substring(0, 50)}..."`);

    const result = await createSDForPattern(pattern);

    if (result.success) {
      stats.created++;
    } else if (result.skipped || result.dryRun) {
      stats.skipped++;
    } else if (result.error) {
      stats.errors++;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(' ALERT SUMMARY');
  console.log('─'.repeat(60));
  console.log(`   Patterns checked: ${patterns.length}`);
  console.log(`   SDs created: ${stats.created}`);
  console.log(`   Skipped (existing SD): ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors}`);

  if (DRY_RUN) {
    console.log('\n This was a DRY RUN - no SDs were created');
    console.log('   Run without --dry-run to create SDs');
  } else if (stats.created > 0) {
    console.log('\n Next steps:');
    console.log('   1. Review created SDs in database');
    console.log('   2. Move to lead_review when ready');
    console.log('   3. Assign to appropriate team');
  }

  return stats;
}

// Run
checkPatternsAndCreateSDs()
  .then((stats) => {
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(' Fatal error:', error);
    process.exit(1);
  });
