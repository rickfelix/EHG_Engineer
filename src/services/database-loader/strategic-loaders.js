/**
 * Strategic Loaders Module
 * Handles loading of Strategic Directives, PRDs, and Execution Sequences
 * Extracted from database-loader.js - NO BEHAVIOR CHANGES
 */

import StatusValidator from '../status-validator.js';
import ProgressCalculator from '../progress-calculator.js';

class StrategicLoaders {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.statusValidator = new StatusValidator();
    this.progressCalculator = new ProgressCalculator();
  }

  /**
   * Load Strategic Directives from database
   */
  async loadStrategicDirectives() {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot load SDs');
      return [];
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading SDs from database:', error.message);
        return [];
      }

      // Load backlog data from strategic_directives_backlog table
      const { data: backlogData, error: backlogError } = await supabase
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
      const { data: prds } = await supabase
        .from('product_requirements_v2')
        .select('*');

      // Load Execution Sequences
      const { data: allEES } = await supabase
        .from('execution_sequences_v2')
        .select('*');

      // Note: User stories functionality removed - replaced with backlog summaries
      // Backlog summaries will be fetched via API on-demand for better performance

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

      // User stories functionality removed - replaced with AI-generated backlog summaries
      // This improves performance and provides more relevant information from actual backlog data

      // Transform database records to dashboard format
      const sds = data.map(sd => {
        const backlogInfo = backlogMap[sd.id] || {};
        const sdPRDs = prdMap[sd.id] || [];
        const sdEES = allEES?.filter(e => e.sd_id === sd.id) || [];
        // Backlog summary will be fetched on-demand via API
        const backlogItemCount = backlogInfo.total_items || sd.total_items || 0;

        // Calculate overall progress - use first PRD for progress calculation
        // TODO: Enhance to handle multiple PRDs per SD properly
        const primaryPRD = sdPRDs.length > 0 ? sdPRDs[0] : null;
        const progressData = this.progressCalculator.calculateSDProgress(sd, primaryPRD);
        const overallProgress = progressData.total;

        // Add progress breakdown - use the phases data
        const progressBreakdown = {
          phases: progressData.phases,
          currentPhase: progressData.currentPhase,
          details: progressData.details || {}
        };

        // Calculate SD phase based on PRDs and EES
        let sdPhase = 'pending';
        if (sdPRDs.some(p => p.phase === 'execution') || sdEES.length > 0) {
          sdPhase = 'execution';
        } else if (sdPRDs.some(p => p.phase === 'design' || p.phase === 'planning')) {
          sdPhase = 'planning';
        }

        // Normalize status to preferred value
        const normalizedStatus = this.statusValidator.normalizeStatus('SD', sd.status);

        return {
          id: sd.id,
          filename: `${sd.sd_key}.md`,
          type: 'SD',
          title: sd.title,
          description: sd.description,
          category: sd.category,
          sdKey: sd.sd_key,
          priority: sd.priority || 'medium',
          targetOutcome: sd.target_outcome,
          targetApplication: sd.target_application,
          status: normalizedStatus,
          metadata: {
            'SD Key': sd.sd_key,
            Status: normalizedStatus,
            Category: sd.category,
            Priority: sd.priority || 'medium',
            'Target Application': sd.target_application,
            Owner: sd.owner,
            'Decision Log Reference': sd.decision_log_ref,
            'Evidence Reference': sd.evidence_ref,
            'Approved At': sd.approved_at
          },
          checklist: this.extractChecklist(sd),
          content: sd.content || this.generateSDContent(sd),
          progress: overallProgress,
          progressBreakdown,
          phase: sdPhase,
          phaseProgress: sd.phase_progress || {},

          // Add backlog information
          h_count: backlogInfo.h_count || sd.h_count || 0,
          m_count: backlogInfo.m_count || sd.m_count || 0,
          l_count: backlogInfo.l_count || sd.l_count || 0,
          future_count: backlogInfo.future_count || sd.future_count || 0,
          must_have_count: backlogInfo.must_have_count || sd.must_have_count || 0,
          must_have_pct: backlogInfo.must_have_pct || sd.must_have_pct || 0,
          rolled_triage: backlogInfo.rolled_triage || sd.rolled_triage || 0,
          total_items: backlogInfo.total_items || sd.total_items || 0,

          // Add backlog information for on-demand summary generation
          backlogItemCount: backlogItemCount,
          hasBacklogItems: backlogItemCount > 0,

          createdAt: sd.created_at,
          updatedAt: sd.updated_at || sd.created_at
        };
      });

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
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot load PRDs');
      return [];
    }

    const supabase = this.connectionManager.getClient();

    try {
      // Load PRDs first, then get SD titles separately
      const { data, error } = await supabase
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
        const { data: sds } = await supabase
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
          validation_checklist: prd.validation_checklist || [],
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
    if (!this.connectionManager.isReady()) {
      return [];
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('execution_sequences_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading Execution Sequences:', error.message);
        return [];
      }

      console.log(`📊 Loaded ${data.length} Execution Sequences from database`);
      return data;
    } catch (error) {
      console.error('❌ Failed to load Execution Sequences:', error.message);
      return [];
    }
  }

  // Helper methods preserved as-is
  extractChecklist(sd) {
    // Split checklist string into array items
    const checklistItems = (sd.checklist || '').split('\n').filter(item => item.trim());
    return checklistItems.map(item => ({
      text: item.replace(/^-\s*/, '').replace(/^☑\s*/, '').replace(/^☐\s*/, ''),
      checked: item.includes('☑')
    }));
  }

  combinePRDChecklists(prd) {
    const allItems = [];

    if (prd.functional_requirements?.length > 0) {
      prd.functional_requirements.forEach(req => {
        allItems.push({
          text: `[Functional] ${req}`,
          checked: false,
          category: 'functional'
        });
      });
    }

    if (prd.test_scenarios?.length > 0) {
      prd.test_scenarios.forEach(scenario => {
        allItems.push({
          text: `[Test] ${scenario}`,
          checked: false,
          category: 'test'
        });
      });
    }

    if (prd.acceptance_criteria?.length > 0) {
      prd.acceptance_criteria.forEach(criteria => {
        allItems.push({
          text: `[Acceptance] ${criteria}`,
          checked: false,
          category: 'acceptance'
        });
      });
    }

    return allItems;
  }

  generateSDContent(sd) {
    // Generate content matching the exact same format as before
    return `# ${sd.title}

## Overview
${sd.description || 'No description provided'}

## Metadata
- **SD Key**: ${sd.sd_key}
- **Category**: ${sd.category}
- **Priority**: ${sd.priority || 'medium'}
- **Status**: ${sd.status}
- **Owner**: ${sd.owner || 'Unassigned'}

## Target Outcome
${sd.target_outcome || 'No target outcome specified'}

## References
- **Decision Log**: ${sd.decision_log_ref || 'N/A'}
- **Evidence**: ${sd.evidence_ref || 'N/A'}
- **Approved At**: ${sd.approved_at || 'Not approved'}

## Checklist
${(sd.checklist || '').split('\n').filter(item => item.trim()).map(item => `- ${item}`).join('\n') || '- No checklist items'}

## Progress Summary
- **H Priority Items**: ${sd.h_count || 0}
- **M Priority Items**: ${sd.m_count || 0}
- **L Priority Items**: ${sd.l_count || 0}
- **Future Items**: ${sd.future_count || 0}
- **Must Have Items**: ${sd.must_have_count || 0} (${sd.must_have_pct || 0}%)
- **Total Items**: ${sd.total_items || 0}

---
*Generated from database record*`;
  }

  generatePRDContent(prd) {
    // Generate PRD content - preserved from original
    // This is a large method but will be kept as-is for PR #1
    return `# ${prd.title}

## Executive Summary
${prd.executive_summary || 'No summary provided'}

## Metadata
- **Status**: ${prd.status}
- **Priority**: ${prd.priority}
- **Category**: ${prd.category}
- **Phase**: ${prd.phase}
- **Version**: ${prd.version || '1.0'}

## Functional Requirements
${prd.functional_requirements?.map(req => `- ${req}`).join('\n') || '- No functional requirements specified'}

## Non-Functional Requirements
${prd.non_functional_requirements?.map(req => `- ${req}`).join('\n') || '- No non-functional requirements specified'}

## Technical Requirements
${prd.technical_requirements?.map(req => `- ${req}`).join('\n') || '- No technical requirements specified'}

## Test Scenarios
${prd.test_scenarios?.map(scenario => `- ${scenario}`).join('\n') || '- No test scenarios specified'}

## Acceptance Criteria
${prd.acceptance_criteria?.map(criteria => `- ${criteria}`).join('\n') || '- No acceptance criteria specified'}

## Risks
${prd.risks?.map(risk => `- ${risk}`).join('\n') || '- No risks identified'}

## Constraints
${prd.constraints?.map(constraint => `- ${constraint}`).join('\n') || '- No constraints identified'}

## Assumptions
${prd.assumptions?.map(assumption => `- ${assumption}`).join('\n') || '- No assumptions identified'}

## Stakeholders
${prd.stakeholders?.map(stakeholder => `- ${stakeholder}`).join('\n') || '- No stakeholders identified'}

---
*Generated from database record*`;
  }

}

export default StrategicLoaders;