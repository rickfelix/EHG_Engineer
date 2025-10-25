#!/usr/bin/env node

/**
 * Dynamic Documentation Sub-Agent Wrapper
 * Makes the Documentation Sub-Agent work with any path, not hardcoded
 */

import DocumentationSubAgentV2 from './documentation-sub-agent';
import path from 'path';
import fsModule from 'fs';
const fs = fsModule.promises;

class DynamicDocumentationSubAgent extends DocumentationSubAgentV2 {
  constructor() {
    super();
    this.defaultPath = process.cwd(); // Use current directory as default
  }

  /**
   * Execute with dynamic path support
   */
  async execute(options = {}) {
    // Accept path from options, environment variable, or use current directory
    const basePath = options.path || 
                     process.env.ANALYSIS_PATH || 
                     process.env.PROJECT_PATH ||
                     this.defaultPath;

    console.log('📚 Dynamic Documentation Sub-Agent');
    console.log(`📁 Analyzing: ${basePath}`);
    
    // Verify path exists
    try {
      await fs.access(basePath);
    } catch (error) {
      console.error(`❌ Path does not exist: ${basePath}`);
      return {
        success: false,
        error: `Path not found: ${basePath}`,
        score: 0,
        issues: []
      };
    }

    // Initialize results structure
    this.results = {
      timestamp: new Date().toISOString(),
      path: basePath,
      score: 100,
      readme: { exists: false, issues: [] },
      apiDocs: { exists: false, issues: [] },
      codeCoverage: { percentage: 0, undocumented: [] },
      issues: [],
      recommendations: [],
      summary: ''
    };

    try {
      // Profile the codebase first
      await this.profileCodebase(basePath);
      
      // Run intelligent analysis
      await this.intelligentAnalyze(basePath, options.context || {});
      
      // Generate comprehensive report
      const report = await this.generateReport();
      
      // Merge findings into results
      this.results.issues = this.findings;
      this.results.score = this.calculateScore();
      
      // Analyze specific documentation aspects
      await this.analyzeReadme(basePath);
      await this.analyzeApiDocumentation(basePath);
      await this.analyzeCodeCoverage(basePath);
      
      // Generate summary
      this.results.summary = this.generateSummary();
      
      return this.results;
      
    } catch (error) {
      console.error(`❌ Analysis failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        score: 0,
        issues: []
      };
    }
  }

  /**
   * Analyze README specifically
   */
  async analyzeReadme(basePath) {
    const readmePath = path.join(basePath, 'README.md');
    try {
      const content = await fs.readFile(readmePath, 'utf8');
      this.results.readme.exists = true;
      
      // Check for essential sections
      const sections = ['Installation', 'Usage', 'API', 'License', 'Contributing'];
      const missingSections = sections.filter(s => !content.toLowerCase().includes(s.toLowerCase()));
      
      if (missingSections.length > 0) {
        this.results.readme.issues.push({
          type: 'MISSING_SECTIONS',
          severity: 'medium',
          description: `Missing sections: ${missingSections.join(', ')}`
        });
      }
      
      // Check README length
      if (content.length < 500) {
        this.results.readme.issues.push({
          type: 'TOO_BRIEF',
          severity: 'high',
          description: 'README is too brief (< 500 characters)'
        });
      }
      
      // Check for badges
      if (!content.includes('![') && !content.includes('[![')) {
        this.results.readme.issues.push({
          type: 'NO_BADGES',
          severity: 'low',
          description: 'No status badges found'
        });
      }
      
    } catch (error) {
      this.results.readme.exists = false;
      this.results.readme.issues.push({
        type: 'MISSING',
        severity: 'critical',
        description: 'README.md not found'
      });
    }
  }

  /**
   * Analyze API documentation
   */
  async analyzeApiDocumentation(basePath) {
    // Check for API documentation files
    const apiDocPatterns = [
      'api.md', 'API.md',
      'docs/api.md', 'docs/API.md',
      'swagger.json', 'swagger.yaml',
      'openapi.json', 'openapi.yaml'
    ];
    
    for (const pattern of apiDocPatterns) {
      const docPath = path.join(basePath, pattern);
      try {
        await fs.access(docPath);
        this.results.apiDocs.exists = true;
        
        // Validate the documentation
        const content = await fs.readFile(docPath, 'utf8');
        
        if (pattern.includes('swagger') || pattern.includes('openapi')) {
          // Validate OpenAPI spec
          try {
            const spec = pattern.endsWith('.json') ? 
              JSON.parse(content) : 
              content; // YAML validation would need a parser
              
            if (!spec.paths || Object.keys(spec.paths || {}).length === 0) {
              this.results.apiDocs.issues.push({
                type: 'EMPTY_SPEC',
                severity: 'high',
                description: 'API specification has no endpoints'
              });
            }
          } catch (e) {
            this.results.apiDocs.issues.push({
              type: 'INVALID_SPEC',
              severity: 'critical',
              description: 'Invalid API specification format'
            });
          }
        }
        
        break; // Found documentation
      } catch {
        // Continue searching
      }
    }
    
    if (!this.results.apiDocs.exists) {
      // Check if project likely has an API
      const hasApi = await this.detectAPI(basePath);
      if (hasApi) {
        this.results.apiDocs.issues.push({
          type: 'MISSING',
          severity: 'high',
          description: 'Project appears to have API but no documentation found'
        });
      }
    }
  }

  /**
   * Analyze code coverage
   */
  async analyzeCodeCoverage(basePath) {
    // Look for exported functions and check if they're documented
    const srcPath = path.join(basePath, 'src');
    let totalExports = 0;
    let documentedExports = 0;
    
    try {
      const files = await this.findSourceFiles(srcPath);
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        
        // Find exported functions/classes
        const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+(\w+)/g;
        let match;
        
        while ((match = exportRegex.exec(content)) !== null) {
          totalExports++;
          const name = match[1];
          
          // Check if there's a JSDoc comment before it
          const beforeExport = content.substring(Math.max(0, match.index - 500), match.index);
          if (beforeExport.includes('/**')) {
            documentedExports++;
          } else {
            this.results.codeCoverage.undocumented.push({
              name,
              file: path.relative(basePath, file)
            });
          }
        }
      }
      
      if (totalExports > 0) {
        this.results.codeCoverage.percentage = Math.round((documentedExports / totalExports) * 100);
      }
      
    } catch (error) {
      // Source directory might not exist
      this.results.codeCoverage.percentage = 0;
    }
  }

  /**
   * Calculate documentation score
   */
  calculateScore() {
    let score = 100;
    
    // Deduct points for issues
    for (const finding of this.findings) {
      switch (finding.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }
    
    // Additional deductions
    if (!this.results.readme.exists) score -= 25;
    if (this.results.codeCoverage.percentage < 50) score -= 15;
    if (!this.results.apiDocs.exists && this.results.apiDocs.issues.length > 0) score -= 10;
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Generate summary
   */
  generateSummary() {
    const issues = this.findings.length;
    const critical = this.findings.filter(f => f.severity === 'critical').length;
    const high = this.findings.filter(f => f.severity === 'high').length;
    
    let summary = `Documentation Score: ${this.results.score}/100\n`;
    summary += `Total Issues: ${issues} (${critical} critical, ${high} high)\n`;
    summary += `Code Coverage: ${this.results.codeCoverage.percentage}%\n`;
    
    if (!this.results.readme.exists) {
      summary += '⚠️ Missing README.md\n';
    }
    
    if (this.results.apiDocs.issues.length > 0) {
      summary += `⚠️ API Documentation Issues: ${this.results.apiDocs.issues.length}\n`;
    }
    
    return summary;
  }
}

// Export for use as a module
export default DynamicDocumentationSubAgent;

// If run directly, execute with command-line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DynamicDocumentationSubAgent();
  
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const pathArg = args[0] || process.cwd();
  
  console.log('🚀 Running Dynamic Documentation Sub-Agent');
  console.log(`📁 Target: ${pathArg}`);
  
  agent.execute({ path: pathArg })
    .then(results => {
      console.log('\n📊 Analysis Complete!');
      console.log(results.summary);
      
      // Save results
      const reportPath = path.join(process.cwd(), 'documentation-analysis.json');
      fs.writeFile(reportPath, JSON.stringify(results, null, 2))
        .then(() => console.log(`💾 Report saved to: ${reportPath}`))
        .catch(err => console.error('Failed to save report:', err));
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}