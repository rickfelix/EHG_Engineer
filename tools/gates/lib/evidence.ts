/**
 * Evidence validation utilities for gate checks
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Lint OpenAPI specification
 * Returns true if valid, false if invalid or linter not available
 */
export async function lintOpenAPI(spec: any): Promise<boolean> {
  try {
    // Check if swagger-cli is available
    execSync('npx @apidevtools/swagger-cli --version', { stdio: 'ignore' });
  } catch {
    console.warn('⚠️  OpenAPI linter not available. Install with: npm install -D @apidevtools/swagger-cli');
    // Return false to be strict about validation
    return false;
  }

  try {
    // Write spec to temp file
    const tempFile = path.join(process.cwd(), `.tmp-openapi-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(spec, null, 2));

    // Validate the spec
    execSync(`npx @apidevtools/swagger-cli validate ${tempFile}`, { stdio: 'ignore' });
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    return true;
  } catch (error) {
    console.error('❌ OpenAPI validation failed:', error);
    return false;
  }
}

/**
 * Check if all required test matrices are present
 */
export function hasAllTestMatrices(matrices: any, required: string[]): boolean {
  if (!matrices || typeof matrices !== 'object') return false;
  
  for (const matrix of required) {
    if (!matrices[matrix]) {
      console.log(`  Missing test matrix: ${matrix}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check if security scan results are clean
 */
export function isSecurityScanClean(results: any): boolean {
  if (!results) return false;
  
  // Check OWASP status
  if (results.owasp !== 'clean') {
    console.log(`  OWASP scan not clean: ${results.owasp}`);
    return false;
  }
  
  // Check CSP configuration
  if (results.csp !== 'configured') {
    console.log(`  CSP not configured: ${results.csp}`);
    return false;
  }
  
  return true;
}

/**
 * Check if NFR budgets are within limits
 */
export function areNFRBudgetsValid(
  actual: { perf_budget_ms?: number; bundle_kb?: number },
  criteria: { perf_p95_ms?: { max: number }; bundle_kb?: { max: number } },
): boolean {
  if (!actual) return false;
  
  // Check performance budget
  if (criteria.perf_p95_ms?.max && actual.perf_budget_ms) {
    if (actual.perf_budget_ms > criteria.perf_p95_ms.max) {
      console.log(`  Performance budget exceeds limit: ${actual.perf_budget_ms}ms > ${criteria.perf_p95_ms.max}ms`);
      return false;
    }
  }
  
  // Check bundle size
  if (criteria.bundle_kb?.max && actual.bundle_kb) {
    if (actual.bundle_kb > criteria.bundle_kb.max) {
      console.log(`  Bundle size exceeds limit: ${actual.bundle_kb}KB > ${criteria.bundle_kb.max}KB`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check accessibility level compliance
 */
export function meetsA11yLevel(actual: string | undefined, required: string): boolean {
  if (!actual) return false;
  
  const levels = ['WCAG2.0-A', 'WCAG2.0-AA', 'WCAG2.0-AAA', 'WCAG2.1-A', 'WCAG2.1-AA', 'WCAG2.1-AAA'];
  const actualIndex = levels.indexOf(actual);
  const requiredIndex = levels.indexOf(required);
  
  if (actualIndex === -1) {
    console.log(`  Unknown accessibility level: ${actual}`);
    return false;
  }
  
  if (actualIndex < requiredIndex) {
    console.log(`  Accessibility level too low: ${actual} < ${required}`);
    return false;
  }
  
  return true;
}

/**
 * Parse JSON safely
 */
export function safeJsonParse(data: any): any {
  if (typeof data === 'object') return data;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}