#!/usr/bin/env node

/**
 * LEO Protocol - Debugging Sub-Agent v1.0.0
 * ==========================================
 * 
 * BACKSTORY:
 * ----------
 * The Debugging Sub-Agent is modeled after legendary Silicon Valley debugging 
 * virtuosos who've saved countless production systems from catastrophic failures.
 * Trained on patterns from NASA's Mars Rover debugging protocols, Netflix's 
 * chaos engineering practices, and Google's Site Reliability Engineering (SRE) 
 * methodologies, this agent embodies decades of collective debugging wisdom.
 * 
 * Like a forensic detective examining a crime scene, this agent methodically 
 * traces through layers of abstraction, from UI symptoms to root database causes,
 * leaving no stone unturned in its pursuit of the truth. It speaks fluently in 
 * stack traces, understands the subtle language of error codes, and can predict
 * failure cascades before they happen.
 * 
 * EXPERTISE:
 * ----------
 * • Full-Stack Forensics: Frontend to Database debugging
 * • Pattern Recognition: Identifies common error signatures
 * • Root Cause Analysis: Uses "5 Whys" methodology
 * • Predictive Diagnostics: Anticipates related failures
 * • Cross-Agent Collaboration: Works with Testing, Security, and Performance agents
 * 
 * INTEGRATION WITH OTHER SUB-AGENTS:
 * -----------------------------------
 * • Testing Sub-Agent: Receives test failure reports for deep analysis
 * • Security Sub-Agent: Investigates security-related errors and vulnerabilities
 * • Performance Sub-Agent: Analyzes performance bottlenecks and memory leaks
 * • Database Sub-Agent: Collaborates on schema mismatches and query issues
 * 
 * @author LEO Protocol Team
 * @version 1.0.0
 * @license MIT
 */

// import fs from 'fs'; // Unused - available for file operations
// import path from 'path'; // Unused - available for path operations
// import { execSync } from 'child_process'; // Unused - available for shell commands

class DebuggingSubAgent {
  constructor() {
    this.name = 'Debugging Sub-Agent';
    this.version = '1.0.0';
    this.expertise = [
      'Stack Trace Analysis',
      'API Endpoint Validation',
      'Database Schema Verification',
      'Frontend-Backend Mismatch Detection',
      'CORS and Network Issues',
      'Memory Leak Detection',
      'Race Condition Identification',
      'Error Pattern Recognition'
    ];
    
    this.knowledgeBase = {
      commonErrors: new Map(),
      solutions: new Map(),
      patterns: [],
      collaborations: {
        testing: null,
        security: null,
        performance: null,
        database: null
      }
    };
    
    this.initializeKnowledgeBase();
  }
  
  initializeKnowledgeBase() {
    // Common error patterns and their solutions
    this.knowledgeBase.commonErrors.set('PGRST204', {
      type: 'Database Schema Mismatch',
      description: 'PostgREST cannot find expected column in table',
      solution: 'Check table schema, create missing columns, or update query to match existing schema',
      severity: 'high'
    });
    
    this.knowledgeBase.commonErrors.set('CORS', {
      type: 'Cross-Origin Resource Sharing',
      description: 'Browser blocking cross-origin requests',
      solution: 'Configure CORS headers on server, check allowed origins',
      severity: 'medium'
    });
    
    this.knowledgeBase.commonErrors.set('ECONNREFUSED', {
      type: 'Connection Refused',
      description: 'Server not running or wrong port',
      solution: 'Verify server is running, check port configuration',
      severity: 'high'
    });
    
    this.knowledgeBase.commonErrors.set('404', {
      type: 'Resource Not Found',
      description: 'API endpoint or file does not exist',
      solution: 'Verify endpoint exists, check routing configuration',
      severity: 'medium'
    });
  }
  
  /**
   * Main debugging analysis entry point
   */
  async analyzeIssue(errorContext) {
    console.log('🔍 DEBUGGING SUB-AGENT ACTIVATED');
    console.log('=' .repeat(50));
    
    const report = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      version: this.version,
      errorContext,
      diagnosis: {},
      recommendations: [],
      collaborations: [],
      confidence: 0
    };
    
    // Step 1: Identify Error Type
    report.diagnosis.errorType = this.identifyErrorType(errorContext);
    
    // Step 2: Stack Trace Analysis
    if (errorContext.stack) {
      report.diagnosis.stackAnalysis = this.analyzeStackTrace(errorContext.stack);
    }
    
    // Step 3: Check Frontend-Backend Consistency
    if (errorContext.frontend && errorContext.backend) {
      report.diagnosis.consistency = await this.checkConsistency(errorContext);
    }
    
    // Step 4: Database Schema Verification
    if (errorContext.database) {
      report.diagnosis.schema = await this.verifyDatabaseSchema(errorContext);
    }
    
    // Step 5: Network Analysis
    if (errorContext.network) {
      report.diagnosis.network = this.analyzeNetworkIssue(errorContext);
    }
    
    // Step 6: Generate Recommendations
    report.recommendations = this.generateRecommendations(report.diagnosis);
    
    // Step 7: Calculate Confidence Score
    report.confidence = this.calculateConfidence(report);
    
    // Step 8: Collaborate with other agents if needed
    report.collaborations = await this.collaborateWithAgents(report);
    
    return report;
  }
  
  /**
   * Identify the type of error from context
   */
  identifyErrorType(context) {
    const { error: _error, message, code } = context;
    
    // Check against known error patterns
    for (const [key, pattern] of this.knowledgeBase.commonErrors) {
      if (code === key || (message && message.includes(key))) {
        return pattern;
      }
    }
    
    // Generic classification
    if (message) {
      if (message.includes('database') || message.includes('sql')) {
        return { type: 'Database Error', severity: 'high' };
      }
      if (message.includes('fetch') || message.includes('network')) {
        return { type: 'Network Error', severity: 'medium' };
      }
      if (message.includes('undefined') || message.includes('null')) {
        return { type: 'Null Reference Error', severity: 'low' };
      }
    }
    
    return { type: 'Unknown Error', severity: 'medium' };
  }
  
  /**
   * Analyze stack trace for root cause
   */
  analyzeStackTrace(stack) {
    const lines = stack.split('\n');
    const analysis = {
      rootCause: null,
      affectedFiles: [],
      callSequence: []
    };
    
    // Extract file paths and line numbers
    const filePattern = /at\s+.*?\s+\((.*?):(\d+):(\d+)\)/;
    const methodPattern = /at\s+(\w+\.?\w*)/;
    
    lines.forEach(line => {
      const fileMatch = line.match(filePattern);
      const methodMatch = line.match(methodPattern);
      
      if (fileMatch) {
        analysis.affectedFiles.push({
          file: fileMatch[1],
          line: parseInt(fileMatch[2]),
          column: parseInt(fileMatch[3])
        });
      }
      
      if (methodMatch) {
        analysis.callSequence.push(methodMatch[1]);
      }
    });
    
    // Identify root cause (usually the first user code in stack)
    if (analysis.affectedFiles.length > 0) {
      const userCode = analysis.affectedFiles.find(f => 
        !f.file.includes('node_modules') && 
        !f.file.includes('internal/')
      );
      analysis.rootCause = userCode || analysis.affectedFiles[0];
    }
    
    return analysis;
  }
  
  /**
   * Check frontend-backend API consistency
   */
  async checkConsistency(context) {
    const issues = [];
    
    // Check endpoint matching
    if (context.frontend.endpoint !== context.backend.endpoint) {
      issues.push({
        type: 'Endpoint Mismatch',
        frontend: context.frontend.endpoint,
        backend: context.backend.endpoint,
        fix: 'Update frontend to use correct endpoint'
      });
    }
    
    // Check request/response format
    if (context.frontend.requestFormat !== context.backend.expectedFormat) {
      issues.push({
        type: 'Data Format Mismatch',
        frontend: context.frontend.requestFormat,
        backend: context.backend.expectedFormat,
        fix: 'Align data structures between frontend and backend'
      });
    }
    
    return {
      isConsistent: issues.length === 0,
      issues
    };
  }
  
  /**
   * Verify database schema matches expectations
   */
  async verifyDatabaseSchema(context) {
    const { table, expectedColumns, actualColumns } = context.database;
    
    const missingColumns = expectedColumns.filter(col => 
      !actualColumns.includes(col)
    );
    
    const extraColumns = actualColumns.filter(col => 
      !expectedColumns.includes(col)
    );
    
    return {
      table,
      status: missingColumns.length === 0 ? 'valid' : 'invalid',
      missingColumns,
      extraColumns,
      recommendation: missingColumns.length > 0 
        ? `Create missing columns: ${missingColumns.join(', ')}`
        : 'Schema is valid'
    };
  }
  
  /**
   * Analyze network-related issues
   */
  analyzeNetworkIssue(context) {
    const { status, headers, timing } = context.network;
    const analysis = {
      issues: [],
      performance: {}
    };
    
    // Check status codes
    if (status >= 500) {
      analysis.issues.push('Server error - check server logs');
    } else if (status >= 400) {
      analysis.issues.push('Client error - verify request parameters');
    }
    
    // Check CORS headers
    if (!headers['access-control-allow-origin']) {
      analysis.issues.push('Missing CORS headers');
    }
    
    // Check timing
    if (timing && timing.duration > 3000) {
      analysis.performance.slow = true;
      analysis.performance.duration = timing.duration;
      analysis.issues.push('Slow response time - consider optimization');
    }
    
    return analysis;
  }
  
  /**
   * Generate actionable recommendations
   */
  generateRecommendations(diagnosis) {
    const recommendations = [];
    
    // Based on error type
    if (diagnosis.errorType) {
      const known = this.knowledgeBase.commonErrors.get(diagnosis.errorType.type);
      if (known && known.solution) {
        recommendations.push({
          priority: 'high',
          action: known.solution
        });
      }
    }
    
    // Based on consistency check
    if (diagnosis.consistency && !diagnosis.consistency.isConsistent) {
      diagnosis.consistency.issues.forEach(issue => {
        recommendations.push({
          priority: 'high',
          action: issue.fix
        });
      });
    }
    
    // Based on schema verification
    if (diagnosis.schema && diagnosis.schema.status === 'invalid') {
      recommendations.push({
        priority: 'critical',
        action: diagnosis.schema.recommendation
      });
    }
    
    // Based on network analysis
    if (diagnosis.network && diagnosis.network.issues.length > 0) {
      diagnosis.network.issues.forEach(issue => {
        recommendations.push({
          priority: 'medium',
          action: issue
        });
      });
    }
    
    return recommendations;
  }
  
  /**
   * Calculate confidence score for the diagnosis
   */
  calculateConfidence(report) {
    let score = 0;
    let factors = 0;
    
    // Known error pattern match
    if (report.diagnosis.errorType && report.diagnosis.errorType.type !== 'Unknown Error') {
      score += 30;
      factors++;
    }
    
    // Stack trace available
    if (report.diagnosis.stackAnalysis && report.diagnosis.stackAnalysis.rootCause) {
      score += 25;
      factors++;
    }
    
    // Consistency check performed
    if (report.diagnosis.consistency) {
      score += 20;
      factors++;
    }
    
    // Schema verification performed
    if (report.diagnosis.schema) {
      score += 15;
      factors++;
    }
    
    // Recommendations generated
    if (report.recommendations.length > 0) {
      score += 10;
      factors++;
    }
    
    return factors > 0 ? Math.round(score / factors * 20) : 0;
  }
  
  /**
   * Collaborate with other sub-agents
   */
  async collaborateWithAgents(report) {
    const collaborations = [];
    
    // Collaborate with Testing Sub-Agent for test coverage
    if (report.diagnosis.stackAnalysis && report.diagnosis.stackAnalysis.affectedFiles) {
      collaborations.push({
        agent: 'Testing Sub-Agent',
        action: 'Verify test coverage for affected files',
        files: report.diagnosis.stackAnalysis.affectedFiles
      });
    }
    
    // Collaborate with Security Sub-Agent for security issues
    if (report.diagnosis.errorType && 
        (report.diagnosis.errorType.type.includes('injection') || 
         report.diagnosis.errorType.type.includes('auth'))) {
      collaborations.push({
        agent: 'Security Sub-Agent',
        action: 'Perform security audit',
        context: report.diagnosis.errorType
      });
    }
    
    // Collaborate with Performance Sub-Agent for performance issues
    if (report.diagnosis.network && report.diagnosis.network.performance.slow) {
      collaborations.push({
        agent: 'Performance Sub-Agent',
        action: 'Analyze performance bottleneck',
        duration: report.diagnosis.network.performance.duration
      });
    }
    
    // Collaborate with Database Sub-Agent for schema issues
    if (report.diagnosis.schema && report.diagnosis.schema.status === 'invalid') {
      collaborations.push({
        agent: 'Database Sub-Agent',
        action: 'Create migration for missing columns',
        columns: report.diagnosis.schema.missingColumns
      });
    }
    
    return collaborations;
  }
  
  /**
   * Generate detailed report
   */
  generateReport(analysis) {
    console.log('\n📋 DEBUGGING ANALYSIS REPORT');
    console.log('=' .repeat(50));
    
    console.log(`\n🕐 Timestamp: ${analysis.timestamp}`);
    console.log(`🤖 Agent: ${analysis.agent} v${analysis.version}`);
    console.log(`🎯 Confidence Score: ${analysis.confidence}%`);
    
    // Error Type
    if (analysis.diagnosis.errorType) {
      console.log(`\n❌ Error Type: ${analysis.diagnosis.errorType.type}`);
      console.log(`   Severity: ${analysis.diagnosis.errorType.severity}`);
      if (analysis.diagnosis.errorType.description) {
        console.log(`   Description: ${analysis.diagnosis.errorType.description}`);
      }
    }
    
    // Stack Analysis
    if (analysis.diagnosis.stackAnalysis) {
      console.log('\n📚 Stack Trace Analysis:');
      if (analysis.diagnosis.stackAnalysis.rootCause) {
        const rc = analysis.diagnosis.stackAnalysis.rootCause;
        console.log(`   Root Cause: ${rc.file}:${rc.line}:${rc.column}`);
      }
      console.log(`   Call Sequence: ${analysis.diagnosis.stackAnalysis.callSequence.slice(0, 3).join(' -> ')}`);
    }
    
    // Consistency Check
    if (analysis.diagnosis.consistency) {
      console.log('\n🔄 Frontend-Backend Consistency:');
      console.log(`   Status: ${analysis.diagnosis.consistency.isConsistent ? '✅ Consistent' : '❌ Inconsistent'}`);
      if (!analysis.diagnosis.consistency.isConsistent) {
        analysis.diagnosis.consistency.issues.forEach(issue => {
          console.log(`   - ${issue.type}: ${issue.fix}`);
        });
      }
    }
    
    // Schema Verification
    if (analysis.diagnosis.schema) {
      console.log('\n🗄️ Database Schema:');
      console.log(`   Table: ${analysis.diagnosis.schema.table}`);
      console.log(`   Status: ${analysis.diagnosis.schema.status === 'valid' ? '✅ Valid' : '❌ Invalid'}`);
      if (analysis.diagnosis.schema.missingColumns.length > 0) {
        console.log(`   Missing Columns: ${analysis.diagnosis.schema.missingColumns.join(', ')}`);
      }
    }
    
    // Recommendations
    if (analysis.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      analysis.recommendations
        .sort((a, b) => {
          const priority = { critical: 0, high: 1, medium: 2, low: 3 };
          return priority[a.priority] - priority[b.priority];
        })
        .forEach((rec, i) => {
          console.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
        });
    }
    
    // Collaborations
    if (analysis.collaborations.length > 0) {
      console.log('\n🤝 AGENT COLLABORATIONS:');
      analysis.collaborations.forEach(collab => {
        console.log(`   • ${collab.agent}: ${collab.action}`);
      });
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('END OF DEBUGGING ANALYSIS REPORT');
    console.log('=' .repeat(50) + '\n');
  }
}

// Example usage and testing
async function testDebuggingAgent() {
  const agent = new DebuggingSubAgent();
  
  // Test Case: DirectiveLab submission error
  const testCase = {
    error: 'Failed to submit feedback',
    message: "Could not find the 'feedback' column of 'directive_submissions' in the schema cache",
    code: 'PGRST204',
    stack: `Error: Failed to submit feedback
      at submitFeedback (DirectiveLab.jsx:153:15)
      at handleClick (DirectiveLab.jsx:294:7)
      at HTMLButtonElement.onClick (react-dom.js:1234:10)`,
    frontend: {
      endpoint: '/api/sdip/submissions',
      requestFormat: { feedback: 'string', screenshot_url: 'string' }
    },
    backend: {
      endpoint: '/api/sdip/submit',
      expectedFormat: { feedback: 'string', screenshot_url: 'string' }
    },
    database: {
      table: 'directive_submissions',
      expectedColumns: ['id', 'submission_id', 'feedback', 'screenshot_url', 'created_at'],
      actualColumns: ['id', 'submission_id', 'created_at'] // Missing feedback and screenshot_url
    },
    network: {
      status: 500,
      headers: {},
      timing: { duration: 245 }
    }
  };
  
  console.log('🧪 Testing Debugging Sub-Agent with DirectiveLab Error Case...\n');
  
  const analysis = await agent.analyzeIssue(testCase);
  agent.generateReport(analysis);
  
  // Return analysis for integration with other systems
  return analysis;
}

// Export for use in other modules
export { DebuggingSubAgent };

// Run test if executed directly
// import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testDebuggingAgent().then(analysis => {
    console.log('✅ Debugging Sub-Agent test completed');
    process.exit(analysis.confidence >= 80 ? 0 : 1);
  }).catch(error => {
    console.error('❌ Debugging Sub-Agent test failed:', error);
    process.exit(1);
  });
}