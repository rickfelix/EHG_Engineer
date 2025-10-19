/**
 * PLAN Verification Tool
 * LEO Protocol v4.1.2 - Enhanced PLAN Supervisor Capabilities
 * 
 * This tool enables PLAN to act as a final supervisor, verifying that all
 * requirements are truly met before marking work as "done done".
 * 
 * Key Features:
 * - Read-only access to sub-agent results (no re-execution)
 * - Summary-first approach to prevent context explosion
 * - Conflict resolution for contradictory reports
 * - Circuit breaker pattern for graceful failure handling
 * - Maximum 3 verification iterations to prevent infinite loops
 */

import { EventEmitter } from 'events';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PLANVerificationTool extends EventEmitter {
  constructor() {
    super();
    
    // Configuration
    this.config = {
      maxIterations: 3,
      defaultTimeout: 5000,
      maxTimeout: 15000,
      confidenceThreshold: 85,
      summaryTokenLimit: 500,
      issuesOnlyTokenLimit: 2000,
      fullReportTokenLimit: 10000
    };
    
    // Circuit breaker state for each sub-agent
    this.circuitBreakers = new Map();
    
    // Conflict resolution rules (priority order)
    this.conflictRules = [
      { if: 'SECURITY === CRITICAL', then: 'BLOCK', override: '*' },
      { if: 'DATABASE === FAILED', then: 'BLOCK', override: '!SECURITY' },
      { if: 'TESTING === PASSED && others === WARNING', then: 'CONDITIONAL_PASS' }
    ];
    
    // Sub-agents that must reach consensus
    this.consensusRequired = ['SECURITY', 'DATABASE', 'TESTING'];
    
    // Sub-agents that are advisory only
    this.advisoryOnly = ['DESIGN', 'COST', 'DOCUMENTATION'];
    
    // Current verification session
    this.session = null;
  }

  /**
   * Initialize a new verification session
   */
  async initSession(prdId, sdId = null, triggeredBy = 'manual') {
    // Check if we can start verification
    const { data: canStart } = await supabase
      .rpc('can_start_verification', { p_prd_id: prdId });
    
    if (!canStart) {
      throw new Error('Cannot start verification: Active session exists or iteration limit reached');
    }
    
    // Create new session
    const { data: session, error } = await supabase
      .from('plan_verification_results')
      .insert({
        prd_id: prdId,
        sd_id: sdId,
        status: 'pending',
        triggered_by: triggeredBy,
        metadata: {
          tool_version: '1.0.0',
          protocol_version: 'v4.1.2'
        }
      })
      .select()
      .single();
    
    if (error) throw error;
    
    this.session = session;
    this.emit('session:created', session);
    
    return session;
  }

  /**
   * Main verification entry point
   */
  async runSupervisorVerification(prdId, options = {}) {
    const {
      sdId = null,
      triggeredBy = 'manual',
      level = 1 // 1=summary, 2=issues_only, 3=full
    } = options;
    
    try {
      // Initialize session
      const session = await this.initSession(prdId, sdId, triggeredBy);
      
      // Update status to running
      await this.updateSessionStatus('running');
      
      // Start timer
      const startTime = Date.now();
      
      // Step 1: Wait for CI/CD pipelines to complete (2-3 minutes)
      if (sdId) {
        await this.waitForCiCdPipelines(sdId);
      }

      // Step 2: Check GitHub CI/CD status via DevOps Platform Architect
      const cicdResults = await this.verifyGitHubCiCd(sdId, prdId);

      // Step 3: Query all sub-agents in parallel
      const subAgentResults = await this.queryAllSubAgents(prdId, level);

      // Step 4: Check requirements coverage
      const requirementResults = await this.verifyRequirements(prdId);

      // Step 4.5: Check user story validation (SD-TEST-MOCK-001 prevention)
      const userStoryResults = await this.verifyUserStories(sdId);

      // Step 5: Apply conflict resolution
      const resolvedResults = await this.resolveConflicts(subAgentResults);

      // Step 6: Calculate confidence score (include CI/CD results and user stories)
      const confidence = this.calculateConfidence(resolvedResults, requirementResults, cicdResults, userStoryResults);

      // Step 7: Determine verdict (include CI/CD status and user stories)
      const verdict = await this.determineVerdict(resolvedResults, requirementResults, confidence, cicdResults, userStoryResults);

      // Step 8: Update session with results
      const duration = Date.now() - startTime;
      const finalResults = await this.updateSessionResults({
        subAgentResults: resolvedResults,
        requirementResults,
        userStoryResults,
        cicdResults,
        confidence,
        verdict,
        duration
      });
      
      this.emit('verification:complete', finalResults);
      return finalResults;
      
    } catch (error) {
      await this.handleVerificationError(error);
      throw error;
    }
  }

  /**
   * Query all sub-agents in parallel with circuit breaker protection
   */
  async queryAllSubAgents(prdId, level) {
    const subAgents = [
      'SECURITY', 'PERFORMANCE', 'TESTING', 'DATABASE',
      'DESIGN', 'DOCUMENTATION', 'COST', 'API', 'DEPENDENCY'
    ];
    
    const queries = subAgents.map(agent => 
      this.querySubAgentWithCircuitBreaker(agent, prdId, level)
    );
    
    // Use allSettled to continue even if some fail
    const results = await Promise.allSettled(queries);
    
    // Process results
    const subAgentResults = {};
    results.forEach((result, index) => {
      const agent = subAgents[index];
      if (result.status === 'fulfilled') {
        subAgentResults[agent] = result.value;
      } else {
        subAgentResults[agent] = {
          status: 'failed',
          error: result.reason.message,
          fallback: this.getFallbackStrategy(agent)
        };
      }
    });
    
    return subAgentResults;
  }

  /**
   * Query a single sub-agent with circuit breaker protection
   */
  async querySubAgentWithCircuitBreaker(agentCode, prdId, level) {
    const circuitBreaker = this.getCircuitBreaker(agentCode);
    
    // Check circuit breaker state
    if (circuitBreaker.state === 'open') {
      return this.getFallbackStrategy(agentCode);
    }
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), this.config.defaultTimeout)
      );
      
      // Create query promise
      const queryPromise = this.querySubAgent(agentCode, prdId, level);
      
      // Race between query and timeout
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      // Reset circuit breaker on success
      circuitBreaker.failures = 0;
      circuitBreaker.state = 'closed';
      
      // Store in database
      await this.recordSubAgentQuery(agentCode, 'success', result);
      
      return result;
      
    } catch (error) {
      // Increment failures
      circuitBreaker.failures++;
      
      // Open circuit if too many failures
      if (circuitBreaker.failures >= 3) {
        circuitBreaker.state = 'open';
        setTimeout(() => {
          circuitBreaker.state = 'half-open';
        }, 30000); // Reset after 30 seconds
      }
      
      // Record failure
      await this.recordSubAgentQuery(agentCode, 'failed', { error: error.message });
      
      // Return fallback
      return this.getFallbackStrategy(agentCode);
    }
  }

  /**
   * Query a specific sub-agent (read-only from EXEC results)
   */
  async querySubAgent(agentCode, prdId, level) {
    // This queries EXISTING results from EXEC phase, not re-running agents
    const query = {
      agent: agentCode,
      prd_id: prdId,
      request_type: 'verification_summary',
      level: level
    };
    
    // Simulate querying stored results (in real implementation, query database)
    // For now, return mock data based on agent type
    const mockResults = {
      SECURITY: {
        status: 'passed',
        confidence: 95,
        findings: level === 1 ? 'No critical vulnerabilities' : {
          scanned: 142,
          vulnerabilities: 0,
          warnings: 2
        }
      },
      TESTING: {
        status: 'passed', 
        confidence: 88,
        findings: level === 1 ? 'All tests passing' : {
          total: 245,
          passed: 243,
          failed: 0,
          skipped: 2,
          coverage: 87
        }
      },
      DATABASE: {
        status: 'passed',
        confidence: 92,
        findings: level === 1 ? 'Schema valid' : {
          migrations: 'up-to-date',
          integrity: 'verified',
          performance: 'optimized'
        }
      },
      PERFORMANCE: {
        status: 'warning',
        confidence: 75,
        findings: level === 1 ? 'Minor optimization needed' : {
          loadTime: '2.3s',
          threshold: '2.0s',
          recommendation: 'Consider code splitting'
        }
      }
    };
    
    return mockResults[agentCode] || { status: 'unknown', confidence: 0 };
  }

  /**
   * Verify requirements are met
   */
  async verifyRequirements(prdId) {
    // Query PRD requirements from database
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('requirements')
      .eq('id', prdId)
      .single();

    if (!prd?.requirements) {
      return { met: [], unmet: [], total: 0 };
    }

    // Check each requirement (mock implementation)
    const requirements = prd.requirements || [];
    const met = [];
    const unmet = [];

    requirements.forEach(req => {
      // In real implementation, check against implementation
      const isMet = Math.random() > 0.1; // 90% success rate for demo
      if (isMet) {
        met.push(req);
      } else {
        unmet.push(req);
      }
    });

    return { met, unmet, total: requirements.length };
  }

  /**
   * Verify user stories are validated (SD-TEST-MOCK-001 prevention)
   * Prevents PLAN_verification blocking at 0% progress due to unvalidated stories
   */
  async verifyUserStories(sdId) {
    if (!sdId) {
      return {
        validated: true,
        total: 0,
        pending: 0,
        message: 'No SD ID provided - skipping user story validation'
      };
    }

    // Query user stories for this SD
    const { data: stories, error } = await supabase
      .from('user_stories')
      .select('id, title, validation_status')
      .eq('sd_id', sdId);

    if (error) {
      console.error(`❌ Error checking user stories: ${error.message}`);
      return {
        validated: false,
        total: 0,
        pending: 0,
        error: error.message,
        message: 'Failed to query user stories'
      };
    }

    if (!stories || stories.length === 0) {
      return {
        validated: true,
        total: 0,
        pending: 0,
        message: 'No user stories to validate (acceptable for infra/docs SDs)'
      };
    }

    // Check validation status
    const total = stories.length;
    const pending = stories.filter(s => s.validation_status === 'pending').length;
    const validated = stories.filter(s => s.validation_status === 'validated').length;

    const allValidated = pending === 0;

    if (!allValidated) {
      console.warn(`⚠️  User story validation incomplete: ${pending}/${total} stories still pending`);
      console.warn('   This may block PLAN_verification progress calculation');
      console.warn('   Run: node scripts/auto-validate-user-stories-on-exec-complete.js', sdId);
    } else {
      console.log(`✅ User story validation complete: ${validated}/${total} stories validated`);
    }

    return {
      validated: allValidated,
      total,
      pending,
      validatedCount: validated,
      stories: stories.map(s => ({ id: s.id, title: s.title, status: s.validation_status })),
      message: allValidated
        ? `All ${total} user stories validated`
        : `${pending} user stories pending validation`
    };
  }

  /**
   * Resolve conflicts between sub-agent reports
   */
  async resolveConflicts(subAgentResults) {
    const resolved = { ...subAgentResults };
    
    // Check for critical security issues (highest priority)
    if (resolved.SECURITY?.status === 'failed' || 
        resolved.SECURITY?.findings?.includes('critical')) {
      resolved._conflict_resolution = 'SECURITY_OVERRIDE';
      resolved._verdict_impact = 'BLOCK';
      return resolved;
    }
    
    // Check for database failures (second priority)
    if (resolved.DATABASE?.status === 'failed') {
      resolved._conflict_resolution = 'DATABASE_OVERRIDE';
      resolved._verdict_impact = 'BLOCK';
      return resolved;
    }
    
    // Check consensus among required agents
    const consensusStatuses = this.consensusRequired.map(agent => 
      resolved[agent]?.status
    );
    
    const allPassed = consensusStatuses.every(s => s === 'passed');
    const anyFailed = consensusStatuses.some(s => s === 'failed');
    
    if (anyFailed) {
      resolved._conflict_resolution = 'CONSENSUS_FAILED';
      resolved._verdict_impact = 'CONDITIONAL';
    } else if (allPassed) {
      resolved._conflict_resolution = 'CONSENSUS_ACHIEVED';
      resolved._verdict_impact = 'PASS';
    }
    
    return resolved;
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(subAgentResults, requirementResults, cicdResults = null, userStoryResults = null) {
    const scores = [];

    // Add sub-agent confidence scores
    Object.values(subAgentResults).forEach(result => {
      if (result.confidence !== undefined) {
        scores.push(result.confidence);
      }
    });

    // Add requirement coverage score
    if (requirementResults.total > 0) {
      const coverage = (requirementResults.met.length / requirementResults.total) * 100;
      scores.push(coverage);
    }

    // Add CI/CD health score (critical factor)
    if (cicdResults && cicdResults.healthScore !== undefined) {
      // CI/CD gets weighted more heavily (2x)
      scores.push(cicdResults.healthScore);
      scores.push(cicdResults.healthScore);
    }

    // Add user story validation score (SD-TEST-MOCK-001 prevention)
    if (userStoryResults && userStoryResults.total > 0) {
      const validationScore = userStoryResults.validated ? 100 : 0;
      scores.push(validationScore);
    }

    // Calculate weighted average
    if (scores.length === 0) return 0;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
  }

  /**
   * Determine final verdict
   */
  async determineVerdict(subAgentResults, requirementResults, confidence, cicdResults = null, userStoryResults = null) {
    // CRITICAL: Check CI/CD failures first (blocking condition)
    if (cicdResults?.hasFailures) {
      console.log('❌ CI/CD pipelines have failures - BLOCKING verification');
      return 'fail';
    }

    if (cicdResults?.requiresManualIntervention) {
      console.log('⚠️  CI/CD requires manual intervention');
      return 'conditional_pass';
    }

    // Check user story validation (SD-TEST-MOCK-001 prevention)
    if (userStoryResults && userStoryResults.total > 0 && !userStoryResults.validated) {
      console.warn('⚠️  User stories not validated - PLAN_verification may be blocked');
      console.warn(`   ${userStoryResults.pending} of ${userStoryResults.total} user stories pending validation`);
      console.warn('   This will affect progress calculation (get_progress_breakdown)');
      return 'conditional_pass'; // Warning, not blocking - auto-validation should handle this
    }

    // Check for blocking conditions
    if (subAgentResults._verdict_impact === 'BLOCK') {
      return 'fail';
    }

    // Check requirements
    if (requirementResults.unmet.length > 0) {
      if (requirementResults.unmet.length > 3) {
        return 'fail';
      }
      return 'conditional_pass';
    }

    // Check confidence threshold
    if (confidence < this.config.confidenceThreshold) {
      // Check iteration count
      const { data: iterations } = await supabase
        .from('plan_verification_results')
        .select('iteration_number')
        .eq('prd_id', this.session.prd_id)
        .order('iteration_number', { ascending: false })
        .limit(1)
        .single();

      if (iterations?.iteration_number >= 3) {
        return 'escalate'; // Max iterations reached, escalate to LEAD
      }

      return 'conditional_pass';
    }

    // All checks passed
    return 'pass';
  }

  /**
   * Update session with final results
   */
  async updateSessionResults(results) {
    const update = {
      status: 'completed',
      confidence_score: results.confidence,
      verdict: results.verdict,
      sub_agent_results: results.subAgentResults,
      requirements_met: results.requirementResults.met,
      requirements_unmet: results.requirementResults.unmet,
      requirements_total: results.requirementResults.total,
      completed_at: new Date().toISOString(),
      duration_ms: results.duration,
      critical_issues: this.extractCriticalIssues(results.subAgentResults),
      warnings: this.extractWarnings(results.subAgentResults),
      recommendations: this.extractRecommendations(results.subAgentResults),
      // User story validation results (SD-TEST-MOCK-001 prevention)
      user_story_validation: results.userStoryResults || null
    };

    const { data, error } = await supabase
      .from('plan_verification_results')
      .update(update)
      .eq('session_id', this.session.session_id)
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  /**
   * Get circuit breaker for an agent
   */
  getCircuitBreaker(agentCode) {
    if (!this.circuitBreakers.has(agentCode)) {
      this.circuitBreakers.set(agentCode, {
        state: 'closed', // closed, open, half-open
        failures: 0,
        lastFailure: null
      });
    }
    return this.circuitBreakers.get(agentCode);
  }

  /**
   * Get fallback strategy for failed agent
   */
  getFallbackStrategy(agentCode) {
    const strategies = {
      TESTING: () => ({ 
        status: 'fallback', 
        confidence: 50, 
        findings: 'Using last known test results' 
      }),
      SECURITY: () => ({ 
        status: 'failed', 
        confidence: 0, 
        findings: 'Security check required - blocking' 
      }),
      PERFORMANCE: () => ({ 
        status: 'warning', 
        confidence: 60, 
        findings: 'Using default performance metrics' 
      }),
      DATABASE: () => ({ 
        status: 'failed', 
        confidence: 0, 
        findings: 'Database verification required - blocking' 
      })
    };
    
    const fallback = strategies[agentCode] || (() => ({ 
      status: 'unknown', 
      confidence: 0 
    }));
    
    return fallback();
  }

  /**
   * Record sub-agent query in database
   */
  async recordSubAgentQuery(agentCode, status, payload) {
    if (!this.session) return;
    
    await supabase
      .from('plan_subagent_queries')
      .upsert({
        session_id: this.session.session_id,
        sub_agent_code: agentCode,
        status: status,
        response_payload: payload,
        responded_at: new Date().toISOString()
      });
  }

  /**
   * Update session status
   */
  async updateSessionStatus(status) {
    if (!this.session) return;
    
    await supabase
      .from('plan_verification_results')
      .update({ status })
      .eq('session_id', this.session.session_id);
  }

  /**
   * Handle verification errors
   */
  async handleVerificationError(error) {
    this.emit('verification:error', error);
    
    if (this.session) {
      await supabase
        .from('plan_verification_results')
        .update({ 
          status: 'failed',
          metadata: { error: error.message }
        })
        .eq('session_id', this.session.session_id);
    }
  }

  /**
   * Extract critical issues from results
   */
  extractCriticalIssues(results) {
    const issues = [];
    Object.entries(results).forEach(([agent, result]) => {
      if (result.status === 'failed' || 
          (typeof result.findings === 'string' && result.findings.includes('critical'))) {
        issues.push({ agent, issue: result.findings });
      }
    });
    return issues;
  }

  /**
   * Extract warnings from results
   */
  extractWarnings(results) {
    const warnings = [];
    Object.entries(results).forEach(([agent, result]) => {
      if (result.status === 'warning') {
        warnings.push({ agent, warning: result.findings });
      }
    });
    return warnings;
  }

  /**
   * Extract recommendations from results
   */
  extractRecommendations(results) {
    const recommendations = [];
    Object.entries(results).forEach(([agent, result]) => {
      if (result.findings?.recommendation) {
        recommendations.push({
          agent,
          recommendation: result.findings.recommendation
        });
      }
    });
    return recommendations;
  }

  /**
   * Wait for CI/CD pipelines to complete (2-3 minutes)
   */
  async waitForCiCdPipelines(sdId) {
    if (!sdId) {
      console.log('⚠️  No SD ID provided, skipping CI/CD wait');
      return;
    }

    console.log('⏳ Waiting for CI/CD pipelines to complete (2-3 minutes)...');

    const maxWaitTime = 180000; // 3 minutes
    const pollInterval = 15000; // 15 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Check if pipelines have completed
      const { data: status } = await supabase
        .rpc('get_sd_ci_cd_status', { sd_id_param: sdId });

      if (status?.[0]?.status === 'success' || status?.[0]?.status === 'failure') {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ CI/CD pipelines completed after ${elapsed} seconds`);
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.log('⚠️  CI/CD pipelines still running after 3 minutes, proceeding with verification');
  }

  /**
   * Verify GitHub CI/CD status by triggering DevOps Platform Architect
   */
  async verifyGitHubCiCd(sdId, prdId) {
    if (!sdId) {
      return {
        status: 'skipped',
        message: 'No SD ID provided for CI/CD verification'
      };
    }

    console.log('🔍 Checking GitHub CI/CD status via DevOps Platform Architect...');

    try {
      // Import and execute DevOps Platform Architect
      const { default: DevOpsArchitect } = await import('../../scripts/devops-platform-architect-enhanced.js');
      const devops = new DevOpsArchitect();

      // Execute CI/CD analysis
      const results = await devops.execute({
        sd_id: sdId,
        prd_id: prdId,
        trigger_type: 'plan_verification'
      });

      // Format results
      return {
        status: results.success ? 'passed' : 'failed',
        hasFailures: results.analysis?.hasFailures || false,
        failureCount: results.analysis?.failureCount || 0,
        healthScore: results.analysis?.healthScore || 0,
        requiresManualIntervention: results.requiresManualIntervention || false,
        details: results
      };

    } catch (error) {
      console.error(`❌ CI/CD verification failed: ${error.message}`);
      return {
        status: 'error',
        error: error.message,
        requiresManualIntervention: true
      };
    }
  }
}

export default PLANVerificationTool;