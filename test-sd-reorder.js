import { chromium } from 'playwright';

async function testSDReordering() {
  console.log('🧪 Starting Strategic Directive Reordering Test...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the Strategic Directives page
    console.log('📍 Navigating to Strategic Directives page...');
    await page.goto('http://localhost:3000/strategic-directives');
    await page.waitForLoadState('networkidle');

    // Wait for any element to load - give page time to render
    await page.waitForTimeout(3000);

    // Get initial order of SDs
    console.log('\n📊 Getting initial SD order...');
    const initialOrder = await page.evaluate(() => {
      // Look for SD cards specifically (with h3 title and buttons)
      const cards = Array.from(document.querySelectorAll('.bg-white.dark\\:bg-gray-800'))
        .filter(card => card.querySelector('h3') && card.querySelector('button'));

      return cards.slice(0, 5).map(card => {
        const titleEl = card.querySelector('h3');
        const idEl = card.querySelector('.text-xs.text-gray-500');
        return {
          title: titleEl ? titleEl.textContent.trim() : 'Unknown',
          id: idEl ? idEl.textContent.trim() : 'Unknown'
        };
      });
    });

    console.log('Initial order (top 5):');
    initialOrder.forEach((sd, idx) => {
      console.log(`  ${idx + 1}. ${sd.title} (${sd.id})`);
    });

    // Find the down arrow button of the first SD
    console.log('\n🎯 Testing DOWN arrow on first SD...');
    // Find first SD card that has both h3 and buttons
    const firstSDCard = await page.locator('.bg-white.dark\\:bg-gray-800:has(h3):has(button)').first();
    const downButton = await firstSDCard.locator('button:has(svg[class*="lucide-chevron-down"])').first();

    // Click the down arrow
    console.log('  Clicking down arrow...');
    await downButton.click();

    // Wait for potential reorder
    await page.waitForTimeout(1000);

    // Get order after first click
    const afterFirstClick = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.bg-white.dark\\:bg-gray-800'))
        .filter(card => card.querySelector('h3') && card.querySelector('button'));
      return cards.slice(0, 5).map(card => {
        const titleEl = card.querySelector('h3');
        const idEl = card.querySelector('.text-xs.text-gray-500');
        return {
          title: titleEl ? titleEl.textContent.trim() : 'Unknown',
          id: idEl ? idEl.textContent.trim() : 'Unknown'
        };
      });
    });

    console.log('\nOrder after clicking DOWN on first item:');
    afterFirstClick.forEach((sd, idx) => {
      console.log(`  ${idx + 1}. ${sd.title} (${sd.id})`);
    });

    // Check if order changed
    const orderChanged = initialOrder[0].id !== afterFirstClick[0].id ||
                        initialOrder[1].id !== afterFirstClick[1].id;

    if (orderChanged) {
      console.log('✅ Order changed successfully!');
    } else {
      console.log('❌ Order did not change');
    }

    // Now test the UP arrow on what's now the second item
    console.log('\n🎯 Testing UP arrow on second SD...');
    const secondSDCard = await page.locator('.bg-white.dark\\:bg-gray-800:has(h3):has(button)').nth(1);
    const upButton = await secondSDCard.locator('button:has(svg[class*="lucide-chevron-up"])').first();

    console.log('  Clicking up arrow...');
    await upButton.click();

    // Wait for potential reorder
    await page.waitForTimeout(1000);

    // Get final order
    const finalOrder = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.bg-white.dark\\:bg-gray-800'))
        .filter(card => card.querySelector('h3') && card.querySelector('button'));
      return cards.slice(0, 5).map(card => {
        const titleEl = card.querySelector('h3');
        const idEl = card.querySelector('.text-xs.text-gray-500');
        return {
          title: titleEl ? titleEl.textContent.trim() : 'Unknown',
          id: idEl ? idEl.textContent.trim() : 'Unknown'
        };
      });
    });

    console.log('\nFinal order after clicking UP on second item:');
    finalOrder.forEach((sd, idx) => {
      console.log(`  ${idx + 1}. ${sd.title} (${sd.id})`);
    });

    // Test page refresh to verify persistence
    console.log('\n🔄 Refreshing page to test persistence...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="sd-card"], .p-6.bg-white', { timeout: 10000 });

    const afterRefresh = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.bg-white.dark\\:bg-gray-800'))
        .filter(card => card.querySelector('h3') && card.querySelector('button'));
      return cards.slice(0, 5).map(card => {
        const titleEl = card.querySelector('h3');
        const idEl = card.querySelector('.text-xs.text-gray-500');
        return {
          title: titleEl ? titleEl.textContent.trim() : 'Unknown',
          id: idEl ? idEl.textContent.trim() : 'Unknown'
        };
      });
    });

    console.log('\nOrder after page refresh:');
    afterRefresh.forEach((sd, idx) => {
      console.log(`  ${idx + 1}. ${sd.title} (${sd.id})`);
    });

    // Check persistence
    const orderPersisted = finalOrder.every((sd, idx) => sd.id === afterRefresh[idx].id);

    if (orderPersisted) {
      console.log('✅ Order persisted after refresh!');
    } else {
      console.log('❌ Order did not persist after refresh');
    }

    // Check console for errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    if (consoleErrors.length > 0) {
      console.log('\n⚠️ Console errors detected:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test
testSDReordering().catch(console.error);