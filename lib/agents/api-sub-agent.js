/**
 * API Sub-Agent - Intelligent API Analysis
 * Extends IntelligentBaseSubAgent for full integration with improvements
 * Analyzes REST/GraphQL APIs for compliance, performance, and security
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

class APISubAgent extends IntelligentBaseSubAgent {
  constructor() {
    super('API', '🚀');
    
    // API quality thresholds
    this.thresholds = {
      responseTime: 200,      // ms
      statusCodes: 0.95,      // 95% success rate
      documentation: 0.8,     // 80% endpoints documented
      versioning: true,       // API should be versioned
      errorHandling: 0.9      // 90% of endpoints should have error handling
    };
    
    // API health tracking
    this.apiHealth = {
      endpoints: [],
      totalEndpoints: 0,
      documentedEndpoints: 0,
      versionedEndpoints: 0,
      secureEndpoints: 0,
      protocols: new Set()
    };
  }

  /**
   * Intelligent API analysis using codebase understanding
   */
  async intelligentAnalyze(basePath, context) {
    console.log('🚀 Intelligent API Analysis Starting...');
    
    // Use inherited codebase knowledge for better API detection
    const apiFramework = this.codebaseProfile.backend || 
                        (this.codebaseProfile.framework === 'Next.js' ? 'Next.js API' : null);
    
    console.log(`   API Framework: ${apiFramework || 'None detected'}`);
    
    if (!apiFramework) {
      // Check if there are API-like patterns in code
      const hasAPIPatterns = await this.detectAPIPatterns(basePath);
      if (!hasAPIPatterns) {
        console.log('   No API detected, skipping analysis');
        return;
      }
    }
    
    const apiInfo = { framework: apiFramework };
    
    // Find and analyze API endpoints
    await this.analyzeEndpoints(basePath, apiInfo);
    
    // Check API documentation
    await this.analyzeAPIDocumentation(basePath);
    
    // Analyze API structure and patterns
    await this.analyzeAPIStructure(basePath);
    
    // Check authentication and security
    await this.analyzeAPISecurity(basePath);
    
    // Check error handling
    await this.analyzeErrorHandling(basePath);
    
    // Validate request/response schemas
    await this.validateSchemas(basePath);
    
    // Check rate limiting
    await this.checkRateLimiting(basePath);
    
    // Analyze API versioning
    await this.analyzeVersioning(basePath);
    
    // Check CORS configuration
    await this.analyzeCORS(basePath);
    
    console.log(`✓ Analyzed ${this.apiHealth.totalEndpoints} API endpoints`);
  }

  /**
   * Detect API framework
   */
  async detectAPIFramework(basePath) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // REST frameworks
      if ('express' in deps) return { framework: 'Express', type: 'REST' };
      if ('koa' in deps) return { framework: 'Koa', type: 'REST' };
      if ('fastify' in deps) return { framework: 'Fastify', type: 'REST' };
      if ('@hapi/hapi' in deps || 'hapi' in deps) return { framework: 'Hapi', type: 'REST' };
      if ('@nestjs/core' in deps) return { framework: 'NestJS', type: 'REST' };
      
      // GraphQL
      if ('graphql' in deps) {
        if ('apollo-server' in deps) return { framework: 'Apollo Server', type: 'GraphQL' };
        if ('graphql-yoga' in deps) return { framework: 'GraphQL Yoga', type: 'GraphQL' };
        return { framework: 'GraphQL', type: 'GraphQL' };
      }
      
      // Next.js API routes
      if ('next' in deps) return { framework: 'Next.js', type: 'REST' };
      
      // Serverless
      if ('serverless' in deps) return { framework: 'Serverless', type: 'REST' };
      
      return { framework: null, type: null };
    } catch {
      return { framework: null, type: null };
    }
  }

  /**
   * Detect API patterns in code
   */
  async detectAPIPatterns(basePath) {
    const apiDirs = ['api', 'routes', 'controllers', 'endpoints', 'src/api', 'src/routes'];
    
    for (const dir of apiDirs) {
      try {
        const fullPath = path.join(basePath, dir);
        const files = await fs.readdir(fullPath);
        
        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = await fs.readFile(path.join(fullPath, file), 'utf8');
            
            // Look for HTTP method patterns
            if (/\.(get|post|put|delete|patch)\s*\(/i.test(content) ||
                /app\.use\s*\(/i.test(content) ||
                /router\./i.test(content) ||
                /express\(\)/i.test(content)) {
              return true;
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
    
    return false;
  }

  /**
   * Analyze API endpoints
   */
  async analyzeEndpoints(basePath, apiInfo) {
    const apiFiles = await this.findAPIFiles(basePath);
    
    for (const file of apiFiles) {
      await this.analyzeAPIFile(file, basePath);
    }
    
    // Check for common endpoint issues
    if (this.apiHealth.totalEndpoints === 0) {
      this.addFinding({
        type: 'NO_API_ENDPOINTS',
        severity: 'high',
        confidence: 0.9,
        file: 'api',
        description: 'API framework detected but no endpoints found',
        recommendation: 'Define API endpoints or remove unused framework dependencies',
        metadata: {
          framework: apiInfo.framework
        }
      });
    }
  }

  /**
   * Find API files
   */
  async findAPIFiles(basePath) {
    const apiFiles = [];
    const searchDirs = [
      'api', 'routes', 'controllers', 'endpoints',
      'src/api', 'src/routes', 'src/controllers',
      'pages/api', // Next.js
      'functions', // Serverless
      'lambda' // AWS Lambda
    ];
    
    for (const dir of searchDirs) {
      const fullPath = path.join(basePath, dir);
      
      async function scan(scanDir) {
        try {
          const entries = await fs.readdir(scanDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = path.join(scanDir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await scan(entryPath);
            } else if (entry.isFile() && 
                      (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
              apiFiles.push(entryPath);
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }
      
      await scan(fullPath);
    }
    
    return apiFiles;
  }

  /**
   * Analyze individual API file
   */
  async analyzeAPIFile(file, basePath) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(basePath, file);
      
      // Find HTTP method definitions
      const methodRegex = /\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:async\s+)?\(?([^)]*)\)?\s*=>\s*{|app\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      
      let match;
      while ((match = methodRegex.exec(content)) !== null) {
        const method = (match[1] || match[4]).toUpperCase();
        const route = match[2] || match[5];
        const params = match[3] || '';
        
        this.apiHealth.totalEndpoints++;
        
        const endpoint = {
          method,
          route,
          file: relativePath,
          params,
          documented: false,
          authenticated: false,
          validated: false,
          errorHandled: false
        };
        
        this.apiHealth.endpoints.push(endpoint);
        
        // Analyze endpoint quality
        await this.analyzeEndpoint(endpoint, content, relativePath);
      }
      
      // Check for GraphQL schemas
      if (content.includes('GraphQL') || content.includes('gql`') || content.includes('buildSchema')) {
        await this.analyzeGraphQL(content, relativePath);
      }
      
    } catch (error) {
      // File read error
    }
  }

  /**
   * Analyze individual endpoint
   */
  async analyzeEndpoint(endpoint, fileContent, file) {
    const { method, route } = endpoint;
    
    // Check for parameter validation
    const hasValidation = /req\.body\s*&&|joi\.|yup\.|validate|schema/i.test(fileContent);
    if (!hasValidation && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      this.addFinding({
        type: 'MISSING_INPUT_VALIDATION',
        severity: 'high',
        confidence: 0.9,
        file,
        description: `${method} ${route} lacks input validation`,
        recommendation: 'Add request body validation using Joi, Yup, or similar',
        metadata: {
          endpoint: `${method} ${route}`,
          method,
          route
        }
      });
    }
    
    // Check for authentication
    const hasAuth = /auth|jwt|token|passport|session/i.test(fileContent);
    if (!hasAuth && !route.includes('public') && !route.includes('health')) {
      this.addFinding({
        type: 'MISSING_AUTHENTICATION',
        severity: 'high',
        confidence: 0.8,
        file,
        description: `${method} ${route} appears to lack authentication`,
        recommendation: 'Add authentication middleware for protected endpoints',
        metadata: {
          endpoint: `${method} ${route}`
        }
      });
    }
    
    // Check for error handling
    const hasErrorHandling = /try\s*{|catch\s*\(|\.catch\s*\(/i.test(fileContent);
    if (!hasErrorHandling) {
      this.addFinding({
        type: 'MISSING_ERROR_HANDLING',
        severity: 'medium',
        confidence: 0.85,
        file,
        description: `${method} ${route} lacks error handling`,
        recommendation: 'Add try-catch blocks or error handling middleware',
        metadata: {
          endpoint: `${method} ${route}`
        }
      });
    }
    
    // Check for SQL injection vulnerabilities
    if (fileContent.includes('query(') && fileContent.includes('req.body')) {
      const hasSQLInjection = /query\s*\(\s*['"`].*\$\{.*req\./i.test(fileContent);
      if (hasSQLInjection) {
        this.addFinding({
          type: 'SQL_INJECTION_RISK',
          severity: 'critical',
          confidence: 0.95,
          file,
          description: `${method} ${route} vulnerable to SQL injection`,
          recommendation: 'Use parameterized queries or ORM methods',
          metadata: {
            endpoint: `${method} ${route}`
          }
        });
      }
    }
    
    // Check for proper HTTP status codes
    const statusCodeRegex = /res\.status\s*\(\s*(\d+)\s*\)|res\.sendStatus\s*\(\s*(\d+)\s*\)/g;
    const statusCodes = [];
    let statusMatch;
    
    while ((statusMatch = statusCodeRegex.exec(fileContent)) !== null) {
      statusCodes.push(parseInt(statusMatch[1] || statusMatch[2]));
    }
    
    // Check if using appropriate status codes
    if (method === 'POST' && !statusCodes.includes(201) && statusCodes.length > 0) {
      this.addFinding({
        type: 'INCORRECT_STATUS_CODE',
        severity: 'low',
        confidence: 0.7,
        file,
        description: `POST ${route} should return 201 for successful creation`,
        recommendation: 'Use res.status(201) for successful resource creation',
        metadata: {
          endpoint: `${method} ${route}`,
          currentCodes: statusCodes
        }
      });
    }
    
    // Check for rate limiting
    const hasRateLimit = /rate.*limit|express-rate-limit|slowdown/i.test(fileContent);
    if (!hasRateLimit && (method === 'POST' || method === 'PUT')) {
      this.addFinding({
        type: 'MISSING_RATE_LIMITING',
        severity: 'medium',
        confidence: 0.8,
        file,
        description: `${method} ${route} lacks rate limiting`,
        recommendation: 'Add rate limiting middleware for write operations',
        metadata: {
          endpoint: `${method} ${route}`
        }
      });
    }
  }

  /**
   * Analyze GraphQL
   */
  async analyzeGraphQL(content, file) {
    // Check for GraphQL best practices
    if (!content.includes('Query') || !content.includes('Mutation')) {
      this.addFinding({
        type: 'INCOMPLETE_GRAPHQL_SCHEMA',
        severity: 'medium',
        confidence: 0.8,
        file,
        description: 'GraphQL schema missing Query or Mutation types',
        recommendation: 'Define proper GraphQL schema with Query and Mutation types',
        metadata: {
          type: 'GraphQL'
        }
      });
    }
    
    // Check for N+1 query problems
    if (content.includes('for') && content.includes('await')) {
      this.addFinding({
        type: 'GRAPHQL_N_PLUS_ONE',
        severity: 'high',
        confidence: 0.7,
        file,
        description: 'Potential N+1 query problem in GraphQL resolver',
        recommendation: 'Use DataLoader or batch queries to avoid N+1 problems',
        metadata: {
          type: 'GraphQL'
        }
      });
    }
  }

  /**
   * Analyze API documentation
   */
  async analyzeAPIDocumentation(basePath) {
    // Check for OpenAPI/Swagger
    const swaggerFiles = [
      'swagger.json', 'swagger.yaml', 'swagger.yml',
      'openapi.json', 'openapi.yaml', 'openapi.yml',
      'api-docs.json', 'api-docs.yaml'
    ];
    
    let hasAPIDoc = false;
    
    for (const swaggerFile of swaggerFiles) {
      try {
        const content = await fs.readFile(path.join(basePath, swaggerFile), 'utf8');
        hasAPIDoc = true;
        
        // Validate swagger/openapi
        if (swaggerFile.endsWith('.json')) {
          try {
            const spec = JSON.parse(content);
            await this.validateOpenAPISpec(spec, swaggerFile);
          } catch (error) {
            this.addFinding({
              type: 'INVALID_API_SPECIFICATION',
              severity: 'high',
              confidence: 1.0,
              file: swaggerFile,
              description: 'API specification has invalid JSON syntax',
              recommendation: 'Fix JSON syntax errors in API specification',
              metadata: {
                error: error.message
              }
            });
          }
        }
        break;
      } catch {
        // File doesn't exist
      }
    }
    
    if (!hasAPIDoc && this.apiHealth.totalEndpoints > 0) {
      this.addFinding({
        type: 'MISSING_API_DOCUMENTATION',
        severity: 'high',
        confidence: 0.9,
        file: 'api-docs',
        description: `${this.apiHealth.totalEndpoints} API endpoints lack documentation`,
        recommendation: 'Create OpenAPI/Swagger specification for API',
        metadata: {
          endpoints: this.apiHealth.totalEndpoints,
          suggestion: 'Use swagger-jsdoc to generate docs from code comments'
        }
      });
    }
    
    // Check for README API documentation
    try {
      const readme = await fs.readFile(path.join(basePath, 'README.md'), 'utf8');
      
      if (this.apiHealth.totalEndpoints > 0 && !readme.toLowerCase().includes('api')) {
        this.addFinding({
          type: 'API_NOT_DOCUMENTED_IN_README',
          severity: 'medium',
          confidence: 0.8,
          file: 'README.md',
          description: 'API endpoints not mentioned in README',
          recommendation: 'Add API usage examples to README',
          metadata: {
            endpoints: this.apiHealth.totalEndpoints
          }
        });
      }
    } catch {
      // No README
    }
  }

  /**
   * Validate OpenAPI specification
   */
  async validateOpenAPISpec(spec, file) {
    // Check required fields
    if (!spec.openapi && !spec.swagger) {
      this.addFinding({
        type: 'MISSING_API_VERSION',
        severity: 'high',
        confidence: 1.0,
        file,
        description: 'API specification missing version field',
        recommendation: 'Add openapi or swagger version field',
        metadata: {
          required: 'openapi: "3.0.0" or swagger: "2.0"'
        }
      });
    }
    
    if (!spec.info) {
      this.addFinding({
        type: 'MISSING_API_INFO',
        severity: 'medium',
        confidence: 1.0,
        file,
        description: 'API specification missing info section',
        recommendation: 'Add API title, description, and version in info section',
        metadata: {
          required: 'info: { title, description, version }'
        }
      });
    }
    
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      this.addFinding({
        type: 'EMPTY_API_SPECIFICATION',
        severity: 'high',
        confidence: 1.0,
        file,
        description: 'API specification has no endpoints defined',
        recommendation: 'Add endpoint definitions to paths section',
        metadata: {
          actualEndpoints: this.apiHealth.totalEndpoints
        }
      });
    } else {
      // Check coverage
      const specEndpoints = Object.keys(spec.paths).length;
      const coverage = specEndpoints / this.apiHealth.totalEndpoints;
      
      if (coverage < this.thresholds.documentation) {
        this.addFinding({
          type: 'INCOMPLETE_API_DOCUMENTATION',
          severity: 'medium',
          confidence: 0.9,
          file,
          description: `Only ${Math.round(coverage * 100)}% of endpoints are documented`,
          recommendation: 'Document all API endpoints in specification',
          metadata: {
            documented: specEndpoints,
            total: this.apiHealth.totalEndpoints,
            coverage: Math.round(coverage * 100)
          }
        });
      }
    }
  }

  /**
   * Analyze API structure
   */
  async analyzeAPIStructure(basePath) {
    // Check for RESTful patterns
    const endpoints = this.apiHealth.endpoints;
    const routes = endpoints.map(e => e.route);
    
    // Check for inconsistent naming
    const hasInconsistentNaming = routes.some(route => 
      route.includes('_') && routes.some(r => r.includes('-'))
    );
    
    if (hasInconsistentNaming) {
      this.addFinding({
        type: 'INCONSISTENT_ROUTE_NAMING',
        severity: 'low',
        confidence: 0.8,
        file: 'api-structure',
        description: 'API routes use inconsistent naming conventions',
        recommendation: 'Use consistent naming (either kebab-case or snake_case)',
        metadata: {
          examples: routes.filter(r => r.includes('_') || r.includes('-')).slice(0, 3)
        }
      });
    }
    
    // Check for proper resource naming (plural vs singular)
    const singularRoutes = routes.filter(route => 
      /\/\w+\/\d+$/.test(route) && !route.includes('/') // e.g., /user/123
    );
    
    if (singularRoutes.length > 0) {
      this.addFinding({
        type: 'NON_RESTFUL_RESOURCE_NAMING',
        severity: 'low',
        confidence: 0.7,
        file: 'api-structure',
        description: 'Some routes use singular resource names',
        recommendation: 'Use plural resource names for RESTful APIs (e.g., /users/123)',
        metadata: {
          examples: singularRoutes.slice(0, 3)
        }
      });
    }
    
    // Check for deep nesting
    const deepRoutes = routes.filter(route => 
      (route.match(/\//g) || []).length > 4
    );
    
    if (deepRoutes.length > 0) {
      this.addFinding({
        type: 'DEEPLY_NESTED_ROUTES',
        severity: 'medium',
        confidence: 0.8,
        file: 'api-structure',
        description: 'Some routes are deeply nested (>4 levels)',
        recommendation: 'Consider flattening route structure for better usability',
        metadata: {
          examples: deepRoutes.slice(0, 3)
        }
      });
    }
  }

  /**
   * Analyze API security
   */
  async analyzeAPISecurity(basePath) {
    const apiFiles = await this.findAPIFiles(basePath);
    
    for (const file of apiFiles.slice(0, 10)) { // Sample for performance
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(basePath, file);
        
        // Check for hardcoded secrets
        if (/api[_-]?key\s*[:=]\s*["'][^"']+["']/i.test(content)) {
          this.addFinding({
            type: 'HARDCODED_API_KEY',
            severity: 'critical',
            confidence: 0.9,
            file: relativePath,
            description: 'Hardcoded API key found in source code',
            recommendation: 'Move API keys to environment variables',
            metadata: {
              type: 'security'
            }
          });
        }
        
        // Check for CORS misconfiguration
        if (content.includes('cors') && content.includes('origin: "*"')) {
          this.addFinding({
            type: 'INSECURE_CORS',
            severity: 'high',
            confidence: 0.95,
            file: relativePath,
            description: 'CORS configured to allow all origins',
            recommendation: 'Restrict CORS to specific trusted domains',
            metadata: {
              current: 'origin: "*"',
              suggestion: 'origin: ["https://yourdomain.com"]'
            }
          });
        }
        
        // Check for missing HTTPS enforcement
        if (content.includes('http://') && !content.includes('localhost')) {
          this.addFinding({
            type: 'INSECURE_HTTP',
            severity: 'high',
            confidence: 0.8,
            file: relativePath,
            description: 'Using HTTP instead of HTTPS',
            recommendation: 'Enforce HTTPS for all API communications',
            metadata: {
              protocol: 'HTTP'
            }
          });
        }
      } catch {
        // File read error
      }
    }
  }

  /**
   * Analyze error handling
   */
  async analyzeErrorHandling(basePath) {
    const apiFiles = await this.findAPIFiles(basePath);
    let filesWithoutErrorHandling = 0;
    
    for (const file of apiFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        
        // Check for error handling patterns
        const hasErrorHandling = 
          content.includes('try') && content.includes('catch') ||
          content.includes('.catch(') ||
          content.includes('error') && content.includes('status');
        
        if (!hasErrorHandling) {
          filesWithoutErrorHandling++;
        }
      } catch {
        // File read error
      }
    }
    
    if (filesWithoutErrorHandling > 0) {
      const ratio = filesWithoutErrorHandling / apiFiles.length;
      
      if (ratio > 0.5) {
        this.addFinding({
          type: 'INADEQUATE_ERROR_HANDLING',
          severity: 'high',
          confidence: 0.9,
          file: 'api',
          description: `${Math.round(ratio * 100)}% of API files lack error handling`,
          recommendation: 'Implement comprehensive error handling for all endpoints',
          metadata: {
            filesWithoutHandling: filesWithoutErrorHandling,
            totalFiles: apiFiles.length
          }
        });
      }
    }
  }

  /**
   * Validate schemas
   */
  async validateSchemas(basePath) {
    // Look for schema validation libraries
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      const validationLibs = ['joi', 'yup', 'ajv', 'express-validator', 'class-validator'];
      const hasValidation = validationLibs.some(lib => lib in deps);
      
      if (!hasValidation && this.apiHealth.totalEndpoints > 0) {
        this.addFinding({
          type: 'MISSING_SCHEMA_VALIDATION',
          severity: 'high',
          confidence: 0.8,
          file: 'package.json',
          description: 'No schema validation library found',
          recommendation: 'Add Joi, Yup, or similar for request/response validation',
          metadata: {
            suggestions: validationLibs.slice(0, 3)
          }
        });
      }
    } catch {
      // Package.json error
    }
  }

  /**
   * Check rate limiting
   */
  async checkRateLimiting(basePath) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      const rateLimitLibs = ['express-rate-limit', 'rate-limiter-flexible', 'express-slow-down'];
      const hasRateLimit = rateLimitLibs.some(lib => lib in deps);
      
      if (!hasRateLimit && this.apiHealth.totalEndpoints > 5) {
        this.addFinding({
          type: 'MISSING_RATE_LIMITING',
          severity: 'medium',
          confidence: 0.8,
          file: 'package.json',
          description: 'No rate limiting configured for API',
          recommendation: 'Add rate limiting to prevent abuse',
          metadata: {
            endpoints: this.apiHealth.totalEndpoints,
            suggestions: rateLimitLibs
          }
        });
      }
    } catch {
      // Package.json error
    }
  }

  /**
   * Analyze versioning
   */
  async analyzeVersioning(basePath) {
    const endpoints = this.apiHealth.endpoints;
    const versionedRoutes = endpoints.filter(e => 
      /\/v\d+\/|\/api\/v\d+\/|version.*=/.test(e.route)
    );
    
    this.apiHealth.versionedEndpoints = versionedRoutes.length;
    
    if (endpoints.length > 5 && versionedRoutes.length === 0) {
      this.addFinding({
        type: 'MISSING_API_VERSIONING',
        severity: 'high',
        confidence: 0.9,
        file: 'api-versioning',
        description: 'API lacks versioning strategy',
        recommendation: 'Implement API versioning (URL path or header-based)',
        metadata: {
          totalEndpoints: endpoints.length,
          suggestion: 'Use /api/v1/ prefix or Accept-Version header'
        }
      });
    }
  }

  /**
   * Analyze CORS
   */
  async analyzeCORS(basePath) {
    const apiFiles = await this.findAPIFiles(basePath);
    let hasCORS = false;
    
    for (const file of apiFiles.slice(0, 5)) { // Check sample
      try {
        const content = await fs.readFile(file, 'utf8');
        
        if (content.includes('cors') || content.includes('Access-Control-Allow')) {
          hasCORS = true;
          break;
        }
      } catch {
        // File read error
      }
    }
    
    if (!hasCORS && this.apiHealth.totalEndpoints > 0) {
      // Check if it's likely a web API that needs CORS
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        const needsCORS = 'express' in deps || 'koa' in deps || 'fastify' in deps;
        
        if (needsCORS) {
          this.addFinding({
            type: 'MISSING_CORS_CONFIGURATION',
            severity: 'medium',
            confidence: 0.7,
            file: 'api',
            description: 'No CORS configuration found',
            recommendation: 'Configure CORS for web API access',
            metadata: {
              suggestion: 'Install and configure cors middleware'
            }
          });
        }
      } catch {
        // Package.json error
      }
    }
  }
}

export default APISubAgent;