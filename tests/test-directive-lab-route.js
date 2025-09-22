#!/usr/bin/env node

/**
 * Test DirectiveLab Route Accessibility
 */

import { chromium } from 'playwright';

async function testDirectiveLabRoute() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Testing DirectiveLab route...\n');
    
    // Navigate to main page
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('✅ Loaded main page');
    
    // Check if navigation link exists
    const navLink = await page.locator('a[href="/directive-lab"]').first();
    const navExists = await navLink.count() > 0;
    console.log(`Navigation link exists: ${navExists ? '✅' : '❌'}`);
    
    if (navExists) {
      const navText = await navLink.textContent();
      console.log(`Navigation text: "${navText}"`);
    }
    
    // Navigate directly to DirectiveLab
    console.log('\nNavigating to /directive-lab...');
    await page.goto('http://localhost:3000/directive-lab', { waitUntil: 'networkidle' });
    
    // Check page title or content
    const title = await page.title();
    console.log(`Page title: "${title}"`);
    
    // Look for DirectiveLab specific content
    const hasWizard = await page.locator('text="Strategic Directive Initiation Protocol"').count() > 0;
    const hasSteps = await page.locator('text="Chairman Input"').count() > 0;
    const hasSubmissions = await page.locator('text="Recent Submissions"').count() > 0;
    
    console.log('\n📊 DirectiveLab Content Check:');
    console.log(`  SDIP title: ${hasWizard ? '✅' : '❌'}`);
    console.log(`  Step wizard: ${hasSteps ? '✅' : '❌'}`);
    console.log(`  Submissions section: ${hasSubmissions ? '✅' : '❌'}`);
    
    // Check console errors
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg));
    
    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/directive-lab-route.png' });
    console.log('\n📸 Screenshot saved to /tmp/directive-lab-route.png');
    
    // Get page content for debugging
    const bodyText = await page.locator('body').textContent();
    if (bodyText.includes('404') || bodyText.includes('not found')) {
      console.log('\n❌ Page shows 404 or not found error');
    }
    
    // Check if React rendered anything
    const reactRoot = await page.locator('#root').first();
    const rootExists = await reactRoot.count() > 0;
    if (rootExists) {
      const rootHtml = await reactRoot.innerHTML();
      console.log(`\nReact root exists: ✅ (${rootHtml.length} chars of HTML)`);
      if (rootHtml.length < 100) {
        console.log('⚠️  React root has very little content');
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing DirectiveLab route:', error.message);
  } finally {
    await browser.close();
  }
}

testDirectiveLabRoute().catch(console.error);