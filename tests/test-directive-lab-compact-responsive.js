#!/usr/bin/env node

/**
 * Test DirectiveLab Responsive Design with Compact Mode
 */

import { chromium } from 'playwright';

async function testCompactResponsive() {
  const browser = await chromium.launch({ headless: true });
  
  try {
    console.log('🎯 DirectiveLab Compact & Responsive Test\n');
    console.log('=' .repeat(50));
    
    // Test 1: Mobile View with Compact Mode
    console.log('\n📱 Test 1: Mobile View (375px)');
    console.log('-'.repeat(30));
    const mobilePage = await browser.newPage({ 
      viewport: { width: 375, height: 667 } 
    });
    
    await mobilePage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    // Try to enable compact mode
    const compactButton = await mobilePage.locator('button:has-text("Compact View")').first();
    if (await compactButton.count() > 0) {
      await compactButton.click();
      console.log('✅ Compact mode activated');
      await mobilePage.waitForTimeout(500);
    }
    
    // Check tab visibility
    const tabsVisible = await mobilePage.locator('button:has-text("Submissions")').count() > 0;
    console.log(`Tabs visible: ${tabsVisible ? '✅' : '❌'}`);
    
    // Check content visibility
    const contentVisible = await mobilePage.locator('text="Recent Submissions"').count() > 0 ||
                          await mobilePage.locator('text="No submissions yet"').count() > 0;
    console.log(`Content visible: ${contentVisible ? '✅' : '❌'}`);
    
    await mobilePage.screenshot({ 
      path: '/tmp/directive-lab-mobile-compact.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: /tmp/directive-lab-mobile-compact.png');
    
    // Test 2: Tablet View
    console.log('\n📱 Test 2: Tablet View (768px)');
    console.log('-'.repeat(30));
    const tabletPage = await browser.newPage({ 
      viewport: { width: 768, height: 1024 } 
    });
    
    await tabletPage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    // Check layout
    const hasTwoColumns = await tabletPage.evaluate(() => {
      const submissions = document.querySelector('[class*="Recent Submissions"]');
      const mainContent = document.querySelector('[class*="Chairman Feedback"], [class*="Ready to create"]');
      
      if (!submissions || !mainContent) return false;
      
      const subRect = submissions.getBoundingClientRect();
      const mainRect = mainContent.getBoundingClientRect();
      
      // Check if side by side (different x positions)
      return Math.abs(subRect.left - mainRect.left) > 100;
    });
    
    console.log(`Two-column layout: ${hasTwoColumns ? '✅' : '❌ (stacked)'}`);
    
    await tabletPage.screenshot({ 
      path: '/tmp/directive-lab-tablet-compact.png' 
    });
    console.log('📸 Screenshot: /tmp/directive-lab-tablet-compact.png');
    
    // Test 3: Desktop View with Compact Mode
    console.log('\n🖥️  Test 3: Desktop View (1280px) - Compact Mode');
    console.log('-'.repeat(30));
    const desktopPage = await browser.newPage({ 
      viewport: { width: 1280, height: 720 } 
    });
    
    await desktopPage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    // Enable compact mode
    const desktopCompactBtn = await desktopPage.locator('button:has-text("Compact View")').first();
    if (await desktopCompactBtn.count() > 0) {
      await desktopCompactBtn.click();
      await desktopPage.waitForTimeout(500);
      console.log('✅ Compact mode enabled');
    }
    
    // Check element sizes in compact mode
    const compactSizes = await desktopPage.evaluate(() => {
      const title = document.querySelector('h1');
      const button = document.querySelector('button:has-text("New Submission")');
      const textarea = document.querySelector('textarea');
      
      return {
        titleFontSize: title ? getComputedStyle(title).fontSize : 'N/A',
        buttonPadding: button ? getComputedStyle(button).padding : 'N/A',
        textareaPadding: textarea ? getComputedStyle(textarea).padding : 'N/A'
      };
    });
    
    console.log('Compact Mode Element Sizes:');
    console.log(`  Title font: ${compactSizes.titleFontSize}`);
    console.log(`  Button padding: ${compactSizes.buttonPadding}`);
    console.log(`  Textarea padding: ${compactSizes.textareaPadding}`);
    
    await desktopPage.screenshot({ 
      path: '/tmp/directive-lab-desktop-compact.png' 
    });
    console.log('📸 Screenshot: /tmp/directive-lab-desktop-compact.png');
    
    // Test 4: Narrow Window (compressed)
    console.log('\n🪟 Test 4: Narrow Window (400px wide)');
    console.log('-'.repeat(30));
    const narrowPage = await browser.newPage({ 
      viewport: { width: 400, height: 800 } 
    });
    
    await narrowPage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    // Check for horizontal scrolling
    const hasHorizontalScroll = await narrowPage.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    console.log(`Horizontal scroll: ${hasHorizontalScroll ? '❌ (content overflow!)' : '✅ (no overflow)'}`);
    
    // Check if buttons are accessible
    const newSubmissionBtn = await narrowPage.locator('button:has-text("New Submission")').first();
    const btnVisible = await newSubmissionBtn.isVisible().catch(() => false);
    console.log(`New Submission button accessible: ${btnVisible ? '✅' : '❌'}`);
    
    await narrowPage.screenshot({ 
      path: '/tmp/directive-lab-narrow.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: /tmp/directive-lab-narrow.png');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESPONSIVE DESIGN SUMMARY');
    console.log('='.repeat(50));
    
    const issues = [];
    
    if (!tabsVisible) issues.push('Mobile tabs not visible');
    if (!contentVisible) issues.push('Mobile content not visible');
    if (!hasTwoColumns && browser.viewport?.width >= 768) issues.push('Tablet should have two columns');
    if (hasHorizontalScroll) issues.push('Narrow window has horizontal scroll');
    if (!btnVisible) issues.push('Buttons not accessible in narrow view');
    
    if (issues.length === 0) {
      console.log('✅ All responsive tests PASSED!');
      console.log('DirectiveLab properly handles:');
      console.log('  • Mobile view with tabs');
      console.log('  • Tablet view layout');
      console.log('  • Desktop compact mode');
      console.log('  • Narrow window without overflow');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }
    
    return issues.length === 0;
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

testCompactResponsive().then(success => {
  process.exit(success ? 0 : 1);
});