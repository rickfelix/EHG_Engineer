#!/usr/bin/env node

/**
 * Test Security Sub-Agent on EHG Application
 */

import SecuritySubAgent from '../lib/agents/security-sub-agent';
import path from 'path';
import fs from 'fs';

async function testSecurity() {
  const agent = new SecuritySubAgent();
  const basePath = '/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase';
  
  console.log('🔍 Testing Security Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  // Run all security checks
  console.log('\n📊 Running security analysis...\n');
  
  const results = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
    timestamp: new Date().toISOString(),
    basePath
  };
  
  try {
    // Run each scan method
    console.log('1. Scanning for hardcoded secrets...');
    const secrets = await agent.scanForSecrets(basePath);
    if (secrets) {
      results.critical.push(...(secrets.critical || []));
      results.high.push(...(secrets.high || []));
    }
    
    console.log('2. Scanning for SQL injection vulnerabilities...');
    const sqlInjection = await agent.scanForSQLInjection(basePath);
    if (sqlInjection && sqlInjection.issues) {
      // SQL injection issues should be high severity
      sqlInjection.issues.forEach(issue => {
        results.high.push({
          type: 'SQL_INJECTION',
          ...issue
        });
      });
    }
    
    console.log('3. Scanning for XSS vulnerabilities...');
    const xss = await agent.scanForXSS(basePath);
    if (xss && xss.issues) {
      // XSS issues should be high severity
      xss.issues.forEach(issue => {
        results.high.push({
          type: 'XSS_VULNERABILITY',
          ...issue
        });
      });
    }
    
    console.log('4. Checking authentication implementation...');
    const auth = await agent.checkAuthentication(basePath);
    if (auth && auth.issues) {
      auth.issues.forEach(issue => {
        const severity = issue.severity || 'MEDIUM';
        if (severity === 'HIGH') {
          results.high.push(issue);
        } else if (severity === 'LOW') {
          results.low.push(issue);
        } else {
          results.medium.push(issue);
        }
      });
    }
    
    console.log('5. Checking security headers...');
    const headers = await agent.checkSecurityHeaders(basePath);
    if (headers && headers.issues) {
      headers.issues.forEach(issue => {
        results.medium.push({
          type: 'MISSING_SECURITY_HEADER',
          ...issue
        });
      });
    }
    
    console.log('6. Checking input validation...');
    const validation = await agent.checkInputValidation(basePath);
    if (validation && validation.issues) {
      validation.issues.forEach(issue => {
        results.medium.push({
          type: 'INPUT_VALIDATION',
          ...issue
        });
      });
    }
    
    console.log('7. Checking dependencies...');
    const packagePath = path.join(basePath, 'package.json');
    if (fs.existsSync(packagePath)) {
      import { execSync } from 'child_process';
      try {
        const auditOutput = execSync('npm audit --json', { 
          cwd: basePath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        const audit = JSON.parse(auditOutput);
        if (audit.metadata && audit.metadata.vulnerabilities) {
          const vulns = audit.metadata.vulnerabilities;
          if (vulns.critical > 0) {
            results.critical.push({
              type: 'VULNERABLE_DEPENDENCIES',
              description: `${vulns.critical} critical vulnerabilities in dependencies`,
              count: vulns.critical
            });
          }
          if (vulns.high > 0) {
            results.high.push({
              type: 'VULNERABLE_DEPENDENCIES',
              description: `${vulns.high} high severity vulnerabilities in dependencies`,
              count: vulns.high
            });
          }
        }
      } catch (_e) {
        console.log('   (npm audit failed - skipping)');
      }
    }
    
    // Calculate score
    results.score = agent.calculateScore(results);
    
    // Generate detailed report
    agent.generateReport(results);
    
    // Debug: Show what was actually scanned
    console.log('\n📝 Debug Information:');
    const sourceFiles = await agent.getSourceFiles(basePath);
    console.log(`   Total source files scanned: ${sourceFiles.length}`);
    if (sourceFiles.length === 0) {
      console.log('   ⚠️  WARNING: No source files found!');
      console.log('   Checking for common patterns:');
      const patterns = ['*.js', '*.jsx', '*.ts', '*.tsx', '*.py', '*.rb'];
      for (const pattern of patterns) {
        const files = await agent.findFiles(basePath, pattern);
        if (files.length > 0) {
          console.log(`   Found ${files.length} ${pattern} files`);
        }
      }
    } else {
      console.log(`   First 5 files: ${sourceFiles.slice(0, 5).map(f => path.basename(f)).join(', ')}`);
    }
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'security-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (_error) {
    console.error('❌ Error during security analysis:', error.message);
    console.error(error.stack);
  }
}

testSecurity();