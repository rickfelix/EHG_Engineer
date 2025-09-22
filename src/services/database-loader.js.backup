/**
 * Database Loader Module
 * Loads Strategic Directives and PRDs from Supabase
 * Database-first approach for consistency and control
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import StatusValidator from './status-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../..', '.env') });
import ProgressCalculator from './progress-calculator.js';

class DatabaseLoader {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
    this.statusValidator = new StatusValidator();
    this.progressCalculator = new ProgressCalculator();
    this.initializeSupabase();
  }

  initializeSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey || 
        supabaseUrl === 'your_supabase_url_here' || 
        supabaseKey === 'your_supabase_anon_key_here') {
      console.log('⚠️  Supabase not configured - falling back to file system');
      this.isConnected = false;
      return;
    }
    
    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isConnected = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Load Strategic Directives from database
   */
  async loadStrategicDirectives() {
    if (!this.isConnected) {
      console.log('⚠️  Database not connected - cannot load SDs');
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading SDs from database:', error.message);
        return [];
      }
      
      // Load backlog data from strategic_directives_backlog table
      const { data: backlogData, error: backlogError } = await this.supabase
        .from('strategic_directives_backlog')
        .select('sd_id, h_count, m_count, l_count, future_count, must_have_count, must_have_pct, rolled_triage, total_items');
      
      if (backlogError) {
        console.log('⚠️  Error loading backlog data:', backlogError.message);
      } else {
        console.log(`📦 Loaded ${backlogData?.length || 0} backlog records`);
      }
      
      // Create backlog lookup map
      const backlogMap = {};
      if (backlogData) {
        backlogData.forEach(item => {
          backlogMap[item.sd_id] = item;
        });
      }
      
      // Load PRDs to calculate progress
      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*');
      
      // Load Execution Sequences
      const { data: allEES } = await this.supabase
        .from('execution_sequences_v2')
        .select('*');
      
      // Create PRD lookup map (multiple PRDs per SD)
      const prdMap = {};
      if (prds) {
        prds.forEach(prd => {
          if (!prdMap[prd.directive_id]) {
            prdMap[prd.directive_id] = [];
          }
          prdMap[prd.directive_id].push(prd);
        });
      }
      
      // Create EES lookup map
      const eesMap = {};
      if (allEES) {
        allEES.forEach(ees => {
          if (!eesMap[ees.directive_id]) {
            eesMap[ees.directive_id] = [];
          }
          eesMap[ees.directive_id].push(ees);
        });
      }

      // Transform database records to dashboard format
      const sds = await Promise.all(data.map(async sd => {
        const associatedPRDs = prdMap[sd.id] || [];
        const associatedEES = eesMap[sd.id] || [];
        const primaryPRD = associatedPRDs[0]; // Use first PRD for progress
        const backlogInfo = backlogMap[sd.id] || {}; // Get backlog data for this SD
        
        // Use deterministic progress calculator (single source of truth)
        const progressData = this.progressCalculator.calculateSDProgress(sd, primaryPRD);
        const progress = progressData.total;
        
        // Normalize status to preferred value
        const normalizedStatus = this.statusValidator.normalizeStatus('SD', sd.status);
        
        return {
          id: sd.id,
          filename: `${sd.id}.md`,
          type: 'SD',
          title: sd.title,
          status: normalizedStatus,
          priority: sd.priority,
          category: sd.category,
          description: sd.description,
          progress: progress, // Always use deterministic calculation
          sequence_rank: sd.sequence_rank, // Add sequence_rank for ordering
          metadata: {
            ...sd.metadata,  // Preserve existing metadata from database
            Status: normalizedStatus,
            Priority: sd.priority,
            Category: sd.category,
            'Created By': sd.created_by,
            'Approved By': sd.approved_by,
            Version: sd.version,
            'Total PRDs': associatedPRDs.length,
            'Total EES': associatedEES.length,
            'Completed PRDs': associatedPRDs.filter(p => p.status === 'approved' || p.status === 'complete').length,
            'Completed EES': associatedEES.filter(e => e.status === 'completed').length,
            // Add deterministic progress details
            'Current Phase': progressData.currentPhase,
            'Phase Progress': progressData.phases,
            'Progress Details': progressData.details
          },
          checklist: this.extractChecklist(sd),
          content: sd.content || this.generateSDContent(sd),
          objectives: sd.strategic_objectives || [],
          successCriteria: sd.success_criteria || [],
          risks: sd.risks || [],
          dependencies: sd.dependencies || [],
          stakeholders: sd.stakeholders || [],
          // Include associated PRDs and EES
          prds: associatedPRDs.map(prd => ({
            id: prd.id,
            title: prd.title,
            status: prd.status,
            priority: prd.priority,
            phase: prd.phase,
            progress: this.calculatePRDProgress(prd),
            createdAt: prd.created_at
          })),
          executionSequences: associatedEES.map(ees => ({
            id: ees.id,
            sequenceNumber: ees.sequence_number,
            description: ees.description,
            status: this.statusValidator.normalizeStatus('EES', ees.status),
            executorRole: ees.executor_role,
            completedAt: ees.completed_at
          })),
          // Include backlog counts from backlog table
          h_count: backlogInfo.h_count || 0,
          m_count: backlogInfo.m_count || 0,
          l_count: backlogInfo.l_count || 0,
          future_count: backlogInfo.future_count || 0,
          must_have_count: backlogInfo.must_have_count || 0,
          must_have_pct: backlogInfo.must_have_pct,
          rolled_triage: backlogInfo.rolled_triage,
          total_backlog_items: backlogInfo.total_items || 0,
          createdAt: sd.created_at,
          updatedAt: sd.updated_at
        };
      }));

      // Count how many SDs have backlog items
      const sdsWithBacklog = sds.filter(sd => 
        sd.h_count > 0 || sd.m_count > 0 || sd.l_count > 0 || sd.future_count > 0
      ).length;
      
      console.log(`📊 Loaded ${sds.length} Strategic Directives from database`);
      console.log(`📋 ${sdsWithBacklog} SDs have backlog items`);
      return sds;
    } catch (error) {
      console.error('❌ Failed to load SDs:', error.message);
      return [];
    }
  }

  /**
   * Load Product Requirements Documents from database
   */
  async loadPRDs() {
    if (!this.isConnected) {
      console.log('⚠️  Database not connected - cannot load PRDs');
      return [];
    }

    try {
      // Load PRDs first, then get SD titles separately
      const { data, error } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading PRDs from database:', error.message);
        return [];
      }

      // Get unique directive IDs to fetch SD titles
      const directiveIds = [...new Set(data.map(prd => prd.directive_id).filter(Boolean))];
      const sdTitles = {};
      
      if (directiveIds.length > 0) {
        const { data: sds } = await this.supabase
          .from('strategic_directives_v2')
          .select('id, title')
          .in('id', directiveIds);
        
        if (sds) {
          sds.forEach(sd => {
            sdTitles[sd.id] = sd.title;
          });
        }
      }

      // Transform database records to dashboard format
      const prds = data.map(prd => {
        // Normalize status to preferred value
        const normalizedStatus = this.statusValidator.normalizeStatus('PRD', prd.status);
        
        return {
          id: prd.id,
          filename: `${prd.id}.md`,
          type: 'PRD',
          directiveId: prd.directive_id,
          directiveTitle: sdTitles[prd.directive_id] || 'Unknown SD',
          title: prd.title,
          status: normalizedStatus,
          priority: prd.priority,
          category: prd.category,
          description: prd.executive_summary,
          progress: prd.progress || 0,
          phase: prd.phase,
          phaseProgress: prd.phase_progress || {},
          metadata: {
            Status: normalizedStatus,
          Priority: prd.priority,
          Category: prd.category,
          Phase: prd.phase,
          'Created By': prd.created_by,
          'Approved By': prd.approved_by,
          Version: prd.version
        },
        checklist: this.combinePRDChecklists(prd),
        content: prd.content || this.generatePRDContent(prd),
        functionalRequirements: prd.functional_requirements || [],
        nonFunctionalRequirements: prd.non_functional_requirements || [],
        technicalRequirements: prd.technical_requirements || [],
        testScenarios: prd.test_scenarios || [],
        acceptanceCriteria: prd.acceptance_criteria || [],
        validation_checklist: prd.validation_checklist || [], // Add missing validation_checklist field
        risks: prd.risks || [],
        constraints: prd.constraints || [],
        assumptions: prd.assumptions || [],
        stakeholders: prd.stakeholders || [],
        createdAt: prd.created_at,
        updatedAt: prd.updated_at
        };
      });

      console.log(`📊 Loaded ${prds.length} PRDs from database`);
      return prds;
    } catch (error) {
      console.error('❌ Failed to load PRDs:', error.message);
      return [];
    }
  }

  /**
   * Load Execution Sequences from database
   */
  async loadExecutionSequences() {
    if (!this.isConnected) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('execution_sequences_v2')
        .select('*')
        .order('directive_id', { ascending: true })
        .order('sequence_number', { ascending: true });

      if (error) {
        console.error('❌ Error loading EES from database:', error.message);
        return [];
      }

      console.log(`📊 Loaded ${data.length} Execution Sequences from database`);
      return data;
    } catch (error) {
      console.error('❌ Failed to load EES:', error.message);
      return [];
    }
  }

  /**
   * Extract checklist from SD data
   */
  extractChecklist(sd) {
    const checklist = [];
    
    // Convert success criteria to checklist items
    if (sd.success_criteria && Array.isArray(sd.success_criteria)) {
      sd.success_criteria.forEach(criteria => {
        checklist.push({
          text: criteria,
          checked: false, // Would need separate tracking
          phase: 'LEAD'
        });
      });
    }

    return checklist;
  }

  /**
   * Combine PRD checklists
   */
  combinePRDChecklists(prd) {
    const checklist = [];
    
    // Add PLAN checklist items
    if (prd.plan_checklist && Array.isArray(prd.plan_checklist)) {
      prd.plan_checklist.forEach(item => {
        checklist.push({
          text: typeof item === 'string' ? item : item.text,
          checked: typeof item === 'object' ? item.checked : false,
          phase: 'PLAN'
        });
      });
    }
    
    // Add EXEC checklist items
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      prd.exec_checklist.forEach(item => {
        checklist.push({
          text: typeof item === 'string' ? item : item.text,
          checked: typeof item === 'object' ? item.checked : false,
          phase: 'EXEC'
        });
      });
    }
    
    // Add validation checklist items
    if (prd.validation_checklist && Array.isArray(prd.validation_checklist)) {
      prd.validation_checklist.forEach(item => {
        checklist.push({
          text: typeof item === 'string' ? item : item.text,
          checked: typeof item === 'object' ? item.checked : false,
          phase: 'VALIDATION'
        });
      });
    }
    
    return checklist;
  }

  // Old calculateSDProgress method removed - now using ProgressCalculator class

  /**
   * Generate markdown content from SD data
   */
  generateSDContent(sd) {
    return `# Strategic Directive: ${sd.title}

**SD ID**: ${sd.id}  
**Status**: ${sd.status}  
**Priority**: ${sd.priority}  
**Category**: ${sd.category}  
**Version**: ${sd.version}  

## Executive Summary
${sd.description}

## Strategic Intent
${sd.strategic_intent || 'To be defined'}

## Rationale
${sd.rationale}

## Scope
${sd.scope}

## Strategic Objectives
${(sd.strategic_objectives || []).map(obj => `- ${obj}`).join('\n')}

## Success Criteria
${(sd.success_criteria || []).map(criteria => `- [ ] ${criteria}`).join('\n')}

## Risks
${(sd.risks || []).map(risk => 
  `- **${risk.risk || risk}**: ${risk.impact || ''} - ${risk.mitigation || ''}`
).join('\n')}

## Dependencies
${(sd.dependencies || []).map(dep => `- ${dep}`).join('\n')}

---
*Created: ${sd.created_at}*  
*Updated: ${sd.updated_at}*  
*Created By: ${sd.created_by}*
`;
  }

  // =============================================================================
  // SDIP/DirectiveLab Methods
  // =============================================================================

  /**
   * Save SDIP submission to database (with fallback to in-memory storage)
   */
  async saveSDIPSubmission(submission) {
    console.log('\n🚀 ========== DATABASE SAVE (STEP 1) ==========');
    console.log('📥 [DB-LOADER] Received submission data');
    console.log('📦 [DB-LOADER] Input keys:', Object.keys(submission));
    
    // Map feedback to chairman_input for the existing table structure
    const timestamp = Date.now();
    const submissionData = {
      submission_id: `sdip-${timestamp}`,
      chairman_input: submission.feedback || submission.chairman_input || '',  // Use chairman_input for existing table
      screenshot_url: submission.screenshot_url || null,
      intent_summary: submission.intent_summary || `Strategic initiative to address: ${(submission.feedback || submission.chairman_input || '').substring(0, 100)}...`,
      status: submission.status || 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_step: 1,
      gate_status: {}
    };
    
    console.log('🆔 [DB-LOADER] Generated submission_id:', submissionData.submission_id);
    console.log('👤 [DB-LOADER] Chairman input length:', submissionData.chairman_input.length);
    console.log('🔢 [DB-LOADER] Current step:', submissionData.current_step);

    // If no database connection, use in-memory storage
    if (!this.supabase) {
      console.warn('⚠️  [DB-LOADER] Database not connected - using in-memory storage');
      if (!global.sdipSubmissions) global.sdipSubmissions = [];
      
      // Check for duplicate based on chairman_input content
      const existingSubmission = global.sdipSubmissions.find(s => 
        s.chairman_input?.trim().toLowerCase() === submissionData.chairman_input?.trim().toLowerCase()
      );
      
      if (existingSubmission) {
        console.log('🔄 [DB-LOADER] Duplicate detected - returning existing submission:', existingSubmission.id);
        console.log('📦 [DB-LOADER] Total in-memory submissions (unchanged):', global.sdipSubmissions.length);
        return existingSubmission;
      }
      
      // Add ID field for consistency
      const inMemorySubmission = {
        ...submissionData,
        id: submissionData.submission_id
      };
      
      global.sdipSubmissions.push(inMemorySubmission);
      console.log('✅ [DB-LOADER] New submission stored in memory with ID:', inMemorySubmission.id);
      console.log('📦 [DB-LOADER] Total in-memory submissions:', global.sdipSubmissions.length);
      return inMemorySubmission;
    }

    try {
      const { data, error } = await this.supabase
        .from('directive_submissions')
        .insert(submissionData)
        .select()
        .single();

      if (error) {
        // If the table doesn't exist or has missing columns, use in-memory fallback
        console.warn('Database table issue - using in-memory storage:', error.message);
        if (!global.sdipSubmissions) global.sdipSubmissions = [];
        
        // Check for duplicate before adding
        const existingSubmission = global.sdipSubmissions.find(s => 
          s.chairman_input?.trim().toLowerCase() === submissionData.chairman_input?.trim().toLowerCase()
        );
        
        if (existingSubmission) {
          console.log('🔄 [DB-LOADER] Duplicate detected in fallback - returning existing:', existingSubmission.id);
          return existingSubmission;
        }
        
        global.sdipSubmissions.push(submissionData);
        return submissionData;
      }
      
      console.log('✅ [DB-LOADER] Submission saved to database with ID:', data.id);
      console.log('🆔 [DB-LOADER] Database ID type:', typeof data.id);
      console.log('📦 [DB-LOADER] Returned submission fields:', Object.keys(data));
      return data;
    } catch (error) {
      console.error('Error saving SDIP submission - using fallback:', error);
      // Fallback to in-memory storage
      if (!global.sdipSubmissions) global.sdipSubmissions = [];
      
      // Check for duplicate before adding
      const existingSubmission = global.sdipSubmissions.find(s => 
        s.chairman_input?.trim().toLowerCase() === submissionData.chairman_input?.trim().toLowerCase()
      );
      
      if (existingSubmission) {
        console.log('🔄 [DB-LOADER] Duplicate detected in error fallback - returning existing:', existingSubmission.id);
        return existingSubmission;
      }
      
      global.sdipSubmissions.push(submissionData);
      return submissionData;
    }
  }

  /**
   * Get recent SDIP submissions
   */
  async getRecentSDIPSubmissions(limit = 20) {
    console.log('\n📋 ========== GET SUBMISSIONS ==========');
    console.log('🔍 [DB-LOADER] Fetching recent submissions, limit:', limit);
    
    // Check in-memory storage first
    if (global.sdipSubmissions && global.sdipSubmissions.length > 0) {
      console.log('📦 [DB-LOADER] Found', global.sdipSubmissions.length, 'in-memory submissions');
      const submissions = global.sdipSubmissions
        .slice(-limit)
        .reverse(); // Most recent first
      
      if (submissions.length > 0) {
        console.log('🆔 [DB-LOADER] First submission ID:', submissions[0]?.id, 'Type:', typeof submissions[0]?.id);
      }
      return submissions;
    }

    if (!this.supabase) {
      console.log('⚠️  [DB-LOADER] No database connection, returning empty array');
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('directive_submissions')  // Use correct table name
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        // If table doesn't exist, return in-memory submissions
        console.warn('Error fetching from database, using in-memory:', error.message);
        return global.sdipSubmissions || [];
      }
      console.log('✅ [DB-LOADER] Retrieved', data?.length || 0, 'submissions from database');
      if (data && data.length > 0) {
        console.log('🆔 [DB-LOADER] First submission ID:', data[0].id, 'Type:', typeof data[0].id);
        console.log('📦 [DB-LOADER] Submission fields:', Object.keys(data[0]));
      }
      return data || [];
    } catch (error) {
      console.error('Error fetching SDIP submissions:', error);
      return global.sdipSubmissions || [];
    }
  }

  /**
   * Update submission with data from a specific step
   */
  async updateSubmissionStep(submissionId, stepNumber, stepData) {
    console.log(`\n🔄 ========== DATABASE UPDATE (STEP ${stepNumber}) ==========`);
    console.log(`🆔 [DB-LOADER] Submission ID: ${submissionId}`);
    console.log(`🆔 [DB-LOADER] ID type: ${typeof submissionId}`);
    console.log(`🔢 [DB-LOADER] Step number: ${stepNumber}`);
    console.log(`📦 [DB-LOADER] Step data keys:`, Object.keys(stepData));
    console.log(`📋 [DB-LOADER] Step data preview:`, JSON.stringify(stepData).substring(0, 200));
    
    const updateData = {
      updated_at: new Date().toISOString(),
      current_step: stepNumber
    };

    // Map step data based on step number
    switch(stepNumber) {
      case 2:
        // Intent confirmation step - only add intent_summary, not intent_confirmed_at
        updateData.intent_summary = stepData.intent_summary;
        console.log(`📊 [DB-LOADER] Step 2 - Setting intent_summary:`, stepData.intent_summary?.substring(0, 50) + '...');
        break;
      case 3:
        // Classification step - these columns may not exist
        console.log(`📊 [DB-LOADER] Step 3 - Classification data`);
        // For now, store in gate_status JSON field
        break;
      case 4:
        // Impact analysis step - store in gate_status
        console.log(`📊 [DB-LOADER] Step 4 - Impact analysis data`);
        break;
      case 5:
        // Synthesis review step - store in gate_status
        console.log(`📊 [DB-LOADER] Step 5 - Synthesis review data`);
        break;
      case 6:
        // Questions step - store in gate_status
        console.log(`📊 [DB-LOADER] Step 6 - Questions data`);
        break;
      case 7:
        // Final confirmation step
        console.log(`📊 [DB-LOADER] Step 7 - Final confirmation`);
        updateData.status = 'completed';
        break;
    }

    // Fetch the existing submission first to get current gate_status
    let existingSubmission = null;
    if (global.sdipSubmissions) {
      existingSubmission = global.sdipSubmissions.find(s => s.id === submissionId || s.submission_id === submissionId);
    }
    
    // Merge step-specific data with existing gate_status to preserve previous data
    const existingGateStatus = existingSubmission?.gate_status || {};
    updateData.gate_status = { ...existingGateStatus, ...stepData };
    console.log(`📦 [DB-LOADER] Update data prepared:`, Object.keys(updateData));
    console.log(`📋 [DB-LOADER] Gate status data:`, JSON.stringify(updateData.gate_status).substring(0, 100));

    // Handle in-memory storage
    if (!this.supabase) {
      console.warn('⚠️  [DB-LOADER] Database not connected - updating in-memory storage');
      if (global.sdipSubmissions) {
        console.log('🔍 [DB-LOADER] Searching in', global.sdipSubmissions.length, 'in-memory submissions');
        const index = global.sdipSubmissions.findIndex(s => s.id === submissionId || s.submission_id === submissionId);
        if (index !== -1) {
          global.sdipSubmissions[index] = { ...global.sdipSubmissions[index], ...updateData };
          console.log(`✅ [DB-LOADER] In-memory update successful at index ${index}`);
          console.log('🆔 [DB-LOADER] Updated submission ID:', global.sdipSubmissions[index].id);
          return global.sdipSubmissions[index];
        }
        console.error(`❌ [DB-LOADER] Submission not found in memory: ${submissionId}`);
      } else {
        console.error('❌ [DB-LOADER] No in-memory submissions array exists');
      }
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('directive_submissions')
        .update(updateData)
        .eq('id', submissionId)
        .select()
        .single();

      if (error) {
        console.warn('Database update failed - updating in-memory storage:', error.message);
        if (global.sdipSubmissions) {
          const index = global.sdipSubmissions.findIndex(s => s.id === submissionId || s.submission_id === submissionId);
          if (index !== -1) {
            global.sdipSubmissions[index] = { ...global.sdipSubmissions[index], ...updateData };
            return global.sdipSubmissions[index];
          }
        }
        throw error;
      }

      console.log(`✅ [DB-LOADER] Updated submission ${submissionId} for step ${stepNumber}`);
      return data;
    } catch (error) {
      console.error(`❌ [DB-LOADER] Error updating submission step ${stepNumber}:`, error);
      console.error(`❌ [DB-LOADER] Full error details:`, JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Save screenshot for submission
   */
  async saveScreenshot(submissionId, screenshot) {
    if (!this.supabase) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('submission_screenshots')
        .insert({
          submission_id: submissionId,
          screenshot_url: screenshot.url,
          screenshot_data: screenshot.data,
          mime_type: screenshot.mimeType || 'image/png'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving screenshot:', error);
      throw error;
    }
  }

  /**
   * Get submission progress
   */
  async getSubmissionProgress(submissionId) {
    if (!this.supabase) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_submission_progress', { p_submission_id: submissionId });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error fetching submission progress:', error);
      return null;
    }
  }

  /**
   * Generate markdown content from PRD data with IT best practices for lovable.dev
   */
  generatePRDContent(prd) {
    return `# Product Requirements Document: ${prd.title}

**PRD ID**: ${prd.id}  
**Strategic Directive**: ${prd.directive_id}  
**Status**: ${prd.status}  
**Phase**: ${prd.phase}  
**Priority**: ${prd.priority}  
**Version**: ${prd.version}  

## Executive Summary
${prd.executive_summary || 'To be defined'}

## Business Context
${prd.business_context || 'To be defined'}

## Technical Context
${prd.technical_context || 'To be defined'}

## Lovable.dev Architecture Requirements

### Platform Integration
- **Framework Stack**: React 18+ with TypeScript, Vite build system, Tailwind CSS
- **Backend Integration**: Supabase for database, authentication, and real-time subscriptions
- **Development Approach**: AI-powered development with natural language prompting (60-70% AI co-pilot usage)
- **Responsive Design**: Mobile-first approach with fluid breakpoints and adaptive layouts

### Knowledge File Foundation
- **Knowledge Files**: Comprehensive project documentation in /knowledge directory
- **Context Management**: Structured prompting with role-based contexts
- **Documentation Standards**: Clear, accessible documentation for AI understanding
- **Version Control**: Git-based with semantic versioning

## Functional Requirements
${(prd.functional_requirements || []).map(req => `- ${req}`).join('\n')}

### Additional Lovable.dev Functional Requirements
- Natural language interface for user interactions where applicable
- Real-time data synchronization using Supabase subscriptions
- Progressive Web App (PWA) capabilities for mobile experience
- Accessibility compliance (WCAG 2.1 AA standards)

## Non-Functional Requirements
${(prd.non_functional_requirements || []).map(req => `- ${req}`).join('\n')}

### Performance Requirements (Lovable.dev Standards)
- **Page Load Speed**: Initial load <3 seconds, subsequent navigation <1 second
- **Mobile Performance**: 90+ Lighthouse score on mobile devices
- **Database Queries**: Optimized Supabase queries with proper indexing
- **Bundle Size**: Code splitting and lazy loading for optimal bundle sizes

## Technical Requirements
${Array.isArray(prd.technical_requirements) ? prd.technical_requirements.map(req => `- ${req}`).join('\n') : ''}

### Lovable.dev Technical Architecture
- **Component Architecture**: Atomic design principles with reusable components
- **State Management**: React hooks with Context API or Zustand for complex state
- **Database Schema**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with role-based access control
- **API Layer**: RESTful APIs with Supabase client-side integration

## Security & Compliance

### Data Security
- Row Level Security (RLS) policies in Supabase
- Input validation and sanitization
- HTTPS enforcement and secure headers
- Environment variable management for sensitive data

### Accessibility Standards
- WCAG 2.1 AA compliance
- Semantic HTML structure
- Keyboard navigation support
- Screen reader compatibility
- Color contrast ratios (4.5:1 minimum)

## Implementation Approach
${prd.implementation_approach || 'To be defined'}

### Lovable.dev Development Workflow
1. **Knowledge File Setup**: Create comprehensive project documentation
2. **Iterative Development**: 15-30 minute development cycles with AI assistance
3. **Component-First Design**: Build reusable UI components with Storybook
4. **Database-First Architecture**: Design Supabase schema before frontend implementation
5. **Testing Strategy**: Unit tests (Jest), integration tests (Testing Library), E2E (Playwright)

## User Experience Design

### Design System
- **Tailwind CSS**: Utility-first styling with custom design tokens
- **Component Library**: Consistent UI components with accessibility built-in
- **Responsive Breakpoints**: Mobile (320px+), Tablet (768px+), Desktop (1024px+)
- **Dark Mode Support**: System preference detection with manual toggle

### User Journey Mapping
- User personas and journey documentation
- Interaction flow diagrams
- Wireframes and prototypes using Figma integration
- Usability testing protocols

## Test Scenarios
${(prd.test_scenarios || []).map(test => `- ${test}`).join('\n')}

### Lovable.dev Testing Strategy
- **Unit Testing**: Component-level testing with React Testing Library
- **Integration Testing**: API integration and Supabase connection testing
- **E2E Testing**: Critical user flows with Playwright
- **Accessibility Testing**: WAVE, axe-core, and manual testing
- **Performance Testing**: Lighthouse CI and Core Web Vitals monitoring

## Acceptance Criteria
${(prd.acceptance_criteria || []).map(criteria => `- [ ] ${criteria}`).join('\n')}

### Technical Acceptance Criteria
- [ ] Mobile-first responsive design implemented and tested
- [ ] Supabase integration with proper RLS policies
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Performance metrics meet requirements (90+ Lighthouse score)
- [ ] Knowledge files created and AI development workflow established
- [ ] Component library documented with usage examples

## Risk Assessment & Mitigation

### Technical Risks
- **Supabase Rate Limits**: Implement query optimization and caching strategies
- **Mobile Performance**: Regular performance audits and bundle size monitoring
- **Browser Compatibility**: Testing across modern browsers and devices
- **AI Development Dependencies**: Fallback development approaches for complex features

### Mitigation Strategies
- Comprehensive testing at each development phase
- Performance monitoring and alerting
- Regular security audits and dependency updates
- Documentation of manual development processes

## Deployment & DevOps

### Deployment Strategy
- **Hosting**: Netlify or Vercel with automatic deployments from Git
- **Environment Management**: Development, staging, and production environments
- **CI/CD Pipeline**: Automated testing, building, and deployment
- **Monitoring**: Error tracking (Sentry), analytics, and performance monitoring

### Maintenance & Support
- Regular dependency updates and security patches
- Performance monitoring and optimization
- User feedback integration and iterative improvements
- Documentation updates and knowledge file maintenance

## PLAN Agent Checklist
${(prd.plan_checklist || []).map(item => 
  `- [${typeof item === 'object' && item.checked ? 'x' : ' '}] ${typeof item === 'string' ? item : item.text}`
).join('\n')}

### Additional PLAN Items (Lovable.dev)
- [ ] Knowledge files created with comprehensive project documentation
- [ ] Supabase database schema designed with RLS policies
- [ ] Component architecture planned with atomic design principles
- [ ] Accessibility requirements defined and documented
- [ ] Performance benchmarks established
- [ ] Mobile-first responsive design specifications created

## EXEC Implementation Checklist
${(prd.exec_checklist || []).map(item => 
  `- [${typeof item === 'object' && item.checked ? 'x' : ' '}] ${typeof item === 'string' ? item : item.text}`
).join('\n')}

### Additional EXEC Items (Lovable.dev)
- [ ] React components built with TypeScript and Tailwind CSS
- [ ] Supabase integration implemented with proper error handling
- [ ] Responsive design tested across multiple devices and browsers
- [ ] Accessibility features implemented and tested
- [ ] Performance optimizations applied (lazy loading, code splitting)
- [ ] PWA features implemented (service worker, offline capability)

## Validation Checklist
${(prd.validation_checklist || []).map(item => 
  `- [${typeof item === 'object' && item.checked ? 'x' : ' '}] ${typeof item === 'string' ? item : item.text}`
).join('\n')}

### Additional Validation Items (Lovable.dev)
- [ ] Lighthouse audit passed with 90+ scores across all categories
- [ ] Accessibility testing completed with automated and manual checks
- [ ] Cross-browser and cross-device compatibility verified
- [ ] Security audit completed including RLS policy testing
- [ ] Performance benchmarks met under realistic load conditions
- [ ] User acceptance testing completed with target user groups

---
*Created: ${prd.created_at}*  
*Updated: ${prd.updated_at}*  
*Created By: ${prd.created_by}*
`;
  }

  /**
   * Generate lovable.dev specific PRD sections based on project type
   */
  generateLovableDevSections(projectType = 'web-app') {
    const sections = {
      'web-app': {
        technicalRequirements: [
          'React 18+ with TypeScript and strict mode enabled',
          'Vite build system with optimized production builds',
          'Tailwind CSS with custom design system tokens',
          'Supabase PostgreSQL database with Row Level Security',
          'Real-time subscriptions for live data updates',
          'Progressive Web App capabilities (PWA)',
          'Responsive design supporting mobile-first approach',
          'Accessibility compliance (WCAG 2.1 AA standards)'
        ],
        performanceRequirements: [
          'Initial page load under 3 seconds on 3G networks',
          'Lighthouse Performance score of 90+ on mobile',
          'Core Web Vitals within recommended thresholds',
          'Bundle size optimization with code splitting',
          'Image optimization with modern formats (WebP, AVIF)',
          'Efficient Supabase query patterns with proper indexing'
        ],
        securityRequirements: [
          'Supabase Row Level Security (RLS) policies implementation',
          'Input validation and sanitization on all forms',
          'HTTPS enforcement with secure headers',
          'Environment variables for sensitive configuration',
          'Authentication with role-based access control',
          'SQL injection prevention through parameterized queries'
        ]
      },
      'dashboard': {
        technicalRequirements: [
          'Real-time data visualization with Chart.js or D3',
          'Advanced filtering and search capabilities',
          'Data export functionality (CSV, PDF, Excel)',
          'Responsive data tables with pagination',
          'WebSocket connections for live updates',
          'Caching strategies for improved performance'
        ],
        performanceRequirements: [
          'Large dataset handling without UI blocking',
          'Virtualization for tables with 1000+ rows',
          'Optimized re-rendering with React.memo',
          'Debounced search and filter operations',
          'Background data sync with service workers'
        ]
      },
      'e-commerce': {
        technicalRequirements: [
          'Payment processing integration (Stripe, PayPal)',
          'Inventory management with real-time stock updates',
          'Shopping cart with persistent state',
          'Order management and tracking system',
          'Product search with advanced filtering',
          'Email notifications and order confirmations'
        ],
        securityRequirements: [
          'PCI DSS compliance for payment processing',
          'Secure checkout flow with HTTPS',
          'Customer data encryption at rest and in transit',
          'Fraud detection and prevention measures',
          'Audit logging for financial transactions'
        ]
      }
    };

    return sections[projectType] || sections['web-app'];
  }

  /**
   * Generate AI development workflow checklist for lovable.dev
   */
  generateAIWorkflowChecklist() {
    return [
      { text: 'Knowledge files created in /knowledge directory with comprehensive project documentation', checked: false, phase: 'PLAN' },
      { text: 'AI prompting strategy defined with role-based contexts and structured templates', checked: false, phase: 'PLAN' },
      { text: 'Component library documented with clear usage examples for AI understanding', checked: false, phase: 'PLAN' },
      { text: 'Database schema documented with relationship diagrams and query examples', checked: false, phase: 'PLAN' },
      { text: 'Development environment configured for AI co-pilot integration (60-70% usage target)', checked: false, phase: 'EXEC' },
      { text: 'Iterative development cycles established (15-30 minute intervals)', checked: false, phase: 'EXEC' },
      { text: 'Natural language interface implemented for user-facing interactions', checked: false, phase: 'EXEC' },
      { text: 'AI-assisted testing workflows established with automated test generation', checked: false, phase: 'EXEC' },
      { text: 'AI development workflow validated and documented for team use', checked: false, phase: 'VALIDATION' },
      { text: 'Knowledge file quality validated for AI comprehension and accuracy', checked: false, phase: 'VALIDATION' }
    ];
  }

  /**
   * Generate accessibility checklist for lovable.dev compliance
   */
  generateAccessibilityChecklist() {
    return [
      { text: 'Semantic HTML structure implemented with proper heading hierarchy', checked: false, phase: 'EXEC' },
      { text: 'ARIA labels and roles added for interactive elements', checked: false, phase: 'EXEC' },
      { text: 'Keyboard navigation support implemented for all interactive elements', checked: false, phase: 'EXEC' },
      { text: 'Color contrast ratios verified (minimum 4.5:1 for normal text)', checked: false, phase: 'EXEC' },
      { text: 'Screen reader compatibility tested with NVDA/JAWS', checked: false, phase: 'VALIDATION' },
      { text: 'Focus indicators visible and accessible for keyboard users', checked: false, phase: 'EXEC' },
      { text: 'Alternative text provided for all informative images', checked: false, phase: 'EXEC' },
      { text: 'Form validation accessible with clear error messages', checked: false, phase: 'EXEC' },
      { text: 'WCAG 2.1 AA compliance verified with automated and manual testing', checked: false, phase: 'VALIDATION' },
      { text: 'Accessibility audit completed and documented', checked: false, phase: 'VALIDATION' }
    ];
  }

  /**
   * Enhanced PRD content generator with lovable.dev best practices
   */
  generateEnhancedPRDContent(prd, projectType = 'web-app') {
    const lovableDevSections = this.generateLovableDevSections(projectType);
    const aiWorkflowChecklist = this.generateAIWorkflowChecklist();
    const accessibilityChecklist = this.generateAccessibilityChecklist();

    // Merge existing checklists with generated ones
    const enhancedPlanChecklist = [
      ...(prd.plan_checklist || []),
      ...aiWorkflowChecklist.filter(item => item.phase === 'PLAN')
    ];

    const enhancedExecChecklist = [
      ...(prd.exec_checklist || []),
      ...aiWorkflowChecklist.filter(item => item.phase === 'EXEC'),
      ...accessibilityChecklist.filter(item => item.phase === 'EXEC')
    ];

    const enhancedValidationChecklist = [
      ...(prd.validation_checklist || []),
      ...aiWorkflowChecklist.filter(item => item.phase === 'VALIDATION'),
      ...accessibilityChecklist.filter(item => item.phase === 'VALIDATION')
    ];

    return this.generatePRDContent({
      ...prd,
      technical_requirements: [
        ...(prd.technical_requirements || []),
        ...lovableDevSections.technicalRequirements
      ],
      non_functional_requirements: [
        ...(prd.non_functional_requirements || []),
        ...(lovableDevSections.performanceRequirements || []),
        ...(lovableDevSections.securityRequirements || [])
      ],
      plan_checklist: enhancedPlanChecklist,
      exec_checklist: enhancedExecChecklist,
      validation_checklist: enhancedValidationChecklist
    });
  }

  /**
   * Update checklist item in database
   */
  async updateChecklistItem(documentType, documentId, checklistType, itemIndex, checked) {
    if (!this.isConnected) {
      console.log('⚠️  Database not connected');
      return false;
    }

    try {
      const table = documentType === 'SD' ? 'strategic_directives_v2' : 'product_requirements_v2';
      
      // First get the current document
      const { data: doc, error: fetchError } = await this.supabase
        .from(table)
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (fetchError) {
        console.error('❌ Error fetching document:', fetchError.message);
        return false;
      }
      
      // Determine which checklist field to update based on type
      let checklistField = checklistType;
      if (documentType === 'PRD') {
        // Map generic checklist types to PRD fields
        if (checklistType === 'checklist' || checklistType === 'plan_checklist') {
          checklistField = 'plan_checklist';
        } else if (checklistType === 'exec_checklist') {
          checklistField = 'exec_checklist';
        } else if (checklistType === 'validation_checklist') {
          checklistField = 'validation_checklist';
        }
      }
      
      // Update the specific checklist
      let updatedChecklist = doc[checklistField] || [];
      if (updatedChecklist[itemIndex] !== undefined) {
        if (typeof updatedChecklist[itemIndex] === 'string') {
          updatedChecklist[itemIndex] = { text: updatedChecklist[itemIndex], checked };
        } else {
          updatedChecklist[itemIndex].checked = checked;
        }
      }
      
      // Calculate new progress if it's a PRD
      let updateData = { 
        [checklistField]: updatedChecklist,
        updated_at: new Date().toISOString()
      };
      
      if (documentType === 'PRD') {
        // Recalculate progress based on checklists
        const planComplete = (doc.plan_checklist || []).filter(i => i.checked).length;
        const planTotal = (doc.plan_checklist || []).length || 1;
        const execComplete = (doc.exec_checklist || []).filter(i => i.checked).length;
        const execTotal = (doc.exec_checklist || []).length || 1;
        const validationComplete = (doc.validation_checklist || []).filter(i => i.checked).length;
        const validationTotal = (doc.validation_checklist || []).length || 1;
        
        // Update the checklist we just modified
        if (checklistField === 'plan_checklist') {
          const newComplete = updatedChecklist.filter(i => i.checked).length;
          updateData.progress = Math.round(20 + (newComplete / planTotal * 20) + (execComplete / execTotal * 30) + (validationComplete / validationTotal * 15));
        } else if (checklistField === 'exec_checklist') {
          const newComplete = updatedChecklist.filter(i => i.checked).length;
          updateData.progress = Math.round(20 + (planComplete / planTotal * 20) + (newComplete / execTotal * 30) + (validationComplete / validationTotal * 15));
        } else if (checklistField === 'validation_checklist') {
          const newComplete = updatedChecklist.filter(i => i.checked).length;
          updateData.progress = Math.round(20 + (planComplete / planTotal * 20) + (execComplete / execTotal * 30) + (newComplete / validationTotal * 15));
        }
      }
      
      // Update in database
      const { error: updateError } = await this.supabase
        .from(table)
        .update(updateData)
        .eq('id', documentId);
      
      if (updateError) {
        console.error('❌ Error updating checklist:', updateError.message);
        return false;
      }
      
      console.log(`✅ Updated checklist item in ${documentType} ${documentId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to update checklist:', error.message);
      return false;
    }
  }

  /**
   * Calculate PRD progress based on checklists
   */
  calculatePRDProgress(prd) {
    if (!prd) return 0;

    const planChecklist = prd.plan_checklist || [];
    const execChecklist = prd.exec_checklist || [];
    const validationChecklist = prd.validation_checklist || [];

    const totalItems = planChecklist.length + execChecklist.length + validationChecklist.length;
    if (totalItems === 0) return 0;

    const completedItems = 
      planChecklist.filter(item => item.checked).length +
      execChecklist.filter(item => item.checked).length +
      validationChecklist.filter(item => item.checked).length;

    return Math.round((completedItems / totalItems) * 100);
  }

  /**
   * Watch for database changes (using polling for now)
   */
  startDatabaseWatch(callback, interval = 30000) {
    if (!this.isConnected) {
      console.log('⚠️  Database not connected - cannot watch for changes');
      return null;
    }

    console.log(`👁️  Watching database for changes (polling every ${interval/1000}s)`);
    
    return setInterval(async () => {
      try {
        const sds = await this.loadStrategicDirectives();
        const prds = await this.loadPRDs();
        const ees = await this.loadExecutionSequences();
        
        callback({
          strategicDirectives: sds,
          prds: prds,
          executionSequences: ees
        });
      } catch (error) {
        console.error('❌ Error polling database:', error.message);
      }
    }, interval);
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(submissionId) {
    console.log('🔍 [DB-LOADER] Getting submission by ID:', submissionId);
    
    // Check in-memory storage first
    if (global.sdipSubmissions) {
      const submission = global.sdipSubmissions.find(s => 
        s.id === submissionId || s.submission_id === submissionId
      );
      if (submission) {
        console.log('✅ [DB-LOADER] Found submission in memory');
        return submission;
      }
    }

    // Try database if connected
    if (this.supabase) {
      try {
        // Try directive_submissions table first
        const { data, error } = await this.supabase
          .from('directive_submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        if (!error && data) {
          console.log('✅ [DB-LOADER] Found submission in database');
          return data;
        }

        // Try sdip_submissions table as fallback
        const { data: sdipData, error: sdipError } = await this.supabase
          .from('sdip_submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        if (!sdipError && sdipData) {
          console.log('✅ [DB-LOADER] Found submission in sdip_submissions table');
          return sdipData;
        }

      } catch (error) {
        console.error('❌ Error fetching submission:', error);
      }
    }

    console.log('❌ [DB-LOADER] Submission not found:', submissionId);
    return null;
  }

  /**
   * Save Strategic Directive to database
   */
  async saveStrategicDirective(sdData) {
    console.log('💾 [DB-LOADER] Saving Strategic Directive:', sdData.id);

    if (!this.supabase) {
      console.warn('⚠️  [DB-LOADER] Database not connected - SD not saved');
      return sdData;
    }

    try {
      const { data, error } = await this.supabase
        .from('strategic_directives_v2')
        .insert(sdData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving Strategic Directive:', error);
        throw error;
      }

      console.log('✅ [DB-LOADER] Strategic Directive saved successfully');
      return data;
    } catch (error) {
      console.error('❌ Failed to save Strategic Directive:', error);
      throw error;
    }
  }

  // =============================================================================
  // PR REVIEW METHODS (Agentic Review Integration)
  // =============================================================================

  /**
   * Load PR reviews from database
   */
  async loadPRReviews(limit = 50) {
    if (!this.isConnected) {
      console.warn('⚠️ Database not connected - returning empty PR reviews');
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('agentic_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error loading PR reviews:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Failed to load PR reviews:', error);
      return [];
    }
  }

  /**
   * Calculate PR metrics from database
   */
  async calculatePRMetrics() {
    if (!this.isConnected) {
      console.warn('⚠️ Database not connected - returning default metrics');
      return {
        totalToday: 0,
        passRate: 0,
        avgTime: 0,
        falsePositiveRate: 0,
        complianceRate: 0
      };
    }

    try {
      // Get today's date
      const today = new Date().toISOString().split('T')[0];

      // Get today's metrics
      const { data: todayMetrics, error: metricsError } = await this.supabase
        .from('pr_metrics')
        .select('*')
        .eq('date', today)
        .single();

      if (metricsError && metricsError.code !== 'PGRST116') {
        console.error('❌ Error loading PR metrics:', metricsError);
      }

      // Get recent reviews for additional calculations
      const { data: recentReviews, error: reviewsError } = await this.supabase
        .from('agentic_reviews')
        .select('*')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');

      if (reviewsError) {
        console.error('❌ Error loading recent reviews:', reviewsError);
      }

      // Calculate metrics
      const totalToday = recentReviews?.length || 0;
      const passed = recentReviews?.filter(r => r.status === 'passed').length || 0;
      const withSD = recentReviews?.filter(r => r.sd_id !== null).length || 0;

      return {
        totalToday,
        passRate: totalToday > 0 ? (passed / totalToday * 100).toFixed(1) : 0,
        avgTime: todayMetrics?.avg_review_time_ms || 0,
        falsePositiveRate: todayMetrics?.false_positive_rate || 0,
        complianceRate: totalToday > 0 ? (withSD / totalToday * 100).toFixed(1) : 0
      };
    } catch (error) {
      console.error('❌ Failed to calculate PR metrics:', error);
      return {
        totalToday: 0,
        passRate: 0,
        avgTime: 0,
        falsePositiveRate: 0,
        complianceRate: 0
      };
    }
  }

  /**
   * Save PR review to database
   */
  async savePRReview(review) {
    if (!this.isConnected) {
      console.warn('⚠️ Database not connected - PR review not saved');
      return null;
    }

    try {
      // Prepare review data
      const reviewData = {
        pr_number: review.pr_number,
        pr_title: review.pr_title || '',
        branch: review.branch || '',
        author: review.author || review.pr_author || '',
        github_url: review.github_url || null,
        status: review.status || 'pending',
        summary: review.summary || null,
        issues: review.issues || [],
        sub_agent_reviews: review.sub_agent_reviews || [],
        sd_link: review.sd_link || review.sd_id || null,
        prd_link: review.prd_link || review.prd_id || null,
        leo_phase: review.leo_phase || review.phase || 'EXEC',
        commit_sha: review.commit_sha || null,
        review_time_ms: review.review_time_ms || null,
        is_false_positive: review.is_false_positive || false,
        metadata: review.metadata || {}
      };

      // Insert review (don't upsert since pr_number isn't unique)
      const { data, error } = await this.supabase
        .from('agentic_reviews')
        .insert(reviewData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving PR review:', error);
        throw error;
      }

      console.log('✅ PR review saved:', data.pr_number);

      // Update daily metrics
      await this.updatePRMetrics();

      return data;
    } catch (error) {
      console.error('❌ Failed to save PR review:', error);
      throw error;
    }
  }

  /**
   * Update PR metrics for today
   */
  async updatePRMetrics() {
    if (!this.isConnected) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Call the database function to calculate metrics
      const { error } = await this.supabase
        .rpc('calculate_pr_metrics_for_date', { target_date: today });

      if (error) {
        console.error('❌ Error updating PR metrics:', error);
      }
    } catch (error) {
      console.error('❌ Failed to update PR metrics:', error);
    }
  }
}

export default DatabaseLoader;