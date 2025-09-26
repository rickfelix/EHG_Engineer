#!/usr/bin/env node

/**
 * Progress Mismatch Detector
 * Identifies SDs where database status and calculated progress don't align
 * Acts as quality gate to catch missing steps (testing, docs, UI quality)
 */

const { createClient } = require('@supabase/supabase-js');
const ProgressCalculator = require('../src/services/progress-calculator').default;
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

class ProgressMismatchDetector {
  constructor() {
    this.progressCalculator = new ProgressCalculator();
    this.mismatches = [];
  }

  async detectAndReport() {
    console.log('🔍 Starting Progress Mismatch Detection...\n');

    // Get all active SDs
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .in('status', ['active', 'in_progress', 'completed'])
      .order('priority', { ascending: false });

    if (sdError) {
      console.error('Error fetching SDs:', sdError);
      return [];
    }

    // Get all PRDs
    const { data: prds, error: prdError } = await supabase
      .from('prds')
      .select('*');

    if (prdError) {
      console.error('Error fetching PRDs:', prdError);
      return [];
    }

    // Create PRD map
    const prdMap = {};
    prds?.forEach(prd => {
      prdMap[prd.directive_id] = prd;
    });

    // Check each SD for mismatches
    for (const sd of sds) {
      const prd = prdMap[sd.id];
      const calculated = this.progressCalculator.calculateSDProgress(sd, prd);

      // Detect various types of mismatches
      const mismatch = this.detectMismatch(sd, calculated);
      if (mismatch) {
        this.mismatches.push(mismatch);
        await this.flagMismatch(sd.id, mismatch);
      }
    }

    return this.mismatches;
  }

  detectMismatch(sd, calculated) {
    const mismatch = {
      sd_id: sd.id,
      title: sd.title,
      db_status: sd.status,
      db_progress: sd.progress || 0,
      calculated_progress: calculated.total,
      missing_items: [],
      severity: 'low'
    };

    // Case 1: Marked complete but calculator shows < 100%
    if (sd.status === 'completed' && calculated.total < 100) {
      mismatch.type = 'incomplete_marked_complete';
      mismatch.severity = 'high';
      mismatch.missing_items = this.identifyMissingItems(calculated);
      return mismatch;
    }

    // Case 2: Calculator shows 100% but not marked complete
    if (calculated.total === 100 && sd.status === 'active') {
      mismatch.type = 'complete_marked_active';
      mismatch.severity = 'medium';
      mismatch.recommendation = 'Consider marking this SD as completed';
      return mismatch;
    }

    // Case 3: Large discrepancy between stored and calculated
    const discrepancy = Math.abs((sd.progress || 0) - calculated.total);
    if (discrepancy > 20) {
      mismatch.type = 'large_discrepancy';
      mismatch.severity = discrepancy > 50 ? 'high' : 'medium';
      mismatch.discrepancy = discrepancy;
      mismatch.missing_items = this.identifyMissingItems(calculated);
      return mismatch;
    }

    // No significant mismatch
    return null;
  }

  identifyMissingItems(calculated) {
    const missing = [];

    // Check each phase for incomplete items
    if (calculated.phases.LEAD_PLANNING < 100) {
      missing.push({
        phase: 'LEAD Planning',
        percentage: calculated.phases.LEAD_PLANNING,
        reason: 'Strategic directive not fully defined',
        details: calculated.details.leadPlanning
      });
    }

    if (calculated.phases.PLAN_DESIGN < 100) {
      missing.push({
        phase: 'PLAN Design',
        percentage: calculated.phases.PLAN_DESIGN,
        reason: 'PRD planning checklist incomplete',
        items_missing: this.getMissingChecklistItems(calculated.details.planDesign)
      });
    }

    if (calculated.phases.EXEC_IMPLEMENTATION < 100) {
      missing.push({
        phase: 'EXEC Implementation',
        percentage: calculated.phases.EXEC_IMPLEMENTATION,
        reason: 'Implementation checklist incomplete',
        items_missing: this.getMissingChecklistItems(calculated.details.execImplementation)
      });
    }

    if (calculated.phases.PLAN_VERIFICATION < 100) {
      missing.push({
        phase: 'Testing & Verification',
        percentage: calculated.phases.PLAN_VERIFICATION,
        reason: 'Validation checklist incomplete - testing may be missing',
        critical: true,
        action_required: 'Complete testing and validation'
      });
    }

    if (calculated.phases.LEAD_APPROVAL < 100) {
      missing.push({
        phase: 'LEAD Approval',
        percentage: calculated.phases.LEAD_APPROVAL,
        reason: 'Final approval not obtained',
        action_required: 'Request LEAD approval'
      });
    }

    return missing;
  }

  getMissingChecklistItems(details) {
    if (!details) return [];
    const total = details.totalItems || 0;
    const completed = details.completedItems || 0;
    return {
      completed: completed,
      total: total,
      remaining: total - completed
    };
  }

  async flagMismatch(sdId, mismatch) {
    const report = {
      detected_at: new Date().toISOString(),
      type: mismatch.type,
      severity: mismatch.severity,
      db_progress: mismatch.db_progress,
      calculated_progress: mismatch.calculated_progress,
      discrepancy: Math.abs(mismatch.db_progress - mismatch.calculated_progress),
      missing_items: mismatch.missing_items,
      requires_review: mismatch.severity === 'high'
    };

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        reconciliation_status: 'mismatch_detected',
        reconciliation_report: report,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId);

    if (error) {
      console.error(`Failed to flag mismatch for ${sdId}:`, error);
    }
  }

  generateReport() {
    if (this.mismatches.length === 0) {
      console.log('✅ No progress mismatches detected!\n');
      return;
    }

    console.log(`\n⚠️  Found ${this.mismatches.length} Progress Mismatches:\n`);
    console.log('=' .repeat(80));

    // Group by severity
    const bySeverity = {
      high: this.mismatches.filter(m => m.severity === 'high'),
      medium: this.mismatches.filter(m => m.severity === 'medium'),
      low: this.mismatches.filter(m => m.severity === 'low')
    };

    // Report high severity first
    if (bySeverity.high.length > 0) {
      console.log('\n🔴 HIGH SEVERITY (Action Required):');
      bySeverity.high.forEach(m => this.reportMismatch(m));
    }

    if (bySeverity.medium.length > 0) {
      console.log('\n🟡 MEDIUM SEVERITY:');
      bySeverity.medium.forEach(m => this.reportMismatch(m));
    }

    if (bySeverity.low.length > 0) {
      console.log('\n🟢 LOW SEVERITY:');
      bySeverity.low.forEach(m => this.reportMismatch(m));
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   High Severity: ${bySeverity.high.length}`);
    console.log(`   Medium Severity: ${bySeverity.medium.length}`);
    console.log(`   Low Severity: ${bySeverity.low.length}`);
    console.log('\nRun "node scripts/auto-remediate-progress.js" to fix these issues automatically.');
  }

  reportMismatch(mismatch) {
    console.log(`\n   📋 ${mismatch.title}`);
    console.log(`      ID: ${mismatch.sd_id}`);
    console.log(`      Type: ${mismatch.type}`);
    console.log(`      Database: ${mismatch.db_status} (${mismatch.db_progress}%)`);
    console.log(`      Calculated: ${mismatch.calculated_progress}%`);

    if (mismatch.missing_items && mismatch.missing_items.length > 0) {
      console.log('      Missing:');
      mismatch.missing_items.forEach(item => {
        console.log(`         - ${item.phase}: ${item.reason} (${item.percentage}% complete)`);
        if (item.critical) {
          console.log(`           ⚠️  CRITICAL: ${item.action_required}`);
        }
      });
    }

    if (mismatch.recommendation) {
      console.log(`      💡 Recommendation: ${mismatch.recommendation}`);
    }
  }
}

async function main() {
  const detector = new ProgressMismatchDetector();

  try {
    const mismatches = await detector.detectAndReport();
    detector.generateReport();

    // Exit with error code if high severity mismatches found
    const highSeverity = mismatches.filter(m => m.severity === 'high').length;
    if (highSeverity > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Detection failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ProgressMismatchDetector;