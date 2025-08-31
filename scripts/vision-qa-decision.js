#!/usr/bin/env node

/**
 * Vision QA Decision Helper Script
 * Helps LEO Protocol agents determine when Vision QA is required
 * Part of LEO Protocol v3.1.5.9
 */

const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class VisionQADecisionHelper {
  constructor() {
    this.decisions = [];
    this.factors = {
      hasUI: false,
      isCustomerFacing: false,
      isPaymentAuth: false,
      requiresAccessibility: false,
      isMobileResponsive: false,
      isInternalTool: false,
      complexity: 'low',
      riskLevel: 'low'
    };
  }

  /**
   * Analyze Strategic Directive or Task for Vision QA requirements
   */
  analyzeRequirement(input) {
    const lowerInput = input.toLowerCase();
    
    // Check for UI components
    if (this.hasUIComponents(lowerInput)) {
      this.factors.hasUI = true;
    }

    // Check if customer-facing
    if (this.isCustomerFacing(lowerInput)) {
      this.factors.isCustomerFacing = true;
      this.factors.riskLevel = 'high';
    }

    // Check for payment/auth
    if (this.isPaymentOrAuth(lowerInput)) {
      this.factors.isPaymentAuth = true;
      this.factors.riskLevel = 'critical';
    }

    // Check accessibility requirements
    if (this.requiresAccessibility(lowerInput)) {
      this.factors.requiresAccessibility = true;
    }

    // Check mobile responsiveness
    if (this.requiresMobileSupport(lowerInput)) {
      this.factors.isMobileResponsive = true;
    }

    // Check if internal tool
    if (this.isInternalOnly(lowerInput)) {
      this.factors.isInternalTool = true;
      this.factors.riskLevel = 'low';
    }

    // Determine complexity
    this.factors.complexity = this.determineComplexity(lowerInput);

    return this.makeDecision();
  }

  /**
   * Check for UI component indicators
   */
  hasUIComponents(text) {
    const uiKeywords = [
      'ui', 'interface', 'frontend', 'page', 'screen', 'form',
      'button', 'dashboard', 'portal', 'view', 'layout', 'component',
      'widget', 'modal', 'dialog', 'menu', 'navigation', 'sidebar'
    ];
    
    return uiKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if customer-facing
   */
  isCustomerFacing(text) {
    const customerKeywords = [
      'customer', 'user', 'client', 'public', 'external',
      'consumer', 'buyer', 'subscriber', 'member', 'visitor'
    ];
    
    return customerKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for payment or authentication
   */
  isPaymentOrAuth(text) {
    const criticalKeywords = [
      'payment', 'billing', 'checkout', 'purchase', 'subscription',
      'auth', 'login', 'register', 'password', 'security', 'oauth',
      'credential', 'signin', 'signup', 'logout'
    ];
    
    return criticalKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check accessibility requirements
   */
  requiresAccessibility(text) {
    const a11yKeywords = [
      'accessibility', 'a11y', 'wcag', 'aria', 'screen reader',
      'keyboard', 'compliant', 'ada', 'inclusive', 'assistive'
    ];
    
    return a11yKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check mobile support requirements
   */
  requiresMobileSupport(text) {
    const mobileKeywords = [
      'mobile', 'responsive', 'tablet', 'viewport', 'breakpoint',
      'ios', 'android', 'touch', 'swipe', 'gesture'
    ];
    
    return mobileKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if internal tool only
   */
  isInternalOnly(text) {
    const internalKeywords = [
      'internal', 'admin', 'staff', 'employee', 'backend',
      'tool', 'utility', 'script', 'migration', 'database'
    ];
    
    const externalKeywords = ['customer', 'user', 'public', 'external'];
    
    const hasInternal = internalKeywords.some(keyword => text.includes(keyword));
    const hasExternal = externalKeywords.some(keyword => text.includes(keyword));
    
    return hasInternal && !hasExternal;
  }

  /**
   * Determine complexity level
   */
  determineComplexity(text) {
    const complexIndicators = [
      'complex', 'multi-step', 'workflow', 'integration', 'real-time',
      'dynamic', 'interactive', 'sophisticated', 'advanced'
    ];
    
    const simpleIndicators = [
      'simple', 'basic', 'static', 'display', 'read-only',
      'informational', 'landing', 'about'
    ];
    
    if (complexIndicators.some(keyword => text.includes(keyword))) {
      return 'high';
    }
    
    if (simpleIndicators.some(keyword => text.includes(keyword))) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Make Vision QA decision based on factors
   */
  makeDecision() {
    // No UI = No Vision QA
    if (!this.factors.hasUI) {
      return {
        required: false,
        reason: 'No UI components detected',
        recommendation: 'NOT_APPLICABLE'
      };
    }

    // Critical systems = Mandatory
    if (this.factors.isPaymentAuth) {
      return {
        required: true,
        reason: 'Payment/Authentication UI requires mandatory testing',
        recommendation: 'MANDATORY',
        config: this.getCriticalConfig()
      };
    }

    // Accessibility = Mandatory
    if (this.factors.requiresAccessibility) {
      return {
        required: true,
        reason: 'Accessibility compliance requires Vision QA',
        recommendation: 'MANDATORY',
        config: this.getAccessibilityConfig()
      };
    }

    // Customer-facing = Required
    if (this.factors.isCustomerFacing) {
      return {
        required: true,
        reason: 'Customer-facing UI requires Vision QA',
        recommendation: 'REQUIRED',
        config: this.getStandardConfig()
      };
    }

    // Mobile responsive = Required
    if (this.factors.isMobileResponsive) {
      return {
        required: true,
        reason: 'Mobile responsive testing requires Vision QA',
        recommendation: 'REQUIRED',
        config: this.getMobileConfig()
      };
    }

    // Internal tool = Optional
    if (this.factors.isInternalTool) {
      return {
        required: false,
        reason: 'Internal tools have optional Vision QA',
        recommendation: 'OPTIONAL',
        config: this.getMinimalConfig()
      };
    }

    // Default for UI components = Recommended
    return {
      required: false,
      reason: 'UI components present, Vision QA recommended',
      recommendation: 'RECOMMENDED',
      config: this.getStandardConfig()
    };
  }

  /**
   * Get configuration for critical systems
   */
  getCriticalConfig() {
    return {
      maxIterations: 50,
      costLimit: 10.00,
      consensusRuns: 3,
      model: 'gpt-5', // Will auto-select, but suggest premium
      bugDetectionSensitivity: 'high',
      testGoals: [
        'Complete critical flow successfully',
        'Verify all error states',
        'Test edge cases',
        'Validate security boundaries'
      ]
    };
  }

  /**
   * Get configuration for accessibility
   */
  getAccessibilityConfig() {
    return {
      maxIterations: 40,
      costLimit: 5.00,
      consensusRuns: 2,
      model: 'claude-sonnet-3.7', // Claude better for accessibility
      checkAccessibility: true,
      testGoals: [
        'Navigate using keyboard only',
        'Verify ARIA labels present',
        'Check color contrast ratios',
        'Test with screen reader simulation'
      ]
    };
  }

  /**
   * Get standard configuration
   */
  getStandardConfig() {
    return {
      maxIterations: 30,
      costLimit: 2.00,
      consensusRuns: 1,
      model: 'auto', // Let system decide
      bugDetectionSensitivity: 'medium',
      testGoals: [
        'Complete main user flow',
        'Verify responsive design',
        'Check for visual bugs'
      ]
    };
  }

  /**
   * Get mobile configuration
   */
  getMobileConfig() {
    return {
      maxIterations: 30,
      costLimit: 3.00,
      viewport: { width: 375, height: 667 },
      testGoals: [
        'Test mobile navigation',
        'Verify touch interactions',
        'Check responsive layouts',
        'Test orientation changes'
      ]
    };
  }

  /**
   * Get minimal configuration
   */
  getMinimalConfig() {
    return {
      maxIterations: 15,
      costLimit: 1.00,
      model: 'gpt-5-nano', // Cheapest option
      testGoals: [
        'Basic functionality check',
        'Smoke test main features'
      ]
    };
  }

  /**
   * Generate LEO Protocol communication snippet
   */
  generateCommunication(decision, agentRole = 'PLAN') {
    const header = `**Vision QA Status:** ${decision.recommendation}`;
    
    if (decision.required) {
      const config = `**Vision QA Configuration:**
\`\`\`json
${JSON.stringify(decision.config, null, 2)}
\`\`\``;
      
      return `${header}
${config}
**Rationale:** ${decision.reason}`;
    }
    
    return `${header}
**Rationale:** ${decision.reason}`;
  }

  /**
   * Interactive CLI mode
   */
  async interactiveMode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`
╔════════════════════════════════════════════════╗
║      Vision QA Decision Helper - LEO v3.1.5.9  ║
╚════════════════════════════════════════════════╝

This tool helps LEO Protocol agents determine when Vision QA is required.
`);

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    // Get agent role
    console.log('\nWhich agent are you?');
    console.log('1. LEAD Agent');
    console.log('2. PLAN Agent');
    console.log('3. EXEC Agent');
    
    const roleChoice = await question('\nSelect (1-3): ');
    const roles = ['LEAD', 'PLAN', 'EXEC'];
    const agentRole = roles[parseInt(roleChoice) - 1] || 'PLAN';

    // Get input type
    console.log('\nWhat are you analyzing?');
    console.log('1. Strategic Directive');
    console.log('2. Task/EES');
    console.log('3. Free text description');
    
    const typeChoice = await question('\nSelect (1-3): ');

    // Get description
    const description = await question('\nEnter description or paste content:\n');

    // Analyze
    const decision = this.analyzeRequirement(description);

    // Display results
    console.log('\n' + '='.repeat(50));
    console.log('VISION QA DECISION ANALYSIS');
    console.log('='.repeat(50));
    
    console.log(`\n📊 Factors Detected:`);
    console.log(`- Has UI Components: ${this.factors.hasUI ? '✅' : '❌'}`);
    console.log(`- Customer Facing: ${this.factors.isCustomerFacing ? '✅' : '❌'}`);
    console.log(`- Payment/Auth: ${this.factors.isPaymentAuth ? '✅' : '❌'}`);
    console.log(`- Accessibility Required: ${this.factors.requiresAccessibility ? '✅' : '❌'}`);
    console.log(`- Mobile Responsive: ${this.factors.isMobileResponsive ? '✅' : '❌'}`);
    console.log(`- Internal Tool Only: ${this.factors.isInternalTool ? '✅' : '❌'}`);
    console.log(`- Complexity Level: ${this.factors.complexity}`);
    console.log(`- Risk Level: ${this.factors.riskLevel}`);

    console.log(`\n🎯 Decision:`);
    console.log(`- Recommendation: ${decision.recommendation}`);
    console.log(`- Required: ${decision.required ? 'YES' : 'NO'}`);
    console.log(`- Reason: ${decision.reason}`);

    if (decision.config) {
      console.log(`\n⚙️  Suggested Configuration:`);
      console.log(JSON.stringify(decision.config, null, 2));
    }

    console.log(`\n📝 LEO Protocol Communication Snippet:`);
    console.log('```markdown');
    console.log(this.generateCommunication(decision, agentRole));
    console.log('```');

    // Save to database option
    const save = await question('\nSave decision to database? (y/n): ');
    if (save.toLowerCase() === 'y') {
      await this.saveDecision(description, decision, agentRole);
      console.log('✅ Decision saved to database');
    }

    rl.close();
  }

  /**
   * Save decision to database for audit trail
   */
  async saveDecision(input, decision, agentRole) {
    try {
      const { error } = await supabase
        .from('vision_qa_decisions')
        .insert({
          input_text: input,
          agent_role: agentRole,
          recommendation: decision.recommendation,
          is_required: decision.required,
          reason: decision.reason,
          factors: this.factors,
          config: decision.config,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to save decision:', error);
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  }

  /**
   * Batch analysis mode for multiple items
   */
  async batchAnalyze(items) {
    const results = [];
    
    for (const item of items) {
      const decision = this.analyzeRequirement(item.description || item);
      results.push({
        item: item.id || item.substring(0, 50),
        recommendation: decision.recommendation,
        required: decision.required,
        reason: decision.reason
      });
    }

    return results;
  }
}

// CLI execution
if (require.main === module) {
  const helper = new VisionQADecisionHelper();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode
    helper.interactiveMode().catch(console.error);
  } else if (args[0] === '--analyze') {
    // Direct analysis
    const input = args.slice(1).join(' ');
    const decision = helper.analyzeRequirement(input);
    console.log(JSON.stringify(decision, null, 2));
  } else if (args[0] === '--help') {
    console.log(`
Vision QA Decision Helper - LEO Protocol v3.1.5.9

Usage:
  node vision-qa-decision.js              Interactive mode
  node vision-qa-decision.js --analyze "description"  Analyze text
  node vision-qa-decision.js --help       Show this help

Examples:
  node vision-qa-decision.js --analyze "Implement user registration form"
  node vision-qa-decision.js --analyze "Update database migration scripts"
    `);
  }
}

module.exports = VisionQADecisionHelper;