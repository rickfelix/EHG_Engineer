#!/usr/bin/env node

/**
 * UI Rendering Test using Playwright
 * Tests actual UI components and interactions
 */

import { chromium } from 'playwright';

async function testUIRendering() {
  console.log('🖥️  Testing Dashboard UI Rendering with Playwright\n');
  console.log('=' .repeat(50));
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    // Navigate to dashboard
    console.log('\n📱 Loading Dashboard...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    console.log('  ✅ Dashboard loaded');
    
    // Wait for React to render
    await page.waitForTimeout(2000);
    
    // Test 1: Check main components are visible
    console.log('\n🎨 Testing UI Components:');
    
    // Check for header
    const header = await page.$('header, .header, [class*="header"]');
    console.log(`  ${header ? '✅' : '❌'} Header component`);
    
    // Check for navigation
    const nav = await page.$('nav, .nav, [class*="nav"]');
    console.log(`  ${nav ? '✅' : '❌'} Navigation component`);
    
    // Check for main content area
    const main = await page.$('main, .main, [class*="main"], .dashboard');
    console.log(`  ${main ? '✅' : '❌'} Main content area`);
    
    // Test 2: Check for LEO Protocol specific elements
    console.log('\n📊 Testing LEO Protocol Elements:');
    
    // Look for progress indicators
    const progressElements = await page.$$('[class*="progress"], [role="progressbar"]');
    console.log(`  ✅ Progress indicators: ${progressElements.length}`);
    
    // Look for cards or panels
    const cards = await page.$$('[class*="card"], [class*="panel"], .strategic-directive, .prd');
    console.log(`  ✅ Card/Panel components: ${cards.length}`);
    
    // Look for status badges
    const statuses = await page.$$('[class*="status"], [class*="badge"]');
    console.log(`  ✅ Status indicators: ${statuses.length}`);
    
    // Test 3: Check for data display
    console.log('\n📋 Testing Data Display:');
    
    // Get all text content
    const textContent = await page.textContent('body');
    
    // Check for expected content
    const hasLEOProtocol = textContent.includes('LEO Protocol') || textContent.includes('LEO');
    const hasSD = textContent.includes('Strategic') || textContent.includes('SD');
    const hasPRD = textContent.includes('PRD') || textContent.includes('Product Requirements');
    const hasProgress = textContent.includes('%') || textContent.includes('progress');
    
    console.log(`  ${hasLEOProtocol ? '✅' : '❌'} LEO Protocol mentioned`);
    console.log(`  ${hasSD ? '✅' : '❌'} Strategic Directives visible`);
    console.log(`  ${hasPRD ? '✅' : '❌'} PRD content visible`);
    console.log(`  ${hasProgress ? '✅' : '❌'} Progress information displayed`);
    
    // Test 4: Check for interactive elements
    console.log('\n🖱️  Testing Interactive Elements:');
    
    const buttons = await page.$$('button, [role="button"]');
    const links = await page.$$('a[href]');
    const inputs = await page.$$('input, textarea, select');
    const checkboxes = await page.$$('input[type="checkbox"]');
    
    console.log(`  ✅ Buttons: ${buttons.length}`);
    console.log(`  ✅ Links: ${links.length}`);
    console.log(`  ✅ Input fields: ${inputs.length}`);
    console.log(`  ✅ Checkboxes: ${checkboxes.length}`);
    
    // Test 5: Check specific dashboard features
    console.log('\n🔧 Testing Dashboard Features:');
    
    // Look for specific SD
    const auditSD = textContent.includes('SD-DASHBOARD-AUDIT-2025-08-31-A');
    console.log(`  ${auditSD ? '✅' : '❌'} Audit SD visible`);
    
    // Look for progress percentage
    const progressMatch = textContent.match(/(\d+)%/g);
    if (progressMatch) {
      console.log(`  ✅ Progress percentages found: ${progressMatch.slice(0, 5).join(', ')}`);
    }
    
    // Test 6: Check for errors
    console.log('\n⚠️  Checking for Errors:');
    
    // Check console for errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Check for error messages in UI
    const errorElements = await page.$$('[class*="error"], [class*="alert"], .error-message');
    console.log(`  ${errorElements.length === 0 ? '✅' : '❌'} No error messages displayed (${errorElements.length} found)`);
    
    // Test 7: Performance check
    console.log('\n⚡ Performance Metrics:');
    const metrics = await page.evaluate(() => {
      const timing = performance.timing;
      return {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart
      };
    });
    
    console.log(`  ✅ DOM Content Loaded: ${metrics.domContentLoaded}ms`);
    console.log(`  ✅ Page Load Complete: ${metrics.loadComplete}ms`);
    console.log(`  ${metrics.loadComplete < 3000 ? '✅' : '⚠️ '} Load time ${metrics.loadComplete < 3000 ? 'acceptable' : 'slow'}`);
    
    // Take screenshot for visual inspection
    await page.screenshot({ 
      path: '/tmp/dashboard-screenshot.png',
      fullPage: true 
    });
    console.log('\n📸 Screenshot saved to /tmp/dashboard-screenshot.png');
    
    // Generate summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 UI RENDERING ANALYSIS SUMMARY');
    console.log('='.repeat(50));
    
    const componentScore = (header ? 1 : 0) + (nav ? 1 : 0) + (main ? 1 : 0);
    const dataScore = (hasLEOProtocol ? 1 : 0) + (hasSD ? 1 : 0) + (hasPRD ? 1 : 0) + (hasProgress ? 1 : 0);
    const interactiveScore = Math.min(5, buttons.length > 0 ? 1 : 0 + links.length > 0 ? 1 : 0 + inputs.length > 0 ? 1 : 0 + checkboxes.length > 0 ? 1 : 0);
    
    console.log('\n🏆 Scores:');
    console.log(`  Component Rendering: ${componentScore}/3`);
    console.log(`  Data Display: ${dataScore}/4`);
    console.log(`  Interactive Elements: ${buttons.length > 0 && links.length > 0 ? '✅' : '⚠️'}`);
    console.log(`  Performance: ${metrics.loadComplete < 3000 ? '✅' : '⚠️'}`);
    console.log(`  Error-free: ${errorElements.length === 0 ? '✅' : '❌'}`);
    
    const overallScore = componentScore >= 2 && dataScore >= 3 && errorElements.length === 0;
    console.log(`\n${overallScore ? '✅' : '❌'} Overall UI Status: ${overallScore ? 'HEALTHY' : 'NEEDS ATTENTION'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the test
testUIRendering().catch(console.error);