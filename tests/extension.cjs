// Load the real unpacked extension against locally fulfilled HTTPS fixture routes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..');
  const extension = path.join(root, 'extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quickview-extension-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const settings = await context.newPage();
    const errors = [];
    settings.on('pageerror', error => errors.push(error.message));
    await settings.goto(`chrome-extension://${id}/settings.html`);
    await settings.locator('#theme').selectOption('dark');
    await settings.waitForFunction(() => document.querySelector('#save-status').textContent === 'Settings saved locally');
    const stored = await settings.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    assert.equal(stored.theme, 'dark');
    await settings.reload();
    await settings.waitForFunction(() => document.querySelector('#theme').value === 'dark');
    assert.equal(await settings.locator('.sample-image img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    const fixture = await context.newPage();
    fixture.on('pageerror', error => errors.push(error.message));
    let downloads = 0;
    await context.route('https://quickview-fixture.lightning.force.com/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/sfc/') || pathname === '/servlet/servlet.FileDownload') { downloads++; return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'demo/sample.svg')) }); }
      const html = fs.readFileSync(path.join(root, 'demo/index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await fixture.goto('https://quickview-fixture.lightning.force.com/');
    await fixture.locator('tbody a').first().hover();
    await fixture.waitForFunction(() => document.querySelector('#quickview-salesforce')?.style.display === 'block');
    await fixture.waitForTimeout(300);
    assert.ok(downloads > 0, 'manifest content script made an image request');
    assert.equal(await fixture.locator('tbody a').first().getAttribute('title'), null);
    await fixture.keyboard.press('Escape');
    assert.equal(await fixture.locator('tbody a').first().getAttribute('title'), 'troubleshooting-screenshot.png');
    await fixture.locator('.email-attachments a').first().hover();
    await fixture.waitForFunction(() => document.querySelector('#quickview-salesforce')?.style.display === 'block');
    await fixture.waitForTimeout(300);
    assert.equal(await fixture.locator('.email-attachments a').first().getAttribute('title'), null);
    await fixture.keyboard.press('Escape');
    assert.equal(await fixture.locator('.email-attachments a').first().getAttribute('title'), 'image001.png');
    // Reproduce the reported Aura markup: no href/file ID, only a per-email index.
    await fixture.evaluate(() => {
      const attachments = [
        { fileName: 'image001.png', contentType: 'image/png', attachment: { id: '068000000000021', name: 'image001', type: 'ContentVersion' } },
        { fileName: 'image002.png', contentType: 'image/png', attachment: { id: '068000000000022', name: 'image002', type: 'ContentVersion' } }
      ];
      window.fixtureMetadataPath = 'data';
      const owner = {
        getType: () => 'forceChatter:feedAuxBodyEmailMessage',
        getDef: () => ({ getAttributeDefs: () => ({ getNames: () => ['data', 'items'] }) }),
        get: key => key === `v.${window.fixtureMetadataPath}` ? (window.fixtureMetadataPath === 'items' ? attachments.map(entry => ({ ...entry, attachment: { ...entry.attachment, id: entry.attachment.id.replace('022', '023') } })) : { capabilities: { emailMessage: { attachments } } }) : null
      };
      window.$A = { getComponent: () => ({ get: () => null, getAttributeValueProvider() { return this; }, getOwner: () => owner }) };
      document.body.insertAdjacentHTML('beforeend', '<div class="forceChatterFeedAuxBodyEmailMessage" data-aura-rendered-by="owner"><div class="emailMessage__attachment"><a id="aura-file" data-index="1" title="image002.png" data-aura-rendered-by="tile" href="javascript:void(0);"><div class="slds-media"><lightning-icon class="emailMessage__attachment-icon"></lightning-icon><span class="slds-truncate">image002.png</span></div></a></div></div>');
    });
    await fixture.locator('#aura-file').scrollIntoViewIfNeeded();
    await fixture.waitForTimeout(200);
    const requested = fixture.waitForRequest(request => request.url().includes('versionId=068000000000022'), { timeout: 5000 });
    await fixture.locator('#aura-file').hover();
    await requested;
    assert.equal(await fixture.locator('#aura-file').getAttribute('title'), null);
    await fixture.keyboard.press('Escape');
    assert.equal(await fixture.locator('#aura-file').getAttribute('title'), 'image002.png');
    // The same wrapper is also exposed directly through aura:iteration v.items.
    await fixture.evaluate(() => window.fixtureMetadataPath = 'items');
    await fixture.mouse.move(5, 5);
    const iterationRequest = fixture.waitForRequest(request => request.url().includes('versionId=068000000000023'), { timeout: 5000 });
    await fixture.locator('#aura-file').hover();
    await iterationRequest;
    await fixture.waitForFunction(() => JSON.parse(window.quickViewDiagnoseAttachment()).load?.stage === 'loaded');
    await fixture.keyboard.press('Escape');
    await fixture.evaluate(() => document.querySelector('#aura-file').dataset.index = '0');
    await fixture.mouse.move(5, 5);
    const beforeMismatch = downloads;
    await fixture.locator('#aura-file').hover();
    await fixture.waitForTimeout(600);
    assert.equal(downloads, beforeMismatch, 'mismatched filename must never load a sibling attachment');
    const diagnostic = JSON.parse(await fixture.evaluate(() => window.quickViewDiagnoseAttachment()));
    assert.equal(diagnostic.lookup.resolved, false);
    assert.equal(diagnostic.load.stage, 'no-file-reference');
    assert.ok(diagnostic.fields.some(field => field.attributeNames.includes('items')));
    assert.ok(!JSON.stringify(diagnostic).includes('068000000000021'));
    assert.ok(!JSON.stringify(diagnostic).includes('image001.png'));
    await fixture.keyboard.press('Escape');
    await settings.locator('#enabled').uncheck();
    await settings.waitForFunction(() => document.querySelector('#save-status').textContent === 'Settings saved locally');
    await fixture.locator('tbody a').nth(1).hover();
    await fixture.waitForTimeout(400);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none');
    assert.deepEqual(errors, []);
    console.log('Unpacked extension checks passed: service worker, options CSP/assets, real storage, manifest injection, authenticated-host fixture, live setting updates. No live org was contacted.');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
