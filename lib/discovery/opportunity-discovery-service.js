/**
 * Opportunity Discovery Service
 * SD: AI-Generated Venture Idea Discovery
 *
 * Orchestrates the full AI discovery pipeline:
 * 1. Market scanning (competitor-intelligence.js)
 * 2. Gap analysis (6 dimensions)
 * 3. Opportunity scoring (Green/Yellow/Red)
 * 4. Blueprint generation
 *
 * Chairman triggers scans manually via "Discover Opportunities" button.
 * Auto-approval: ≥85% approved, 70-84% pending review, <70% rejected.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import CompetitorIntelligenceService from '../research/competitor-intelligence.js';
import GapAnalyzer from './gap-analyzer.js';
import OpportunityScorer from './opportunity-scorer.js';
import BlueprintGenerator from './blueprint-generator.js';

dotenv.config();

// Supabase client singleton
let _supabaseClient = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      _supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
  }
  return _supabaseClient;
}

class OpportunityDiscoveryService {
  constructor(config = {}) {
    this.config = {
      autoGenerateBlueprints: config.autoGenerateBlueprints ?? true,
      minConfidenceForBlueprint: config.minConfidenceForBlueprint ?? 70,
      ...config
    };

    // Initialize sub-services
    this.competitorService = new CompetitorIntelligenceService(config);
    this.gapAnalyzer = new GapAnalyzer(config);
    this.opportunityScorer = new OpportunityScorer(config);
    this.blueprintGenerator = new BlueprintGenerator(config);
  }

  /**
   * Run a full discovery scan
   * @param {Object} params - Scan parameters
   * @param {string} params.scanType - 'competitor', 'market_trend', or 'full'
   * @param {string} params.targetUrl - Competitor URL to analyze (for competitor scans)
   * @param {string} params.targetMarket - Market to analyze (for market_trend scans)
   * @param {string} params.initiatedBy - User/system that initiated the scan
   * @returns {Object} Scan results with opportunities and blueprints
   */
  async runScan(params) {
    const { scanType, targetUrl, targetMarket, initiatedBy = 'system' } = params;
    const startTime = Date.now();

    // Create scan record
    const scanId = await this.createScanRecord({
      scanType,
      targetUrl,
      targetMarket,
      initiatedBy
    });

    try {
      // Update status to running
      await this.updateScanStatus(scanId, 'running');

      // Step 1: Gather market intelligence
      let competitorData;
      if (scanType === 'competitor' && targetUrl) {
        competitorData = await this.competitorService.analyzeCompetitor(targetUrl);
      } else {
        // For market_trend or full scans, we'll need additional data sources
        // For now, return error if no targetUrl
        throw new Error('Market trend scans require target URL for now');
      }

      // Step 2: Analyze gaps across 6 dimensions
      const gapAnalysis = await this.gapAnalyzer.analyze(competitorData);

      // Step 3: Score and classify opportunities
      const scoredOpportunities = this.opportunityScorer.scoreOpportunities(
        gapAnalysis.top_opportunities
      );

      // Step 4: Generate blueprints for qualifying opportunities
      let blueprints = [];
      if (this.config.autoGenerateBlueprints) {
        const eligibleOpportunities = scoredOpportunities.filter(
          opp => (opp.scores?.overall || 0) >= this.config.minConfidenceForBlueprint
        );

        if (eligibleOpportunities.length > 0) {
          blueprints = await this.blueprintGenerator.generateBlueprints(
            eligibleOpportunities,
            competitorData,
            scanId
          );

          // Save blueprints to database
          await this.saveBlueprintsToDatabase(blueprints);
        }
      }

      // Calculate summary stats
      const stats = this.opportunityScorer.getSummaryStats(scoredOpportunities);

      // Update scan record with results
      const duration = Date.now() - startTime;
      await this.completeScan(scanId, {
        opportunitiesFound: scoredOpportunities.length,
        blueprintsGenerated: blueprints.length,
        blueprintsAutoApproved: blueprints.filter(b => b.chairman_status === 'approved').length,
        blueprintsPendingReview: blueprints.filter(b => b.chairman_status === 'pending').length,
        rawAnalysis: competitorData,
        fourBuckets: gapAnalysis.four_buckets,
        gapAnalysis: gapAnalysis.dimensions,
        duration
      });

      return {
        scan_id: scanId,
        status: 'completed',
        duration_ms: duration,
        competitor: competitorData.competitor_reference,
        summary: {
          opportunities_found: scoredOpportunities.length,
          blueprints_generated: blueprints.length,
          auto_approved: stats.by_status.auto_approved,
          pending_review: stats.by_status.pending_review,
          auto_rejected: stats.by_status.auto_rejected,
          avg_score: stats.avg_score,
          by_box: stats.by_box
        },
        top_opportunities: stats.top_opportunities,
        blueprints: blueprints.map(b => ({
          title: b.title,
          opportunity_box: b.opportunity_box,
          confidence_score: b.confidence_score,
          chairman_status: b.chairman_status
        }))
      };

    } catch (error) {
      // Update scan with error
      await this.failScan(scanId, error.message);

      return {
        scan_id: scanId,
        status: 'failed',
        error: error.message,
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Get opportunities from a scan with filtering
   * @param {Object} filters - Query filters
   * @returns {Array} Filtered opportunities
   */
  async getOpportunities(filters = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    let query = supabase
      .from('opportunity_blueprints')
      .select('*')
      .eq('source_type', 'ai_generated');

    // Apply filters
    if (filters.box) {
      query = query.eq('opportunity_box', filters.box);
    }
    if (filters.status) {
      query = query.eq('chairman_status', filters.status);
    }
    if (filters.minScore) {
      query = query.gte('confidence_score', filters.minScore);
    }
    if (filters.scanId) {
      query = query.eq('scan_id', filters.scanId);
    }

    // Order by score descending
    query = query.order('confidence_score', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch opportunities: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get recent scans with summary
   */
  async getRecentScans(limit = 10) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data, error } = await supabase
      .from('opportunity_scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch scans: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Chairman approve/reject blueprint
   * @param {string} blueprintId - Blueprint UUID
   * @param {string} decision - 'approved' or 'rejected'
   * @param {string} feedback - Optional feedback
   */
  async chairmanDecision(blueprintId, decision, feedback = null) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const updateData = {
      chairman_status: decision,
      chairman_reviewed_at: new Date().toISOString()
    };

    if (feedback) {
      updateData.chairman_feedback = feedback;
    }

    const { data, error } = await supabase
      .from('opportunity_blueprints')
      .update(updateData)
      .eq('id', blueprintId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update blueprint: ${error.message}`);
    }

    return data;
  }

  // =========================================================================
  // Private methods - Database operations
  // =========================================================================

  async createScanRecord({ scanType, targetUrl, targetMarket, initiatedBy }) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data, error } = await supabase
      .from('opportunity_scans')
      .insert({
        scan_type: scanType,
        target_url: targetUrl,
        target_market: targetMarket,
        status: 'pending',
        initiated_by: initiatedBy
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create scan record: ${error.message}`);
    }

    return data.id;
  }

  async updateScanStatus(scanId, status) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from('opportunity_scans')
      .update({ status })
      .eq('id', scanId);
  }

  async completeScan(scanId, results) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from('opportunity_scans')
      .update({
        status: 'completed',
        opportunities_found: results.opportunitiesFound,
        blueprints_generated: results.blueprintsGenerated,
        blueprints_auto_approved: results.blueprintsAutoApproved,
        blueprints_pending_review: results.blueprintsPendingReview,
        raw_analysis: results.rawAnalysis,
        four_buckets: results.fourBuckets,
        gap_analysis: results.gapAnalysis,
        duration_ms: results.duration,
        completed_at: new Date().toISOString()
      })
      .eq('id', scanId);
  }

  async failScan(scanId, errorMessage) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from('opportunity_scans')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString()
      })
      .eq('id', scanId);
  }

  async saveBlueprintsToDatabase(blueprints) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase not configured - blueprints not saved');
      return;
    }

    for (const blueprint of blueprints) {
      try {
        const { error } = await supabase
          .from('opportunity_blueprints')
          .insert({
            title: blueprint.title,
            summary: blueprint.summary,
            problem: blueprint.problem,
            solution: blueprint.solution,
            target_market: blueprint.target_market,
            category: blueprint.category,
            industry: blueprint.industry,
            business_model: blueprint.business_model,
            differentiation: blueprint.differentiation,
            competitive_gaps: blueprint.competitive_gaps,
            source_type: blueprint.source_type,
            opportunity_box: blueprint.opportunity_box,
            time_to_capture_days: blueprint.time_to_capture_days,
            confidence_score: blueprint.confidence_score,
            scan_id: blueprint.scan_id,
            gap_analysis: blueprint.gap_analysis,
            ai_metadata: blueprint.ai_metadata,
            success_metrics: blueprint.success_metrics,
            tags: blueprint.tags,
            difficulty_level: blueprint.difficulty_level,
            estimated_timeline: blueprint.estimated_timeline,
            chairman_status: blueprint.chairman_status,
            opportunity_score: blueprint.opportunity_score,
            is_active: blueprint.is_active
          });

        if (error) {
          console.error(`Failed to save blueprint "${blueprint.title}":`, error.message);
        }
      } catch (err) {
        console.error(`Error saving blueprint "${blueprint.title}":`, err.message);
      }
    }
  }
}

export default OpportunityDiscoveryService;
