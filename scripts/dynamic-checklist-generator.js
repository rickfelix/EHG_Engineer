#!/usr/bin/env node

/**
 * Dynamic Checklist Generator for LEO Protocol
 * Creates relevant checklists based on Strategic Directive content
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

class DynamicChecklistGenerator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // Pattern matchers for different types of work
    this.patterns = {
      // Infrastructure patterns
      database: /database|schema|migration|table|sql|postgres|supabase/i,
      api: /api|endpoint|rest|graphql|function|edge|serverless/i,
      frontend: /react|component|ui|interface|frontend|client/i,
      backend: /server|backend|node|express|service/i,
      
      // Technical patterns
      realtime: /realtime|websocket|streaming|live|push/i,
      auth: /auth|login|security|token|session|permission/i,
      integration: /integrate|connect|third-party|external|api/i,
      voice: /voice|audio|speech|webrtc|microphone|speaker/i,
      ai: /ai|machine learning|openai|gpt|llm|model/i,
      
      // Quality patterns
      testing: /test|quality|verification|validation/i,
      performance: /performance|speed|latency|optimization|cache/i,
      security: /security|defense|protection|sanitize|validate/i,
      monitoring: /monitor|log|track|metric|analytics|observability/i,
      
      // Process patterns
      documentation: /document|readme|guide|tutorial|reference/i,
      deployment: /deploy|release|production|staging|ci\/cd/i,
      migration: /migrate|upgrade|legacy|deprecate|remove/i
    };
  }

  /**
   * Generate phase-specific checklists based on SD content
   */
  async generateChecklists(sdId) {
    console.log('🤖 Dynamic Checklist Generator\n');
    
    // Get Strategic Directive
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();
    
    if (!sd) {
      throw new Error(`Strategic Directive ${sdId} not found`);
    }
    
    // Get PRD if exists
    const { data: prds } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);
    
    const prd = prds?.[0];
    
    console.log(`📋 Generating checklists for: ${sd.title}\n`);
    
    // Analyze SD content
    const analysis = this.analyzeContent(sd, prd);
    
    // Generate phase-specific checklists
    const checklists = {
      lead: this.generateLeadChecklist(analysis),
      plan: this.generatePlanChecklist(analysis),
      exec: this.generateExecChecklist(analysis),
      verification: this.generateVerificationChecklist(analysis),
      approval: this.generateApprovalChecklist(analysis)
    };
    
    return {
      analysis,
      checklists,
      metadata: {
        generated_at: new Date().toISOString(),
        sd_id: sdId,
        sd_title: sd.title,
        detected_patterns: analysis.patterns,
        estimated_complexity: analysis.complexity
      }
    };
  }

  /**
   * Analyze SD content to understand what needs to be built
   */
  analyzeContent(sd, prd) {
    const content = `
      ${sd.title || ''}
      ${sd.description || ''}
      ${JSON.stringify(sd.objectives || [])}
      ${JSON.stringify(prd?.requirements || [])}
      ${JSON.stringify(prd?.acceptance_criteria || [])}
    `.toLowerCase();
    
    // Detect patterns in content
    const detectedPatterns = [];
    for (const [name, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(content)) {
        detectedPatterns.push(name);
      }
    }
    
    // Estimate complexity
    const complexity = this.estimateComplexity(detectedPatterns, sd);
    
    // Extract key deliverables
    const deliverables = this.extractDeliverables(sd, prd, detectedPatterns);
    
    return {
      patterns: detectedPatterns,
      complexity,
      deliverables,
      hasDatabase: detectedPatterns.includes('database'),
      hasAPI: detectedPatterns.includes('api'),
      hasFrontend: detectedPatterns.includes('frontend'),
      hasRealtime: detectedPatterns.includes('realtime'),
      hasAI: detectedPatterns.includes('ai'),
      hasVoice: detectedPatterns.includes('voice'),
      needsSecurity: detectedPatterns.includes('security') || detectedPatterns.includes('auth'),
      needsTesting: true, // Always need testing
      needsDocumentation: true // Always need docs
    };
  }

  /**
   * Generate LEAD phase checklist
   */
  generateLeadChecklist(analysis) {
    const checklist = [
      {
        text: 'Strategic objectives clearly defined',
        required: true,
        autoCheck: 'Check if SD has objectives field populated'
      },
      {
        text: 'Business value articulated',
        required: true,
        autoCheck: 'Check if SD has business_value or similar field'
      },
      {
        text: 'Success metrics identified',
        required: true,
        autoCheck: 'Check for measurable outcomes in objectives'
      }
    ];
    
    // Add pattern-specific items
    if (analysis.hasAI) {
      checklist.push({
        text: 'AI/ML requirements and constraints defined',
        required: true
      });
    }
    
    if (analysis.complexity === 'high') {
      checklist.push({
        text: 'Risk assessment completed',
        required: true
      });
    }
    
    return checklist;
  }

  /**
   * Generate PLAN phase checklist
   */
  generatePlanChecklist(analysis) {
    const checklist = [
      {
        text: 'Technical architecture documented',
        required: true
      },
      {
        text: 'Component design completed',
        required: true
      }
    ];
    
    // Add based on detected patterns
    if (analysis.hasDatabase) {
      checklist.push({
        text: 'Database schema designed',
        required: true,
        verification: 'Schema file or migration exists'
      });
    }
    
    if (analysis.hasAPI) {
      checklist.push({
        text: 'API endpoints specified',
        required: true,
        verification: 'API documentation or OpenAPI spec exists'
      });
    }
    
    if (analysis.hasFrontend) {
      checklist.push({
        text: 'UI/UX design completed',
        required: true,
        verification: 'Component structure defined'
      });
    }
    
    if (analysis.hasRealtime) {
      checklist.push({
        text: 'Real-time architecture planned',
        required: true,
        verification: 'WebSocket or streaming design documented'
      });
    }
    
    if (analysis.hasVoice) {
      checklist.push({
        text: 'Audio pipeline architecture defined',
        required: true,
        verification: 'Audio processing flow documented'
      });
    }
    
    checklist.push({
      text: 'Acceptance criteria defined',
      required: true,
      verification: 'PRD contains acceptance_criteria'
    });
    
    return checklist;
  }

  /**
   * Generate EXEC phase checklist - most dynamic
   */
  generateExecChecklist(analysis) {
    const checklist = [];
    
    // Core implementation items based on patterns
    if (analysis.hasDatabase) {
      checklist.push({
        text: 'Database schema implemented',
        verification: 'Migration files created and applied',
        files: ['migrations/', '.sql']
      });
    }
    
    if (analysis.hasAPI) {
      checklist.push({
        text: 'API endpoints implemented',
        verification: 'API routes respond successfully',
        testCommand: 'curl -s http://localhost:3000/api/health'
      });
    }
    
    if (analysis.hasFrontend) {
      checklist.push({
        text: 'Frontend components built',
        verification: 'Components render without errors',
        files: ['components/', '.tsx', '.jsx']
      });
    }
    
    if (analysis.hasRealtime) {
      checklist.push({
        text: 'Real-time connections working',
        verification: 'WebSocket connects and receives data',
        testCommand: 'Check for "WebSocket connected" in logs'
      });
    }
    
    if (analysis.hasVoice) {
      checklist.push({
        text: 'Voice/audio pipeline functional',
        verification: 'Audio capture and playback working',
        files: ['voice/', 'audio', 'webrtc']
      });
    }
    
    if (analysis.hasAI) {
      checklist.push({
        text: 'AI integration implemented',
        verification: 'AI API calls successful',
        envRequired: ['OPENAI_API_KEY']
      });
    }
    
    // Always include these
    checklist.push({
      text: 'Core functionality working',
      required: true,
      verification: 'Main use case can be demonstrated'
    });
    
    checklist.push({
      text: 'Error handling implemented',
      required: true,
      verification: 'Errors are caught and logged properly'
    });
    
    if (analysis.needsSecurity) {
      checklist.push({
        text: 'Security measures implemented',
        verification: 'Input validation and sanitization in place'
      });
    }
    
    // Add testing based on complexity
    if (analysis.complexity === 'high') {
      checklist.push({
        text: 'Unit tests written',
        verification: 'Test files exist and pass'
      });
      checklist.push({
        text: 'Integration tests completed',
        verification: 'End-to-end flow tested'
      });
    } else {
      checklist.push({
        text: 'Basic smoke test passes',
        verification: 'System starts without errors'
      });
    }
    
    return checklist;
  }

  /**
   * Generate Verification checklist (PLAN agent)
   */
  generateVerificationChecklist(analysis) {
    const checklist = [
      {
        text: 'All acceptance criteria met',
        required: true
      },
      {
        text: 'Code review completed',
        required: true
      }
    ];
    
    // Add performance checks if needed
    if (analysis.patterns.includes('performance')) {
      checklist.push({
        text: 'Performance requirements validated',
        verification: 'Latency/throughput measurements taken'
      });
    }
    
    // Add specific validations
    if (analysis.hasVoice) {
      checklist.push({
        text: 'Audio quality validated',
        verification: 'Clear audio input/output confirmed'
      });
    }
    
    if (analysis.hasRealtime) {
      checklist.push({
        text: 'Real-time latency acceptable',
        verification: 'Updates occur within specified timeframe'
      });
    }
    
    return checklist;
  }

  /**
   * Generate Approval checklist (LEAD agent)
   */
  generateApprovalChecklist(analysis) {
    return [
      {
        text: 'Business objectives achieved',
        required: true
      },
      {
        text: 'User acceptance confirmed',
        required: true
      },
      {
        text: 'Documentation complete',
        required: true
      },
      {
        text: 'Deployment ready',
        required: true
      }
    ];
  }

  /**
   * Estimate complexity based on patterns
   */
  estimateComplexity(patterns, sd) {
    const complexityScore = patterns.length;
    
    // High complexity indicators
    const highComplexityPatterns = ['realtime', 'ai', 'voice', 'security', 'integration'];
    const highComplexityCount = patterns.filter(p => 
      highComplexityPatterns.includes(p)
    ).length;
    
    if (highComplexityCount >= 3 || complexityScore >= 8) {
      return 'high';
    } else if (highComplexityCount >= 1 || complexityScore >= 4) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Extract deliverables from SD/PRD
   */
  extractDeliverables(sd, prd, patterns) {
    const deliverables = [];
    
    // Pattern-based deliverables
    if (patterns.includes('database')) {
      deliverables.push('Database schema/migrations');
    }
    if (patterns.includes('api')) {
      deliverables.push('API endpoints');
    }
    if (patterns.includes('frontend')) {
      deliverables.push('UI components');
    }
    if (patterns.includes('documentation')) {
      deliverables.push('Technical documentation');
    }
    
    // Extract from objectives if structured
    if (sd.objectives && Array.isArray(sd.objectives)) {
      sd.objectives.forEach(obj => {
        if (typeof obj === 'string' && obj.includes('implement')) {
          deliverables.push(obj.replace('implement', '').trim());
        }
      });
    }
    
    return deliverables;
  }
}

// Main execution
// Export the class for use in other modules
export default DynamicChecklistGenerator;

async function main() {
  const generator = new DynamicChecklistGenerator();
  
  // Generate for SD-2025-001 as example
  const result = await generator.generateChecklists('SD-2025-001');
  
  console.log('📊 Dynamic Checklist Generation Results\n');
  console.log('Detected Patterns:', result.analysis.patterns.join(', '));
  console.log('Complexity:', result.analysis.complexity);
  console.log('Key Deliverables:', result.analysis.deliverables.join(', '));
  console.log('\n');
  
  // Display generated checklists
  for (const [phase, checklist] of Object.entries(result.checklists)) {
    console.log(`${phase.toUpperCase()} Phase Checklist (${checklist.length} items):`);
    console.log('─'.repeat(60));
    checklist.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.text}`);
      if (item.verification) {
        console.log(`     ↳ Verify: ${item.verification}`);
      }
    });
    console.log();
  }
  
  // Save to database
  const { error } = await generator.supabase
    .from('product_requirements_v2')
    .update({
      dynamic_checklists: result.checklists,
      checklist_metadata: result.metadata,
      updated_at: new Date().toISOString()
    })
    .eq('directive_id', 'SD-2025-001');
  
  if (!error) {
    console.log('✅ Dynamic checklists saved to database!');
  }
  
  console.log('\n💡 Key Insight:');
  console.log('Checklists are now dynamically generated based on:');
  console.log('  • Actual SD content and objectives');
  console.log('  • Detected technical patterns');
  console.log('  • Complexity assessment');
  console.log('  • Specific requirements mentioned');
  console.log('\nThis ensures checklists are always relevant and meaningful!');
}

main().catch(console.error);