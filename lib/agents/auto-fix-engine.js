/**
 * Auto-Fix Generation Engine
 * Generates actual code fixes for common issues
 * Provides one-click fixes for developers
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { TypeMapper, getInstance as getMapper } from './type-mapping';

class AutoFixEngine {
  constructor() {
    this.typeMapper = getMapper();
    // Fix generators for each agent type
    this.fixGenerators = {
      security: new SecurityFixGenerator(),
      performance: new PerformanceFixGenerator(),
      design: new DesignFixGenerator(),
      database: new DatabaseFixGenerator(),
      testing: new TestingFixGenerator()
    };
    
    // Fix confidence thresholds
    this.confidenceThresholds = {
      autoApply: 0.95,    // Apply automatically
      suggest: 0.8,       // Suggest with preview
      manual: 0.6         // Manual fix required
    };
  }

  /**
   * Generate fix for a finding
   */
  async generateFix(finding) {
    // Prepare finding with mapped types
    const preparedFinding = this.typeMapper.prepareFindingForFix(finding);
    
    const generator = this.fixGenerators[preparedFinding.agent?.toLowerCase()];
    
    if (!generator) {
      return {
        available: false,
        reason: `No fix generator for ${preparedFinding.agent} agent`
      };
    }
    
    try {
      const fix = await generator.generateFix(preparedFinding);
      
      if (!fix) {
        return {
          available: false,
          reason: 'Could not generate fix for this issue'
        };
      }
      
      // Add metadata
      fix.finding = finding;
      fix.confidence = fix.confidence || 0.8;
      fix.complexity = this.assessComplexity(fix);
      fix.risk = this.assessRisk(fix);
      
      return fix;
    } catch (error) {
      return {
        available: false,
        reason: `Fix generation failed: ${error.message}`
      };
    }
  }

  /**
   * Generate fixes for multiple findings
   */
  async generateBulkFixes(findings) {
    const fixes = [];
    
    for (const finding of findings) {
      const fix = await this.generateFix(finding);
      if (fix.available !== false) {
        fixes.push(fix);
      }
    }
    
    // Group by file for efficient application
    return this.groupFixesByFile(fixes);
  }

  /**
   * Apply a fix to code
   */
  async applyFix(fix) {
    if (fix.confidence < this.confidenceThresholds.suggest) {
      return {
        success: false,
        reason: 'Confidence too low for automatic application'
      };
    }
    
    try {
      // Read current file content
      const content = await fs.readFile(fix.file, 'utf8');
      
      // Apply the fix
      let updatedContent;
      
      switch (fix.type) {
        case 'REPLACE':
          updatedContent = this.applyReplaceFix(content, fix);
          break;
        case 'INSERT':
          updatedContent = this.applyInsertFix(content, fix);
          break;
        case 'DELETE':
          updatedContent = this.applyDeleteFix(content, fix);
          break;
        case 'WRAP':
          updatedContent = this.applyWrapFix(content, fix);
          break;
        default:
          throw new Error(`Unknown fix type: ${fix.type}`);
      }
      
      // Create backup
      await this.createBackup(fix.file);
      
      // Write updated content
      await fs.writeFile(fix.file, updatedContent, 'utf8');
      
      return {
        success: true,
        file: fix.file,
        backup: `${fix.file}.backup`,
        changes: fix.changes
      };
    } catch (error) {
      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Apply replace fix
   */
  applyReplaceFix(content, fix) {
    const lines = content.split('\n');
    
    if (fix.line) {
      // Single line replacement
      lines[fix.line - 1] = fix.replacement;
    } else if (fix.pattern) {
      // Pattern-based replacement
      return content.replace(new RegExp(fix.pattern, fix.flags || 'g'), fix.replacement);
    }
    
    return lines.join('\n');
  }

  /**
   * Apply insert fix
   */
  applyInsertFix(content, fix) {
    const lines = content.split('\n');
    
    if (fix.line !== undefined) {
      lines.splice(fix.line, 0, fix.insertion);
    } else if (fix.after) {
      const index = lines.findIndex(line => line.includes(fix.after));
      if (index !== -1) {
        lines.splice(index + 1, 0, fix.insertion);
      }
    } else if (fix.before) {
      const index = lines.findIndex(line => line.includes(fix.before));
      if (index !== -1) {
        lines.splice(index, 0, fix.insertion);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Apply delete fix
   */
  applyDeleteFix(content, fix) {
    const lines = content.split('\n');
    
    if (fix.startLine && fix.endLine) {
      lines.splice(fix.startLine - 1, fix.endLine - fix.startLine + 1);
    } else if (fix.line) {
      lines.splice(fix.line - 1, 1);
    }
    
    return lines.join('\n');
  }

  /**
   * Apply wrap fix (e.g., try-catch)
   */
  applyWrapFix(content, fix) {
    const lines = content.split('\n');
    
    if (fix.startLine && fix.endLine) {
      const indent = lines[fix.startLine - 1].match(/^\s*/)[0];
      const wrappedCode = lines.slice(fix.startLine - 1, fix.endLine);
      
      const wrapped = [
        fix.wrapStart,
        ...wrappedCode.map(line => '  ' + line),
        fix.wrapEnd
      ].map(line => indent + line);
      
      lines.splice(fix.startLine - 1, fix.endLine - fix.startLine + 1, ...wrapped);
    }
    
    return lines.join('\n');
  }

  /**
   * Create backup before applying fix
   */
  async createBackup(filePath) {
    const backupPath = `${filePath}.backup`;
    const content = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(backupPath, content, 'utf8');
  }

  /**
   * Group fixes by file
   */
  groupFixesByFile(fixes) {
    const grouped = new Map();
    
    for (const fix of fixes) {
      if (!grouped.has(fix.file)) {
        grouped.set(fix.file, []);
      }
      grouped.get(fix.file).push(fix);
    }
    
    return Array.from(grouped.entries()).map(([file, fixes]) => ({
      file,
      fixes: fixes.sort((a, b) => (a.line || 0) - (b.line || 0)),
      totalChanges: fixes.reduce((sum, fix) => sum + (fix.changes || 1), 0)
    }));
  }

  /**
   * Assess fix complexity
   */
  assessComplexity(fix) {
    if (fix.changes <= 1) return 'TRIVIAL';
    if (fix.changes <= 5) return 'SIMPLE';
    if (fix.changes <= 20) return 'MODERATE';
    return 'COMPLEX';
  }

  /**
   * Assess fix risk
   */
  assessRisk(fix) {
    // High risk if touching critical files
    if (fix.file?.includes('auth') || fix.file?.includes('payment')) {
      return 'HIGH';
    }
    
    // Medium risk for database or API changes
    if (fix.file?.includes('db') || fix.file?.includes('api')) {
      return 'MEDIUM';
    }
    
    // Low risk for UI changes
    if (fix.file?.includes('component') || fix.file?.includes('view')) {
      return 'LOW';
    }
    
    return 'MEDIUM';
  }
}

/**
 * Security Fix Generator
 */
class SecurityFixGenerator {
  async generateFix(finding) {
    const fixMap = {
      'HARDCODED_SECRET': this.fixHardcodedSecret,
      'XSS_VULNERABILITY': this.fixXSS,
      'SQL_INJECTION': this.fixSQLInjection,
      'INSECURE_RANDOM': this.fixInsecureRandom,
      'MISSING_VALIDATION': this.fixMissingValidation,
      'WEAK_CRYPTO': this.fixWeakCrypto,
      'PATH_TRAVERSAL': this.fixPathTraversal
    };
    
    const generator = fixMap[finding.type];
    if (!generator) return null;
    
    return generator.call(this, finding);
  }
  
  fixHardcodedSecret(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      replacement: `const ${finding.metadata.variable} = process.env.${finding.metadata.envVar || 'SECRET_KEY'};`,
      description: 'Replace hardcoded secret with environment variable',
      confidence: 0.95,
      changes: 1,
      preview: {
        before: finding.location.snippet,
        after: `const ${finding.metadata.variable} = process.env.${finding.metadata.envVar || 'SECRET_KEY'};`
      }
    };
  }
  
  fixXSS(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      pattern: 'innerHTML\\s*=\\s*([^;]+)',
      replacement: 'textContent = $1',
      description: 'Replace innerHTML with textContent to prevent XSS',
      confidence: 0.85,
      changes: 1,
      preview: {
        before: finding.location.snippet,
        after: finding.location.snippet.replace('innerHTML', 'textContent')
      }
    };
  }
  
  fixSQLInjection(finding) {
    const query = finding.location.snippet;
    const parameterized = query.replace(/'\s*\+\s*(\w+)\s*\+\s*'/g, '?');
    
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      replacement: parameterized,
      description: 'Use parameterized query to prevent SQL injection',
      confidence: 0.9,
      changes: 1,
      preview: {
        before: query,
        after: parameterized
      },
      additionalInstructions: 'Remember to pass parameters separately to query function'
    };
  }
  
  fixInsecureRandom(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      pattern: 'Math\\.random\\(\\)',
      replacement: 'crypto.randomBytes(32).toString("hex")',
      description: 'Replace Math.random with crypto.randomBytes',
      confidence: 0.9,
      changes: 1,
      imports: ['import crypto from 'crypto';']
    };
  }
  
  fixMissingValidation(finding) {
    return {
      available: true,
      type: 'INSERT',
      file: finding.location.file,
      line: finding.location.line,
      insertion: `  // TODO: Add input validation\n  if (!input || typeof input !== 'string') {\n    throw new Error('Invalid input');\n  }`,
      description: 'Add input validation',
      confidence: 0.7,
      changes: 3
    };
  }
  
  fixWeakCrypto(finding) {
    const upgrades = {
      'md5': 'sha256',
      'sha1': 'sha256',
      'des': 'aes-256-gcm'
    };
    
    const oldAlgo = finding.metadata?.algorithm?.toLowerCase();
    const newAlgo = upgrades[oldAlgo] || 'sha256';
    
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      pattern: oldAlgo,
      replacement: newAlgo,
      description: `Upgrade from ${oldAlgo} to ${newAlgo}`,
      confidence: 0.85,
      changes: 1
    };
  }
  
  fixPathTraversal(finding) {
    return {
      available: true,
      type: 'WRAP',
      file: finding.location.file,
      startLine: finding.location.line,
      endLine: finding.location.line,
      wrapStart: 'const sanitizedPath = path.resolve(baseDir, userInput);',
      wrapEnd: 'if (!sanitizedPath.startsWith(baseDir)) throw new Error("Invalid path");',
      description: 'Add path traversal protection',
      confidence: 0.8,
      changes: 2,
      imports: ['import path from 'path';']
    };
  }
}

/**
 * Performance Fix Generator
 */
class PerformanceFixGenerator {
  async generateFix(finding) {
    const fixMap = {
      'N_PLUS_ONE_QUERY': this.fixNPlusOne,
      'DOM_QUERY_IN_LOOP': this.fixDOMInLoop,
      'MISSING_MEMO': this.fixMissingMemo,
      'UNNECESSARY_RERENDER': this.fixUnnecessaryRerender,
      'MEMORY_LEAK': this.fixMemoryLeak,
      'BLOCKING_OPERATION': this.fixBlockingOperation
    };
    
    const generator = fixMap[finding.type];
    if (!generator) return null;
    
    return generator.call(this, finding);
  }
  
  fixNPlusOne(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Use eager loading to fix N+1 query',
      replacement: `// Use eager loading\nconst results = await Model.findAll({\n  include: [{ model: RelatedModel }]\n});`,
      confidence: 0.85,
      changes: 3
    };
  }
  
  fixDOMInLoop(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      description: 'Move DOM query outside loop',
      pattern: 'for\\s*\\([^)]+\\)\\s*{[^}]*querySelector',
      replacement: 'const element = document.querySelector(".selector");\nfor (...) {\n  // Use cached element\n}',
      confidence: 0.9,
      changes: 2
    };
  }
  
  fixMissingMemo(finding) {
    const componentName = finding.metadata?.component || 'Component';
    
    return {
      available: true,
      type: 'WRAP',
      file: finding.location.file,
      description: 'Add React.memo to prevent rerenders',
      wrapStart: `const ${componentName} = React.memo(`,
      wrapEnd: ');',
      confidence: 0.85,
      changes: 1
    };
  }
  
  fixUnnecessaryRerender(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Use useCallback to memoize function',
      pattern: 'const\\s+(\\w+)\\s*=\\s*\\([^)]*\\)\\s*=>',
      replacement: 'const $1 = useCallback(($2) =>',
      confidence: 0.8,
      changes: 1,
      imports: ["import { useCallback } from 'react';"]
    };
  }
  
  fixMemoryLeak(finding) {
    return {
      available: true,
      type: 'INSERT',
      file: finding.location.file,
      description: 'Add cleanup in useEffect',
      after: 'useEffect(',
      insertion: '  return () => {\n    // Cleanup subscriptions/timers\n  };',
      confidence: 0.75,
      changes: 3
    };
  }
  
  fixBlockingOperation(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Make operation async',
      pattern: 'function\\s+(\\w+)\\s*\\(',
      replacement: 'async function $1(',
      confidence: 0.7,
      changes: 1
    };
  }
}

/**
 * Design Fix Generator
 */
class DesignFixGenerator {
  async generateFix(finding) {
    const fixMap = {
      'MISSING_ALT_TEXT': this.fixMissingAlt,
      'COLOR_CONTRAST': this.fixColorContrast,
      'MISSING_ARIA': this.fixMissingAria,
      'KEYBOARD_NAV': this.fixKeyboardNav,
      'RESPONSIVE_ISSUE': this.fixResponsive
    };
    
    const generator = fixMap[finding.type];
    if (!generator) return null;
    
    return generator.call(this, finding);
  }
  
  fixMissingAlt(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      pattern: '<img([^>]*)>',
      replacement: '<img$1 alt="Description needed">',
      description: 'Add alt text to image',
      confidence: 0.95,
      changes: 1
    };
  }
  
  fixColorContrast(finding) {
    const { foreground, background, recommendation } = finding.metadata || {};
    
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Fix color contrast for accessibility',
      pattern: `color:\\s*${foreground}`,
      replacement: `color: ${recommendation || '#000000'}`,
      confidence: 0.8,
      changes: 1
    };
  }
  
  fixMissingAria(finding) {
    const role = finding.metadata?.suggestedRole || 'button';
    
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      pattern: '<div([^>]*onClick[^>]*)>',
      replacement: `<div$1 role="${role}" tabIndex="0" onKeyDown={handleKeyDown}>`,
      description: 'Add ARIA role and keyboard support',
      confidence: 0.85,
      changes: 1
    };
  }
  
  fixKeyboardNav(finding) {
    return {
      available: true,
      type: 'INSERT',
      file: finding.location.file,
      line: finding.location.line,
      insertion: '  tabIndex="0"',
      description: 'Add keyboard navigation support',
      confidence: 0.9,
      changes: 1
    };
  }
  
  fixResponsive(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Add responsive styles',
      pattern: 'width:\\s*\\d+px',
      replacement: 'width: 100%; max-width: $1px',
      confidence: 0.75,
      changes: 1
    };
  }
}

/**
 * Database Fix Generator
 */
class DatabaseFixGenerator {
  async generateFix(finding) {
    const fixMap = {
      'MISSING_INDEX': this.fixMissingIndex,
      'SLOW_QUERY': this.fixSlowQuery,
      'MISSING_CONSTRAINT': this.fixMissingConstraint,
      'DENORMALIZATION': this.fixDenormalization
    };
    
    const generator = fixMap[finding.type];
    if (!generator) return null;
    
    return generator.call(this, finding);
  }
  
  fixMissingIndex(finding) {
    const { table, column } = finding.metadata || {};
    
    return {
      available: true,
      type: 'SQL',
      description: 'Add index to improve query performance',
      sql: `CREATE INDEX idx_${table}_${column} ON ${table}(${column});`,
      confidence: 0.9,
      changes: 1
    };
  }
  
  fixSlowQuery(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Optimize slow query',
      suggestion: 'Add LIMIT, use indexed columns, avoid SELECT *',
      confidence: 0.7,
      changes: 1
    };
  }
  
  fixMissingConstraint(finding) {
    const { table, column, constraint } = finding.metadata || {};
    
    return {
      available: true,
      type: 'SQL',
      description: 'Add missing constraint',
      sql: `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${column} IS NOT NULL);`,
      confidence: 0.85,
      changes: 1
    };
  }
  
  fixDenormalization(finding) {
    return {
      available: false,
      reason: 'Denormalization requires manual schema redesign'
    };
  }
}

/**
 * Testing Fix Generator
 */
class TestingFixGenerator {
  async generateFix(finding) {
    const fixMap = {
      'MISSING_TEST': this.generateTest,
      'LOW_COVERAGE': this.addTestCases,
      'FLAKY_TEST': this.fixFlakyTest,
      'NO_ASSERTIONS': this.addAssertions
    };
    
    const generator = fixMap[finding.type];
    if (!generator) return null;
    
    return generator.call(this, finding);
  }
  
  generateTest(finding) {
    const { function: funcName, file } = finding.metadata || {};
    
    return {
      available: true,
      type: 'CREATE',
      file: file.replace('.js', '.test.js'),
      description: 'Generate test for function',
      content: `describe('${funcName}', () => {
  it('should work correctly', () => {
    // Arrange
    const input = {};
    
    // Act
    const result = ${funcName}(input);
    
    // Assert
    expect(result).toBeDefined();
  });
});`,
      confidence: 0.8,
      changes: 10
    };
  }
  
  addTestCases(finding) {
    return {
      available: true,
      type: 'INSERT',
      file: finding.location.file,
      description: 'Add test cases for edge cases',
      insertion: `  it('should handle null input', () => {
    expect(() => functionUnderTest(null)).toThrow();
  });
  
  it('should handle empty input', () => {
    expect(functionUnderTest([])).toEqual([]);
  });`,
      confidence: 0.75,
      changes: 6
    };
  }
  
  fixFlakyTest(finding) {
    return {
      available: true,
      type: 'REPLACE',
      file: finding.location.file,
      line: finding.location.line,
      description: 'Fix flaky test with proper async handling',
      pattern: 'setTimeout',
      replacement: 'await new Promise(resolve => setTimeout(resolve',
      confidence: 0.7,
      changes: 1
    };
  }
  
  addAssertions(finding) {
    return {
      available: true,
      type: 'INSERT',
      file: finding.location.file,
      line: finding.location.line,
      insertion: '    expect(result).toBeDefined();\n    expect(result.status).toBe("success");',
      description: 'Add missing assertions',
      confidence: 0.8,
      changes: 2
    };
  }
}

export default AutoFixEngine;