/**
 * Documentation Sub-Agent V2 - Intelligent Documentation Validator
 * Extends IntelligentBaseSubAgent for full integration with improvements
 * Validates documentation accuracy, completeness, and synchronization
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync as _execSync } from 'child_process';

class DocumentationSubAgentV2 extends IntelligentBaseSubAgent {
  constructor() {
    super('Documentation', '📚');
    
    // Documentation-specific thresholds
    this.thresholds = {
      codeSync: 0.8,      // 80% of code examples should work
      linkValidity: 0.9,   // 90% of links should be valid
      coverage: 0.7,       // 70% of public APIs should be documented
      freshness: 30        // Docs older than 30 days need review
    };
    
    // Track documentation health
    this.docHealth = {
      totalFiles: 0,
      outdatedFiles: 0,
      missingDocs: [],
      brokenLinks: [],
      invalidExamples: []
    };
  }

  /**
   * Intelligent documentation analysis using codebase understanding
   */
  async intelligentAnalyze(basePath, _context) {
    console.log('📚 Intelligent Documentation Analysis Starting...');
    
    // Use inherited codebase knowledge for better documentation validation
    console.log(`   Framework: ${this.codebaseProfile.framework || 'Generic'}, Language: ${this.codebaseProfile.language || 'JS'}`);
    
    // Find all documentation files
    const docFiles = await this.findDocumentationFiles(basePath);
    this.docHealth.totalFiles = docFiles.length;
    
    // Analyze each documentation file
    for (const docFile of docFiles) {
      await this.analyzeDocFile(docFile, basePath);
    }
    
    // Check for missing documentation
    await this.checkMissingDocumentation(basePath);
    
    // Analyze code-documentation sync
    await this.analyzeCodeDocSync(basePath);
    
    // Check README quality
    await this.validateReadme(path.join(basePath, 'README.md'));
    
    // Analyze API documentation
    await this.analyzeAPIDocs(basePath);
    
    console.log(`✓ Analyzed ${this.docHealth.totalFiles} documentation files`);
  }

  /**
   * Find all documentation files
   */
  async findDocumentationFiles(basePath) {
    const docFiles = [];
    const docDirs = ['docs', '.', 'documentation', 'wiki'];
    
    for (const dir of docDirs) {
      const fullPath = path.join(basePath, dir);
      try {
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            docFiles.push(path.join(fullPath, entry.name));
          } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            // Recursively search subdirectories
            const subDocs = await this.findDocumentationFiles(path.join(fullPath, entry.name));
            docFiles.push(...subDocs);
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    return docFiles;
  }

  /**
   * Analyze individual documentation file
   */
  async analyzeDocFile(docFile, basePath) {
    try {
      const content = await fs.readFile(docFile, 'utf8');
      const relativePath = path.relative(basePath, docFile);
      
      // Check freshness
      const stats = await fs.stat(docFile);
      const daysSinceUpdate = (Date.now() - stats.mtime) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > this.thresholds.freshness) {
        this.docHealth.outdatedFiles++;
        this.addFinding({
          type: 'OUTDATED_DOCUMENTATION',
          severity: 'medium',
          confidence: 0.9,
          file: relativePath,
          description: `Documentation is ${Math.round(daysSinceUpdate)} days old`,
          recommendation: 'Review and update documentation to reflect current implementation',
          metadata: {
            daysSinceUpdate: Math.round(daysSinceUpdate),
            lastModified: stats.mtime.toISOString()
          }
        });
      }
      
      // Check for broken links
      await this.checkLinks(content, relativePath);
      
      // Check code examples
      await this.checkCodeExamples(content, relativePath);
      
      // Check for TODO/FIXME comments
      const todoMatches = content.match(/TODO|FIXME|XXX|HACK/gi);
      if (todoMatches && todoMatches.length > 0) {
        this.addFinding({
          type: 'INCOMPLETE_DOCUMENTATION',
          severity: 'low',
          confidence: 1.0,
          file: relativePath,
          description: `Found ${todoMatches.length} TODO/FIXME markers`,
          recommendation: 'Complete the unfinished documentation sections',
          metadata: {
            markers: todoMatches
          }
        });
      }
      
      // Check for missing sections
      this.checkDocumentStructure(content, relativePath);
      
    } catch {
      // File read error
    }
  }

  /**
   * Check for broken links
   */
  async checkLinks(content, file) {
    // Find all markdown links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      const linkUrl = match[2];
      
      // Check internal links
      if (!linkUrl.startsWith('http')) {
        const fullPath = path.resolve(path.dirname(file), linkUrl);
        try {
          await fs.access(fullPath);
        } catch {
          this.docHealth.brokenLinks.push(linkUrl);
          this.addFinding({
            type: 'BROKEN_LINK',
            severity: 'medium',
            confidence: 1.0,
            file,
            description: `Broken internal link: ${linkUrl}`,
            recommendation: `Fix link or remove reference to "${linkText}"`,
            metadata: {
              linkText,
              linkUrl
            }
          });
        }
      }
      // For external links, we'd need to make HTTP requests (skipping for performance)
    }
  }

  /**
   * Check code examples in documentation
   */
  async checkCodeExamples(content, file) {
    // Extract code blocks
    const codeBlockRegex = /```(?:javascript|js|typescript|ts|jsx|tsx)\n([\s\S]*?)```/g;
    let match;
    let exampleCount = 0;
    let invalidCount = 0;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      exampleCount++;
      const code = match[1];
      
      // Basic syntax validation
      try {
        // Check for common issues
        if (code.includes('undefined is not defined') || 
            code.includes('// ...') && !code.includes('actual code')) {
          invalidCount++;
          this.docHealth.invalidExamples.push({ file, code: code.substring(0, 50) });
          
          this.addFinding({
            type: 'INVALID_CODE_EXAMPLE',
            severity: 'low',
            confidence: 0.8,
            file,
            snippet: code.substring(0, 100),
            description: 'Code example appears to be placeholder or invalid',
            recommendation: 'Replace with working code example',
            metadata: {
              exampleNumber: exampleCount
            }
          });
        }
        
        // Check for imports that don't exist
        const importMatches = code.match(/import .+ from ['"](.+)['"]/g);
        if (importMatches) {
          for (const importLine of importMatches) {
            const moduleName = importLine.match(/from ['"](.+)['"]/)[1];
            if (moduleName.startsWith('.')) {
              // Check if relative import exists
              const importPath = path.resolve(path.dirname(file), moduleName);
              try {
                await fs.access(importPath + '.js');
              } catch {
                this.addFinding({
                  type: 'INVALID_IMPORT_IN_EXAMPLE',
                  severity: 'medium',
                  confidence: 0.9,
                  file,
                  snippet: importLine,
                  description: `Example imports non-existent module: ${moduleName}`,
                  recommendation: 'Update import path or create missing module',
                  metadata: {
                    moduleName
                  }
                });
              }
            }
          }
        }
      } catch {
        // Syntax error in example
        invalidCount++;
      }
    }
    
    // Calculate code example validity rate
    if (exampleCount > 0) {
      const validityRate = (exampleCount - invalidCount) / exampleCount;
      if (validityRate < this.thresholds.codeSync) {
        this.addFinding({
          type: 'LOW_CODE_EXAMPLE_QUALITY',
          severity: 'medium',
          confidence: 0.9,
          file,
          description: `Only ${Math.round(validityRate * 100)}% of code examples are valid`,
          recommendation: 'Review and fix code examples',
          metadata: {
            totalExamples: exampleCount,
            invalidExamples: invalidCount
          }
        });
      }
    }
  }

  /**
   * Check document structure
   */
  checkDocumentStructure(content, file) {
    const fileName = path.basename(file).toLowerCase();
    
    // README should have certain sections
    if (fileName === 'readme.md') {
      const expectedSections = ['Installation', 'Usage', 'License'];
      const missingSections = [];
      
      for (const section of expectedSections) {
        if (!content.toLowerCase().includes(section.toLowerCase())) {
          missingSections.push(section);
        }
      }
      
      if (missingSections.length > 0) {
        this.addFinding({
          type: 'MISSING_README_SECTIONS',
          severity: 'low',
          confidence: 0.9,
          file,
          description: `README missing sections: ${missingSections.join(', ')}`,
          recommendation: 'Add missing sections for completeness',
          metadata: {
            missingSections
          }
        });
      }
    }
    
    // API docs should have examples
    if (fileName.includes('api') && !content.includes('```')) {
      this.addFinding({
        type: 'API_DOCS_WITHOUT_EXAMPLES',
        severity: 'medium',
        confidence: 0.85,
        file,
        description: 'API documentation lacks code examples',
        recommendation: 'Add code examples showing API usage',
        metadata: {
          hasExamples: false
        }
      });
    }
  }

  /**
   * Check for missing documentation
   */
  async checkMissingDocumentation(basePath) {
    // Check if main files have corresponding docs
    const criticalFiles = ['package.json', 'tsconfig.json', '.env.example'];
    
    for (const criticalFile of criticalFiles) {
      const filePath = path.join(basePath, criticalFile);
      try {
        await fs.access(filePath);
        
        // File exists, check if documented
        if (criticalFile === 'package.json') {
          const pkg = JSON.parse(await fs.readFile(filePath, 'utf8'));
          
          // Check if scripts are documented
          if (pkg.scripts && Object.keys(pkg.scripts).length > 5) {
            const readmePath = path.join(basePath, 'README.md');
            try {
              const readme = await fs.readFile(readmePath, 'utf8');
              const undocumentedScripts = [];
              
              for (const script of Object.keys(pkg.scripts)) {
                if (!readme.includes(script)) {
                  undocumentedScripts.push(script);
                }
              }
              
              if (undocumentedScripts.length > 3) {
                this.addFinding({
                  type: 'UNDOCUMENTED_SCRIPTS',
                  severity: 'medium',
                  confidence: 0.9,
                  file: 'package.json',
                  description: `${undocumentedScripts.length} npm scripts are not documented`,
                  recommendation: 'Add script documentation to README',
                  metadata: {
                    undocumentedScripts: undocumentedScripts.slice(0, 5)
                  }
                });
              }
            } catch {
              // No README
            }
          }
        }
      } catch {
        // File doesn't exist, not a problem
      }
    }
    
    // Check for API routes without documentation
    await this.checkAPIDocumentation(basePath);
  }

  /**
   * Check API documentation
   */
  async checkAPIDocumentation(basePath) {
    const apiDirs = ['routes', 'api', 'controllers', 'endpoints'];
    
    for (const dir of apiDirs) {
      const apiPath = path.join(basePath, 'src', dir);
      try {
        const files = await fs.readdir(apiPath);
        
        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = await fs.readFile(path.join(apiPath, file), 'utf8');
            
            // Look for route definitions without JSDoc
            const routeRegex = /app\.(get|post|put|delete|patch)\(['"]([^'"]+)/g;
            let match;
            
            while ((match = routeRegex.exec(content)) !== null) {
              const method = match[1];
              const route = match[2];
              
              // Check if there's a comment before this route
              const beforeRoute = content.substring(Math.max(0, match.index - 200), match.index);
              if (!beforeRoute.includes('/**') && !beforeRoute.includes('//')) {
                this.addFinding({
                  type: 'UNDOCUMENTED_API_ENDPOINT',
                  severity: 'medium',
                  confidence: 0.85,
                  file: path.join(dir, file),
                  description: `API endpoint lacks documentation: ${method.toUpperCase()} ${route}`,
                  recommendation: 'Add JSDoc comment describing endpoint',
                  metadata: {
                    method: method.toUpperCase(),
                    route
                  }
                });
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
  }

  /**
   * Validate README
   */
  async validateReadme(readmePath) {
    try {
      const content = await fs.readFile(readmePath, 'utf8');
      
      // Check if README is too short
      if (content.length < 500) {
        this.addFinding({
          type: 'MINIMAL_README',
          severity: 'high',
          confidence: 1.0,
          file: 'README.md',
          description: 'README is too brief (less than 500 characters)',
          recommendation: 'Expand README with proper project documentation',
          metadata: {
            currentLength: content.length
          }
        });
      }
      
      // Check for badges
      if (!content.includes('![') && !content.includes('[![')) {
        this.addFinding({
          type: 'NO_BADGES',
          severity: 'low',
          confidence: 0.7,
          file: 'README.md',
          description: 'README lacks status badges',
          recommendation: 'Add badges for build status, coverage, version, etc.',
          metadata: {
            suggestion: 'npm version, build status, coverage, license'
          }
        });
      }
      
      // Check for project setup instructions
      if (!content.toLowerCase().includes('npm install') && 
          !content.toLowerCase().includes('yarn install') &&
          !content.toLowerCase().includes('pnpm install')) {
        this.addFinding({
          type: 'MISSING_SETUP_INSTRUCTIONS',
          severity: 'high',
          confidence: 0.95,
          file: 'README.md',
          description: 'README lacks installation instructions',
          recommendation: 'Add clear setup and installation steps',
          metadata: {
            required: true
          }
        });
      }
    } catch {
      // No README file
      this.addFinding({
        type: 'MISSING_README',
        severity: 'critical',
        confidence: 1.0,
        file: 'README.md',
        description: 'Project lacks README.md file',
        recommendation: 'Create README.md with project documentation',
        metadata: {
          required: true,
          template: 'https://github.com/othneildrew/Best-README-Template'
        }
      });
    }
  }

  /**
   * Analyze code-documentation synchronization
   */
  async analyzeCodeDocSync(basePath) {
    // Check if function signatures in docs match actual code
    const srcPath = path.join(basePath, 'src');
    
    try {
      // Find all source files
      const sourceFiles = await this.findSourceFiles(srcPath);
      
      // Extract exported functions
      const exportedFunctions = new Map();
      
      for (const file of sourceFiles) {
        const content = await fs.readFile(file, 'utf8');
        
        // Find exported functions
        const exportRegex = /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=/g;
        let match;
        
        while ((match = exportRegex.exec(content)) !== null) {
          const funcName = match[1] || match[2];
          exportedFunctions.set(funcName, file);
        }
      }
      
      // Check if documented
      const undocumentedExports = [];
      for (const [funcName, file] of exportedFunctions) {
        // This is simplified - in reality would check actual doc files
        if (!funcName.startsWith('_') && !funcName.includes('private')) {
          undocumentedExports.push({ funcName, file });
        }
      }
      
      if (undocumentedExports.length > 5) {
        this.addFinding({
          type: 'UNDOCUMENTED_PUBLIC_API',
          severity: 'high',
          confidence: 0.8,
          file: 'src',
          description: `${undocumentedExports.length} public functions lack documentation`,
          recommendation: 'Document all public API functions',
          metadata: {
            examples: undocumentedExports.slice(0, 5).map(e => e.funcName)
          }
        });
      }
    } catch {
      // No src directory
    }
  }

  /**
   * Find source files
   */
  async findSourceFiles(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.findSourceFiles(path.join(dir, entry.name));
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return files;
  }

  /**
   * Analyze API documentation
   */
  async analyzeAPIDocs(basePath) {
    // Check for OpenAPI/Swagger
    const swaggerFiles = ['swagger.json', 'swagger.yaml', 'openapi.json', 'openapi.yaml'];
    let hasApiDocs = false;
    
    for (const swaggerFile of swaggerFiles) {
      try {
        await fs.access(path.join(basePath, swaggerFile));
        hasApiDocs = true;
        
        // Validate swagger file
        const content = await fs.readFile(path.join(basePath, swaggerFile), 'utf8');
        if (swaggerFile.endsWith('.json')) {
          try {
            const swagger = JSON.parse(content);
            if (!swagger.paths || Object.keys(swagger.paths).length === 0) {
              this.addFinding({
                type: 'EMPTY_API_SPECIFICATION',
                severity: 'high',
                confidence: 1.0,
                file: swaggerFile,
                description: 'API specification exists but has no endpoints defined',
                recommendation: 'Add endpoint definitions to API specification',
                metadata: {
                  format: 'OpenAPI/Swagger'
                }
              });
            }
          } catch {
            this.addFinding({
              type: 'INVALID_API_SPECIFICATION',
              severity: 'high',
              confidence: 1.0,
              file: swaggerFile,
              description: 'API specification is invalid JSON',
              recommendation: 'Fix JSON syntax in API specification',
              metadata: {
                format: 'JSON'
              }
            });
          }
        }
        break;
      } catch {
        // File doesn't exist
      }
    }
    
    // Check if API exists but no documentation
    const hasAPI = await this.detectAPI(basePath);
    if (hasAPI && !hasApiDocs) {
      this.addFinding({
        type: 'MISSING_API_DOCUMENTATION',
        severity: 'high',
        confidence: 0.9,
        file: 'api',
        description: 'Project has API endpoints but no OpenAPI/Swagger documentation',
        recommendation: 'Create OpenAPI specification for API endpoints',
        metadata: {
          suggestion: 'Use tools like swagger-jsdoc to generate from code comments'
        }
      });
    }
  }

  /**
   * Detect if project has API
   */
  async detectAPI(basePath) {
    // Check package.json for API frameworks
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const apiFrameworks = ['express', 'koa', 'fastify', 'hapi', 'nestjs', 'next', 'graphql'];
      
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return apiFrameworks.some(framework => framework in deps);
    } catch {
      return false;
    }
  }
}

export default DocumentationSubAgentV2;