// Render README examples from the real production hover code and fictional fixture data.
const { chromium } = require('playwright');
const { createServer } = require('./serve.cjs');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addStyleTag({ content: '.demo-help,.inline-fixture{display:none} .email-attachments>.emailuiAttachment:nth-child(n+4){display:none} .email-message{min-height:360px}' });
    await page.locator('.notice').evaluate(node => node.textContent = 'Mock Salesforce case · Fictional data only · QuickView hover preview');
    const output = path.resolve(__dirname, '../docs/images');
    fs.mkdirSync(output, { recursive: true });
    await page.locator('tbody a').first().hover();
    await page.locator('#quickview-salesforce img').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'quickview-files.png') });
    await page.keyboard.press('Escape');
    await page.addStyleTag({ content: 'main>section:not(.feed-demo){display:none} .email-message{min-height:650px}' });
    await page.locator('nav .selected').evaluate(node => node.textContent = 'Feed → Email');
    await page.locator('.email-attachments a').first().hover();
    await page.locator('#quickview-salesforce img').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'quickview-email-attachments.png') });
    console.log('README screenshots saved in docs/images/ (fictional fixture data only).');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
