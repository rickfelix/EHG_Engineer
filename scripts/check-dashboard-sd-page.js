#!/usr/bin/env node

import { chromium } from 'playwright';

async function checkStrategicDirectivesPage() {
    console.log('🔍 Checking Strategic Directives page...');
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Navigate to the dashboard
        console.log('\nNavigating to http://localhost:3000/dashboard...');
        await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
        
        // Take a screenshot of the current page
        await page.screenshot({ path: 'dashboard-main.png' });
        console.log('📸 Screenshot saved: dashboard-main.png');
        
        // Look for Strategic Directives section/link
        console.log('\nLooking for Strategic Directives section...');
        
        // Check if there's a tab or link for Strategic Directives
        const sdTab = await page.locator('text="Strategic Directives"').first();
        if (await sdTab.isVisible()) {
            console.log('✅ Found Strategic Directives tab/link');
            await sdTab.click();
            await page.waitForTimeout(2000);
        }
        
        // Take screenshot after clicking
        await page.screenshot({ path: 'strategic-directives-page.png', fullPage: true });
        console.log('📸 Screenshot saved: strategic-directives-page.png');
        
        // Look for SD-VISION-ALIGN-001
        console.log('\nSearching for SD-VISION-ALIGN-001...');
        const visionSD = await page.locator('text="SD-VISION-ALIGN-001"').first();
        
        if (await visionSD.isVisible()) {
            console.log('✅ FOUND: SD-VISION-ALIGN-001 is visible on the page!');
            const boundingBox = await visionSD.boundingBox();
            console.log('   Position:', boundingBox);
        } else {
            console.log('❌ NOT FOUND: SD-VISION-ALIGN-001 is not visible');
        }
        
        // Check for any text containing "Vision Alignment"
        const visionText = await page.locator('text=/.*Vision Alignment.*/i').first();
        if (await visionText.isVisible()) {
            console.log('✅ Found text containing "Vision Alignment"');
            const text = await visionText.textContent();
            console.log('   Text:', text);
        }
        
        // List all visible SD IDs
        console.log('\n📋 Looking for all SD IDs on the page...');
        const sdTexts = await page.locator('text=/SD-[A-Z0-9-]+/').all();
        
        if (sdTexts.length > 0) {
            console.log(`Found ${sdTexts.length} SD references:`);
            for (let i = 0; i < Math.min(sdTexts.length, 10); i++) {
                const text = await sdTexts[i].textContent();
                console.log(`  - ${text?.substring(0, 100)}`);
            }
        } else {
            console.log('No SD references found on the page');
        }
        
        // Also check for any backlog items
        console.log('\n📦 Checking page content...');
        const pageContent = await page.content();
        if (pageContent.includes('SD-VISION-ALIGN-001')) {
            console.log('✅ SD-VISION-ALIGN-001 exists in page HTML (but may be hidden)');
        } else {
            console.log('❌ SD-VISION-ALIGN-001 not in page HTML at all');
        }
        
        // Check the page structure
        console.log('\n🔍 Page Structure Analysis:');
        const tables = await page.locator('table').count();
        const lists = await page.locator('ul, ol').count();
        const cards = await page.locator('[class*="card"]').count();
        
        console.log(`  Tables: ${tables}`);
        console.log(`  Lists: ${lists}`);
        console.log(`  Cards: ${cards}`);
        
        // Get page title and URL
        const title = await page.title();
        const url = page.url();
        console.log(`\n📍 Current Page:`);
        console.log(`  Title: ${title}`);
        console.log(`  URL: ${url}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

checkStrategicDirectivesPage();