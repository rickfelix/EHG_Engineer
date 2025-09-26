const { test } = require('@playwright/test');
const { injectAxe, checkA11y } = require('@axe-core/playwright');
const routes = require('../config/a11y.routes.json');

routes.routes.forEach(route => {
  test(`a11y check: ${route}`, async ({ page }) => {
    await page.goto(`${routes.baseUrl}${route}`);
    await injectAxe(page);
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true }
    });
  });
});