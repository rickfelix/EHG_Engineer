#!/usr/bin/env node

/**
 * PRD Requirement Extractor Service
 * Parses PRD and extracts UI-related requirements for validation
 * Part of UI Validation Enforcement System
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class PRDRequirementExtractor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // UI-related keywords that indicate a requirement needs UI validation
    this.uiKeywords = [
      'button', 'click', 'form', 'input', 'field', 'display', 'show', 'hide',
      'modal', 'dialog', 'screen', 'page', 'view', 'component', 'interface',
      'navigation', 'menu', 'tab', 'panel', 'section', 'layout', 'responsive',
      'mobile', 'desktop', 'user can', 'user should', 'user must', 'user will',
      'wizard', 'step', 'progress', 'indicator', 'notification', 'alert',
      'dropdown', 'select', 'checkbox', 'radio', 'toggle', 'switch',
      'table', 'list', 'grid', 'card', 'dashboard', 'sidebar', 'header',
      'screenshot', 'upload', 'download', 'drag', 'drop', 'scroll', 'resize'
    ];
    
    // Component mapping for DirectiveLab specific requirements
    this.componentMappings = {
      'input': { selector: 'input, textarea', testId: 'input-field' },
      'button': { selector: 'button', testId: 'action-button' },
      'form': { selector: 'form', testId: 'form-container' },
      'wizard': { selector: '[data-testid*="wizard"]', testId: 'step-wizard' },
      'screenshot': { selector: '[data-testid*="screenshot"]', testId: 'screenshot-uploader' },
      'submission': { selector: '[data-testid*="submission"]', testId: 'submission-list' },
      'progress': { selector: '[data-testid*="progress"]', testId: 'progress-indicator' },
      'modal': { selector: '[role="dialog"]', testId: 'modal-dialog' }
    };
  }

  /**
   * Extract all UI requirements from a PRD
   */
  async extractRequirements(prdId) {
    console.log(`📋 Extracting UI requirements from PRD: ${prdId}`);
    
    // Fetch PRD from database
    const { data: prd, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();
    
    if (error || !prd) {
      throw new Error(`Failed to fetch PRD: ${error?.message || 'Not found'}`);
    }
    
    const requirements = [];
    let requirementId = 1;
    
    // Extract from functional requirements
    if (prd.functional_requirements && Array.isArray(prd.functional_requirements)) {
      for (const req of prd.functional_requirements) {
        const extracted = this.extractUIRequirement(req, `FR-${requirementId++}`, prdId);
        if (extracted) {
          requirements.push(extracted);
        }
      }
    }
    
    // Extract from technical requirements (especially for SDIP DirectiveLab)
    if (prd.technical_requirements) {
      if (prd.technical_requirements.components) {
        for (const component of prd.technical_requirements.components) {
          if (component.requirements) {
            for (const req of component.requirements) {
              const extracted = this.extractUIRequirement(
                { description: req, component: component.name },
                `TR-${requirementId++}`,
                prdId
              );
              if (extracted) {
                requirements.push(extracted);
              }
            }
          }
        }
      }
      
      // Check for UI specifications
      if (prd.technical_requirements.ui_specifications) {
        for (const spec of prd.technical_requirements.ui_specifications) {
          requirements.push({
            prd_id: prdId,
            requirement_id: `UI-${requirementId++}`,
            requirement_text: spec,
            ui_component: this.inferComponent(spec),
            ui_selector: this.inferSelector(spec),
            ui_testid: this.inferTestId(spec),
            expected_behavior: spec,
            priority: 'high',
            is_implemented: false,
            is_validated: false
          });
        }
      }
    }
    
    // Special handling for DirectiveLab requirements
    if (prd.title && prd.title.includes('DirectiveLab')) {
      requirements.push(...this.getDirectiveLabRequirements(prdId));
    }
    
    return requirements;
  }

  /**
   * Extract UI requirement from a requirement object or string
   */
  extractUIRequirement(req, id, prdId) {
    const text = typeof req === 'string' ? req : req.description || req.requirement || '';
    
    // Check if this is a UI-related requirement
    if (!this.isUIRequirement(text)) {
      return null;
    }
    
    const component = this.inferComponent(text);
    
    return {
      prd_id: prdId,
      requirement_id: id,
      requirement_text: text,
      ui_component: component,
      ui_selector: this.inferSelector(text),
      ui_testid: this.inferTestId(text),
      expected_behavior: this.inferExpectedBehavior(text),
      priority: this.inferPriority(text),
      is_implemented: false,
      is_validated: false
    };
  }

  /**
   * Check if a requirement is UI-related
   */
  isUIRequirement(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.uiKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Infer UI component from requirement text
   */
  inferComponent(text) {
    if (!text) return 'unknown';
    const lowerText = text.toLowerCase();
    
    // Check for specific components
    if (lowerText.includes('wizard') || lowerText.includes('step')) return 'wizard';
    if (lowerText.includes('screenshot')) return 'screenshot-uploader';
    if (lowerText.includes('submission')) return 'submission-list';
    if (lowerText.includes('button')) return 'button';
    if (lowerText.includes('form')) return 'form';
    if (lowerText.includes('input') || lowerText.includes('field')) return 'input';
    if (lowerText.includes('modal') || lowerText.includes('dialog')) return 'modal';
    if (lowerText.includes('progress')) return 'progress-indicator';
    if (lowerText.includes('table') || lowerText.includes('list')) return 'list';
    if (lowerText.includes('dashboard')) return 'dashboard';
    
    return 'component';
  }

  /**
   * Infer CSS selector from requirement
   */
  inferSelector(text) {
    const component = this.inferComponent(text);
    return this.componentMappings[component]?.selector || '[data-testid]';
  }

  /**
   * Infer test ID from requirement
   */
  inferTestId(text) {
    const component = this.inferComponent(text);
    return this.componentMappings[component]?.testId || 'ui-element';
  }

  /**
   * Infer expected behavior from requirement
   */
  inferExpectedBehavior(text) {
    if (!text) return 'Element should be present and functional';
    
    // Extract action words
    const actionPatterns = [
      /user (?:can|should|must|will) (.+)/i,
      /allow(?:s|ing)? (.+)/i,
      /enable(?:s|ing)? (.+)/i,
      /display(?:s|ing)? (.+)/i,
      /show(?:s|ing)? (.+)/i
    ];
    
    for (const pattern of actionPatterns) {
      const match = text.match(pattern);
      if (match) {
        return `Element should ${match[1]}`;
      }
    }
    
    return text.length > 200 ? text.substring(0, 200) + '...' : text;
  }

  /**
   * Infer priority from requirement
   */
  inferPriority(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('must') || lowerText.includes('critical')) return 'critical';
    if (lowerText.includes('should') || lowerText.includes('important')) return 'high';
    if (lowerText.includes('could') || lowerText.includes('optional')) return 'low';
    return 'medium';
  }

  /**
   * Get specific DirectiveLab requirements
   */
  getDirectiveLabRequirements(prdId) {
    return [
      {
        prd_id: prdId,
        requirement_id: 'DL-1',
        requirement_text: 'DirectiveLab should have a 6-step wizard interface',
        ui_component: 'wizard',
        ui_selector: '[data-testid="step-wizard"]',
        ui_testid: 'directive-lab-wizard',
        expected_behavior: 'Wizard with 6 steps should be visible and navigable',
        priority: 'critical',
        is_implemented: false,
        is_validated: false
      },
      {
        prd_id: prdId,
        requirement_id: 'DL-2',
        requirement_text: 'Recent submissions panel should display submission history',
        ui_component: 'submission-list',
        ui_selector: '[data-testid="recent-submissions"]',
        ui_testid: 'recent-submissions-panel',
        expected_behavior: 'Panel shows list of recent directive submissions',
        priority: 'high',
        is_implemented: false,
        is_validated: false
      },
      {
        prd_id: prdId,
        requirement_id: 'DL-3',
        requirement_text: 'Screenshot upload functionality in step 1',
        ui_component: 'screenshot-uploader',
        ui_selector: '[data-testid="screenshot-upload"]',
        ui_testid: 'screenshot-uploader',
        expected_behavior: 'Users can upload or paste screenshots',
        priority: 'high',
        is_implemented: false,
        is_validated: false
      },
      {
        prd_id: prdId,
        requirement_id: 'DL-4',
        requirement_text: 'Progress indicator shows current step',
        ui_component: 'progress-indicator',
        ui_selector: '[data-testid="progress-indicator"]',
        ui_testid: 'wizard-progress',
        expected_behavior: 'Progress bar updates as user moves through steps',
        priority: 'medium',
        is_implemented: false,
        is_validated: false
      },
      {
        prd_id: prdId,
        requirement_id: 'DL-5',
        requirement_text: 'Validation gates prevent moving to next step without completion',
        ui_component: 'validation-gate',
        ui_selector: '[data-testid="next-button"]:disabled',
        ui_testid: 'step-validation',
        expected_behavior: 'Next button disabled until current step requirements met',
        priority: 'critical',
        is_implemented: false,
        is_validated: false
      }
    ];
  }

  /**
   * Save extracted requirements to database
   */
  async saveRequirements(requirements) {
    console.log(`💾 Saving ${requirements.length} requirements to database`);
    
    for (const req of requirements) {
      const { error } = await this.supabase
        .from('prd_ui_mappings')
        .upsert(req, {
          onConflict: 'prd_id,requirement_id'
        });
      
      if (error) {
        console.error(`Failed to save requirement ${req.requirement_id}:`, error.message);
      }
    }
    
    console.log('✅ Requirements saved successfully');
    return requirements;
  }

  /**
   * Extract and save requirements for a PRD
   */
  async processPRD(prdId) {
    try {
      const requirements = await this.extractRequirements(prdId);
      console.log(`📊 Extracted ${requirements.length} UI requirements`);
      
      if (requirements.length > 0) {
        await this.saveRequirements(requirements);
        
        // Generate summary
        const summary = {
          total: requirements.length,
          critical: requirements.filter(r => r.priority === 'critical').length,
          high: requirements.filter(r => r.priority === 'high').length,
          medium: requirements.filter(r => r.priority === 'medium').length,
          low: requirements.filter(r => r.priority === 'low').length
        };
        
        console.log('\n📈 Summary:');
        console.log(`   Total Requirements: ${summary.total}`);
        console.log(`   Critical: ${summary.critical}`);
        console.log(`   High: ${summary.high}`);
        console.log(`   Medium: ${summary.medium}`);
        console.log(`   Low: ${summary.low}`);
        
        return { success: true, requirements, summary };
      } else {
        console.log('⚠️ No UI requirements found in PRD');
        return { success: false, requirements: [], summary: null };
      }
    } catch (error) {
      console.error('❌ Failed to process PRD:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PRDRequirementExtractor;

// If run directly, process SDIP PRD
if (require.main === module) {
  const extractor = new PRDRequirementExtractor();
  
  // Process SDIP PRD
  const prdId = process.argv[2] || 'PRD-SD-2025-0903-SDIP';
  
  console.log('🚀 PRD Requirement Extractor');
  console.log('============================\n');
  
  extractor.processPRD(prdId)
    .then(result => {
      if (result.success) {
        console.log('\n✨ Extraction complete!');
      } else {
        console.log('\n❌ Extraction failed');
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}