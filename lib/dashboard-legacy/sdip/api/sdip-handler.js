/**
 * SDIP API Handler
 * Handles all SDIP-related API requests
 * Integrated with Security Sub-Agent components
 */

import { createClient } from '@supabase/supabase-js';
import PACEREngine from '../engines/pacer-engine';
import CriticalAnalyzer from '../engines/critical-analyzer';
import ImpactAnalyzer from '../engines/impact-analyzer';
import SynthesisGenerator from '../engines/synthesis-generator';
import ValidationGateEnforcer from '../validators/gate-enforcer';
import ConsistencyEnforcer from '../validators/consistency-enforcer';

// Security components integration
import JWTAuthenticator from '../security/jwt-auth';
import InputSanitizer from '../security/input-sanitizer';
import RateLimiter from '../security/rate-limiter';

class SDIPHandler {
  constructor(supabaseUrl, supabaseKey, openaiKey, jwtSecret) {
    // Initialize services
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.pacerEngine = new PACEREngine();
    this.criticalAnalyzer = new CriticalAnalyzer(openaiKey);
    this.impactAnalyzer = new ImpactAnalyzer();
    this.synthesisGenerator = new SynthesisGenerator();
    this.gateEnforcer = new ValidationGateEnforcer();
    this.consistencyEnforcer = new ConsistencyEnforcer();
    
    // Initialize security components
    this.auth = new JWTAuthenticator(jwtSecret);
    this.sanitizer = new InputSanitizer();
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Create new submission and perform initial analysis
   */
  async createSubmission(req, res) {
    try {
      // Sanitize input first
      const sanitizedBody = this.sanitizer.sanitizeRequest(req.body);
      const { feedback, screenshot_url } = sanitizedBody;
      const user_id = req.user?.id || null;

      // Validate input
      if (!feedback || feedback.trim().length === 0) {
        return res.status(400).json({
          error: 'Feedback text is required'
        });
      }
      
      // Additional security: Sanitize chairman input specifically
      const sanitizedFeedback = this.sanitizer.sanitize('chairman_input', feedback);
      const sanitizedScreenshotUrl = screenshot_url ? 
        this.sanitizer.sanitize('screenshot_url', screenshot_url) : null;

      // Step 1: Run PACER analysis (backend-only)
      const pacerAnalysis = await this.pacerEngine.analyze(feedback);

      // Step 2: Extract intent with critical analysis
      const intentAnalysis = await this.criticalAnalyzer.extractIntent(feedback);

      // Step 3: Generate strategic/tactical classification
      const stratTacAnalysis = await this.criticalAnalyzer.classifyStrategicTactical(feedback);

      // Step 3.5: Perform impact analysis (new comprehensive analysis step)
      const tempSubmission = {
        chairman_input: feedback,
        intent_summary: intentAnalysis.summary,
        strat_tac_final: stratTacAnalysis,
        strat_tac: stratTacAnalysis
      };
      const impactAnalysis = await this.impactAnalyzer.analyzeImpact(tempSubmission);
      
      // Step 3.6: Run consistency validation
      const consistencyValidation = await this.consistencyEnforcer.validateConsistency(tempSubmission, impactAnalysis);

      // Step 4: Generate synthesis with critical mode
      const criticalSynthesis = await this.criticalAnalyzer.generateSynthesis(feedback, intentAnalysis.summary);
      
      // Step 5: Enhance synthesis with badges
      const synthesis = await this.synthesisGenerator.generate(
        criticalSynthesis,
        intentAnalysis.summary,
        feedback
      );

      // Step 6: Generate clarifying questions
      const questions = await this.criticalAnalyzer.generateQuestions(
        feedback,
        { strat_tac: stratTacAnalysis }
      );

      // Create submission in database
      const { data: submission, error } = await this.supabase
        .from('sdip_submissions')
        .insert({
          chairman_input: sanitizedFeedback,
          screenshot_url: sanitizedScreenshotUrl,
          submission_title: this.generateTitle(intentAnalysis.summary),
          
          // Backend-only PACER
          pacer_analysis: pacerAnalysis,
          
          // Intent (Step 2)
          intent_summary: intentAnalysis.summary,
          intent_original: intentAnalysis.summary,
          
          // Classification (Step 3)
          strat_tac_system: stratTacAnalysis,
          strat_tac_final: stratTacAnalysis,
          
          // Synthesis (Step 4)
          synthesis,
          change_policies: this.extractPolicies(synthesis),
          
          // Questions (Step 5)
          clarifying_questions: questions,
          
          // Initial state
          current_step: 2, // Start at intent confirmation
          status: 'draft', // New status field
          created_by: user_id,
          analysis_mode: 'CRITICAL'
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({
          error: 'Failed to create submission',
          details: error.message
        });
      }

      // Save impact analysis to separate table
      try {
        const { error: impactError } = await this.supabase
          .from('submission_impact_analyses')
          .insert({
            submission_id: submission.id,
            impact_score: impactAnalysis.impact_score,
            risk_level: impactAnalysis.risk_level,
            rollback_complexity: impactAnalysis.rollback_complexity,
            estimated_effort_multiplier: impactAnalysis.estimated_effort_multiplier,
            affected_components: impactAnalysis.affected_components,
            dependencies: impactAnalysis.dependencies,
            breaking_changes: impactAnalysis.breaking_changes,
            recommendations: impactAnalysis.recommendations,
            mitigation_strategies: impactAnalysis.mitigation_strategies,
            analyzer_version: '1.0.0'
          });

        if (impactError) {
          console.error('Impact analysis save error:', impactError);
        }

        // Save consistency validation results
        const { error: consistencyError } = await this.supabase
          .from('submission_consistency_validations')
          .insert({
            submission_id: submission.id,
            passed: consistencyValidation.passed,
            overall_score: consistencyValidation.score,
            overall_risk: consistencyValidation.overall_risk,
            category_scores: consistencyValidation.category_scores,
            violations: consistencyValidation.violations,
            warnings: consistencyValidation.warnings,
            recommendations: consistencyValidation.recommendations,
            blocking_issues: consistencyValidation.blocking_issues,
            validator_version: '1.0.0'
          });

        if (consistencyError) {
          console.error('Consistency validation save error:', consistencyError);
        }
      } catch (saveError) {
        console.error('Error saving analysis data:', saveError);
        // Don't fail the whole request, but log the error
      }

      // Return analysis for UI (including impact analysis)
      res.json({
        submission_id: submission.id,
        intent_summary: submission.intent_summary,
        strat_tac: submission.strat_tac_final,
        synthesis: submission.synthesis,
        clarifying_questions: submission.clarifying_questions,
        current_step: submission.current_step,
        next_action: 'Confirm intent summary',
        // Add impact analysis results
        impact_analysis: {
          impact_score: impactAnalysis.impact_score,
          risk_level: impactAnalysis.risk_level,
          affected_components: impactAnalysis.affected_components,
          breaking_changes: impactAnalysis.breaking_changes,
          rollback_complexity: impactAnalysis.rollback_complexity,
          effort_multiplier: impactAnalysis.estimated_effort_multiplier,
          summary: this.impactAnalyzer.getImpactSummary(impactAnalysis)
        },
        consistency_validation: {
          passed: consistencyValidation.passed,
          score: consistencyValidation.score,
          risk_level: consistencyValidation.overall_risk,
          blocking_issues: consistencyValidation.blocking_issues,
          violations_count: consistencyValidation.violations.length,
          warnings_count: consistencyValidation.warnings.length,
          summary: this.consistencyEnforcer.generateConsistencyReport(consistencyValidation)
        }
      });

    } catch (error) {
      console.error('Error creating submission:', error);
      res.status(500).json({
        error: 'Failed to analyze submission',
        message: error.message
      });
    }
  }

  /**
   * Get submission by ID
   */
  async getSubmission(req, res) {
    try {
      const { id } = req.params;

      const { data: submission, error } = await this.supabase
        .from('sdip_submissions')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !submission) {
        return res.status(404).json({
          error: 'Submission not found'
        });
      }

      // Get progress summary
      const progress = this.gateEnforcer.getProgressSummary(submission);

      // Get impact analysis
      const { data: impactAnalysis } = await this.supabase
        .from('submission_impact_analyses')
        .select('*')
        .eq('submission_id', id)
        .single();

      // Get consistency validation
      const { data: consistencyValidation } = await this.supabase
        .from('submission_consistency_validations')
        .select('*')
        .eq('submission_id', id)
        .single();

      // Don't return PACER analysis to frontend
      const { pacer_analysis, ...publicData } = submission;

      res.json({
        submission: publicData,
        progress,
        impact_analysis: impactAnalysis ? {
          impact_score: impactAnalysis.impact_score,
          risk_level: impactAnalysis.risk_level,
          affected_components: impactAnalysis.affected_components,
          breaking_changes: impactAnalysis.breaking_changes,
          rollback_complexity: impactAnalysis.rollback_complexity,
          effort_multiplier: impactAnalysis.estimated_effort_multiplier,
          recommendations: impactAnalysis.recommendations,
          mitigation_strategies: impactAnalysis.mitigation_strategies
        } : null,
        consistency_validation: consistencyValidation ? {
          passed: consistencyValidation.passed,
          score: consistencyValidation.overall_score,
          risk_level: consistencyValidation.overall_risk,
          blocking_issues: consistencyValidation.blocking_issues,
          violations: consistencyValidation.violations,
          warnings: consistencyValidation.warnings,
          recommendations: consistencyValidation.recommendations,
          category_scores: consistencyValidation.category_scores
        } : null
      });

    } catch (error) {
      console.error('Error getting submission:', error);
      res.status(500).json({
        error: 'Failed to retrieve submission'
      });
    }
  }

  /**
   * Complete a step and update validation
   */
  async completeStep(req, res) {
    try {
      const { step } = req.params;
      const { submission_id, data } = req.body;
      const stepNumber = parseInt(step);

      // Get current submission
      const { data: submission, error: fetchError } = await this.supabase
        .from('sdip_submissions')
        .select('*')
        .eq('id', submission_id)
        .single();

      if (fetchError || !submission) {
        return res.status(404).json({
          error: 'Submission not found'
        });
      }

      // Update submission based on step
      const updates = await this.processStepData(stepNumber, data, submission);

      // Update gate status
      this.gateEnforcer.updateGateStatus(updates, stepNumber);

      // Save updates to database
      const { data: updated, error: updateError } = await this.supabase
        .from('sdip_submissions')
        .update(updates)
        .eq('id', submission_id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: 'Failed to update submission',
          details: updateError.message
        });
      }

      // Get next step data
      const nextStepData = await this.getNextStepData(updated, stepNumber + 1);

      res.json({
        success: true,
        next_step: stepNumber + 1,
        next_step_data: nextStepData,
        gate_status: updated.gate_status,
        can_proceed: this.gateEnforcer.canProceedToNext(updated, stepNumber)
      });

    } catch (error) {
      console.error('Error completing step:', error);
      res.status(500).json({
        error: 'Failed to complete step',
        message: error.message
      });
    }
  }

  /**
   * Create Strategic Directive from submission
   */
  async createStrategicDirective(req, res) {
    try {
      const { submission_id } = req.body;

      // Get submission
      const { data: submission, error: fetchError } = await this.supabase
        .from('sdip_submissions')
        .select('*')
        .eq('id', submission_id)
        .single();

      if (fetchError || !submission) {
        return res.status(404).json({
          error: 'Submission not found'
        });
      }

      // Enforce all validation gates
      try {
        this.gateEnforcer.enforceAllGatesForSD(submission);
      } catch (validationError) {
        return res.status(400).json({
          error: validationError.message,
          missing_gates: validationError.missing_gates,
          completion: validationError.completion_percentage
        });
      }

      // Generate SD ID
      const sdId = this.generateSDId();

      // Create Strategic Directive
      const sdData = {
        id: sdId,
        title: submission.intent_summary,
        description: submission.client_summary,
        status: 'active',
        priority: this.determinePriority(submission),
        metadata: {
          source: 'SDIP',
          submission_id: submission.id,
          strategic_percentage: submission.strat_tac_final.strategic_pct,
          tactical_percentage: submission.strat_tac_final.tactical_pct,
          complexity: submission.synthesis.metadata?.complexity_assessment,
          created_via: 'Directive Lab'
        },
        objectives: this.extractObjectives(submission),
        created_by: submission.created_by,
        created_at: new Date().toISOString()
      };

      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .insert(sdData)
        .select()
        .single();

      if (sdError) {
        return res.status(500).json({
          error: 'Failed to create Strategic Directive',
          details: sdError.message
        });
      }

      // Update submission with SD reference and mark as submitted
      await this.supabase
        .from('sdip_submissions')
        .update({ 
          resulting_sd_id: sdId,
          status: 'submitted',
          validation_complete: true,
          completed_at: new Date().toISOString()
        })
        .eq('id', submission_id);

      res.json({
        success: true,
        sd_id: sdId,
        redirect_url: `/strategic-directives/${sdId}`,
        message: 'Strategic Directive created successfully'
      });

    } catch (error) {
      console.error('Error creating SD:', error);
      res.status(500).json({
        error: 'Failed to create Strategic Directive',
        message: error.message
      });
    }
  }

  /**
   * List recent submissions
   */
  async listSubmissions(req, res) {
    try {
      const user_id = req.user?.id || null;
      const { uncombined, since } = req.query;

      let query = this.supabase
        .from('sdip_submissions')
        .select('id, submission_title, created_at, current_step, validation_complete, group_id');
      
      // Handle user filtering properly for UUID field
      if (user_id) {
        query = query.eq('created_by', user_id);
      } else {
        query = query.is('created_by', null);
      }
      
      query = query.order('created_at', { ascending: false });

      // Filter uncombined only
      if (uncombined === 'true') {
        query = query.is('group_id', null);
      }

      // Filter by time
      if (since) {
        const daysAgo = parseInt(since.replace('d', ''));
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - daysAgo);
        query = query.gte('created_at', sinceDate.toISOString());
      }

      const { data: submissions, error } = await query;

      if (error) {
        return res.status(500).json({
          error: 'Failed to list submissions',
          details: error.message
        });
      }

      res.json(submissions || []);

    } catch (error) {
      console.error('Error listing submissions:', error);
      res.status(500).json({
        error: 'Failed to list submissions'
      });
    }
  }

  /**
   * Create group from multiple submissions
   */
  async createGroup(req, res) {
    try {
      const { submission_ids, group_name, method } = req.body;
      const user_id = req.user?.id || null;

      // Get all submissions
      const { data: submissions, error: fetchError } = await this.supabase
        .from('sdip_submissions')
        .select('*')
        .in('id', submission_ids);

      if (fetchError || !submissions || submissions.length === 0) {
        return res.status(404).json({
          error: 'Submissions not found'
        });
      }

      // Combine analysis based on method
      const combinedAnalysis = await this.combineSubmissions(submissions, method);

      // Create group
      const { data: group, error: groupError } = await this.supabase
        .from('sdip_groups')
        .insert({
          group_name,
          submission_ids,
          combined_intent_summary: combinedAnalysis.intent,
          combined_synthesis: combinedAnalysis.synthesis,
          combined_client_summary: combinedAnalysis.summary,
          created_by: user_id
        })
        .select()
        .single();

      if (groupError) {
        return res.status(500).json({
          error: 'Failed to create group',
          details: groupError.message
        });
      }

      // Update submissions with group ID
      await this.supabase
        .from('sdip_submissions')
        .update({ group_id: group.id })
        .in('id', submission_ids);

      res.json({
        group_id: group.id,
        combined_analysis: combinedAnalysis,
        message: 'Group created successfully'
      });

    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({
        error: 'Failed to create group'
      });
    }
  }

  // Helper methods

  processStepData(step, data, submission) {
    const updates = { ...submission };

    switch (step) {
      case 2: // Intent confirmation
        updates.intent_summary = data.intent_summary || submission.intent_summary;
        updates.intent_confirmed = true;
        updates.intent_confirmed_at = new Date().toISOString();
        break;

      case 3: // Classification
        if (data.override) {
          updates.strat_tac_override = data.override;
          updates.strat_tac_final = data.override;
        }
        updates.strat_tac_reviewed = true;
        updates.strat_tac_reviewed_at = new Date().toISOString();
        break;

      case 4: // Synthesis review
        updates.synthesis_reviewed = true;
        updates.synthesis_reviewed_at = new Date().toISOString();
        break;

      case 5: // Questions answered
        updates.question_answers = data.answers;
        updates.questions_answered = true;
        updates.questions_answered_at = new Date().toISOString();
        
        // Generate client summary after questions
        updates.client_summary = this.synthesisGenerator.generateClientSummary(
          submission.synthesis,
          data.answers
        ).join('\n');
        break;

      case 6: // Summary confirmed
        updates.summary_confirmed = true;
        updates.summary_confirmed_at = new Date().toISOString();
        break;

      case 7: // Final submission step - handle dual actions
        if (data.action === 'save_and_close') {
          // Save & Close: Mark as ready but don't create SD
          updates.status = 'ready';
          updates.completed_steps = [1, 2, 3, 4, 5, 6, 7];
          updates.current_step = 7;
          updates.validation_complete = false; // Not submitted yet
          updates.final_summary = data.final_summary;
        } else if (data.action === 'submit_directive') {
          // Submit Directive: Will be handled by create-strategic-directive endpoint
          updates.status = 'submitted';
          updates.completed_steps = [1, 2, 3, 4, 5, 6, 7];
          updates.validation_complete = true;
          updates.completed_at = new Date().toISOString();
          updates.final_summary = data.final_summary;
        }
        break;
    }

    // Handle generic status updates if provided
    if (data.status && ['draft', 'ready', 'submitted'].includes(data.status)) {
      updates.status = data.status;
    }

    // Handle completed_steps array if provided
    if (data.completed_steps && Array.isArray(data.completed_steps)) {
      updates.completed_steps = data.completed_steps;
    }

    return updates;
  }

  async getNextStepData(submission, nextStep) {
    switch (nextStep) {
      case 3:
        return {
          classification: submission.strat_tac_final,
          can_override: true
        };
      case 4:
        return {
          synthesis: submission.synthesis,
          badges: submission.change_policies
        };
      case 5:
        return {
          questions: submission.clarifying_questions
        };
      case 6:
        return {
          summary: submission.client_summary
        };
      case 7:
        return {
          ready_for_sd: true,
          validation_complete: true
        };
      default:
        return {};
    }
  }

  generateTitle(intent) {
    // Truncate intent for title
    return intent.length > 50 ? intent.substring(0, 47) + '...' : intent;
  }

  extractPolicies(synthesis) {
    const policies = {};
    
    ['aligned', 'required', 'recommended'].forEach(category => {
      if (synthesis[category]) {
        synthesis[category].forEach((item, index) => {
          if (item.badges) {
            policies[`${category}_${index}`] = item.badges;
          }
        });
      }
    });
    
    return policies;
  }

  generateSDId() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `SD-${year}-${month}${day}-${random}`;
  }

  determinePriority(submission) {
    const strategicPct = submission.strat_tac_final?.strategic_pct || 0;
    if (strategicPct > 70) return 'high';
    if (strategicPct > 40) return 'medium';
    return 'low';
  }

  extractObjectives(submission) {
    const objectives = [];
    
    if (submission.synthesis?.aligned) {
      submission.synthesis.aligned.forEach(item => {
        objectives.push(item.text);
      });
    }
    
    return objectives.slice(0, 5); // Limit to 5 objectives
  }

  async combineSubmissions(submissions, method = 'intelligent') {
    // Sort by created_at for chronological order
    submissions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let combinedIntent = '';
    let combinedSynthesis = {
      aligned: [],
      required: [],
      recommended: []
    };
    let combinationMetadata = {
      method_used: method,
      submissions_count: submissions.length,
      combination_score: 0,
      conflict_indicators: []
    };

    switch (method) {
      case 'intelligent':
        // AI-driven intelligent combination with conflict detection
        return await this.intelligentCombination(submissions);

      case 'chronological':
        // Keep order, concatenate with timeline preservation
        combinedIntent = submissions.map((s, i) => 
          `[${i + 1}] ${s.intent_summary}`
        ).join(' → ');
        
        submissions.forEach((s, i) => {
          if (s.synthesis) {
            // Add sequence numbers to track origin
            const addSequence = (items) => items?.map(item => ({
              ...item,
              origin_sequence: i + 1,
              origin_id: s.id
            })) || [];
            
            combinedSynthesis.aligned.push(...addSequence(s.synthesis.aligned));
            combinedSynthesis.required.push(...addSequence(s.synthesis.required));
            combinedSynthesis.recommended.push(...addSequence(s.synthesis.recommended));
          }
        });
        combinationMetadata.combination_score = 85;
        break;

      case 'merge':
        // Advanced merge with conflict resolution
        const intentMap = new Map();
        const conflictingIntents = [];
        
        // Detect intent conflicts
        submissions.forEach(s => {
          const intent = s.intent_summary?.toLowerCase().trim();
          if (intentMap.has(intent)) {
            conflictingIntents.push(intent);
          } else {
            intentMap.set(intent, s);
          }
        });
        
        if (conflictingIntents.length > 0) {
          combinationMetadata.conflict_indicators.push(`Intent conflicts: ${conflictingIntents.length}`);
        }
        
        combinedIntent = Array.from(intentMap.keys()).join(' + ');
        
        // Smart synthesis deduplication
        const synthesisMap = new Map();
        submissions.forEach(s => {
          if (s.synthesis) {
            ['aligned', 'required', 'recommended'].forEach(category => {
              s.synthesis[category]?.forEach(item => {
                const key = item.text?.toLowerCase().trim();
                if (key) {
                  if (synthesisMap.has(key)) {
                    synthesisMap.get(key).count++;
                    synthesisMap.get(key).sources.push(s.id);
                  } else {
                    synthesisMap.set(key, {
                      ...item,
                      count: 1,
                      sources: [s.id],
                      category
                    });
                  }
                }
              });
            });
          }
        });
        
        // Rebuild synthesis with consensus scoring
        Array.from(synthesisMap.values()).forEach(item => {
          const consensusScore = item.count / submissions.length;
          item.consensus_score = consensusScore;
          
          if (consensusScore >= 0.5) { // Majority agreement
            combinedSynthesis[item.category].push(item);
          }
        });
        
        combinationMetadata.combination_score = Math.round((1 - conflictingIntents.length / submissions.length) * 100);
        break;

      case 'latest':
        // Latest with inheritance tracking
        const latest = submissions[submissions.length - 1];
        combinedIntent = `Latest: ${latest.intent_summary}`;
        combinedSynthesis = {
          ...latest.synthesis,
          inheritance_chain: submissions.slice(0, -1).map(s => ({
            id: s.id,
            intent: s.intent_summary,
            created_at: s.created_at
          }))
        };
        combinationMetadata.combination_score = 70; // Lower because we're ignoring earlier work
        break;

      case 'priority':
        // Combine based on strategic importance
        const priorityOrder = submissions.sort((a, b) => {
          const aPriority = a.strat_tac_final?.strategic_pct || 0;
          const bPriority = b.strat_tac_final?.strategic_pct || 0;
          return bPriority - aPriority;
        });
        
        const primarySubmission = priorityOrder[0];
        combinedIntent = `Primary: ${primarySubmission.intent_summary}`;
        
        // Include supporting submissions as context
        if (priorityOrder.length > 1) {
          const supportingIntents = priorityOrder.slice(1).map(s => s.intent_summary);
          combinedIntent += ` | Supporting: ${supportingIntents.join(', ')}`;
        }
        
        combinedSynthesis = primarySubmission.synthesis || {};
        combinationMetadata.combination_score = 75;
        break;
    }

    // Generate enhanced combined summary with metadata
    const summary = this.synthesisGenerator.generateClientSummary(
      combinedSynthesis,
      {},
      combinationMetadata
    );

    return {
      intent: combinedIntent,
      synthesis: combinedSynthesis,
      summary: Array.isArray(summary) ? summary.join('\n') : summary,
      metadata: combinationMetadata,
      combined_count: submissions.length
    };
  }

  async intelligentCombination(submissions) {
    // Advanced AI-driven combination logic
    const analysis = {
      thematic_similarity: 0,
      temporal_coherence: 0,
      strategic_alignment: 0,
      implementation_overlap: 0
    };

    // Calculate thematic similarity using intent summaries
    const intents = submissions.map(s => s.intent_summary?.toLowerCase() || '');
    const commonWords = this.findCommonThemes(intents);
    analysis.thematic_similarity = Math.min(commonWords.length * 15, 100);

    // Check temporal coherence (submissions close in time are more likely to be related)
    const timeSpread = this.calculateTimeSpread(submissions);
    analysis.temporal_coherence = Math.max(0, 100 - timeSpread);

    // Analyze strategic alignment
    const stratPcts = submissions.map(s => s.strat_tac_final?.strategic_pct || 0);
    const avgStrat = stratPcts.reduce((a, b) => a + b, 0) / stratPcts.length;
    const stratVariance = stratPcts.reduce((acc, pct) => acc + Math.pow(pct - avgStrat, 2), 0) / stratPcts.length;
    analysis.strategic_alignment = Math.max(0, 100 - stratVariance);

    // Overall combination score
    const overallScore = (
      analysis.thematic_similarity * 0.4 +
      analysis.temporal_coherence * 0.2 +
      analysis.strategic_alignment * 0.4
    );

    // Choose combination strategy based on analysis
    let strategy = 'merge';
    if (analysis.thematic_similarity > 70 && analysis.temporal_coherence > 60) {
      strategy = 'chronological';
    } else if (analysis.strategic_alignment > 80) {
      strategy = 'priority';
    }

    console.log(`🧠 Intelligent combination: ${strategy} (score: ${Math.round(overallScore)})`);

    // Apply chosen strategy
    const result = await this.combineSubmissions(submissions, strategy);
    return {
      ...result,
      intelligence_analysis: analysis,
      chosen_strategy: strategy,
      confidence_score: Math.round(overallScore)
    };
  }

  findCommonThemes(intents) {
    const wordFreq = new Map();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'will', 'would', 'should', 'could']);
    
    intents.forEach(intent => {
      const words = intent.split(/\s+/).filter(word => word.length > 3 && !stopWords.has(word));
      words.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });
    });

    return Array.from(wordFreq.entries())
      .filter(([word, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  calculateTimeSpread(submissions) {
    if (submissions.length < 2) return 0;
    
    const times = submissions.map(s => new Date(s.created_at).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    // Return spread in hours
    return (maxTime - minTime) / (1000 * 60 * 60);
  }
}

export default SDIPHandler;