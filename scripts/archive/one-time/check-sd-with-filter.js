#!/usr/bin/env node

import { chromium } from 'playwright';

async function checkSDWithFilter() {
    console.log('🔍 Checking Strategic Directives page with filter changes...');
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Navigate to strategic directives page directly
        console.log('\nNavigating to http://localhost:3000/strategic-directives...');
        await page.goto('http://localhost:3000/strategic-directives', { waitUntil: 'networkidle' });
        
        // Wait for the page to load
        await page.waitForTimeout(2000);
        
        // Look for the filter dropdown and click it
        console.log('\nLooking for filter dropdown...');
        const filterButton = await page.locator('button:has-text("Active Only")').first();
        
        if (await filterButton.isVisible()) {
            console.log('✅ Found filter dropdown, clicking it...');
            await filterButton.click();
            await page.waitForTimeout(500);
            
            // Try to select "All" option
            const allOption = await page.locator('text="All"').first();
            if (await allOption.isVisible()) {
                console.log('✅ Found "All" option, clicking it...');
                await allOption.click();
                await page.waitForTimeout(1000);
            }
        }
        
        // Now search for SD-VISION-ALIGN-001
        console.log('\nSearching for SD-VISION-ALIGN-001...');
        const visionSD = await page.locator('text="SD-VISION-ALIGN-001"').first();
        
        if (await visionSD.isVisible()) {
            console.log('✅ FOUND: SD-VISION-ALIGN-001 is visible on the page!');
            const boundingBox = await visionSD.boundingBox();
            console.log('   Position:', boundingBox);
        } else {
            console.log('❌ NOT FOUND: SD-VISION-ALIGN-001 is not visible');
        }
        
        // Also check for the title
        const visionTitle = await page.locator('text="Scenario-Driven Vision Alignment System"').first();
        if (await visionTitle.isVisible()) {
            console.log('✅ Found the SD title: "Scenario-Driven Vision Alignment System"');
        }
        
        // Take screenshot
        await page.screenshot({ path: 'sd-page-with-all-filter.png', fullPage: true });
        console.log('📸 Screenshot saved: sd-page-with-all-filter.png');
        
        // Count total SDs visible
        const sdTexts = await page.locator('text=/SD-[A-Z0-9-]+/').all();
        console.log(`\n📊 Total SDs visible: ${sdTexts.length}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

checkSDWithFilter();