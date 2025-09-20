/**
 * Security Sub-Agent v3 - Intelligent & Adaptive
 * Uses context-aware analysis and learns from the codebase patterns
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

class SecuritySubAgentV3 extends IntelligentBaseSubAgent {
  constructor() {
    super('Security', '🛡️');
    
    // Extend the inherited codebaseProfile with security-specific fields
    this.codebaseProfile.authMethod = null;        // JWT, OAuth, Session, etc.
    this.codebaseProfile.securityLibraries = [];   // Detected security libraries in use
    this.codebaseProfile.customPatterns = new Map(); // Patterns specific to this codebase
    
    // Intelligent pattern matching with context understanding
    this.intelligentPatterns = {
      secrets: {
        // Pattern that learns what's real vs example
        detect: (line, context) => this.detectRealSecret(line, context),
        severity: (confidence) => confidence > 0.8 ? 'critical' : 'high'
      },
      authentication: {
        // Understands auth flow
        detect: (line, context) => this.detectAuthIssue(line, context),
        severity: (confidence) => 'high'
      },
      dataExposure: {
        // Detects sensitive data leaks
        detect: (line, context) => this.detectDataExposure(line, context),
        severity: (confidence) => confidence > 0.7 ? 'high' : 'medium'
      }
    };
    
    // Security context understanding
    this.securityContext = {
      sensitiveFields: new Set(),     // Fields that contain sensitive data
      publicEndpoints: new Set(),     // Endpoints that don't require auth
      protectedEndpoints: new Set(),  // Endpoints that require auth
      sanitizationMethods: new Set(), // Methods used for sanitization
      validationMethods: new Set()    // Methods used for validation
    };
  }

  /**
   * Intelligent security analysis using inherited codebase knowledge
   */
  async intelligentAnalyze(basePath, context) {
    console.log(`🧠 Intelligent security analysis of: ${basePath}`);
    
    // Use inherited codebase profile instead of re-learning
    console.log(`   ✓ Using codebase profile: ${this.codebaseProfile.framework || 'Generic'} + ${this.codebaseProfile.backend || 'Unknown backend'}`);
    
    // Step 2: Build security context
    await this.buildSecurityContext(basePath);
    console.log(`   ✓ Built security context: ${this.securityContext.sensitiveFields.size} sensitive fields identified`);
    
    // Step 3: Run intelligent analysis
    await this.runIntelligentAnalysis(basePath);
    
    // Step 4: Cross-reference and validate findings
    this.validateFindings();
    
    console.log(`   ✓ Found ${this.findings.length} validated security issues`);
  }


  /**
   * Build understanding of security context
   */
  async buildSecurityContext(basePath) {
    const files = await this.getSourceFiles(basePath);
    
    for (const file of files.slice(0, 50)) { // Sample first 50 files for speed
      try {
        const content = await fs.readFile(file, 'utf8');
        
        // Learn sensitive fields
        const fieldMatches = content.match(/(?:password|email|ssn|credit_card|api_key|secret|token|auth|private|sensitive)\w*/gi);
        if (fieldMatches) {
          fieldMatches.forEach(field => this.securityContext.sensitiveFields.add(field.toLowerCase()));
        }
        
        // Learn endpoints
        const routeMatches = content.match(/(?:app|router)\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)/gi);
        if (routeMatches) {
          routeMatches.forEach(match => {
            const endpoint = match.match(/['"`]([^'"`]+)/)?.[1];
            if (endpoint) {
              // Guess if public or protected based on name
              if (endpoint.includes('login') || endpoint.includes('register') || endpoint.includes('public')) {
                this.securityContext.publicEndpoints.add(endpoint);
              } else if (endpoint.includes('admin') || endpoint.includes('user') || endpoint.includes('private')) {
                this.securityContext.protectedEndpoints.add(endpoint);
              }
            }
          });
        }
        
        // Learn sanitization methods
        const sanitizeMatches = content.match(/(?:sanitize|escape|clean|purify|filter)\w*/gi);
        if (sanitizeMatches) {
          sanitizeMatches.forEach(method => this.securityContext.sanitizationMethods.add(method));
        }
        
        // Learn validation methods
        const validateMatches = content.match(/(?:validate|check|verify|assert)\w*/gi);
        if (validateMatches) {
          validateMatches.forEach(method => this.securityContext.validationMethods.add(method));
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  /**
   * Run intelligent analysis using learned context
   */
  async runIntelligentAnalysis(basePath) {
    const files = await this.getSourceFiles(basePath);
    
    for (const file of files) {
      if (this.isTestFile(file)) continue;
      
      try {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n');
        const relativePath = path.relative(basePath, file);
        
        // Build file context
        const fileContext = {
          path: relativePath,
          isAuthFile: relativePath.includes('auth') || content.includes('authentication'),
          isApiFile: relativePath.includes('api') || relativePath.includes('route'),
          isConfigFile: relativePath.includes('config') || relativePath.includes('.env'),
          hasDatabase: this.codebaseProfile.database && content.includes(this.codebaseProfile.database.toLowerCase()),
          imports: this.extractImports(content),
          exportedFunctions: this.extractExports(content)
        };
        
        // Analyze each line with context
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim() || this.isComment(line)) continue;
          
          const lineContext = {
            ...fileContext,
            lineNumber: i + 1,
            previousLines: lines.slice(Math.max(0, i - 3), i),
            nextLines: lines.slice(i + 1, i + 4),
            inFunction: this.getContainingFunction(lines, i),
            hasValidation: this.hasNearbyValidation(lines, i),
            hasSanitization: this.hasNearbySanitization(lines, i)
          };
          
          // Run intelligent pattern detection
          for (const [category, pattern] of Object.entries(this.intelligentPatterns)) {
            const detection = pattern.detect(line, lineContext);
            
            if (detection && detection.confidence > 0.6) {
              this.addFinding({
                type: detection.type,
                severity: pattern.severity(detection.confidence),
                confidence: detection.confidence,
                file: relativePath,
                line: i + 1,
                description: detection.description,
                recommendation: detection.recommendation,
                snippet: this.sanitizeSnippet(line),
                metadata: {
                  category,
                  context: detection.context
                }
              });
            }
          }
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  /**
   * Intelligent secret detection
   */
  detectRealSecret(line, context) {
    // Skip if in test or config file
    if (context.isConfigFile) return null;
    
    // Look for patterns
    const secretPattern = /(?:api[_-]?key|secret|token|password|auth|private[_-]?key)\s*[:=]\s*["']([^"']+)["']/i;
    const match = secretPattern.exec(line);
    
    if (!match) return null;
    
    const value = match[1];
    let confidence = 0.5;
    
    // Increase confidence based on value characteristics
    if (value.length > 20 && /[A-Za-z0-9+\/=]/.test(value)) confidence += 0.2;
    if (!/example|test|demo|placeholder|xxx|your/.test(value.toLowerCase())) confidence += 0.2;
    if (!line.includes('process.env') && !line.includes('import.meta.env')) confidence += 0.2;
    
    // Decrease confidence if it looks like a variable reference
    if (value.includes('${') || value.includes('{{')) confidence -= 0.3;
    
    // Check if the secret field is in our sensitive fields list
    if (this.securityContext.sensitiveFields.has(match[0].split(/[:=]/)[0].toLowerCase())) {
      confidence += 0.1;
    }
    
    // If there's validation nearby, it might be okay
    if (context.hasValidation) confidence -= 0.1;
    
    if (confidence < 0.6) return null;
    
    return {
      type: 'HARDCODED_SECRET',
      confidence,
      description: `Potential hardcoded secret: ${match[0].split(/[:=]/)[0]}`,
      recommendation: 'Move to environment variables or secure secret management',
      context: {
        inAuthFile: context.isAuthFile,
        secretType: match[0].split(/[:=]/)[0]
      }
    };
  }

  /**
   * Intelligent auth issue detection
   */
  detectAuthIssue(line, context) {
    // Only check in auth-related files or API routes
    if (!context.isAuthFile && !context.isApiFile) return null;
    
    let confidence = 0;
    let issue = null;
    
    // Check for missing auth checks
    if (context.isApiFile && !context.hasValidation) {
      const routePattern = /app\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)/i;
      const routeMatch = routePattern.exec(line);
      
      if (routeMatch) {
        const endpoint = routeMatch[2];
        
        // Check if this should be protected
        if (!this.securityContext.publicEndpoints.has(endpoint) && 
            !endpoint.includes('public') && 
            !endpoint.includes('health')) {
          
          // Look for auth middleware in previous lines
          const hasAuthMiddleware = context.previousLines.some(l => 
            l.includes('authenticate') || 
            l.includes('requireAuth') || 
            l.includes('authMiddleware')
          );
          
          if (!hasAuthMiddleware) {
            confidence = 0.7;
            issue = {
              type: 'MISSING_AUTH_CHECK',
              description: `Endpoint '${endpoint}' may be missing authentication`,
              recommendation: 'Add authentication middleware to protect this endpoint'
            };
          }
        }
      }
    }
    
    // Check for weak JWT configuration
    if (this.codebaseProfile.authMethod === 'JWT' && line.includes('jsonwebtoken')) {
      if (line.includes('HS256') || !line.includes('RS256')) {
        confidence = 0.8;
        issue = {
          type: 'WEAK_JWT_ALGORITHM',
          description: 'Using symmetric JWT algorithm (HS256) instead of asymmetric',
          recommendation: 'Use RS256 or ES256 for better security'
        };
      }
    }
    
    if (!issue) return null;
    
    return {
      ...issue,
      confidence,
      context: {
        authMethod: this.codebaseProfile.authMethod,
        endpoint: context.path
      }
    };
  }

  /**
   * Intelligent data exposure detection
   */
  detectDataExposure(line, context) {
    let confidence = 0;
    let issue = null;
    
    // Check for console.log of sensitive data
    if (line.includes('console.log')) {
      for (const field of this.securityContext.sensitiveFields) {
        if (line.toLowerCase().includes(field)) {
          confidence = 0.8;
          issue = {
            type: 'SENSITIVE_DATA_LOGGING',
            description: `Logging potentially sensitive field: ${field}`,
            recommendation: 'Remove or sanitize sensitive data from logs'
          };
          break;
        }
      }
    }
    
    // Check for sending full objects in API responses
    if (context.isApiFile && (line.includes('res.json(') || line.includes('res.send('))) {
      // Look for user/account objects being sent directly
      if (line.includes('user') || line.includes('account') || line.includes('profile')) {
        if (!line.includes('pick') && !line.includes('omit') && !line.includes('select')) {
          confidence = 0.7;
          issue = {
            type: 'FULL_OBJECT_EXPOSURE',
            description: 'Sending full object in API response without filtering',
            recommendation: 'Filter sensitive fields before sending response'
          };
        }
      }
    }
    
    if (!issue) return null;
    
    return {
      ...issue,
      confidence,
      context: {
        inApiFile: context.isApiFile,
        hasSanitization: context.hasSanitization
      }
    };
  }

  /**
   * Validate findings using cross-referencing
   */
  validateFindings() {
    const validatedFindings = [];
    
    for (const finding of this.findings) {
      let keepFinding = true;
      
      // If we detected security libraries, adjust confidence
      if (finding.type === 'MISSING_ENCRYPTION' && this.codebaseProfile.securityLibraries.includes('bcrypt')) {
        finding.confidence *= 0.7;
      }
      
      // If framework has built-in protections, adjust
      if (finding.type === 'XSS_VULNERABILITY' && this.codebaseProfile.framework === 'React') {
        // React escapes by default
        finding.confidence *= 0.8;
        finding.description += ' (React provides some XSS protection by default)';
      }
      
      // Remove low confidence after adjustments
      if (finding.confidence < 0.6) {
        keepFinding = false;
      }
      
      if (keepFinding) {
        validatedFindings.push(finding);
      }
    }
    
    this.findings = validatedFindings;
  }

  // Helper methods for context understanding

  extractImports(content) {
    const imports = [];
    const importMatches = content.match(/(?:import|require)\s*\(['"](.*?)['"]\)/g);
    if (importMatches) {
      imports.push(...importMatches.map(m => m.match(/['"](.*?)['"]/)?.[1]));
    }
    return imports;
  }

  extractExports(content) {
    const exports = [];
    const exportMatches = content.match(/export\s+(?:function|const|class)\s+(\w+)/g);
    if (exportMatches) {
      exports.push(...exportMatches.map(m => m.split(/\s+/).pop()));
    }
    return exports;
  }

  getContainingFunction(lines, lineIndex) {
    // Look backwards for function declaration
    for (let i = lineIndex; i >= Math.max(0, lineIndex - 20); i--) {
      if (/function\s+(\w+)|const\s+(\w+)\s*=.*=>/.test(lines[i])) {
        const match = lines[i].match(/function\s+(\w+)|const\s+(\w+)\s*=/);
        return match?.[1] || match?.[2];
      }
    }
    return null;
  }

  hasNearbyValidation(lines, lineIndex) {
    const range = 5;
    for (let i = Math.max(0, lineIndex - range); i < Math.min(lines.length, lineIndex + range); i++) {
      if (this.securityContext.validationMethods.size > 0) {
        for (const method of this.securityContext.validationMethods) {
          if (lines[i].includes(method)) return true;
        }
      }
      // Fallback to common patterns
      if (/validate|check|verify|assert|joi|yup|zod/.test(lines[i])) {
        return true;
      }
    }
    return false;
  }

  hasNearbySanitization(lines, lineIndex) {
    const range = 5;
    for (let i = Math.max(0, lineIndex - range); i < Math.min(lines.length, lineIndex + range); i++) {
      if (this.securityContext.sanitizationMethods.size > 0) {
        for (const method of this.securityContext.sanitizationMethods) {
          if (lines[i].includes(method)) return true;
        }
      }
      // Fallback to common patterns
      if (/sanitize|escape|clean|purify|filter|DOMPurify|xss/.test(lines[i])) {
        return true;
      }
    }
    return false;
  }

  isComment(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  }

  isTestFile(path) {
    return path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__');
  }

  sanitizeSnippet(line) {
    return line.substring(0, 100).replace(/["'][^"']{15,}["']/g, '"***REDACTED***"');
  }
}

export default SecuritySubAgentV3;