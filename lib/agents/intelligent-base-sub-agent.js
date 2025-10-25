/**
 * Intelligent Base Sub-Agent
 * Provides adaptive learning and contextual understanding to all sub-agents
 */

import BaseSubAgent from './base-sub-agent';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

class IntelligentBaseSubAgent extends BaseSubAgent {
  constructor(name, emoji) {
    super(name, emoji);
    
    // Shared codebase understanding
    this.codebaseProfile = {
      framework: null,
      backend: null,
      database: null,
      styling: null,           // CSS framework
      testing: null,          // Testing framework
      buildTool: null,        // Webpack, Vite, etc.
      language: null,         // JS, TS, etc.
      packageManager: null,   // npm, yarn, pnpm
      libraries: new Set(),
      patterns: new Map(),    // Common patterns in this codebase
      conventions: new Map()  // Naming conventions, file structure
    };
    
    // Shared context understanding
    this.codebaseContext = {
      fileStructure: new Map(),      // Understanding of file organization
      dependencies: new Map(),       // Module dependencies
      criticalPaths: new Set(),      // Performance-critical code paths
      businessLogic: new Map(),      // Key business logic locations
      dataFlow: new Map(),           // How data flows through the app
      commonPatterns: new Map()      // Repeated patterns across codebase
    };
    
    // Learning state
    this.learningState = {
      analyzed: false,
      filesAnalyzed: 0,
      patternsLearned: 0,
      lastAnalysis: null
    };
  }

  /**
   * Enhanced analyze that includes learning phase with error handling and timeouts
   */
  async analyze(context) {
    const basePath = context.path || process.cwd();
    const timeout = context.timeout || 300000; // 5 minute default timeout
    
    try {
      // Set up timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Analysis timed out after ${timeout}ms`)), timeout);
      });
      
      const analysisPromise = this.runAnalysisSteps(basePath, context);
      
      // Race between analysis and timeout
      await Promise.race([analysisPromise, timeoutPromise]);
      
    } catch (error) {
      console.error(`❌ Analysis failed for ${this.name}: ${error.message}`);
      
      // Add error as finding
      this.addFinding({
        type: 'ANALYSIS_ERROR',
        severity: 'critical',
        confidence: 1.0,
        file: 'analysis',
        description: `Agent analysis failed: ${error.message}`,
        recommendation: 'Check agent configuration and try again',
        metadata: {
          agent: this.name,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
  
  /**
   * Run the actual analysis steps with proper error boundaries
   */
  async runAnalysisSteps(basePath, context) {
    // Learn about the codebase first (shared across all sub-agents)
    if (!this.learningState.analyzed) {
      console.log('🧠 Learning about the codebase...');
      try {
        await Promise.race([
          this.learnCodebase(basePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Learning timeout')), 60000))
        ]);
        this.learningState.analyzed = true;
        console.log(`   ✓ Learned: ${this.codebaseProfile.framework || 'Generic'} ${this.codebaseProfile.language || 'JS'} project`);
      } catch (error) {
        console.warn(`⚠️  Learning phase failed: ${error.message}`);
        // Continue with limited knowledge
      }
    }
    
    // Build context understanding with timeout
    try {
      await Promise.race([
        this.buildContextualUnderstanding(basePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Context building timeout')), 30000))
      ]);
    } catch (error) {
      console.warn(`⚠️  Context building failed: ${error.message}`);
      // Continue without full context
    }
    
    // Run agent-specific intelligent analysis with timeout
    try {
      await Promise.race([
        this.intelligentAnalyze(basePath, context),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Agent analysis timeout')), 240000))
      ]);
    } catch (error) {
      console.error(`❌ Agent-specific analysis failed: ${error.message}`);
      throw error; // Re-throw as this is critical
    }
  }

  /**
   * Learn about the codebase structure and patterns
   */
  async learnCodebase(basePath) {
    // Analyze package.json
    await this.analyzePackageJson(basePath);
    
    // Analyze file structure
    await this.analyzeFileStructure(basePath);
    
    // Learn common patterns
    await this.learnCommonPatterns(basePath);
    
    // Detect conventions
    await this.detectConventions(basePath);
  }

  /**
   * Analyze package.json for technology stack with enhanced error handling
   */
  async analyzePackageJson(basePath) {
    try {
      const packagePath = path.join(basePath, 'package.json');
      
      // Check if file exists first
      try {
        await fs.access(packagePath);
      } catch {
        console.log('   No package.json found, skipping dependency analysis');
        return;
      }
      
      const content = await fs.readFile(packagePath, 'utf8');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Framework detection
      if (deps.react) this.codebaseProfile.framework = 'React';
      else if (deps.vue) this.codebaseProfile.framework = 'Vue';
      else if (deps['@angular/core']) this.codebaseProfile.framework = 'Angular';
      else if (deps.svelte) this.codebaseProfile.framework = 'Svelte';
      else if (deps.next) this.codebaseProfile.framework = 'Next.js';
      else if (deps.nuxt) this.codebaseProfile.framework = 'Nuxt';
      
      // Backend detection
      if (deps.express) this.codebaseProfile.backend = 'Express';
      else if (deps.fastify) this.codebaseProfile.backend = 'Fastify';
      else if (deps.koa) this.codebaseProfile.backend = 'Koa';
      else if (deps.hapi) this.codebaseProfile.backend = 'Hapi';
      else if (deps.nestjs) this.codebaseProfile.backend = 'NestJS';
      
      // Database detection
      if (deps.pg || deps.postgres) this.codebaseProfile.database = 'PostgreSQL';
      else if (deps.mysql || deps.mysql2) this.codebaseProfile.database = 'MySQL';
      else if (deps.mongodb) this.codebaseProfile.database = 'MongoDB';
      else if (deps.redis) this.codebaseProfile.database = 'Redis';
      else if (deps['@supabase/supabase-js']) this.codebaseProfile.database = 'Supabase';
      else if (deps.firebase) this.codebaseProfile.database = 'Firebase';
      else if (deps.prisma) this.codebaseProfile.database = 'Prisma';
      
      // CSS framework detection
      if (deps.tailwindcss) this.codebaseProfile.styling = 'Tailwind';
      else if (deps.bootstrap) this.codebaseProfile.styling = 'Bootstrap';
      else if (deps['styled-components']) this.codebaseProfile.styling = 'styled-components';
      else if (deps.emotion) this.codebaseProfile.styling = 'Emotion';
      else if (deps['@mui/material']) this.codebaseProfile.styling = 'Material-UI';
      
      // Testing framework detection
      if (deps.jest) this.codebaseProfile.testing = 'Jest';
      else if (deps.mocha) this.codebaseProfile.testing = 'Mocha';
      else if (deps.vitest) this.codebaseProfile.testing = 'Vitest';
      else if (deps['@playwright/test']) this.codebaseProfile.testing = 'Playwright';
      else if (deps.cypress) this.codebaseProfile.testing = 'Cypress';
      
      // Build tool detection
      if (deps.webpack) this.codebaseProfile.buildTool = 'Webpack';
      else if (deps.vite) this.codebaseProfile.buildTool = 'Vite';
      else if (deps.parcel) this.codebaseProfile.buildTool = 'Parcel';
      else if (deps.rollup) this.codebaseProfile.buildTool = 'Rollup';
      else if (deps.esbuild) this.codebaseProfile.buildTool = 'ESBuild';
      
      // Language detection
      if (deps.typescript) this.codebaseProfile.language = 'TypeScript';
      else this.codebaseProfile.language = 'JavaScript';
      
      // Package manager detection
      if (await this.fileExists(path.join(basePath, 'pnpm-lock.yaml'))) {
        this.codebaseProfile.packageManager = 'pnpm';
      } else if (await this.fileExists(path.join(basePath, 'yarn.lock'))) {
        this.codebaseProfile.packageManager = 'yarn';
      } else {
        this.codebaseProfile.packageManager = 'npm';
      }
      
      // Store all libraries for reference
      Object.keys(deps).forEach(lib => this.codebaseProfile.libraries.add(lib));
      
    } catch (error) {
      console.warn(`⚠️  Failed to analyze package.json: ${error.message}`);
      // Continue without dependency information
    }
  }

  /**
   * Analyze file structure to understand organization
   */
  async analyzeFileStructure(basePath) {
    const structure = new Map();
    
    // Common directories and their purposes
    const dirPurposes = {
      'src': 'source code',
      'components': 'UI components',
      'pages': 'page components',
      'views': 'view components',
      'api': 'API routes',
      'routes': 'routing',
      'services': 'business logic',
      'utils': 'utilities',
      'helpers': 'helper functions',
      'hooks': 'React hooks',
      'store': 'state management',
      'models': 'data models',
      'controllers': 'controllers',
      'middleware': 'middleware',
      'lib': 'libraries',
      'config': 'configuration',
      'public': 'static assets',
      'assets': 'assets',
      'styles': 'stylesheets',
      'tests': 'test files',
      '__tests__': 'test files'
    };
    
    // Scan top-level directories
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dirName = entry.name.toLowerCase();
          
          // Check if it matches known patterns
          for (const [pattern, purpose] of Object.entries(dirPurposes)) {
            if (dirName.includes(pattern)) {
              structure.set(entry.name, purpose);
              this.codebaseContext.fileStructure.set(entry.name, {
                purpose,
                path: path.join(basePath, entry.name)
              });
              break;
            }
          }
        }
      }
    } catch (error) {
      // Can't read directory
    }
    
    this.learningState.filesAnalyzed = structure.size;
  }

  /**
   * Learn common patterns used in the codebase
   */
  async learnCommonPatterns(basePath) {
    const files = await this.getSourceFiles(basePath);
    const sampleSize = Math.min(30, files.length); // Sample first 30 files
    const patterns = new Map();
    
    for (const file of files.slice(0, sampleSize)) {
      try {
        const content = await fs.readFile(file, 'utf8');
        
        // Component patterns (React/Vue/Angular)
        if (this.codebaseProfile.framework === 'React') {
          if (/export default function \w+|const \w+ = \(\) =>/.test(content)) {
            patterns.set('component-style', 'functional');
          } else if (/class \w+ extends (React\.)?Component/.test(content)) {
            patterns.set('component-style', 'class');
          }
        }
        
        // Async patterns
        if (/async\s+\w+|\.then\(|Promise\./.test(content)) {
          patterns.set('async-style', content.includes('async') ? 'async-await' : 'promises');
        }
        
        // Import style
        if (/import .* from/.test(content)) {
          patterns.set('module-style', 'es6');
        } else if (/require\(/.test(content)) {
          patterns.set('module-style', 'commonjs');
        }
        
        // State management patterns
        if (this.codebaseProfile.framework === 'React') {
          if (/useState|useReducer/.test(content)) {
            patterns.set('state-management', 'hooks');
          } else if (/connect\(|mapStateToProps/.test(content)) {
            patterns.set('state-management', 'redux');
          } else if (/useRecoilState|atom\(/.test(content)) {
            patterns.set('state-management', 'recoil');
          } else if (/create\(|useStore/.test(content) && this.codebaseProfile.libraries.has('zustand')) {
            patterns.set('state-management', 'zustand');
          }
        }
        
        // API call patterns
        if (/fetch\(|axios\.|superagent/.test(content)) {
          const apiStyle = content.includes('axios') ? 'axios' : 
                          content.includes('fetch') ? 'fetch' : 'other';
          patterns.set('api-style', apiStyle);
        }
        
        // Error handling patterns
        if (/try\s*\{[\s\S]*\}\s*catch/.test(content)) {
          patterns.set('error-handling', 'try-catch');
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    this.codebaseProfile.patterns = patterns;
    this.learningState.patternsLearned = patterns.size;
  }

  /**
   * Detect naming conventions and coding style
   */
  async detectConventions(basePath) {
    const files = await this.getSourceFiles(basePath);
    const conventions = new Map();
    
    // Analyze file naming
    const fileNames = files.map(f => path.basename(f));
    
    // Component naming convention
    const hasPascalCase = fileNames.some(f => /^[A-Z][a-zA-Z]+\.(jsx?|tsx?)$/.test(f));
    const hasKebabCase = fileNames.some(f => /^[a-z]+(-[a-z]+)+\.(jsx?|tsx?)$/.test(f));
    
    if (hasPascalCase) conventions.set('component-naming', 'PascalCase');
    else if (hasKebabCase) conventions.set('component-naming', 'kebab-case');
    
    // Directory structure convention
    const hasIndexFiles = files.some(f => f.endsWith('/index.js') || f.endsWith('/index.ts'));
    if (hasIndexFiles) conventions.set('exports', 'index-files');
    
    // Test file convention
    const hasTestFolder = files.some(f => f.includes('__tests__'));
    const hasTestSuffix = files.some(f => f.includes('.test.') || f.includes('.spec.'));
    
    if (hasTestFolder) conventions.set('test-location', 'test-folder');
    else if (hasTestSuffix) conventions.set('test-location', 'colocated');
    
    this.codebaseProfile.conventions = conventions;
  }

  /**
   * Build contextual understanding specific to analysis type
   */
  async buildContextualUnderstanding(basePath) {
    // This will be overridden by specific sub-agents
    // but provides default implementation
    
    // Map critical paths (performance-sensitive)
    const files = await this.getSourceFiles(basePath);
    
    for (const file of files.slice(0, 20)) { // Sample for speed
      const relativePath = path.relative(basePath, file);
      
      // Identify critical paths
      if (relativePath.includes('api') || 
          relativePath.includes('auth') || 
          relativePath.includes('payment') ||
          relativePath.includes('checkout')) {
        this.codebaseContext.criticalPaths.add(relativePath);
      }
      
      // Identify business logic
      if (relativePath.includes('services') || 
          relativePath.includes('controllers') ||
          relativePath.includes('models')) {
        this.codebaseContext.businessLogic.set(relativePath, 'core-logic');
      }
    }
  }

  /**
   * Agent-specific intelligent analysis (to be overridden)
   */
  async intelligentAnalyze(basePath, context) {
    // This method should be overridden by specific sub-agents
    throw new Error(`${this.name} must implement intelligentAnalyze() method`);
  }

  /**
   * Get intelligent recommendations based on codebase understanding
   */
  generateIntelligentRecommendations() {
    const recommendations = super.generateRecommendations();
    
    // Add framework-specific recommendations
    if (this.codebaseProfile.framework) {
      recommendations.forEach(rec => {
        rec.context = {
          framework: this.codebaseProfile.framework,
          language: this.codebaseProfile.language
        };
        
        // Enhance recommendations with framework-specific guidance
        if (this.codebaseProfile.framework === 'React' && rec.title.includes('Performance')) {
          rec.description += ' Consider using React.memo, useMemo, or useCallback.';
        } else if (this.codebaseProfile.framework === 'Vue' && rec.title.includes('Performance')) {
          rec.description += ' Consider using computed properties and v-once directive.';
        }
      });
    }
    
    return recommendations;
  }

  /**
   * Check if pattern matches codebase conventions
   */
  matchesConvention(pattern, type) {
    const convention = this.codebaseProfile.conventions.get(type);
    if (!convention) return true; // No convention detected, allow anything
    
    switch (type) {
      case 'component-naming':
        if (convention === 'PascalCase') {
          return /^[A-Z]/.test(pattern);
        } else if (convention === 'kebab-case') {
          return /^[a-z]+(-[a-z]+)*$/.test(pattern);
        }
        break;
      case 'async-style':
        return pattern === convention;
    }
    
    return true;
  }

  /**
   * Get context-aware confidence adjustment
   */
  getContextualConfidence(baseConfidence, context) {
    let adjusted = baseConfidence;
    
    // Adjust based on file location
    if (context.path?.includes('test') || context.path?.includes('mock')) {
      adjusted *= 0.5; // Lower confidence in test files
    } else if (this.codebaseContext.criticalPaths.has(context.path)) {
      adjusted *= 1.2; // Higher confidence in critical paths
    }
    
    // Adjust based on framework knowledge
    if (this.codebaseProfile.framework && context.frameworkSpecific) {
      adjusted *= 1.1; // Higher confidence when we understand the framework
    }
    
    return Math.min(1.0, adjusted);
  }

  // Utility methods
  
  async fileExists(filepath) {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }
}

export default IntelligentBaseSubAgent;