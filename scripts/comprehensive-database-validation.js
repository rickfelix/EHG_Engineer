#!/usr/bin/env node

/**
 * Comprehensive Database Validation Script
 *
 * Performs systematic validation of EHG_Engineer database to identify:
 * - Missing required fields
 * - Invalid status transitions
 * - Orphaned records
 * - Schema compliance issues
 * - Data quality problems
 *
 * Output: Categorized findings by severity with actionable fix paths
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Issue tracking
const issues = {
  CRITICAL: [],
  HIGH: [],
  MEDIUM: [],
  LOW: []
};

// Severity categories
const SEVERITY = {
  CRITICAL: 'CRITICAL',  // Blocks operations, data corruption risk
  HIGH: 'HIGH',          // Impacts functionality, inconsistent state
  MEDIUM: 'MEDIUM',      // Quality issues, best practice violations
  LOW: 'LOW'             // Minor inconsistencies, cosmetic
};

// Fix effort estimates
const EFFORT = {
  QUICK: '5min',         // Simple UPDATE/INSERT
  FAST: '15min',         // Multiple updates or script needed
  MODERATE: '30min',     // Complex updates or data investigation
  LONG: '1hr+'           // Requires analysis, migration, or bulk operations
};

function addIssue(severity, category, description, recordIds, effort, fixPath, impact = null) {
  issues[severity].push({
    category,
    description,
    recordIds: Array.isArray(recordIds) ? recordIds : [recordIds],
    recordCount: Array.isArray(recordIds) ? recordIds.length : 1,
    effort,
    fixPath,
    impact
  });
}

// ============================================================================
// VALIDATION 1: STRATEGIC DIRECTIVES
// ============================================================================

async function validateStrategicDirectives() {
  console.log('\n🔍 Validating strategic_directives_v2...');

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description, status, priority, current_phase, created_at, updated_at, complexity, user_story_count, metadata');

  if (error) {
    console.error('❌ Error fetching SDs:', error.message);
    return;
  }

  console.log(`   Found ${sds.length} Strategic Directives`);

  // Check 1: Missing required fields
  const missingTitle = sds.filter(sd => !sd.title || sd.title.trim() === '');
  if (missingTitle.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'SD: Missing Required Fields',
      'Strategic Directives without titles',
      missingTitle.map(sd => sd.id),
      EFFORT.FAST,
      'Update titles based on id or description',
      'Affects display, search, and user experience'
    );
  }

  const missingDescription = sds.filter(sd => !sd.description || sd.description.trim() === '');
  if (missingDescription.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'SD: Missing Required Fields',
      'Strategic Directives without descriptions',
      missingDescription.map(sd => sd.id),
      EFFORT.MODERATE,
      'Review SD intent and add descriptions',
      'Reduces clarity, harder to understand SD purpose'
    );
  }

  // Check 2: Invalid status values
  const validStatuses = ['draft', 'active', 'in_progress', 'on_hold', 'completed', 'archived', 'cancelled'];
  const invalidStatus = sds.filter(sd => sd.status && !validStatuses.includes(sd.status));
  if (invalidStatus.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'SD: Invalid Status',
      `SDs with invalid status values: ${[...new Set(invalidStatus.map(sd => sd.status))].join(', ')}`,
      invalidStatus.map(sd => sd.id),
      EFFORT.QUICK,
      'UPDATE strategic_directives_v2 SET status = \'draft\' WHERE status NOT IN (...)',
      'Breaks workflow logic, prevents phase transitions'
    );
  }

  // Check 3: Invalid priority values
  const validPriorities = ['critical', 'high', 'medium', 'low'];
  const invalidPriority = sds.filter(sd => sd.priority && !validPriorities.includes(sd.priority));
  if (invalidPriority.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'SD: Invalid Priority',
      `SDs with invalid priority values: ${[...new Set(invalidPriority.map(sd => sd.priority))].join(', ')}`,
      invalidPriority.map(sd => sd.id),
      EFFORT.QUICK,
      'UPDATE strategic_directives_v2 SET priority = \'medium\' WHERE priority NOT IN (...)',
      'Affects prioritization, backlog ordering'
    );
  }

  // Check 4: Status/Phase mismatch
  const statusPhaseMismatch = sds.filter(sd => {
    if (sd.status === 'completed' && sd.current_phase !== 'LEAD') return true;
    if ((sd.status === 'in_progress' || sd.status === 'active') && !sd.current_phase) return true;
    return false;
  });
  if (statusPhaseMismatch.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'SD: Status/Phase Mismatch',
      'SDs with inconsistent status and current_phase',
      statusPhaseMismatch.map(sd => sd.id),
      EFFORT.MODERATE,
      'Review each SD, align status with phase',
      'Causes confusion in dashboard, incorrect progress tracking'
    );
  }

  // Check 5: Timestamp anomalies
  const futureCreated = sds.filter(sd => new Date(sd.created_at) > new Date());
  if (futureCreated.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'SD: Future Created Date',
      'SDs with created_at in the future',
      futureCreated.map(sd => sd.id),
      EFFORT.QUICK,
      'UPDATE strategic_directives_v2 SET created_at = NOW() WHERE created_at > NOW()',
      'Breaks sorting, reporting, and analytics'
    );
  }

  const createdAfterUpdated = sds.filter(sd => {
    if (!sd.created_at || !sd.updated_at) return false;
    return new Date(sd.created_at) > new Date(sd.updated_at);
  });
  if (createdAfterUpdated.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'SD: Timestamp Logic Error',
      'SDs where created_at > updated_at',
      createdAfterUpdated.map(sd => sd.id),
      EFFORT.QUICK,
      'UPDATE strategic_directives_v2 SET updated_at = created_at WHERE created_at > updated_at',
      'Violates temporal logic, confusing in UI'
    );
  }

  // Check 6: Missing metadata fields
  const missingComplexity = sds.filter(sd => !sd.complexity && sd.status !== 'draft');
  if (missingComplexity.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'SD: Missing Metadata',
      'Non-draft SDs missing complexity assessment',
      missingComplexity.map(sd => sd.id),
      EFFORT.MODERATE,
      'Review each SD, assign complexity (simple/moderate/complex)',
      'Affects planning, resource allocation'
    );
  }

  console.log('   ✅ Strategic Directives validation complete');
}

// ============================================================================
// VALIDATION 2: PRODUCT REQUIREMENTS
// ============================================================================

async function validateProductRequirements() {
  console.log('\n🔍 Validating product_requirements_v2...');

  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, description, status, objectives, acceptance_criteria, created_at, updated_at');

  if (error) {
    console.error('❌ Error fetching PRDs:', error.message);
    return;
  }

  console.log(`   Found ${prds.length} Product Requirements`);

  // Check 1: Missing parent SD reference
  const orphanedPrds = prds.filter(prd => !prd.directive_id);
  if (orphanedPrds.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'PRD: Orphaned Records',
      'PRDs without parent Strategic Directive reference',
      orphanedPrds.map(prd => prd.id),
      EFFORT.MODERATE,
      'Investigate PRD history, link to correct SD or archive',
      'Breaks navigation, prevents proper lifecycle management'
    );
  }

  // Check 2: Missing required fields
  const missingTitle = prds.filter(prd => !prd.title || prd.title.trim() === '');
  if (missingTitle.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'PRD: Missing Required Fields',
      'PRDs without titles',
      missingTitle.map(prd => prd.id),
      EFFORT.FAST,
      'Generate titles from SD title + "_PRD" or description',
      'Affects display, navigation, user experience'
    );
  }

  // Check 3: Invalid status
  const validStatuses = ['draft', 'in_review', 'approved', 'active', 'completed', 'archived'];
  const invalidStatus = prds.filter(prd => prd.status && !validStatuses.includes(prd.status));
  if (invalidStatus.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'PRD: Invalid Status',
      `PRDs with invalid status values: ${[...new Set(invalidStatus.map(prd => prd.status))].join(', ')}`,
      invalidStatus.map(prd => prd.id),
      EFFORT.QUICK,
      'UPDATE product_requirements_v2 SET status = \'draft\' WHERE status NOT IN (...)',
      'Breaks workflow, prevents status transitions'
    );
  }

  // Check 4: Approved PRDs without user stories
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('prd_id');

  const prdIdsWithStories = new Set(userStories?.map(us => us.prd_id) || []);
  const approvedWithoutStories = prds.filter(prd =>
    prd.status === 'approved' && !prdIdsWithStories.has(prd.id)
  );

  if (approvedWithoutStories.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'PRD: Approved Without User Stories',
      'PRDs in APPROVED status but no user stories created',
      approvedWithoutStories.map(prd => prd.id),
      EFFORT.LONG,
      'Generate user stories via stories sub-agent or revert to in_review',
      'Cannot implement without user stories, violates workflow'
    );
  }

  // Check 5: Missing objectives
  const missingObjectives = prds.filter(prd =>
    prd.status !== 'draft' && (!prd.objectives || (Array.isArray(prd.objectives) && prd.objectives.length === 0))
  );
  if (missingObjectives.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'PRD: Missing Objectives',
      'Non-draft PRDs without objectives defined',
      missingObjectives.map(prd => prd.id),
      EFFORT.MODERATE,
      'Review PRD, define objectives from SD goals',
      'Reduces clarity, harder to measure success'
    );
  }

  // Check 6: Missing acceptance criteria
  const missingAcceptance = prds.filter(prd =>
    prd.status === 'approved' && (!prd.acceptance_criteria || (Array.isArray(prd.acceptance_criteria) && prd.acceptance_criteria.length === 0))
  );
  if (missingAcceptance.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'PRD: Missing Acceptance Criteria',
      'Approved PRDs without acceptance criteria',
      missingAcceptance.map(prd => prd.id),
      EFFORT.MODERATE,
      'Define acceptance criteria from objectives and user stories',
      'Cannot verify completion, unclear definition of done'
    );
  }

  console.log('   ✅ Product Requirements validation complete');
}

// ============================================================================
// VALIDATION 3: HANDOFFS
// ============================================================================

async function validateHandoffs() {
  console.log('\n🔍 Validating sd_phase_handoffs...');

  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type, from_phase, to_phase, executive_summary, blockers, context_health, created_at');

  if (error) {
    console.error('❌ Error fetching handoffs:', error.message);
    return;
  }

  console.log(`   Found ${handoffs.length} Phase Handoffs`);

  // Check 1: Orphaned handoffs
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id');
  const sdIds = new Set(sds?.map(sd => sd.id) || []);

  const orphanedHandoffs = handoffs.filter(h => !sdIds.has(h.sd_id));
  if (orphanedHandoffs.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'Handoff: Orphaned Records',
      'Handoffs referencing deleted/missing SDs',
      orphanedHandoffs.map(h => h.id),
      EFFORT.QUICK,
      'DELETE FROM sd_phase_handoffs WHERE sd_id NOT IN (SELECT id FROM strategic_directives_v2)',
      'Clutters database, no functional impact'
    );
  }

  // Check 2: Missing required sections
  const missingSummary = handoffs.filter(h => !h.executive_summary || h.executive_summary.trim() === '');
  if (missingSummary.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'Handoff: Incomplete Documentation',
      'Handoffs without executive_summary',
      missingSummary.map(h => `${h.handoff_type} (SD: ${h.sd_id})`),
      EFFORT.LONG,
      'Review handoff context, generate summaries from work done',
      'Reduces knowledge transfer, harder to understand phase outcomes'
    );
  }

  // Check 3: Missing context health reporting
  const missingContextHealth = handoffs.filter(h => !h.context_health);
  if (missingContextHealth.length > 0) {
    addIssue(
      SEVERITY.LOW,
      'Handoff: Missing Context Health',
      'Handoffs without context health reporting',
      missingContextHealth.map(h => `${h.handoff_type} (SD: ${h.sd_id})`),
      EFFORT.FAST,
      'Estimate context usage retroactively or set to UNKNOWN',
      'Minor: cannot track context usage trends'
    );
  }

  // Check 4: Invalid handoff types
  const validTypes = ['lead_to_plan', 'plan_to_exec', 'exec_to_plan', 'plan_to_lead', 'exec_to_lead'];
  const invalidType = handoffs.filter(h => h.handoff_type && !validTypes.includes(h.handoff_type));
  if (invalidType.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'Handoff: Invalid Type',
      `Handoffs with invalid handoff_type: ${[...new Set(invalidType.map(h => h.handoff_type))].join(', ')}`,
      invalidType.map(h => h.id),
      EFFORT.FAST,
      'Normalize handoff_type to valid values',
      'Breaks workflow tracking, prevents phase transition queries'
    );
  }

  console.log('   ✅ Phase Handoffs validation complete');
}

// ============================================================================
// VALIDATION 4: USER STORIES
// ============================================================================

async function validateUserStories() {
  console.log('\n🔍 Validating user_stories...');

  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('id, story_key, prd_id, title, description, acceptance_criteria, status, test_coverage_data, created_at');

  if (error) {
    console.error('❌ Error fetching user stories:', error.message);
    return;
  }

  console.log(`   Found ${stories.length} User Stories`);

  // Check 1: Orphaned stories
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id, status');
  const prdIds = new Set(prds?.map(prd => prd.id) || []);

  const orphanedStories = stories.filter(s => !prdIds.has(s.prd_id));
  if (orphanedStories.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'User Story: Orphaned Records',
      'User stories referencing deleted/missing PRDs',
      orphanedStories.map(s => s.story_key || s.id),
      EFFORT.MODERATE,
      'Archive orphaned stories or reassign to correct PRD',
      'Cannot track implementation, breaks story lifecycle'
    );
  }

  // Check 2: Missing acceptance criteria
  const missingAcceptance = stories.filter(s =>
    !s.acceptance_criteria || (Array.isArray(s.acceptance_criteria) && s.acceptance_criteria.length === 0)
  );
  if (missingAcceptance.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'User Story: Missing Acceptance Criteria',
      'User stories without acceptance criteria',
      missingAcceptance.map(s => s.story_key || s.id),
      EFFORT.MODERATE,
      'Define acceptance criteria from story description and PRD',
      'Cannot verify completion, unclear definition of done'
    );
  }

  // Check 3: Implemented without test coverage
  const implementedWithoutTests = stories.filter(s =>
    s.status === 'implemented' && (!s.test_coverage_data || Object.keys(s.test_coverage_data).length === 0)
  );
  if (implementedWithoutTests.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'User Story: Missing Test Coverage',
      'Stories marked IMPLEMENTED without test coverage data',
      implementedWithoutTests.map(s => s.story_key || s.id),
      EFFORT.LONG,
      'Create E2E tests or revert status to in_progress',
      'Violates testing-first mandate, no verification of implementation'
    );
  }

  // Check 4: Invalid status
  const validStatuses = ['draft', 'ready', 'in_progress', 'implemented', 'verified', 'archived'];
  const invalidStatus = stories.filter(s => s.status && !validStatuses.includes(s.status));
  if (invalidStatus.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'User Story: Invalid Status',
      `Stories with invalid status: ${[...new Set(invalidStatus.map(s => s.status))].join(', ')}`,
      invalidStatus.map(s => s.story_key || s.id),
      EFFORT.QUICK,
      'UPDATE user_stories SET status = \'draft\' WHERE status NOT IN (...)',
      'Breaks workflow, prevents status queries'
    );
  }

  console.log('   ✅ User Stories validation complete');
}

// ============================================================================
// VALIDATION 5: SCHEMA COMPLIANCE
// ============================================================================

async function validateSchemaCompliance() {
  console.log('\n🔍 Validating schema compliance...');

  // Check 1: Foreign key constraint violations (simulated - Supabase enforces at DB level)
  // This would catch logical orphans not caught by DB constraints

  // Check 2: Duplicate IDs (should not happen with primary keys, but check for legacy columns)
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id');

  const idCounts = {};
  sds?.forEach(sd => {
    if (sd.id) {
      idCounts[sd.id] = (idCounts[sd.id] || 0) + 1;
    }
  });

  const duplicateIds = Object.entries(idCounts)
    .filter(([_, count]) => count > 1)
    .map(([id, count]) => `${id} (${count} occurrences)`);

  if (duplicateIds.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'Schema: Duplicate IDs',
      'Multiple SDs with same id',
      duplicateIds,
      EFFORT.MODERATE,
      'Investigate duplicates - this should not be possible with primary keys',
      'Breaks uniqueness assumption, database integrity issue'
    );
  }

  // Check 3: Duplicate PRD IDs
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id');

  const prdIdCounts = {};
  prds?.forEach(prd => {
    if (prd.id) {
      prdIdCounts[prd.id] = (prdIdCounts[prd.id] || 0) + 1;
    }
  });

  const duplicatePrdIds = Object.entries(prdIdCounts)
    .filter(([_, count]) => count > 1)
    .map(([id, count]) => `${id} (${count} occurrences)`);

  if (duplicatePrdIds.length > 0) {
    addIssue(
      SEVERITY.CRITICAL,
      'Schema: Duplicate PRD IDs',
      'Multiple PRDs with same id',
      duplicatePrdIds,
      EFFORT.MODERATE,
      'Investigate duplicates - this should not be possible with primary keys',
      'Breaks uniqueness assumption, database integrity issue'
    );
  }

  console.log('   ✅ Schema compliance validation complete');
}

// ============================================================================
// VALIDATION 6: DATA QUALITY
// ============================================================================

async function validateDataQuality() {
  console.log('\n🔍 Validating data quality...');

  // Check 1: Placeholder text detection
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description');

  const placeholderPatterns = [
    /TODO/i,
    /PLACEHOLDER/i,
    /TBD/i,
    /FIXME/i,
    /XXX/,
    /\[INSERT.*\]/i,
    /Lorem ipsum/i
  ];

  const placeholderSds = sds?.filter(sd => {
    const text = `${sd.title || ''} ${sd.description || ''}`;
    return placeholderPatterns.some(pattern => pattern.test(text));
  });

  if (placeholderSds && placeholderSds.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'Data Quality: Placeholder Text',
      'SDs with placeholder/TODO text in title or description',
      placeholderSds.map(sd => sd.id),
      EFFORT.MODERATE,
      'Review and replace with actual content',
      'Looks unprofessional, indicates incomplete work'
    );
  }

  // Check 2: Records stuck in transitional states
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: stuckSds } = await supabase
    .from('strategic_directives_v2')
    .select('id, status, updated_at')
    .in('status', ['in_progress', 'active'])
    .lt('updated_at', thirtyDaysAgo.toISOString());

  if (stuckSds && stuckSds.length > 0) {
    addIssue(
      SEVERITY.MEDIUM,
      'Data Quality: Stale Records',
      'SDs in transitional state (active/in_progress) for >30 days',
      stuckSds.map(sd => sd.id),
      EFFORT.MODERATE,
      'Review status, complete work or move to on_hold/archived',
      'Indicates stalled work, clutters active backlog'
    );
  }

  // Check 3: Empty JSONB fields that should have data
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id, status, objectives, acceptance_criteria')
    .eq('status', 'approved');

  const emptyObjectives = prds?.filter(prd =>
    !prd.objectives ||
    (typeof prd.objectives === 'object' && Object.keys(prd.objectives).length === 0) ||
    (Array.isArray(prd.objectives) && prd.objectives.length === 0)
  );

  if (emptyObjectives && emptyObjectives.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'Data Quality: Empty Required Fields',
      'Approved PRDs with empty objectives',
      emptyObjectives.map(prd => prd.id),
      EFFORT.MODERATE,
      'Define objectives from SD goals and PRD content',
      'Cannot measure success, unclear purpose'
    );
  }

  console.log('   ✅ Data quality validation complete');
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport() {
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('                 DATABASE VALIDATION REPORT');
  console.log('═'.repeat(80));
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Database: ${SUPABASE_URL}`);
  console.log('═'.repeat(80));

  const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);

  if (totalIssues === 0) {
    console.log('\n✅ No issues found! Database is in excellent health.\n');
    return;
  }

  // Calculate data health score (0-100)
  const criticalWeight = 10;
  const highWeight = 5;
  const mediumWeight = 2;
  const lowWeight = 1;

  const maxPenalty = 100;
  const penalty = Math.min(
    issues.CRITICAL.length * criticalWeight +
    issues.HIGH.length * highWeight +
    issues.MEDIUM.length * mediumWeight +
    issues.LOW.length * lowWeight,
    maxPenalty
  );

  const healthScore = Math.max(0, 100 - penalty);

  console.log(`\n📊 OVERALL DATA HEALTH SCORE: ${healthScore}/100`);

  if (healthScore >= 90) {
    console.log('   Status: EXCELLENT ✅');
  } else if (healthScore >= 75) {
    console.log('   Status: GOOD ⚠️ (Minor issues to address)');
  } else if (healthScore >= 50) {
    console.log('   Status: FAIR ⚠️ (Needs attention)');
  } else {
    console.log('   Status: POOR ❌ (Immediate action required)');
  }

  console.log('\n📋 ISSUE SUMMARY:');
  console.log(`   🔴 CRITICAL: ${issues.CRITICAL.length}`);
  console.log(`   🟠 HIGH:     ${issues.HIGH.length}`);
  console.log(`   🟡 MEDIUM:   ${issues.MEDIUM.length}`);
  console.log(`   🟢 LOW:      ${issues.LOW.length}`);
  console.log('   ━━━━━━━━━━━━━━━━━━━━');
  console.log(`   📊 TOTAL:    ${totalIssues}`);

  // Quick wins identification
  const quickWins = [];
  Object.entries(issues).forEach(([severity, issueList]) => {
    issueList.forEach(issue => {
      if (issue.effort === EFFORT.QUICK && (severity === SEVERITY.CRITICAL || severity === SEVERITY.HIGH)) {
        quickWins.push({ severity, ...issue });
      }
    });
  });

  if (quickWins.length > 0) {
    console.log(`\n⚡ QUICK WINS (High-impact, 5-min fixes): ${quickWins.length}`);
  }

  // Detailed findings by severity
  ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
    if (issues[severity].length === 0) return;

    console.log('\n' + '─'.repeat(80));
    console.log(`${severity} ISSUES (${issues[severity].length})`);
    console.log('─'.repeat(80));

    issues[severity].forEach((issue, index) => {
      console.log(`\n${index + 1}. ${issue.category}`);
      console.log(`   Description: ${issue.description}`);
      console.log(`   Affected Records: ${issue.recordCount}`);
      console.log(`   Fix Effort: ${issue.effort}`);
      console.log(`   Fix Path: ${issue.fixPath}`);
      if (issue.impact) {
        console.log(`   Impact: ${issue.impact}`);
      }

      if (issue.recordCount <= 5) {
        console.log(`   Record IDs: ${issue.recordIds.join(', ')}`);
      } else {
        console.log(`   Sample IDs: ${issue.recordIds.slice(0, 5).join(', ')}...`);
      }
    });
  });

  // Batch fix recommendations
  console.log('\n' + '═'.repeat(80));
  console.log('BATCH FIX RECOMMENDATIONS');
  console.log('═'.repeat(80));

  const groupedByEffort = {};
  Object.entries(issues).forEach(([severity, issueList]) => {
    issueList.forEach(issue => {
      if (!groupedByEffort[issue.effort]) {
        groupedByEffort[issue.effort] = [];
      }
      groupedByEffort[issue.effort].push({ severity, ...issue });
    });
  });

  [EFFORT.QUICK, EFFORT.FAST, EFFORT.MODERATE, EFFORT.LONG].forEach(effort => {
    if (!groupedByEffort[effort] || groupedByEffort[effort].length === 0) return;

    console.log(`\n${effort} FIXES (${groupedByEffort[effort].length} issues):`);
    groupedByEffort[effort].forEach(issue => {
      console.log(`   • [${issue.severity}] ${issue.category}: ${issue.recordCount} records`);
    });
  });

  console.log('\n' + '═'.repeat(80));
  console.log('END OF REPORT');
  console.log('═'.repeat(80));
  console.log('\nNext Steps:');
  console.log('1. Address CRITICAL issues immediately');
  console.log('2. Tackle Quick Wins (high-impact, low-effort)');
  console.log('3. Schedule HIGH priority fixes');
  console.log('4. Batch similar fixes for efficiency');
  console.log('5. Document patterns to prevent recurrence\n');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🔍 Starting comprehensive database validation...');
  console.log(`📊 Target: ${SUPABASE_URL}`);

  try {
    await validateStrategicDirectives();
    await validateProductRequirements();
    await validateHandoffs();
    await validateUserStories();
    await validateSchemaCompliance();
    await validateDataQuality();

    generateReport();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Validation failed with error:', error);
    process.exit(1);
  }
}

main();
