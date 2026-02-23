#!/usr/bin/env node

/**
 * Security Context Manager for Dual-Lane Architecture
 * Enforces permission boundaries and creates audit-compliant contexts
 * Provides cryptographic signing and verification of artifacts
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class SecurityContextManager {
  constructor() {
    // Define permission sets for each lane
    this.permissions = {
      codex: {
        allowed: [
          'Read',
          'Grep',
          'Bash(ls:*)',
          'Bash(cat:*)',
          'Bash(git diff:*)',
          'Bash(git status)',
          'WebSearch'
        ],
        denied: [
          'Write',
          'Edit',
          'MultiEdit',
          'Bash(git commit:*)',
          'Bash(git push:*)',
          'Bash(rm:*)',
          'Bash(mv:*)',
          'Bash(cp:*)',
          'KillShell',
          'NotebookEdit'
        ]
      },
      claude: {
        allowed: '*', // All tools allowed
        denied: []   // No restrictions
      }
    };

    // Initialize signing keys (in production, use proper key management)
    this.signingKeys = {
      codex: this.generateSigningKey('codex'),
      claude: this.generateSigningKey('claude')
    };

    this.validationLog = [];
  }

  /**
   * Generate deterministic signing key for a lane (for demo purposes)
   * In production, use proper key management service
   */
  generateSigningKey(lane) {
    const seed = `dual-lane-${lane}-${process.env.NODE_ENV || 'development'}`;
    return crypto.createHash('sha256').update(seed).digest();
  }

  /**
   * Create security context for API request
   */
  createSecurityContext(lane, task) {
    const context = {
      lane: lane,
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      permissions: this.permissions[lane],
      task: task,
      environment: this.getEnvironmentContext(lane)
    };

    // Sign the context
    context.signature = this.signContext(context, lane);

    return context;
  }

  /**
   * Filter tools based on lane permissions
   */
  filterTools(tools, lane) {
    const perms = this.permissions[lane];

    if (perms.allowed === '*') {
      return tools; // Claude gets all tools
    }

    // Filter tools for Codex
    return tools.filter(tool => {
      // Check if tool is explicitly allowed
      for (const allowed of perms.allowed) {
        if (this.matchesPermission(tool, allowed)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Check if a tool matches a permission pattern
   */
  matchesPermission(tool, permission) {
    // Handle exact matches
    if (tool === permission) {
      return true;
    }

    // Handle wildcard patterns like 'Bash(ls:*)'
    if (permission.includes('*')) {
      const pattern = permission.replace(/[()]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(tool);
    }

    // Handle parameterized tools like Bash commands
    if (permission.includes('(') && tool.includes('(')) {
      const permBase = permission.split('(')[0];
      const toolBase = tool.split('(')[0];

      if (permBase === toolBase) {
        const permParam = permission.match(/\((.*?)\)/)?.[1];
        const toolParam = tool.match(/\((.*?)\)/)?.[1];

        if (permParam && toolParam) {
          // Check if tool parameter matches permission pattern
          if (permParam.includes('*')) {
            const paramPattern = permParam.replace(/\*/g, '.*');
            return new RegExp(`^${paramPattern}$`).test(toolParam);
          }
          return permParam === toolParam;
        }
      }
    }

    return false;
  }

  /**
   * Validate that an operation is allowed for a lane
   */
  validateOperation(operation, lane) {
    const perms = this.permissions[lane];

    // Check if operation is denied
    for (const denied of perms.denied) {
      if (this.matchesPermission(operation, denied)) {
        this.logValidation(lane, operation, false, 'Operation denied');
        return false;
      }
    }

    // If Claude, allow everything not explicitly denied
    if (lane === 'claude' && perms.allowed === '*') {
      this.logValidation(lane, operation, true, 'Claude has full permissions');
      return true;
    }

    // For Codex, check if operation is allowed
    for (const allowed of perms.allowed) {
      if (this.matchesPermission(operation, allowed)) {
        this.logValidation(lane, operation, true, 'Operation allowed');
        return true;
      }
    }

    this.logValidation(lane, operation, false, 'Operation not in allowed list');
    return false;
  }

  /**
   * Sign a context object
   */
  signContext(context, lane) {
    const content = JSON.stringify({
      lane: context.lane,
      timestamp: context.timestamp,
      requestId: context.requestId,
      task: context.task
    });

    const hmac = crypto.createHmac('sha256', this.signingKeys[lane]);
    hmac.update(content);
    return hmac.digest('hex');
  }

  /**
   * Verify a signed context
   */
  verifyContext(context) {
    const lane = context.lane;
    const providedSignature = context.signature;

    // Recalculate signature
    const expectedSignature = this.signContext(context, lane);

    const isValid = providedSignature === expectedSignature;

    this.logValidation(lane, 'context_verification', isValid,
      isValid ? 'Valid signature' : 'Invalid signature');

    return isValid;
  }

  /**
   * Sign an artifact
   */
  signArtifact(artifactPath, lane) {
    const content = fs.readFileSync(artifactPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const signature = {
      lane: lane,
      file: path.basename(artifactPath),
      hash: hash,
      timestamp: new Date().toISOString(),
      signer: `dual-lane-${lane}`
    };

    // Create HMAC signature
    const hmac = crypto.createHmac('sha256', this.signingKeys[lane]);
    hmac.update(JSON.stringify(signature));
    signature.hmac = hmac.digest('hex');

    return signature;
  }

  /**
   * Verify artifact integrity
   */
  verifyArtifact(artifactPath, signature) {
    // Verify file hash
    const content = fs.readFileSync(artifactPath);
    const currentHash = crypto.createHash('sha256').update(content).digest('hex');

    if (currentHash !== signature.hash) {
      this.logValidation(signature.lane, 'artifact_verification', false,
        'Hash mismatch');
      return false;
    }

    // Verify HMAC
    const signatureWithoutHmac = { ...signature };
    delete signatureWithoutHmac.hmac;

    const hmac = crypto.createHmac('sha256', this.signingKeys[signature.lane]);
    hmac.update(JSON.stringify(signatureWithoutHmac));
    const expectedHmac = hmac.digest('hex');

    const isValid = expectedHmac === signature.hmac;

    this.logValidation(signature.lane, 'artifact_verification', isValid,
      isValid ? 'Valid artifact' : 'Invalid HMAC');

    return isValid;
  }

  /**
   * Get environment context for a lane
   */
  getEnvironmentContext(lane) {
    return {
      node_version: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      user: process.env.USER || process.env.USERNAME,
      lane_config: lane === 'codex' ? '.env.codex' : '.env.claude'
    };
  }

  /**
   * Create API request wrapper with security context
   */
  wrapAPIRequest(request, lane) {
    const context = this.createSecurityContext(lane, request.task || '');

    return {
      ...request,
      security_context: context,
      tools: this.filterTools(request.tools || [], lane),
      metadata: {
        lane: lane,
        restricted: lane === 'codex',
        audit_required: true
      }
    };
  }

  /**
   * Validate API response
   */
  validateAPIResponse(response, expectedLane) {
    // Check if response contains any write operations for Codex
    if (expectedLane === 'codex') {
      const writeIndicators = [
        'File.write',
        'File.edit',
        'git commit',
        'git push',
        'removed',
        'deleted',
        'modified file'
      ];

      for (const indicator of writeIndicators) {
        if (response.toLowerCase().includes(indicator.toLowerCase())) {
          this.logValidation('codex', 'response_validation', false,
            `Response contains write operation: ${indicator}`);
          return false;
        }
      }
    }

    this.logValidation(expectedLane, 'response_validation', true,
      'Response validated successfully');
    return true;
  }

  /**
   * Log validation event
   */
  logValidation(lane, operation, success, reason) {
    const entry = {
      timestamp: new Date().toISOString(),
      lane: lane,
      operation: operation,
      success: success,
      reason: reason
    };

    this.validationLog.push(entry);

    if (!success) {
      console.warn(`[SECURITY] Validation failed for ${lane}:`, reason);
    }
  }

  /**
   * Get validation log
   */
  getValidationLog() {
    return this.validationLog;
  }

  /**
   * Export security report
   */
  exportSecurityReport(filePath = '/tmp/security-report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      permissions: this.permissions,
      validationLog: this.validationLog,
      summary: {
        totalValidations: this.validationLog.length,
        failures: this.validationLog.filter(v => !v.success).length,
        byLane: {
          codex: this.validationLog.filter(v => v.lane === 'codex').length,
          claude: this.validationLog.filter(v => v.lane === 'claude').length
        }
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`Security report exported to ${filePath}`);
    return report;
  }
}

// Export for use in other modules
export default SecurityContextManager;

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const manager = new SecurityContextManager();

  const command = process.argv[2];

  if (!command) {
    console.log('Usage: security-context-manager.js <test|validate|report>');
    process.exit(1);
  }

  switch (command) {
    case 'test':
      // Test permission filtering
      console.log('\n=== Testing Permission System ===\n');

      const testOps = [
        'Read',
        'Write',
        'Bash(ls -la)',
        'Bash(rm -rf /)',
        'Bash(git diff HEAD)',
        'Bash(git commit -m "test")'
      ];

      for (const op of testOps) {
        console.log(`\nOperation: ${op}`);
        console.log(`  Codex: ${manager.validateOperation(op, 'codex') ? '✅ Allowed' : '❌ Denied'}`);
        console.log(`  Claude: ${manager.validateOperation(op, 'claude') ? '✅ Allowed' : '❌ Denied'}`);
      }
      break;

    case 'validate':
      // Validate a context
      const context = manager.createSecurityContext('codex', 'Test task');
      console.log('\n=== Security Context ===');
      console.log(JSON.stringify(context, null, 2));

      const isValid = manager.verifyContext(context);
      console.log(`\nContext validation: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
      break;

    case 'report':
      // Generate security report
      manager.exportSecurityReport();
      break;

    default:
      console.error('Unknown command:', command);
      process.exit(1);
  }
}