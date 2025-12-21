#!/usr/bin/env node

/**
 * URL Verification Script for EXEC Agent
 * Ensures implementation targets the correct URL and component
 * 
 * Usage: node verify-target-url.js <URL> [component-hint]
 * Example: node verify-target-url.js http://localhost:8080/chairman Chairman
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class URLVerifier {
  constructor() {
    this.results = {
      url: null,
      accessible: false,
      port: null,
      applicationPath: null,
      componentPath: null,
      screenshot: null,
      timestamp: new Date().toISOString()
    };
  }

  async verify(targetUrl, componentHint = '') {
    console.log('🔍 EXEC Pre-Implementation URL Verification');
    console.log('='.repeat(50));
    
    // Parse URL
    try {
      const url = new URL(targetUrl);
      this.results.url = targetUrl;
      this.results.port = url.port || (url.protocol === 'https:' ? '443' : '80');
      
      console.log(`\n📍 Target URL: ${targetUrl}`);
      console.log(`🔌 Port: ${this.results.port}`);
      console.log(`🎯 Component hint: ${componentHint || 'None provided'}`);
    } catch (error) {
      console.error('❌ Invalid URL format');
      return this.generateReport(false);
    }

    // Test accessibility with Playwright
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
      console.log('\n⏳ Navigating to URL...');
      const response = await page.goto(targetUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      this.results.accessible = response.ok();
      
      if (this.results.accessible) {
        console.log('✅ Page is accessible');
        
        // Take screenshot
        const screenshotPath = path.join(__dirname, `../screenshots/verify-${Date.now()}.png`);
        await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        this.results.screenshot = screenshotPath;
        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        
        // Try to identify component location
        if (componentHint) {
          await this.identifyComponent(page, componentHint);
        }
        
        // Identify application path from port
        this.identifyApplicationPath();
        
        // Visual confirmation pause
        console.log('\n⏸️  Keeping browser open for 5 seconds for visual confirmation...');
        await page.waitForTimeout(5000);
      } else {
        console.log('❌ Page not accessible (HTTP status: ' + response.status() + ')');
      }
      
    } catch (error) {
      console.error('❌ Error accessing URL:', error.message);
      this.results.accessible = false;
    } finally {
      await browser.close();
    }
    
    return this.generateReport(this.results.accessible);
  }

  async identifyComponent(page, hint) {
    console.log(`\n🔎 Searching for component containing "${hint}"...`);
    
    const componentInfo = await page.evaluate((searchHint) => {
      const elements = Array.from(document.querySelectorAll('*'));
      
      for (const el of elements) {
        if (el.textContent?.includes(searchHint) || 
            el.className?.includes(searchHint.toLowerCase())) {
          
          const rect = el.getBoundingClientRect();
          
          // Try to find React component name
          const reactKey = Object.keys(el).find(key => key.startsWith('__react'));
          let componentName = 'Unknown';
          
          if (reactKey) {
            const fiber = el[reactKey];
            componentName = fiber?.elementType?.name || fiber?.type?.name || 'React Component';
          }
          
          return {
            found: true,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            position: { x: rect.left, y: rect.top },
            componentName
          };
        }
      }
      
      return { found: false };
    }, hint);
    
    if (componentInfo.found) {
      console.log('✅ Component area identified:');
      console.log(`   Tag: ${componentInfo.tagName}`);
      console.log(`   Component: ${componentInfo.componentName}`);
      console.log(`   Position: (${componentInfo.position.x}, ${componentInfo.position.y})`);
    } else {
      console.log('⚠️  Component hint not found on page');
    }
  }

  identifyApplicationPath() {
    // Map common ports to application paths
    const portMappings = {
      '3000': '/mnt/c/_EHG/EHG_Engineer',
      '3456': '/mnt/c/_EHG/EHG_Engineer',
      '8080': '/mnt/c/_EHG/EHG',
      '5173': '/mnt/c/_EHG/EHG', // Vite default
    };
    
    this.results.applicationPath = portMappings[this.results.port] || 'Unknown';
    
    if (this.results.applicationPath !== 'Unknown') {
      console.log(`\n📁 Application path: ${this.results.applicationPath}`);
      
      // Try to identify likely component path
      if (this.results.url.includes('chairman')) {
        this.results.componentPath = `${this.results.applicationPath}/src/components/venture/ChairmanDashboard.tsx`;
      } else if (this.results.url.includes('directive-lab')) {
        this.results.componentPath = `${this.results.applicationPath}/src/client/src/components/DirectiveLab.jsx`;
      }
      
      if (this.results.componentPath) {
        console.log(`🎯 Likely component: ${this.results.componentPath}`);
      }
    }
  }

  generateReport(success) {
    console.log('\n' + '='.repeat(50));
    console.log('📋 EXEC Pre-Implementation Checklist');
    console.log('='.repeat(50));
    
    const checklist = [
      `- [${this.results.url ? 'x' : ' '}] URL verified: ${this.results.url || 'NOT PROVIDED'}`,
      `- [${this.results.accessible ? 'x' : ' '}] Page accessible: ${this.results.accessible ? 'YES' : 'NO'}`,
      `- [${this.results.componentPath ? 'x' : ' '}] Component identified: ${this.results.componentPath || 'NEEDS MANUAL CHECK'}`,
      `- [${this.results.applicationPath ? 'x' : ' '}] Application path: ${this.results.applicationPath || 'UNKNOWN'}`,
      `- [${this.results.port ? 'x' : ' '}] Port confirmed: ${this.results.port || 'UNKNOWN'}`,
      `- [${this.results.screenshot ? 'x' : ' '}] Screenshot taken: ${this.results.timestamp}`,
      `- [${success ? 'x' : ' '}] Target location confirmed: ${success ? 'READY' : 'NEEDS VERIFICATION'}`
    ];
    
    console.log(checklist.join('\n'));
    
    if (!success) {
      console.log('\n⚠️  VERIFICATION FAILED - DO NOT PROCEED WITH IMPLEMENTATION');
      console.log('Fix the issues above before continuing');
    } else {
      console.log('\n✅ VERIFICATION PASSED - Safe to proceed with implementation');
    }
    
    // Save report
    const reportPath = path.join(__dirname, `../verification-reports/report-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Report saved: ${reportPath}`);
    
    return this.results;
  }
}

// CLI execution
if (process.argv.length < 3) {
  console.error('Usage: node verify-target-url.js <URL> [component-hint]');
  console.error('Example: node verify-target-url.js http://localhost:8080/chairman Chairman');
  process.exit(1);
}

const verifier = new URLVerifier();
const targetUrl = process.argv[2];
const componentHint = process.argv[3] || '';

verifier.verify(targetUrl, componentHint).then(results => {
  process.exit(results.accessible ? 0 : 1);
});