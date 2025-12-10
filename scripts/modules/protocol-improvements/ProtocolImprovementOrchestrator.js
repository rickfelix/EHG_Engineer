/**
 * Protocol Improvement Orchestrator
 * Main coordination layer for protocol improvement system
 */

import { ImprovementRepository } from './ImprovementRepository.js';
import { ImprovementExtractor } from './ImprovementExtractor.js';
import { ImprovementApplicator } from './ImprovementApplicator.js';
import { EffectivenessTracker } from './EffectivenessTracker.js';

export class ProtocolImprovementOrchestrator {
  constructor(options = {}) {
    this.repository = options.repository || new ImprovementRepository(
      options.supabaseUrl,
      options.supabaseKey
    );

    this.extractor = options.extractor || new ImprovementExtractor(this.repository);
    this.applicator = options.applicator || new ImprovementApplicator(this.repository);
    this.tracker = options.tracker || new EffectivenessTracker(this.repository);
  }

  /**
   * List improvements from queue
   */
  async listImprovements(filters = {}) {
    return await this.repository.listQueuedImprovements(filters);
  }

  /**
   * Get a specific improvement
   */
  async getImprovement(id) {
    return await this.repository.getImprovementById(id);
  }

  /**
   * Review an improvement (display for human review)
   */
  async reviewImprovement(improvementId) {
    const improvement = await this.repository.getImprovementById(improvementId);

    if (!improvement) {
      throw new Error(`Improvement ${improvementId} not found`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 PROTOCOL IMPROVEMENT REVIEW');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`ID: ${improvement.id}`);
    console.log(`Status: ${improvement.status}`);
    console.log(`Source SD: ${improvement.sd_id}`);
    console.log(`Category: ${improvement.improvement_category}`);
    console.log(`Phase: ${improvement.affected_phase || 'GENERAL'}`);
    console.log(`Impact: ${improvement.impact}\n`);

    console.log('Improvement:');
    console.log(`  ${improvement.improvement_text}\n`);

    if (improvement.evidence) {
      console.log('Evidence:');
      console.log(`  ${improvement.evidence}\n`);
    }

    console.log(`Auto-Apply Score: ${improvement.auto_apply_score || 'N/A'}`);

    if (improvement.auto_apply_score >= 0.85) {
      console.log('  ✅ Eligible for auto-application');
    } else {
      console.log('  ⚠️  Requires manual review');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    return improvement;
  }

  /**
   * Approve an improvement
   */
  async approveImprovement(improvementId, reviewedBy = 'system') {
    const improvement = await this.repository.getImprovementById(improvementId);

    if (!improvement) {
      throw new Error(`Improvement ${improvementId} not found`);
    }

    if (improvement.status === 'APPROVED') {
      console.log('⚠️  Improvement already approved\n');
      return improvement;
    }

    await this.repository.updateImprovementStatus(improvementId, 'APPROVED', {
      reviewed_by: reviewedBy
    });

    console.log('✅ Improvement approved\n');

    return await this.repository.getImprovementById(improvementId);
  }

  /**
   * Reject an improvement
   */
  async rejectImprovement(improvementId, reason, reviewedBy = 'system') {
    const improvement = await this.repository.getImprovementById(improvementId);

    if (!improvement) {
      throw new Error(`Improvement ${improvementId} not found`);
    }

    await this.repository.updateImprovementStatus(improvementId, 'REJECTED', {
      rejection_reason: reason,
      reviewed_by: reviewedBy
    });

    console.log('❌ Improvement rejected\n');
    console.log(`Reason: ${reason}\n`);

    return await this.repository.getImprovementById(improvementId);
  }

  /**
   * Apply an improvement
   */
  async applyImprovement(improvementId, dryRun = false) {
    return await this.applicator.applyImprovement(improvementId, dryRun);
  }

  /**
   * Apply all auto-applicable improvements
   */
  async applyAutoImprovements(threshold = 0.85, dryRun = false) {
    return await this.applicator.applyAutoImprovements(threshold, dryRun);
  }

  /**
   * Get effectiveness report
   */
  async getEffectivenessReport(filters = {}) {
    return await this.tracker.getEffectivenessReport(filters);
  }

  /**
   * Get effectiveness for specific improvement
   */
  async getImprovementEffectiveness(improvementId) {
    return await this.tracker.getImprovementEffectiveness(improvementId);
  }

  /**
   * Rescan retrospectives and populate queue
   */
  async rescanRetrospectives(filters = {}) {
    console.log('\n🔍 Scanning retrospectives for protocol improvements...\n');

    // Extract improvements
    const improvements = await this.extractor.scanRetrospectives(filters);

    // Analyze patterns
    const patterns = await this.extractor.analyzePatterns(improvements);

    // Generate report
    this.extractor.generateReport(improvements, patterns);

    // Populate queue
    console.log('📥 Populating improvement queue...\n');

    let inserted = 0;
    let skipped = 0;

    for (const improvement of improvements) {
      try {
        await this.repository.upsertImprovementQueue(improvement);
        inserted++;
      } catch (error) {
        skipped++;
        console.log(`⚠️  Skipped: ${error.message}`);
      }
    }

    console.log(`✅ Inserted/Updated: ${inserted}`);
    console.log(`⚠️  Skipped: ${skipped}\n`);

    return {
      total: improvements.length,
      inserted,
      skipped,
      patterns
    };
  }

  /**
   * Get system statistics
   */
  async getStats() {
    const all = await this.repository.listQueuedImprovements({});
    const pending = all.filter(i => i.status === 'PENDING');
    const approved = all.filter(i => i.status === 'APPROVED');
    const applied = all.filter(i => i.status === 'APPLIED');
    const rejected = all.filter(i => i.status === 'REJECTED');

    return {
      total: all.length,
      pending: pending.length,
      approved: approved.length,
      applied: applied.length,
      rejected: rejected.length,
      byCategory: this.groupBy(all, 'improvement_category'),
      byPhase: this.groupBy(all, 'affected_phase'),
      byImpact: this.groupBy(all, 'impact')
    };
  }

  /**
   * Helper to group items
   */
  groupBy(items, field) {
    const groups = {};
    items.forEach(item => {
      const key = item[field] || 'UNKNOWN';
      groups[key] = (groups[key] || 0) + 1;
    });
    return groups;
  }
}

/**
 * Factory function to create orchestrator
 */
export function createProtocolImprovementSystem(options = {}) {
  return new ProtocolImprovementOrchestrator(options);
}
