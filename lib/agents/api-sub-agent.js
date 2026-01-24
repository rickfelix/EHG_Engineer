/**
 * API Sub-Agent - Intelligent API Analysis
 * Extends IntelligentBaseSubAgent for full integration with improvements
 * Analyzes REST/GraphQL APIs for compliance, performance, and security
 *
 * REFACTORED: This file is a thin wrapper that delegates to domain modules.
 * Domain modules located in ./api-sub-agent/domains/:
 * - endpoint-analysis.js - Endpoint detection and analysis
 * - documentation-analysis.js - OpenAPI/Swagger validation
 * - structure-analysis.js - RESTful patterns
 * - security-analysis.js - Security checks
 * - quality-analysis.js - Error handling, schemas, rate limiting
 *
 * @module api-sub-agent
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

// Import domain modules
import {
  analyzeEndpoints,
  findAPIFiles
} from './api-sub-agent/domains/endpoint-analysis.js';

import {
  analyzeAPIDocumentation
} from './api-sub-agent/domains/documentation-analysis.js';

import {
  analyzeAPIStructure,
  analyzeVersioning
} from './api-sub-agent/domains/structure-analysis.js';

import {
  analyzeAPISecurity,
  analyzeCORS
} from './api-sub-agent/domains/security-analysis.js';

import {
  analyzeErrorHandling,
  validateSchemas,
  checkRateLimiting
} from './api-sub-agent/domains/quality-analysis.js';

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
  async intelligentAnalyze(basePath, _context) {
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

    // Bind addFinding to this instance
    const addFinding = this.addFinding.bind(this);

    // Find and analyze API endpoints (delegated to domain)
    await analyzeEndpoints(basePath, apiInfo, this.apiHealth, addFinding);

    // Check API documentation (delegated to domain)
    await analyzeAPIDocumentation(basePath, this.apiHealth, this.thresholds, addFinding);

    // Analyze API structure and patterns (delegated to domain)
    analyzeAPIStructure(this.apiHealth, addFinding);

    // Check authentication and security (delegated to domain)
    await analyzeAPISecurity(basePath, addFinding);

    // Check error handling (delegated to domain)
    await analyzeErrorHandling(basePath, addFinding);

    // Validate request/response schemas (delegated to domain)
    await validateSchemas(basePath, this.apiHealth, addFinding);

    // Check rate limiting (delegated to domain)
    await checkRateLimiting(basePath, this.apiHealth, addFinding);

    // Analyze API versioning (delegated to domain)
    analyzeVersioning(this.apiHealth, addFinding);

    // Check CORS configuration (delegated to domain)
    await analyzeCORS(basePath, this.apiHealth, addFinding);

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
}

export default APISubAgent;

// Re-export domain functions for direct access if needed
export {
  analyzeEndpoints,
  findAPIFiles,
  analyzeAPIDocumentation,
  analyzeAPIStructure,
  analyzeVersioning,
  analyzeAPISecurity,
  analyzeCORS,
  analyzeErrorHandling,
  validateSchemas,
  checkRateLimiting
};
