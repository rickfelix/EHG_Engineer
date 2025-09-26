#!/usr/bin/env node

/**
 * Strategic Directive Overlap Detector
 * Detects and analyzes overlapping scope between strategic directives
 * Prevents duplicate work and conflicting implementations
 * Part of Enhanced Validation Sub-Agent System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import chalk from 'chalk';
import Table from 'cli-table3';
import { AgentEventBus, EventTypes, Priority } from './agent-event-system.js';
import { SubAgentSummary } from './subagent-context-distillation.js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SDOverlapDetector {
  constructor() {
    this.eventBus = new AgentEventBus('OVERLAP_DETECTOR');
    this.summary = new SubAgentSummary('OVERLAP_DETECTOR');
    this.overlaps = [];
    this.dependencies = [];
    this.recommendations = [];
  }

  /**
   * Analyze all active SDs for overlaps
   */
  async analyzeAllOverlaps() {
    console.log(chalk.cyan('\n🔍 SD OVERLAP DETECTION SYSTEM'));
    console.log(chalk.cyan('═'.repeat(60)));

    try {
      // Get all active SDs
      const { data: activeSDs, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, description, status, priority')
        .in('status', ['draft', 'active', 'in_progress', 'pending_approval'])
        .order('priority', { ascending: false });

      if (error) throw error;

      if (!activeSDs || activeSDs.length === 0) {
        console.log(chalk.yellow('No active strategic directives found'));
        return [];
      }

      console.log(chalk.green(`\n✅ Found ${activeSDs.length} active strategic directives`));

      // Analyze each pair of SDs
      const totalPairs = (activeSDs.length * (activeSDs.length - 1)) / 2;
      console.log(chalk.blue(`\n📊 Analyzing ${totalPairs} SD pairs for overlaps...\n`));

      let pairCount = 0;
      for (let i = 0; i < activeSDs.length; i++) {
        for (let j = i + 1; j < activeSDs.length; j++) {
          pairCount++;
          process.stdout.write(chalk.gray(`\rAnalyzing pair ${pairCount}/${totalPairs}...`));

          const overlap = await this.analyzePair(activeSDs[i], activeSDs[j]);
          if (overlap && overlap.overlap_score > 20) {
            this.overlaps.push(overlap);
          }
        }
      }

      console.log('\n');

      // Sort by overlap score
      this.overlaps.sort((a, b) => b.overlap_score - a.overlap_score);

      // Display results
      await this.displayResults();

      // Generate recommendations
      await this.generateRecommendations();

      // Publish findings
      await this.publishFindings();

      return this.overlaps;

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      throw error;
    }
  }

  /**
   * Analyze overlap between two specific SDs
   */
  async analyzePair(sd1, sd2) {
    try {
      // Get backlog items for both SDs
      const [items1, items2] = await Promise.all([
        this.getBacklogItems(sd1.id),
        this.getBacklogItems(sd2.id)
      ]);

      // Calculate various overlap metrics
      const stageOverlap = this.calculateStageOverlap(items1, items2);
      const keywordSimilarity = this.calculateKeywordSimilarity(
        `${sd1.title} ${sd1.description}`,
        `${sd2.title} ${sd2.description}`
      );
      const functionalOverlap = this.calculateFunctionalOverlap(items1, items2);
      const resourceConflicts = await this.detectResourceConflicts(items1, items2);

      // Calculate overall overlap score
      const overlapScore = this.calculateOverlapScore({
        stageOverlap,
        keywordSimilarity,
        functionalOverlap,
        resourceConflicts
      });

      // Determine recommendation
      const recommendation = this.determineRecommendation(overlapScore, stageOverlap);

      // Store in database
      const result = {
        sd1_id: sd1.id,
        sd2_id: sd2.id,
        sd1_key: sd1.sd_key,
        sd2_key: sd2.sd_key,
        sd1_title: sd1.title,
        sd2_title: sd2.title,
        overlap_score: overlapScore,
        stage_overlap_count: stageOverlap.count,
        keyword_similarity: keywordSimilarity,
        functional_overlap: functionalOverlap,
        resource_conflicts: resourceConflicts.length,
        overlapping_stages: stageOverlap.stages,
        overlapping_items: this.findOverlappingItems(items1, items2),
        recommendation: recommendation,
        analyzed_by: 'OVERLAP_DETECTOR'
      };

      // Save to database
      await this.saveOverlapAnalysis(result);

      return result;

    } catch (error) {
      console.error(chalk.red(`Error analyzing ${sd1.sd_key} vs ${sd2.sd_key}: ${error.message}`));
      return null;
    }
  }

  /**
   * Get backlog items for an SD
   */
  async getBacklogItems(sdId) {
    const { data, error } = await supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sdId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Calculate stage overlap between two sets of items
   */
  calculateStageOverlap(items1, items2) {
    const stages1 = new Set(items1.map(i => i.stage_number).filter(s => s));
    const stages2 = new Set(items2.map(i => i.stage_number).filter(s => s));

    const overlappingStages = [...stages1].filter(s => stages2.has(s));

    return {
      count: overlappingStages.length,
      stages: overlappingStages.sort((a, b) => a - b),
      percentage: stages1.size > 0 ? (overlappingStages.length / stages1.size) * 100 : 0
    };
  }

  /**
   * Calculate keyword similarity using Jaccard coefficient
   */
  calculateKeywordSimilarity(text1, text2) {
    const words1 = this.extractKeywords(text1);
    const words2 = this.extractKeywords(text2);

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? (intersection.size / union.size) * 100 : 0;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into']);
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    return new Set(words);
  }

  /**
   * Calculate functional overlap based on item descriptions
   */
  calculateFunctionalOverlap(items1, items2) {
    let overlapCount = 0;

    for (const item1 of items1) {
      for (const item2 of items2) {
        const similarity = this.calculateKeywordSimilarity(
          item1.backlog_title || '',
          item2.backlog_title || ''
        );
        if (similarity > 50) {
          overlapCount++;
        }
      }
    }

    const maxPossible = Math.min(items1.length, items2.length);
    return maxPossible > 0 ? (overlapCount / maxPossible) * 100 : 0;
  }

  /**
   * Detect resource conflicts (tables, APIs, components)
   */
  async detectResourceConflicts(items1, items2) {
    const conflicts = [];

    // Extract resource patterns from item descriptions
    const resources1 = this.extractResources(items1);
    const resources2 = this.extractResources(items2);

    // Find conflicts
    for (const [type, res1] of Object.entries(resources1)) {
      const res2 = resources2[type] || new Set();
      const conflicting = [...res1].filter(r => res2.has(r));

      if (conflicting.length > 0) {
        conflicts.push({
          type,
          resources: conflicting,
          severity: this.assessConflictSeverity(type, conflicting.length)
        });
      }
    }

    return conflicts;
  }

  /**
   * Extract resources mentioned in items
   */
  extractResources(items) {
    const resources = {
      tables: new Set(),
      apis: new Set(),
      components: new Set(),
      agents: new Set()
    };

    for (const item of items) {
      const text = `${item.backlog_title} ${item.item_description || ''}`.toLowerCase();

      // Detect table references
      const tableMatches = text.match(/\b(\w+)(?:_table|_v2|_map)\b/g);
      if (tableMatches) {
        tableMatches.forEach(t => resources.tables.add(t));
      }

      // Detect API references
      const apiMatches = text.match(/\b(?:api|endpoint|route)[\s:]+(\w+)/g);
      if (apiMatches) {
        apiMatches.forEach(a => resources.apis.add(a));
      }

      // Detect component references
      const componentMatches = text.match(/\b(?:component|module|agent)[\s:]+(\w+)/g);
      if (componentMatches) {
        componentMatches.forEach(c => resources.components.add(c));
      }

      // Detect agent references
      if (text.includes('agent')) {
        const agentMatches = text.match(/\b(\w+)[\s-]agent\b/g);
        if (agentMatches) {
          agentMatches.forEach(a => resources.agents.add(a));
        }
      }
    }

    return resources;
  }

  /**
   * Assess severity of resource conflicts
   */
  assessConflictSeverity(type, count) {
    if (type === 'tables' && count > 2) return 'HIGH';
    if (type === 'agents' && count > 0) return 'HIGH';
    if (type === 'apis' && count > 3) return 'MEDIUM';
    if (count > 5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate overall overlap score
   */
  calculateOverlapScore(metrics) {
    const weights = {
      stageOverlap: 0.3,
      keywordSimilarity: 0.25,
      functionalOverlap: 0.25,
      resourceConflicts: 0.2
    };

    const score =
      (metrics.stageOverlap.percentage * weights.stageOverlap) +
      (metrics.keywordSimilarity * weights.keywordSimilarity) +
      (metrics.functionalOverlap * weights.functionalOverlap) +
      (metrics.resourceConflicts.length * 10 * weights.resourceConflicts);

    return Math.min(100, Math.round(score));
  }

  /**
   * Determine recommendation based on overlap analysis
   */
  determineRecommendation(overlapScore, stageOverlap) {
    if (overlapScore >= 70) {
      return 'CONSOLIDATE';
    } else if (overlapScore >= 50) {
      if (stageOverlap.count > 3) {
        return 'CONSOLIDATE';
      }
      return 'SEQUENCE';
    } else if (overlapScore >= 30) {
      return 'SHARE_COMPONENTS';
    } else if (overlapScore >= 20) {
      return 'NO_ACTION';
    }
    return 'NO_ACTION';
  }

  /**
   * Find specific overlapping items
   */
  findOverlappingItems(items1, items2) {
    const overlapping = [];

    for (const item1 of items1) {
      for (const item2 of items2) {
        const similarity = this.calculateKeywordSimilarity(
          item1.backlog_title || '',
          item2.backlog_title || ''
        );

        if (similarity > 40 || item1.stage_number === item2.stage_number) {
          overlapping.push({
            sd1_item: item1.backlog_title,
            sd1_stage: item1.stage_number,
            sd2_item: item2.backlog_title,
            sd2_stage: item2.stage_number,
            similarity: Math.round(similarity),
            overlap_type: item1.stage_number === item2.stage_number ? 'stage_match' : 'keyword_match'
          });
        }
      }
    }

    return overlapping;
  }

  /**
   * Save overlap analysis to database
   */
  async saveOverlapAnalysis(analysis) {
    const { error } = await supabase
      .from('sd_overlap_analysis')
      .upsert({
        sd1_id: analysis.sd1_id,
        sd2_id: analysis.sd2_id,
        overlap_score: analysis.overlap_score,
        stage_overlap_count: analysis.stage_overlap_count,
        keyword_similarity: analysis.keyword_similarity,
        functional_overlap: analysis.functional_overlap,
        resource_conflicts: analysis.resource_conflicts,
        overlapping_stages: analysis.overlapping_stages,
        overlapping_items: analysis.overlapping_items,
        recommendation: analysis.recommendation,
        analyzed_by: analysis.analyzed_by
      }, {
        onConflict: 'sd1_id,sd2_id'
      });

    if (error) {
      console.error(chalk.red(`Failed to save analysis: ${error.message}`));
    }
  }

  /**
   * Display analysis results
   */
  async displayResults() {
    if (this.overlaps.length === 0) {
      console.log(chalk.green('\n✅ No significant overlaps detected'));
      return;
    }

    console.log(chalk.yellow(`\n⚠️  Found ${this.overlaps.length} SD pairs with overlaps\n`));

    // Create summary table
    const table = new Table({
      head: [
        chalk.cyan('SD 1'),
        chalk.cyan('SD 2'),
        chalk.cyan('Overlap %'),
        chalk.cyan('Stages'),
        chalk.cyan('Recommendation')
      ],
      colWidths: [15, 15, 12, 10, 20]
    });

    for (const overlap of this.overlaps.slice(0, 10)) {
      const color = overlap.overlap_score >= 70 ? chalk.red :
                   overlap.overlap_score >= 50 ? chalk.yellow :
                   chalk.green;

      table.push([
        overlap.sd1_key,
        overlap.sd2_key,
        color(`${overlap.overlap_score}%`),
        overlap.stage_overlap_count.toString(),
        this.getRecommendationDisplay(overlap.recommendation)
      ]);
    }

    console.log(table.toString());
  }

  /**
   * Get display text for recommendation
   */
  getRecommendationDisplay(recommendation) {
    const displays = {
      'CONSOLIDATE': chalk.red('⚠️  Consolidate SDs'),
      'SEQUENCE': chalk.yellow('📅 Sequence Execution'),
      'SHARE_COMPONENTS': chalk.blue('🔗 Share Components'),
      'NO_ACTION': chalk.green('✅ No Action Needed'),
      'ESCALATE': chalk.magenta('📢 Escalate to LEAD'),
      'BLOCK': chalk.red('🚫 Block Execution')
    };
    return displays[recommendation] || recommendation;
  }

  /**
   * Generate strategic recommendations
   */
  async generateRecommendations() {
    console.log(chalk.cyan('\n📋 STRATEGIC RECOMMENDATIONS'));
    console.log(chalk.cyan('═'.repeat(60)));

    // Group overlaps by recommendation type
    const groups = {};
    for (const overlap of this.overlaps) {
      if (!groups[overlap.recommendation]) {
        groups[overlap.recommendation] = [];
      }
      groups[overlap.recommendation].push(overlap);
    }

    // Generate specific recommendations
    if (groups.CONSOLIDATE) {
      console.log(chalk.red('\n🔴 CONSOLIDATION REQUIRED:'));
      for (const overlap of groups.CONSOLIDATE) {
        console.log(`   • Merge ${overlap.sd1_key} and ${overlap.sd2_key} (${overlap.overlap_score}% overlap)`);
        this.recommendations.push({
          type: 'CONSOLIDATE',
          sds: [overlap.sd1_key, overlap.sd2_key],
          reason: `High overlap (${overlap.overlap_score}%) detected`,
          priority: 'HIGH'
        });
      }
    }

    if (groups.SEQUENCE) {
      console.log(chalk.yellow('\n🟡 SEQUENCING RECOMMENDED:'));
      const sequenceGroups = await this.determineSequencing(groups.SEQUENCE);
      for (const seq of sequenceGroups) {
        console.log(`   • Execute in order: ${seq.sequence.join(' → ')}`);
        this.recommendations.push({
          type: 'SEQUENCE',
          sequence: seq.sequence,
          reason: seq.reason,
          priority: 'MEDIUM'
        });
      }
    }

    if (groups.SHARE_COMPONENTS) {
      console.log(chalk.blue('\n🔵 COMPONENT SHARING OPPORTUNITIES:'));
      for (const overlap of groups.SHARE_COMPONENTS) {
        console.log(`   • ${overlap.sd1_key} and ${overlap.sd2_key} can share components`);
        this.recommendations.push({
          type: 'SHARE',
          sds: [overlap.sd1_key, overlap.sd2_key],
          components: overlap.overlapping_items?.slice(0, 3),
          priority: 'LOW'
        });
      }
    }

    // Check for GTM-specific conflicts
    await this.checkGTMConflicts();
  }

  /**
   * Check for GTM-specific conflicts and recommendations
   */
  async checkGTMConflicts() {
    const gtmOverlaps = this.overlaps.filter(o =>
      (o.sd1_key?.includes('011') || o.sd2_key?.includes('011') ||
       o.sd1_title?.toLowerCase().includes('gtm') || o.sd2_title?.toLowerCase().includes('gtm'))
    );

    if (gtmOverlaps.length > 0) {
      console.log(chalk.magenta('\n🎯 GTM-SPECIFIC RECOMMENDATIONS:'));

      // Analyze GTM dependencies
      const gtmSDs = new Set();
      gtmOverlaps.forEach(o => {
        gtmSDs.add(o.sd1_key);
        gtmSDs.add(o.sd2_key);
      });

      console.log(`   • ${gtmSDs.size} SDs involve GTM functionality`);
      console.log(`   • Recommended execution order:`);
      console.log(`     1. SD-040: GTM Feasibility Study (Stage 4)`);
      console.log(`     2. SD-011: Core GTM Implementation (Stage 17)`);
      console.log(`     3. SD-042: GTM Enhancements (Stages 34, 37)`);
      console.log(`     4. SD-060: GTM Performance Monitoring (Stage 53)`);

      this.recommendations.push({
        type: 'GTM_SEQUENCE',
        sequence: ['SD-040', 'SD-011', 'SD-042', 'SD-060'],
        reason: 'GTM components must be implemented in logical order',
        priority: 'CRITICAL'
      });
    }
  }

  /**
   * Determine optimal sequencing for overlapping SDs
   */
  async determineSequencing(overlaps) {
    const sequences = [];
    const processed = new Set();

    for (const overlap of overlaps) {
      if (processed.has(overlap.sd1_key) || processed.has(overlap.sd2_key)) {
        continue;
      }

      // Determine order based on stages
      const stages1 = overlap.overlapping_stages || [];
      const stages2 = await this.getSDStages(overlap.sd2_id);

      let sequence;
      if (Math.min(...stages1) < Math.min(...stages2)) {
        sequence = [overlap.sd1_key, overlap.sd2_key];
      } else {
        sequence = [overlap.sd2_key, overlap.sd1_key];
      }

      sequences.push({
        sequence,
        reason: `Stage dependencies require sequential execution`
      });

      processed.add(overlap.sd1_key);
      processed.add(overlap.sd2_key);
    }

    return sequences;
  }

  /**
   * Get stages for an SD
   */
  async getSDStages(sdId) {
    const items = await this.getBacklogItems(sdId);
    return [...new Set(items.map(i => i.stage_number).filter(s => s))].sort((a, b) => a - b);
  }

  /**
   * Publish findings via event bus
   */
  async publishFindings() {
    if (this.overlaps.length === 0) return;

    // Publish high-priority overlaps
    const criticalOverlaps = this.overlaps.filter(o => o.overlap_score >= 50);

    if (criticalOverlaps.length > 0) {
      await this.eventBus.publish(
        EventTypes.FINDING_DETECTED,
        `${criticalOverlaps.length} critical SD overlaps detected`,
        {
          overlaps: criticalOverlaps.slice(0, 5),
          recommendations: this.recommendations.filter(r => r.priority === 'HIGH' || r.priority === 'CRITICAL')
        },
        {
          priority: Priority.HIGH,
          targetAgents: ['LEAD', 'PLAN'],
          requiresAck: true
        }
      );
    }

    // Store summary for other agents
    await this.summary.addFinding(
      `Detected ${this.overlaps.length} SD overlaps, ${criticalOverlaps.length} critical`,
      10
    );

    if (this.recommendations.some(r => r.type === 'CONSOLIDATE')) {
      await this.summary.addCriticalFlag('SD_CONSOLIDATION_REQUIRED');
    }
  }

  /**
   * Analyze specific SD pair
   */
  async analyzeSpecificPair(sd1Key, sd2Key) {
    console.log(chalk.cyan(`\n🔍 Analyzing overlap: ${sd1Key} vs ${sd2Key}`));

    // Get SD details
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .in('sd_key', [sd1Key, sd2Key]);

    if (!sds || sds.length !== 2) {
      console.error(chalk.red('Could not find both SDs'));
      return null;
    }

    const sd1 = sds.find(s => s.sd_key === sd1Key);
    const sd2 = sds.find(s => s.sd_key === sd2Key);

    const overlap = await this.analyzePair(sd1, sd2);

    if (overlap) {
      // Display detailed results
      console.log(chalk.yellow('\n📊 OVERLAP ANALYSIS RESULTS:'));
      console.log(`   Overlap Score: ${overlap.overlap_score}%`);
      console.log(`   Stage Conflicts: ${overlap.stage_overlap_count}`);
      console.log(`   Keyword Similarity: ${Math.round(overlap.keyword_similarity)}%`);
      console.log(`   Functional Overlap: ${Math.round(overlap.functional_overlap)}%`);
      console.log(`   Recommendation: ${overlap.recommendation}`);

      if (overlap.overlapping_items?.length > 0) {
        console.log(chalk.cyan('\n📦 Overlapping Items:'));
        for (const item of overlap.overlapping_items.slice(0, 5)) {
          console.log(`   • ${item.sd1_item} ↔ ${item.sd2_item} (${item.similarity}% match)`);
        }
      }
    }

    return overlap;
  }
}

// CLI Interface
async function main() {
  const detector = new SDOverlapDetector();

  const args = process.argv.slice(2);

  if (args.length === 2 && args[0].startsWith('SD-') && args[1].startsWith('SD-')) {
    // Analyze specific pair
    await detector.analyzeSpecificPair(args[0], args[1]);
  } else if (args.includes('--gtm')) {
    // Analyze GTM-specific overlaps
    const overlaps = await detector.analyzeAllOverlaps();
    const gtmOverlaps = overlaps.filter(o =>
      o.sd1_title?.toLowerCase().includes('gtm') ||
      o.sd2_title?.toLowerCase().includes('gtm')
    );

    console.log(chalk.magenta(`\n🎯 GTM-Specific Overlaps: ${gtmOverlaps.length} found`));

  } else {
    // Analyze all overlaps
    await detector.analyzeAllOverlaps();
  }
}

// Export for use in other modules
export { SDOverlapDetector };
export default SDOverlapDetector;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}