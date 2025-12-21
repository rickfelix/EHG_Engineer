#!/usr/bin/env node

/**
 * Comprehensive EHG Engineering Application Review
 */

import { chromium } from 'playwright';

async function comprehensiveReview() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  const issues = [];
  const warnings = [];
  
  try {
    console.log('🔍 EHG Engineering Application - Comprehensive Review');
    console.log('=' .repeat(60));
    
    // 1. Test Main Dashboard
    console.log('\n1️⃣ Testing Dashboard...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Check for critical elements
    const dashboardElements = await page.evaluate(() => {
      return {
        hasTitle: !!document.querySelector('h1'),
        hasActiveRole: document.body.textContent.includes('Active Role'),
        hasStrategicDirectives: document.body.textContent.includes('Strategic Directives'),
        hasDirectiveLab: document.body.textContent.includes('Directive Lab'),
        hasNavigation: !!document.querySelector('nav'),
        hasSidebar: !!document.querySelector('[class*="sidebar"], [class*="LEO Protocol"]')
      };
    });
    
    if (!dashboardElements.hasTitle) issues.push('Dashboard missing title');
    if (!dashboardElements.hasActiveRole) issues.push('Dashboard missing Active Role card');
    if (!dashboardElements.hasStrategicDirectives) issues.push('Dashboard missing Strategic Directives card');
    if (!dashboardElements.hasDirectiveLab) warnings.push('Dashboard missing Directive Lab card');
    if (!dashboardElements.hasNavigation) issues.push('Dashboard missing navigation');
    
    console.log(`  ✅ Dashboard loaded with ${Object.values(dashboardElements).filter(v => v).length}/6 elements`);
    
    // 2. Test Strategic Directives Page
    console.log('\n2️⃣ Testing Strategic Directives...');
    await page.goto('http://localhost:3000/strategic-directives', { waitUntil: 'networkidle' });
    
    const sdPageElements = await page.evaluate(() => {
      return {
        hasTitle: document.body.textContent.includes('Strategic Directives'),
        hasContent: !!document.querySelector('[class*="card"], [class*="list"]'),
        hasCreateButton: !!document.querySelector('button')
      };
    });
    
    if (!sdPageElements.hasTitle) issues.push('SD page missing title');
    if (!sdPageElements.hasContent) warnings.push('SD page has no content');
    console.log(`  ✅ SD page loaded with ${Object.values(sdPageElements).filter(v => v).length}/3 elements`);
    
    // 3. Test Directive Lab
    console.log('\n3️⃣ Testing Directive Lab...');
    await page.goto('http://localhost:3000/directive-lab', { waitUntil: 'networkidle' });
    
    const directiveLabElements = await page.evaluate(() => {
      return {
        hasTitle: document.body.textContent.includes('Directive Lab'),
        hasSubmissionArea: document.body.textContent.includes('Recent Submissions') || 
                          document.body.textContent.includes('No submissions'),
        hasNewButton: !!Array.from(document.querySelectorAll('button')).find(b => 
                        b.textContent.includes('New')),
        hasForm: !!document.querySelector('textarea, input[type="text"]')
      };
    });
    
    if (!directiveLabElements.hasTitle) issues.push('DirectiveLab missing title');
    if (!directiveLabElements.hasSubmissionArea) issues.push('DirectiveLab missing submission area');
    if (!directiveLabElements.hasNewButton) warnings.push('DirectiveLab missing New button');
    console.log(`  ✅ DirectiveLab loaded with ${Object.values(directiveLabElements).filter(v => v).length}/4 elements`);
    
    // 4. Check Console Errors
    console.log('\n4️⃣ Checking for console errors...');
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Reload to capture console errors
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(err => issues.push(`Console error: ${err}`));
    } else {
      console.log('  ✅ No console errors detected');
    }
    
    // 5. Test Responsive Design
    console.log('\n5️⃣ Testing responsive design...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    const mobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    if (mobileOverflow) {
      warnings.push('Horizontal overflow detected in mobile view');
    } else {
      console.log('  ✅ Mobile view works without overflow');
    }
    
    // 6. Check API Endpoints
    console.log('\n6️⃣ Testing API endpoints...');
    const apiTests = [
      { url: 'http://localhost:3000/api/status', name: 'Status API' },
      { url: 'http://localhost:3000/api/state', name: 'State API' },
      { url: 'http://localhost:3000/api/sd', name: 'Strategic Directives API' },
      { url: 'http://localhost:3000/api/prd', name: 'PRD API' }
    ];
    
    for (const test of apiTests) {
      const response = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          return { ok: res.ok, status: res.status };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, test.url);
      
      if (!response.ok) {
        issues.push(`${test.name} failed: ${response.error || response.status}`);
      } else {
        console.log(`  ✅ ${test.name} working`);
      }
    }
    
    // 7. Check Navigation
    console.log('\n7️⃣ Testing navigation...');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links.map(l => l.getAttribute('href')).filter(h => h && h.startsWith('/'));
    });
    
    if (navLinks.length < 2) {
      warnings.push('Limited navigation links found');
    } else {
      console.log(`  ✅ Found ${navLinks.length} navigation links`);
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 REVIEW SUMMARY');
    console.log('=' .repeat(60));
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('\n✅ NO CRITICAL ISSUES FOUND!');
      console.log('The application is working correctly.');
    } else {
      if (issues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES (' + issues.length + '):');
        issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS (' + warnings.length + '):');
        warnings.forEach((warning, i) => console.log(`  ${i + 1}. ${warning}`));
      }
    }
    
    return { issues, warnings };
    
  } catch (error) {
    console.error('\n❌ Review failed:', error.message);
    issues.push(`Review error: ${error.message}`);
    return { issues, warnings };
  } finally {
    await browser.close();
  }
}

comprehensiveReview().then(({ issues, warnings }) => {
  const exitCode = issues.length > 0 ? 1 : 0;
  process.exit(exitCode);
});