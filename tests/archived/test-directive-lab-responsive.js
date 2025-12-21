#!/usr/bin/env node

/**
 * Test DirectiveLab Responsive Design
 */

import { chromium } from 'playwright';

async function testResponsiveDesign() {
  const browser = await chromium.launch({ headless: false });
  
  try {
    console.log('📱 Testing DirectiveLab Responsive Design\n');
    
    // Test mobile viewport (narrow window)
    console.log('Testing Mobile View (375px width)...');
    const mobilePage = await browser.newPage({ 
      viewport: { width: 375, height: 667 } 
    });
    
    await mobilePage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    await mobilePage.screenshot({ 
      path: '/tmp/directive-lab-mobile.png',
      fullPage: true 
    });
    console.log('📸 Mobile screenshot: /tmp/directive-lab-mobile.png');
    
    // Check if elements stack properly
    const mobileLayout = await mobilePage.evaluate(() => {
      const submissions = document.querySelector('[class*="Recent Submissions"]');
      const wizard = document.querySelector('[class*="Chairman Feedback"]');
      const submitButton = document.querySelector('button');
      
      return {
        hasOverflow: document.body.scrollWidth > window.innerWidth,
        elementsVisible: {
          submissions: !!submissions,
          wizard: !!wizard,
          button: !!submitButton
        }
      };
    });
    
    console.log('Mobile Layout Check:', mobileLayout);
    
    // Test tablet viewport
    console.log('\nTesting Tablet View (768px width)...');
    const tabletPage = await browser.newPage({ 
      viewport: { width: 768, height: 1024 } 
    });
    
    await tabletPage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    await tabletPage.screenshot({ 
      path: '/tmp/directive-lab-tablet.png' 
    });
    console.log('📸 Tablet screenshot: /tmp/directive-lab-tablet.png');
    
    // Test compressed/compact mode
    console.log('\nTesting Compact Mode...');
    const compactPage = await browser.newPage({ 
      viewport: { width: 1280, height: 720 } 
    });
    
    await compactPage.goto('http://localhost:3000/directive-lab', { 
      waitUntil: 'networkidle' 
    });
    
    // Click Compact View button if exists
    const compactButton = await compactPage.locator('button:has-text("Compact View")').first();
    if (await compactButton.count() > 0) {
      await compactButton.click();
      await compactPage.waitForTimeout(500);
    }
    
    await compactPage.screenshot({ 
      path: '/tmp/directive-lab-compact.png' 
    });
    console.log('📸 Compact mode screenshot: /tmp/directive-lab-compact.png');
    
    // Analyze layout issues
    console.log('\n📊 Responsive Design Analysis:');
    
    const issues = [];
    
    if (mobileLayout.hasOverflow) {
      issues.push('❌ Horizontal overflow detected in mobile view');
    } else {
      console.log('✅ No horizontal overflow in mobile view');
    }
    
    if (!mobileLayout.elementsVisible.submissions) {
      issues.push('❌ Submissions section not visible in mobile');
    }
    
    if (!mobileLayout.elementsVisible.wizard) {
      issues.push('❌ Wizard section not visible in mobile');
    }
    
    if (issues.length > 0) {
      console.log('\n⚠️  Issues found:');
      issues.forEach(issue => console.log(`  ${issue}`));
    } else {
      console.log('✅ All responsive checks passed!');
    }
    
    return issues;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testResponsiveDesign().catch(console.error);