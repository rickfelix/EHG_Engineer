#!/usr/bin/env node

/**
 * Push Integrity Metrics to Database
 * Bridges GitHub Actions results to LEO Protocol Dashboard
 * 
 * Usage:
 *   node scripts/push-integrity-metrics.js \
 *     --source backlog-integrity \
 *     --sd-gaps 5 \
 *     --prd-gaps 10 \
 *     --backlog-issues 15 \
 *     --orphans 8 \
 *     --dependencies 3 \
 *     --recommendations '[{"title":"Create SD for X","urgency":"high"}]'
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

class IntegrityMetricsPusher {
  constructor() {
    this.parseArguments();
  }

  parseArguments() {
    const { values } = parseArgs({
      options: {
        source: { type: 'string' },
        'workflow-run': { type: 'string' },
        'sd-gaps': { type: 'string' },
        'prd-gaps': { type: 'string' },
        'backlog-issues': { type: 'string' },
        'trace-gaps': { type: 'string' },
        'dependencies': { type: 'string' },
        'orphans': { type: 'string' },
        'stage-gaps': { type: 'string' },
        'not-ready': { type: 'string' },
        'ventures-no-gov': { type: 'string' },
        'recommendation-count': { type: 'string' },
        'recommendations': { type: 'string' },
        'dry-run': { type: 'boolean' },
        'from-csv': { type: 'boolean' }
      }
    });

    this.options = values;
    this.source = values.source || 'unknown';
    this.workflowRunId = values['workflow-run'] || process.env.GITHUB_RUN_ID;
  }

  async readCSVCounts() {
    const counts = {};
    const csvDir = 'ops/checks/out';
    
    // Map CSV files to metric names
    const csvMappings = {
      'gap_sd_metadata.csv': 'sd-gaps',
      'gap_prd_contract.csv': 'prd-gaps',
      'gap_backlog_shape.csv': 'backlog-issues',
      'gap_traceability.csv': 'trace-gaps',
      'gap_dependencies.csv': 'dependencies',
      'orphans.csv': 'orphans',
      'vh_stage_coverage_gaps.csv': 'stage-gaps',
      'vh_stage_readiness.csv': 'not-ready',
      'vh_ventures_without_governance.csv': 'ventures-no-gov',
      'vh_ideation_recommendations.csv': 'recommendation-count'
    };

    for (const [filename, metricName] of Object.entries(csvMappings)) {
      const filepath = path.join(csvDir, filename);
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n');
        // Subtract 1 for header row
        counts[metricName] = Math.max(0, lines.length - 1);
        console.log(`  📊 ${filename}: ${counts[metricName]} rows`);
      }
    }

    // Read top recommendations if available
    const recoFile = path.join(csvDir, 'vh_ideation_recommendations.csv');
    if (fs.existsSync(recoFile)) {
      counts.recommendations = this.parseTopRecommendations(recoFile);
    }

    return counts;
  }

  parseTopRecommendations(filepath, limit = 5) {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length <= 1) return [];
      
      const headers = lines[0].split(',');
      const recommendations = [];
      
      for (let i = 1; i <= Math.min(limit, lines.length - 1); i++) {
        const values = lines[i].split(',');
        const rec = {};
        headers.forEach((h, idx) => {
          rec[h] = values[idx] || '';
        });
        recommendations.push({
          title: rec.suggested_title || rec.title || '',
          urgency: rec.urgency || 'medium',
          type: rec.rec_type || 'SD',
          venture: rec.venture_name || 'Unknown'
        });
      }
      
      return recommendations;
    } catch (_error) {
      console.error('Error parsing recommendations:', error.message);
      return [];
    }
  }

  async loadPreviousMetrics() {
    const { data, error } = await supabase
      .from('integrity_metrics')
      .select('total_gaps')
      .eq('source', this.source)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('⚠️  Could not load previous metrics:', error.message);
      return null;
    }
    
    return data?.[0]?.total_gaps || null;
  }

  async push() {
    console.log('\n🚀 Pushing Integrity Metrics to Database');
    console.log('='.repeat(50));
    console.log(`Source: ${this.source}`);
    console.log(`Workflow Run: ${this.workflowRunId || 'manual'}`);
    console.log('');

    let metrics = {};
    
    // Read from CSV files if requested
    if (this.options['from-csv']) {
      console.log('📂 Reading counts from CSV files...');
      const csvCounts = await this.readCSVCounts();
      metrics = { ...csvCounts };
    }
    
    // Override with command line arguments if provided
    const argMappings = {
      'sd-gaps': 'sd_metadata_gaps',
      'prd-gaps': 'prd_contract_gaps',
      'backlog-issues': 'backlog_shape_issues',
      'trace-gaps': 'traceability_gaps',
      'dependencies': 'dependency_issues',
      'orphans': 'orphan_items',
      'stage-gaps': 'stage_coverage_gaps',
      'not-ready': 'stages_not_ready',
      'ventures-no-gov': 'ventures_without_governance',
      'recommendation-count': 'recommendation_count'
    };

    for (const [arg, dbField] of Object.entries(argMappings)) {
      if (this.options[arg]) {
        metrics[dbField] = parseInt(this.options[arg], 10);
      }
    }

    // Calculate total gaps
    const gapFields = ['sd_metadata_gaps', 'prd_contract_gaps', 'backlog_shape_issues', 
                      'traceability_gaps', 'dependency_issues', 'orphan_items',
                      'stage_coverage_gaps', 'stages_not_ready', 'ventures_without_governance'];
    
    let totalGaps = 0;
    for (const field of gapFields) {
      if (metrics[field]) {
        totalGaps += metrics[field];
      }
    }

    // Load previous total for delta calculation
    const previousTotal = await this.loadPreviousMetrics();

    // Parse recommendations if provided
    let topRecommendations = metrics.recommendations || [];
    if (this.options.recommendations && typeof this.options.recommendations === 'string') {
      try {
        topRecommendations = JSON.parse(this.options.recommendations);
      } catch (_e) {
        console.error('⚠️  Could not parse recommendations JSON');
      }
    }

    // Prepare record for insertion
    const record = {
      source: this.source,
      workflow_run_id: this.workflowRunId ? parseInt(this.workflowRunId, 10) : null,
      total_gaps: totalGaps,
      previous_total_gaps: previousTotal,
      top_recommendations: topRecommendations,
      dry_run: this.options['dry-run'] || false,
      ...metrics
    };

    console.log('\n📊 Metrics to push:');
    console.log(`  Total Gaps: ${totalGaps}`);
    if (previousTotal !== null) {
      const delta = totalGaps - previousTotal;
      const deltaStr = delta > 0 ? `+${delta}` : delta.toString();
      const emoji = delta < 0 ? '✅' : delta > 0 ? '⚠️' : '➖';
      console.log(`  Previous: ${previousTotal}`);
      console.log(`  Delta: ${emoji} ${deltaStr}`);
    }
    console.log(`  Recommendations: ${topRecommendations.length}`);

    if (this.options['dry-run']) {
      console.log('\n🔍 DRY RUN - Would insert:');
      console.log(JSON.stringify(record, null, 2));
      return;
    }

    // Insert into database
    const { data, error } = await supabase
      .from('integrity_metrics')
      .insert(record)
      .select();

    if (error) {
      console.error('\n❌ Failed to push metrics:', error.message);
      if (error.code === '23505') {
        console.error('   Duplicate workflow run - metrics already recorded');
      }
      process.exit(1);
    }

    console.log('\n✅ Metrics pushed successfully!');
    if (data && data[0]) {
      console.log(`   ID: ${data[0].id}`);
      console.log(`   Gap Delta: ${data[0].gap_delta || 0}`);
    }

    // Dashboard will auto-update via WebSocket subscription
    console.log('\n📡 Dashboard will auto-refresh with new metrics');
  }
}

// Main execution
const pusher = new IntegrityMetricsPusher();
pusher.push().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});