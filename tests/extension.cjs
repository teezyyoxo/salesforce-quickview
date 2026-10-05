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
    let downloads = 0; const previewRequests = [];
    await context.route('https://quickview-fixture.lightning.force.com/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/sfc/') || pathname === '/servlet/servlet.FileDownload') { downloads++; previewRequests.push(route.request().url()); return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'demo/sample.svg')) }); }
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
    const requested = fixture.waitForRequest(request => /(?:versionId=|version\/download\/)068000000000022/.test(request.url()), { timeout: 5000 });
    await fixture.locator('#aura-file').hover();
    await requested;
    assert.equal(await fixture.locator('#aura-file').getAttribute('title'), null);
    await fixture.keyboard.press('Escape');
    assert.equal(await fixture.locator('#aura-file').getAttribute('title'), 'image002.png');
    // The same wrapper is also exposed directly through aura:iteration v.items.
    await fixture.evaluate(() => window.fixtureMetadataPath = 'items');
    await fixture.mouse.move(5, 5);
    const iterationRequest = fixture.waitForRequest(request => /(?:versionId=|version\/download\/)068000000000023/.test(request.url()), { timeout: 5000 });
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
    // Files-tab Office links expose a document ID; Aura supplies the matching latest version.
    await fixture.evaluate(() => {
      const record = { Id: '069000000000041', ...Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`field${i}`, 'private value'])), LatestPublishedVersionId: '068000000000041' };
      const owner = { getDef: () => ({ getAttributeDefs: () => ({ getNames: () => ['records'] }) }), get: key => key === 'v.records' ? [
        { Id: '069000000000040', LatestPublishedVersionId: '068000000000040' }, record
      ] : null };
      window.$A = { getComponent: () => owner };
      document.querySelector('tbody').insertAdjacentHTML('beforeend', '<tr data-file-type="PPT" data-aura-rendered-by="files"><td><a id="office-file" href="/lightning/r/ContentDocument/069000000000041/view">Case presentation</a></td></tr>');
    });
    await fixture.locator('#office-file').scrollIntoViewIfNeeded(); await fixture.waitForTimeout(200);
    for (const title of ['Case presentation', 'slides.ppt', 'slides.pptx', 'summary.doc', 'summary.docx', 'report.xls', 'report.xlsx']) {
      await fixture.locator('#office-file').evaluate((node, title) => node.textContent = title, title);
      await fixture.mouse.move(5, 5);
      await fixture.locator('#office-file').hover();
      await fixture.waitForFunction(() => document.querySelector('#quickview-salesforce')?.style.display === 'block');
      await fixture.waitForTimeout(350);
      await fixture.keyboard.press('Escape');
    }
    const resolvedDiagnostic = JSON.parse(await fixture.evaluate(() => window.quickViewDiagnoseFile()));
    assert.equal(resolvedDiagnostic.lookup.resolved, true);
    assert.ok(resolvedDiagnostic.matchingRecords.some(record => record.fieldNames.includes('LatestPublishedVersionId')));
    assert.ok(!JSON.stringify(resolvedDiagnostic).includes('private value'));
    assert.ok(!JSON.stringify(resolvedDiagnostic).includes('068000000000041'));
    assert.ok(previewRequests.some(url => url.includes('versionId=068000000000041')), 'Files document ID resolves its matching version');
    assert.ok(!previewRequests.some(url => /download\/069000000000041/.test(url)), 'Office originals must not be downloaded as images');
    // Lookup must ignore other documents even when they have valid versions.
    await fixture.locator('#office-file').evaluate(node => { node.href = '/lightning/r/ContentDocument/069000000000049/view'; });
    await fixture.mouse.move(5, 5);
    const beforeUnmatched = downloads;
    await fixture.locator('#office-file').hover(); await fixture.waitForTimeout(400);
    assert.equal(downloads, beforeUnmatched);
    const fileDiagnostic = JSON.parse(await fixture.evaluate(() => window.quickViewDiagnoseFile()));
    assert.equal(fileDiagnostic.lookup.resolved, false);
    assert.ok(!JSON.stringify(fileDiagnostic).includes('069000000000041'));
    await fixture.keyboard.press('Escape');
    // Real UI API response shape, requested for exactly one document/version field.
    // Internal Aura component creation is unavailable in the live org and must not be used.
    await context.route('https://quickview-fixture.lightning.force.com/services/data/v65.0/ui-api/records/**', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.searchParams.get('fields'), 'ContentDocument.LatestPublishedVersionId');
      assert.equal(route.request().method(), 'GET');
      const recordId = url.pathname.split('/').pop();
      const { mode, delay } = await fixture.evaluate(() => ({ mode: window.fixturePreviewMode, delay: window.fixturePreviewDelay || 150 }));
      await new Promise(resolve => setTimeout(resolve, delay));
      if (mode === 'forbidden') return route.fulfill({ status: 403, contentType: 'application/json', body: '[{"errorCode":"INSUFFICIENT_ACCESS"}]' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        id: mode === 'mismatch' ? '069000000000099' : recordId, apiName: 'ContentDocument',
        fields: { LatestPublishedVersionId: { value: mode === 'no-version' ? null : mode === 'bad-version' ? '069000000000061' : recordId.replace('069', '068') } }
      }) });
    });
    await fixture.evaluate(() => {
      window.fixturePreviewMode = 'success';
      window.$A.getDefinition = window.$A.createComponent = () => { throw new Error('Internal provider must not be used'); };
      document.querySelector('tbody').insertAdjacentHTML('beforeend', '<tr data-file-type="PPT"><td><a id="native-office" href="/lightning/r/ContentDocument/069000000000061/view">Native deck.pptx</a></td></tr>');
    });
    await fixture.locator('#native-office').scrollIntoViewIfNeeded(); await fixture.waitForTimeout(200);
    const nativeRequest = fixture.waitForResponse(response => response.url().includes('versionId=068000000000061'), { timeout: 5000 });
    await fixture.locator('#native-office').hover();
    await nativeRequest;
    assert.ok(previewRequests.some(url => url.includes('versionId=068000000000061') && url.includes('rendition=THUMB720BY480')));
    assert.ok(!previewRequests.some(url => url.includes('/download/068000000000061')));
    const nativeDiagnostic = JSON.parse(await fixture.evaluate(() => window.quickViewDiagnoseFile()));
    assert.equal(nativeDiagnostic.lookup.method, 'ui-record-api');
    assert.equal(nativeDiagnostic.lookup.resolved, true);
    assert.equal(nativeDiagnostic.lookup.httpStatus, 200);
    await fixture.keyboard.press('Escape');
    await fixture.evaluate(() => window.fixturePreviewMode = 'mismatch');
    await fixture.mouse.move(5, 5);
    const beforeWrongRecord = downloads;
    await fixture.locator('#native-office').hover(); await fixture.waitForTimeout(600);
    assert.equal(downloads, beforeWrongRecord, 'native metadata for another document must be rejected');
    await fixture.keyboard.press('Escape');
    for (const [mode, state] of [['forbidden', 'record-api-request-failed'], ['no-version', 'record-api-version-unavailable'], ['bad-version', 'record-api-version-unavailable']]) {
      await fixture.evaluate(mode => window.fixturePreviewMode = mode, mode);
      await fixture.mouse.move(5, 5);
      const before = downloads;
      await fixture.locator('#native-office').hover(); await fixture.waitForTimeout(650);
      assert.equal(downloads, before, 'failed metadata must not request another file or original Office binary');
      const result = JSON.parse(await fixture.evaluate(() => window.quickViewDiagnoseFile()));
      assert.equal(result.lookup.state, state);
      if (mode === 'forbidden') assert.equal(result.lookup.httpStatus, 403);
      await fixture.keyboard.press('Escape');
    }
    await fixture.evaluate(() => {
      window.fixturePreviewMode = 'success'; window.fixturePreviewDelay = 900;
      document.querySelector('#native-office').href = '/lightning/r/ContentDocument/069000000000062/view';
      document.querySelector('tbody').insertAdjacentHTML('beforeend', '<tr><td><a id="replacement-image" href="/lightning/r/ContentDocument/069000000000071/view">replacement.png</a></td></tr>');
    });
    await fixture.locator('#replacement-image').scrollIntoViewIfNeeded(); await fixture.waitForTimeout(150);
    await fixture.mouse.move(5, 5);
    await fixture.locator('#native-office').hover(); await fixture.waitForTimeout(350);
    const replacementRequest = fixture.waitForResponse(response => response.url().includes('/download/069000000000071'), { timeout: 5000 });
    await fixture.locator('#replacement-image').hover(); await replacementRequest;
    await fixture.waitForTimeout(1000);
    assert.ok(!previewRequests.some(url => url.includes('versionId=068000000000062')), 'late native metadata must not replace the new image preview');
    await fixture.keyboard.press('Escape');
    // Exercise delay changes through the real options page and extension storage.
    await settings.locator('#delay').fill('1500');
    await settings.locator('#delay').dispatchEvent('change');
    await settings.locator('#dialogDelay').fill('600');
    await settings.locator('#dialogDelay').dispatchEvent('change');
    await settings.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.dialogDelay === 600);
    await fixture.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="modal-container" style="position:fixed;top:10px;left:10px;background:white;z-index:20"><table><tr><td><input id="selection-checkbox" type="checkbox"><span id="selection-padding">Select</span></td><td><a id="delayed-picker" href="/lightning/r/ContentDocument/069000000000071/view">picker.png</a></td></tr></table></div>');
    });
    await fixture.locator('#delayed-picker').hover();
    await fixture.waitForTimeout(300);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none');
    await fixture.waitForFunction(() => document.querySelector('#quickview-salesforce')?.style.display === 'block', null, { timeout: 1200 });
    await fixture.locator('#selection-padding').hover();
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none', 'checkbox cell padding cancels preview');
    await settings.locator('#dialogDelay').fill('1800');
    await settings.locator('#dialogDelay').dispatchEvent('input');
    await settings.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.dialogDelay === 1800);
    await fixture.locator('#delayed-picker').hover();
    await fixture.waitForTimeout(900);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none', 'changed dialog delay applies in an already open tab');
    await fixture.locator('#selection-checkbox').hover();
    await fixture.waitForTimeout(1000);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none', 'checkbox hover cancels pending timer');
    await settings.locator('#dialogPreviews').uncheck();
    await settings.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.dialogPreviews === false);
    await fixture.locator('#delayed-picker').hover();
    await fixture.waitForTimeout(1900);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none');
    await fixture.evaluate(() => document.querySelector('.modal-container').remove());
    await fixture.locator('tbody a').first().scrollIntoViewIfNeeded();
    await fixture.waitForTimeout(200);
    await fixture.mouse.move(5, 5);
    await fixture.locator('tbody a').first().hover();
    await fixture.waitForTimeout(800);
    assert.equal(await fixture.locator('#quickview-salesforce').evaluate(node => node.style.display), 'none', 'general delay applies outside dialogs');
    await fixture.waitForFunction(() => document.querySelector('#quickview-salesforce')?.style.display === 'block');
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
