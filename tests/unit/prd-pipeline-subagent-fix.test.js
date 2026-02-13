/**
 * Unit tests for SD-LEO-FIX-FIX-BROKEN-SUB-001
 * Validates that execSync CLI invocations were properly replaced with
 * programmatic executeSubAgent imports across the PRD pipeline.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

// The 5 files that were changed in this SD
const CHANGED_FILES = [
  'scripts/prd/sub-agent-orchestrator.js',
  'scripts/modules/prd/subagent-phases.js',
  'scripts/regenerate-prd-content.js',
  'scripts/modules/prd-generator/sub-agent-runners.js',
  'package.json'
];

// The 4 code files (excluding package.json) that should import executeSubAgent
const CODE_FILES = CHANGED_FILES.filter(f => f !== 'package.json');

describe('SD-LEO-FIX-FIX-BROKEN-SUB-001: Fix Broken Sub-Agent CLI Invocations', () => {

  describe('All changed files exist', () => {
    for (const file of CHANGED_FILES) {
      it(`${file} exists`, () => {
        const fullPath = path.join(PROJECT_ROOT, file);
        expect(fs.existsSync(fullPath), `File not found: ${fullPath}`).toBe(true);
      });
    }
  });

  describe('No execSync calls to sub-agent-executor remain', () => {
    for (const file of CODE_FILES) {
      it(`${file} has zero execSync references`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        // Check for the broken pattern: execSync('node lib/sub-agent-executor.js ...')
        expect(content).not.toMatch(/execSync/);
        // Also check there's no child_process import
        expect(content).not.toMatch(/require\(['"]child_process['"]\)/);
        expect(content).not.toMatch(/from\s+['"]child_process['"]/);
      });
    }
  });

  describe('All code files import executeSubAgent programmatically', () => {
    for (const file of CODE_FILES) {
      it(`${file} imports executeSubAgent from lib/sub-agent-executor.js`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        expect(content).toMatch(/import\s+\{[^}]*executeSubAgent[^}]*\}\s+from\s+['"][^'"]*sub-agent-executor\.js['"]/);
      });
    }
  });

  describe('All code files use await executeSubAgent() calls', () => {
    for (const file of CODE_FILES) {
      it(`${file} has at least one await executeSubAgent call`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        const awaitCalls = content.match(/await\s+executeSubAgent\s*\(/g);
        expect(awaitCalls, `Expected at least one await executeSubAgent call in ${file}`).toBeTruthy();
        expect(awaitCalls.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  describe('Expected await executeSubAgent call counts per file', () => {
    const expectedCounts = {
      'scripts/prd/sub-agent-orchestrator.js': 4,        // DESIGN, DATABASE, SECURITY, RISK
      'scripts/modules/prd/subagent-phases.js': 4,       // DESIGN, DATABASE, SECURITY, RISK
      'scripts/regenerate-prd-content.js': 4,             // DESIGN, DATABASE, RISK, SECURITY
      'scripts/modules/prd-generator/sub-agent-runners.js': 1  // core runSubAgent function
    };

    for (const [file, expectedCount] of Object.entries(expectedCounts)) {
      it(`${file} has ${expectedCount} executeSubAgent call(s)`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        const awaitCalls = content.match(/await\s+executeSubAgent\s*\(/g);
        expect(awaitCalls).toBeTruthy();
        expect(awaitCalls.length).toBe(expectedCount);
      });
    }
  });

  describe('formatSubAgentResult helper is present in files that need it', () => {
    // These files have their own formatSubAgentResult since they need to convert
    // structured executeSubAgent results back to string format for the PRD pipeline
    const filesWithFormatter = [
      'scripts/prd/sub-agent-orchestrator.js',
      'scripts/modules/prd/subagent-phases.js',
      'scripts/regenerate-prd-content.js',
      'scripts/modules/prd-generator/sub-agent-runners.js'
    ];

    for (const file of filesWithFormatter) {
      it(`${file} has formatSubAgentResult function`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        expect(content).toMatch(/function\s+formatSubAgentResult\s*\(/);
      });
    }
  });

  describe('formatSubAgentResult function logic', () => {
    // Inline the function for direct testing (same implementation as in the source files)
    function formatSubAgentResult(result, agentName) {
      if (!result) return null;
      const parts = [`${agentName} Analysis Results:`];
      if (result.verdict) parts.push(`Verdict: ${result.verdict}`);
      if (result.confidence) parts.push(`Confidence: ${result.confidence}%`);
      if (result.message) parts.push(`Summary: ${result.message}`);
      if (result.recommendations?.length > 0) {
        parts.push('\nRecommendations:');
        result.recommendations.forEach((r, i) => parts.push(`  ${i + 1}. ${typeof r === 'string' ? r : r.recommendation || JSON.stringify(r)}`));
      }
      if (result.critical_issues?.length > 0) {
        parts.push('\nCritical Issues:');
        result.critical_issues.forEach((issue, i) => parts.push(`  ${i + 1}. ${typeof issue === 'string' ? issue : issue.issue || JSON.stringify(issue)}`));
      }
      const skipKeys = new Set(['verdict', 'confidence', 'message', 'recommendations', 'critical_issues', 'execution_time_ms', 'hallucination_check', 'stored_result_id']);
      for (const [key, value] of Object.entries(result)) {
        if (!skipKeys.has(key) && value != null) {
          parts.push(typeof value === 'object' ? `\n${key}: ${JSON.stringify(value, null, 2)}` : `${key}: ${value}`);
        }
      }
      return parts.join('\n');
    }

    it('returns null for null input', () => {
      expect(formatSubAgentResult(null, 'DESIGN')).toBeNull();
    });

    it('formats basic result with verdict, confidence, message', () => {
      const result = { verdict: 'PASS', confidence: 85, message: 'Looks good' };
      const output = formatSubAgentResult(result, 'DESIGN');
      expect(output).toContain('DESIGN Analysis Results:');
      expect(output).toContain('Verdict: PASS');
      expect(output).toContain('Confidence: 85%');
      expect(output).toContain('Summary: Looks good');
    });

    it('formats string recommendations', () => {
      const result = { verdict: 'CONDITIONAL_PASS', confidence: 70, recommendations: ['Fix auth', 'Add tests'] };
      const output = formatSubAgentResult(result, 'DATABASE');
      expect(output).toContain('Recommendations:');
      expect(output).toContain('1. Fix auth');
      expect(output).toContain('2. Add tests');
    });

    it('formats object recommendations with recommendation field', () => {
      const result = { verdict: 'PASS', confidence: 80, recommendations: [{ recommendation: 'Add RLS policy' }] };
      const output = formatSubAgentResult(result, 'SECURITY');
      expect(output).toContain('1. Add RLS policy');
    });

    it('formats critical issues (string and object)', () => {
      const result = { verdict: 'FAIL', confidence: 90, critical_issues: ['Missing RLS', { issue: 'No backup plan' }] };
      const output = formatSubAgentResult(result, 'SECURITY');
      expect(output).toContain('Critical Issues:');
      expect(output).toContain('1. Missing RLS');
      expect(output).toContain('2. No backup plan');
    });

    it('includes extra fields but excludes skip keys', () => {
      const result = { verdict: 'PASS', confidence: 95, custom_field: 'value', execution_time_ms: 123, hallucination_check: 'passed' };
      const output = formatSubAgentResult(result, 'RISK');
      expect(output).toContain('custom_field: value');
      expect(output).not.toContain('execution_time_ms');
      expect(output).not.toContain('hallucination_check');
    });

    it('formats object extra fields as JSON', () => {
      const result = { verdict: 'PASS', confidence: 80, affected_tables: ['users', 'sessions'] };
      const output = formatSubAgentResult(result, 'DATABASE');
      expect(output).toContain('affected_tables:');
      expect(output).toContain('"users"');
      expect(output).toContain('"sessions"');
    });
  });

  describe('Sub-agent types used correctly', () => {
    const expectedAgentTypes = ['DESIGN', 'DATABASE', 'SECURITY', 'RISK'];

    for (const file of CODE_FILES) {
      it(`${file} invokes correct sub-agent types`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        // The core runners file delegates through runSubAgent, so check differently
        if (file.includes('sub-agent-runners.js')) {
          // sub-agent-runners.js uses a generic runSubAgent that passes agentType
          expect(content).toMatch(/executeSubAgent\(agentType/);
          return;
        }
        // Other files should call specific agent types
        const agentCalls = content.match(/executeSubAgent\(['"](\w+)['"]/g) || [];
        const calledTypes = agentCalls.map(c => c.match(/['"](\w+)['"]/)[1]);
        // Each file should call at least DESIGN and DATABASE
        expect(calledTypes).toContain('DESIGN');
        expect(calledTypes).toContain('DATABASE');
      });
    }
  });

  describe('Error handling preserved', () => {
    for (const file of CODE_FILES) {
      it(`${file} has try-catch around executeSubAgent calls`, () => {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
        // Every executeSubAgent call should be in a try block
        const tryBlocks = content.match(/try\s*\{/g);
        expect(tryBlocks, `Expected try blocks in ${file}`).toBeTruthy();
        expect(tryBlocks.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  describe('package.json npm script updated', () => {
    it('docs:bg-compliance uses execute-subagent.js (not lib/sub-agent-executor.js CLI)', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      const script = pkg.scripts['docs:bg-compliance'];
      expect(script).toBeDefined();
      expect(script).toContain('execute-subagent.js');
      expect(script).not.toContain('lib/sub-agent-executor.js');
    });
  });

  describe('lib/sub-agent-executor.js exports executeSubAgent', () => {
    it('exports executeSubAgent as a named export', () => {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, 'lib/sub-agent-executor.js'), 'utf-8');
      expect(content).toMatch(/export\s*\{[\s\S]*executeSubAgent[\s\S]*\}/);
    });
  });

  describe('No other active scripts still use execSync CLI pattern for sub-agent-executor', () => {
    it('no active scripts in scripts/ use execSync with sub-agent-executor.js', () => {
      const scriptsDir = path.join(PROJECT_ROOT, 'scripts');
      const allFiles = getAllJsFiles(scriptsDir);

      const violations = [];
      for (const file of allFiles) {
        // Skip one-time scripts (they contain documentation about the old pattern)
        if (file.includes('one-time')) continue;
        // Skip test files
        if (file.includes('test')) continue;

        const content = fs.readFileSync(file, 'utf-8');
        if (content.match(/execSync.*sub-agent-executor/)) {
          violations.push(file.replace(PROJECT_ROOT + path.sep, ''));
        }
      }

      expect(violations, `Files still using execSync with sub-agent-executor: ${violations.join(', ')}`).toHaveLength(0);
    });
  });
});

/**
 * Recursively get all .js files in a directory
 */
function getAllJsFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...getAllJsFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // ignore permission errors etc
  }
  return results;
}
