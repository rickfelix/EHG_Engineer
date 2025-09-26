#!/usr/bin/env node

/**
 * LEAD Codebase Validation Script
 * Performs comprehensive codebase conflict analysis before SD/PRD implementation
 * Part of LEO Protocol v4.2.0 - Validation Sub-Agent
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SubAgentSummary } from './subagent-context-distillation.js';
import { AgentEventBus, EventTypes, Priority } from './agent-event-system.js';
import { SDOverlapDetector } from './sd-overlap-detector.js';

config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class CodebaseValidator {
  constructor(sdId, prdId) {
    this.sdId = sdId;
    this.prdId = prdId;
    this.projectRoot = process.cwd();
    this.summary = new SubAgentSummary('VALIDATION', sdId, prdId);
    this.eventBus = new AgentEventBus('VALIDATION');
    this.validationResults = {
      validation_id: `VAL-${Date.now()}`,
      sd_id: sdId,
      prd_id: prdId,
      validation_timestamp: new Date().toISOString(),
      codebase_analysis: {
        existing_implementations: {
          found: false,
          locations: [],
          similarity_score: 0,
          recommendation: 'PROCEED_NEW'
        },
        conflicts: {
          adjacent_features: [],
          severity: 'NONE',
          resolution_required: false
        },
        dependencies: {
          affected_count: 0,
          breaking_changes: [],
          risk_level: 'NONE'
        },
        architecture: {
          compatibility: 'ALIGNED',
          violations: [],
          refactoring_needed: false
        }
      },
      human_review_required: false,
      human_review_reasons: [],
      approval_recommendation: 'APPROVED',
      recommended_actions: []
    };
  }

  async validate() {
    console.log('\n🔍 CODEBASE VALIDATION SUB-AGENT ACTIVATED');
    console.log('═'.repeat(60));
    console.log(`SD ID: ${this.sdId || 'N/A'}`);
    console.log(`PRD ID: ${this.prdId || 'N/A'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('═'.repeat(60));

    // Broadcast validation start
    await this.eventBus.publish(
      EventTypes.ANALYSIS_START,
      'Starting codebase validation',
      {
        sdId: this.sdId,
        prdId: this.prdId,
        phases: ['Existing Implementation', 'Conflict Detection', 'Dependency Assessment', 'Architecture Alignment']
      },
      {
        sdId: this.sdId,
        prdId: this.prdId,
        phase: 'VALIDATION',
        targetAgents: ['LEAD', 'PLAN']
      }
    );

    try {
      // Check for cached results first
      const cachedResult = await this.summary.getCachedResult('full_validation');
      if (cachedResult) {
        console.log('✅ Using cached validation results');
        return cachedResult;
      }

      // Get context from previous agents
      const previousContext = await this.summary.getContextFromAgents(['SECURITY', 'DATABASE']);
      if (previousContext && previousContext.criticalFlags.length > 0) {
        console.log('⚠️  Previous agents reported critical flags:');
        previousContext.criticalFlags.forEach(flag => console.log(`   • ${flag}`));
      }

      // Fetch SD and PRD details
      const { sd, prd } = await this.fetchDocuments();

      // Phase 1: Existing Implementation Check
      console.log('\n📋 PHASE 1: Existing Implementation Check');
      console.log('-'.repeat(40));
      const checkpointId = await this.eventBus.createCheckpoint(
        { phase: 1, progress: 'starting' },
        'Phase 1 checkpoint'
      );
      await this.checkExistingImplementations(sd, prd);

      // Phase 2: Adjacent Feature Conflict Detection
      console.log('\n📋 PHASE 2: Adjacent Feature Conflict Detection');
      console.log('-'.repeat(40));
      await this.detectAdjacentConflicts(sd, prd);

      // Phase 3: Dependency Impact Assessment
      console.log('\n📋 PHASE 3: Dependency Impact Assessment');
      console.log('-'.repeat(40));
      await this.assessDependencyImpact(sd, prd);

      // Phase 4: Code Pattern and Architecture Alignment
      console.log('\n📋 PHASE 4: Architecture Alignment Check');
      console.log('-'.repeat(40));
      await this.checkArchitectureAlignment(sd, prd);

      // Phase 5: SD Overlap Detection (NEW)
      console.log('\n📋 PHASE 5: Strategic Directive Overlap Detection');
      console.log('-'.repeat(40));
      await this.checkSDOverlaps(sd, prd);

      // Determine final recommendation
      this.determineRecommendation();

      // Generate context summary
      await this.generateContextSummary();

      // Display and save results
      await this.displayResults();
      await this.saveResults();

      // Cache the results
      await this.summary.cacheResult('full_validation', this.validationResults, 1800); // 30 min cache

      // Save handoff summary for next agents
      await this.summary.saveHandoff(null, 'VALIDATION_COMPLETE');

      // Broadcast completion event via EventBus
      await this.eventBus.publish(
        EventTypes.ANALYSIS_COMPLETE,
        'Codebase validation completed',
        {
          recommendation: this.validationResults.approval_recommendation,
          humanReviewRequired: this.validationResults.human_review_required,
          findings: this.validationResults.codebase_analysis
        },
        {
          sdId: this.sdId,
          prdId: this.prdId,
          priority: this.validationResults.human_review_required ? Priority.HIGH : Priority.MEDIUM,
          targetAgents: ['LEAD', 'PLAN', 'SECURITY', 'TESTING'],
          requiresAck: this.validationResults.human_review_required
        }
      );

      // If human review required, broadcast specific event
      if (this.validationResults.human_review_required) {
        await this.eventBus.publish(
          EventTypes.HUMAN_REVIEW_REQUIRED,
          `Validation blocked: ${this.validationResults.human_review_reasons.join(', ')}`,
          this.validationResults,
          {
            priority: Priority.CRITICAL,
            targetAgents: ['LEAD']
          }
        );
      }

      return this.validationResults;

    } catch (error) {
      console.error('❌ Validation error:', error.message);
      this.validationResults.approval_recommendation = 'BLOCKED';
      this.validationResults.human_review_required = true;
      this.validationResults.human_review_reasons.push(`Validation error: ${error.message}`);
      await this.saveResults();
      throw error;
    }
  }

  async fetchDocuments() {
    let sd = null;
    let prd = null;

    if (this.sdId) {
      const { data } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', this.sdId)
        .single();
      sd = data;
    }

    if (this.prdId) {
      const { data } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', this.prdId)
        .single();
      prd = data;
    }

    return { sd, prd };
  }

  async checkExistingImplementations(sd, prd) {
    const searchTerms = this.extractSearchTerms(sd, prd);
    console.log(`🔎 Searching for: ${searchTerms.join(', ')}`);

    const locations = [];
    let similarityScore = 0;

    for (const term of searchTerms) {
      try {
        // Search for term in codebase
        const { stdout } = await execAsync(
          `grep -r "${term}" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.css" --exclude-dir=node_modules --exclude-dir=.git -l | head -20`,
          { cwd: this.projectRoot }
        );

        if (stdout) {
          const files = stdout.split('\n').filter(f => f);
          for (const file of files) {
            // Get context around the match
            const { stdout: context } = await execAsync(
              `grep -C 2 "${term}" "${file}" | head -10`,
              { cwd: this.projectRoot }
            );

            locations.push({
              file: file,
              term: term,
              context: context.substring(0, 200)
            });

            similarityScore += 10;
          }
        }
      } catch (error) {
        // Grep returns error if no matches found, which is fine
      }
    }

    // Check for similar feature names in database
    const { data: similarSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, description')
      .neq('id', this.sdId || 'none')
      .or(`title.ilike.%${searchTerms[0]}%,description.ilike.%${searchTerms[0]}%`);

    if (similarSDs && similarSDs.length > 0) {
      similarityScore += similarSDs.length * 20;
      similarSDs.forEach(sd => {
        locations.push({
          type: 'database',
          sd_id: sd.id,
          title: sd.title,
          similarity: 'title/description match'
        });
      });
    }

    // Update results
    this.validationResults.codebase_analysis.existing_implementations = {
      found: locations.length > 0,
      locations: locations.slice(0, 10), // Limit to top 10
      similarity_score: Math.min(100, similarityScore),
      recommendation: similarityScore > 70 ? 'USE_EXISTING' :
                      similarityScore > 30 ? 'ENHANCE_EXISTING' :
                      'PROCEED_NEW'
    };

    if (similarityScore > 70) {
      this.validationResults.human_review_required = true;
      this.validationResults.human_review_reasons.push(
        `High similarity score (${similarityScore}%) - possible duplicate implementation`
      );

      // Publish finding event
      await this.eventBus.publish(
        EventTypes.FINDING_DETECTED,
        `High similarity implementation found (${similarityScore}%)`,
        {
          type: 'duplicate_implementation',
          similarityScore,
          locations: locations.slice(0, 5),
          recommendation: this.validationResults.codebase_analysis.existing_implementations.recommendation
        },
        {
          sdId: this.sdId,
          prdId: this.prdId,
          priority: Priority.HIGH,
          targetAgents: ['LEAD', 'PLAN']
        }
      );
    }

    console.log(`✅ Found ${locations.length} potential matches`);
    console.log(`📊 Similarity score: ${similarityScore}%`);
  }

  async detectAdjacentConflicts(sd, prd) {
    const conflicts = [];
    const affectedComponents = [];

    // Check for UI component conflicts if this is a UI change
    if (this.isUIChange(sd, prd)) {
      const uiFiles = await this.findUIFiles();

      for (const file of uiFiles.slice(0, 20)) {
        const content = await fs.readFile(file, 'utf8').catch(() => '');

        // Check for components that might conflict
        if (content.includes('Dashboard') && prd?.title?.includes('Dashboard')) {
          conflicts.push({
            type: 'UI_OVERLAP',
            file: file,
            description: 'Existing dashboard component may conflict'
          });
        }
      }
    }

    // Check for API endpoint conflicts
    if (this.isAPIChange(sd, prd)) {
      const apiFiles = await this.findAPIFiles();

      for (const file of apiFiles.slice(0, 20)) {
        affectedComponents.push({
          type: 'API',
          file: file,
          impact: 'May need updates to maintain compatibility'
        });
      }
    }

    // Determine severity
    const severity = conflicts.length > 5 ? 'HIGH' :
                    conflicts.length > 2 ? 'MEDIUM' :
                    conflicts.length > 0 ? 'LOW' : 'NONE';

    this.validationResults.codebase_analysis.conflicts = {
      adjacent_features: conflicts.slice(0, 10),
      severity: severity,
      resolution_required: severity === 'HIGH' || severity === 'BLOCKING'
    };

    if (severity === 'HIGH') {
      this.validationResults.human_review_required = true;
      this.validationResults.human_review_reasons.push(
        `High severity conflicts detected (${conflicts.length} conflicts)`
      );

      // Publish conflict finding
      await this.eventBus.publish(
        EventTypes.FINDING_DETECTED,
        `High severity conflicts detected`,
        {
          type: 'adjacent_conflicts',
          conflicts: conflicts.slice(0, 5),
          severity,
          resolutionRequired: true
        },
        {
          sdId: this.sdId,
          prdId: this.prdId,
          priority: Priority.HIGH,
          targetAgents: ['LEAD', 'PLAN', 'SECURITY']
        }
      );
    }

    console.log(`✅ Found ${conflicts.length} potential conflicts`);
    console.log(`⚠️  Severity: ${severity}`);
  }

  async assessDependencyImpact(sd, prd) {
    const dependencies = [];
    const breakingChanges = [];

    // Check package.json for relevant dependencies
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8')
      );

      // Check if we're modifying core dependencies
      if (this.affectsReact(sd, prd) && packageJson.dependencies?.react) {
        dependencies.push({
          name: 'react',
          version: packageJson.dependencies.react,
          impact: 'Core framework - changes affect entire application'
        });
      }

      if (this.affectsDatabase(sd, prd) && packageJson.dependencies?.['@supabase/supabase-js']) {
        dependencies.push({
          name: '@supabase/supabase-js',
          version: packageJson.dependencies['@supabase/supabase-js'],
          impact: 'Database client - schema changes may be needed'
        });
      }
    } catch (error) {
      console.log('⚠️  Could not analyze package.json');
    }

    // Check for database schema conflicts
    if (this.affectsDatabase(sd, prd)) {
      let tables = [];
      try {
        const { data } = await supabase.rpc('get_table_names');
        tables = data || [];
      } catch (error) {
        // RPC might not exist, try alternative query
        try {
          const { data } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');
          tables = data || [];
        } catch {
          // Can't get table list, continue anyway
          tables = [];
        }
      }

      if (tables && tables.length > 0) {
        // Check if PRD mentions any existing tables
        const prdText = `${prd?.title || ''} ${prd?.description || ''}`.toLowerCase();
        tables.forEach(table => {
          if (prdText.includes(table.table_name)) {
            dependencies.push({
              type: 'database',
              table: table.table_name,
              impact: 'Existing table may need migration'
            });
          }
        });
      }
    }

    // Determine risk level
    const riskLevel = breakingChanges.length > 0 ? 'SEVERE' :
                     dependencies.length > 5 ? 'MODERATE' :
                     dependencies.length > 2 ? 'MINIMAL' : 'NONE';

    this.validationResults.codebase_analysis.dependencies = {
      affected_count: dependencies.length,
      breaking_changes: breakingChanges,
      risk_level: riskLevel
    };

    if (riskLevel === 'SEVERE' || riskLevel === 'MODERATE') {
      this.validationResults.human_review_required = true;
      this.validationResults.human_review_reasons.push(
        `${riskLevel} dependency risk - ${dependencies.length} dependencies affected`
      );
    }

    console.log(`✅ ${dependencies.length} dependencies affected`);
    console.log(`⚠️  Risk level: ${riskLevel}`);
  }

  async checkArchitectureAlignment(sd, prd) {
    const violations = [];

    // Check for common architectural patterns
    const patterns = {
      'database-first': await this.checkDatabaseFirst(),
      'component-structure': await this.checkComponentStructure(),
      'naming-conventions': await this.checkNamingConventions(sd, prd)
    };

    for (const [pattern, result] of Object.entries(patterns)) {
      if (!result.aligned) {
        violations.push({
          pattern: pattern,
          issue: result.issue,
          recommendation: result.recommendation
        });
      }
    }

    const compatibility = violations.length === 0 ? 'ALIGNED' :
                         violations.length <= 2 ? 'MINOR_DEVIATION' :
                         'MAJOR_CONFLICT';

    this.validationResults.codebase_analysis.architecture = {
      compatibility: compatibility,
      violations: violations,
      refactoring_needed: compatibility === 'MAJOR_CONFLICT'
    };

    if (compatibility === 'MAJOR_CONFLICT') {
      this.validationResults.human_review_required = true;
      this.validationResults.human_review_reasons.push(
        `Major architectural conflicts detected (${violations.length} violations)`
      );
    }

    console.log(`✅ Architecture compatibility: ${compatibility}`);
    console.log(`📐 ${violations.length} violations found`);
  }

  // Helper methods
  extractSearchTerms(sd, prd) {
    const terms = [];

    if (sd?.title) {
      terms.push(...sd.title.toLowerCase().split(' ').filter(t => t.length > 3));
    }

    if (prd?.title) {
      terms.push(...prd.title.toLowerCase().split(' ').filter(t => t.length > 3));
    }

    // Extract key technical terms
    const text = `${sd?.description || ''} ${prd?.functional_requirements || ''}`;
    const technicalTerms = text.match(/\b(component|service|api|endpoint|table|schema|interface|dashboard|page|feature)\w*/gi);
    if (technicalTerms) {
      terms.push(...technicalTerms.slice(0, 5));
    }

    return [...new Set(terms)].slice(0, 10); // Unique terms, max 10
  }

  isUIChange(sd, prd) {
    const text = `${sd?.title || ''} ${sd?.description || ''} ${prd?.title || ''} ${prd?.description || ''}`.toLowerCase();
    return /ui|interface|frontend|component|page|screen|dashboard|view/.test(text);
  }

  isAPIChange(sd, prd) {
    const text = `${sd?.title || ''} ${sd?.description || ''} ${prd?.title || ''} ${prd?.description || ''}`.toLowerCase();
    return /api|endpoint|route|rest|graphql|webhook/.test(text);
  }

  affectsReact(sd, prd) {
    const text = `${sd?.title || ''} ${prd?.title || ''}`.toLowerCase();
    return /react|component|jsx|tsx/.test(text) || this.isUIChange(sd, prd);
  }

  affectsDatabase(sd, prd) {
    const text = `${sd?.title || ''} ${sd?.description || ''} ${prd?.title || ''} ${prd?.description || ''}`.toLowerCase();
    return /database|table|schema|migration|supabase|sql|query/.test(text);
  }

  async findUIFiles() {
    try {
      const { stdout } = await execAsync(
        `find . -type f \\( -name "*.jsx" -o -name "*.tsx" \\) -not -path "./node_modules/*" | head -50`,
        { cwd: this.projectRoot }
      );
      return stdout.split('\n').filter(f => f);
    } catch {
      return [];
    }
  }

  async findAPIFiles() {
    try {
      const { stdout } = await execAsync(
        `find . -type f -path "*/api/*" -name "*.js" -o -name "*.ts" -not -path "./node_modules/*" | head -50`,
        { cwd: this.projectRoot }
      );
      return stdout.split('\n').filter(f => f);
    } catch {
      return [];
    }
  }

  async checkDatabaseFirst() {
    // Check if using database-first approach (LEO Protocol standard)
    const hasMigrations = await fs.access(path.join(this.projectRoot, 'database/migrations'))
      .then(() => true)
      .catch(() => false);

    return {
      aligned: hasMigrations,
      issue: hasMigrations ? null : 'No database migrations folder found',
      recommendation: 'Ensure database changes use migration scripts'
    };
  }

  async checkComponentStructure() {
    // Check if components follow expected structure
    const hasComponents = await fs.access(path.join(this.projectRoot, 'src/client/src/components'))
      .then(() => true)
      .catch(() => false);

    return {
      aligned: hasComponents,
      issue: hasComponents ? null : 'Non-standard component structure',
      recommendation: 'Follow existing component organization patterns'
    };
  }

  async checkNamingConventions(sd, prd) {
    // Check if naming follows conventions
    const title = prd?.title || sd?.title || '';
    const hasProperNaming = /^[A-Z]/.test(title) && !/_/.test(title);

    return {
      aligned: hasProperNaming,
      issue: hasProperNaming ? null : 'Naming convention violation',
      recommendation: 'Use PascalCase for components, camelCase for functions'
    };
  }

  async checkSDOverlaps(sd, prd) {
    if (!sd) {
      console.log('⚠️  No SD provided, skipping overlap detection');
      return;
    }

    try {
      const detector = new SDOverlapDetector();

      // Get other active SDs
      const { data: otherSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, description, status, priority')
        .neq('id', sd.id)
        .in('status', ['draft', 'active', 'in_progress']);

      if (!otherSDs || otherSDs.length === 0) {
        console.log('✅ No other active SDs to check for overlaps');
        return;
      }

      console.log(`🔎 Checking overlaps with ${otherSDs.length} other SDs...`);

      const overlaps = [];
      let highOverlapCount = 0;
      let criticalOverlaps = [];

      // Check overlap with each other SD
      for (const otherSD of otherSDs) {
        const overlap = await detector.analyzePair(sd, otherSD);

        if (overlap && overlap.overlap_score > 20) {
          overlaps.push(overlap);

          if (overlap.overlap_score >= 70) {
            highOverlapCount++;
            criticalOverlaps.push({
              sd_key: otherSD.sd_key,
              title: otherSD.title,
              score: overlap.overlap_score,
              recommendation: overlap.recommendation
            });
          }
        }
      }

      // Update validation results with overlap information
      if (!this.validationResults.codebase_analysis.sd_overlaps) {
        this.validationResults.codebase_analysis.sd_overlaps = {
          checked: true,
          overlap_count: overlaps.length,
          high_overlap_count: highOverlapCount,
          critical_overlaps: criticalOverlaps,
          recommendation: 'NO_ACTION'
        };
      }

      // Determine impact on validation
      if (highOverlapCount > 0) {
        this.validationResults.human_review_required = true;
        this.validationResults.human_review_reasons.push(
          `Critical SD overlap detected with ${highOverlapCount} other directive(s)`
        );

        this.validationResults.codebase_analysis.sd_overlaps.recommendation = 'CONSOLIDATE_OR_SEQUENCE';

        // Add specific recommendations
        for (const critical of criticalOverlaps) {
          this.validationResults.recommended_actions.push(
            `Review overlap with ${critical.sd_key} (${critical.score}% similarity) - ${critical.recommendation}`
          );
        }

        // Publish critical overlap event
        await this.eventBus.publish(
          EventTypes.FINDING_DETECTED,
          `Critical SD overlap detected: ${sd.sd_key} overlaps with ${highOverlapCount} SDs`,
          {
            type: 'sd_overlap',
            sd_key: sd.sd_key,
            overlaps: criticalOverlaps,
            recommendation: 'CONSOLIDATE_OR_SEQUENCE'
          },
          {
            sdId: this.sdId,
            prdId: this.prdId,
            priority: Priority.HIGH,
            targetAgents: ['LEAD'],
            requiresAck: true
          }
        );
      }

      console.log(`✅ Overlap check complete: ${overlaps.length} overlaps found, ${highOverlapCount} critical`);

      // Add findings to summary
      if (overlaps.length > 0) {
        this.summary.addFinding(
          `SD overlaps detected: ${overlaps.length} total, ${highOverlapCount} critical`,
          highOverlapCount > 0 ? 10 : 5
        );

        if (highOverlapCount > 0) {
          this.summary.addCriticalFlag('CRITICAL_SD_OVERLAP');
        }
      }

    } catch (error) {
      console.error(`⚠️  SD overlap detection failed: ${error.message}`);
      // Non-fatal error - continue validation
    }
  }

  async generateContextSummary() {
    const analysis = this.validationResults.codebase_analysis;

    // Add key findings to summary
    if (analysis.existing_implementations.found) {
      this.summary.addFinding(
        `Found existing implementation with ${analysis.existing_implementations.similarity_score}% similarity`,
        10 // High importance
      );
      this.summary.addCriticalFlag('DUPLICATE_IMPLEMENTATION_DETECTED');
    }

    if (analysis.conflicts.severity === 'HIGH' || analysis.conflicts.severity === 'BLOCKING') {
      this.summary.addFinding(
        `${analysis.conflicts.severity} severity conflicts detected`,
        9
      );
      this.summary.addCriticalFlag('HIGH_SEVERITY_CONFLICTS');
    }

    if (analysis.dependencies.risk_level === 'SEVERE') {
      this.summary.addFinding(
        `Severe dependency risks: ${analysis.dependencies.breaking_changes.length} breaking changes`,
        8
      );
    }

    // Add recommendations for other agents
    if (analysis.existing_implementations.similarity_score > 50) {
      this.summary.addRecommendation('TESTING',
        'Check test coverage of existing similar implementation');
      this.summary.addRecommendation('SECURITY',
        'Review security of existing implementation before enhancing');
    }

    if (analysis.dependencies.affected_count > 0) {
      this.summary.addRecommendation('DATABASE',
        `Review ${analysis.dependencies.affected_count} affected dependencies`);
    }

    // Set confidence score
    const confidence = this.validationResults.approval_recommendation === 'BLOCKED' ? 0.9 :
                      this.validationResults.approval_recommendation === 'CONDITIONAL' ? 0.6 :
                      0.3;
    this.summary.setConfidence(confidence);

    // Add to knowledge base if significant finding
    if (analysis.existing_implementations.similarity_score > 70) {
      await this.summary.addToKnowledgeBase(
        'High Similarity Implementation Pattern',
        {
          pattern: analysis.existing_implementations.locations.slice(0, 5),
          similarity: analysis.existing_implementations.similarity_score,
          recommendation: analysis.existing_implementations.recommendation
        },
        'pattern',
        ['duplicate', 'implementation', 'validation']
      );
    }
  }

  determineRecommendation() {
    const analysis = this.validationResults.codebase_analysis;

    // Block if high similarity or severe conflicts
    if (analysis.existing_implementations.similarity_score > 70) {
      this.validationResults.approval_recommendation = 'BLOCKED';
      this.validationResults.recommended_actions.push(
        'Review existing implementation and consider enhancing instead of duplicating'
      );
    } else if (analysis.conflicts.severity === 'HIGH' || analysis.conflicts.severity === 'BLOCKING') {
      this.validationResults.approval_recommendation = 'BLOCKED';
      this.validationResults.recommended_actions.push(
        'Resolve conflicts with adjacent features before proceeding'
      );
    } else if (analysis.dependencies.risk_level === 'SEVERE') {
      this.validationResults.approval_recommendation = 'BLOCKED';
      this.validationResults.recommended_actions.push(
        'Address breaking dependency changes before implementation'
      );
    } else if (analysis.architecture.compatibility === 'MAJOR_CONFLICT') {
      this.validationResults.approval_recommendation = 'CONDITIONAL';
      this.validationResults.recommended_actions.push(
        'Refactor to align with architectural patterns'
      );
    } else if (this.validationResults.human_review_required) {
      this.validationResults.approval_recommendation = 'CONDITIONAL';
      this.validationResults.recommended_actions.push(
        'Human review required for identified concerns'
      );
    } else {
      this.validationResults.approval_recommendation = 'APPROVED';
      this.validationResults.recommended_actions.push(
        'No conflicts detected - proceed with implementation'
      );
    }
  }

  async displayResults() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 VALIDATION RESULTS');
    console.log('═'.repeat(60));

    const analysis = this.validationResults.codebase_analysis;

    console.log('\n1️⃣  EXISTING IMPLEMENTATIONS');
    console.log(`   Found: ${analysis.existing_implementations.found ? 'YES' : 'NO'}`);
    console.log(`   Similarity: ${analysis.existing_implementations.similarity_score}%`);
    console.log(`   Recommendation: ${analysis.existing_implementations.recommendation}`);

    console.log('\n2️⃣  ADJACENT CONFLICTS');
    console.log(`   Severity: ${analysis.conflicts.severity}`);
    console.log(`   Resolution Required: ${analysis.conflicts.resolution_required ? 'YES' : 'NO'}`);

    console.log('\n3️⃣  DEPENDENCIES');
    console.log(`   Affected: ${analysis.dependencies.affected_count}`);
    console.log(`   Risk Level: ${analysis.dependencies.risk_level}`);

    console.log('\n4️⃣  ARCHITECTURE');
    console.log(`   Compatibility: ${analysis.architecture.compatibility}`);
    console.log(`   Refactoring Needed: ${analysis.architecture.refactoring_needed ? 'YES' : 'NO'}`);

    console.log('\n' + '═'.repeat(60));
    console.log(`🎯 RECOMMENDATION: ${this.validationResults.approval_recommendation}`);
    console.log(`👤 HUMAN REVIEW: ${this.validationResults.human_review_required ? 'REQUIRED' : 'NOT REQUIRED'}`);

    if (this.validationResults.human_review_reasons.length > 0) {
      console.log('\n⚠️  REVIEW REASONS:');
      this.validationResults.human_review_reasons.forEach(reason => {
        console.log(`   • ${reason}`);
      });
    }

    if (this.validationResults.recommended_actions.length > 0) {
      console.log('\n📋 RECOMMENDED ACTIONS:');
      this.validationResults.recommended_actions.forEach(action => {
        console.log(`   • ${action}`);
      });
    }

    console.log('═'.repeat(60));
  }

  async saveResults() {
    try {
      const { error } = await supabase
        .from('leo_codebase_validations')
        .insert({
          sd_id: this.sdId,
          prd_id: this.prdId,
          validation_timestamp: this.validationResults.validation_timestamp,
          codebase_analysis: this.validationResults.codebase_analysis,
          human_review_required: this.validationResults.human_review_required,
          human_review_reasons: this.validationResults.human_review_reasons,
          approval_recommendation: this.validationResults.approval_recommendation,
          recommended_actions: this.validationResults.recommended_actions,
          validated_by: 'LEAD'
        });

      if (error) {
        console.error('⚠️  Failed to save validation results:', error.message);
      } else {
        console.log('✅ Validation results saved to database');
      }
    } catch (error) {
      console.error('⚠️  Error saving results:', error.message);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let sdId = null;
  let prdId = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sd-id' && args[i + 1]) {
      sdId = args[i + 1];
    }
    if (args[i] === '--prd-id' && args[i + 1]) {
      prdId = args[i + 1];
    }
  }

  if (!sdId && !prdId) {
    console.error('❌ Error: Please provide --sd-id or --prd-id');
    console.log('Usage: node lead-codebase-validation.js --sd-id <SD_ID> --prd-id <PRD_ID>');
    process.exit(1);
  }

  const validator = new CodebaseValidator(sdId, prdId);
  const results = await validator.validate();

  // Exit with appropriate code
  if (results.approval_recommendation === 'BLOCKED') {
    process.exit(1);
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { CodebaseValidator };
export default CodebaseValidator;