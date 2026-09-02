import { chromium } from 'playwright';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://altifyai.rickfelix2000.workers.dev/register');
  const toggle = page.locator('text=Already have an account? Sign in');
  const visible = await toggle.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  console.log('toggle visible on /register:', visible);
  if (visible) await toggle.click();
  await page.waitForTimeout(1500);
  const inputs = await page.locator('input').evaluateAll(els => els.map(el => ({
    tag: el.tagName, name: el.getAttribute('name'), type: el.getAttribute('type'),
    id: el.id, placeholder: el.getAttribute('placeholder'), autocomplete: el.getAttribute('autocomplete'),
  })));
  console.log('inputs on final page:', JSON.stringify(inputs, null, 2));
  console.log('final url:', page.url());
  await browser.close();
}

if (isMainModule(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
