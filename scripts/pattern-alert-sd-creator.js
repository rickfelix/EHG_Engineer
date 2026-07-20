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
 * Created SDs take their priority from the pattern's actual severity
 * (derivePatternSdPriority) — NOT a blanket 'critical' (SD-REFILL-00TH22DQ).
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
// SD-FDBK-ENH-LEARN-AUTO-APPROVE-001 (FR-1): wire alert path through the same
// noise filter chain that scripts/modules/learning/context-builder.js uses, so
// /learn auto-approve and pattern-alert see identical suppression decisions.
import {
  filterPatternsForLearning,
  fetchAssignedSdStatuses,
  fetchPatternSourceSDStatuses,
} from './modules/learning/filter.mjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

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
  // SD-REFILL-00TH22DQ (priority inflation, belt-audit 2026-06-10): the created SD
  // priority is DERIVED from the pattern's actual severity (derivePatternSdPriority),
  // not hardcoded. Previously every filed SD was stamped 'critical' regardless of
  // whether it qualified via critical severity, high severity, or merely an increasing
  // trend on a low/medium-severity pattern — so 50/50 SD-PAT-FIX-* landed at 'critical'
  // (47 later cancelled). DEFAULT_SD_PRIORITY is only the fallback for an unknown severity.
  DEFAULT_SD_PRIORITY: 'medium',
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
 * Check if a pattern already has an associated SD.
 *
 * QF-20260611-851: cancelled SDs now COUNT as existing unless the pattern has
 * genuinely NEW occurrences after the cancellation. Pre-fix, `.neq('status',
 * 'cancelled')` made a cancelled SD-PAT-FIX draft invisible here, so the
 * generator re-created the same SD on its next cycle — a bulk triage cancelled
 * 14 drafts at 13:31Z 2026-06-11 and 10 regenerated within ~25 minutes.
 * Disposition semantics: pattern.updated_at <= SD cancellation time means no
 * new evidence since a human said no — skip and stamp
 * issue_patterns.metadata.disposition (auditable, implicit backfill). New
 * occurrences AFTER the cancellation re-escalate legitimately.
 *
 * @param {string} patternId
 * @param {object|null} pattern - the issue_patterns row (recency vs cancellation)
 */
export async function hasExistingSD(patternId, pattern = null) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, updated_at')
    .or(`title.ilike.%${patternId}%,description.ilike.%${patternId}%`)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(`  Error checking existing SD: ${error.message}`);
    return false;
  }

  const rows = data || [];
  const live = rows.find(r => r.status !== 'cancelled');
  if (live) return live;

  const cancelled = rows.find(r => r.status === 'cancelled');
  if (cancelled) {
    const cancelledAt = cancelled.updated_at ? new Date(cancelled.updated_at) : null;
    const lastActivity = pattern?.updated_at ? new Date(pattern.updated_at) : null;
    const hasNewOccurrences = cancelledAt && lastActivity && lastActivity > cancelledAt;
    if (!hasNewOccurrences) {
      // Stamp the disposition on the pattern (fail-soft: a stamp failure must
      // not break the alert cycle).
      try {
        await supabase
          .from('issue_patterns')
          .update({
            metadata: {
              ...(pattern?.metadata || {}),
              disposition: {
                kind: 'sd_cancelled_no_new_occurrences',
                cancelled_sd: cancelled.sd_key,
                cancelled_at: cancelled.updated_at,
                stamped_at: new Date().toISOString(),
                stamped_by: 'pattern-alert-sd-creator (QF-20260611-851)'
              }
            }
          })
          .eq('pattern_id', patternId);
      } catch { /* fail-soft */ }
      return { ...cancelled, disposition: 'cancelled_no_new_occurrences' };
    }
    console.log(`  Prior SD ${cancelled.sd_key} cancelled but pattern has NEW occurrences since — regeneration allowed`);
  }

  return null;
}

/**
 * Get patterns that exceed alert thresholds
 *
 * SD-FDBK-ENH-LEARN-AUTO-APPROVE-001 (FR-1): apply filterPatternsForLearning
 * BEFORE the severity/trend threshold so noise patterns matching the same
 * filters used by /learn auto-approve are suppressed in the alert path too.
 * Mirrors the wiring pattern at scripts/modules/learning/context-builder.js:443-471.
 */
async function getAlertablePatterns() {
  // Paginated — SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: issue_patterns
  // is unbounded-growth and status='active' does not bound it; every row below is
  // threshold-filtered and can trigger SD auto-creation.
  let patterns;
  try {
    patterns = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('*')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .order('id', { ascending: true }));
  } catch (error) {
    console.error(`Error fetching patterns: ${error.message}`);
    return [];
  }

  if (!patterns) return [];

  // FR-1: Suppress noise patterns before threshold check.
  let surviving = patterns;
  try {
    const [sdStatusMap, sourceSdStatusMap] = await Promise.all([
      fetchAssignedSdStatuses(supabase, patterns),
      fetchPatternSourceSDStatuses(supabase, patterns),
    ]);
    const result = filterPatternsForLearning(patterns, {
      sdStatusMap,
      sourceSdStatusMap,
    });
    surviving = result.kept;
    if (result.rejected.length > 0) {
      console.log(`  Noise filter: ${result.rejected.length} pattern(s) suppressed before threshold check`);
    }
  } catch (filterErr) {
    // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (5): FAIL-CLOSED. The fail-open posture
    // meant a single filter error filed EVERYTHING (one input to the 2026-06-12
    // 13-SD storm). An auto-SD-creating path must skip a cycle, not file unfiltered.
    console.error(`[noise-filter] FAIL-CLOSED: filter error — skipping this alert cycle: ${filterErr.message}`);
    return [];
  }

  // Filter patterns that meet threshold criteria
  return surviving.filter(p => {
    // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (d): incident-window discount.
    // Occurrence growth attributable to a flagged incident (e.g. one SD's
    // parallel-driver reconcile churn) is recorded on the pattern as
    // metadata.incident_discount (count) and must not push the pattern over
    // CRITICAL/HIGH/INCREASING thresholds.
    const effectiveCount = effectiveOccurrences(p);
    if (effectiveCount !== p.occurrence_count) {
      console.log(`  [incident-discount] ${p.pattern_id}: ${p.occurrence_count} raw -> ${effectiveCount} effective`);
    }

    // Critical severity with 5+ occurrences
    if (p.severity === 'critical' && effectiveCount >= CONFIG.CRITICAL_SEVERITY_THRESHOLD) {
      return true;
    }

    // High severity with 7+ occurrences
    if (p.severity === 'high' && effectiveCount >= CONFIG.HIGH_SEVERITY_THRESHOLD) {
      return true;
    }

    // Increasing trend with 4+ occurrences (regardless of severity)
    if (p.trend === 'increasing' && effectiveCount >= CONFIG.INCREASING_TREND_THRESHOLD) {
      return true;
    }

    return false;
  });
}

/**
 * SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (c): per-run storm cap. The 2026-06-12
 * storm filed 13 SDs in one 2-second burst. Cap auto-filing (default 3); the
 * remainder becomes a logged drop-list + loud signal so a genuine multi-class
 * outbreak gets human triage, not blanket-filed SDs. Pure — exported for tests.
 */
export function stormCapLimit(envValue) {
  const n = parseInt(envValue || '3', 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (d): effective occurrence count after the
 * incident-window discount (metadata.incident_discount). Pure — exported for tests.
 */
export function effectiveOccurrences(pattern) {
  const discount = Number(pattern?.metadata?.incident_discount || 0);
  return Math.max(0, (pattern?.occurrence_count || 0) - (Number.isFinite(discount) ? discount : 0));
}

/**
 * SD-REFILL-00TH22DQ — derive the created SD's priority from the pattern's actual
 * severity instead of stamping every auto-filed pattern SD 'critical' (the
 * priority-inflation belt-audit finding 2026-06-10). The three filing triggers
 * (critical severity, high severity, increasing trend on ANY severity) collapsed
 * to one priority before; an increasing-trend pattern at medium/low severity was
 * the worst inflater. Map severity → SD priority 1:1 over the validated enum
 * (critical|high|medium|low); an unknown/missing severity (trend-only qualifier)
 * falls back to DEFAULT_SD_PRIORITY ('medium' — recurring but not asserted urgent).
 * Pure — exported for tests.
 */
export function derivePatternSdPriority(pattern) {
  const sev = String(pattern?.severity || '').toLowerCase();
  if (sev === 'critical') return 'critical';
  if (sev === 'high') return 'high';
  if (sev === 'medium') return 'medium';
  if (sev === 'low') return 'low';
  return CONFIG.DEFAULT_SD_PRIORITY;
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
 * Build the full SD insert payload for a pattern — pure, no DB access.
 * SD-PAT-FIX-LEAD-PLAN-REJECTED-004 (FR-2): exported so tests can pin the
 * completeness contract (output passes LEAD-TO-PLAN validators untouched).
 */
export function buildSdDataForPattern(pattern, sdKey) {
  const suggestedTeam = CONFIG.CATEGORY_TEAMS[pattern.category] || 'engineering';
  const sdCategory = CONFIG.PATTERN_TO_SD_CATEGORY[pattern.category] || 'Technical Debt';

  // Build SD description with context
  const provenSolutionsSummary = pattern.proven_solutions?.length > 0
    ? pattern.proven_solutions.map(s => `- ${s.solution} (${s.success_rate || 0}% success)`).join('\n')
    : 'No proven solutions documented yet.';

  const preventionSummary = pattern.prevention_checklist?.length > 0
    ? pattern.prevention_checklist.map(p => `- [ ] ${p}`).join('\n')
    : 'No prevention checklist available.';

  // SD-PAT-FIX-LEAD-PLAN-REJECTED-004 (FR-2): single source for the acceptance
  // criteria — written into BOTH the description and success_criteria so the
  // created SD passes LEAD-TO-PLAN completeness without manual backfill.
  const acceptanceCriteria = [
    'Root cause identified and documented',
    'Permanent fix implemented',
    'Pattern occurrence count stabilizes or decreases',
    'Prevention checklist updated with new learnings',
    `Pattern marked as resolved: \`npm run pattern:resolve ${pattern.pattern_id} "Resolution notes"\``
  ];

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
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

### Suggested Team
${suggestedTeam}

---
*Auto-generated by pattern-alert-sd-creator.js*
*Pattern first seen: ${pattern.first_seen_sd_id || 'Unknown'}*
*Pattern last seen: ${pattern.last_seen_sd_id || 'Unknown'}*`,
    status: CONFIG.SD_STATUS,
    priority: derivePatternSdPriority(pattern),
    rationale: `This pattern has occurred ${pattern.occurrence_count} times with ${pattern.severity} severity. Recurring issues indicate a systemic problem requiring root cause resolution.`,
    scope: `Resolve the root cause of recurring pattern ${pattern.pattern_id} (category: ${pattern.category}). In scope: root-cause analysis of the recorded occurrences, a permanent fix, and prevention-checklist updates. Out of scope: unrelated refactors beyond the pattern's blast radius.`,
    // SD-PAT-FIX-LEAD-PLAN-REJECTED-004 (FR-2): emit a COMPLETE SD. Before
    // this, pattern SDs inserted 0 of the 8 completeness JSONB fields while
    // defaulting to sd_type=feature (8/8 bar) — mathematically guaranteeing a
    // JSONB_FIELDS_INCOMPLETE rejection at LEAD-TO-PLAN for every created SD.
    sd_type: 'bugfix', // root-cause defect work, not a feature (honest 4-field bar)
    // Patterns originate from LEO harness retrospectives/RCA — the fix lands
    // in EHG_Engineer tooling, not the EHG product app.
    target_application: 'EHG_Engineer',
    strategic_objectives: `Resolve the recurring "${pattern.issue_summary}" pattern (${pattern.pattern_id}: ${pattern.severity} severity, ${pattern.occurrence_count} occurrences, trend ${pattern.trend}) by identifying and permanently fixing its root cause, so the pattern stops recurring across SD lifecycles and the prevention checklist captures the learning.`,
    success_criteria: acceptanceCriteria.map(criterion => ({
      criterion,
      measure: 'Verified against the pattern record and its recorded occurrences'
    })),
    success_metrics: [
      { metric: `Pattern ${pattern.pattern_id} occurrence count`, baseline: String(pattern.occurrence_count), target: 'Stabilized or decreasing post-fix' },
      { metric: `Pattern ${pattern.pattern_id} status`, baseline: 'active', target: 'resolved' },
      { metric: 'Prevention checklist entries capturing this root cause', baseline: String(pattern.prevention_checklist?.length || 0), target: 'At least one new entry documenting the fix' }
    ],
    key_changes: [
      { change: `Implement a permanent fix for the root cause behind: ${pattern.issue_summary.substring(0, 160)}`, impact: `Eliminates recurrence of ${pattern.pattern_id} (${pattern.occurrence_count} occurrences to date)` }
    ],
    key_principles: [
      'Fix root cause, not symptoms',
      'Validate the fix against the original pattern occurrences',
      'Preserve existing behavior for passing cases'
    ],
    risks: [
      { risk: 'Fix may not cover all occurrence variants of the pattern', mitigation: 'Verify against the recorded occurrence list before marking the pattern resolved' }
    ],
    implementation_guidelines: pattern.prevention_checklist?.length > 0
      ? pattern.prevention_checklist.slice(0, 5)
      : ['Read the pattern occurrence records before modifying code', 'Add tests for the specific failure pattern'],
    dependencies: [],
    smoke_test_steps: [
      {
        instruction: `Reproduce the failure described in pattern ${pattern.pattern_id}, apply the fix, then re-run the originally failing scenario`,
        expected_outcome: 'The original failure no longer reproduces'
      },
      {
        instruction: `npm run pattern:resolve ${pattern.pattern_id} "<resolution notes>"`,
        expected_outcome: 'Pattern status transitions to resolved'
      }
    ],
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

  return sdData;
}

/**
 * Create Strategic Directive for pattern
 */
export async function createSDForPattern(pattern) {
  // Check for existing SD first
  const existingSD = await hasExistingSD(pattern.pattern_id, pattern);
  if (existingSD) {
    console.log(`  SD already exists: ${existingSD.sd_key} (${existingSD.status})`);
    return { skipped: true, existing: existingSD };
  }

  // SD-LEO-SDKEY-001: Pass full pattern for semantic key generation
  const sdKey = await generateSDKey(pattern);
  const sdData = buildSdDataForPattern(pattern, sdKey);

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

  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (a): stamp the closure-loop linkage at
  // creation time. Without assigned_sd_id + status='assigned', the cancel-side
  // machinery (trg_reset_patterns_on_sd_cancel, reconcile sweep, checkAssignedSd)
  // has zero rows to act on and the pattern re-files forever.
  try {
    const { error: linkErr } = await supabase
      .from('issue_patterns')
      .update({ assigned_sd_id: data.id, status: 'assigned', assignment_date: new Date().toISOString() })
      .eq('pattern_id', pattern.pattern_id);
    if (linkErr) console.warn(`  ⚠️  linkage stamp failed for ${pattern.pattern_id}: ${linkErr.message}`);
    else console.log(`  ✓ pattern ${pattern.pattern_id} linked (assigned_sd_id=${data.id})`);
  } catch (e) { console.warn(`  ⚠️  linkage stamp failed: ${e.message}`); }

  console.log(`  Created SD: ${data.sd_key}`);
  return { success: true, sd: data };
}

/**
 * Main alert check and SD creation
 */
export async function checkPatternsAndCreateSDs() {
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
    errors: 0,
    dropped: []
  };

  const MAX_SDS_PER_RUN = stormCapLimit(process.env.PATTERN_ALERT_MAX_SDS_PER_RUN);

  for (const pattern of patterns) {
    if (stats.created >= MAX_SDS_PER_RUN) {
      stats.dropped.push(pattern.pattern_id);
      continue;
    }
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

  if (stats.dropped.length > 0) {
    console.error(`\n🚨 STORM CAP HIT: ${stats.created} SD(s) filed (cap ${MAX_SDS_PER_RUN}); ${stats.dropped.length} alertable pattern(s) DROPPED this run: ${stats.dropped.join(', ')}`);
    // Durable loud signal: a feedback row the coordinator/inbox surfaces.
    try {
      await supabase.from('feedback').insert({
        type: 'issue',
        category: 'harness_backlog',
        priority: 'P1',
        status: 'new',
        title: `pattern-alert storm cap hit: ${stats.dropped.length} pattern(s) dropped`,
        description: `checkPatternsAndCreateSDs filed ${stats.created}/${MAX_SDS_PER_RUN} SDs and dropped ${stats.dropped.length} alertable patterns this run (SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 storm cap). Dropped pattern ids: ${stats.dropped.join(', ')}. Triage whether this is a genuine multi-class outbreak or threshold churn.`,
        source_type: 'pattern-alert-sd-creator',
        metadata: { dropped_pattern_ids: stats.dropped, cap: MAX_SDS_PER_RUN, created: stats.created }
      });
    } catch (e) { console.warn(`  ⚠️  storm-cap signal write failed: ${e.message}`); }
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

// Run only when invoked directly (not when imported by tests)
if (isMainModule(import.meta.url)) {
  checkPatternsAndCreateSDs()
    .then((stats) => {
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error(' Fatal error:', error);
      process.exit(1);
    });
}
