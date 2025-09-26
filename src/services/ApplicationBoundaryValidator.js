/**
 * ApplicationBoundaryValidator Service
 * Enforces strict separation between EHG and EHG_ENGINEER applications
 * Part of PRD-BACKLOG-INT-001 implementation
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export class ApplicationBoundaryValidator {
  constructor() {
    this.viewsAvailable = null; // Will be checked on first use
    this.validationCache = new Map();
  }

  /**
   * Check if required views exist in database
   */
  async checkViewsExist() {
    if (this.viewsAvailable !== null) return this.viewsAvailable;

    try {
      // Try to query the validation view
      const { error } = await supabase
        .from('v_backlog_validation')
        .select('sd_id')
        .limit(1);

      this.viewsAvailable = !error;

      if (!this.viewsAvailable) {
        console.log(chalk.yellow('⚠️  Backlog validation views not available. Operating in degraded mode.'));
        console.log(chalk.yellow('   Please create views using: database/migrations/2025-09-24-backlog-integration-views.sql'));
      }

      return this.viewsAvailable;
    } catch (err) {
      this.viewsAvailable = false;
      return false;
    }
  }

  /**
   * Validate that an SD has proper target_application set
   * @param {string} sdId - Strategic Directive ID
   * @returns {object} Validation result with status and details
   */
  async validateSD(sdId) {
    // Check cache first
    const cacheKey = `sd_${sdId}`;
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    try {
      // Get SD details
      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, target_application, status')
        .eq('id', sdId)
        .single();

      if (error || !sd) {
        return {
          valid: false,
          error: `SD ${sdId} not found`,
          recommendation: 'Verify SD exists in database'
        };
      }

      // Check if target_application is set
      if (!sd.target_application) {
        return {
          valid: false,
          error: 'target_application not specified',
          recommendation: 'Set target_application to either EHG or EHG_ENGINEER',
          sd: sd
        };
      }

      // Validate target_application value
      if (!['EHG', 'EHG_ENGINEER'].includes(sd.target_application)) {
        return {
          valid: false,
          error: `Invalid target_application: ${sd.target_application}`,
          recommendation: 'Use either EHG or EHG_ENGINEER',
          sd: sd
        };
      }

      const result = {
        valid: true,
        target_application: sd.target_application,
        sd_title: sd.title,
        message: `SD validated for ${sd.target_application} application`
      };

      // Cache successful validation
      this.validationCache.set(cacheKey, result);
      return result;

    } catch (err) {
      return {
        valid: false,
        error: err.message,
        recommendation: 'Check database connection and SD existence'
      };
    }
  }

  /**
   * Validate that implementation path matches target application
   * @param {string} sdId - Strategic Directive ID
   * @param {string} targetPath - File or directory path for implementation
   * @returns {object} Validation result
   */
  async validateImplementation(sdId, targetPath) {
    // First validate the SD itself
    const sdValidation = await this.validateSD(sdId);
    if (!sdValidation.valid) {
      return sdValidation;
    }

    const targetApp = sdValidation.target_application;

    // Define path patterns for each application
    const pathPatterns = {
      EHG_ENGINEER: [
        /\/scripts\//,
        /\/LEO\//i,
        /\/leo\//i,
        /generate.*prd/i,
        /handoff/i,
        /claude\.md/i,
        /\/ops\//
      ],
      EHG: [
        /\/src\/client\//,
        /\/components\//,
        /dashboard/i,
        /\/ui\//,
        /\/pages\//,
        /\/app\//
      ]
    };

    const patterns = pathPatterns[targetApp] || [];
    const oppositePatterns = pathPatterns[targetApp === 'EHG' ? 'EHG_ENGINEER' : 'EHG'] || [];

    // Check if path matches expected patterns
    const matchesExpected = patterns.some(pattern => pattern.test(targetPath));
    const matchesOpposite = oppositePatterns.some(pattern => pattern.test(targetPath));

    if (matchesOpposite && !matchesExpected) {
      return {
        valid: false,
        error: 'Cross-application boundary violation detected',
        details: {
          sd_id: sdId,
          target_application: targetApp,
          implementation_path: targetPath,
          violation: `Path appears to be for ${targetApp === 'EHG' ? 'EHG_ENGINEER' : 'EHG'} but SD targets ${targetApp}`
        },
        recommendation: `Move implementation to appropriate ${targetApp} directory structure`
      };
    }

    return {
      valid: true,
      message: `Path ${targetPath} validated for ${targetApp} implementation`
    };
  }

  /**
   * Check for cross-contamination in backlog items
   * @param {string} sdId - Strategic Directive ID
   * @returns {object} Contamination check results
   */
  async checkCrossContamination(sdId) {
    // Check if views are available
    const viewsExist = await this.checkViewsExist();

    if (!viewsExist) {
      // Fallback: Do basic keyword checking without views
      return this.checkCrossContaminationFallback(sdId);
    }

    try {
      // Query the validation view
      const { data, error } = await supabase
        .from('v_backlog_validation')
        .select('*')
        .eq('sd_id', sdId)
        .single();

      if (error) {
        console.error(chalk.red('Error checking contamination:'), error.message);
        return this.checkCrossContaminationFallback(sdId);
      }

      if (!data) {
        return {
          clean: true,
          message: 'No backlog data found for validation'
        };
      }

      const issues = [];

      if (data.potential_ehg_in_engineer > 0) {
        issues.push({
          type: 'EHG_IN_ENGINEER',
          count: data.potential_ehg_in_engineer,
          severity: 'HIGH',
          message: `${data.potential_ehg_in_engineer} EHG business items found in EHG_ENGINEER SD`
        });
      }

      if (data.potential_engineer_in_ehg > 0) {
        issues.push({
          type: 'ENGINEER_IN_EHG',
          count: data.potential_engineer_in_ehg,
          severity: 'HIGH',
          message: `${data.potential_engineer_in_ehg} EHG_ENGINEER platform items found in EHG SD`
        });
      }

      return {
        clean: issues.length === 0,
        issues: issues,
        summary: {
          sd_id: sdId,
          total_items: data.total_items,
          completed_items: data.completed_items,
          completion_percentage: data.completion_percentage
        },
        recommendation: issues.length > 0
          ? 'Review backlog items and reassign to correct SD based on target application'
          : 'No cross-contamination detected'
      };

    } catch (err) {
      console.error(chalk.red('Contamination check failed:'), err.message);
      return this.checkCrossContaminationFallback(sdId);
    }
  }

  /**
   * Fallback contamination check when views aren't available
   */
  async checkCrossContaminationFallback(sdId) {
    try {
      // Get SD and its backlog items
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('*, sd_backlog_map(*)')
        .eq('id', sdId)
        .single();

      if (!sd || !sd.sd_backlog_map) {
        return {
          clean: true,
          message: 'No backlog data available for validation',
          fallback: true
        };
      }

      const targetApp = sd.target_application;
      const items = sd.sd_backlog_map || [];

      // Keywords indicating wrong application
      const ehgKeywords = /business|venture|customer|revenue|market/i;
      const engineerKeywords = /LEO|protocol|agent|handoff|claude|dashboard/i;

      const issues = [];
      let suspiciousCount = 0;

      items.forEach(item => {
        const text = `${item.backlog_title} ${item.item_description || ''}`;

        if (targetApp === 'EHG_ENGINEER' && ehgKeywords.test(text)) {
          suspiciousCount++;
        } else if (targetApp === 'EHG' && engineerKeywords.test(text)) {
          suspiciousCount++;
        }
      });

      if (suspiciousCount > 0) {
        issues.push({
          type: 'KEYWORD_MISMATCH',
          count: suspiciousCount,
          severity: 'MEDIUM',
          message: `${suspiciousCount} items may belong to wrong application based on keywords`
        });
      }

      return {
        clean: issues.length === 0,
        issues: issues,
        fallback: true,
        message: 'Using keyword-based validation (views not available)',
        recommendation: issues.length > 0
          ? 'Manual review recommended - keyword analysis suggests potential misalignment'
          : 'No obvious contamination detected (keyword-based check)'
      };

    } catch (err) {
      return {
        clean: true,
        error: err.message,
        fallback: true,
        message: 'Unable to perform contamination check'
      };
    }
  }

  /**
   * Generate a validation report for an SD
   */
  async generateValidationReport(sdId) {
    console.log(chalk.blue('\n📊 Application Boundary Validation Report'));
    console.log(chalk.blue('=' .repeat(50)));

    // Validate SD
    const sdValidation = await this.validateSD(sdId);
    console.log('\n📋 SD Validation:');
    if (sdValidation.valid) {
      console.log(chalk.green(`✅ Valid - Target: ${sdValidation.target_application}`));
    } else {
      console.log(chalk.red(`❌ Invalid - ${sdValidation.error}`));
      console.log(chalk.yellow(`   Recommendation: ${sdValidation.recommendation}`));
    }

    // Check contamination
    const contamination = await this.checkCrossContamination(sdId);
    console.log('\n🔍 Cross-Contamination Check:');
    if (contamination.clean) {
      console.log(chalk.green('✅ No contamination detected'));
    } else {
      console.log(chalk.red(`❌ ${contamination.issues.length} issue(s) found:`));
      contamination.issues.forEach(issue => {
        console.log(chalk.yellow(`   - ${issue.message} [${issue.severity}]`));
      });
    }

    if (contamination.fallback) {
      console.log(chalk.yellow('   ⚠️  Operating in fallback mode (views not available)'));
    }

    console.log(chalk.blue('=' .repeat(50)));

    return {
      sd_validation: sdValidation,
      contamination_check: contamination,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
    this.viewsAvailable = null;
  }
}

// Export singleton instance
export default new ApplicationBoundaryValidator();