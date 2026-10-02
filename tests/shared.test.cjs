const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/shared.js');
const Q = globalThis.QuickView;
const base = 'https://example.lightning.force.com/lightning/r/Case/500000000000001/view';
test('settings clamp malformed input and reject injected CSS', () => {
  const value = Q.normalize({ scale: 99999, delay: 'oops', borderColor: 'red;display:none', theme: 'bad', shadow: 'false' });
  assert.equal(value.scale, 500); assert.equal(value.delay, 250);
  assert.equal(value.borderColor, Q.defaults.borderColor); assert.equal(value.theme, 'system'); assert.equal(value.shadow, true);
});
test('recognizes 15/18 character file IDs but ignores ordinary Salesforce records', () => {
  assert.equal(Q.fileId('/lightning/r/ContentDocument/069000000000001/view'), '069000000000001');
  assert.equal(Q.fileId('068000000000001AAA'), '068000000000001AAA');
  assert.equal(Q.fileId('069000000000001AAAA'), null);
  assert.equal(Q.fileId('/lightning/r/Case/500000000000001/view'), null);
});
test('images may load originals; unknown documents never download', () => {
  assert.deepEqual(Q.sources({ id: '069000000000001', image: false }, base), []);
  assert.match(Q.sources({ id: '069000000000001', image: true }, base)[0], /document\/download\/069/);
  const source = Q.sources({ id: '069000000000001', versionId: '068000000000001', image: false }, base);
  assert.equal(source.length, 1); assert.match(source[0], /versionId=068/); assert.match(source[0], /THUMB720BY480/);
});
test('existing URLs reject external hosts, credentials, scripts and non-Salesforce paths', () => {
  for (const url of ['https://attacker.test/sfc/servlet.shepherd/version/renditionDownload', 'javascript:alert(1)', 'https://user:password@example.lightning.force.com/sfc/servlet.shepherd/version/renditionDownload', '/unrelated']) assert.equal(Q.safeURL(url, base), null);
  assert.ok(Q.safeURL('/sfc/servlet.shepherd/version/renditionDownload?versionId=068000000000001', base));
});
test('extension declares only local settings permission, all bundled paths exist', () => {
  const fs = require('node:fs'), path = require('node:path');
  const manifest = require('../extension/manifest.json');
  assert.equal(manifest.version, '0.0.1'); assert.deepEqual(manifest.permissions, ['storage']);
  for (const file of [...manifest.content_scripts.flatMap(script => script.js), manifest.background.service_worker, manifest.options_ui.page, ...Object.values(manifest.icons)]) assert.ok(fs.existsSync(path.join(__dirname, '../extension', file)), file);
});

test('animations default to none for existing settings and reject unknown effects', () => {
  assert.equal(Q.normalize({}).animation, 'none');
  assert.equal(Q.normalize({ animation: 'unknown' }).animation, 'none');
  for (const animation of ['none', 'fade', 'fall', 'scale-up', 'scale-down']) assert.equal(Q.normalize({ animation }).animation, animation);
});

test('email attachment IDs work in legacy and encoded file-preview URLs', () => {
  assert.equal(Q.fileId('/servlet/servlet.FileDownload?file=00P000000000013'), '00P000000000013');
  assert.equal(Q.fileId('/lightning/page/filePreview?selectedRecordId%3D069000000000011'), '069000000000011');
  assert.equal(Q.fileId('00P000000000013AAAA'), null);
  assert.deepEqual(Q.sources({ id: '00P000000000013', image: false }, base), []);
  assert.match(Q.sources({ id: '00P000000000013', image: true }, base)[0], /servlet\.FileDownload\?file=00P000000000013$/);
});

test('percentage size migrates old preferences and prefers original images when enlarged', () => {
  assert.equal(Q.normalize({}).scale, 100);
  assert.equal(Q.normalize({ width: 1000, height: 800 }).scale, 210);
  assert.equal(Q.normalize({ scale: 5 }).scale, 50);
  assert.equal(Q.normalize({ scale: 'invalid' }).scale, 100);
  const urls = Q.sources({ id: '069000000000001', versionId: '068000000000001', image: true, scale: 500 }, base);
  assert.match(urls[0], /document\/download/);
  assert.match(urls[1], /renditionDownload/);
});

test('preview sizing uses original viewport coordinates and fits large cards', () => {
  const settings = Q.normalize({ scale: 225 });
  assert.deepEqual(Q.previewSize(settings, 2560, 1258), { width: 1170, height: 855 });
  // A 640px screenshot represents one quarter of the original desktop viewport.
  assert.equal(Q.previewSize(settings, 2560, 1258).width * 640 / 2560, 292.5);
  const largest = Q.previewSize(Q.normalize({ scale: 500 }), 1440, 1050);
  assert.equal(largest.width, 1416);
  assert.equal(largest.height + 40.5 + 2, 1026);
});
