#!/usr/bin/env node

/**
 * PRD to UI Validation Module
 * LEO Protocol v4.3.1 Enhancement
 * 
 * Purpose: Validates that UI implementations match PRD requirements
 * Detects gaps between what was specified and what was built
 */

import { chromium } from 'playwright';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

class PRDUIValidator {
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || 'http://localhost:8080', // SD-ARCH-EHG-007: EHG unified frontend
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      screenshotDir: config.screenshotDir || 'test-results/prd-validation/screenshots',
      ...config
    };
    
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    this.browser = null;
    this.page = null;
    this.validationResults = {
      prdId: null,
      totalRequirements: 0,
      implementedRequirements: 0,
      missingRequirements: [],
      gaps: [],
      screenshots: [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Load PRD requirements from database
   */
  async loadPRDRequirements(prdId) {
    try {
      // First check if we have existing mappings
      let { data: mappings, error } = await this.supabase
        .from('prd_ui_mappings')
        .select('*')
        .eq('prd_id', prdId);
      
      if (error) throw error;
      
      // If no mappings exist, extract from PRD
      if (!mappings || mappings.length === 0) {
        mappings = await this.extractPRDRequirements(prdId);
      }
      
      return mappings;
    } catch (error) {
      console.error('❌ Failed to load PRD requirements:', error);
      return [];
    }
  }

  /**
   * Extract UI requirements from PRD
   */
  async extractPRDRequirements(prdId) {
    try {
      const { data: prd, error } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();
      
      if (error) throw error;
      
      const requirements = [];
      
      // Extract functional requirements that relate to UI
      if (prd.functional_requirements) {
        prd.functional_requirements.forEach((req, index) => {
          if (this.isUIRequirement(req)) {
            requirements.push({
              prd_id: prdId,
              requirement_id: `FR-${index + 1}`,
              requirement_text: typeof req === 'string' ? req : req.description,
              ui_component: this.inferComponent(req),
              priority: 'high'
            });
          }
        });
      }
      
      // Check for specific UI components mentioned in PRD
      const uiKeywords = [
        'DirectiveLab', 'PACER', 'feedback', 'screenshot',
        'button', 'form', 'input', 'display', 'interface',
        'dashboard', 'navigation', 'menu', 'modal', 'dialog'
      ];
      
      const content = JSON.stringify(prd).toLowerCase();
      uiKeywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          requirements.push({
            prd_id: prdId,
            requirement_id: `UI-${keyword}`,
            requirement_text: `UI should include ${keyword} functionality`,
            ui_component: keyword,
            priority: 'medium'
          });
        }
      });
      
      // Store mappings in database
      if (requirements.length > 0) {
        const { error: insertError } = await this.supabase
          .from('prd_ui_mappings')
          .upsert(requirements, { onConflict: 'prd_id,requirement_id' });
        
        if (insertError) console.error('Failed to store mappings:', insertError);
      }
      
      return requirements;
    } catch (error) {
      console.error('❌ Failed to extract PRD requirements:', error);
      return [];
    }
  }

  /**
   * Check if a requirement relates to UI
   */
  isUIRequirement(requirement) {
    const uiTerms = [
      'ui', 'interface', 'display', 'show', 'render', 'button',
      'form', 'input', 'screen', 'page', 'modal', 'dialog',
      'navigation', 'menu', 'layout', 'component', 'widget'
    ];
    
    const reqText = typeof requirement === 'string' 
      ? requirement.toLowerCase() 
      : JSON.stringify(requirement).toLowerCase();
    
    return uiTerms.some(term => reqText.includes(term));
  }

  /**
   * Infer component type from requirement
   */
  inferComponent(requirement) {
    const reqText = typeof requirement === 'string' 
      ? requirement.toLowerCase() 
      : JSON.stringify(requirement).toLowerCase();
    
    if (reqText.includes('button')) return 'button';
    if (reqText.includes('form') || reqText.includes('input')) return 'form';
    if (reqText.includes('modal') || reqText.includes('dialog')) return 'modal';
    if (reqText.includes('navigation') || reqText.includes('menu')) return 'navigation';
    if (reqText.includes('dashboard')) return 'dashboard';
    if (reqText.includes('feedback')) return 'feedback-form';
    
    return 'generic-component';
  }

  /**
   * Validate UI against PRD requirements
   */
  async validateUI(prdId) {
    this.validationResults.prdId = prdId;
    
    try {
      // Load requirements
      const requirements = await this.loadPRDRequirements(prdId);
      this.validationResults.totalRequirements = requirements.length;
      
      console.log(`📋 Validating ${requirements.length} UI requirements for PRD: ${prdId}`);
      
      // Setup browser
      this.browser = await chromium.launch({ 
        headless: this.config.headless 
      });
      this.page = await this.browser.newPage();
      
      // Navigate to application
      await this.page.goto(this.config.baseURL, { 
        waitUntil: 'networkidle' 
      });
      
      // Validate each requirement
      for (const req of requirements) {
        const isImplemented = await this.checkRequirement(req);
        
        if (isImplemented) {
          this.validationResults.implementedRequirements++;
          await this.updateMapping(req.requirement_id, true);
        } else {
          this.validationResults.missingRequirements.push(req);
          this.validationResults.gaps.push({
            requirement: req.requirement_text,
            component: req.ui_component,
            reason: 'Component not found in UI'
          });
        }
      }
      
      // Take comprehensive screenshots
      await this.captureEvidence();
      
      // Calculate validation score
      this.validationResults.successRate = 
        (this.validationResults.implementedRequirements / 
         this.validationResults.totalRequirements * 100).toFixed(2);
      
      // Store results in database
      await this.storeValidationResults();
      
      return this.validationResults;
      
    } catch (error) {
      console.error('❌ UI validation failed:', error);
      throw error;
    } finally {
      if (this.browser) await this.browser.close();
    }
  }

  /**
   * Check if a specific requirement is implemented
   */
  async checkRequirement(requirement) {
    try {
      // Build selectors based on requirement
      const selectors = this.buildSelectors(requirement);
      
      // Check for element existence
      for (const selector of selectors) {
        try {
          const element = await this.page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 2000 });
          
          if (isVisible) {
            console.log(`✅ Found: ${requirement.requirement_id} - ${selector}`);
            
            // Take screenshot of the element
            const screenshotPath = path.join(
              this.config.screenshotDir,
              `${requirement.requirement_id}-implemented.png`
            );
            await element.screenshot({ path: screenshotPath });
            this.validationResults.screenshots.push(screenshotPath);
            
            return true;
          }
        } catch (e) {
          // Element not found with this selector, try next
        }
      }
      
      console.log(`❌ Missing: ${requirement.requirement_id} - ${requirement.requirement_text}`);
      return false;
      
    } catch (error) {
      console.error(`Error checking requirement ${requirement.requirement_id}:`, error);
      return false;
    }
  }

  /**
   * Build selectors for a requirement
   */
  buildSelectors(requirement) {
    const selectors = [];
    const component = requirement.ui_component?.toLowerCase() || '';
    const text = requirement.requirement_text?.toLowerCase() || '';
    
    // Component-specific selectors
    if (component.includes('button')) {
      selectors.push('button', '[role="button"]', '.btn');
    }
    if (component.includes('form')) {
      selectors.push('form', '.form', '[data-testid*="form"]');
    }
    if (component.includes('feedback')) {
      selectors.push('[data-testid*="feedback"]', '.feedback', '#feedback');
    }
    if (component.includes('directivelab')) {
      selectors.push('[data-testid*="directive"]', '.directive-lab', '#directivelab');
    }
    if (component.includes('pacer')) {
      selectors.push('[data-testid*="pacer"]', '.pacer', '#pacer');
    }
    
    // Text-based selectors
    if (text.includes('screenshot')) {
      selectors.push('input[type="file"]', '[data-testid*="upload"]', '.upload');
    }
    if (text.includes('validation')) {
      selectors.push('[data-testid*="validation"]', '.validation', '.gate');
    }
    
    // Generic fallback
    if (selectors.length === 0) {
      selectors.push(
        `[data-testid*="${component}"]`,
        `.${component}`,
        `#${component}`
      );
    }
    
    return selectors;
  }

  /**
   * Capture comprehensive evidence
   */
  async captureEvidence() {
    try {
      // Full page screenshot
      const fullPagePath = path.join(
        this.config.screenshotDir,
        `full-page-${Date.now()}.png`
      );
      await this.page.screenshot({ 
        path: fullPagePath, 
        fullPage: true 
      });
      this.validationResults.screenshots.push(fullPagePath);
      
      // Viewport screenshots
      const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' }
      ];
      
      for (const viewport of viewports) {
        await this.page.setViewportSize(viewport);
        const viewportPath = path.join(
          this.config.screenshotDir,
          `viewport-${viewport.name}-${Date.now()}.png`
        );
        await this.page.screenshot({ path: viewportPath });
        this.validationResults.screenshots.push(viewportPath);
      }
      
    } catch (error) {
      console.error('Failed to capture evidence:', error);
    }
  }

  /**
   * Update mapping in database
   */
  async updateMapping(requirementId, isImplemented) {
    try {
      const { error } = await this.supabase
        .from('prd_ui_mappings')
        .update({
          is_implemented: isImplemented,
          is_validated: true,
          validation_date: new Date().toISOString()
        })
        .eq('prd_id', this.validationResults.prdId)
        .eq('requirement_id', requirementId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Failed to update mapping:', error);
    }
  }

  /**
   * Store validation results in database
   */
  async storeValidationResults() {
    try {
      const testRunId = `test-${this.validationResults.prdId}-${Date.now()}`;
      
      const { data, error } = await this.supabase
        .from('ui_validation_results')
        .insert({
          prd_id: this.validationResults.prdId,
          test_run_id: testRunId,
          test_type: 'prd_validation',
          total_tests: this.validationResults.totalRequirements,
          passed_tests: this.validationResults.implementedRequirements,
          failed_tests: this.validationResults.missingRequirements.length,
          success_rate: parseFloat(this.validationResults.successRate),
          validation_status: this.validationResults.successRate >= 80 ? 'passed' : 'failed',
          ui_complete: this.validationResults.successRate === '100.00',
          gaps_detected: this.validationResults.gaps,
          screenshots: this.validationResults.screenshots,
          test_report: this.validationResults
        });
      
      if (error) throw error;
      
      console.log(`📊 Validation results stored: ${testRunId}`);
      return data;
      
    } catch (error) {
      console.error('Failed to store validation results:', error);
    }
  }

  /**
   * Generate gap analysis report
   */
  generateGapReport() {
    const report = {
      summary: {
        prdId: this.validationResults.prdId,
        totalRequirements: this.validationResults.totalRequirements,
        implemented: this.validationResults.implementedRequirements,
        missing: this.validationResults.missingRequirements.length,
        completionRate: this.validationResults.successRate + '%'
      },
      gaps: this.validationResults.gaps,
      missingComponents: this.validationResults.missingRequirements.map(req => ({
        id: req.requirement_id,
        description: req.requirement_text,
        component: req.ui_component,
        priority: req.priority
      })),
      recommendations: this.generateRecommendations(),
      evidence: {
        screenshots: this.validationResults.screenshots,
        timestamp: this.validationResults.timestamp
      }
    };
    
    return report;
  }

  /**
   * Generate implementation recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.validationResults.gaps.length > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'Implement missing UI components',
        details: `${this.validationResults.gaps.length} UI requirements are not implemented`
      });
    }
    
    // Check for specific missing components
    const missingComponents = new Set(
      this.validationResults.missingRequirements.map(r => r.ui_component)
    );
    
    if (missingComponents.has('DirectiveLab')) {
      recommendations.push({
        priority: 'high',
        action: 'Implement DirectiveLab interface',
        details: 'Core SDIP functionality is missing'
      });
    }
    
    if (missingComponents.has('feedback-form')) {
      recommendations.push({
        priority: 'high',
        action: 'Add feedback submission form',
        details: 'User feedback collection interface required'
      });
    }
    
    if (this.validationResults.successRate < 50) {
      recommendations.push({
        priority: 'critical',
        action: 'Major UI implementation required',
        details: 'Less than 50% of PRD requirements are implemented'
      });
    }
    
    return recommendations;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PRDUIValidator({
    headless: process.argv.includes('--headless')
  });
  
  const prdId = process.argv.find(arg => arg.startsWith('--prd='))?.split('=')[1] 
    || 'PRD-1756934172732'; // Default to SDIP PRD
  
  console.log('🔍 Starting PRD to UI Validation...');
  console.log(`📋 PRD ID: ${prdId}`);
  
  validator.validateUI(prdId)
    .then(results => {
      const report = validator.generateGapReport();
      
      console.log('\n📊 Validation Report:');
      console.log('====================');
      console.log(`✅ Implemented: ${report.summary.implemented}/${report.summary.totalRequirements}`);
      console.log(`❌ Missing: ${report.summary.missing}`);
      console.log(`📈 Completion: ${report.summary.completionRate}`);
      
      if (report.gaps.length > 0) {
        console.log('\n🔍 Gaps Detected:');
        report.gaps.forEach(gap => {
          console.log(`  - ${gap.component}: ${gap.requirement}`);
        });
      }
      
      if (report.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => {
          console.log(`  [${rec.priority.toUpperCase()}] ${rec.action}`);
          console.log(`    ${rec.details}`);
        });
      }
      
      // Save report
      const reportPath = path.join(
        'test-results/prd-validation',
        `gap-report-${prdId}-${Date.now()}.json`
      );
      fs.writeFile(reportPath, JSON.stringify(report, null, 2))
        .then(() => console.log(`\n📄 Report saved: ${reportPath}`));
      
      process.exit(results.successRate === '100.00' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
}

export default PRDUIValidator;